import React, { useState } from 'react';
import {
  HardDrive,
  Database,
  Layers,
  ShieldCheck,
  Sparkles,
  X,
  CheckCircle2,
  Cloud,
  CloudLightning,
  CloudDownload,
  CloudUpload,
  RefreshCw,
  Wifi,
  WifiOff,
  AlertTriangle,
  Radio,
  ArrowUpRight,
} from 'lucide-react';
import { db } from '../db/dexie';
import { useLiveQuery } from 'dexie-react-hooks';
import { useCloudSync } from '../hooks/useCloudSync';

interface CloudSyncStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CloudSyncStatusModal: React.FC<CloudSyncStatusModalProps> = ({ isOpen, onClose }) => {
  const { isSyncing, isOnline, lastSyncedAt, syncErrors, syncStatus, pushToCloud, pullFromCloud, fullSync } = useCloudSync();
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

  const handleFullSync = async () => {
    try {
      setIsManualSyncing(true);
      setActionMessage('Đang đồng bộ 2 chiều toàn diện...');
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
      setActionMessage('Đang kéo dữ liệu mới nhất từ Đám mây...');
      await pullFromCloud();
      setActionMessage('Đã cập nhật dữ liệu từ Đám mây về máy!');
    } finally {
      setIsManualSyncing(false);
      setTimeout(() => setActionMessage(null), 3500);
    }
  };

  const handlePushOnly = async () => {
    try {
      setIsManualSyncing(true);
      setActionMessage('Đang tải dữ liệu máy lên Đám mây...');
      await pushToCloud();
      setActionMessage('Đã tải dữ liệu lên Đám mây thành công!');
    } finally {
      setIsManualSyncing(false);
      setTimeout(() => setActionMessage(null), 3500);
    }
  };

  const tableList = [
    { name: 'classes', label: 'Lớp học', icon: '🏫', count: classesCount },
    { name: 'students', label: 'Học sinh', icon: '👨‍🎓', count: studentsCount },
    { name: 'class_students', label: 'Phân lớp', icon: '🔗', count: classStudentsCount },
    { name: 'sessions', label: 'Buổi học', icon: '📅', count: sessionsCount },
    { name: 'student_sessions', label: 'Điểm & Điểm danh', icon: '📝', count: studentSessionsCount },
    { name: 'warnings', label: 'Cảnh báo học tập', icon: '⚠️', count: warningsCount },
    { name: 'knowledge_tags', label: 'Chuyên đề kiến thức', icon: '🏷️', count: knowledgeTagsCount },
    { name: 'knowledge_results', label: 'Độ thành thạo', icon: '🎯', count: knowledgeResultsCount },
    { name: 'school_years', label: 'Năm học', icon: '📆', count: schoolYearsCount },
    { name: 'settings', label: 'Cấu hình hệ thống', icon: '⚙️', count: settingsCount },
    { name: 'ai_diagnoses', label: 'Chẩn đoán AI', icon: '🤖', count: aiDiagnosesCount },
    { name: 'audit_logs', label: 'Nhật ký thao tác', icon: '📜', count: auditLogsCount },
  ];

  const totalRecords = tableList.reduce((acc, t) => acc + t.count, 0);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-600/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <CloudLightning className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                Trung Tâm Đồng Bộ Realtime Đa Thiết Bị
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-extrabold flex items-center gap-1">
                  <Radio className="w-2.5 h-2.5 animate-pulse text-emerald-600" />
                  Live Sync
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Mô hình Offline-First: Lưu tức thời trên máy & Tự động đồng bộ 2 chiều lên Firebase Firestore.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Realtime Status Banner */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-sky-500/10 border border-emerald-500/20 flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${isOnline ? 'bg-emerald-500 animate-ping' : 'bg-rose-500'}`} />
                <div>
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    {isOnline ? (
                      <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
                        <Wifi className="w-3.5 h-3.5" /> Kết nối Đám mây Trực tuyến (Online)
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-amber-700 dark:text-amber-300">
                        <WifiOff className="w-3.5 h-3.5" /> Chế độ Ngoại tuyến (Offline-First)
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {lastSyncedAt
                      ? `Lần đồng bộ gần nhất: ${new Date(lastSyncedAt).toLocaleTimeString('vi-VN')}`
                      : 'Đang duy trì kết nối WebSocket thời gian thực'}
                  </p>
                </div>
              </div>

              <div className="flex items-center flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleFullSync}
                  disabled={isManualSyncing || isSyncing}
                  className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  title="Đồng bộ 2 chiều: Lấy dữ liệu mới nhất về máy và đẩy dữ liệu cục bộ lên Đám mây"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isManualSyncing || isSyncing ? 'animate-spin' : ''}`} />
                  <span>{isManualSyncing || isSyncing ? 'Đang đồng bộ...' : 'Đồng bộ 2 Chiều'}</span>
                </button>
                <button
                  type="button"
                  onClick={handlePullOnly}
                  disabled={isManualSyncing || isSyncing}
                  className="px-3 py-1.5 rounded-xl bg-sky-100 dark:bg-sky-900/60 hover:bg-sky-200 dark:hover:bg-sky-800 text-sky-800 dark:text-sky-200 text-xs font-semibold transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  title="Tải toàn bộ dữ liệu mới nhất từ Firestore về máy"
                >
                  <CloudDownload className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                  <span>Kéo về</span>
                </button>
                <button
                  type="button"
                  onClick={handlePushOnly}
                  disabled={isManualSyncing || isSyncing}
                  className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  title="Tải toàn bộ dữ liệu trên máy lên Firestore"
                >
                  <CloudUpload className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
                  <span>Đẩy lên</span>
                </button>
              </div>
            </div>

            {(actionMessage || syncStatus) && (
              <div className="text-xs font-medium px-3 py-1.5 rounded-lg bg-emerald-100/70 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5 animate-fadeIn">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                <span>{actionMessage || syncStatus}</span>
              </div>
            )}
          </div>

          {/* Summary Box */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/50">
              <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 text-xs font-bold mb-1">
                <Database className="w-4 h-4" />
                <span>Tổng bản ghi cục bộ (IndexedDB)</span>
              </div>
              <p className="text-2xl font-black text-emerald-700 dark:text-emerald-300">{totalRecords.toLocaleString()} <span className="text-xs font-medium text-emerald-600">bản ghi</span></p>
            </div>

            <div className="p-4 rounded-2xl bg-sky-50/60 dark:bg-sky-950/30 border border-sky-100 dark:border-sky-900/50">
              <div className="flex items-center gap-2 text-sky-800 dark:text-sky-300 text-xs font-bold mb-1">
                <ShieldCheck className="w-4 h-4" />
                <span>Cơ chế Xung đột (Conflict Resolution)</span>
              </div>
              <p className="text-sm font-bold text-sky-800 dark:text-sky-300 mt-1 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Last-Write-Wins (LWW) an toàn 100%
              </p>
            </div>
          </div>

          {/* Tables breakdown */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
              <Layers className="w-3.5 h-3.5" />
              Bản ghi các bảng dữ liệu đồng bộ
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {tableList.map((t) => (
                <div
                  key={t.name}
                  className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-800 flex items-center justify-between"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-base">{t.icon}</span>
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-200">{t.label}</span>
                  </div>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-num">
                    {t.count}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex justify-end bg-slate-50/50 dark:bg-slate-800/50">
          <button
            onClick={onClose}
            className="px-5 py-2 text-xs font-bold text-white bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-xl transition-colors cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
