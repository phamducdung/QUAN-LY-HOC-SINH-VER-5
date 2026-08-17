// Local offline utilities - Firestore synchronization removed as per user request

export interface FirestoreQuotaStats {
  reads: number;
  writes: number;
  deletes: number;
  date: string;
}

export const FIRESTORE_FREE_LIMITS = {
  reads: 50000,
  writes: 20000,
  deletes: 20000,
};

export const safeSetDoc = async (_docRef: any, _data: any, _options?: any) => {
  return;
};

export const safeDeleteDoc = async (_docRef: any) => {
  return;
};

export const safeAddDoc = async (_colRef: any, _data: any) => {
  return { id: `local_${Date.now()}` };
};

export const safeBatchCommit = async (_batch: any) => {
  return;
};

export const recordDeletionTombstone = async (_tableName: string, _id: string | number, _studentId?: string | number) => {
  return;
};

export const trackFirestoreUsage = (_type: 'reads' | 'writes' | 'deletes', _count = 1) => {
  return;
};

export const getFirestoreUsage = (): FirestoreQuotaStats => {
  return {
    reads: 0,
    writes: 0,
    deletes: 0,
    date: new Date().toISOString().split('T')[0],
  };
};

export const resetFirestoreUsageCounter = () => {
  return;
};

export const isQuotaExceeded = (): boolean => {
  return false;
};

export const resetQuotaLock = async () => {
  return;
};

export const markQuotaExceeded = () => {
  return;
};

export const isQuotaError = (_error: any): boolean => {
  return false;
};

export const isCloudSyncEnabled = (): boolean => {
  return false;
};
