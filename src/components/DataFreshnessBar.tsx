import React, { useState } from 'react';
import { HardDrive, Clock, CheckCircle2, CloudLightning, RefreshCw, Radio, CloudDownload } from 'lucide-react';
import { useCloudSync } from '../hooks/useCloudSync';

interface DataFreshnessBarProps {
  isSyncing?: boolean;
  syncStatus?: string | null;
  onPullFromCloud?: () => Promise<void> | void;
  onInspectCloud?: () => void;
  totalCount?: number;
  entityName?: string;
}

export const DataFreshnessBar: React.FC<DataFreshnessBarProps> = ({
  totalCount,
  entityName = 'bản ghi',
  onInspectCloud,
}) => {
  const { isOnline, isSyncing, lastSyncedAt, fullSync } = useCloudSync();
  const [isQuickSyncing, setIsQuickSyncing] = useState(false);

  const handleQuickSync = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      setIsQuickSyncing(true);
      await fullSync();
    } finally {
      setIsQuickSyncing(false);
    }
  };

  return (
    <div className="bg-white/90 dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800 p-2.5 px-3.5 rounded-xl shadow-2xs flex flex-wrap items-center justify-between gap-3 text-xs">
      <div className="flex items-center gap-2.5 flex-wrap">
        {/* Status Badge */}
        <button
          type="button"
          onClick={onInspectCloud}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/80 dark:hover:bg-emerald-900/80 text-emerald-700 dark:text-emerald-300 font-bold text-[11px] border border-emerald-200/80 dark:border-emerald-800/80 shadow-2xs transition-colors cursor-pointer"
          title="Bấm để mở Trung tâm Đồng bộ Realtime"
        >
          <Radio className="w-3 h-3 text-emerald-600 dark:text-emerald-400 animate-pulse" />
          <span>Realtime Sync: {isOnline ? 'Online 100%' : 'Offline (Đang lưu cục bộ)'}</span>
        </button>

        {/* Timestamp */}
        <div className="text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1 text-[11px]">
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          <span>
            Đồng bộ đám mây: <strong className="text-slate-800 dark:text-slate-200 font-num">
              {lastSyncedAt ? new Date(lastSyncedAt).toLocaleTimeString('vi-VN') : 'Tự động'}
            </strong>
          </span>
        </div>

        {/* Count string if available */}
        {typeof totalCount === 'number' && (
          <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-lg border border-slate-200/50 dark:border-slate-700/50">
            Hiện có: <strong className="font-num text-slate-800 dark:text-slate-200">{totalCount}</strong> {entityName}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleQuickSync}
          disabled={isSyncing || isQuickSyncing}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] transition-colors cursor-pointer disabled:opacity-50"
          title="Đồng bộ tức thời 2 chiều giữa máy và Firebase mà không cần tải lại trang"
        >
          <RefreshCw className={`w-3 h-3 ${isSyncing || isQuickSyncing ? 'animate-spin' : ''}`} />
          <span>{isSyncing || isQuickSyncing ? 'Đang đồng bộ...' : 'Đồng bộ Ngay'}</span>
        </button>

        <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-semibold text-[11px]">
          {isSyncing || isQuickSyncing ? (
            <span>Đang truyền dữ liệu...</span>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4" />
              <span>Sẵn sàng mọi thiết bị</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
