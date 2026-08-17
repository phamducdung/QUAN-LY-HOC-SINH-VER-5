import React, { useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import { GradeTrendData, SessionScorePoint } from '../../services/dashboardService';
import { GradeLevel } from '../../types';
import { TrendingUp, LayoutGrid, Layers, Info, Award, BookOpen } from 'lucide-react';

interface GradeTrendChartsProps {
  gradeTrends: Record<GradeLevel, GradeTrendData>;
  selectedGradeFilter: GradeLevel | 'all';
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data: SessionScorePoint = payload[0].payload;
    return (
      <div className="bg-slate-900/95 dark:bg-slate-950/95 backdrop-blur-xs text-slate-100 p-3 rounded-xl shadow-xl border border-slate-800 text-xs max-w-xs z-50">
        <div className="font-bold text-slate-100 border-b border-slate-800/80 pb-1.5 mb-2 flex items-center justify-between gap-2">
          <span className="truncate">{data.lessonTitle || label}</span>
          <span className="text-[10px] text-slate-400 font-normal font-num shrink-0">{data.formattedDate}</span>
        </div>
        <div className="space-y-1.5 font-medium">
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block shadow-xs" />
              Điểm BTVN TB:
            </span>
            <span className="font-bold font-num text-emerald-300">{data.avgHomework} / 10</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-indigo-400 font-semibold">
              <span className="w-2 h-2 rounded-full bg-indigo-400 inline-block shadow-xs" />
              Điểm Kiểm tra TB:
            </span>
            <span className="font-bold font-num text-indigo-300">{data.avgTest} / 10</span>
          </div>
          {data.submittedHwRate !== undefined && (
            <div className="text-[10px] text-slate-400 pt-1.5 border-t border-slate-800/80 flex justify-between font-num">
              <span>Tỉ lệ nộp bài:</span>
              <span className="font-bold text-slate-200">{data.submittedHwRate}%</span>
            </div>
          )}
        </div>
      </div>
    );
  }
  return null;
};

interface SingleGradeChartCardProps {
  trendData: GradeTrendData;
}

const SingleGradeChartCard: React.FC<SingleGradeChartCardProps> = ({ trendData }) => {
  const { gradeLevel, gradeName, dataPoints, hasData, overallAvgHw, overallAvgTest } = trendData;

  return (
    <div className="bg-white dark:bg-slate-900/90 rounded-xl border border-slate-200/80 dark:border-slate-800 p-4 shadow-xs flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 dark:border-slate-800 mb-2">
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
            {gradeName}
          </span>
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            {dataPoints.length > 0 ? `4 buổi học mới nhất` : 'Chưa có buổi học'}
          </span>
        </div>

        {hasData && (
          <div className="flex items-center gap-3 text-[11px] font-num">
            <span className="flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              BTVN: {overallAvgHw}
            </span>
            <span className="flex items-center gap-1 font-bold text-indigo-600 dark:text-indigo-400">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
              KT: {overallAvgTest}
            </span>
          </div>
        )}
      </div>

      {/* Chart Area */}
      <div className="flex-1 min-h-[190px] w-full pt-2">
        {!hasData || dataPoints.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 text-xs py-8">
            <BookOpen className="w-6 h-6 mb-1.5 opacity-40 text-slate-400" />
            <p className="font-medium">Chưa có dữ liệu điểm 4 buổi gần nhất cho {gradeName}</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={190}>
            <LineChart data={dataPoints} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.6} />
              <XAxis
                dataKey="formattedDate"
                tick={{ fontSize: 11, fill: '#64748b', fontFamily: 'JetBrains Mono' }}
                tickLine={false}
                axisLine={{ stroke: '#cbd5e1' }}
              />
              <YAxis
                domain={[0, 10]}
                ticks={[0, 2, 4, 6, 8, 10]}
                tick={{ fontSize: 11, fill: '#64748b', fontFamily: 'JetBrains Mono' }}
                tickLine={false}
                axisLine={{ stroke: '#cbd5e1' }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Line
                type="monotone"
                dataKey="avgHomework"
                name="Điểm BTVN"
                stroke="#10b981"
                strokeWidth={2.5}
                dot={{ r: 4, fill: '#10b981', strokeWidth: 1.5, stroke: '#ffffff' }}
                activeDot={{ r: 6, fill: '#10b981' }}
              />
              <Line
                type="monotone"
                dataKey="avgTest"
                name="Điểm Kiểm Tra"
                stroke="#6366f1"
                strokeWidth={2.5}
                dot={{ r: 4, fill: '#6366f1', strokeWidth: 1.5, stroke: '#ffffff' }}
                activeDot={{ r: 6, fill: '#6366f1' }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Footer labels */}
      {hasData && (
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1 truncate max-w-[220px]">
            <span className="font-medium">Buổi gần nhất:</span>
            <strong className="text-slate-700 dark:text-slate-300 truncate font-semibold">
              {dataPoints[dataPoints.length - 1]?.lessonTitle || ''}
            </strong>
          </div>
          <span className="text-[10px] font-num text-slate-400 shrink-0">
            {dataPoints[dataPoints.length - 1]?.formattedDate}
          </span>
        </div>
      )}
    </div>
  );
};

export const GradeTrendCharts: React.FC<GradeTrendChartsProps> = ({
  gradeTrends,
  selectedGradeFilter,
}) => {
  const [viewMode, setViewMode] = useState<'grid' | 'tabs'>('grid');
  const [activeTabGrade, setActiveTabGrade] = useState<GradeLevel>(
    selectedGradeFilter !== 'all' ? selectedGradeFilter : 9
  );

  const gradeList: GradeLevel[] = [6, 7, 8, 9];

  // If a specific grade is filtered from header, show that or filtered subset
  const displayedGrades: GradeLevel[] =
    selectedGradeFilter === 'all' ? gradeList : [selectedGradeFilter];

  return (
    <div className="space-y-3">
      {/* Section Top Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
            <TrendingUp className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              Xu Hướng Điểm Bài BTVN &amp; Kiểm Tra (4 Buổi Mới Nhất)
            </h2>
          </div>
        </div>

        {/* Legend & Layout Toggle */}
        <div className="flex items-center gap-3 self-end sm:self-center">
          {/* Chart Legend */}
          <div className="flex items-center gap-3 text-xs bg-slate-50 dark:bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700/60">
            <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 font-medium">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
              Điểm BTVN
            </span>
            <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 font-medium">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 inline-block" />
              Điểm Kiểm Tra
            </span>
          </div>

          {/* Toggle View mode (Grid vs Tabs) when All Grades are selected */}
          {selectedGradeFilter === 'all' && (
            <div className="inline-flex items-center p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setViewMode('grid')}
                title="Xem lưới 4 khối"
                className={`p-1.5 rounded-md text-xs font-semibold transition-all ${
                  viewMode === 'grid'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setViewMode('tabs')}
                title="Xem từng khối dạng Tab"
                className={`p-1.5 rounded-md text-xs font-semibold transition-all ${
                  viewMode === 'tabs'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Charts Display */}
      {selectedGradeFilter !== 'all' ? (
        // When filtered to single grade, show wide detailed card
        <div className="grid grid-cols-1 gap-4">
          <SingleGradeChartCard trendData={gradeTrends[selectedGradeFilter]} />
        </div>
      ) : viewMode === 'grid' ? (
        // 4 Grade Charts in 2x2 Responsive Grid
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {gradeList.map((grade) => (
            <SingleGradeChartCard key={grade} trendData={gradeTrends[grade]} />
          ))}
        </div>
      ) : (
        // Tabs Mode
        <div className="space-y-3">
          <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-800 pb-1">
            {gradeList.map((g) => (
              <button
                key={g}
                onClick={() => setActiveTabGrade(g)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  activeTabGrade === g
                    ? 'bg-slate-900 text-white dark:bg-emerald-600'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                Khối {g}
              </button>
            ))}
          </div>
          <SingleGradeChartCard trendData={gradeTrends[activeTabGrade]} />
        </div>
      )}
    </div>
  );
};
