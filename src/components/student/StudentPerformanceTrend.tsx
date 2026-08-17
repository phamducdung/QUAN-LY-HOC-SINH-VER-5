import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import {
  TrendingUp,
  Activity,
  Target,
  Sparkles,
  BarChart2,
  Flame,
} from 'lucide-react';
import {
  TrendSessionPoint,
  generatePerformanceTrendSeries,
  analyzePerformanceInsights,
} from '../../utils/performanceTrendEngine';

interface StudentPerformanceTrendProps {
  rawHistory: {
    session: string;
    sessionFullName?: string;
    date?: string;
    hwScore: number | null;
    testScore: number | null;
  }[];
  targetDescription?: string;
  className?: string;
}

export const StudentPerformanceTrend: React.FC<StudentPerformanceTrendProps> = ({
  rawHistory,
  targetDescription = 'Thi vào Lớp 10 Công lập 8.0+',
  className = '',
}) => {
  // Chart Display Toggles
  const [showSma3, setShowSma3] = useState<boolean>(true);
  const [showSma5, setShowSma5] = useState<boolean>(false);
  const [showHwLine, setShowHwLine] = useState<boolean>(true);
  const [showBenchmark, setShowBenchmark] = useState<boolean>(true);

  // Parse Target Benchmark Score
  const targetVal = useMemo(() => {
    const match = targetDescription.match(/(\d+(\.\d+)?)/);
    return match ? parseFloat(match[1]) : 8.0;
  }, [targetDescription]);

  // Compute Trend Series with SMA
  const trendSeries = useMemo(() => {
    return generatePerformanceTrendSeries(rawHistory, targetVal);
  }, [rawHistory, targetVal]);

  // Analyze Comprehensive Insights
  const insights = useMemo(() => {
    return analyzePerformanceInsights(trendSeries, targetVal);
  }, [trendSeries, targetVal]);

  if (!rawHistory || rawHistory.length === 0) {
    return (
      <div className="bg-slate-50 dark:bg-slate-800/40 p-8 rounded-2xl border border-slate-200 dark:border-slate-800 text-center space-y-2">
        <Activity className="w-10 h-10 text-slate-400 mx-auto opacity-50" />
        <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">
          Chưa Có Dữ Liệu Điểm Số
        </h4>
        <p className="text-xs text-slate-500 max-w-sm mx-auto">
          Học sinh chưa có buổi kiểm tra hoặc làm bài tập nào được ghi nhận để phân tích phong độ và đường trung bình động.
        </p>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* 1. Main Performance Trend Chart Card */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        {/* Chart Header & Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-100 dark:border-slate-800/80">
          <div className="space-y-0.5">
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-violet-600 dark:text-violet-400" />
              <span>Biểu Đồ Phong Độ & Đường Trung Bình Động (Moving Average)</span>
            </h4>
            <p className="text-[11px] text-slate-400">
              Đường SMA làm mịn biến động từng buổi, phản ánh thực lực cốt lõi và xu thế phát triển dài hạn.
            </p>
          </div>

          {/* Quick Filter Toggles */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setShowSma3(!showSma3)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all flex items-center gap-1.5 ${
                showSma3
                  ? 'bg-violet-50 text-violet-700 border-violet-300 dark:bg-violet-950/50 dark:text-violet-300 dark:border-violet-700 shadow-xs'
                  : 'bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700 opacity-60'
              }`}
              title="Đường Trung bình động 3 buổi gần nhất (SMA-3)"
            >
              <span className="w-2 h-2 rounded-full bg-violet-600 dark:bg-violet-400" />
              <span>SMA-3 (Làm mịn)</span>
            </button>

            <button
              onClick={() => setShowSma5(!showSma5)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all flex items-center gap-1.5 ${
                showSma5
                  ? 'bg-indigo-50 text-indigo-700 border-indigo-300 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-700 shadow-xs'
                  : 'bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700 opacity-60'
              }`}
              title="Đường Trung bình động 5 buổi dài hạn (SMA-5)"
            >
              <span className="w-2 h-2 rounded-full bg-indigo-500" />
              <span>SMA-5</span>
            </button>

            <button
              onClick={() => setShowHwLine(!showHwLine)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all flex items-center gap-1.5 ${
                showHwLine
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-700 shadow-xs'
                  : 'bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700 opacity-60'
              }`}
              title="Bật/Tắt đường điểm BTVN"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>Điểm BTVN</span>
            </button>

            <button
              onClick={() => setShowBenchmark(!showBenchmark)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all flex items-center gap-1.5 ${
                showBenchmark
                  ? 'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-700 shadow-xs'
                  : 'bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700 opacity-60'
              }`}
              title="Đường Điểm chuẩn mục tiêu lớp học"
            >
              <Target className="w-3 h-3 text-amber-600" />
              <span>Mục tiêu ({targetVal}đ)</span>
            </button>
          </div>
        </div>

        {/* The Recharts Visual Canvas */}
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={trendSeries}
              margin={{ top: 15, right: 15, left: -20, bottom: 5 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="#e2e8f0"
                className="dark:stroke-slate-800"
              />
              <XAxis
                dataKey="session"
                tick={{ fontSize: 11, fill: '#64748b' }}
                tickLine={false}
              />
              <YAxis
                domain={[0, 10]}
                ticks={[0, 2, 4, 6, 8, 10]}
                tick={{ fontSize: 11, fill: '#64748b' }}
                tickLine={false}
              />

              {/* Ngưỡng Báo động Cần Cải Thiện (Dưới 5.0đ) */}
              <ReferenceLine
                y={5.0}
                stroke="#f43f5e"
                strokeDasharray="2 2"
                strokeWidth={1}
                strokeOpacity={0.6}
              />

              {/* Đường Ngưỡng Mục tiêu Benchmark */}
              {showBenchmark && (
                <ReferenceLine
                  y={targetVal}
                  stroke="#f59e0b"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  label={{
                    value: `Chuẩn: ${targetVal}đ`,
                    position: 'top',
                    fill: '#d97706',
                    fontSize: 10,
                    fontWeight: 700,
                  }}
                />
              )}

              {/* Custom Tooltip */}
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload || !payload.length) return null;
                  const data = payload[0].payload as TrendSessionPoint;
                  return (
                    <div className="bg-slate-900/95 backdrop-blur-md text-white p-3 rounded-xl border border-slate-700 shadow-xl text-xs space-y-1.5 min-w-[200px]">
                      <div className="flex justify-between items-center border-b border-slate-700/80 pb-1.5">
                        <span className="font-bold text-slate-200">{label}</span>
                        {data.date && (
                          <span className="text-[10px] text-slate-400">{data.date}</span>
                        )}
                      </div>
                      {data.sessionFullName && (
                        <p className="text-[10.5px] text-slate-300 font-medium truncate max-w-[220px]">
                          {data.sessionFullName}
                        </p>
                      )}
                      <div className="space-y-1 pt-1">
                        {data.testScore !== null && (
                          <div className="flex justify-between items-center text-[11px]">
                            <span className="text-sky-400 font-bold flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full bg-sky-400 inline-block" />
                              Điểm Kiểm Tra:
                            </span>
                            <span className="font-extrabold text-white">
                              {data.testScore}đ
                            </span>
                          </div>
                        )}
                        {data.hwScore !== null && showHwLine && (
                          <div className="flex justify-between items-center text-[11px]">
                            <span className="text-emerald-400 font-bold flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                              Điểm BTVN:
                            </span>
                            <span className="font-extrabold text-white">
                              {data.hwScore}đ
                            </span>
                          </div>
                        )}
                        {data.testSma3 !== null && showSma3 && (
                          <div className="flex justify-between items-center text-[11px]">
                            <span className="text-violet-300 font-bold flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full bg-violet-400 inline-block" />
                              SMA-3 (Xu thế):
                            </span>
                            <span className="font-extrabold text-violet-200">
                              {data.testSma3}đ
                            </span>
                          </div>
                        )}
                        {data.testSma5 !== null && showSma5 && (
                          <div className="flex justify-between items-center text-[11px]">
                            <span className="text-indigo-300 font-bold flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full bg-indigo-400 inline-block" />
                              SMA-5:
                            </span>
                            <span className="font-extrabold text-indigo-200">
                              {data.testSma5}đ
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }}
              />

              {/* 1. Actual Test Score Line (Blue) */}
              <Line
                type="monotone"
                dataKey="testScore"
                name="Điểm Kiểm Tra"
                stroke="#0284c7"
                strokeWidth={2.5}
                dot={{ r: 4, fill: '#0284c7', strokeWidth: 1.5, stroke: '#ffffff' }}
                activeDot={{ r: 7, fill: '#0284c7' }}
                connectNulls
              />

              {/* 2. Actual Homework Score Line (Emerald) */}
              {showHwLine && (
                <Line
                  type="monotone"
                  dataKey="hwScore"
                  name="Điểm BTVN"
                  stroke="#10b981"
                  strokeWidth={2}
                  strokeOpacity={0.85}
                  dot={{ r: 3, fill: '#10b981', strokeWidth: 1, stroke: '#ffffff' }}
                  activeDot={{ r: 6, fill: '#10b981' }}
                  connectNulls
                />
              )}

              {/* 3. Moving Average SMA-3 Line (Violet) */}
              {showSma3 && (
                <Line
                  type="monotone"
                  dataKey="testSma3"
                  name="SMA-3 (TB Động 3 buổi)"
                  stroke="#8b5cf6"
                  strokeWidth={3}
                  strokeDasharray="5 5"
                  dot={false}
                  activeDot={{ r: 6, fill: '#8b5cf6' }}
                  connectNulls
                />
              )}

              {/* 4. Moving Average SMA-5 Line (Indigo) */}
              {showSma5 && (
                <Line
                  type="monotone"
                  dataKey="testSma5"
                  name="SMA-5 (Dài hạn)"
                  stroke="#6366f1"
                  strokeWidth={2.5}
                  strokeDasharray="3 3"
                  dot={false}
                  activeDot={{ r: 5, fill: '#6366f1' }}
                  connectNulls
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Legend Summary Footer */}
        <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100 dark:border-slate-800/80">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-1 bg-sky-600 rounded-full" />
              <span>Điểm KT thực tế</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-1 bg-emerald-500 rounded-full" />
              <span>Điểm BTVN</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-1 bg-violet-500 border-b border-dashed border-violet-400 rounded-full" />
              <span>SMA-3 (Xu thế thực lực)</span>
            </span>
          </div>
          <div className="font-bold text-slate-700 dark:text-slate-300">
            Hiện tại (SMA-3): <span className="text-violet-600 dark:text-violet-400 font-extrabold">{insights.currentTestSma3 ? `${insights.currentTestSma3}đ` : 'N/A'}</span>
          </div>
        </div>
      </div>

      {/* 2. Target Progress Benchmark Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
              Mục tiêu Lớp Học:
            </span>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
              {targetDescription}
            </span>
          </div>
          <span
            className={`px-2.5 py-1 text-[10px] font-extrabold rounded-lg ${
              insights.avgTest === 0
                ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                : insights.targetGap >= 0
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200/50'
                : insights.targetGap >= -1.0
                ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200/50'
                : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-200/50'
            }`}
          >
            {insights.avgTest === 0
              ? 'Chưa đủ dữ liệu'
              : insights.targetGap >= 0
              ? `Vượt mục tiêu (+${insights.targetGap}đ)`
              : `Tiệm cận (thiếu ${Math.abs(insights.targetGap)}đ)`}
          </span>
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between text-[11px] font-bold text-slate-500">
            <span>Tiến độ đạt điểm chuẩn</span>
            <span className="text-slate-800 dark:text-slate-200">
              {insights.targetPercent}%
            </span>
          </div>
          <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2.5 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                insights.targetGap >= 0
                  ? 'bg-emerald-500'
                  : insights.targetGap >= -1.0
                  ? 'bg-amber-500'
                  : 'bg-rose-500'
              }`}
              style={{ width: `${insights.targetPercent}%` }}
            />
          </div>
          <div className="flex justify-between items-center pt-1 text-[10px] text-slate-400">
            <span>
              Điểm TB hiện tại:{' '}
              <strong className="text-slate-700 dark:text-slate-300 font-bold">
                {insights.avgTest > 0 ? `${insights.avgTest}đ` : 'N/A'}
              </strong>
            </span>
            <span>
              Điểm chuẩn mục tiêu:{' '}
              <strong className="text-slate-700 dark:text-slate-300 font-bold">
                {insights.targetVal}đ
              </strong>
            </span>
          </div>
        </div>
      </div>

      {/* 3. Deep Performance Analytics 4-Card Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Card 1: Xu Hướng & Vận Tốc Điểm Số */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 text-amber-500" />
              <span>Xu Hướng & Vận Tốc Điểm</span>
            </span>
            <span
              className={`text-[10px] font-extrabold px-2 py-0.5 rounded ${
                insights.trendStatus === 'breakthrough' || insights.trendStatus === 'improving'
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                  : insights.trendStatus === 'declining'
                  ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                  : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              {insights.velocityScore > 0
                ? `+${insights.velocityScore}đ/chu kỳ`
                : `${insights.velocityScore}đ/chu kỳ`}
            </span>
          </div>
          <h5 className="text-xs font-bold text-slate-800 dark:text-slate-200">
            {insights.trendTitle}
          </h5>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            {insights.trendDescription}
          </p>
        </div>

        {/* Card 2: Độ Ổn Định Phong Độ (Consistency Score) */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-sky-500" />
              <span>Chỉ Số Vững Vàng (Ổn Định)</span>
            </span>
            <span className="text-[10px] font-bold text-slate-400 font-mono">
              σ = {insights.standardDeviation}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <h5 className={`text-xs font-bold ${insights.consistencyColor}`}>
              {insights.consistencyLevel}
            </h5>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            {insights.standardDeviation < 1.0
              ? 'Phong độ thi cử rất đều tay, ít bị ảnh hưởng tâm lý hay dao động đề bài.'
              : insights.standardDeviation < 1.8
              ? 'Điểm số dao động trong ngưỡng chấp nhận được giữa các dạng bài.'
              : 'Độ lệch chuẩn cao (≥ 1.8đ), có hiện tượng học tủ hoặc tâm lý thi không vững.'}
          </p>
        </div>

        {/* Card 3: Tương Quan Thi vs BTVN */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <BarChart2 className="w-3.5 h-3.5 text-indigo-500" />
              <span>Tương Quan Thi vs BTVN</span>
            </span>
            <span className="text-[10px] font-extrabold text-slate-500">
              Lệch: {insights.gapAnalysis.gapDiff}đ
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <div>
              <span className="text-[10px] text-slate-400 block">TB BTVN</span>
              <span className="font-extrabold text-emerald-600 dark:text-emerald-400">
                {insights.avgHw > 0 ? `${insights.avgHw}đ` : 'N/A'}
              </span>
            </div>
            <div className="text-slate-300 dark:text-slate-700">vs</div>
            <div>
              <span className="text-[10px] text-slate-400 block">TB Kiểm Tra</span>
              <span className="font-extrabold text-sky-600 dark:text-sky-400">
                {insights.avgTest > 0 ? `${insights.avgTest}đ` : 'N/A'}
              </span>
            </div>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            {insights.gapAnalysis.gapDescription}
          </p>
        </div>

        {/* Card 4: Dự Báo Điểm Kỳ Vọng Buổi Tới */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-2 bg-gradient-to-br from-violet-50/40 to-indigo-50/40 dark:from-slate-900 dark:to-indigo-950/20">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold text-violet-700 dark:text-violet-400 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-violet-600" />
              <span>Dự Báo Kỳ Vọng Buổi Tới</span>
            </span>
            <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300">
              Độ tin cậy: {insights.forecast.confidence}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-black font-num text-violet-700 dark:text-violet-300">
              {insights.forecast.expectedMin} – {insights.forecast.expectedMax}đ
            </span>
            <span className="text-[10px] text-slate-500 font-medium">
              (Kỳ vọng tâm: ~{insights.forecast.expectedCenter}đ)
            </span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            Dự báo dựa trên 65% trọng số SMA-3 gần nhất và phân phối độ lệch chuẩn thực tế.
          </p>
        </div>
      </div>
    </div>
  );
};
