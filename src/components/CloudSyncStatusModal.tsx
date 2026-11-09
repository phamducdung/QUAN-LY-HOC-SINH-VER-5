import React, { useState } from 'react';
import {
  Database,
  Layers,
  ShieldCheck,
  Sparkles,
  X,
  CheckCircle2,
  CloudLightning,
  CloudDownload,
  CloudUpload,
  RefreshCw,
  Wifi,
  WifiOff,
  AlertTriangle,
} from 'lucide-react';
import { db } from '../db/dexie';
import { useLiveQuery } from 'dexie-react-hooks';
import { useCloudSync } from '../hooks/useCloudSync';
import { getIsQuotaExceeded } from '../firebase';
import { SUPABASE_SETUP_SQL } from '../lib/supabase';
import { getSupabaseSyncState } from '../services/syncService';

interface CloudSyncStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CloudSyncStatusModal: React.FC<CloudSyncStatusModalProps> = ({ isOpen, onClose }) => {
  const {
    isSyncing,
    isOnline,
    lastSyncedAt,
    pendingOutboxCount,
    lastKaizenSummary,
    syncStatus,
    pushToCloud,
    pullFromCloud,
    fullSync,
    runKaizen,
    reconnectCloud,
  } = useCloudSync();

  const [isManualSyncing, setIsManualSyncing] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Live queries for local counts
  const classesCount = useLiveQuery(() => db.classes.count()) ?? 0;
  const studentsCount = useLiveQuery(() => db.students.count()) ?? 0;
  const classStudentsCount = useLiveQuery(() => db.class_students.count()) ?? 0;
  const sessionsCount = useLiveQuery(() => db.sessions.count()) ?? 0;
  const studentSessionsCount = useLiveQuery(() => db.student_sessions.count()) ?? 0;
  const warningsCount = useLiveQuery(() => db.warnings.count()) ?? 0;
  const knowledgeTagsCount = useLiveQuery(() => db.knowledge_tags.count()) ?? 0;
  const knowledgeResultsCount = useLiveQuery(() => db.knowledge_results.count()) ?? 0;
  const settingsCount = useLiveQuery(() => db.settings.count()) ?? 0;
  const schoolYearsCount = useLiveQuery(() => db.school_years.count()) ?? 0;
  const aiDiagnosesCount = useLiveQuery(() => db.ai_diagnoses.count()) ?? 0;
  const auditLogsCount = useLiveQuery(() => db.audit_logs.count()) ?? 0;

  if (!isOpen) return null;

  const { supabaseReady, supabaseNeedsSchemaSetup } = getSupabaseSyncState();
  const quotaExceeded = supabaseReady === true ? false : getIsQuotaExceeded();

  const handleCopySupabaseSql = async () => {
    try {
      await navigator.clipboard.writeText(SUPABASE_SETUP_SQL);
      setActionMessage(
        'Đã sao chép mã SQL tạo 13 bảng! Hãy dán vào mục SQL Editor trên Supabase rồi bấm Run.'
      );
      setTimeout(() => setActionMessage(null), 5000);
    } catch (e) {
      setActionMessage('Vui lòng sao chép đoạn mã SQL trong khung bên dưới.');
    }
  };

  const handleFullSync = async () => {
    try {
      setIsManualSyncing(true);
      setActionMessage('Đang đối soát Tombstone, gộp trùng lặp & đồng bộ 2 chiều...');
      await fullSync();
      setActionMessage('Đồng bộ 2 chiều hoàn tất! Mọi thay đổi đã được cập nhật.');
    } finally {
      setIsManualSyncing(false);
      setTimeout(() => setActionMessage(null), 3500);
    }
  };

  const handlePullOnly = async () => {
    try {
      setIsManualSyncing(true);
      setActionMessage('Đang đối soát xóa (Tombstone) & kéo dữ liệu từ Cloud...');
      await pullFromCloud();
      setActionMessage('Đã đối soát & cập nhật dữ liệu từ Cloud về máy!');
    } finally {
      setIsManualSyncing(false);
      setTimeout(() => setActionMessage(null), 3500);
    }
  };

  const handlePushOnly = async () => {
    try {
      setIsManualSyncing(true);
      setActionMessage('Đang lọc bản ghi thay đổi (Dirty-Diff) & đẩy lên Cloud...');
      await pushToCloud();
      setActionMessage('Đã đẩy các thay đổi lên Cloud thành công!');
    } finally {
      setIsManualSyncing(false);
      setTimeout(() => setActionMessage(null), 3500);
    }
  };

  const handleKaizenClean = async () => {
    try {
      setIsManualSyncing(true);
      setActionMessage('Đang quét khóa định danh & hợp nhất các bản ghi trùng lặp...');
      const report = await runKaizen();
      if (report) {
        setActionMessage(
          report.deletedDuplicates > 0 || report.mergedRecords > 0
            ? `Kaizen hoàn tất: Đã hợp nhất ${report.mergedRecords} bản ghi & dọn sạch ${report.deletedDuplicates} bản sao trùng lặp!`
            : 'Cơ sở dữ liệu đã đạt chuẩn Kaizen 100% (0 bản ghi trùng lặp).'
        );
      }
    } finally {
      setIsManualSyncing(false);
      setTimeout(() => setActionMessage(null), 4500);
    }
  };

  const handleReconnect = async () => {
    try {
      setIsManualSyncing(true);
      setActionMessage('Đang kiểm tra kết nối Supabase & Cloud SQL...');
      const ok = await reconnectCloud();
      setActionMessage(
        ok
          ? 'Đã kết nối cơ sở dữ liệu Cloud & đẩy hàng đợi Outbox thành công!'
          : 'Đang giữ an toàn dữ liệu qua Outbox.'
      );
    } finally {
      setIsManualSyncing(false);
      setTimeout(() => setActionMessage(null), 4000);
    }
  };

  const tableList = [
    { name: 'classes', label: 'Lớp học', count: classesCount },
    { name: 'students', label: 'Học sinh', count: studentsCount },
    { name: 'class_students', label: 'Phân lớp (Khóa cs_)', count: classStudentsCount },
    { name: 'sessions', label: 'Buổi học', count: sessionsCount },
    { name: 'student_sessions', label: 'Điểm & Điểm danh (Khóa ss_)', count: studentSessionsCount },
    { name: 'warnings', label: 'Cảnh báo học tập', count: warningsCount },
    { name: 'knowledge_tags', label: 'Chuyên đề kiến thức', count: knowledgeTagsCount },
    { name: 'knowledge_results', label: 'Độ thành thạo (Khóa kr_)', count: knowledgeResultsCount },
    { name: 'school_years', label: 'Năm học (Khóa sy_)', count: schoolYearsCount },
    { name: 'settings', label: 'Cấu hình (system_settings)', count: settingsCount },
    { name: 'ai_diagnoses', label: 'Chẩn đoán AI', count: aiDiagnosesCount },
    { name: 'audit_logs', label: 'Nhật ký thao tác', count: auditLogsCount },
  ];

  const totalRecords = tableList.reduce((acc, t) => acc + t.count, 0);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-xl overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/60 dark:bg-slate-800/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <CloudLightning className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Trung Tâm Đồng Bộ Supabase PostgreSQL & Kaizen CSDL
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Đồng bộ không giới hạn lượt ghi trên cả Vercel & AI Studio · Khóa định danh tất định
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Supabase Quick SQL Initialization Banner if tables are not created yet */}
          {supabaseNeedsSchemaSetup && (
            <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 space-y-2.5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="text-xs font-bold text-amber-900 dark:text-amber-200">
                    Bước cuối: Khởi tạo 13 bảng dữ liệu trên Supabase (Chỉ làm 1 lần)
                  </h4>
                  <p className="text-[11px] text-amber-800 dark:text-amber-300 mt-0.5">
                    Đã kết nối thành công tới <strong>duupbswparlpzsdcgcme.supabase.co</strong>. Nhấn nút sao chép mã SQL bên dưới, dán vào mục <strong>SQL Editor</strong> của Supabase và bấm <strong>Run</strong>.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCopySupabaseSql}
                  className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shrink-0 cursor-pointer"
                >
                  Sao chép mã SQL
                </button>
              </div>
            </div>
          )}

          {/* Status & Action Toolbar */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  {supabaseReady ? (
                    <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300">
                      <Wifi className="w-4 h-4" />
                      Đã kết nối Supabase PostgreSQL (Không giới hạn lượt ghi)
                    </span>
                  ) : quotaExceeded ? (
                    <span className="flex items-center gap-1.5 text-amber-700 dark:text-amber-300">
                      <AlertTriangle className="w-4 h-4" />
                      Chế độ Bảo vệ Hạn mức (Đã ngắt retry ngầm · Lưu qua Outbox)
                    </span>
                  ) : isOnline ? (
                    <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300">
                      <Wifi className="w-4 h-4" />
                      Kết nối Cloud-First Trực tuyến
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-amber-700 dark:text-amber-300">
                      <WifiOff className="w-4 h-4" />
                      Ngoại tuyến (Đang xếp hàng đợi Outbox)
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
                  {lastSyncedAt
                    ? `Lần đồng bộ gần nhất: ${new Date(lastSyncedAt).toLocaleTimeString('vi-VN')}`
                    : 'Tự động gom nhóm thay đổi (Debounce 600ms) & chỉ đẩy bản ghi có thay đổi'}
                </p>
              </div>

              <div className="flex items-center flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleCopySupabaseSql}
                  className="px-3 py-1.5 rounded-lg bg-indigo-100 dark:bg-indigo-900/60 hover:bg-indigo-200 text-indigo-800 dark:text-indigo-200 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  Copy SQL tạo bảng Supabase
                </button>
                <button
                  type="button"
                  onClick={handleFullSync}
                  disabled={isManualSyncing || isSyncing}
                  className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isManualSyncing || isSyncing ? 'animate-spin' : ''}`} />
                  <span>{isManualSyncing || isSyncing ? 'Đang xử lý...' : 'Đồng bộ 2 Chiều'}</span>
                </button>
                <button
                  type="button"
                  onClick={handlePullOnly}
                  disabled={isManualSyncing || isSyncing}
                  className="px-3 py-1.5 rounded-lg bg-sky-100 dark:bg-sky-900/60 hover:bg-sky-200 dark:hover:bg-sky-800 text-sky-800 dark:text-sky-200 text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
                >
                  <CloudDownload className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                  <span>Kéo về</span>
                </button>
                <button
                  type="button"
                  onClick={handlePushOnly}
                  disabled={isManualSyncing || isSyncing}
                  className="px-3 py-1.5 rounded-lg bg-slate-200/80 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
                >
                  <CloudUpload className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
                  <span>Đẩy lên</span>
                </button>
              </div>
            </div>

            {(actionMessage || syncStatus || lastKaizenSummary) && (
              <div className="text-xs font-medium px-3 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>{actionMessage || syncStatus || lastKaizenSummary}</span>
                </div>
              </div>
            )}
          </div>

          {/* Kaizen Database Deduplication Action Card */}
          <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-emerald-600" />
                <span>Chuẩn hóa Khóa Định Danh & Gộp Dữ Liệu Trùng (Kaizen DB)</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Tự động gộp các bản ghi Điểm buổi học, Phân lớp, Năm học và Cài đặt bị trùng UUID, giữ lại bản mới nhất.
              </p>
            </div>
            <button
              type="button"
              onClick={handleKaizenClean}
              disabled={isManualSyncing || isSyncing}
              className="px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              Chạy Kaizen Chuẩn Hóa
            </button>
          </div>

          {/* Summary Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 text-xs font-semibold mb-1">
                <Database className="w-3.5 h-3.5 text-emerald-600" />
                <span>Tổng bản ghi (IndexedDB)</span>
              </div>
              <p className="text-xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                {totalRecords.toLocaleString()}{' '}
                <span className="text-xs font-normal text-slate-500">bản ghi</span>
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 text-xs font-semibold mb-1">
                <CloudUpload className="w-3.5 h-3.5 text-sky-600" />
                <span>Hàng đợi Outbox chờ đẩy</span>
              </div>
              <p className="text-xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                {pendingOutboxCount.toLocaleString()}{' '}
                <span className="text-xs font-normal text-slate-500">thao tác</span>
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 text-xs font-semibold mb-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>Đối soát Xóa & Xung đột</span>
              </div>
              <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400 mt-1.5">
                Tombstone + Dirty-Diff LWW
              </p>
            </div>
          </div>

          {/* Tables breakdown */}
          <div>
            <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-2.5 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5" />
              <span>Chi tiết số lượng bản ghi theo bảng dữ liệu</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {tableList.map((t) => (
                <div
                  key={t.name}
                  className="px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200/80 dark:border-slate-800 flex items-center justify-between"
                >
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
                    {t.label}
                  </span>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-mono tabular-nums">
                    {t.count}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex justify-end bg-slate-50/60 dark:bg-slate-800/40">
          <button
            onClick={onClose}
            className="px-5 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-xl transition-colors cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
