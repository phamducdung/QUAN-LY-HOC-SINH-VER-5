import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/dexie';
import { AuditLog } from '../../types';
import { rollbackSessionSnapshot } from '../../utils/gradeHistoryLogger';
import {
  History,
  RotateCcw,
  X,
  Clock,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface SessionHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId?: string | number;
  sessionTitle?: string;
  classId?: string | number;
  classNameTitle?: string;
  onRollbackComplete?: () => void;
}

const EMPTY_LOGS: AuditLog[] = [];

export const SessionHistoryModal: React.FC<SessionHistoryModalProps> = ({
  isOpen,
  onClose,
  sessionId,
  sessionTitle,
  classId,
  classNameTitle,
  onRollbackComplete,
}) => {
  const [searchStudent, setSearchStudent] = useState('');
  const [selectedFieldFilter, setSelectedFieldFilter] = useState<string>('all');
  const [expandedLogIds, setExpandedLogIds] = useState<Record<string, boolean>>({});
  const [isRollbacking, setIsRollbacking] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Query audit logs related to this session or class
  const auditLogs = useLiveQuery(async () => {
    if (!sessionId && !classId) return EMPTY_LOGS;

    try {
      const allLogs = await db.audit_logs.toArray();
      const filtered = allLogs.filter((log) => {
        if (sessionId && String(log.session_id) === String(sessionId)) return true;
        if (classId && String(log.class_id) === String(classId)) return true;
        return false;
      });
      return filtered.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
    } catch (err) {
      console.warn('Error querying audit logs:', err);
      return EMPTY_LOGS;
    }
  }, [sessionId, classId]) ?? EMPTY_LOGS;

  if (!isOpen) return null;

  const toggleExpand = (logId: string) => {
    setExpandedLogIds((prev) => ({
      ...prev,
      [logId]: !prev[logId],
    }));
  };

  const handleRollbackSnapshot = async (log: AuditLog) => {
    if (!log.id || !log.snapshot) return;

    const timeStr = new Date(log.timestamp).toLocaleString('vi-VN');
    const confirmMsg = `Bạn có chắc chắn muốn KHÔI PHỤC toàn bộ bảng điểm buổi học này về bản lưu lúc ${timeStr} của (${log.user_role === 'Teacher' ? 'Giáo viên' : 'Trợ giảng'}) không?\n\nThao tác này sẽ cập nhật lại điểm số của tất cả học sinh và đồng bộ ngay lên Cloud.`;

    if (!window.confirm(confirmMsg)) return;

    try {
      setIsRollbacking(true);
      const res = await rollbackSessionSnapshot(log.id, 'Teacher');
      if (res.success) {
        setStatusMessage({ text: res.message, type: 'success' });
        if (onRollbackComplete) onRollbackComplete();
      } else {
        setStatusMessage({ text: res.message, type: 'error' });
      }
    } catch (err: any) {
      setStatusMessage({ text: `Lỗi khôi phục: ${err.message}`, type: 'error' });
    } finally {
      setIsRollbacking(false);
      setTimeout(() => setStatusMessage(null), 4000);
    }
  };

  // Filter logs & diffs
  const filteredLogs = auditLogs.filter((log) => {
    if (!log.diffs || log.diffs.length === 0) {
      // General logs
      if (selectedFieldFilter !== 'all') return false;
      if (searchStudent) {
        return log.description.toLowerCase().includes(searchStudent.toLowerCase());
      }
      return true;
    }

    return log.diffs.some((d) => {
      const matchName = !searchStudent || d.student_name.toLowerCase().includes(searchStudent.toLowerCase());
      const matchField = selectedFieldFilter === 'all' || d.field === selectedFieldFilter;
      return matchName && matchField;
    });
  });

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in-50 zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/40 dark:to-teal-950/40 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <span>Nhật Ký Sửa Điểm &amp; Lịch Sử Biến Động</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                  {auditLogs.length} Bản ghi
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Buổi học: <b className="text-slate-700 dark:text-slate-200">{sessionTitle || 'Hiện tại'}</b> • Lớp: <b className="text-slate-700 dark:text-slate-200">{classNameTitle || 'N/A'}</b>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-white/80 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Toast */}
        {statusMessage && (
          <div
            className={`px-4 py-2.5 text-xs font-bold flex items-center gap-2 border-b ${
              statusMessage.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800'
                : 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950 dark:text-rose-200 dark:border-rose-800'
            }`}
          >
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* Filter bar */}
        <div className="p-3.5 bg-slate-50/70 dark:bg-slate-900/70 border-b border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center gap-2.5">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchStudent}
              onChange={(e) => setSearchStudent(e.target.value)}
              placeholder="Tìm theo tên học sinh..."
              className="w-full pl-8 pr-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div className="flex items-center gap-1 text-xs">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedFieldFilter}
              onChange={(e) => setSelectedFieldFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer"
            >
              <option value="all">Tất cả thay đổi</option>
              <option value="test_score">Chỉ Điểm Kiểm tra</option>
              <option value="homework_score">Chỉ Điểm BTVN</option>
              <option value="attendance">Chỉ Điểm danh</option>
              <option value="custom_comment">Chỉ Nhận xét</option>
            </select>
          </div>
        </div>

        {/* Logs List */}
        <div className="p-4 overflow-y-auto space-y-3.5 max-h-[60vh]">
          {filteredLogs.length === 0 ? (
            <div className="py-12 text-center text-slate-400 space-y-2">
              <History className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 stroke-[1.5]" />
              <p className="text-xs font-semibold">Chưa có nhật ký sửa điểm nào cho buổi học này</p>
              <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                Mọi thao tác sửa đổi điểm số, BTVN và điểm danh sẽ được hệ thống tự động ghi vết và lưu bản chụp snapshot tại đây.
              </p>
            </div>
          ) : (
            filteredLogs.map((log) => {
              const logId = log.id || `log_${log.timestamp}`;
              const isExpanded = expandedLogIds[logId] ?? true; // expanded by default
              const hasDiffs = log.diffs && log.diffs.length > 0;
              const hasSnapshot = !!log.snapshot && Array.isArray(log.snapshot.records);

              const matchingDiffs = (log.diffs || []).filter((d) => {
                const matchName = !searchStudent || d.student_name.toLowerCase().includes(searchStudent.toLowerCase());
                const matchField = selectedFieldFilter === 'all' || d.field === selectedFieldFilter;
                return matchName && matchField;
              });

              return (
                <div
                  key={logId}
                  className={`rounded-xl border transition-all overflow-hidden ${
                    log.is_rollback
                      ? 'bg-amber-50/40 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800'
                      : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700/80 shadow-xs'
                  }`}
                >
                  {/* Log Header */}
                  <div className="p-3.5 flex flex-wrap items-center justify-between gap-2.5 border-b border-slate-100 dark:border-slate-700/50 bg-slate-50/50 dark:bg-slate-800/50">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                          log.user_role === 'Teacher'
                            ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border border-purple-300 dark:border-purple-700'
                            : 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300 border border-sky-300 dark:border-sky-700'
                        }`}
                      >
                        {log.user_role === 'Teacher' ? '👨‍🏫 Giáo viên' : '🧑‍💻 Trợ giảng TA'}
                      </span>

                      <div className="flex items-center gap-1.5 text-xs text-slate-500 font-mono">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span>{new Date(log.timestamp).toLocaleString('vi-VN')}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {hasSnapshot && (
                        <button
                          type="button"
                          disabled={isRollbacking}
                          onClick={() => handleRollbackSnapshot(log)}
                          className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] transition-all flex items-center gap-1.5 shadow-xs shrink-0"
                          title="Khôi phục toàn bộ bảng điểm về trạng thái trước phiên lưu này"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Khôi Phục Bản Này</span>
                        </button>
                      )}

                      {hasDiffs && (
                        <button
                          type="button"
                          onClick={() => toggleExpand(logId)}
                          className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Log description */}
                  <div className="px-3.5 py-2 text-xs text-slate-700 dark:text-slate-300 font-medium">
                    {log.description}
                  </div>

                  {/* Diffs List (Visual Diff) */}
                  {hasDiffs && isExpanded && (
                    <div className="px-3.5 pb-3 pt-1 space-y-1.5">
                      <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1">
                        <span>Chi tiết biến động ({matchingDiffs.length} thay đổi)</span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {matchingDiffs.map((diff, dIdx) => (
                          <div
                            key={`diff_${dIdx}`}
                            className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/80 text-xs flex flex-col justify-between gap-1"
                          >
                            <div className="min-w-0">
                              <div className="font-bold text-slate-900 dark:text-slate-100 truncate">
                                {diff.student_name}
                              </div>
                              <div className="text-[11px] text-slate-500 font-semibold mt-0.5">
                                {diff.field_label}:
                              </div>

                              <div className="mt-1 flex items-center gap-1.5 font-num flex-wrap">
                                <span className="px-1.5 py-0.2 rounded bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 line-through text-[11px] font-bold">
                                  {diff.old_display}
                                </span>
                                <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
                                <span className="px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-extrabold text-[11px]">
                                  {diff.new_display}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Tự động lưu vết đa thiết bị &amp; đồng bộ Cloud Firestore</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 font-bold transition-colors"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};

