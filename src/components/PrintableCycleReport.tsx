import React from 'react';
import { ClassItem } from '../types';

interface AttendanceSessionInfo {
  attendance: 'present' | 'absent_excused' | 'absent_unexcused' | 'late';
  homework_score: number;
  test_score: number;
  session_date: string;
  lesson_title: string;
}

interface CompiledStudent {
  id?: number;
  full_name: string;
  parent_name?: string;
  parent_phone?: string;
  attendancePercent: number;
  attendanceMap: (AttendanceSessionInfo | null)[];
  hwAvg: number;
  testAvg: number;
  warningStatus: 'normal' | 'P1' | 'P2' | 'Praise';
  warningReason: string;
}

interface ClassMetrics {
  avgAttendance: number;
  avgHomework: number;
  avgTest: number;
  totalP1: number;
  totalP2: number;
  totalPraise: number;
}

interface AiCycleReportData {
  knowledge_gap_summary: string;
  outstanding_students: string;
  critical_tutoring_students: string;
  general_feedback: string;
  parent_group_announcement: string;
}

interface PrintableCycleReportProps {
  cls: ClassItem | undefined;
  currentCycle: {
    index: number;
    name: string;
    dateRange: string;
    sessions: any[];
  } | undefined;
  classMetrics: ClassMetrics;
  compiledStudents: CompiledStudent[];
  aiReport: AiCycleReportData | null;
}

export const PrintableCycleReport: React.FC<PrintableCycleReportProps> = ({
  cls,
  currentCycle,
  classMetrics,
  compiledStudents,
  aiReport,
}) => {
  if (!cls || !currentCycle) return null;

  const exportDate = new Date().toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  // Get status text and badge styling for print
  const getWarningBadge = (status: 'normal' | 'P1' | 'P2' | 'Praise') => {
    switch (status) {
      case 'P1':
        return { text: 'P1 - KHẨN CẤP', style: 'font-bold text-red-700' };
      case 'P2':
        return { text: 'P2 - NỘI BỘ', style: 'font-bold text-amber-700' };
      case 'Praise':
        return { text: 'Tuyên dương', style: 'font-bold text-green-700' };
      default:
        return { text: 'Bình thường', style: 'text-slate-500' };
    }
  };

  return (
    <div className="hidden print:block printable-a4-area font-serif text-black bg-white p-4">
      {/* HEADER SECTION */}
      <div className="flex justify-between items-start border-b-2 border-black pb-3 mb-6">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider">SỞ GD&ĐT HÀ NỘI</h2>
          <h1 className="text-base font-black tracking-wide uppercase">MATH EDU CENTER</h1>
          <p className="text-[10px] italic text-slate-600">Hệ thống đào tạo Toán THCS Chất lượng cao</p>
        </div>
        <div className="text-right text-xs">
          <p className="font-semibold">Mẫu báo cáo: <span className="font-mono">EDU-CYCLE-04</span></p>
          <p>Ngày lập báo cáo: <strong className="font-mono">{exportDate}</strong></p>
        </div>
      </div>

      {/* REPORT TITLE */}
      <div className="text-center my-6">
        <h2 className="text-xl font-extrabold uppercase tracking-wide">
          PHIẾU BÁO CÁO KẾT QUẢ HỌC TẬP
        </h2>
        <p className="text-sm font-bold text-slate-700 uppercase tracking-widest mt-1">
          {currentCycle.name} ({currentCycle.dateRange})
        </p>
      </div>

      {/* CLASS & INSTRUCTOR DETAILS */}
      <div className="grid grid-cols-2 gap-4 bg-slate-50 border border-black p-4 rounded-lg mb-6 text-xs">
        <div className="space-y-1.5">
          <p>
            <strong>Lớp học:</strong> <span className="text-sm font-bold uppercase font-mono">{cls.class_name}</span>
          </p>
          <p>
            <strong>Khối học:</strong> Lớp {cls.grade_level} (Toán THCS)
          </p>
          <p>
            <strong>Lịch học lớp:</strong> {cls.schedule || 'N/A'}
          </p>
        </div>
        <div className="space-y-1.5">
          <p>
            <strong>Trợ giảng quản lý (TA):</strong> {cls.assistant_name || 'N/A'}
          </p>
          <p>
            <strong>SĐT Trợ giảng:</strong> {cls.assistant_phone || 'N/A'}
          </p>
          <p>
            <strong>Mục tiêu học tập:</strong> <span className="italic">{cls.target_description || 'Thi vào 10 đạt kết quả cao'}</span>
          </p>
        </div>
      </div>

      {/* SESSION TOPICS BLOCK (4 SESSIONS) */}
      <div className="mb-6 avoid-break">
        <h3 className="text-xs font-extrabold uppercase border-b border-black pb-1 mb-2 tracking-wide">
          I. Danh mục chuyên đề giảng dạy trong chu kỳ
        </h3>
        <div className="grid grid-cols-4 gap-2 text-[10.5px]">
          {currentCycle.sessions.map((session, sIdx) => {
            const dateStr = new Date(session.session_date).toLocaleDateString('vi-VN');
            return (
              <div key={session.id || sIdx} className="border border-slate-300 p-2 bg-white rounded flex flex-col justify-between">
                <p className="font-bold text-slate-700">Buổi {sIdx + 1} ({dateStr})</p>
                <p className="font-semibold text-black mt-1 line-clamp-2" title={session.lesson_title}>
                  {session.lesson_title}
                </p>
                <span className="text-[9px] text-slate-500 mt-2 block border-t pt-1 italic">
                  Chương: {session.chapter || 'Hình học / Đại số'}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* KEY PERFORMANCE INDICATORS */}
      <div className="mb-6 avoid-break">
        <h3 className="text-xs font-extrabold uppercase border-b border-black pb-1 mb-2 tracking-wide">
          II. Chỉ số chất lượng tập thể (Class KPIs)
        </h3>
        <table className="w-full text-center text-[11px] border border-black border-collapse">
          <thead>
            <tr className="bg-slate-100">
              <th className="p-2 border border-black">Sĩ số lớp</th>
              <th className="p-2 border border-black">Tỷ lệ Chuyên Cần</th>
              <th className="p-2 border border-black">Trung bình Bài tập (BTVN)</th>
              <th className="p-2 border border-black">Trung bình Kiểm tra</th>
              <th className="p-2 border border-black">Khẩn cấp (P1)</th>
              <th className="p-2 border border-black">Cảnh báo (P2)</th>
              <th className="p-2 border border-black">Tuyên dương (⭐)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="p-2 border border-black font-bold font-mono">{compiledStudents.length} HS</td>
              <td className="p-2 border border-black font-bold font-mono text-emerald-800">{classMetrics.avgAttendance}%</td>
              <td className="p-2 border border-black font-bold font-mono text-emerald-700">{classMetrics.avgHomework}đ / 10đ</td>
              <td className="p-2 border border-black font-bold font-mono text-sky-700">{classMetrics.avgTest}đ / 10đ</td>
              <td className="p-2 border border-black font-bold font-mono text-red-600">{classMetrics.totalP1} học sinh</td>
              <td className="p-2 border border-black font-bold font-mono text-amber-600">{classMetrics.totalP2} học sinh</td>
              <td className="p-2 border border-black font-bold font-mono text-green-600">{classMetrics.totalPraise} học sinh</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* DETAILED GRADE & ATTENDANCE MATRIX */}
      <div className="mb-6 avoid-break">
        <h3 className="text-xs font-extrabold uppercase border-b border-black pb-1 mb-2 tracking-wide">
          III. Bảng kết quả học tập & Chuyên cần chi tiết của học sinh
        </h3>
        <table className="w-full text-left text-[10.5px] border border-black border-collapse">
          <thead>
            <tr className="bg-slate-100 text-center font-bold">
              <th className="p-2 border border-black w-[4%]">STT</th>
              <th className="p-2 border border-black text-left w-[20%]">Họ và Tên Học Sinh</th>
              <th className="p-2 border border-black w-[25%]">Chi tiết Chuyên cần & Điểm số (4 Buổi)</th>
              <th className="p-2 border border-black w-[10%]">TB BTVN</th>
              <th className="p-2 border border-black w-[10%]">TB KT</th>
              <th className="p-2 border border-black text-left w-[31%]">Đánh giá sư phạm & Canh báo chu kỳ</th>
            </tr>
          </thead>
          <tbody>
            {compiledStudents.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-4 text-center border border-black italic text-slate-500">
                  Chưa có dữ liệu danh sách học sinh.
                </td>
              </tr>
            ) : (
              compiledStudents.map((st, idx) => {
                const badge = getWarningBadge(st.warningStatus);
                return (
                  <tr key={st.id || idx} className="hover:bg-slate-50/50">
                    <td className="p-2 border border-black text-center font-mono font-bold">{idx + 1}</td>
                    <td className="p-2 border border-black font-bold">
                      <div>
                        <p className="uppercase">{st.full_name}</p>
                        <p className="text-[9px] text-slate-500 font-normal">SĐT: {st.parent_phone || 'N/A'}</p>
                      </div>
                    </td>
                    <td className="p-1 border border-black">
                      <div className="flex items-center justify-around">
                        {st.attendanceMap.map((att, attIdx) => {
                          if (!att) {
                            return (
                              <div key={attIdx} className="text-center px-1">
                                <span className="text-[9px] block text-slate-300 font-mono">-</span>
                              </div>
                            );
                          }
                          let symbol = '🟢';
                          let label = 'ĐH';
                          if (att.attendance === 'absent_excused') { symbol = '🔵'; label = 'CP'; }
                          else if (att.attendance === 'absent_unexcused') { symbol = '🔴'; label = 'KP'; }
                          else if (att.attendance === 'late') { symbol = '🟡'; label = 'M'; }

                          return (
                            <div key={attIdx} className="text-center px-0.5" title={`${att.lesson_title}`}>
                              <span className="text-[10px] block">{symbol}</span>
                              <span className="text-[8px] font-bold font-mono text-slate-600 block">{label}</span>
                              <span className="text-[7.5px] font-mono text-slate-500 block">
                                B:{(att.exempt || att.exempt_homework) ? 'Miễn' : att.homework_score !== undefined && att.homework_score !== null ? att.homework_score : '-'} / K:{(att.exempt || att.exempt_test) ? 'Miễn' : att.test_score !== undefined && att.test_score !== null ? att.test_score : 'Chờ'}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </td>
                    <td className="p-2 border border-black text-center font-bold font-mono text-emerald-700">
                      {st.hwAvg > 0 ? `${st.hwAvg}đ` : '-'}
                    </td>
                    <td className="p-2 border border-black text-center font-bold font-mono text-sky-700">
                      {st.testAvg > 0 ? `${st.testAvg}đ` : '-'}
                    </td>
                    <td className="p-2 border border-black">
                      <div className="space-y-0.5">
                        <span className={`text-[9px] px-1 py-0.2 rounded border uppercase tracking-wider ${badge.style}`}>
                          {badge.text}
                        </span>
                        {st.warningReason && (
                          <p className="text-[9.5px] text-slate-700 italic font-sans leading-tight whitespace-pre-line">
                            {st.warningReason}
                          </p>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        <div className="text-[9.5px] text-slate-500 mt-2 flex gap-4">
          <span>* Chú thích chuyên cần: 🟢 ĐH - Đi học đầy đủ | 🟡 M - Đi học muộn | 🔵 CP - Vắng có phép | 🔴 KP - Vắng không phép</span>
          <span>* B - Điểm Bài tập về nhà | K - Điểm Bài kiểm tra</span>
        </div>
      </div>

      {/* AI PEDAGOGICAL DIAGNOSIS - IF AVAILABLE */}
      {aiReport && (
        <div className="mb-6 page-break">
          <h2 className="text-sm font-bold uppercase border-b-2 border-black pb-1 mb-3 text-center tracking-wider">
            IV. CHẨN ĐOÁN SƯ PHẠM CHUYÊN SÂU TỪ TRỢ LÝ AI
          </h2>

          <div className="space-y-4 text-xs font-sans">
            <div className="p-3 border border-black bg-slate-50 rounded-lg">
              <h4 className="font-extrabold uppercase text-red-800 flex items-center gap-1.5 mb-1 text-[11px]">
                ⚠️ Lỗ hổng kiến thức tập thể của lớp
              </h4>
              <p className="text-slate-800 leading-relaxed text-justify">
                {aiReport.knowledge_gap_summary}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 border border-black bg-emerald-50/50 rounded-lg">
                <h4 className="font-extrabold uppercase text-green-800 flex items-center gap-1.5 mb-1 text-[11px]">
                  ⭐ Vinh danh nhóm xuất sắc & tiến bộ vượt bậc
                </h4>
                <p className="text-slate-800 leading-relaxed text-justify">
                  {aiReport.outstanding_students}
                </p>
              </div>

              <div className="p-3 border border-black bg-amber-50/50 rounded-lg">
                <h4 className="font-extrabold uppercase text-amber-800 flex items-center gap-1.5 mb-1 text-[11px]">
                  ⚠️ Nhóm học sinh yếu/thiếu bài tập cần phụ đạo bù
                </h4>
                <p className="text-slate-800 leading-relaxed text-justify">
                  {aiReport.critical_tutoring_students}
                </p>
              </div>
            </div>

            <div className="p-3 border border-black bg-sky-50/50 rounded-lg">
              <h4 className="font-extrabold uppercase text-sky-800 flex items-center gap-1.5 mb-1 text-[11px]">
                💡 Đề xuất định hướng phương pháp giảng dạy chu kỳ tới
              </h4>
              <p className="text-slate-800 leading-relaxed text-justify">
                {aiReport.general_feedback}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* SIGNATURES ROW */}
      <div className="grid grid-cols-2 gap-4 mt-12 text-center text-xs avoid-break">
        <div className="space-y-16">
          <p className="font-bold uppercase tracking-wider">TRỢ GIẢNG QUẢN LÝ LỚP (TA)</p>
          <div>
            <p className="font-bold underline">{cls.assistant_name || '..............................................'}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">(Ký và ghi rõ họ tên)</p>
          </div>
        </div>
        <div className="space-y-16">
          <p className="font-bold uppercase tracking-wider">GIÁO VIÊN CHUYÊN MÔN DUYỆT</p>
          <div>
            <p className="font-bold">....................................................................</p>
            <p className="text-[10px] text-slate-500 mt-0.5">(Ký và ghi rõ họ tên)</p>
          </div>
        </div>
      </div>
    </div>
  );
};
