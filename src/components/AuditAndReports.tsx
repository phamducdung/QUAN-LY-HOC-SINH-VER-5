import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { AuditLog, Student } from '../types';
import { db } from '../db/dexie';
import { logAudit } from '../utils/auditLogger';
import { rollbackSessionSnapshot } from '../utils/gradeHistoryLogger';
import { sortStudentsByName } from '../utils/sortUtils';
import {
  FileSpreadsheet,
  Download,
  History,
  CheckCircle2,
  AlertCircle,
  Search,
  RefreshCw,
  RotateCcw,
  Clock,
  ArrowRight,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface AuditAndReportsProps {
  students: Student[];
  onRefresh: () => void;
}

export const AuditAndReports: React.FC<AuditAndReportsProps> = ({ students, onRefresh }) => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedLogIds, setExpandedLogIds] = useState<Record<string, boolean>>({});
  const [isRollbacking, setIsRollbacking] = useState(false);

  const fetchLogs = async () => {
    const res = await db.audit_logs.orderBy('timestamp').reverse().toArray();
    setLogs(res);
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const toggleExpand = (id: string) => {
    setExpandedLogIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleRollbackSnapshot = async (log: AuditLog) => {
    if (!log.id || !log.snapshot) return;

    const timeStr = new Date(log.timestamp).toLocaleString('vi-VN');
    const confirmMsg = `Bạn có chắc chắn muốn KHÔI PHỤC toàn bộ bảng điểm buổi học này về bản snapshot trước phiên lưu lúc ${timeStr} không?\n\nThao tác sẽ hoàn tác điểm số của học sinh và đồng bộ ngay lên Cloud.`;

    if (!window.confirm(confirmMsg)) return;

    try {
      setIsRollbacking(true);
      const res = await rollbackSessionSnapshot(log.id, 'Teacher');
      if (res.success) {
        setStatusMsg({ text: res.message, type: 'success' });
        await fetchLogs();
        onRefresh();
      } else {
        setStatusMsg({ text: res.message, type: 'error' });
      }
    } catch (err: any) {
      setStatusMsg({ text: `Lỗi khôi phục: ${err.message}`, type: 'error' });
    } finally {
      setIsRollbacking(false);
      setTimeout(() => setStatusMsg(null), 4000);
    }
  };

  const filteredLogs = logs.filter((log) => {
    if (searchTerm.trim() !== '') {
      const query = searchTerm.toLowerCase();
      const matchAction = (log.action_type || '').toLowerCase().includes(query);
      const matchDesc = (log.description || '').toLowerCase().includes(query);
      const matchRole = (log.user_role || '').toLowerCase().includes(query);
      const matchDiffStudent = (log.diffs || []).some(
        (d) =>
          d.student_name.toLowerCase().includes(query) ||
          d.field_label.toLowerCase().includes(query) ||
          (d.new_display || '').toLowerCase().includes(query) ||
          (d.old_display || '').toLowerCase().includes(query)
      );
      return matchAction || matchDesc || matchRole || matchDiffStudent;
    }
    return true;
  });

  // Export Full Student Roster to Excel
  const handleExportRosterExcel = async () => {
    const data = sortStudentsByName(students).map((s, idx) => ({
      'STT': idx + 1,
      'Họ và tên': s.full_name,
      'Giới tính': s.gender,
      'Phụ huynh': s.parent_name || '',
      'SĐT Phụ huynh': s.parent_phone || '',
      'Trạng thái': s.status === 'studying' ? 'Đang học' : s.status === 'paused' ? 'Tạm nghỉ' : 'Nghỉ hẳn',
      'Ghi chú': s.note || '',
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'DanhSachHocSinh');
    XLSX.writeFile(workbook, `Danh_Sach_Hoc_Sinh_Math_Center_${new Date().toISOString().split('T')[0]}.xlsx`);

    await logAudit('Teacher', 'Xuất Excel', 'Xuất tệp Excel danh sách toàn bộ học sinh');
    fetchLogs();

    setStatusMsg({ text: 'Xuất thành công tệp Excel Danh sách học sinh!', type: 'success' });
    setTimeout(() => setStatusMsg(null), 3000);
  };

  return (
    <div id="audit-reports-view" className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <History className="w-5 h-5 text-emerald-600" />
            <span>Nhật Ký Thao Tác (Audit Log) &amp; Lịch Sử Biến Động Điểm</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Lưu vết chi tiết người sửa, nội dung trước/sau khi sửa và hỗ trợ 1-click khôi phục bảng điểm về bản lưu cũ.
          </p>
        </div>

        <button
          onClick={fetchLogs}
          className="px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0"
          title="Làm mới Nhật ký"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Làm Mới</span>
        </button>
      </div>

      {statusMsg && (
        <div
          className={`p-3 border rounded-xl text-xs font-bold flex items-center gap-2 ${
            statusMsg.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800'
              : 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950 dark:text-rose-200 dark:border-rose-800'
          }`}
        >
          {statusMsg.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span>{statusMsg.text}</span>
        </div>
      )}

      {/* Action Card: Export */}
      <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm flex items-center justify-between">
        <div>
          <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Xuất Danh Sách Học Sinh (Excel)</span>
          </h4>
          <p className="text-[11px] text-slate-500 mt-1">
            Xuất tệp .xlsx chứa thông tin liên hệ và phụ huynh của toàn bộ {students.length} học sinh để in ấn, lưu trữ.
          </p>
        </div>
        <button
          onClick={handleExportRosterExcel}
          className="px-3.5 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-all flex items-center gap-1.5 shrink-0 ml-3 shadow-sm shadow-emerald-600/20"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Tải Excel</span>
        </button>
      </div>

      {/* Main Audit Log Table Card */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        {/* Search bar */}
        <div className="flex items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm nhật ký nhanh theo tên học sinh, loại hành động, nội dung thay đổi..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
            />
          </div>
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="text-xs font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            >
              Xóa tìm
            </button>
          )}
        </div>

        {/* Logs List & Visual Diffs (Scrollable Container) */}
        <div className="space-y-3 max-h-[560px] overflow-y-auto pr-1.5 scrollbar-thin">
          {filteredLogs.length === 0 ? (
            <div className="py-12 text-center text-slate-400 space-y-2 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
              <History className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 stroke-[1.5]" />
              <p className="text-xs font-semibold">Chưa có nhật ký hoạt động nào phù hợp.</p>
            </div>
          ) : (
            filteredLogs.map((log) => {
              const logId = log.id || `log_${log.timestamp}`;
              const isExpanded = expandedLogIds[logId] ?? false;
              const hasDiffs = log.diffs && log.diffs.length > 0;
              const hasSnapshot = !!log.snapshot && Array.isArray(log.snapshot.records);

              return (
                <div
                  key={logId}
                  className={`rounded-xl border transition-all overflow-hidden ${
                    log.is_rollback
                      ? 'bg-amber-50/40 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800'
                      : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700/80 shadow-xs'
                  }`}
                >
                  {/* Log Header Row */}
                  <div className="p-3.5 flex flex-wrap items-center justify-between gap-2.5 bg-slate-50/60 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-700/50">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                          log.user_role === 'Teacher'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
                            : 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300 border border-sky-300 dark:border-sky-700'
                        }`}
                      >
                        {log.user_role === 'Teacher' ? '👨‍🏫 Giáo viên' : '🧑‍💻 Trợ giảng'}
                      </span>

                      <span className="font-bold text-xs text-slate-800 dark:text-slate-200">
                        {log.action_type}
                      </span>

                      <div className="flex items-center gap-1 text-[11px] text-slate-400 font-mono">
                        <Clock className="w-3.5 h-3.5" />
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
                          <span>Khôi Phục Snapshot</span>
                        </button>
                      )}

                      {hasDiffs && (
                        <button
                          type="button"
                          onClick={() => toggleExpand(logId)}
                          className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 text-xs font-bold flex items-center gap-1"
                        >
                          <span>{hasDiffs ? `${log.diffs!.length} thay đổi` : ''}</span>
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Log description */}
                  <div className="px-3.5 py-2.5 text-xs text-slate-700 dark:text-slate-300 font-medium leading-relaxed">
                    {log.description}
                  </div>

                  {/* Diffs List (Visual Diff) */}
                  {hasDiffs && isExpanded && (
                    <div className="px-3.5 pb-3.5 pt-1 space-y-2 border-t border-slate-100 dark:border-slate-700/50 bg-slate-50/30 dark:bg-slate-900/30">
                      <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                        Chi tiết Before / After từng học sinh:
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {log.diffs!.map((diff, dIdx) => (
                          <div
                            key={`diff_${dIdx}`}
                            className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs flex flex-col justify-between gap-1 shadow-xs"
                          >
                            <div className="min-w-0">
                              <div className="font-bold text-slate-900 dark:text-slate-100 truncate">
                                {diff.student_name}
                              </div>
                              <div className="text-[11px] text-slate-500 font-semibold mt-0.5">
                                {diff.field_label}:
                              </div>

                              <div className="mt-1 flex items-center gap-1.5 flex-wrap">
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
      </div>
    </div>
  );
};

