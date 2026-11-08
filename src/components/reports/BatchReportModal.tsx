import React, { useState } from 'react';
import { ClassItem, Session, Student, StudentSession, KnowledgeTag, Warning } from '../../types';
import { exportGradebookMatrixToExcel, ExportMatrixOptions } from '../../utils/excelMatrixExporter';
import {
  FileSpreadsheet,
  Download,
  X,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Calendar,
  Loader2,
  Table,
} from 'lucide-react';

interface BatchReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentClass: ClassItem;
  sessions: Session[];
  selectedSession?: Session;
  students: Student[];
  studentSessions: StudentSession[];
  currentSessionStudentMap?: Record<string | number, StudentSession | Partial<StudentSession>>;
  knowledgeTags?: KnowledgeTag[];
  warnings?: Warning[];
  classStudents?: { student_id?: string | number; class_id?: string | number; join_date?: string; leave_date?: string }[];
}

export const BatchReportModal: React.FC<BatchReportModalProps> = ({
  isOpen,
  onClose,
  currentClass,
  sessions,
  selectedSession,
  students,
  studentSessions,
  classStudents = [],
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Excel Configuration state
  const [excelScope, setExcelScope] = useState<'full_cycle' | 'single_session'>('full_cycle');
  const [targetSessionId, setTargetSessionId] = useState<string | number>(
    selectedSession?.id || (sessions.length > 0 ? sessions[0].id! : '')
  );
  const [excelIncludeComments, setExcelIncludeComments] = useState(true);
  const [excelIncludePhone, setExcelIncludePhone] = useState(true);

  if (!isOpen) return null;

  const currentActiveSession = sessions.find((s) => s.id === targetSessionId) || selectedSession || sessions[0];

  // Trigger Excel Matrix Export
  const handleExportExcel = async () => {
    try {
      setIsGenerating(true);
      const options: ExportMatrixOptions = {
        exportScope: excelScope,
        selectedSessionId: targetSessionId,
        includeComments: excelIncludeComments,
        includeParentPhone: excelIncludePhone,
      };

      await exportGradebookMatrixToExcel(
        currentClass,
        sessions,
        students,
        studentSessions,
        classStudents,
        options
      );

      setStatusMsg({
        text: 'Đã xuất thành công Ma Trận Sổ Điểm toàn diện ra file Excel (.xlsx)!',
        type: 'success',
      });
    } catch (err: any) {
      setStatusMsg({ text: `Lỗi xuất Excel: ${err.message || 'Không xác định'}`, type: 'error' });
    } finally {
      setIsGenerating(false);
      setTimeout(() => setStatusMsg(null), 4000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in-50 zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white flex items-center justify-between shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-xs flex items-center justify-center border border-white/30 shadow-xs">
              <Table className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-base font-extrabold flex items-center gap-2">
                <span>Xuất Ma Trận Sổ Điểm Excel</span>
              </h3>
              <p className="text-xs text-emerald-100 mt-0.5">
                Lớp: <b>{currentClass.class_name}</b> • Sĩ số: <b>{students.length}</b> học sinh • <b>{sessions.length}</b> buổi học
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/20 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Notification Toast */}
        {statusMsg && (
          <div
            className={`px-5 py-2.5 text-xs font-bold flex items-center gap-2 border-b ${
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

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-4 max-h-[60vh]">
          <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl space-y-1">
            <h4 className="text-xs font-bold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-emerald-600" />
              <span>Ma Trận Sổ Điểm Chuẩn Sư Phạm:</span>
            </h4>
            <p className="text-[11px] text-emerald-800 dark:text-emerald-300 leading-relaxed">
              Bảng tính Excel xuất ra chứa đầy đủ các buổi học theo chiều ngang, tự động trừ các bài Miễn / Vắng có phép ra khỏi mẫu số, tính đúng phạt 0đ với Vắng không phép, và tổng kết điểm TB BTVN (30%) + Điểm TB KT (70%) → Điểm TB Chu kỳ &amp; Xếp loại.
            </p>
          </div>

          {/* Excel scope options */}
          <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              Phạm Vi Xuất Ma Trận Sổ Điểm:
            </label>
            <div className="space-y-2 text-xs">
              <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-800 dark:text-slate-200">
                <input
                  type="radio"
                  name="excel_scope"
                  checked={excelScope === 'full_cycle'}
                  onChange={() => setExcelScope('full_cycle')}
                  className="text-emerald-600 focus:ring-emerald-500"
                />
                <span>Toàn bộ chu kỳ ({sessions.length} buổi học đã diễn ra)</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-800 dark:text-slate-200">
                <input
                  type="radio"
                  name="excel_scope"
                  checked={excelScope === 'single_session'}
                  onChange={() => setExcelScope('single_session')}
                  className="text-emerald-600 focus:ring-emerald-500"
                />
                <span>Chỉ xuất buổi học được chọn ({currentActiveSession?.lesson_title || 'Buổi hiện tại'})</span>
              </label>
            </div>
          </div>

          {/* Session selector if single session */}
          {excelScope === 'single_session' && (
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                <span>Chọn Buổi Học Cần Xuất Excel:</span>
              </label>
              <select
                value={targetSessionId}
                onChange={(e) => setTargetSessionId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {sessions.map((sess, idx) => (
                  <option key={sess.id || idx} value={sess.id}>
                    Buổi {idx + 1}: {sess.lesson_title} ({sess.session_date})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Extra Excel options */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center gap-2.5 cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={excelIncludePhone}
                onChange={(e) => setExcelIncludePhone(e.target.checked)}
                className="rounded text-emerald-600 focus:ring-emerald-500"
              />
              <span>Kèm cột Số Điện Thoại Phụ Huynh</span>
            </label>

            <label className="p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center gap-2.5 cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={excelIncludeComments}
                onChange={(e) => setExcelIncludeComments(e.target.checked)}
                className="rounded text-emerald-600 focus:ring-emerald-500"
              />
              <span>Kèm cột Nhận Xét Từng Buổi Học</span>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-bold transition-colors"
          >
            Đóng
          </button>

          <button
            onClick={handleExportExcel}
            disabled={isGenerating}
            className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs font-extrabold shadow-lg shadow-emerald-600/25 flex items-center gap-2 transition-all disabled:opacity-50"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Đang Tạo File Excel...</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>Xuất Ma Trận Sổ Điểm (.xlsx)</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
