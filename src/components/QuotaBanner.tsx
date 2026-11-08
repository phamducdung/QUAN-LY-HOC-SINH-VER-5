import React, { useState, useEffect } from 'react';
import { ExternalLink, RefreshCw, X, ShieldAlert } from 'lucide-react';
import { subscribeQuotaStatus, firebaseConfig } from '../firebase';
import { reconnectAndSyncCloud, getSyncStatus } from '../services/syncService';

export const QuotaBanner: React.FC = () => {
  const [isExceeded, setIsExceeded] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const unsub = subscribeQuotaStatus((exceeded) => {
      setIsExceeded(exceeded);
      setPendingCount(getSyncStatus().pendingOutboxCount);
      if (exceeded) {
        setIsDismissed(false);
      }
    });
    return unsub;
  }, []);

  if (!isExceeded || isDismissed) {
    return null;
  }

  const upgradeUrl = `https://console.firebase.google.com/project/${firebaseConfig.projectId}/firestore/databases/${firebaseConfig.firestoreDatabaseId}/data?openUpgradeDialog=true`;

  const handleReconnect = async () => {
    setIsReconnecting(true);
    try {
      await reconnectAndSyncCloud();
    } finally {
      setIsReconnecting(false);
    }
  };

  return (
    <div
      id="quota-exceeded-banner"
      className="bg-amber-50 dark:bg-amber-950/90 border-b border-amber-300 dark:border-amber-700/80 px-4 py-3 text-amber-950 dark:text-amber-100 shadow-xs z-50 transition-all"
    >
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-start gap-2.5">
          <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-sm text-amber-900 dark:text-amber-200">
              Chế độ Bảo vệ Hạn mức Firestore (Circuit Breaker Active)
            </p>
            <p className="text-amber-800 dark:text-amber-300/90 mt-0.5 leading-relaxed">
              Hạn mức ghi miễn phí trong ngày của gói Spark đã đạt giới hạn (sẽ tự động reset vào ngày mới). Ứng dụng đã ngắt retry ngầm để tránh lỗi và chuyển sang <strong>Hàng đợi Outbox cục bộ ({pendingCount} thay đổi chờ đẩy)</strong>. Mọi thao tác của thầy/cô vẫn lưu an toàn 100%.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
          <button
            type="button"
            onClick={handleReconnect}
            disabled={isReconnecting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs shadow-xs transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isReconnecting ? 'animate-spin' : ''}`} />
            <span>{isReconnecting ? 'Đang kiểm tra...' : 'Thử kết nối lại Cloud'}</span>
          </button>
          <a
            id="btn-upgrade-quota"
            href={upgradeUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-xs shadow-xs transition-colors whitespace-nowrap shrink-0"
          >
            <span>Kiểm tra Quota</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <button
            id="btn-dismiss-quota-banner"
            onClick={() => setIsDismissed(true)}
            className="p-1.5 hover:bg-amber-200/60 dark:hover:bg-amber-900/60 rounded-lg text-amber-800 dark:text-amber-300 transition-colors cursor-pointer"
            title="Tạm ẩn thông báo"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
