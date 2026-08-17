export interface SyncActivity {
  id: string;
  tableName: string;
  action: 'push_create' | 'push_update' | 'push_delete' | 'pull_batch' | 'push_batch' | 'verify';
  description: string;
  timestamp: string;
  status: 'success' | 'pending' | 'error';
}

const STORAGE_KEY = 'smart_edu_sync_activities';
const listeners: Array<(activities: SyncActivity[]) => void> = [];

export function getSyncActivities(): SyncActivity[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function logSyncActivity(activity: Omit<SyncActivity, 'id' | 'timestamp'>) {
  try {
    const current = getSyncActivities();
    const newEntry: SyncActivity = {
      ...activity,
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
    };

    const updated = [newEntry, ...current].slice(0, 35);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    listeners.forEach((fn) => fn(updated));
  } catch (e) {
    console.warn('Failed to log sync activity:', e);
  }
}

export function subscribeSyncActivities(callback: (activities: SyncActivity[]) => void) {
  listeners.push(callback);
  callback(getSyncActivities());
  return () => {
    const idx = listeners.indexOf(callback);
    if (idx !== -1) listeners.splice(idx, 1);
  };
}

export function clearSyncActivities() {
  localStorage.removeItem(STORAGE_KEY);
  listeners.forEach((fn) => fn([]));
}
