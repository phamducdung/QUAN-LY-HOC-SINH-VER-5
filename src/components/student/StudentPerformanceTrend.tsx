import React, { useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Target,
  Activity,
  Award,
  CheckCircle2,
  AlertTriangle,
  BookOpen,
  Calendar,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import {
  RawSessionHistoryPoint,
  computePerformanceSummary,
  computeSessionComposite,
} from '../../utils/performanceReportCardGenerator';

interface StudentPerformanceTrendProps {
  rawHistory: RawSessionHistoryPoint[];
  targetDescription?: string;
}

export const StudentPerformanceTrend: React.FC<StudentPerformanceTrendProps> = ({
  rawHistory,
  targetDescription = 'Thi vào Lớp 10 Công lập 8.0+',
}) => {
  const summary = useMemo(
    () => computePerformanceSummary(rawHistory, targetDescription),
    [rawHistory, targetDescription]
  );

  const chartData = useMemo(
    () =>
      rawHistory.map((item) => ({
        ...item,
        compositeScore: computeSessionComposite(item.testScore, item.hwScore),
      })),
    [rawHistory]
  );

  const twoSessionStyle = useMemo(() => {
    switch (summary.twoSessionStatus) {
      case 'improving':
        return {
          badgeBg: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60',
          icon: <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />,
          accentText: 'text-emerald-600 dark:text-emerald-400',
        };
      case 'stable_good':
        return {
          badgeBg: 'bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800/60',
          icon: <CheckCircle2 className="w-4 h-4 text-sky-600 dark:text-sky-400" />,
          accentText: 'text-sky-600 dark:text-sky-400',
        };
      case 'attention':
        return {
          badgeBg: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/60',
          icon: <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />,
          accentText: 'text-amber-600 dark:text-amber-400',
        };
      case 'declining':
        return {
          badgeBg: 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/60',
          icon: <TrendingDown className="w-4 h-4 text-rose-600 dark:text-rose-400" />,
          accentText: 'text-rose-600 dark:text-rose-400',
        };
      default:
        return {
          badgeBg: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700',
          icon: <Activity className="w-4 h-4 text-slate-500" />,
          accentText: 'text-slate-600 dark:text-slate-400',
        };
    }
  }, [summary.twoSessionStatus]);

  return (
    <div className="space-y-4">
      {/* 1. Target Banner */}
      <div className="bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/20 p-3.5 rounded-2xl border border-emerald-200/70 dark:border-emerald-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-emerald-600 text-white rounded-xl shadow-sm">
            <Target className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 block">
              Mục Tiêu Đầu Ra Của Lớp Học
            </span>
            <p className="text-xs font-extrabold text-slate-900 dark:text-white">
              {targetDescription} (Ngưỡng chuẩn: {summary.targetScore} điểm)
            </p>
          </div>
        </div>
        {summary.compositeScore !== null && (
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span
              className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold border ${
                summary.compositeScore >= summary.targetScore
                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/50 dark:text-emerald-300 dark:border-emerald-700'
                  : 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800'
              }`}
            >
              {summary.compositeScore >= summary.targetScore
                ? `Đã đạt mục tiêu (${summary.compositeScore}/${summary.targetScore}đ)`
                : `Còn thiếu ${(summary.targetScore - summary.compositeScore).toFixed(2)}đ để chạm mốc ${summary.targetScore}đ`}
            </span>
          </div>
        )}
      </div>

      {/* 2. Four Parent-Friendly Performance Cards (70/30 & 2-Session Focus) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Card 1: Điểm Phong Độ Tổng Hợp (70% KT + 30% BTVN) */}
        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              1. Điểm Phong Độ Tổng Hợp (70/30)
            </span>
            <Award className="w-4 h-4 text-emerald-600" />
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
              {summary.compositeScore !== null ? `${summary.compositeScore}đ` : '--'}
            </span>
            <span className="text-[11px] text-slate-500 font-semibold">
              / {summary.targetScore}đ mục tiêu ({summary.targetAchievementPct ?? 0}%)
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1.5 border-t border-slate-100 dark:border-slate-800/80 text-[11px]">
            <div className="bg-emerald-50/60 dark:bg-emerald-950/20 px-2.5 py-1.5 rounded-lg border border-emerald-100 dark:border-emerald-900/40">
              <span className="text-slate-500 dark:text-slate-400 block text-[10px] font-semibold">
                TB Kiểm Tra (70%)
              </span>
              <span className="font-extrabold text-emerald-700 dark:text-emerald-300">
                {summary.avgTest !== null ? `${summary.avgTest}đ` : 'Chưa có'}
              </span>
            </div>
            <div className="bg-blue-50/60 dark:bg-blue-950/20 px-2.5 py-1.5 rounded-lg border border-blue-100 dark:border-blue-900/40">
              <span className="text-slate-500 dark:text-slate-400 block text-[10px] font-semibold">
                TB Bài Tập Về Nhà (30%)
              </span>
              <span className="font-extrabold text-blue-700 dark:text-blue-300">
                {summary.avgHw !== null ? `${summary.avgHw}đ` : 'Chưa có'}
              </span>
            </div>
          </div>
        </div>

        {/* Card 2: Phong Độ 2 Buổi Học Gần Nhất */}
        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              2. Phong Độ 2 Buổi Học Gần Nhất
            </span>
            {twoSessionStyle.icon}
          </div>

          <div className="flex items-center justify-between gap-2">
            <div>
              <span className={`text-xl font-black ${twoSessionStyle.accentText}`}>
                {summary.recent2CompositeAvg !== null ? `${summary.recent2CompositeAvg}đ` : '--'}
              </span>
              <span className="text-[10px] text-slate-400 font-semibold block">
                TB Tổng hợp 2 buổi gần nhất
              </span>
            </div>
            <span
              className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold border ${twoSessionStyle.badgeBg}`}
            >
              {summary.twoSessionBadgeText}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1.5 border-t border-slate-100 dark:border-slate-800/80 text-[11px]">
            <div className="bg-slate-50 dark:bg-slate-800/60 px-2.5 py-1.5 rounded-lg">
              <span className="text-slate-400 block text-[10px] font-semibold">
                {summary.prevSession ? `Buổi trước (${summary.prevSession.session})` : 'Buổi liền trước'}
              </span>
              <span className="font-bold text-slate-700 dark:text-slate-200">
                {summary.prevSession
                  ? `KT: ${summary.prevSession.testScore ?? '--'}đ | BT: ${summary.prevSession.hwScore ?? '--'}đ`
                  : 'Chưa có'}
              </span>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/60 px-2.5 py-1.5 rounded-lg">
              <span className="text-slate-400 block text-[10px] font-semibold">
                {summary.latestSession ? `Buổi mới nhất (${summary.latestSession.session})` : 'Buổi mới nhất'}
              </span>
              <span className="font-bold text-slate-800 dark:text-slate-100">
                {summary.latestSession
                  ? `KT: ${summary.latestSession.testScore ?? '--'}đ | BT: ${summary.latestSession.hwScore ?? '--'}đ`
                  : 'Chưa có'}
              </span>
            </div>
          </div>
        </div>

        {/* Card 3: Chuyên Cần & Kỷ Luật BTVN */}
        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              3. Chuyên Cần & Kỷ Luật BTVN
            </span>
            <BookOpen className="w-4 h-4 text-indigo-600" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-xl font-black text-indigo-600 dark:text-indigo-400">
                {summary.attendanceRate}%
              </span>
              <span className="text-[10px] text-slate-500 block font-semibold">
                Có mặt: {summary.presentCount + summary.lateCount}/{summary.totalSessions} buổi
              </span>
            </div>
            <div>
              <span className="text-xl font-black text-teal-600 dark:text-teal-400">
                {summary.hwCompletionRate}%
              </span>
              <span className="text-[10px] text-slate-500 block font-semibold">
                Hoàn thành BTVN đúng/đủ
              </span>
            </div>
          </div>

          <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap gap-1.5 text-[10px] font-bold">
            <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
              Nộp đúng hạn: {summary.hwSubmittedOnTimeCount} buổi
            </span>
            {summary.hwLateCount > 0 && (
              <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
                Nộp muộn: {summary.hwLateCount} buổi
              </span>
            )}
            {summary.hwMissingCount > 0 && (
              <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">
                Chưa nộp BTVN (0đ): {summary.hwMissingCount} buổi
              </span>
            )}
            {summary.absentUnexcusedCount > 0 && (
              <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300">
                Vắng K.Phép: {summary.absentUnexcusedCount} buổi
              </span>
            )}
          </div>
        </div>

        {/* Card 4: Nhận Xét & Khuyến Nghị Trao Đổi Phụ Huynh */}
        <div className="p-4 rounded-2xl border border-emerald-200/80 dark:border-emerald-900/40 bg-emerald-50/40 dark:bg-emerald-950/15 shadow-sm space-y-2 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              4. Nhận Xét Sư Phạm (Gợi Ý Trao Đổi PH)
            </span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>

          <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 leading-relaxed">
            {summary.twoSessionAdvice}
          </p>

          <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium pt-1 border-t border-emerald-200/50 dark:border-emerald-800/40">
            Công thức chuẩn: Điểm Tổng Hợp = 70% Điểm Kiểm Tra + 30% Điểm BTVN (Buổi không nộp BTVN tính 0đ).
          </div>
        </div>
      </div>

      {/* 3. Simplified Parent-Friendly Chart (Test Score, HW Score, Target Line) */}
      <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <div>
            <h4 className="text-xs font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-emerald-600" />
              <span>Biểu Đồ Điểm Kiểm Tra (70%) & Điểm BTVN (30%) Qua Các Buổi Học</span>
            </h4>
            <p className="text-[10px] text-slate-500">
              Hiển thị trực quan điểm thực tế từng buổi so với đường mục tiêu {summary.targetScore} điểm
            </p>
          </div>

          {/* Clean Legend */}
          <div className="flex flex-wrap items-center gap-3 text-[10px] font-bold">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
              <span className="text-slate-700 dark:text-slate-300">Điểm Kiểm Tra (70%)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />
              <span className="text-slate-700 dark:text-slate-300">Điểm BTVN (30%)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3.5 h-0.5 border-b-2 border-dashed border-rose-500 inline-block" />
              <span className="text-rose-600 dark:text-rose-400">Mục tiêu ({summary.targetScore}đ)</span>
            </div>
          </div>
        </div>

        {chartData.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400 font-medium">
            Chưa có dữ liệu điểm các buổi học để hiển thị biểu đồ.
          </div>
        ) : (
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 16, left: -20, bottom: 0 }}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#e2e8f0"
                  className="dark:stroke-slate-800"
                />
                <XAxis dataKey="session" tick={{ fontSize: 10, fontWeight: 600 }} />
                <YAxis domain={[0, 10]} tick={{ fontSize: 11 }} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      const pt = payload[0].payload as RawSessionHistoryPoint & {
                        compositeScore: number | null;
                      };
                      return (
                        <div className="bg-slate-900/95 backdrop-blur-md text-white p-3 rounded-xl shadow-xl border border-slate-700 text-xs space-y-1.5">
                          <div className="font-bold text-emerald-400 border-b border-slate-800 pb-1">
                            {pt.sessionFullName || `Buổi ${label}`}
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center justify-between gap-4">
                              <span className="text-slate-400">Điểm Kiểm Tra (70%):</span>
                              <span className="font-bold text-emerald-400">
                                {pt.testScore !== null ? `${pt.testScore} điểm` : 'Miễn / Chưa chấm'}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                              <span className="text-slate-400">Điểm BTVN (30%):</span>
                              <span className="font-bold text-blue-400">
                                {pt.homework_submitted === false
                                  ? '0 điểm (Chưa nộp)'
                                  : pt.hwScore !== null
                                  ? `${pt.hwScore} điểm${pt.late_submit ? ' (Nộp muộn)' : ''}`
                                  : 'Miễn / Chưa chấm'}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-4 pt-1 border-t border-slate-800">
                              <span className="text-slate-300 font-semibold">Điểm Tổng Hợp Buổi:</span>
                              <span className="font-extrabold text-amber-300">
                                {pt.compositeScore !== null ? `${pt.compositeScore} điểm` : '--'}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />

                <ReferenceLine
                  y={summary.targetScore}
                  stroke="#ef4444"
                  strokeDasharray="5 5"
                  strokeWidth={1.5}
                />

                <Line
                  type="monotone"
                  dataKey="testScore"
                  name="Điểm Kiểm Tra"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: '#10b981' }}
                  activeDot={{ r: 6 }}
                  connectNulls
                />

                <Line
                  type="monotone"
                  dataKey="hwScore"
                  name="Điểm BTVN"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ r: 3.5, fill: '#3b82f6' }}
                  activeDot={{ r: 5 }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* 4. Transparent Session-by-Session History Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
        <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h4 className="text-xs font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-emerald-600" />
            <span>Bảng Điểm & Nhận Xét Chi Tiết Từng Buổi Học ({rawHistory.length} buổi)</span>
          </h4>
          <span className="text-[10px] font-bold text-slate-500">
            Mới nhất ở trên
          </span>
        </div>

        {rawHistory.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-400">
            Học sinh chưa có dữ liệu buổi học nào.
          </div>
        ) : (
          <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
            {[...rawHistory]
              .reverse()
              .map((row, idx) => {
                const comp = computeSessionComposite(row.testScore, row.hwScore);
                const isRecent2 = idx < 2;
                return (
                  <div
                    key={row.sessionId || `${row.session}-${idx}`}
                    className={`p-3 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                      isRecent2 ? 'bg-emerald-50/20 dark:bg-emerald-950/10' : ''
                    }`}
                  >
                    <div className="space-y-0.5 min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {isRecent2 && (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300 text-[9px] font-extrabold uppercase">
                            2 Buổi gần nhất
                          </span>
                        )}
                        <span className="font-extrabold text-slate-800 dark:text-slate-100">
                          {row.sessionDate || row.session}
                        </span>
                        <span className="text-slate-600 dark:text-slate-300 font-semibold truncate">
                          — {row.topicName || row.sessionFullName || 'Buổi học thường kỳ'}
                        </span>
                      </div>
                      {row.teacher_comment && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 italic">
                          💬 "{row.teacher_comment}"
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                      <span
                        className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border ${
                          row.attendance === 'absent_unexcused'
                            ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300'
                            : row.attendance === 'absent_excused'
                            ? 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400'
                            : row.attendance === 'late'
                            ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300'
                        }`}
                      >
                        {row.attendance === 'absent_unexcused'
                          ? 'Vắng K.Phép'
                          : row.attendance === 'absent_excused'
                          ? 'Vắng C.Phép'
                          : row.attendance === 'late'
                          ? 'Đi muộn'
                          : 'Có mặt'}
                      </span>

                      <span
                        className={`px-2 py-0.5 rounded-lg text-[10px] font-extrabold ${
                          row.testScore !== null && row.testScore < 6
                            ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-300'
                            : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200'
                        }`}
                      >
                        KT: {row.testScore !== null ? `${row.testScore}đ` : 'Miễn'}
                      </span>

                      <span
                        className={`px-2 py-0.5 rounded-lg text-[10px] font-extrabold ${
                          row.homework_submitted === false
                            ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-300'
                            : row.late_submit
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300'
                            : 'bg-blue-50 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300'
                        }`}
                      >
                        {row.homework_submitted === false
                          ? 'BTVN: 0đ (Chưa nộp)'
                          : `BTVN: ${row.hwScore !== null ? `${row.hwScore}đ` : 'Miễn'}${row.late_submit ? ' (Muộn)' : ''}`}
                      </span>

                      <span className="px-2 py-0.5 rounded-lg text-[10px] font-black bg-emerald-600 text-white">
                        TH: {comp !== null ? `${comp}đ` : '--'}
                      </span>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
};
