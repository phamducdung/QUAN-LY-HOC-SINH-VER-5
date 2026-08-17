import { useState, useEffect, useCallback } from 'react';
import {
  subscribeSyncStatus,
  initRealtimeSync,
  syncAll,
  pullAllFromFirestore,
  pushAllToFirestore,
  getSyncStatus,
  SyncStatus
} from '../services/syncService';

export const useCloudSync = () => {
  const [status, setStatus] = useState<SyncStatus>(getSyncStatus());
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  useEffect(() => {
    // Start real-time sync listeners
    const stopSync = initRealtimeSync();

    // Subscribe to status updates
    const unsubscribeStatus = subscribeSyncStatus((newStatus) => {
      setStatus(newStatus);
    });

    return () => {
      unsubscribeStatus();
      stopSync();
    };
  }, []);

  const pushToCloud = useCallback(async () => {
    setSyncMessage('Đang tải dữ liệu lên Đám mây (Firebase)...');
    try {
      await pushAllToFirestore();
      setSyncMessage('Đã đồng bộ thành công lên Firestore!');
    } catch (e) {
      setSyncMessage('Đồng bộ thất bại, vui lòng kiểm tra kết nối mạng!');
    } finally {
      setTimeout(() => setSyncMessage(null), 3000);
    }
  }, []);

  const pullFromCloud = useCallback(async () => {
    setSyncMessage('Đang lấy dữ liệu mới nhất từ Đám mây...');
    try {
      await pullAllFromFirestore();
      setSyncMessage('Đã cập nhật dữ liệu mới nhất từ Đám mây!');
    } catch (e) {
      setSyncMessage('Lỗi khi tải dữ liệu từ Đám mây!');
    } finally {
      setTimeout(() => setSyncMessage(null), 3000);
    }
  }, []);

  const fullSync = useCallback(async () => {
    setSyncMessage('Đang đồng bộ 2 chiều với Đám mây...');
    try {
      await syncAll();
      setSyncMessage('Đã đồng bộ 2 chiều hoàn tất!');
    } catch (e) {
      setSyncMessage('Lỗi khi đồng bộ dữ liệu!');
    } finally {
      setTimeout(() => setSyncMessage(null), 3000);
    }
  }, []);

  return {
    isSyncing: status.isSyncing,
    isOnline: status.isOnline,
    lastSyncedAt: status.lastSyncedAt,
    syncErrors: status.syncErrors,
    syncStatus: syncMessage,
    pushToCloud,
    pullFromCloud,
    fullSync,
  };
};

