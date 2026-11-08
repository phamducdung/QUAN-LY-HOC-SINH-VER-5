import { useState, useEffect, useCallback } from 'react';
import {
  subscribeSyncStatus,
  initRealtimeSync,
  syncAll,
  pullAllFromFirestore,
  pushAllToFirestore,
  kaizenDeduplicateAndMerge,
  reconnectAndSyncCloud,
  getSyncStatus,
  SyncStatus,
} from '../services/syncService';

export const useCloudSync = () => {
  const [status, setStatus] = useState<SyncStatus>(getSyncStatus());
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  useEffect(() => {
    const stopSync = initRealtimeSync();

    const unsubscribeStatus = subscribeSyncStatus((newStatus) => {
      setStatus(newStatus);
    });

    return () => {
      unsubscribeStatus();
      stopSync();
    };
  }, []);

  const pushToCloud = useCallback(async () => {
    setSyncMessage('Đang đẩy các bản ghi thay đổi (Dirty-Diff) lên Cloud...');
    try {
      await pushAllToFirestore();
      setSyncMessage('Đã đồng bộ các thay đổi lên Firestore thành công!');
    } catch (e) {
      setSyncMessage('Đồng bộ thất bại, dữ liệu đã được lưu vào Hàng đợi Outbox!');
    } finally {
      setTimeout(() => setSyncMessage(null), 3500);
    }
  }, []);

  const pullFromCloud = useCallback(async () => {
    setSyncMessage('Đang đối soát Tombstone & kéo dữ liệu mới nhất từ Cloud...');
    try {
      await pullAllFromFirestore();
      setSyncMessage('Đã đối soát & cập nhật dữ liệu mới nhất từ Cloud!');
    } catch (e) {
      setSyncMessage('Lỗi khi tải dữ liệu từ Đám mây!');
    } finally {
      setTimeout(() => setSyncMessage(null), 3500);
    }
  }, []);

  const fullSync = useCallback(async () => {
    setSyncMessage('Đang đồng bộ 2 chiều (Tombstone + Kaizen Merge)...');
    try {
      await syncAll();
      setSyncMessage('Đã đồng bộ 2 chiều và chuẩn hóa dữ liệu hoàn tất!');
    } catch (e) {
      setSyncMessage('Lỗi khi đồng bộ dữ liệu!');
    } finally {
      setTimeout(() => setSyncMessage(null), 3500);
    }
  }, []);

  const runKaizen = useCallback(async () => {
    setSyncMessage('Đang chạy Kaizen chuẩn hóa khóa định danh & gộp bản ghi trùng...');
    try {
      const report = await kaizenDeduplicateAndMerge();
      setSyncMessage(
        report.deletedDuplicates > 0 || report.mergedRecords > 0
          ? `Kaizen hoàn tất: Đã gộp ${report.mergedRecords} bản ghi & xóa ${report.deletedDuplicates} bản sao dư thừa!`
          : 'Kaizen hoàn tất: Cơ sở dữ liệu sạch 100%, không có bản ghi trùng lặp!'
      );
      return report;
    } catch (e) {
      setSyncMessage('Lỗi khi chạy Kaizen chuẩn hóa CSDL!');
      return null;
    } finally {
      setTimeout(() => setSyncMessage(null), 4500);
    }
  }, []);

  const reconnectCloud = useCallback(async () => {
    setSyncMessage('Đang kiểm tra hạn mức Quota & kết nối lại Cloud...');
    try {
      const ok = await reconnectAndSyncCloud();
      if (ok) {
        setSyncMessage('Đã kết nối lại Cloud thành công & đẩy toàn bộ Outbox!');
      } else {
        setSyncMessage('Hạn mức miễn phí trong ngày vẫn đang chờ reset. Dữ liệu an toàn 100% ở Outbox.');
      }
      return ok;
    } catch (e) {
      setSyncMessage('Chưa thể kết nối lại Cloud, đang giữ chế độ bảo vệ Quota.');
      return false;
    } finally {
      setTimeout(() => setSyncMessage(null), 4000);
    }
  }, []);

  return {
    isSyncing: status.isSyncing,
    isOnline: status.isOnline,
    lastSyncedAt: status.lastSyncedAt,
    syncErrors: status.syncErrors,
    quotaExceeded: status.quotaExceeded,
    pendingOutboxCount: status.pendingOutboxCount,
    lastKaizenSummary: status.lastKaizenSummary,
    syncStatus: syncMessage,
    pushToCloud,
    pullFromCloud,
    fullSync,
    runKaizen,
    reconnectCloud,
  };
};
