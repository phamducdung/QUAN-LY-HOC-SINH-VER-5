import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  getDoc,
  getDocs,
  onSnapshot,
  Unsubscribe,
  query,
  limit,
  writeBatch
} from 'firebase/firestore';
import { db as firestoreDb, handleFirestoreError } from '../firebase';
import { db as dexieDb, isRemoteSyncing, setRemoteSyncing } from '../db/dexie';

export interface SyncStatus {
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncedAt: Date | null;
  syncErrors: number;
}

const ALL_TABLES = [
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
  'settings'
] as const;

type TableName = typeof ALL_TABLES[number];

let unsubscribers: Unsubscribe[] = [];
let statusListeners: Array<(status: SyncStatus) => void> = [];

let currentSyncStatus: SyncStatus = {
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  isSyncing: false,
  lastSyncedAt: null,
  syncErrors: 0,
};

function updateSyncStatus(patch: Partial<SyncStatus>) {
  currentSyncStatus = { ...currentSyncStatus, ...patch };
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
        // Trigger live queries or status update across tabs
        updateSyncStatus({ lastSyncedAt: new Date() });
      }
    };
  } catch (e) {
    console.warn('[Sync] BroadcastChannel not supported or error:', e);
  }
}

export function broadcastLocalMutation(tableName: string, action: 'put' | 'delete', id: string | number) {
  if (broadcastChannel) {
    try {
      broadcastChannel.postMessage({
        type: 'DATA_MUTATION',
        tableName,
        action,
        id,
        timestamp: Date.now()
      });
    } catch (e) {
      // Ignore broadcast errors
    }
  }
}

// Push a batch of record changes to Firestore efficiently
export async function pushDocsBatchToFirestore(
  tableName: TableName,
  items: any[]
) {
  if (isRemoteSyncing) return;
  if (!firestoreDb || !items || items.length === 0) return;

  try {
    const now = new Date().toISOString();
    // Firestore supports up to 500 writes per batch
    const BATCH_SIZE = 400;
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const chunk = items.slice(i, i + BATCH_SIZE);
      const batch = writeBatch(firestoreDb);

      chunk.forEach((data) => {
        if (!data || data.id === undefined) return;
        const docId = String(data.id);
        const docRef = doc(firestoreDb, tableName, docId);
        
        const cleanData = {
          ...data,
          id: docId,
          updated_at: data.updated_at || data.last_updated || now,
        };
        Object.keys(cleanData).forEach((key) => {
          if (cleanData[key] === undefined) {
            delete cleanData[key];
          }
        });
        batch.set(docRef, cleanData, { merge: true });
      });

      await batch.commit();
    }
    updateSyncStatus({ lastSyncedAt: new Date() });
  } catch (err: any) {
    handleFirestoreError(err, `BatchPush ${tableName}`);
    updateSyncStatus({ syncErrors: currentSyncStatus.syncErrors + 1 });
  }
}

// Push a single record change to Firestore
export async function pushDocToFirestore(
  tableName: TableName,
  docId: string,
  data?: any,
  isDelete = false
) {
  if (isRemoteSyncing) return;
  if (!firestoreDb) return;

  try {
    const docRef = doc(firestoreDb, tableName, docId);
    if (isDelete) {
      await deleteDoc(docRef);
    } else if (data) {
      // Ensure doc has an updated_at timestamp if missing
      const cleanData = {
        ...data,
        id: docId,
        updated_at: data.updated_at || data.last_updated || new Date().toISOString()
      };
      // Clean undefined values for Firestore compatibility
      Object.keys(cleanData).forEach((key) => {
        if (cleanData[key] === undefined) {
          delete cleanData[key];
        }
      });
      await setDoc(docRef, cleanData, { merge: true });
    }
    updateSyncStatus({ lastSyncedAt: new Date() });
  } catch (err: any) {
    handleFirestoreError(err, `Push ${tableName}/${docId}`);
    updateSyncStatus({ syncErrors: currentSyncStatus.syncErrors + 1 });
  }
}

// Real-time listener setup for all Firestore collections -> Dexie
export function initRealtimeSync(): () => void {
  stopRealtimeSync();

  if (!firestoreDb) {
    console.warn('[SyncService] Firestore DB not initialized');
    return () => {};
  }

  // Monitor browser online/offline status
  const handleOnline = () => updateSyncStatus({ isOnline: true });
  const handleOffline = () => updateSyncStatus({ isOnline: false });

  if (typeof window !== 'undefined') {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
  }

  updateSyncStatus({ isSyncing: true });

  // Kick off initial background pull to guarantee Dexie is populated immediately
  pullAllFromFirestore().catch((err) => {
    console.warn('[SyncService] Initial pull error:', err);
  });

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

            // Read existing records once in parallel to perform field-level merge
            const existingList = await dexieTable.toArray();
            const existingMap = new Map<string, any>();
            existingList.forEach((item: any) => {
              if (item?.id !== undefined && item?.id !== null) {
                existingMap.set(String(item.id), item);
              }
            });

            for (const change of changes) {
              // If an individual doc change is pending local write, skip echo
              if (change.doc.metadata.hasPendingWrites) {
                continue;
              }

              const docId = change.doc.id;
              const docData = change.doc.data();

              if (change.type === 'removed') {
                docsToDelete.push(docId);
                const numId = Number(docId);
                if (!isNaN(numId)) docsToDelete.push(numId);
              } else if (change.type === 'added' || change.type === 'modified') {
                const existing = existingMap.get(docId);

                if (existing) {
                  const localTime = new Date(existing.updated_at || existing.last_updated || 0).getTime();
                  const remoteTime = new Date(docData.updated_at || docData.last_updated || 0).getTime();

                  // If existing had a numeric id and docId is string, delete numeric key to prevent duplicate rows
                  if (typeof existing.id === 'number' && typeof docId === 'string' && String(existing.id) === docId) {
                    docsToDelete.push(existing.id);
                  }

                  // Field-level merge when conflict or remote is newer
                  if (remoteTime >= localTime) {
                    docsToPut.push({
                      ...existing,
                      ...docData,
                      id: typeof existing.id === 'number' ? existing.id : docId,
                      updated_at: docData.updated_at || new Date().toISOString()
                    });
                  } else {
                    // Local is newer in timestamp, perform granular field merge to not lose non-conflicting fields
                    docsToPut.push({
                      ...docData,
                      ...existing,
                      id: existing.id,
                      updated_at: existing.updated_at || new Date().toISOString()
                    });
                  }
                } else {
                  // New document
                  docsToPut.push({
                    ...docData,
                    id: docId,
                    updated_at: docData.updated_at || new Date().toISOString()
                  });
                }
              }
            }

            // Perform single atomic transaction in Dexie
            if (docsToDelete.length > 0 || docsToPut.length > 0) {
              await dexieDb.transaction('rw', dexieTable, async () => {
                if (docsToDelete.length > 0) {
                  await dexieTable.bulkDelete(docsToDelete);
                }
                if (docsToPut.length > 0) {
                  await dexieTable.bulkPut(docsToPut);
                }
              });
            }

            updateSyncStatus({ lastSyncedAt: new Date(), isSyncing: false });

            // Notify UI & multi-tabs immediately without requiring F5
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('smart_edu_data_updated', { detail: { tableName } }));
            }
            if (broadcastChannel) {
              try {
                broadcastChannel.postMessage({ type: 'DATA_MUTATION', tableName, timestamp: Date.now() });
              } catch (e) {}
            }
          } catch (err: any) {
            console.error(`[SyncService] Error processing snapshot batch for ${tableName}:`, err);
            updateSyncStatus({ syncErrors: currentSyncStatus.syncErrors + 1, isSyncing: false });
          } finally {
            // Give brief grace period to avoid echo loops
            setTimeout(() => {
              setRemoteSyncing(false);
            }, 100);
          }
        },
        (error) => {
          handleFirestoreError(error, `Listener ${tableName}`);
          updateSyncStatus({ syncErrors: currentSyncStatus.syncErrors + 1, isSyncing: false });
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
    } catch (e) {
      // ignore
    }
  });
  unsubscribers = [];

  if (typeof window !== 'undefined') {
    window.removeEventListener('online', () => updateSyncStatus({ isOnline: true }));
    window.removeEventListener('offline', () => updateSyncStatus({ isOnline: false }));
  }
}

// Pull an entire collection from Firestore into Dexie
export async function pullCollectionFromFirestore(tableName: TableName) {
  if (!firestoreDb) return;
  const colRef = collection(firestoreDb, tableName);
  const snap = await getDocs(colRef);
  if (snap.empty) return;

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

    for (const docSnap of snap.docs) {
      const docId = docSnap.id;
      const docData = docSnap.data();
      const existing = existingMap.get(docId);

      if (existing) {
        const localTime = new Date(existing.updated_at || existing.last_updated || 0).getTime();
        const remoteTime = new Date(docData.updated_at || docData.last_updated || 0).getTime();

        if (typeof existing.id === 'number' && typeof docId === 'string' && String(existing.id) === docId) {
          docsToDelete.push(existing.id);
        }

        if (remoteTime >= localTime) {
          docsToPut.push({
            ...existing,
            ...docData,
            id: typeof existing.id === 'number' ? existing.id : docId,
            updated_at: docData.updated_at || new Date().toISOString(),
          });
        } else {
          docsToPut.push({
            ...docData,
            ...existing,
            id: existing.id,
            updated_at: existing.updated_at || new Date().toISOString(),
          });
        }
      } else {
        docsToPut.push({
          ...docData,
          id: docId,
          updated_at: docData.updated_at || new Date().toISOString(),
        });
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
    }
  } finally {
    setTimeout(() => {
      setRemoteSyncing(false);
    }, 100);
  }
}

// Pull all collections from Firestore into Dexie
export async function pullAllFromFirestore() {
  if (!firestoreDb) return;
  updateSyncStatus({ isSyncing: true });

  try {
    for (const tableName of ALL_TABLES) {
      await pullCollectionFromFirestore(tableName);
    }
    updateSyncStatus({ lastSyncedAt: new Date(), isSyncing: false });

    // Broadcast instant update
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('smart_edu_data_updated', { detail: { all: true } }));
    }
    if (broadcastChannel) {
      try {
        broadcastChannel.postMessage({ type: 'DATA_MUTATION', all: true, timestamp: Date.now() });
      } catch (e) {}
    }
  } catch (err: any) {
    handleFirestoreError(err, 'pullAllFromFirestore');
    updateSyncStatus({ syncErrors: currentSyncStatus.syncErrors + 1, isSyncing: false });
  }
}

// Push all local records from Dexie to Firestore
export async function pushAllToFirestore() {
  if (!firestoreDb) return;
  updateSyncStatus({ isSyncing: true });

  try {
    for (const tableName of ALL_TABLES) {
      const dexieTable = (dexieDb as any)[tableName];
      if (!dexieTable) continue;

      const items = await dexieTable.toArray();
      if (items.length > 0) {
        await pushDocsBatchToFirestore(tableName, items);
      }
    }
    updateSyncStatus({ lastSyncedAt: new Date(), isSyncing: false });
  } catch (err: any) {
    handleFirestoreError(err, 'pushAllToFirestore');
    updateSyncStatus({ syncErrors: currentSyncStatus.syncErrors + 1, isSyncing: false });
  }
}

// Complete 2-way sync: Pull latest cloud updates, then push any local items
export async function syncAll() {
  if (!firestoreDb) return;
  updateSyncStatus({ isSyncing: true });

  try {
    await pullAllFromFirestore();
    await pushAllToFirestore();
    updateSyncStatus({ lastSyncedAt: new Date(), isSyncing: false });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('smart_edu_data_updated', { detail: { fullSync: true } }));
    }
  } catch (err: any) {
    handleFirestoreError(err, 'syncAll');
    updateSyncStatus({ syncErrors: currentSyncStatus.syncErrors + 1, isSyncing: false });
  }
}

// Force full sync: 2-way sync
export async function forceFullSync() {
  await syncAll();
}

// Clear all Firestore collections for real-world blank slate deployment
export async function clearFirestoreDatabase() {
  if (!firestoreDb) return;
  try {
    for (const tableName of ALL_TABLES) {
      if (tableName === 'knowledge_tags' || tableName === 'settings') continue;
      const colRef = collection(firestoreDb, tableName);
      const snap = await getDocs(colRef);
      for (const docSnapshot of snap.docs) {
        await deleteDoc(docSnapshot.ref);
      }
    }
  } catch (err: any) {
    handleFirestoreError(err, 'clearFirestoreDatabase');
  }
}

