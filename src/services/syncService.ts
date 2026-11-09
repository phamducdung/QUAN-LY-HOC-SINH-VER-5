import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  getDocs,
  onSnapshot,
  Unsubscribe,
  writeBatch,
} from 'firebase/firestore';
import {
  db as firestoreDb,
  handleFirestoreError,
  getIsQuotaExceeded,
  subscribeQuotaStatus,
  tryReconnectFirestore,
} from '../firebase';
import { db as dexieDb, setRemoteSyncing } from '../db/dexie';

export interface SyncStatus {
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncedAt: Date | null;
  syncErrors: number;
  quotaExceeded?: boolean;
  pendingOutboxCount: number;
  lastKaizenSummary?: string | null;
}

export interface TombstoneRecord {
  id: string; // `${tableName}_${recordId}`
  table_name: string;
  record_id: string;
  deleted_at: string;
}

export interface OutboxEntry {
  key: string; // `${tableName}/${docId}`
  tableName: TableName;
  docId: string;
  data?: any;
  isDelete: boolean;
  queuedAt: string;
}

export interface KaizenReport {
  mergedRecords: number;
  deletedDuplicates: number;
  remappedForeignKeys: number;
  tablesCleaned: string[];
}

export const ALL_TABLES = [
  'school_years',
  'classes',
  'students',
  'class_students',
  'sessions',
  'student_sessions',
  'knowledge_tags',
  'knowledge_results',
  'warnings',
  'ai_diagnoses',
  'audit_logs',
  'settings',
] as const;

export type TableName = (typeof ALL_TABLES)[number];

const TOMBSTONE_COLLECTION = 'deleted_records';
const LOCAL_TOMBSTONE_KEY = 'smart_edu_tombstones_v2';
const LOCAL_OUTBOX_KEY = 'smart_edu_sync_outbox_v2';
const LOCAL_SIGNATURES_KEY = 'smart_edu_synced_signatures_v2';

let unsubscribers: Unsubscribe[] = [];
let statusListeners: Array<(status: SyncStatus) => void> = [];

// Memory + persisted caches for Tombstones, Outbox, and Content Signatures
const tombstoneMap = new Map<string, TombstoneRecord>();
const outboxMap = new Map<string, OutboxEntry>();
const syncedSignatures = new Map<string, string>();

function loadPersistedSyncState() {
  if (typeof window === 'undefined') return;
  try {
    const rawTombstones = localStorage.getItem(LOCAL_TOMBSTONE_KEY);
    if (rawTombstones) {
      const parsed: TombstoneRecord[] = JSON.parse(rawTombstones);
      parsed.forEach((t) => {
        if (t?.id) tombstoneMap.set(t.id, t);
      });
    }
  } catch (e) {}

  try {
    const rawOutbox = localStorage.getItem(LOCAL_OUTBOX_KEY);
    if (rawOutbox) {
      const parsed: OutboxEntry[] = JSON.parse(rawOutbox);
      parsed.forEach((item) => {
        if (item?.key) outboxMap.set(item.key, item);
      });
    }
  } catch (e) {}

  try {
    const rawSigs = sessionStorage.getItem(LOCAL_SIGNATURES_KEY);
    if (rawSigs) {
      const parsed: Record<string, string> = JSON.parse(rawSigs);
      Object.entries(parsed).forEach(([k, v]) => syncedSignatures.set(k, v));
    }
  } catch (e) {}
}

loadPersistedSyncState();

function persistTombstones() {
  if (typeof window === 'undefined') return;
  try {
    // Keep up to 2000 recent tombstones
    const list = Array.from(tombstoneMap.values())
      .sort((a, b) => b.deleted_at.localeCompare(a.deleted_at))
      .slice(0, 2000);
    localStorage.setItem(LOCAL_TOMBSTONE_KEY, JSON.stringify(list));
  } catch (e) {}
}

function persistOutbox() {
  if (typeof window === 'undefined') return;
  try {
    const list = Array.from(outboxMap.values());
    localStorage.setItem(LOCAL_OUTBOX_KEY, JSON.stringify(list));
  } catch (e) {}
}

function persistSignatures() {
  if (typeof window === 'undefined') return;
  try {
    const obj: Record<string, string> = {};
    syncedSignatures.forEach((v, k) => {
      obj[k] = v;
    });
    sessionStorage.setItem(LOCAL_SIGNATURES_KEY, JSON.stringify(obj));
  } catch (e) {}
}

/**
 * Deterministic ID generator to prevent duplicate rows across devices
 */
export function getCanonicalDocId(tableName: string, data: any, fallbackId?: string | number): string {
  if (!data && fallbackId !== undefined) return String(fallbackId);

  if (tableName === 'settings') {
    return 'system_settings';
  }
  if (tableName === 'school_years' && data?.name) {
    const slug = String(data.name)
      .trim()
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
    if (slug) return `sy_${slug}`;
  }
  if (tableName === 'class_students' && data?.class_id && data?.student_id) {
    return `cs_${String(data.class_id)}_${String(data.student_id)}`;
  }
  if (tableName === 'student_sessions' && data?.session_id && data?.student_id) {
    return `ss_${String(data.session_id)}_${String(data.student_id)}`;
  }
  if (tableName === 'knowledge_results' && data?.student_id && data?.knowledge_tag_id) {
    return `kr_${String(data.student_id)}_${String(data.knowledge_tag_id)}`;
  }

  if (data?.id !== undefined && data?.id !== null && String(data.id).trim() !== '') {
    return String(data.id);
  }
  if (fallbackId !== undefined && fallbackId !== null && String(fallbackId).trim() !== '') {
    return String(fallbackId);
  }
  return crypto.randomUUID();
}

/**
 * Computes a deterministic content fingerprint ignoring volatile timestamp fields
 * so unchanged records never burn Firestore write quota.
 */
export function computePayloadSignature(data: any): string {
  if (!data || typeof data !== 'object') return '';
  const sortedKeys = Object.keys(data)
    .filter((k) => k !== 'updated_at' && k !== 'last_updated' && data[k] !== undefined)
    .sort();
  const normalized: Record<string, any> = {};
  for (const k of sortedKeys) {
    normalized[k] = data[k];
  }
  return JSON.stringify(normalized);
}

let currentSyncStatus: SyncStatus = {
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  isSyncing: false,
  lastSyncedAt: null,
  syncErrors: 0,
  quotaExceeded: getIsQuotaExceeded(),
  pendingOutboxCount: outboxMap.size,
  lastKaizenSummary: null,
};

subscribeQuotaStatus((exceeded) => {
  updateSyncStatus({
    quotaExceeded: exceeded,
    isSyncing: false,
    pendingOutboxCount: outboxMap.size,
  });
  if (exceeded) {
    stopRealtimeSync();
  }
});

function updateSyncStatus(patch: Partial<SyncStatus>) {
  currentSyncStatus = {
    ...currentSyncStatus,
    ...patch,
    pendingOutboxCount: outboxMap.size,
  };
  statusListeners.forEach((fn) => fn(currentSyncStatus));
}

export function subscribeSyncStatus(listener: (status: SyncStatus) => void) {
  statusListeners.push(listener);
  listener(currentSyncStatus);
  return () => {
    statusListeners = statusListeners.filter((fn) => fn !== listener);
  };
}

export function getSyncStatus() {
  return currentSyncStatus;
}

// Broadcast channel for instant multi-tab notification without waiting for network
let broadcastChannel: BroadcastChannel | null = null;
if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
  try {
    broadcastChannel = new BroadcastChannel('smart_edu_multitab_sync');
    broadcastChannel.onmessage = (event) => {
      if (event.data?.type === 'DATA_MUTATION') {
        updateSyncStatus({ lastSyncedAt: new Date() });
      }
    };
  } catch (e) {
    console.warn('[Sync] BroadcastChannel not supported or error:', e);
  }
}

export function broadcastLocalMutation(
  tableName: string,
  action: 'put' | 'delete',
  id: string | number
) {
  if (broadcastChannel) {
    try {
      broadcastChannel.postMessage({
        type: 'DATA_MUTATION',
        tableName,
        action,
        id,
        timestamp: Date.now(),
      });
    } catch (e) {
      // Ignore broadcast errors
    }
  }
}

export function isRecordTombstoned(
  tableName: string,
  docId: string | number,
  recordUpdatedAt?: string
): boolean {
  const key = `${tableName}_${String(docId)}`;
  const tomb = tombstoneMap.get(key);
  if (!tomb) return false;
  if (!recordUpdatedAt) return true;
  const tombTime = new Date(tomb.deleted_at).getTime();
  const recTime = new Date(recordUpdatedAt).getTime();
  return tombTime >= recTime;
}

export function recordLocalTombstone(
  tableName: string,
  docId: string | number,
  deletedAt = new Date().toISOString()
): TombstoneRecord {
  const recIdStr = String(docId);
  const id = `${tableName}_${recIdStr}`;
  const tomb: TombstoneRecord = {
    id,
    table_name: tableName,
    record_id: recIdStr,
    deleted_at: deletedAt,
  };
  tombstoneMap.set(id, tomb);
  syncedSignatures.delete(`${tableName}/${recIdStr}`);
  persistTombstones();
  return tomb;
}

// Debounced Outbox Flush Timer (coalesces rapid changes within 600ms into 1 Firestore batch)
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let isFlushingOutbox = false;

export function enqueueSyncOperation(
  tableName: TableName,
  rawDocId: string | number,
  data?: any,
  isDelete = false,
  forceWrite = false
) {
  // Never sync demo records to Firestore to protect daily Spark write quota
  if (!isDelete && data?.is_demo === true) {
    return;
  }

  const docId = isDelete
    ? String(rawDocId)
    : getCanonicalDocId(tableName, data, rawDocId);
  const key = `${tableName}/${docId}`;
  const now = new Date().toISOString();

  if (isDelete) {
    recordLocalTombstone(tableName, docId, now);
    outboxMap.set(key, {
      key,
      tableName,
      docId,
      isDelete: true,
      queuedAt: now,
    });
  } else if (data) {
    const cleanData = {
      ...data,
      id: docId,
      updated_at: data.updated_at || data.last_updated || now,
    };
    Object.keys(cleanData).forEach((k) => {
      if (cleanData[k] === undefined) delete cleanData[k];
    });

    if (forceWrite) {
      syncedSignatures.delete(key);
    }

    // Dirty-diff check: skip if signature is identical to already-synced state
    const sig = computePayloadSignature(cleanData);
    if (!forceWrite && syncedSignatures.get(key) === sig && !outboxMap.has(key)) {
      return;
    }

    // Clear any older tombstone if re-created/updated intentionally
    tombstoneMap.delete(`${tableName}_${docId}`);
    persistTombstones();

    outboxMap.set(key, {
      key,
      tableName,
      docId,
      data: cleanData,
      isDelete: false,
      queuedAt: now,
    });
  }

  persistOutbox();
  updateSyncStatus({ pendingOutboxCount: outboxMap.size });

  if (getIsQuotaExceeded() || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    return;
  }

  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushSyncOutbox().catch(() => {});
  }, 600);
}

export async function flushSyncOutbox(): Promise<void> {
  if (isFlushingOutbox || outboxMap.size === 0) return;
  if (getIsQuotaExceeded() || !firestoreDb) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;

  isFlushingOutbox = true;
  updateSyncStatus({ isSyncing: true });

  try {
    const entries = Array.from(outboxMap.values());
    const BATCH_LIMIT = 200; // Each delete writes 1 delete + 1 tombstone = max 400 ops

    for (let i = 0; i < entries.length; i += BATCH_LIMIT) {
      if (getIsQuotaExceeded()) break;
      const chunk = entries.slice(i, i + BATCH_LIMIT);
      const batch = writeBatch(firestoreDb);
      let opsCount = 0;
      const committedKeys: Array<{ key: string; sig?: string }> = [];

      for (const entry of chunk) {
        const docRef = doc(firestoreDb, entry.tableName, entry.docId);
        if (entry.isDelete) {
          batch.delete(docRef);
          const tomb = recordLocalTombstone(entry.tableName, entry.docId, entry.queuedAt);
          const tombRef = doc(firestoreDb, TOMBSTONE_COLLECTION, tomb.id);
          batch.set(tombRef, tomb, { merge: true });
          opsCount += 2;
          committedKeys.push({ key: entry.key });
        } else if (entry.data) {
          if (entry.data.is_demo === true) {
            outboxMap.delete(entry.key);
            continue;
          }
          const sig = computePayloadSignature(entry.data);
          if (syncedSignatures.get(entry.key) === sig) {
            outboxMap.delete(entry.key);
            continue;
          }
          batch.set(docRef, entry.data, { merge: true });
          opsCount += 1;
          committedKeys.push({ key: entry.key, sig });
        }
      }

      if (opsCount > 0) {
        await batch.commit();
        for (const item of committedKeys) {
          outboxMap.delete(item.key);
          if (item.sig) {
            syncedSignatures.set(item.key, item.sig);
          } else {
            syncedSignatures.delete(item.key);
          }
        }
        persistOutbox();
        persistSignatures();
      }
    }

    updateSyncStatus({
      lastSyncedAt: new Date(),
      isSyncing: false,
      pendingOutboxCount: outboxMap.size,
    });
  } catch (err: any) {
    handleFirestoreError(err, 'flushSyncOutbox');
    updateSyncStatus({
      syncErrors: currentSyncStatus.syncErrors + 1,
      isSyncing: false,
      pendingOutboxCount: outboxMap.size,
    });
  } finally {
    isFlushingOutbox = false;
  }
}

// Push a batch of record changes via the smart Dirty-Diff & Outbox batcher
export async function pushDocsBatchToFirestore(tableName: TableName, items: any[]) {
  if (!items || items.length === 0) return;
  for (const item of items) {
    if (!item || item.is_demo === true) continue;
    const docId = getCanonicalDocId(tableName, item, item.id);
    enqueueSyncOperation(tableName, docId, { ...item, id: docId }, false);
  }
  if (!getIsQuotaExceeded()) {
    await flushSyncOutbox();
  }
}

// Push a single record change via the smart Outbox batcher
export async function pushDocToFirestore(
  tableName: TableName,
  docId: string,
  data?: any,
  isDelete = false
) {
  enqueueSyncOperation(tableName, docId, data, isDelete);
}

// Pull tombstones from Firestore so deletions sync across all devices
export async function pullTombstonesFromFirestore() {
  if (getIsQuotaExceeded() || !firestoreDb) return;
  try {
    const colRef = collection(firestoreDb, TOMBSTONE_COLLECTION);
    const snap = await getDocs(colRef);
    if (snap.empty) return;

    const deletionsByTable = new Map<string, string[]>();
    snap.docs.forEach((docSnap) => {
      const data = docSnap.data() as TombstoneRecord;
      if (data?.table_name && data?.record_id) {
        const key = `${data.table_name}_${data.record_id}`;
        tombstoneMap.set(key, {
          id: key,
          table_name: data.table_name,
          record_id: String(data.record_id),
          deleted_at: data.deleted_at || new Date().toISOString(),
        });
        if (!deletionsByTable.has(data.table_name)) {
          deletionsByTable.set(data.table_name, []);
        }
        deletionsByTable.get(data.table_name)!.push(String(data.record_id));
      }
    });
    persistTombstones();

    // Apply tombstones to local IndexedDB
    setRemoteSyncing(true);
    try {
      for (const [tName, ids] of deletionsByTable.entries()) {
        const dexieTable = (dexieDb as any)[tName];
        if (!dexieTable || ids.length === 0) continue;
        const existingRecords = await dexieTable.bulkGet(ids);
        const confirmedDeleteIds: (string | number)[] = [];
        existingRecords.forEach((rec: any, idx: number) => {
          const targetId = ids[idx];
          if (rec && isRecordTombstoned(tName, targetId, rec.updated_at)) {
            confirmedDeleteIds.push(targetId);
            const numId = Number(targetId);
            if (!isNaN(numId)) confirmedDeleteIds.push(numId);
          }
        });
        if (confirmedDeleteIds.length > 0) {
          await dexieTable.bulkDelete(confirmedDeleteIds);
        }
      }
    } finally {
      setRemoteSyncing(false);
    }
  } catch (err) {
    handleFirestoreError(err, 'pullTombstonesFromFirestore');
  }
}

// Real-time listener setup for all Firestore collections -> Dexie
export function initRealtimeSync(): () => void {
  stopRealtimeSync();

  if (getIsQuotaExceeded()) {
    updateSyncStatus({ isSyncing: false, quotaExceeded: true });
    return () => {};
  }

  if (!firestoreDb) {
    return () => {};
  }

  const handleOnline = () => {
    updateSyncStatus({ isOnline: true });
    flushSyncOutbox().catch(() => {});
  };
  const handleOffline = () => updateSyncStatus({ isOnline: false });

  if (typeof window !== 'undefined') {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
  }

  updateSyncStatus({ isSyncing: true });

  // Kick off initial background pull & deduplication
  pullAllFromFirestore()
    .then(() => flushSyncOutbox())
    .catch((err) => {
      handleFirestoreError(err, 'InitialSync');
    });

  // Listen to remote tombstones in real time
  try {
    const tombColRef = collection(firestoreDb, TOMBSTONE_COLLECTION);
    const unsubTomb = onSnapshot(
      tombColRef,
      async (snapshot) => {
        const changes = snapshot.docChanges();
        if (changes.length === 0) return;

        setRemoteSyncing(true);
        try {
          for (const change of changes) {
            if (change.type === 'added' || change.type === 'modified') {
              const data = change.doc.data() as TombstoneRecord;
              if (data?.table_name && data?.record_id) {
                recordLocalTombstone(data.table_name, data.record_id, data.deleted_at);
                const dexieTable = (dexieDb as any)[data.table_name];
                if (dexieTable) {
                  const existing = await dexieTable.get(String(data.record_id));
                  if (!existing || isRecordTombstoned(data.table_name, data.record_id, existing.updated_at)) {
                    await dexieTable.delete(String(data.record_id));
                    const numId = Number(data.record_id);
                    if (!isNaN(numId)) await dexieTable.delete(numId);
                  }
                }
              }
            }
          }
        } finally {
          setRemoteSyncing(false);
        }
      },
      (err) => {
        handleFirestoreError(err, 'Listener deleted_records');
      }
    );
    unsubscribers.push(unsubTomb);
  } catch (e) {}

  ALL_TABLES.forEach((tableName) => {
    try {
      const colRef = collection(firestoreDb, tableName);
      const unsub = onSnapshot(
        colRef,
        async (snapshot) => {
          const changes = snapshot.docChanges();
          if (changes.length === 0) return;

          setRemoteSyncing(true);
          try {
            const dexieTable = (dexieDb as any)[tableName];
            if (!dexieTable) return;

            const docsToDelete: (string | number)[] = [];
            const docsToPut: any[] = [];

            const existingList = await dexieTable.toArray();
            const existingMap = new Map<string, any>();
            existingList.forEach((item: any) => {
              if (item?.id !== undefined && item?.id !== null) {
                existingMap.set(String(item.id), item);
              }
            });

            for (const change of changes) {
              if (change.doc.metadata.hasPendingWrites) {
                continue;
              }

              const rawDocId = change.doc.id;
              const docData = change.doc.data();
              const canonicalId = getCanonicalDocId(tableName, docData, rawDocId);

              if (change.type === 'removed') {
                // IMPORTANT: Only delete rawDocId, NEVER delete canonicalId when a legacy duplicate UUID is removed!
                recordLocalTombstone(tableName, rawDocId);
                docsToDelete.push(rawDocId);
                const numId = Number(rawDocId);
                if (!isNaN(numId)) docsToDelete.push(numId);
              } else if (change.type === 'added' || change.type === 'modified') {
                if (isRecordTombstoned(tableName, canonicalId, docData.updated_at)) {
                  continue;
                }

                // Only cache signature under canonicalId if the Firestore document ALREADY has canonicalId as its doc ID
                if (rawDocId === canonicalId) {
                  const sig = computePayloadSignature({ ...docData, id: canonicalId });
                  syncedSignatures.set(`${tableName}/${canonicalId}`, sig);
                } else {
                  syncedSignatures.delete(`${tableName}/${canonicalId}`);
                }

                const existing = existingMap.get(canonicalId) || existingMap.get(rawDocId);
                if (rawDocId !== canonicalId && existingMap.has(rawDocId)) {
                  docsToDelete.push(rawDocId);
                }

                let mergedRecord: any;
                if (existing) {
                  const localTime = new Date(
                    existing.updated_at || existing.last_updated || 0
                  ).getTime();
                  const remoteTime = new Date(
                    docData.updated_at || docData.last_updated || 0
                  ).getTime();

                  if (
                    typeof existing.id === 'number' &&
                    typeof canonicalId === 'string' &&
                    String(existing.id) === canonicalId
                  ) {
                    docsToDelete.push(existing.id);
                  }

                  if (remoteTime >= localTime) {
                    mergedRecord = {
                      ...existing,
                      ...docData,
                      id: canonicalId,
                      updated_at: docData.updated_at || new Date().toISOString(),
                    };
                  } else {
                    mergedRecord = {
                      ...docData,
                      ...existing,
                      id: canonicalId,
                      updated_at: existing.updated_at || new Date().toISOString(),
                    };
                  }
                } else {
                  mergedRecord = {
                    ...docData,
                    id: canonicalId,
                    updated_at: docData.updated_at || new Date().toISOString(),
                  };
                }

                docsToPut.push(mergedRecord);

                // If remote doc was using a legacy non-canonical ID, migrate it to canonicalId on Firestore
                if (rawDocId !== canonicalId) {
                  enqueueSyncOperation(tableName, canonicalId, mergedRecord, false, true);
                  enqueueSyncOperation(tableName, rawDocId, null, true);
                }
              }
            }

            if (docsToDelete.length > 0 || docsToPut.length > 0) {
              await dexieDb.transaction('rw', dexieTable, async () => {
                if (docsToDelete.length > 0) {
                  await dexieTable.bulkDelete(docsToDelete);
                }
                if (docsToPut.length > 0) {
                  await dexieTable.bulkPut(docsToPut);
                }
              });
              persistSignatures();
            }

            updateSyncStatus({ lastSyncedAt: new Date(), isSyncing: false });

            if (typeof window !== 'undefined') {
              window.dispatchEvent(
                new CustomEvent('smart_edu_data_updated', { detail: { tableName } })
              );
            }
          } catch (err: any) {
            console.error(`[SyncService] Error processing snapshot batch for ${tableName}:`, err);
            updateSyncStatus({
              syncErrors: currentSyncStatus.syncErrors + 1,
              isSyncing: false,
            });
          } finally {
            setRemoteSyncing(false);
          }
        },
        (error) => {
          handleFirestoreError(error, `Listener ${tableName}`);
          updateSyncStatus({
            syncErrors: currentSyncStatus.syncErrors + 1,
            isSyncing: false,
          });
        }
      );
      unsubscribers.push(unsub);
    } catch (err: any) {
      handleFirestoreError(err, `Init Listener ${tableName}`);
    }
  });

  return stopRealtimeSync;
}

export function stopRealtimeSync() {
  unsubscribers.forEach((unsub) => {
    try {
      unsub();
    } catch (e) {}
  });
  unsubscribers = [];
}

// Pull an entire collection from Firestore into Dexie with Tombstone & Canonical ID reconciliation
export async function pullCollectionFromFirestore(tableName: TableName) {
  if (getIsQuotaExceeded() || !firestoreDb) return;
  const colRef = collection(firestoreDb, tableName);
  const snap = await getDocs(colRef);

  const dexieTable = (dexieDb as any)[tableName];
  if (!dexieTable) return;

  setRemoteSyncing(true);
  try {
    const existingList = await dexieTable.toArray();
    const existingMap = new Map<string, any>();
    existingList.forEach((item: any) => {
      if (item?.id !== undefined && item?.id !== null) {
        existingMap.set(String(item.id), item);
      }
    });

    const docsToDelete: (string | number)[] = [];
    const docsToPut: any[] = [];
    const remoteCanonicalIds = new Set<string>();

    for (const docSnap of snap.docs) {
      const rawDocId = docSnap.id;
      const docData = docSnap.data();
      const canonicalId = getCanonicalDocId(tableName, docData, rawDocId);

      if (isRecordTombstoned(tableName, canonicalId, docData.updated_at)) {
        continue;
      }

      remoteCanonicalIds.add(canonicalId);

      // Only mark canonicalId as synced if the Firestore doc actually lives at canonicalId
      if (rawDocId === canonicalId) {
        const sig = computePayloadSignature({ ...docData, id: canonicalId });
        syncedSignatures.set(`${tableName}/${canonicalId}`, sig);
      } else {
        syncedSignatures.delete(`${tableName}/${canonicalId}`);
      }

      if (rawDocId !== canonicalId && existingMap.has(rawDocId)) {
        docsToDelete.push(rawDocId);
      }

      const existing = existingMap.get(canonicalId) || existingMap.get(rawDocId);
      let mergedRecord: any;
      if (existing) {
        const localTime = new Date(
          existing.updated_at || existing.last_updated || 0
        ).getTime();
        const remoteTime = new Date(
          docData.updated_at || docData.last_updated || 0
        ).getTime();

        if (
          typeof existing.id === 'number' &&
          typeof canonicalId === 'string' &&
          String(existing.id) === canonicalId
        ) {
          docsToDelete.push(existing.id);
        }

        if (remoteTime >= localTime) {
          mergedRecord = {
            ...existing,
            ...docData,
            id: canonicalId,
            updated_at: docData.updated_at || new Date().toISOString(),
          };
        } else {
          mergedRecord = {
            ...docData,
            ...existing,
            id: canonicalId,
            updated_at: existing.updated_at || new Date().toISOString(),
          };
        }
      } else {
        mergedRecord = {
          ...docData,
          id: canonicalId,
          updated_at: docData.updated_at || new Date().toISOString(),
        };
      }

      docsToPut.push(mergedRecord);

      // If Firestore document was stored under a legacy UUID instead of canonicalId,
      // force-write the canonical document and delete the legacy UUID document
      if (rawDocId !== canonicalId) {
        enqueueSyncOperation(tableName, canonicalId, mergedRecord, false, true);
        enqueueSyncOperation(tableName, rawDocId, null, true);
      }
    }

    // Reconcile local records: only delete locally if explicitly tombstoned.
    // If a local record is NOT tombstoned and missing from remote, re-push it to Firestore so no data is lost!
    existingList.forEach((localItem: any) => {
      if (!localItem?.id || localItem.is_demo === true) return;
      const localIdStr = String(localItem.id);
      const canonicalLocalId = getCanonicalDocId(tableName, localItem, localIdStr);

      if (isRecordTombstoned(tableName, canonicalLocalId, localItem.updated_at)) {
        docsToDelete.push(localItem.id);
      } else if (!remoteCanonicalIds.has(canonicalLocalId)) {
        enqueueSyncOperation(
          tableName,
          canonicalLocalId,
          { ...localItem, id: canonicalLocalId },
          false,
          true
        );
      }
    });

    if (docsToDelete.length > 0 || docsToPut.length > 0) {
      await dexieDb.transaction('rw', dexieTable, async () => {
        if (docsToDelete.length > 0) {
          await dexieTable.bulkDelete(docsToDelete);
        }
        if (docsToPut.length > 0) {
          await dexieTable.bulkPut(docsToPut);
        }
      });
      persistSignatures();
    }
  } finally {
    setRemoteSyncing(false);
  }
}

/**
 * Automatically recovers any missing `class_students` enrollments that were accidentally
 * lost during legacy UUID -> Canonical ID migration, using evidence from:
 * 1. `student_sessions` + `sessions`
 * 2. `warnings`
 * 3. `audit_logs` (snapshots, diffs, class_id/student_id, and enrollment/transfer descriptions)
 * 4. False tombstones in `deleted_records` (`cs_${class_id}_${student_id}`)
 * 5. Unassigned student creation logs (`Thêm mới học sinh ... và ghi danh vào N lớp`)
 */
export async function recoverMissingClassEnrollments(): Promise<number> {
  let recoveredCount = 0;
  try {
    const [
      allClasses,
      allStudents,
      allClassStudents,
      allSessions,
      allStudentSessions,
      allWarnings,
      allAuditLogs,
    ] = await Promise.all([
      dexieDb.classes.toArray(),
      dexieDb.students.toArray(),
      dexieDb.class_students.toArray(),
      dexieDb.sessions.toArray(),
      dexieDb.student_sessions.toArray(),
      dexieDb.warnings.toArray(),
      dexieDb.audit_logs.toArray(),
    ]);

    const realClasses = allClasses.filter((c) => c && c.id && c.is_demo !== true);
    const realStudents = allStudents.filter((s) => s && s.id && s.is_demo !== true);
    if (realClasses.length === 0 || realStudents.length === 0) return 0;

    const classById = new Map<string, any>();
    const classByNameNorm = new Map<string, any>();
    realClasses.forEach((c) => {
      classById.set(String(c.id), c);
      if (c.class_name) {
        classByNameNorm.set(c.class_name.trim().toLowerCase(), c);
      }
    });

    const studentById = new Map<string, any>();
    const studentsByNameNorm = new Map<string, any[]>();
    realStudents.forEach((s) => {
      studentById.set(String(s.id), s);
      if (s.full_name) {
        const key = s.full_name.trim().toLowerCase();
        if (!studentsByNameNorm.has(key)) studentsByNameNorm.set(key, []);
        studentsByNameNorm.get(key)!.push(s);
      }
    });

    const sessionById = new Map<string, any>();
    allSessions.forEach((sess) => {
      if (sess?.id) sessionById.set(String(sess.id), sess);
    });

    const existingLinks = new Set<string>();
    const studentEnrolledCount = new Map<string, number>();
    allClassStudents.forEach((cs) => {
      if (cs?.class_id && cs?.student_id) {
        const key = `cs_${String(cs.class_id)}_${String(cs.student_id)}`;
        existingLinks.add(key);
        studentEnrolledCount.set(
          String(cs.student_id),
          (studentEnrolledCount.get(String(cs.student_id)) || 0) + 1
        );
      }
    });

    // Sort audit logs chronologically (oldest -> newest)
    const sortedLogs = [...allAuditLogs].sort((a, b) =>
      String(a.timestamp || '').localeCompare(String(b.timestamp || ''))
    );

    // Track explicit teacher removals vs enrollments
    const explicitlyRemoved = new Set<string>();
    const recoveredMap = new Map<
      string,
      {
        id: string;
        class_id: string;
        student_id: string;
        join_date: string;
        leave_date?: string;
        created_at: string;
        updated_at: string;
      }
    >();

    const addCandidate = (
      classIdRaw: string | number,
      studentIdRaw: string | number,
      joinDate?: string,
      leaveDate?: string
    ) => {
      const classId = String(classIdRaw);
      const studentId = String(studentIdRaw);
      if (!classById.has(classId) || !studentById.has(studentId)) return;
      const canonicalId = `cs_${classId}_${studentId}`;
      if (existingLinks.has(canonicalId)) return;

      const st = studentById.get(studentId);
      const now = new Date().toISOString();
      const defaultJoin =
        joinDate ||
        (st?.created_at ? String(st.created_at).split('T')[0] : now.split('T')[0]);

      const prev = recoveredMap.get(canonicalId);
      recoveredMap.set(canonicalId, {
        id: canonicalId,
        class_id: classId,
        student_id: studentId,
        join_date: prev?.join_date || defaultJoin,
        leave_date: leaveDate !== undefined ? leaveDate : prev?.leave_date,
        created_at: st?.created_at || now,
        updated_at: now,
      });
    };

    // 1. Check tombstones for any `cs_${classId}_${studentId}` that were created by migration
    tombstoneMap.forEach((tomb) => {
      if (tomb.table_name === 'class_students' && tomb.record_id?.startsWith('cs_')) {
        for (const cls of realClasses) {
          const cid = String(cls.id);
          const prefix = `cs_${cid}_`;
          if (tomb.record_id.startsWith(prefix)) {
            const sid = tomb.record_id.slice(prefix.length);
            if (studentById.has(sid)) {
              addCandidate(cid, sid);
            }
          }
        }
      }
    });

    // 2. Evidence from `student_sessions` + `sessions`
    allStudentSessions.forEach((ss) => {
      if (!ss?.session_id || !ss?.student_id) return;
      const sess = sessionById.get(String(ss.session_id));
      if (sess?.class_id) {
        addCandidate(sess.class_id, ss.student_id, sess.session_date);
      }
    });

    // 3. Evidence from `warnings`
    allWarnings.forEach((w) => {
      if (w?.class_id && w?.student_id) {
        const joinDate = w.created_at ? String(w.created_at).split('T')[0] : undefined;
        addCandidate(w.class_id, w.student_id, joinDate);
      }
    });

    // 4. Evidence from `audit_logs` (snapshots, diffs, and text descriptions)
    for (const log of sortedLogs) {
      const logDate = log.timestamp ? String(log.timestamp).split('T')[0] : undefined;
      const resolvedClassId =
        log.class_id ||
        log.snapshot?.class_id ||
        (log.session_id ? sessionById.get(String(log.session_id))?.class_id : undefined);

      if (resolvedClassId && log.student_id) {
        addCandidate(resolvedClassId, log.student_id, logDate);
      }

      if (resolvedClassId && Array.isArray(log.diffs)) {
        log.diffs.forEach((d) => {
          if (d?.student_id) addCandidate(resolvedClassId, d.student_id, logDate);
        });
      }

      if (resolvedClassId && Array.isArray(log.snapshot?.records)) {
        log.snapshot!.records.forEach((r) => {
          if (r?.student_id) addCandidate(resolvedClassId, r.student_id, logDate);
        });
      }

      const desc = (log.description || '').trim();
      if (!desc) continue;

      // Match explicit removal:
      // "Xóa vĩnh viễn học sinh ${name} khỏi lớp ${class}" or "Xóa ${name} khỏi lớp ${class}"
      if (
        log.action_type === 'Xóa học sinh khỏi lớp' ||
        desc.startsWith('Xóa vĩnh viễn học sinh ') ||
        desc.startsWith('Xóa ')
      ) {
        for (const [cNameNorm, cls] of classByNameNorm.entries()) {
          const suffix = ` khỏi lớp ${cNameNorm}`;
          if (desc.toLowerCase().endsWith(suffix)) {
            for (const [sNameNorm, stList] of studentsByNameNorm.entries()) {
              if (desc.toLowerCase().includes(sNameNorm)) {
                stList.forEach((st) => {
                  explicitlyRemoved.add(`cs_${String(cls.id)}_${String(st.id)}`);
                });
              }
            }
          }
        }
        continue;
      }

      // Match enrollments, transfers, withdrawals, and restorations by class name & student name
      for (const [cNameNorm, cls] of classByNameNorm.entries()) {
        if (!desc.toLowerCase().includes(cNameNorm)) continue;
        for (const [sNameNorm, stList] of studentsByNameNorm.entries()) {
          if (!desc.toLowerCase().includes(sNameNorm)) continue;
          stList.forEach((st) => {
            const cKey = `cs_${String(cls.id)}_${String(st.id)}`;
            if (
              desc.startsWith('Xếp học sinh ') ||
              desc.startsWith('Khôi phục ')
            ) {
              explicitlyRemoved.delete(cKey);
              addCandidate(cls.id, st.id, logDate, undefined);
            } else if (desc.startsWith('Cho học sinh ') && desc.includes('rút lui an toàn')) {
              addCandidate(cls.id, st.id, undefined, logDate);
            } else if (desc.startsWith('Chuyển học sinh ')) {
              const lower = desc.toLowerCase();
              const fromIdx = lower.indexOf(`từ lớp ${cNameNorm}`);
              const toIdx = lower.indexOf(`sang lớp ${cNameNorm}`);
              if (fromIdx !== -1) {
                addCandidate(cls.id, st.id, undefined, logDate);
              } else if (toIdx !== -1) {
                explicitlyRemoved.delete(cKey);
                addCandidate(cls.id, st.id, logDate, undefined);
              }
            }
          });
        }
      }
    }

    // 5. Check students who still have 0 classes (neither in existingLinks nor recoveredMap)
    const activeRealClasses = realClasses.filter((c) => c.status === 'active');

    // Map each student's known/recovered classes so we can also use batch-creation proximity
    const studentClassesKnown = new Map<string, string[]>();
    allClassStudents.forEach((cs) => {
      if (cs?.student_id && cs?.class_id) {
        const sid = String(cs.student_id);
        if (!studentClassesKnown.has(sid)) studentClassesKnown.set(sid, []);
        studentClassesKnown.get(sid)!.push(String(cs.class_id));
      }
    });
    recoveredMap.forEach((rec) => {
      if (!explicitlyRemoved.has(rec.id)) {
        const sid = String(rec.student_id);
        if (!studentClassesKnown.has(sid)) studentClassesKnown.set(sid, []);
        studentClassesKnown.get(sid)!.push(String(rec.class_id));
      }
    });

    for (const st of realStudents) {
      const sid = String(st.id);
      if ((studentClassesKnown.get(sid)?.length || 0) > 0) continue;

      // Check if audit log says this student was enrolled in >= 1 class upon creation
      const creationLog = sortedLogs.find(
        (l) =>
          l.description &&
          l.description.toLowerCase().includes(st.full_name.trim().toLowerCase()) &&
          l.description.includes('và ghi danh vào ')
      );
      const matchCount = creationLog?.description?.match(/ghi danh vào (\d+) lớp/);
      const intendedClassCount = matchCount ? Number(matchCount[1]) : st.status === 'studying' ? 1 : 0;

      if (intendedClassCount <= 0) continue;

      // Case 5a: Only 1 active class exists in the system (or activeRealClasses.length === intendedClassCount)
      if (activeRealClasses.length > 0 && activeRealClasses.length === intendedClassCount) {
        activeRealClasses.forEach((cls) => {
          const cKey = `cs_${String(cls.id)}_${sid}`;
          if (!explicitlyRemoved.has(cKey)) {
            addCandidate(cls.id, sid);
          }
        });
        continue;
      }

      // Case 5b: Match class name or grade level mentioned in student's note
      const noteNorm = (st.note || '').trim().toLowerCase();
      if (noteNorm) {
        const matchedByNote = activeRealClasses.filter((cls) => {
          const cName = (cls.class_name || '').trim().toLowerCase();
          const shortCode = cName.split(' - ')[0].trim();
          return (
            (shortCode && noteNorm.includes(shortCode)) ||
            noteNorm.includes(`khối ${cls.grade_level}`) ||
            noteNorm.includes(`lớp ${cls.grade_level}`)
          );
        });
        if (matchedByNote.length === 1) {
          const cKey = `cs_${String(matchedByNote[0].id)}_${sid}`;
          if (!explicitlyRemoved.has(cKey)) {
            addCandidate(matchedByNote[0].id, sid);
            continue;
          }
        }
      }

      // Case 5c: Batch-creation temporal proximity (student created near another student whose class is known, or right after a class was created)
      const stTime = new Date(st.created_at || creationLog?.timestamp || 0).getTime();
      if (stTime > 0) {
        let bestClassId: string | null = null;
        let minDiff = 45 * 60 * 1000; // 45 minutes window

        for (const otherSt of realStudents) {
          if (String(otherSt.id) === sid) continue;
          const knownCids = studentClassesKnown.get(String(otherSt.id));
          if (!knownCids || knownCids.length === 0) continue;
          const otherTime = new Date(otherSt.created_at || 0).getTime();
          const diff = Math.abs(stTime - otherTime);
          if (diff < minDiff) {
            minDiff = diff;
            bestClassId = knownCids[0];
          }
        }

        if (!bestClassId) {
          for (const cls of activeRealClasses) {
            const clsTime = new Date(cls.created_at || 0).getTime();
            const diff = stTime - clsTime;
            if (diff >= -60000 && diff < 60 * 60 * 1000) {
              bestClassId = String(cls.id);
            }
          }
        }

        if (bestClassId && !explicitlyRemoved.has(`cs_${bestClassId}_${sid}`)) {
          addCandidate(bestClassId, sid);
        }
      }
    }

    // Filter out any explicitly removed relationships
    const finalRecordsToRestore = Array.from(recoveredMap.values()).filter(
      (rec) => !explicitlyRemoved.has(rec.id) && !existingLinks.has(rec.id)
    );

    if (finalRecordsToRestore.length > 0) {
      await dexieDb.transaction('rw', dexieDb.class_students, async () => {
        await dexieDb.class_students.bulkPut(finalRecordsToRestore as any);
      });

      for (const rec of finalRecordsToRestore) {
        const tombKey = `class_students_${rec.id}`;
        tombstoneMap.delete(tombKey);
        if (firestoreDb && !getIsQuotaExceeded()) {
          deleteDoc(doc(firestoreDb, TOMBSTONE_COLLECTION, tombKey)).catch(() => {});
        }
        enqueueSyncOperation('class_students', rec.id, rec, false, true);
      }
      persistTombstones();
      recoveredCount = finalRecordsToRestore.length;
    }
  } catch (err) {
    console.warn('[SyncService] Error in recoverMissingClassEnrollments:', err);
  }
  return recoveredCount;
}

/**
 * Kaizen Auto-Deduplication & Merge Engine:
 * Merges duplicate records by canonical business keys across Dexie & queues cleanup for Firestore.
 */
export async function kaizenDeduplicateAndMerge(): Promise<KaizenReport> {
  const report: KaizenReport = {
    mergedRecords: 0,
    deletedDuplicates: 0,
    remappedForeignKeys: 0,
    tablesCleaned: [],
  };

  setRemoteSyncing(true);
  try {
    // 1. Deduplicate Settings -> 'system_settings'
    const allSettings = await dexieDb.settings.toArray();
    if (allSettings.length > 0) {
      allSettings.sort((a, b) => {
        const tA = new Date(a.updated_at || 0).getTime();
        const tB = new Date(b.updated_at || 0).getTime();
        return tB - tA;
      });
      const bestSetting = allSettings[0];
      const apiKeyHolder = allSettings.find((s) => s.gemini_api_key?.trim());
      const mergedSetting = {
        ...bestSetting,
        id: 'system_settings',
        gemini_api_key: bestSetting.gemini_api_key || apiKeyHolder?.gemini_api_key || '',
        updated_at: bestSetting.updated_at || new Date().toISOString(),
      };

      const oldSettingIds = allSettings
        .map((s) => s.id!)
        .filter((id) => id && String(id) !== 'system_settings');

      if (oldSettingIds.length > 0 || bestSetting.id !== 'system_settings') {
        await dexieDb.transaction('rw', dexieDb.settings, async () => {
          if (oldSettingIds.length > 0) {
            await dexieDb.settings.bulkDelete(oldSettingIds);
          }
          await dexieDb.settings.put(mergedSetting);
        });
        oldSettingIds.forEach((oldId) => enqueueSyncOperation('settings', oldId, null, true));
        enqueueSyncOperation('settings', 'system_settings', mergedSetting, false, true);
        report.mergedRecords += 1;
        report.deletedDuplicates += oldSettingIds.length;
        report.tablesCleaned.push('settings');
      }
    }

    // 2. Deduplicate School Years & Remap Classes.school_year_id
    const allYears = await dexieDb.school_years.toArray();
    if (allYears.length > 0) {
      const yearGroups = new Map<string, typeof allYears>();
      const yearIdRemap = new Map<string, string>();

      allYears.forEach((sy) => {
        const canonicalId = getCanonicalDocId('school_years', sy, sy.id);
        if (!yearGroups.has(canonicalId)) yearGroups.set(canonicalId, []);
        yearGroups.get(canonicalId)!.push(sy);
        if (sy.id && String(sy.id) !== canonicalId) {
          yearIdRemap.set(String(sy.id), canonicalId);
        }
      });

      const yearsToPut: any[] = [];
      const yearIdsToDelete: string[] = [];

      yearGroups.forEach((group, canonicalId) => {
        group.sort((a, b) => {
          const tA = new Date(a.updated_at || a.created_at || 0).getTime();
          const tB = new Date(b.updated_at || b.created_at || 0).getTime();
          return tB - tA;
        });
        const winner = { ...group[0], id: canonicalId };
        if (group.length > 1 || group[0].id !== canonicalId) {
          yearsToPut.push(winner);
          group.forEach((item) => {
            if (item.id && String(item.id) !== canonicalId) {
              yearIdsToDelete.push(String(item.id));
            }
          });
        }
      });

      if (yearsToPut.length > 0 || yearIdsToDelete.length > 0) {
        await dexieDb.transaction('rw', [dexieDb.school_years, dexieDb.classes], async () => {
          if (yearIdsToDelete.length > 0) await dexieDb.school_years.bulkDelete(yearIdsToDelete);
          if (yearsToPut.length > 0) await dexieDb.school_years.bulkPut(yearsToPut);

          if (yearIdRemap.size > 0) {
            const allClasses = await dexieDb.classes.toArray();
            const classesToUpdate: any[] = [];
            allClasses.forEach((cls) => {
              const newSyId = yearIdRemap.get(String(cls.school_year_id));
              if (newSyId && newSyId !== cls.school_year_id) {
                classesToUpdate.push({ ...cls, school_year_id: newSyId });
              }
            });
            if (classesToUpdate.length > 0) {
              await dexieDb.classes.bulkPut(classesToUpdate);
              classesToUpdate.forEach((c) =>
                enqueueSyncOperation('classes', c.id, c, false, true)
              );
              report.remappedForeignKeys += classesToUpdate.length;
            }
          }
        });
        yearIdsToDelete.forEach((id) => enqueueSyncOperation('school_years', id, null, true));
        yearsToPut.forEach((y) => enqueueSyncOperation('school_years', y.id, y, false, true));
        report.mergedRecords += yearsToPut.length;
        report.deletedDuplicates += yearIdsToDelete.length;
        report.tablesCleaned.push('school_years');
      }
    }

    // 3. Deduplicate student_sessions by canonical `ss_${session_id}_${student_id}`
    const allStudentSessions = await dexieDb.student_sessions.toArray();
    if (allStudentSessions.length > 0) {
      const ssGroups = new Map<string, typeof allStudentSessions>();
      allStudentSessions.forEach((ss) => {
        if (!ss.session_id || !ss.student_id) return;
        const canonicalId = getCanonicalDocId('student_sessions', ss, ss.id);
        if (!ssGroups.has(canonicalId)) ssGroups.set(canonicalId, []);
        ssGroups.get(canonicalId)!.push(ss);
      });

      const ssToPut: any[] = [];
      const ssIdsToDelete: (string | number)[] = [];

      ssGroups.forEach((group, canonicalId) => {
        if (group.length > 1 || String(group[0].id) !== canonicalId) {
          group.sort((a, b) => {
            // Prefer records with actual scores entered, then newest updated_at
            const scoreWeightA =
              (typeof a.homework_score === 'number' ? 2 : 0) +
              (typeof a.test_score === 'number' ? 2 : 0) +
              (a.custom_comment ? 1 : 0);
            const scoreWeightB =
              (typeof b.homework_score === 'number' ? 2 : 0) +
              (typeof b.test_score === 'number' ? 2 : 0) +
              (b.custom_comment ? 1 : 0);
            if (scoreWeightB !== scoreWeightA) return scoreWeightB - scoreWeightA;
            const tA = new Date(a.updated_at || 0).getTime();
            const tB = new Date(b.updated_at || 0).getTime();
            return tB - tA;
          });

          const winner = { ...group[0], id: canonicalId };
          ssToPut.push(winner);
          group.forEach((item) => {
            if (item.id !== undefined && String(item.id) !== canonicalId) {
              ssIdsToDelete.push(item.id);
            }
          });
        }
      });

      if (ssToPut.length > 0 || ssIdsToDelete.length > 0) {
        await dexieDb.transaction('rw', dexieDb.student_sessions, async () => {
          if (ssIdsToDelete.length > 0) {
            await dexieDb.student_sessions.bulkDelete(ssIdsToDelete as any);
          }
          if (ssToPut.length > 0) {
            await dexieDb.student_sessions.bulkPut(ssToPut);
          }
        });
        ssIdsToDelete.forEach((id) => enqueueSyncOperation('student_sessions', id, null, true));
        ssToPut.forEach((rec) =>
          enqueueSyncOperation('student_sessions', rec.id, rec, false, true)
        );
        report.mergedRecords += ssToPut.length;
        report.deletedDuplicates += ssIdsToDelete.length;
        report.tablesCleaned.push('student_sessions');
      }
    }

    // 4. Deduplicate class_students by canonical `cs_${class_id}_${student_id}`
    const allClassStudents = await dexieDb.class_students.toArray();
    if (allClassStudents.length > 0) {
      const csGroups = new Map<string, typeof allClassStudents>();
      allClassStudents.forEach((cs) => {
        if (!cs.class_id || !cs.student_id) return;
        const canonicalId = getCanonicalDocId('class_students', cs, cs.id);
        if (!csGroups.has(canonicalId)) csGroups.set(canonicalId, []);
        csGroups.get(canonicalId)!.push(cs);
      });

      const csToPut: any[] = [];
      const csIdsToDelete: (string | number)[] = [];

      csGroups.forEach((group, canonicalId) => {
        if (group.length > 1 || String(group[0].id) !== canonicalId) {
          group.sort((a, b) => {
            const tA = new Date(a.created_at || 0).getTime();
            const tB = new Date(b.created_at || 0).getTime();
            return tB - tA;
          });
          const winner = { ...group[0], id: canonicalId };
          csToPut.push(winner);
          group.forEach((item) => {
            if (item.id !== undefined && String(item.id) !== canonicalId) {
              csIdsToDelete.push(item.id);
            }
          });
        }
      });

      if (csToPut.length > 0 || csIdsToDelete.length > 0) {
        await dexieDb.transaction('rw', dexieDb.class_students, async () => {
          if (csIdsToDelete.length > 0) {
            await dexieDb.class_students.bulkDelete(csIdsToDelete as any);
          }
          if (csToPut.length > 0) {
            await dexieDb.class_students.bulkPut(csToPut);
          }
        });
        csIdsToDelete.forEach((id) => enqueueSyncOperation('class_students', id, null, true));
        csToPut.forEach((rec) =>
          enqueueSyncOperation('class_students', rec.id, rec, false, true)
        );
        report.mergedRecords += csToPut.length;
        report.deletedDuplicates += csIdsToDelete.length;
        report.tablesCleaned.push('class_students');
      }
    }

    // 5. Deduplicate knowledge_results by canonical `kr_${student_id}_${knowledge_tag_id}`
    const allKr = await dexieDb.knowledge_results.toArray();
    if (allKr.length > 0) {
      const krGroups = new Map<string, typeof allKr>();
      allKr.forEach((kr) => {
        if (!kr.student_id || !kr.knowledge_tag_id) return;
        const canonicalId = getCanonicalDocId('knowledge_results', kr, kr.id);
        if (!krGroups.has(canonicalId)) krGroups.set(canonicalId, []);
        krGroups.get(canonicalId)!.push(kr);
      });

      const krToPut: any[] = [];
      const krIdsToDelete: (string | number)[] = [];

      krGroups.forEach((group, canonicalId) => {
        if (group.length > 1 || String(group[0].id) !== canonicalId) {
          group.sort((a, b) => {
            const tA = new Date(a.last_updated || 0).getTime();
            const tB = new Date(b.last_updated || 0).getTime();
            return tB - tA;
          });
          const winner = { ...group[0], id: canonicalId };
          krToPut.push(winner);
          group.forEach((item) => {
            if (item.id !== undefined && String(item.id) !== canonicalId) {
              krIdsToDelete.push(item.id);
            }
          });
        }
      });

      if (krToPut.length > 0 || krIdsToDelete.length > 0) {
        await dexieDb.transaction('rw', dexieDb.knowledge_results, async () => {
          if (krIdsToDelete.length > 0) {
            await dexieDb.knowledge_results.bulkDelete(krIdsToDelete as any);
          }
          if (krToPut.length > 0) {
            await dexieDb.knowledge_results.bulkPut(krToPut);
          }
        });
        krIdsToDelete.forEach((id) => enqueueSyncOperation('knowledge_results', id, null, true));
        krToPut.forEach((rec) =>
          enqueueSyncOperation('knowledge_results', rec.id, rec, false, true)
        );
        report.mergedRecords += krToPut.length;
        report.deletedDuplicates += krIdsToDelete.length;
        report.tablesCleaned.push('knowledge_results');
      }
    }

    // 6. Auto-recover any missing class_students relationships from sessions, warnings, audit logs & tombstones
    const recoveredEnrollments = await recoverMissingClassEnrollments();
    if (recoveredEnrollments > 0) {
      report.mergedRecords += recoveredEnrollments;
      if (!report.tablesCleaned.includes('class_students')) {
        report.tablesCleaned.push('class_students');
      }
    }

    const summaryText =
      report.deletedDuplicates > 0 || report.mergedRecords > 0
        ? `Đã chuẩn hóa & khôi phục ${report.mergedRecords} bản ghi, dọn sạch ${report.deletedDuplicates} bản sao trùng lặp.`
        : 'Cơ sở dữ liệu đã chuẩn hóa 100% (0 bản ghi trùng lặp).';
    updateSyncStatus({ lastKaizenSummary: summaryText });
  } finally {
    setRemoteSyncing(false);
  }

  if (!getIsQuotaExceeded()) {
    await flushSyncOutbox();
  }

  return report;
}

// Pull all collections from Firestore into Dexie
export async function pullAllFromFirestore() {
  if (getIsQuotaExceeded() || !firestoreDb) return;
  updateSyncStatus({ isSyncing: true });

  try {
    await pullTombstonesFromFirestore();
    for (const tableName of ALL_TABLES) {
      if (getIsQuotaExceeded()) break;
      await pullCollectionFromFirestore(tableName);
    }
    await kaizenDeduplicateAndMerge();
    updateSyncStatus({ lastSyncedAt: new Date(), isSyncing: false });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('smart_edu_data_updated', { detail: { all: true } })
      );
    }
  } catch (err: any) {
    handleFirestoreError(err, 'pullAllFromFirestore');
    updateSyncStatus({
      syncErrors: currentSyncStatus.syncErrors + 1,
      isSyncing: false,
    });
  }
}

// Push all changed non-demo local records from Dexie to Firestore
export async function pushAllToFirestore() {
  if (getIsQuotaExceeded() || !firestoreDb) return;
  updateSyncStatus({ isSyncing: true });

  try {
    await kaizenDeduplicateAndMerge();
    for (const tableName of ALL_TABLES) {
      const dexieTable = (dexieDb as any)[tableName];
      if (!dexieTable) continue;

      const items = await dexieTable.toArray();
      for (const item of items) {
        if (!item || item.is_demo === true) continue;
        const docId = getCanonicalDocId(tableName, item, item.id);
        if (!isRecordTombstoned(tableName, docId, item.updated_at)) {
          enqueueSyncOperation(tableName, docId, { ...item, id: docId }, false);
        }
      }
    }
    await flushSyncOutbox();
    updateSyncStatus({ lastSyncedAt: new Date(), isSyncing: false });
  } catch (err: any) {
    handleFirestoreError(err, 'pushAllToFirestore');
    updateSyncStatus({
      syncErrors: currentSyncStatus.syncErrors + 1,
      isSyncing: false,
    });
  }
}

// Complete 2-way sync: Pull latest cloud updates & tombstones, deduplicate, then push dirty local items
export async function syncAll() {
  if (getIsQuotaExceeded() || !firestoreDb) return;
  updateSyncStatus({ isSyncing: true });

  try {
    await pullAllFromFirestore();
    await pushAllToFirestore();
    updateSyncStatus({ lastSyncedAt: new Date(), isSyncing: false });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('smart_edu_data_updated', { detail: { fullSync: true } })
      );
    }
  } catch (err: any) {
    handleFirestoreError(err, 'syncAll');
    updateSyncStatus({
      syncErrors: currentSyncStatus.syncErrors + 1,
      isSyncing: false,
    });
  }
}

export async function forceFullSync() {
  await syncAll();
}

export async function reconnectAndSyncCloud(): Promise<boolean> {
  const ok = await tryReconnectFirestore();
  if (!ok) return false;
  await syncAll();
  return !getIsQuotaExceeded();
}

// Clear all Firestore collections for real-world blank slate deployment using writeBatch
export async function clearFirestoreDatabase() {
  if (getIsQuotaExceeded() || !firestoreDb) return;
  try {
    for (const tableName of ALL_TABLES) {
      if (tableName === 'knowledge_tags' || tableName === 'settings') continue;
      const colRef = collection(firestoreDb, tableName);
      const snap = await getDocs(colRef);
      if (snap.empty) continue;

      const docs = snap.docs;
      const BATCH_SIZE = 200;
      for (let i = 0; i < docs.length; i += BATCH_SIZE) {
        const chunk = docs.slice(i, i + BATCH_SIZE);
        const batch = writeBatch(firestoreDb);
        chunk.forEach((docSnapshot) => {
          batch.delete(docSnapshot.ref);
          const tomb = recordLocalTombstone(tableName, docSnapshot.id);
          const tombRef = doc(firestoreDb, TOMBSTONE_COLLECTION, tomb.id);
          batch.set(tombRef, tomb, { merge: true });
        });
        await batch.commit();
      }
    }
    outboxMap.clear();
    persistOutbox();
    updateSyncStatus({ pendingOutboxCount: 0, lastSyncedAt: new Date() });
  } catch (err: any) {
    handleFirestoreError(err, 'clearFirestoreDatabase');
  }
}
