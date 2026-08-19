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
  showPrevTestColumn?: boolean;
  prevSession?: Session | null;
  prevRec?: Partial<StudentSession> | null;
  onSelectRow: (rowIndex: number) => void;
  onFocusCell: (rowIndex: number, colIndex: number) => void;
  onKeyDown: (e: React.KeyboardEvent, rowIndex: number, colIndex: number) => void;
  onUpdateSession: (studentId: number, field: keyof StudentSession, value: any) => void;
  onUpdatePrevSession?: (studentId: number, field: keyof StudentSession, value: any) => void;
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
  showPrevTestColumn = false,
  prevSession,
  prevRec,
  onSelectRow,
  onFocusCell,
  onKeyDown,
  onUpdateSession,
  onUpdatePrevSession,
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
      <td className="py-2 px-1.5 text-center font-bold text-slate-400 w-9 min-w-[36px] text-xs">
        {rowIndex + 1}
      </td>

      {/* Student Info */}
      <td className="py-2 px-2.5 font-bold text-slate-900 dark:text-slate-100 w-40 min-w-[145px] max-w-[170px]">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-bold truncate max-w-[150px]" title={student.full_name}>{student.full_name}</span>
          {isBeforeJoin && (
            <span className="px-1 py-0.2 text-[8.5px] font-extrabold bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 rounded border border-slate-300 dark:border-slate-700 whitespace-nowrap" title={`Gia nhập ngày ${classStudent?.join_date}`}>
              ⚪ Vào {classStudent?.join_date?.slice(5)}
            </span>
          )}
          {isAfterLeave && (
            <span className="px-1 py-0.2 text-[8.5px] font-extrabold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 rounded border border-rose-200 dark:border-rose-800 whitespace-nowrap" title={`Rút lớp ngày ${classStudent?.leave_date}`}>
              🔴 Rút {classStudent?.leave_date?.slice(5)}
            </span>
          )}
        </div>
        <div className="text-[9.5px] text-slate-400 font-normal mt-0.5 truncate" title={`PH: ${student.parent_name || 'N/A'}${student.parent_phone ? ` (${student.parent_phone})` : ''}`}>
          PH: {student.parent_name || 'N/A'}
        </div>
      </td>

      {/* Attendance Col 0 */}
      <td className="py-2 px-1.5 w-28 min-w-[105px]">
        {isNotJoined ? (
          <div className="px-1.5 py-1 bg-slate-200/70 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 rounded-lg text-center text-[10.5px] font-bold border border-slate-300/50 dark:border-slate-700">
            {isBeforeJoin ? 'Chưa vào' : 'Đã rút'}
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
            className={`w-full px-1.5 py-1 rounded-lg border text-[11px] font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer ${
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
            <option value="absent_excused">Vắng (CP)</option>
            <option value="absent_unexcused">Vắng (KP)</option>
            <option value="late">Đi muộn</option>
          </select>
        )}
      </td>

      {/* HW Score Col 1 */}
      {selectedSession?.has_homework !== false && (
        <td className="py-2 px-1.5 text-center w-28 min-w-[110px]">
          <div className="flex flex-col items-center gap-1">
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
                  ? 'Miễn'
                  : rec.late_submit
                  ? 'Muộn'
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
              className={`w-16 h-7 px-1 py-0.5 text-center font-num border rounded-lg text-xs font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-60 transition-all ${
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
            <div className="flex items-center gap-1.5 flex-nowrap justify-center">
              <label className="flex items-center gap-0.5 text-[9px] font-extrabold text-sky-600 dark:text-sky-400 cursor-pointer select-none" title="Miễn BTVN">
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
                  className="w-2.5 h-2.5 text-sky-600 border-slate-300 dark:border-slate-700 rounded focus:ring-sky-500"
                />
                <span>Miễn</span>
              </label>
              <label className="flex items-center gap-0.5 text-[9px] font-extrabold text-rose-600 dark:text-rose-400 cursor-pointer select-none" title="Chưa làm BTVN">
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
                  className="w-2.5 h-2.5 text-rose-600 border-slate-300 dark:border-slate-700 rounded focus:ring-rose-500"
                />
                <span>Chưa</span>
              </label>
              <label className="flex items-center gap-0.5 text-[9px] font-extrabold text-amber-600 dark:text-amber-400 cursor-pointer select-none" title="Nộp muộn BTVN">
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
                  className="w-2.5 h-2.5 text-amber-600 border-slate-300 dark:border-slate-700 rounded focus:ring-amber-500"
                />
                <span>Muộn</span>
              </label>
            </div>
          </div>
        </td>
      )}

      {/* Previous Session Test Score Col (Quick Grade Return Mode) */}
      {showPrevTestColumn && prevSession && (
        <td className="py-2 px-1.5 text-center bg-purple-50/40 dark:bg-purple-950/20 border-x border-purple-100 dark:border-purple-900/30 w-28 min-w-[110px]">
          <div className="flex flex-col items-center gap-1">
            <input
              type="number"
              step="0.5"
              min="0"
              max="10"
              ref={(el) => (cellRefs.current[`${rowIndex}-prevTest`] = el)}
              value={
                prevRec?.exempt || prevRec?.exempt_test
                  ? ''
                  : prevRec?.test_score !== undefined && prevRec?.test_score !== null
                  ? prevRec.test_score
                  : ''
              }
              placeholder={
                prevRec?.exempt || prevRec?.exempt_test
                  ? 'Miễn'
                  : prevRec?.attendance && prevRec.attendance.startsWith('absent') && (prevRec.test_score === undefined || prevRec.test_score === null)
                  ? 'Vắng'
                  : 'Chờ điểm'
              }
              onFocus={() => onFocusCell(rowIndex, 2)}
              onChange={(e) => {
                if (!onUpdatePrevSession) return;
                const val = e.target.value === '' ? undefined : parseFloat(e.target.value);
                onUpdatePrevSession(student.id!, 'test_score', val);
              }}
              disabled={isNotJoined || !!(prevRec?.exempt || prevRec?.exempt_test)}
              className={`w-16 h-7 px-1 py-0.5 text-center font-num border rounded-lg text-xs font-bold focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:opacity-60 transition-all ${
                prevRec?.exempt || prevRec?.exempt_test
                  ? 'bg-sky-50 border-sky-300 text-sky-800 dark:bg-sky-950/70 dark:border-sky-800 dark:text-sky-200 font-extrabold'
                  : prevRec?.test_score !== undefined && prevRec?.test_score !== null && prevRec.test_score < 5
                  ? 'bg-rose-50 border-rose-300 text-rose-900 dark:bg-rose-950/70 dark:border-rose-800 dark:text-rose-200 font-black'
                  : prevRec?.test_score !== undefined && prevRec?.test_score !== null
                  ? 'bg-purple-50 border-purple-300 text-purple-900 dark:bg-purple-950/60 dark:border-purple-800 dark:text-purple-200 font-extrabold'
                  : 'bg-white dark:bg-slate-800/90 border-dashed border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-300 placeholder:text-purple-400 font-medium'
              }`}
            />
            <div className="flex items-center gap-1.5 flex-nowrap justify-center">
              <label className="flex items-center gap-0.5 text-[9px] font-extrabold text-sky-600 dark:text-sky-400 cursor-pointer select-none" title="Miễn kiểm tra">
                <input
                  type="checkbox"
                  checked={!!(prevRec?.exempt || prevRec?.exempt_test)}
                  onChange={(e) => {
                    if (!onUpdatePrevSession) return;
                    const isExempt = e.target.checked;
                    onUpdatePrevSession(student.id!, 'exempt_test', isExempt);
                    if (isExempt) {
                      onUpdatePrevSession(student.id!, 'test_score', undefined);
                      onUpdatePrevSession(student.id!, 'makeup_test', false);
                    }
                  }}
                  className="w-2.5 h-2.5 text-sky-600 border-slate-300 dark:border-slate-700 rounded focus:ring-sky-500"
                />
                <span>Miễn</span>
              </label>
              <label className="flex items-center gap-0.5 text-[9px] font-extrabold text-amber-600 dark:text-amber-400 cursor-pointer select-none" title="Cần thi bù">
                <input
                  type="checkbox"
                  checked={!!prevRec?.makeup_test && !(prevRec?.exempt || prevRec?.exempt_test)}
                  onChange={(e) => {
                    if (!onUpdatePrevSession) return;
                    const isMakeup = e.target.checked;
                    onUpdatePrevSession(student.id!, 'makeup_test', isMakeup);
                  }}
                  className="w-2.5 h-2.5 text-amber-600 border-slate-300 dark:border-slate-700 rounded focus:ring-amber-500"
                />
                <span>Bù</span>
              </label>
            </div>
          </div>
        </td>
      )}

      {/* Test Score Col 2 */}
      {selectedSession?.has_test !== false && (
        <td className="py-2 px-1.5 text-center w-28 min-w-[110px]">
          <div className="flex flex-col items-center gap-1">
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
                  ? 'Miễn'
                  : 'Chờ nhập'
              }
              onFocus={() => onFocusCell(rowIndex, 2)}
              onKeyDown={(e) => onKeyDown(e, rowIndex, 2)}
              onChange={(e) => {
                const val = e.target.value === '' ? undefined : parseFloat(e.target.value);
                onUpdateSession(student.id!, 'test_score', val);
              }}
              disabled={isNotJoined || isAbsent || rec.exempt || rec.exempt_test}
              className={`w-16 h-7 px-1 py-0.5 text-center font-num border rounded-lg text-xs font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-60 transition-all ${
                rec.exempt || rec.exempt_test
                  ? 'bg-sky-50 border-sky-300 text-sky-800 dark:bg-sky-950/70 dark:border-sky-800 dark:text-sky-200 font-extrabold'
                  : rec.test_score !== undefined && rec.test_score !== null && rec.test_score < 5 && !isAbsent
                  ? 'bg-rose-50 border-rose-300 text-rose-900 dark:bg-rose-950/70 dark:border-rose-800 dark:text-rose-200 font-black'
                  : (rec.test_score === undefined || rec.test_score === null) && !isAbsent
                  ? 'bg-purple-50/90 border-purple-300 text-purple-900 dark:bg-purple-950/50 dark:border-purple-800 dark:text-purple-200 placeholder:text-purple-500 font-medium'
                  : 'bg-white dark:bg-slate-800/90 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100'
              }`}
            />
            <div className="flex items-center gap-1.5 flex-nowrap justify-center">
              <label className="flex items-center gap-0.5 text-[9px] font-extrabold text-sky-600 dark:text-sky-400 cursor-pointer select-none" title="Miễn kiểm tra">
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
                  className="w-2.5 h-2.5 text-sky-600 border-slate-300 dark:border-slate-700 rounded focus:ring-sky-500"
                />
                <span>Miễn</span>
              </label>
              <label className="flex items-center gap-0.5 text-[9px] font-extrabold text-amber-600 dark:text-amber-400 cursor-pointer select-none" title="Cần thi bù">
                <input
                  type="checkbox"
                  checked={!!rec.makeup_test && !(rec.exempt || rec.exempt_test)}
                  disabled={isAbsent || !!(rec.exempt || rec.exempt_test)}
                  onChange={(e) => {
                    const isMakeup = e.target.checked;
                    onUpdateSession(student.id!, 'makeup_test', isMakeup);
                  }}
                  className="w-2.5 h-2.5 text-amber-600 border-slate-300 dark:border-slate-700 rounded focus:ring-amber-500"
                />
                <span>Bù</span>
              </label>
            </div>
          </div>
        </td>
      )}

      {/* Custom Comment Col 3 - Fluid remaining space */}
      <td className="py-2 px-3 relative min-w-[320px] w-auto">
        <div className="relative group/comment w-full">
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
