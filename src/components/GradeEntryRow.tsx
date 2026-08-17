import React, { memo, useState } from 'react';
import { Student, StudentSession, AttendanceStatus, Session } from '../types';
import { Sparkles, Loader2, Wand2 } from 'lucide-react';
import { generateSingleAIComment } from '../services/aiCommentService';

interface GradeEntryRowProps {
  student: Student;
  rowIndex: number;
  rec: StudentSession;
  isRowActive: boolean;
  selectedSession?: Session;
  classNameTitle?: string;
  gradeLevel?: number | string;
  classStudent?: { join_date?: string; leave_date?: string };
  onSelectRow: (rowIndex: number) => void;
  onFocusCell: (rowIndex: number, colIndex: number) => void;
  onKeyDown: (e: React.KeyboardEvent, rowIndex: number, colIndex: number) => void;
  onUpdateSession: (studentId: number, field: keyof StudentSession, value: any) => void;
  cellRefs: React.MutableRefObject<{ [key: string]: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null }>;
}

export const GradeEntryRow: React.FC<GradeEntryRowProps> = memo(({
  student,
  rowIndex,
  rec,
  isRowActive,
  selectedSession,
  classNameTitle = 'Lớp Toán THCS',
  gradeLevel = 9,
  classStudent,
  onSelectRow,
  onFocusCell,
  onKeyDown,
  onUpdateSession,
  cellRefs,
}) => {
  const isAbsent = rec.attendance.startsWith('absent');
  const [isCommentFocused, setIsCommentFocused] = useState(false);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);

  const handleGenerateSingleAiComment = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selectedSession || !student.id || isGeneratingAi) return;

    try {
      setIsGeneratingAi(true);
      const res = await generateSingleAIComment(
        selectedSession,
        classNameTitle,
        gradeLevel,
        student,
        rec
      );

      if (res.success && res.comment) {
        onUpdateSession(student.id, 'custom_comment', res.comment);
      } else {
        alert(res.error || 'Không thể tạo nhận xét AI. Vui lòng kiểm tra kết nối mạng.');
      }
    } catch (err: any) {
      alert(err.message || 'Lỗi phát sinh khi tạo nhận xét AI.');
    } finally {
      setIsGeneratingAi(false);
    }
  };

  // Lifecycle check
  const sessionDate = selectedSession?.session_date;
  const isBeforeJoin = classStudent?.join_date && sessionDate && sessionDate < classStudent.join_date;
  const isAfterLeave = classStudent?.leave_date && sessionDate && sessionDate > classStudent.leave_date;
  const isNotJoined = !!(isBeforeJoin || isAfterLeave);

  return (
    <tr
      onClick={() => onSelectRow(rowIndex)}
      className={`group transition-colors border-b border-slate-100 dark:border-slate-800/60 ${
        isNotJoined
          ? 'bg-slate-100/60 dark:bg-slate-800/30 opacity-75'
          : isRowActive
          ? 'bg-emerald-50/80 dark:bg-emerald-950/40 ring-1 ring-emerald-500/20'
          : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
      }`}
    >
      {/* STT */}
      <td className="py-2.5 px-3 text-center font-bold text-slate-400">
        {rowIndex + 1}
      </td>

      {/* Student Info */}
      <td className="py-2.5 px-4 font-bold text-slate-900 dark:text-slate-100">
        <div className="flex items-center gap-2">
          <span>{student.full_name}</span>
          {isBeforeJoin && (
            <span className="px-1.5 py-0.5 text-[9px] font-extrabold bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 rounded border border-slate-300 dark:border-slate-700" title={`Gia nhập ngày ${classStudent?.join_date}`}>
              ⚪ Gia nhập {classStudent?.join_date?.slice(5)}
            </span>
          )}
          {isAfterLeave && (
            <span className="px-1.5 py-0.5 text-[9px] font-extrabold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 rounded border border-rose-200 dark:border-rose-800" title={`Rút lớp ngày ${classStudent?.leave_date}`}>
              🔴 Đã rút {classStudent?.leave_date?.slice(5)}
            </span>
          )}
        </div>
        <div className="text-[10px] text-slate-400 font-normal mt-0.5">
          PH: {student.parent_name || 'N/A'}{student.parent_phone ? ` (${student.parent_phone})` : ''}
        </div>
      </td>

      {/* Attendance Col 0 */}
      <td className="py-2.5 px-3">
        {isNotJoined ? (
          <div className="px-2 py-1 bg-slate-200/70 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 rounded-xl text-center text-xs font-bold border border-slate-300/50 dark:border-slate-700">
            {isBeforeJoin ? 'Chưa gia nhập' : 'Đã rút lớp'}
          </div>
        ) : (
          <select
            ref={(el) => (cellRefs.current[`${rowIndex}-0`] = el)}
            value={rec.attendance}
            onFocus={() => onFocusCell(rowIndex, 0)}
            onKeyDown={(e) => onKeyDown(e, rowIndex, 0)}
            onChange={(e) =>
              onUpdateSession(student.id!, 'attendance', e.target.value as AttendanceStatus)
            }
            className={`w-full px-2.5 py-1.5 rounded-xl border text-xs font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer ${
              rec.attendance === 'present'
                ? 'bg-emerald-50 border-emerald-300 text-emerald-800 dark:bg-emerald-950/80 dark:border-emerald-700 dark:text-emerald-200'
                : rec.attendance === 'absent_excused'
                ? 'bg-amber-50 border-amber-300 text-amber-900 dark:bg-amber-950/80 dark:border-amber-700 dark:text-amber-200'
                : rec.attendance === 'absent_unexcused'
                ? 'bg-rose-50 border-rose-300 text-rose-900 dark:bg-rose-950/80 dark:border-rose-700 dark:text-rose-200 font-extrabold'
                : 'bg-sky-50 border-sky-300 text-sky-900 dark:bg-sky-950/80 dark:border-sky-700 dark:text-sky-200'
            }`}
          >
            <option value="present">Có mặt</option>
            <option value="absent_excused">Vắng (Có phép)</option>
            <option value="absent_unexcused">Vắng (KHÔNG PHÉP)</option>
            <option value="late">Đi muộn</option>
          </select>
        )}
      </td>

      {/* HW Score Col 1 */}
      {selectedSession?.has_homework !== false && (
        <td className="py-2.5 px-3 text-center">
          <div className="flex flex-col items-center gap-1.5">
            <input
              type="number"
              step="0.5"
              min="0"
              max="10"
              ref={(el) => (cellRefs.current[`${rowIndex}-1`] = el)}
              value={
                rec.exempt || rec.exempt_homework
                  ? ''
                  : rec.homework_submitted && !rec.late_submit && rec.homework_score !== undefined
                  ? rec.homework_score
                  : ''
              }
              placeholder={
                rec.exempt || rec.exempt_homework
                  ? 'Miễn BTVN'
                  : rec.late_submit
                  ? 'Nộp muộn'
                  : !rec.homework_submitted
                  ? 'Chưa làm'
                  : '0-10'
              }
              onFocus={() => onFocusCell(rowIndex, 1)}
              onKeyDown={(e) => onKeyDown(e, rowIndex, 1)}
              onChange={(e) => {
                const val = e.target.value === '' ? undefined : parseFloat(e.target.value);
                onUpdateSession(student.id!, 'homework_score', val);
                onUpdateSession(student.id!, 'homework_submitted', e.target.value !== '');
              }}
              disabled={isNotJoined || isAbsent || !!rec.late_submit || rec.exempt || rec.exempt_homework}
              className={`w-20 px-2 py-1.5 text-center font-num border rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-60 transition-all ${
                rec.exempt || rec.exempt_homework
                  ? 'bg-sky-50 border-sky-300 text-sky-800 dark:bg-sky-950/70 dark:border-sky-800 dark:text-sky-200 font-extrabold'
                  : rec.late_submit
                  ? 'bg-amber-50 border-amber-300 text-amber-900 dark:bg-amber-950/70 dark:border-amber-800 dark:text-amber-200'
                  : !rec.homework_submitted && !isAbsent
                  ? 'bg-rose-50 border-rose-300 text-rose-900 dark:bg-rose-950/70 dark:border-rose-800 dark:text-rose-200 font-bold'
                  : rec.homework_score !== undefined && rec.homework_score < 5 && !isAbsent
                  ? 'bg-amber-50 border-amber-300 text-amber-900 dark:bg-amber-950/70 dark:border-amber-800 dark:text-amber-200 font-bold'
                  : 'bg-white dark:bg-slate-800/90 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100'
              }`}
            />
            <div className="flex items-center gap-1.5 flex-wrap justify-center">
              <label className="flex items-center gap-1 text-[10px] font-extrabold text-sky-600 dark:text-sky-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={!!(rec.exempt || rec.exempt_homework)}
                  disabled={isAbsent}
                  onChange={(e) => {
                    const isExempt = e.target.checked;
                    onUpdateSession(student.id!, 'exempt_homework', isExempt);
                    if (isExempt) {
                      onUpdateSession(student.id!, 'homework_submitted', true);
                      onUpdateSession(student.id!, 'homework_score', undefined);
                      onUpdateSession(student.id!, 'late_submit', false);
                    }
                  }}
                  className="w-3 h-3 text-sky-600 border-slate-300 dark:border-slate-700 rounded focus:ring-sky-500"
                />
                <span>Miễn</span>
              </label>
              <label className="flex items-center gap-1 text-[10px] font-extrabold text-rose-600 dark:text-rose-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={!rec.homework_submitted && !(rec.exempt || rec.exempt_homework)}
                  disabled={isAbsent || !!(rec.exempt || rec.exempt_homework)}
                  onChange={(e) => {
                    const isNotSubmitted = e.target.checked;
                    onUpdateSession(student.id!, 'homework_submitted', !isNotSubmitted);
                    if (isNotSubmitted) {
                      onUpdateSession(student.id!, 'homework_score', 0);
                      onUpdateSession(student.id!, 'late_submit', false);
                    } else {
                      onUpdateSession(student.id!, 'homework_score', undefined);
                    }
                  }}
                  className="w-3 h-3 text-rose-600 border-slate-300 dark:border-slate-700 rounded focus:ring-rose-500"
                />
                <span>Chưa làm</span>
              </label>
              <label className="flex items-center gap-1 text-[10px] font-extrabold text-amber-600 dark:text-amber-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={!!rec.late_submit && !(rec.exempt || rec.exempt_homework)}
                  disabled={isAbsent || !!(rec.exempt || rec.exempt_homework)}
                  onChange={(e) => {
                    const isLate = e.target.checked;
                    onUpdateSession(student.id!, 'late_submit', isLate);
                    if (isLate) {
                      onUpdateSession(student.id!, 'homework_submitted', true);
                    }
                  }}
                  className="w-3 h-3 text-amber-600 border-slate-300 dark:border-slate-700 rounded focus:ring-amber-500"
                />
                <span>Muộn</span>
              </label>
            </div>
          </div>
        </td>
      )}

      {/* Test Score Col 2 */}
      {selectedSession?.has_test !== false && (
        <td className="py-2.5 px-3 text-center">
          <div className="flex flex-col items-center gap-1.5">
            <input
              type="number"
              step="0.5"
              min="0"
              max="10"
              ref={(el) => (cellRefs.current[`${rowIndex}-2`] = el)}
              value={
                rec.exempt || rec.exempt_test
                  ? ''
                  : rec.test_score !== undefined && rec.test_score !== null
                  ? rec.test_score
                  : ''
              }
              placeholder={
                isAbsent
                  ? '-'
                  : rec.exempt || rec.exempt_test
                  ? 'Miễn KT'
                  : 'Chờ nhập'
              }
              onFocus={() => onFocusCell(rowIndex, 2)}
              onKeyDown={(e) => onKeyDown(e, rowIndex, 2)}
              onChange={(e) => {
                const val = e.target.value === '' ? undefined : parseFloat(e.target.value);
                onUpdateSession(student.id!, 'test_score', val);
              }}
              disabled={isNotJoined || isAbsent || rec.exempt || rec.exempt_test}
              className={`w-20 px-2 py-1.5 text-center font-num border rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-60 transition-all ${
                rec.exempt || rec.exempt_test
                  ? 'bg-sky-50 border-sky-300 text-sky-800 dark:bg-sky-950/70 dark:border-sky-800 dark:text-sky-200 font-extrabold'
                  : rec.test_score !== undefined && rec.test_score !== null && rec.test_score < 5 && !isAbsent
                  ? 'bg-rose-50 border-rose-300 text-rose-900 dark:bg-rose-950/70 dark:border-rose-800 dark:text-rose-200 font-black'
                  : (rec.test_score === undefined || rec.test_score === null) && !isAbsent
                  ? 'bg-purple-50/90 border-purple-300 text-purple-900 dark:bg-purple-950/50 dark:border-purple-800 dark:text-purple-200 placeholder:text-purple-500 font-medium'
                  : 'bg-white dark:bg-slate-800/90 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100'
              }`}
            />
            <div className="flex items-center gap-1.5 flex-wrap justify-center">
              <label className="flex items-center gap-1 text-[10px] font-extrabold text-sky-600 dark:text-sky-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={!!(rec.exempt || rec.exempt_test)}
                  disabled={isAbsent}
                  onChange={(e) => {
                    const isExempt = e.target.checked;
                    onUpdateSession(student.id!, 'exempt_test', isExempt);
                    if (isExempt) {
                      onUpdateSession(student.id!, 'test_score', undefined);
                      onUpdateSession(student.id!, 'makeup_test', false);
                    }
                  }}
                  className="w-3 h-3 text-sky-600 border-slate-300 dark:border-slate-700 rounded focus:ring-sky-500"
                />
                <span>Miễn</span>
              </label>
              <label className="flex items-center gap-1 text-[10px] font-extrabold text-amber-600 dark:text-amber-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={!!rec.makeup_test && !(rec.exempt || rec.exempt_test)}
                  disabled={isAbsent || !!(rec.exempt || rec.exempt_test)}
                  onChange={(e) => {
                    const isMakeup = e.target.checked;
                    onUpdateSession(student.id!, 'makeup_test', isMakeup);
                  }}
                  className="w-3 h-3 text-amber-600 border-slate-300 dark:border-slate-700 rounded focus:ring-amber-500"
                />
                <span>Thi bù</span>
              </label>
            </div>
          </div>
        </td>
      )}

      {/* Custom Comment Col 3 */}
      <td className="py-2.5 px-4 relative">
        <div className="relative group/comment">
          <textarea
            rows={isCommentFocused ? 5 : 2}
            ref={(el) => (cellRefs.current[`${rowIndex}-3`] = el)}
            value={rec.custom_comment || ''}
            placeholder={"BTVN: \nBài KT: "}
            onFocus={() => {
              setIsCommentFocused(true);
              onFocusCell(rowIndex, 3);
            }}
            onBlur={() => setIsCommentFocused(false)}
            onKeyDown={(e) => onKeyDown(e, rowIndex, 3)}
            onChange={(e) => onUpdateSession(student.id!, 'custom_comment', e.target.value)}
            className={`w-full px-3 py-2 pr-8 border rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none transition-all duration-200 resize-none leading-relaxed ${
              isCommentFocused
                ? 'h-36 min-h-[140px] bg-white dark:bg-slate-900 border-emerald-500 ring-2 ring-emerald-500/20 shadow-xl z-30 relative'
                : 'h-14 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-none'
            }`}
          />
          {/* Quick AI Single Generate Button */}
          <button
            type="button"
            onClick={handleGenerateSingleAiComment}
            disabled={isGeneratingAi || isNotJoined}
            className={`absolute right-2 top-2 p-1.5 rounded-lg border transition-all shadow-xs ${
              isGeneratingAi
                ? 'bg-amber-100 dark:bg-amber-950/70 border-amber-300 text-amber-600'
                : 'bg-white/90 dark:bg-slate-800/90 border-slate-200 dark:border-slate-700 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/60 hover:border-emerald-300'
            } ${isCommentFocused ? 'z-40' : 'z-10'}`}
            title="Tạo nhận xét cá nhân hóa bằng Gemini AI"
          >
            {isGeneratingAi ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
          </button>

          {isCommentFocused && (
            <div className="absolute right-2.5 bottom-2.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50/90 dark:bg-emerald-950/90 backdrop-blur px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800 pointer-events-none z-40 shadow-sm animate-in fade-in duration-150">
              Enter: xuống dòng • Shift+Enter: học sinh tiếp
            </div>
          )}
        </div>
      </td>
    </tr>
  );
});

GradeEntryRow.displayName = 'GradeEntryRow';
