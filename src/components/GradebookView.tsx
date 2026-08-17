import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/dexie';
import { Student, Session, StudentSession, ClassItem } from '../types';
import { calculateStudentCycleGrades, formatScore } from '../lib/calculations';
import {
  FileSpreadsheet,
  Award,
  BookOpen,
  Info,
  CheckCircle2,
  XCircle,
  Clock,
  HelpCircle,
  HelpCircle as QuestionIcon,
  ChevronRight,
  Calculator,
} from 'lucide-react';

interface GradebookViewProps {
  currentClass: ClassItem | undefined;
  sessions: Session[];
  students: Student[];
  studentSessions: StudentSession[];
}

export const GradebookView: React.FC<GradebookViewProps> = ({
  currentClass,
  sessions,
  students,
  studentSessions,
}) => {
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  const classStudents = useLiveQuery(() => db.class_students.toArray()) || [];

  if (!currentClass) {
    return (
      <div className="p-8 text-center text-slate-500 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
        Vui lòng chọn một lớp học để xem bảng điểm tổng hợp.
      </div>
    );
  }

  // Compute breakdown for all students including Lifecycle link (join_date/leave_date)
  const studentBreakdowns = students.map((st) => {
    const link = classStudents.find(
      (cs) => cs.student_id === st.id && cs.class_id === currentClass.id
    );
    return calculateStudentCycleGrades(st.id!, sessions, studentSessions, link);
  });

  const selectedBreakdown = studentBreakdowns.find((b) => b.studentId === selectedStudentId);
  const selectedStudent = students.find((s) => s.id === selectedStudentId);

  // Class overall averages
  const validHwAvgs = studentBreakdowns.map((b) => b.hwAverage).filter((v): v is number => v !== null);
  const classHwAvg = validHwAvgs.length > 0 ? (validHwAvgs.reduce((a, b) => a + b, 0) / validHwAvgs.length).toFixed(1) : '-';

  const validTestAvgs = studentBreakdowns.map((b) => b.testAverage).filter((v): v is number => v !== null);
  const classTestAvg = validTestAvgs.length > 0 ? (validTestAvgs.reduce((a, b) => a + b, 0) / validTestAvgs.length).toFixed(1) : '-';

  const validWeightedAvgs = studentBreakdowns.map((b) => b.weightedAverage).filter((v): v is number => v !== null);
  const classWeightedAvg = validWeightedAvgs.length > 0 ? (validWeightedAvgs.reduce((a, b) => a + b, 0) / validWeightedAvgs.length).toFixed(1) : '-';

  return (
    <div id="gradebook-view-container" className="space-y-6">
      {/* Header Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-3">
          <div className="p-3 bg-sky-50 dark:bg-sky-950/60 rounded-xl text-sky-600 dark:text-sky-400">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <div className="text-[11px] font-extrabold uppercase text-slate-400 tracking-wider">TB BTVN Cả Lớp</div>
            <div className="text-xl font-black text-slate-900 dark:text-slate-100 mt-0.5">{classHwAvg} / 10</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Trọng số 30% trong TB Chu kỳ</div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-3">
          <div className="p-3 bg-purple-50 dark:bg-purple-950/60 rounded-xl text-purple-600 dark:text-purple-400">
            <Award className="w-6 h-6" />
          </div>
          <div>
            <div className="text-[11px] font-extrabold uppercase text-slate-400 tracking-wider">TB Bài Kiểm Tra Cả Lớp</div>
            <div className="text-xl font-black text-slate-900 dark:text-slate-100 mt-0.5">{classTestAvg} / 10</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Trọng số 70% trong TB Chu kỳ</div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-3">
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/60 rounded-xl text-emerald-600 dark:text-emerald-400">
            <Calculator className="w-6 h-6" />
          </div>
          <div>
            <div className="text-[11px] font-extrabold uppercase text-slate-400 tracking-wider">TB Tổng Hợp Chu Kỳ</div>
            <div className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-0.5">{classWeightedAvg} / 10</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Đã trừ miễn BTVN/KT & Vắng phép</div>
          </div>
        </div>
      </div>

      {/* Gradebook Matrix Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>Bảng Điểm Tổng Hợp & Xử Lý Miễn Trừ - {currentClass.class_name}</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Tự động bỏ qua bài miễn trừ/vắng có phép ra khỏi mẫu số. Vắng không phép tính 0 điểm.
            </p>
          </div>
          <div className="flex items-center gap-3 text-[11px] font-bold">
            <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 px-2 py-0.5 rounded-md border border-amber-200 dark:border-amber-800">
              🟡 Miễn trừ
            </span>
            <span className="flex items-center gap-1 text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/60 px-2 py-0.5 rounded-md border border-rose-200 dark:border-rose-800">
              🔴 Vắng KP (0Đ)
            </span>
            <span className="flex items-center gap-1 text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/60 px-2 py-0.5 rounded-md border border-sky-200 dark:border-sky-800">
              🔵 Thi bù
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-500 uppercase tracking-wider text-[10px] font-extrabold">
                <th className="py-3 px-3 text-center w-10">STT</th>
                <th className="py-3 px-4 min-w-[160px]">Họ và Tên</th>
                {sessions.map((sess, idx) => (
                  <th key={sess.id || idx} className="py-3 px-2 text-center min-w-[90px]">
                    <div className="font-bold text-slate-700 dark:text-slate-300">B{idx + 1} ({sess.session_date.slice(5)})</div>
                    <div className="text-[9px] text-slate-400 truncate max-w-[85px]" title={sess.lesson_title}>{sess.lesson_title}</div>
                  </th>
                ))}
                <th className="py-3 px-3 text-center bg-sky-50/70 dark:bg-sky-950/40 text-sky-900 dark:text-sky-200 font-extrabold min-w-[80px]">
                  TB BTVN (30%)
                </th>
                <th className="py-3 px-3 text-center bg-purple-50/70 dark:bg-purple-950/40 text-purple-900 dark:text-purple-200 font-extrabold min-w-[80px]">
                  TB KT (70%)
                </th>
                <th className="py-3 px-3 text-center bg-emerald-50 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-200 font-black min-w-[95px]">
                  TB Chu Kỳ
                </th>
                <th className="py-3 px-3 text-center w-12">Chi tiết</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {students.map((st, idx) => {
                const breakdown = studentBreakdowns.find((b) => b.studentId === st.id);
                if (!breakdown) return null;

                return (
                  <tr
                    key={st.id || idx}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <td className="py-3 px-3 text-center font-bold text-slate-400">{idx + 1}</td>
                    <td className="py-3 px-4 font-bold text-slate-900 dark:text-slate-100">
                      <div>{st.full_name}</div>
                      {breakdown.hasPendingMakeup && (
                        <span className="inline-block mt-0.5 text-[9px] font-extrabold text-amber-600 bg-amber-50 dark:bg-amber-950/60 px-1.5 py-0.2 rounded border border-amber-200 dark:border-amber-800">
                          ⏳ Cần thi bù
                        </span>
                      )}
                    </td>

                    {/* Per Session Badges */}
                    {sessions.map((sess) => {
                      const detail = breakdown.sessionDetails.find((d) => d.sessionId === sess.id);
                      if (!detail) {
                        return <td key={sess.id} className="py-3 px-2 text-center text-slate-400">-</td>;
                      }

                      return (
                        <td key={sess.id} className="py-3 px-2 text-center align-middle">
                          <div className="flex flex-col items-center gap-1 text-[11px]">
                            {detail.attendance === 'not_joined' ? (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700 whitespace-nowrap" title={detail.comment}>
                                ⚪ {detail.comment || 'Chưa học'}
                              </span>
                            ) : (
                              <>
                                {/* Homework status badge */}
                                {sess.has_homework !== false && (
                                  <div>
                                    {detail.hwStatus === 'exempt' && (
                                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-200 dark:border-amber-800" title="Miễn BTVN thủ công">
                                        Miễn BT
                                      </span>
                                    )}
                                    {detail.hwStatus === 'excused_exempt' && (
                                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-200 dark:border-amber-800" title="Vắng có phép - Tự động miễn BTVN">
                                        Vắng phép
                                      </span>
                                    )}
                                    {detail.hwStatus === 'unexcused_zero' && (
                                      <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200 border border-rose-300 dark:border-rose-800" title="Vắng KHÔNG PHÉP - Phạt 0đ BTVN">
                                        🔴 0đ BT
                                      </span>
                                    )}
                                    {detail.hwStatus === 'unsubmitted_zero' && (
                                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border border-rose-200 dark:border-rose-800" title="Không nộp BTVN - Tính 0đ">
                                        Chưa nộp
                                      </span>
                                    )}
                                    {detail.hwStatus === 'graded' && (
                                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                                        BT: <strong className="font-bold">{detail.hwScore}</strong>
                                      </span>
                                    )}
                                  </div>
                                )}

                                {/* Test status badge */}
                                {sess.has_test !== false && (
                                  <div>
                                    {detail.testStatus === 'exempt' && (
                                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-200 dark:border-amber-800" title="Miễn bài kiểm tra">
                                        Miễn KT
                                      </span>
                                    )}
                                    {detail.testStatus === 'unexcused_zero' && (
                                      <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200 border border-rose-300 dark:border-rose-800" title="Vắng KHÔNG PHÉP - Phạt 0đ Kiểm tra">
                                        🔴 0đ KT
                                      </span>
                                    )}
                                    {detail.testStatus === 'pending_makeup' && (
                                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300 border border-purple-200 dark:border-purple-800" title="Chờ làm bài thi bù">
                                        ⏳ Thi bù
                                      </span>
                                    )}
                                    {detail.testStatus === 'makeup_graded' && (
                                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-50 text-sky-800 dark:bg-sky-950 dark:text-sky-200 border border-sky-200 dark:border-sky-800" title="Đã có điểm thi bù">
                                        🔵 KT: <strong className="font-black">{detail.testScore}</strong>
                                      </span>
                                    )}
                                    {detail.testStatus === 'graded' && (
                                      <span className="font-semibold text-purple-700 dark:text-purple-300">
                                        KT: <strong className="font-bold">{detail.testScore}</strong>
                                      </span>
                                    )}
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      );
                    })}

                    {/* HW Average */}
                    <td className="py-3 px-3 text-center font-bold bg-sky-50/50 dark:bg-sky-950/20 text-sky-900 dark:text-sky-200">
                      {formatScore(breakdown.hwAverage)}
                    </td>

                    {/* Test Average */}
                    <td className="py-3 px-3 text-center font-bold bg-purple-50/50 dark:bg-purple-950/20 text-purple-900 dark:text-purple-200">
                      {formatScore(breakdown.testAverage)}
                    </td>

                    {/* Weighted Cycle Average */}
                    <td className="py-3 px-3 text-center font-black text-sm bg-emerald-50/80 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
                      {formatScore(breakdown.weightedAverage)}
                    </td>

                    {/* Action Button */}
                    <td className="py-3 px-3 text-center">
                      <button
                        onClick={() => setSelectedStudentId(st.id!)}
                        className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/60 rounded-lg transition-all"
                        title="Xem công thức chi tiết"
                      >
                        <Info className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Formula Detail Modal */}
      {selectedStudent && selectedBreakdown && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 max-w-lg w-full rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100">
                  Chi Tiết Điểm & Công Thức: {selectedStudent.full_name}
                </h3>
                <p className="text-xs text-slate-500">Lớp {currentClass.class_name}</p>
              </div>
              <button
                onClick={() => setSelectedStudentId(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl space-y-1">
                <div className="font-bold text-slate-700 dark:text-slate-300">1. Thống kê Chuyên cần:</div>
                <div className="text-slate-600 dark:text-slate-400">
                  • Có mặt: {selectedBreakdown.presentCount} | Đi muộn: {selectedBreakdown.lateCount} | Vắng phép: {selectedBreakdown.excusedCount} | Vắng không phép: {selectedBreakdown.unexcusedCount}
                </div>
              </div>

              <div className="p-3 bg-sky-50 dark:bg-sky-950/50 border border-sky-200 dark:border-sky-800 rounded-xl space-y-1 text-sky-900 dark:text-sky-200">
                <div className="font-bold flex justify-between">
                  <span>2. Điểm Trung Bình BTVN (30%):</span>
                  <span className="font-black text-sm">{formatScore(selectedBreakdown.hwAverage)} / 10</span>
                </div>
                <div className="text-[11px] text-sky-800 dark:text-sky-300">
                  • Tổng điểm: {selectedBreakdown.hwTotalScore} / Số bài tính ({selectedBreakdown.hwValidCount} bài)
                  <br />
                  • Đã loại trừ bài được miễn / vắng có phép ra khỏi mẫu số.
                </div>
              </div>

              <div className="p-3 bg-purple-50 dark:bg-purple-950/50 border border-purple-200 dark:border-purple-800 rounded-xl space-y-1 text-purple-900 dark:text-purple-200">
                <div className="font-bold flex justify-between">
                  <span>3. Điểm Trung Bình Kiểm Tra (70%):</span>
                  <span className="font-black text-sm">{formatScore(selectedBreakdown.testAverage)} / 10</span>
                </div>
                <div className="text-[11px] text-purple-800 dark:text-purple-300">
                  • Tổng điểm: {selectedBreakdown.testTotalScore} / Số bài tính ({selectedBreakdown.testValidCount} bài)
                  <br />
                  • Vắng có phép được tạm miễn (chờ thi bù). Vắng không phép phạt 0đ.
                </div>
              </div>

              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-xl space-y-1 text-emerald-900 dark:text-emerald-200">
                <div className="font-bold flex justify-between items-center">
                  <span>4. Điểm TB Tổng Hợp Chu Kỳ:</span>
                  <span className="text-lg font-black">{formatScore(selectedBreakdown.weightedAverage)} / 10</span>
                </div>
                <div className="text-[11px] text-emerald-800 dark:text-emerald-300">
                  Công thức: (TB BTVN × 0.3) + (TB KT × 0.7)
                </div>
              </div>
            </div>

            <div className="pt-2 text-right">
              <button
                onClick={() => setSelectedStudentId(null)}
                className="px-4 py-2 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-bold rounded-xl text-xs hover:opacity-90"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
