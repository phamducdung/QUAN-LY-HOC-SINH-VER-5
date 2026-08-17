import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { AuditLog, Student, UserRole } from '../types';
import { db } from '../db/dexie';
import { logAudit } from '../utils/auditLogger';
import { sortStudentsByName } from '../utils/sortUtils';
import {
  FileSpreadsheet,
  Download,
  Database,
  History,
  CheckCircle2,
  Search,
  Trash2,
  RefreshCw,
  PlusCircle,
  X,
} from 'lucide-react';

interface AuditAndReportsProps {
  students: Student[];
  onRefresh: () => void;
}

export const AuditAndReports: React.FC<AuditAndReportsProps> = ({ students, onRefresh }) => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Filters
  const [roleFilter, setRoleFilter] = useState<'All' | 'Teacher' | 'TA'>('All');
  const [searchTerm, setSearchTerm] = useState('');

  // Custom Log Modal
  const [isAddLogOpen, setIsAddLogOpen] = useState(false);
  const [customRole, setCustomRole] = useState<UserRole>('Teacher');
  const [customAction, setCustomAction] = useState('Ghi chú thủ công');
  const [customDesc, setCustomDesc] = useState('');

  const fetchLogs = async () => {
    const res = await db.audit_logs.orderBy('timestamp').reverse().toArray();
    setLogs(res);
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const filteredLogs = logs.filter((log) => {
    if (roleFilter !== 'All' && log.user_role !== roleFilter) return false;
    if (searchTerm.trim() !== '') {
      const query = searchTerm.toLowerCase();
      return (
        log.action_type.toLowerCase().includes(query) ||
        log.description.toLowerCase().includes(query)
      );
    }
    return true;
  });

  // Export Full Student Roster to Excel
  const handleExportRosterExcel = async () => {
    const data = sortStudentsByName(students).map((s, idx) => ({
      'STT': idx + 1,
      'Họ và tên': s.full_name,
      'Giới tính': s.gender,
      'Phụ huynh': s.parent_name,
      'SĐT Phụ huynh': s.parent_phone,
      'Trạng thái': s.status === 'studying' ? 'Đang học' : s.status === 'paused' ? 'Tạm nghỉ' : 'Nghỉ hẳn',
      'Ghi chú': s.note || '',
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'DanhSachHocSinh');
    XLSX.writeFile(workbook, `Danh_Sach_Hoc_Sinh_Math_Center_${new Date().toISOString().split('T')[0]}.xlsx`);

    await logAudit('Teacher', 'Xuất Excel', 'Xuất tệp Excel danh sách toàn bộ học sinh');
    fetchLogs();

    setStatusMsg('Xuất thành công tệp Excel Danh sách học sinh!');
    setTimeout(() => setStatusMsg(null), 3000);
  };

  // Full Database JSON Backup
  const handleExportJsonBackup = async () => {
    const backupData = {
      school_years: await db.school_years.toArray(),
      classes: await db.classes.toArray(),
      students: await db.students.toArray(),
      class_students: await db.class_students.toArray(),
      sessions: await db.sessions.toArray(),
      student_sessions: await db.student_sessions.toArray(),
      knowledge_tags: await db.knowledge_tags.toArray(),
      warnings: await db.warnings.toArray(),
      audit_logs: await db.audit_logs.toArray(),
      settings: await db.settings.toArray(),
      exported_at: new Date().toISOString(),
    };

    const jsonString = JSON.stringify(backupData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SmartEdu_Backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();

    await logAudit('Teacher', 'Sao lưu hệ thống', 'Tải bản sao lưu JSON toàn bộ cơ sở dữ liệu IndexedDB');
    fetchLogs();

    setStatusMsg('Đã tải xuống bản Sao lưu JSON thành công!');
    setTimeout(() => setStatusMsg(null), 3000);
  };

  // Add Custom Log Entry
  const handleCreateCustomLog = async () => {
    if (!customDesc.trim()) return;
    await logAudit(customRole, customAction, customDesc);
    setCustomDesc('');
    setIsAddLogOpen(false);
    fetchLogs();
  };

  // Clear All Logs
  const handleClearLogs = async () => {
    if (window.confirm('Bạn có chắc chắn muốn xóa toàn bộ nhật ký Audit Log? Hành động này không thể hoàn tác.')) {
      await db.audit_logs.clear();
      await logAudit('Teacher', 'Xóa nhật ký', 'Đã dọn dẹp sạch nhật ký thao tác cũ');
      fetchLogs();
    }
  };

  return (
    <div id="audit-reports-view" className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <History className="w-5 h-5 text-emerald-600" />
            <span>Nhật Ký Thao Tác (Audit Log) & Báo Cáo Hệ Thống</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Ghi nhận thời gian, tài khoản Giáo viên / Trợ giảng TA và lịch sử các thao tác (Thêm điểm, Xóa lớp, Giải quyết cảnh báo).
          </p>
        </div>

        <button
          onClick={() => setIsAddLogOpen(true)}
          className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-600/20 flex items-center gap-1.5 shrink-0"
        >
          <PlusCircle className="w-4 h-4" />
          <span>Tạo Ghi Nhớ Thủ Công</span>
        </button>
      </div>

      {statusMsg && (
        <div className="p-3 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>{statusMsg}</span>
        </div>
      )}

      {/* Action Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Excel Export */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300 flex items-center justify-center font-bold">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Xuất Danh Sách Học Sinh Ra Excel
              </h3>
              <p className="text-xs text-slate-500">Định dạng .xlsx tiêu chuẩn cho nhà trường</p>
            </div>
          </div>

          <button
            onClick={handleExportRosterExcel}
            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-sm"
          >
            <Download className="w-4 h-4" />
            <span>Xuất Tệp Excel Ngay</span>
          </button>
        </div>

        {/* Database JSON Backup */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-950/80 dark:text-sky-300 flex items-center justify-center font-bold">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Sao Lưu Toàn Bộ Cơ Sở Dữ Liệu (JSON)
              </h3>
              <p className="text-xs text-slate-500">Bao gồm Lớp, Điểm số, Cảnh báo & Nhật ký</p>
            </div>
          </div>

          <button
            onClick={handleExportJsonBackup}
            className="w-full py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-sm"
          >
            <Download className="w-4 h-4" />
            <span>Tải Xuống Bản JSON Backup</span>
          </button>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-5 space-y-4">
        {/* Table Toolbar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Tìm loại hành động, học sinh..."
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none"
              />
            </div>

            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as any)}
              className="text-xs font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-1.5 rounded-xl outline-none"
            >
              <option value="All">Tất cả Vai trò</option>
              <option value="Teacher">Giáo viên chính</option>
              <option value="TA">Trợ giảng (TA)</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchLogs}
              className="p-2 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-bold transition-all"
              title="Làm mới Nhật ký"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            <button
              onClick={handleClearLogs}
              className="px-3 py-1.5 bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800 rounded-xl text-xs font-bold transition-all hover:bg-rose-100 flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Xóa Nhật Ký</span>
            </button>
          </div>
        </div>

        {/* Table Body */}
        <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 text-[11px] font-bold uppercase border-b border-slate-200 dark:border-slate-700">
                <th className="p-3 w-40">Thời Gian</th>
                <th className="p-3 w-32">Tài Khoản / Role</th>
                <th className="p-3 w-44">Loại Hành Động</th>
                <th className="p-3">Mô Tả Chi Tiết Hoạt Động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-slate-400">
                    Chưa có nhật ký hoạt động nào phù hợp.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="p-3 text-slate-400 font-mono text-[11px]">
                      {new Date(log.timestamp).toLocaleString('vi-VN')}
                    </td>
                    <td className="p-3 font-bold">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] ${
                          log.user_role === 'Teacher'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300'
                        }`}
                      >
                        {log.user_role === 'Teacher' ? 'Giáo viên chính' : 'Trợ giảng (TA)'}
                      </span>
                    </td>
                    <td className="p-3 font-bold text-slate-800 dark:text-slate-200">
                      {log.action_type}
                    </td>
                    <td className="p-3 text-slate-600 dark:text-slate-300 leading-relaxed">
                      {log.description}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE MANUAL LOG MODAL */}
      {isAddLogOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Thêm Ghi Nhớ Thủ Công Vào Nhật Ký
              </h3>
              <button onClick={() => setIsAddLogOpen(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Tài Khoản Thực Hiện:
                </label>
                <select
                  value={customRole}
                  onChange={(e) => setCustomRole(e.target.value as UserRole)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2.5 rounded-xl outline-none font-bold"
                >
                  <option value="Teacher">Giáo viên chính</option>
                  <option value="TA">Trợ giảng (TA)</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Tên Hành Động:
                </label>
                <input
                  type="text"
                  value={customAction}
                  onChange={(e) => setCustomAction(e.target.value)}
                  placeholder="VD: Kiểm tra bài tập về nhà"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2.5 rounded-xl outline-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Mô Tả Chi Tiết Nội Dung:
                </label>
                <textarea
                  rows={3}
                  value={customDesc}
                  onChange={(e) => setCustomDesc(e.target.value)}
                  placeholder="VD: Đã hoàn tất kiểm tra vở bài tập và ghi nhận phản hồi từ phụ huynh..."
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2.5 rounded-xl outline-none"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
                <button
                  onClick={() => setIsAddLogOpen(false)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold"
                >
                  Hủy
                </button>
                <button
                  onClick={handleCreateCustomLog}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700"
                >
                  Ghi Nhớ
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
