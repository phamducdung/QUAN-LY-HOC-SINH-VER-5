import React from 'react';
import { DashboardMetrics } from '../../services/dashboardService';
import {
  BookOpen,
  Users,
  CheckCircle2,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';

interface DashboardKpiCardsProps {
  metrics: DashboardMetrics;
  onNavigateToClasses: () => void;
  onNavigateToStudents: () => void;
  onNavigateToGradeEntry: () => void;
  onNavigateToWarnings?: (filter?: string) => void;
}

export const DashboardKpiCards: React.FC<DashboardKpiCardsProps> = ({
  metrics,
  onNavigateToClasses,
  onNavigateToGradeEntry,
}) => {
  return (
    <div className="space-y-3.5">
      {/* 3 Core KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Card 1: Module 7 - Quy mô Lớp & Sĩ số */}
        <div
          onClick={onNavigateToClasses}
          className="group relative bg-white dark:bg-slate-900/90 p-4.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs hover:shadow-md hover:border-blue-300/80 dark:hover:border-blue-800/80 hover:-translate-y-0.5 transition-all duration-200 cursor-pointer flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 tracking-wider uppercase">
                Quy mô & Lớp học
              </span>
              <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 ring-1 ring-blue-200/50 dark:ring-blue-800/50 flex items-center justify-center">
                <BookOpen className="w-4.5 h-4.5" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-3xl font-black font-num tracking-tight text-slate-900 dark:text-slate-100">
                {metrics.activeClassesCount}
                <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 ml-1.5 font-sans">
                  lớp đang mở
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <Users className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                <span className="font-semibold text-slate-700 dark:text-slate-300 font-num">
                  {metrics.activeStudentsCount}
                </span>
                <span>học sinh đang theo học</span>
              </div>
            </div>
          </div>

          <div className="pt-3 mt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <span>Sĩ số trung bình ~<strong className="text-slate-700 dark:text-slate-300 font-num">{metrics.averageClassSize}</strong> HS/lớp</span>
            <div className="flex items-center gap-1 text-blue-600 dark:text-blue-400 font-semibold group-hover:translate-x-0.5 transition-transform">
              <span>Chi tiết</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </div>
          </div>
        </div>

        {/* Card 2: Module 6 - Điểm TB Kiểm Tra Toàn Trung Tâm */}
        <div
          onClick={onNavigateToGradeEntry}
          className="group relative bg-white dark:bg-slate-900/90 p-4.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs hover:shadow-md hover:border-sky-300/80 dark:hover:border-sky-800/80 hover:-translate-y-0.5 transition-all duration-200 cursor-pointer flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 tracking-wider uppercase">
                Điểm TB Kiểm Tra Toàn Trung Tâm
              </span>
              <div className="w-9 h-9 rounded-xl bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 ring-1 ring-sky-200/50 dark:ring-sky-800/50 flex items-center justify-center">
                <TrendingUp className="w-4.5 h-4.5" />
              </div>
            </div>
            <div className="mt-3">
              <div className="flex items-baseline gap-1.5">
                <span
                  className={`text-3xl font-black font-num tracking-tight ${
                    metrics.centerAvgTestScore >= 8.0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : metrics.centerAvgTestScore >= 6.5
                      ? 'text-sky-600 dark:text-sky-400'
                      : metrics.centerAvgTestScore >= 5.0
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {metrics.centerAvgTestScore > 0 ? `${metrics.centerAvgTestScore}` : 'N/A'}
                </span>
                {metrics.centerAvgTestScore > 0 && (
                  <span className="text-xs font-bold text-slate-400 font-sans">/10đ</span>
                )}
              </div>
              <div className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <span className="text-emerald-600 dark:text-emerald-400 font-bold font-num">
                  {metrics.excellentCount}
                </span>
                <span>lượt đạt Xuất sắc (≥8.5đ)</span>
              </div>
            </div>
          </div>

          <div className="pt-3 mt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs">
            <span className="text-slate-400">
              {metrics.totalGradedSessions > 0
                ? `${metrics.totalGradedSessions} lượt thi`
                : 'Chưa có bài thi'}
            </span>
            <span
              className={`font-bold ${
                metrics.centerAvgTestScore >= 8.0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : metrics.centerAvgTestScore >= 6.5
                  ? 'text-sky-600 dark:text-sky-400'
                  : 'text-amber-600 dark:text-amber-400'
              }`}
            >
              {metrics.centerAvgTestScore >= 8.0
                ? 'Chất lượng cao'
                : metrics.centerAvgTestScore >= 6.5
                ? 'Khá tốt'
                : 'Cần chú trọng'}
            </span>
          </div>
        </div>

        {/* Card 3: Module 6 - Hoàn thành BTVN & Chuyên cần */}
        <div
          onClick={onNavigateToGradeEntry}
          className="group relative bg-white dark:bg-slate-900/90 p-4.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs hover:shadow-md hover:border-emerald-300/80 dark:hover:border-emerald-800/80 hover:-translate-y-0.5 transition-all duration-200 cursor-pointer flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 tracking-wider uppercase">
                Hoàn thành BTVN & Chuyên cần
              </span>
              <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-200/50 dark:ring-emerald-800/50 flex items-center justify-center">
                <CheckCircle2 className="w-4.5 h-4.5" />
              </div>
            </div>
            <div className="mt-3">
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-black font-num tracking-tight text-emerald-600 dark:text-emerald-400">
                  {metrics.homeworkCompletionRate}%
                </span>
                <span className="text-xs font-semibold text-slate-400 font-num">
                  (Điểm TB BTVN: {metrics.centerAvgHwScore > 0 ? `${metrics.centerAvgHwScore}đ` : 'N/A'})
                </span>
              </div>
              {/* Progress bar */}
              <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full mt-2.5 overflow-hidden ring-1 ring-slate-200/40 dark:ring-slate-700/40">
                <div
                  className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${metrics.homeworkCompletionRate}%` }}
                />
              </div>
            </div>
          </div>

          <div className="pt-3 mt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <span>
              {metrics.submittedHomeworkCount}/{metrics.totalHomeworkCount} bài đã nộp
            </span>
            <span className="text-emerald-600 dark:text-emerald-400 font-bold font-num">
              Chuyên cần {metrics.attendanceRate}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
