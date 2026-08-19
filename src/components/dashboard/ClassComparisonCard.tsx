import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  Cell,
} from 'recharts';
import {
  ClassItem,
  Session,
  StudentSession,
  Warning,
  GradeLevel,
} from '../../types';
import {
  computeInterClassBenchmarks,
  ComparisonTimeframe,
  ClassBenchmarkItem,
} from '../../services/dashboardService';
import {
  Trophy,
  TrendingUp,
  AlertTriangle,
  Award,
  ChevronRight,
  Flame,
  Clock,
  Sparkles,
  Users,
  BookOpen,
  ArrowUpRight,
  HelpCircle,
  BarChart3,
  Calendar,
} from 'lucide-react';

interface ClassComparisonCardProps {
  classes: ClassItem[];
  sessions: Session[];
  studentSessions: StudentSession[];
  warnings?: Warning[];
  classStudents?: { class_id: string; student_id: string; leave_date?: string }[];
  selectedGradeFilter: GradeLevel | 'all';
  onSelectClassForGradeEntry?: (classId: string) => void;
  onNavigateToClasses?: () => void;
  onNavigateToWarnings?: () => void;
}

const CustomBarTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data: ClassBenchmarkItem = payload[0].payload;
    return (
      <div className="bg-slate-900/95 dark:bg-slate-950/95 backdrop-blur-xs text-slate-100 p-3.5 rounded-xl shadow-2xl border border-slate-800 text-xs max-w-xs z-50 animate-in fade-in-50 duration-150">
        <div className="font-bold text-slate-100 border-b border-slate-800 pb-1.5 mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="font-extrabold text-sm">{data.className}</span>
          </div>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-num">
            Hạng #{data.rank}
          </span>
        </div>

        <div className="space-y-1.5 font-medium">
          <div className="flex items-center justify-between gap-3">
            <span className="text-indigo-400 font-semibold flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-indigo-500" />
              Điểm KT TB:
            </span>
            <span className="font-bold font-num text-indigo-300 text-sm">
              {data.avgTestScore > 0 ? `${data.avgTestScore} / 10` : 'Chưa có'}
            </span>
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-emerald-400 font-semibold flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              Điểm BTVN TB:
            </span>
            <span className="font-bold font-num text-emerald-300">
              {data.avgHwScore > 0 ? `${data.avgHwScore} / 10` : 'Chưa có'}
            </span>
          </div>

          <div className="pt-2 border-t border-slate-800/80 grid grid-cols-2 gap-2 text-[11px] font-num text-slate-300">
            <div>
              <span className="text-slate-400">Tỉ lệ nộp bài:</span>{' '}
              <span className="font-bold text-emerald-400">{data.hwSubmissionRate}%</span>
            </div>
            <div>
              <span className="text-slate-400">Chuyên cần:</span>{' '}
              <span className="font-bold text-sky-400">{data.attendanceRate}%</span>
            </div>
          </div>

          {data.deltaTestScore !== undefined && (
            <div className="pt-1.5 text-[11px] flex items-center justify-between border-t border-slate-800/80">
              <span className="text-slate-400">Tăng trưởng KT:</span>
              <span
                className={`font-bold font-num flex items-center ${
                  data.deltaTestScore >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {data.deltaTestScore > 0 ? `+${data.deltaTestScore}đ` : `${data.deltaTestScore}đ`}
              </span>
            </div>
          )}

          {data.p1WarningCount > 0 && (
            <div className="mt-1 pt-1 text-[10.5px] text-rose-400 font-bold flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-rose-400 shrink-0" />
              <span>{data.p1WarningCount} học sinh có cảnh báo khẩn cấp P1</span>
            </div>
          )}
        </div>
      </div>
    );
  }
  return null;
};

export const ClassComparisonCard: React.FC<ClassComparisonCardProps> = ({
  classes,
  sessions,
  studentSessions,
  warnings = [],
  classStudents = [],
  selectedGradeFilter,
  onSelectClassForGradeEntry,
  onNavigateToClasses,
  onNavigateToWarnings,
}) => {
  const [activeGradeTab, setActiveGradeTab] = useState<GradeLevel>(() => {
    return selectedGradeFilter !== 'all' ? selectedGradeFilter : 9;
  });

  const [timeframe, setTimeframe] = useState<ComparisonTimeframe>('this_week');

  // If top-level grade filter changes and is not 'all', sync tab
  React.useEffect(() => {
    if (selectedGradeFilter !== 'all') {
      setActiveGradeTab(selectedGradeFilter);
    }
  }, [selectedGradeFilter]);

  // Available grade tabs that actually have classes
  const gradesList: GradeLevel[] = [6, 7, 8, 9];

  // Compute benchmark data for the active grade tab
  const benchmarkData = useMemo(() => {
    return computeInterClassBenchmarks(
      activeGradeTab,
      classes,
      sessions,
      studentSessions,
      warnings,
      classStudents,
      timeframe
    );
  }, [activeGradeTab, classes, sessions, studentSessions, warnings, classStudents, timeframe]);

  const {
    classes: classItems,
    gradeAvgTest,
    gradeAvgHw,
    topPerformerClass,
    mostImprovedClass,
    needsSupportClass,
    hasData,
  } = benchmarkData;

  const handleClassClick = (classId: string) => {
    if (onSelectClassForGradeEntry) {
      onSelectClassForGradeEntry(classId);
    } else if (onNavigateToClasses) {
      onNavigateToClasses();
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-xs transition-all space-y-4">
      {/* Top Header & Filters */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center shadow-xs">
            <Trophy className="w-5 h-5 text-amber-300" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <span>So Sánh Lực Học &amp; Phong Độ Các Lớp Cùng Khối</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                Toán THCS
              </span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Đối chiếu điểm kiểm tra, bài tập về nhà và tỷ lệ hoàn thành để phát hiện lớp bứt phá hoặc cần hỗ trợ
            </p>
          </div>
        </div>

        {/* Controls: Grade Tabs & Timeframe Selection */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Grade Level Selector */}
          {selectedGradeFilter === 'all' && (
            <div className="inline-flex p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
              {gradesList.map((g) => (
                <button
                  key={g}
                  onClick={() => setActiveGradeTab(g)}
                  className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all ${
                    activeGradeTab === g
                      ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  Khối {g}
                </button>
              ))}
            </div>
          )}

          {/* Timeframe Selector */}
          <div className="inline-flex p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setTimeframe('this_week')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                timeframe === 'this_week'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Tuần này
            </button>
            <button
              onClick={() => setTimeframe('last_2_weeks')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                timeframe === 'last_2_weeks'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              2 Tuần qua
            </button>
            <button
              onClick={() => setTimeframe('latest_4_sessions')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                timeframe === 'latest_4_sessions'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              4 Buổi gần nhất
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area: 2-Column Bento Grid */}
      {classItems.length === 0 ? (
        <div className="p-8 text-center bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
          <BookOpen className="w-8 h-8 text-slate-400 mx-auto mb-2 opacity-50" />
          <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300">
            Chưa có lớp học nào thuộc Khối {activeGradeTab}
          </h4>
          <p className="text-[11px] text-slate-400 mt-1">
            Vui lòng thêm lớp học hoặc chọn khối khác để xem thống kê so sánh.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left Column (7 cols): Grouped Bar Chart */}
          <div className="lg:col-span-7 space-y-3 bg-slate-50/70 dark:bg-slate-800/30 p-4 rounded-xl border border-slate-200/60 dark:border-slate-800/60">
            {/* Chart Title & Quick Legend */}
            <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  Biểu Đồ Đối Chiếu Điểm Các Lớp
                </span>
                <span className="text-[11px] text-slate-500 font-num">
                  ({classItems.length} lớp)
                </span>
              </div>

              <div className="flex items-center gap-3 text-[11px]">
                <span className="flex items-center gap-1 font-semibold text-indigo-600 dark:text-indigo-400">
                  <span className="w-2.5 h-2.5 rounded-sm bg-indigo-500 inline-block" />
                  Điểm Kiểm Tra
                </span>
                <span className="flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                  <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" />
                  Điểm BTVN
                </span>
                {gradeAvgTest > 0 && (
                  <span className="flex items-center gap-1 text-slate-500 dark:text-slate-400 font-num">
                    <span className="w-3 h-0.5 border-t-2 border-dashed border-purple-500 inline-block" />
                    Chuẩn Khối ({gradeAvgTest})
                  </span>
                )}
              </div>
            </div>

            {/* Recharts Bar Chart */}
            <div className="w-full h-64 pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={classItems}
                  margin={{ top: 12, right: 10, left: -20, bottom: 20 }}
                  barGap={4}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.15} />
                  <XAxis
                    dataKey="className"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    tickLine={false}
                    axisLine={{ stroke: '#cbd5e1' }}
                    interval={0}
                    tickFormatter={(val) => (val.length > 12 ? `${val.slice(0, 10)}..` : val)}
                  />
                  <YAxis
                    domain={[0, 10]}
                    ticks={[0, 2, 4, 6, 8, 10]}
                    tick={{ fontSize: 10, fill: '#64748b' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip content={<CustomBarTooltip />} />

                  {/* Reference Line for Grade Benchmark */}
                  {gradeAvgTest > 0 && (
                    <ReferenceLine
                      y={gradeAvgTest}
                      stroke="#8b5cf6"
                      strokeDasharray="4 4"
                      strokeWidth={1.5}
                      label={{
                        value: `TB Khối: ${gradeAvgTest}`,
                        position: 'insideTopRight',
                        fill: '#8b5cf6',
                        fontSize: 10,
                        fontWeight: 'bold',
                      }}
                    />
                  )}

                  <Bar
                    dataKey="avgTestScore"
                    name="Điểm KT TB"
                    fill="#6366f1"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={32}
                  />
                  <Bar
                    dataKey="avgHwScore"
                    name="Điểm BTVN TB"
                    fill="#10b981"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={32}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Benchmark Footer KPIs */}
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200/60 dark:border-slate-800/60 text-center">
              <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800">
                <div className="text-[10px] text-slate-400 font-medium">TB KT Khối {activeGradeTab}</div>
                <div className="text-sm font-extrabold text-indigo-600 dark:text-indigo-400 font-num mt-0.5">
                  {gradeAvgTest > 0 ? `${gradeAvgTest}/10` : 'Chưa có'}
                </div>
              </div>
              <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800">
                <div className="text-[10px] text-slate-400 font-medium">TB BTVN Khối {activeGradeTab}</div>
                <div className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400 font-num mt-0.5">
                  {gradeAvgHw > 0 ? `${gradeAvgHw}/10` : 'Chưa có'}
                </div>
              </div>
              <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800">
                <div className="text-[10px] text-slate-400 font-medium">Tỉ lệ nộp BTVN Khối</div>
                <div className="text-sm font-extrabold text-slate-800 dark:text-slate-200 font-num mt-0.5">
                  {benchmarkData.gradeAvgHwSubmission}%
                </div>
              </div>
            </div>
          </div>

          {/* Right Column (5 cols): Badges, Rankings & Actionable Insights */}
          <div className="lg:col-span-5 space-y-3">
            {/* Spotlight Cards (Top Performer & Watchlist) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2.5">
              {/* Top Performer Class */}
              {topPerformerClass && topPerformerClass.performanceScore > 0 ? (
                <div
                  onClick={() => handleClassClick(topPerformerClass.classId)}
                  className="p-3 bg-gradient-to-r from-amber-50 to-orange-50/60 dark:from-amber-950/30 dark:to-orange-950/20 border border-amber-200/80 dark:border-amber-800/60 rounded-xl cursor-pointer hover:shadow-xs transition-all group"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-amber-500 text-white shadow-xs">
                      <Trophy className="w-3 h-3" />
                      LỚP DẪN ĐẦU KHỐI {activeGradeTab}
                    </span>
                    <span className="text-xs font-bold text-amber-700 dark:text-amber-300 font-num flex items-center gap-1">
                      Score: {topPerformerClass.performanceScore}
                      <ChevronRight className="w-3.5 h-3.5 opacity-60 group-hover:translate-x-0.5 transition-transform" />
                    </span>
                  </div>
                  <div className="font-extrabold text-sm text-slate-900 dark:text-slate-100 truncate">
                    {topPerformerClass.className}
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-slate-600 dark:text-slate-400 font-num mt-1">
                    <span>
                      KT: <b className="text-indigo-600 dark:text-indigo-400">{topPerformerClass.avgTestScore}</b>
                    </span>
                    <span>
                      BTVN: <b className="text-emerald-600 dark:text-emerald-400">{topPerformerClass.avgHwScore}</b>
                    </span>
                    <span>
                      Nộp: <b>{topPerformerClass.hwSubmissionRate}%</b>
                    </span>
                  </div>
                </div>
              ) : null}

              {/* Most Improved Class */}
              {mostImprovedClass && mostImprovedClass.deltaTestScore ? (
                <div
                  onClick={() => handleClassClick(mostImprovedClass.classId)}
                  className="p-3 bg-gradient-to-r from-emerald-50 to-teal-50/60 dark:from-emerald-950/30 dark:to-teal-950/20 border border-emerald-200/80 dark:border-emerald-800/60 rounded-xl cursor-pointer hover:shadow-xs transition-all group"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-emerald-600 text-white shadow-xs">
                      <Flame className="w-3 h-3" />
                      BỨT PHÁ NHẤT
                    </span>
                    <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300 font-num flex items-center gap-1">
                      +{mostImprovedClass.deltaTestScore}đ KT
                      <ChevronRight className="w-3.5 h-3.5 opacity-60 group-hover:translate-x-0.5 transition-transform" />
                    </span>
                  </div>
                  <div className="font-extrabold text-sm text-slate-900 dark:text-slate-100 truncate">
                    {mostImprovedClass.className}
                  </div>
                  <div className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium mt-0.5">
                    Điểm kiểm tra tăng vọt so với các buổi học trước
                  </div>
                </div>
              ) : null}

              {/* Needs Support Class */}
              {needsSupportClass ? (
                <div
                  onClick={() => handleClassClick(needsSupportClass.classId)}
                  className="p-3 bg-gradient-to-r from-rose-50 to-red-50/60 dark:from-rose-950/30 dark:to-red-950/20 border border-rose-200/80 dark:border-rose-800/60 rounded-xl cursor-pointer hover:shadow-xs transition-all group"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-rose-600 text-white shadow-xs">
                      <AlertTriangle className="w-3 h-3" />
                      CẦN ĐÔN ĐỐC / PHỤ ĐẠO
                    </span>
                    <span className="text-xs font-bold text-rose-700 dark:text-rose-300 font-num flex items-center gap-1">
                      Score: {needsSupportClass.performanceScore}
                      <ChevronRight className="w-3.5 h-3.5 opacity-60 group-hover:translate-x-0.5 transition-transform" />
                    </span>
                  </div>
                  <div className="font-extrabold text-sm text-slate-900 dark:text-slate-100 truncate">
                    {needsSupportClass.className}
                  </div>
                  <div className="text-[11px] text-rose-700 dark:text-rose-400 font-medium mt-0.5">
                    {needsSupportClass.summaryInsight}
                  </div>
                </div>
              ) : null}
            </div>

            {/* Compact Ranking Table for All Classes in Grade */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 p-3 shadow-xs">
              <div className="text-xs font-bold text-slate-800 dark:text-slate-200 mb-2 flex items-center justify-between">
                <span>Bảng Xếp Hạng Lực Học ({classItems.length} Lớp)</span>
                <span className="text-[10px] text-slate-400 font-normal">Nhấp vào lớp để vào sổ điểm</span>
              </div>

              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {classItems.map((item) => (
                  <div
                    key={item.classId}
                    onClick={() => handleClassClick(item.classId)}
                    className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/60 border border-transparent hover:border-slate-200 dark:hover:border-slate-700 transition-all cursor-pointer text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`w-5 h-5 rounded-full text-center flex items-center justify-center font-bold text-[10px] shrink-0 font-num ${
                          item.rank === 1
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200 font-black'
                            : item.rank === 2
                            ? 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
                            : item.rank === 3
                            ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                            : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                        }`}
                      >
                        {item.rank}
                      </span>
                      <div className="truncate">
                        <div className="font-bold text-slate-800 dark:text-slate-200 truncate" title={item.className}>
                          {item.className}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate">
                          {item.studentCount} HS • {item.summaryInsight}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 font-num pl-2">
                      <div className="text-right">
                        <div className="font-extrabold text-indigo-600 dark:text-indigo-400">
                          {item.avgTestScore > 0 ? `${item.avgTestScore}đ` : '-'}
                        </div>
                        <div className="text-[9.5px] text-emerald-600 dark:text-emerald-400">
                          BTVN {item.avgHwScore > 0 ? `${item.avgHwScore}đ` : '-'}
                        </div>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
