import React from 'react';
import { TodayClassInfo } from '../../services/dashboardService';
import {
  Calendar,
  Users,
  Clock,
  ChevronRight,
  BookOpen,
  CheckCircle2,
  Sparkles,
  PlusCircle,
  AlertCircle,
} from 'lucide-react';

interface TodayClassesCardProps {
  todayClasses: TodayClassInfo[];
  onSelectClassForGradeEntry: (classId: string) => void;
  onNavigateToClasses: () => void;
}

export const TodayClassesCard: React.FC<TodayClassesCardProps> = ({
  todayClasses,
  onSelectClassForGradeEntry,
  onNavigateToClasses,
}) => {
  // Only display classes that are scheduled for today
  const classesToday = todayClasses.filter((c) => c.isToday);

  return (
    <div className="bg-white dark:bg-slate-900/90 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden flex flex-col h-full">
      {/* Header */}
      <div className="p-3.5 px-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-200/50 dark:ring-emerald-800/50 flex items-center justify-center">
            <Calendar className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <span>Lớp Học Hôm Nay</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold font-num bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                {classesToday.length} lớp
              </span>
            </h2>
          </div>
        </div>

        <button
          onClick={onNavigateToClasses}
          className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 flex items-center gap-1 transition-colors"
        >
          <span>Quản lý lớp</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Body List */}
      <div className="p-3 divide-y divide-slate-100 dark:divide-slate-800/80 flex-1 overflow-y-auto max-h-[380px]">
        {classesToday.length === 0 ? (
          <div className="py-8 text-center text-slate-400 dark:text-slate-500 text-xs">
            <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-500 opacity-60" />
            <p className="font-bold text-slate-700 dark:text-slate-300">Hôm nay không có lớp học theo lịch</p>
            <p className="text-[11px] mt-0.5 text-slate-400 font-medium">
              Tổng số lớp đang hoạt động trong hệ thống là <span className="font-num text-slate-600 dark:text-slate-300">{todayClasses.length}</span> lớp.
            </p>
          </div>
        ) : (
          classesToday.map((item, idx) => {
            const classItem = item.classItem;
            const isGraded = item.latestSessionGradedCount && item.latestSessionGradedCount > 0;

            return (
              <div
                key={classItem.id ? `${classItem.id}-${idx}` : idx}
                className="py-3 px-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/80 dark:hover:bg-slate-800/50 rounded-lg transition-all duration-150 group"
              >
                {/* Left info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-slate-900 dark:text-slate-100 truncate group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                      {classItem.class_name}
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shrink-0">
                      Khối {classItem.grade_level}
                    </span>
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 shrink-0 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                      Đang học
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-300 font-num">
                      <Clock className="w-3 h-3 text-emerald-500" />
                      {item.scheduleText}
                    </span>
                    <span className="flex items-center gap-1 font-num">
                      <Users className="w-3 h-3 text-slate-400" />
                      {item.studentCount} học sinh
                    </span>
                    {item.latestSession && (
                      <span className="text-slate-400 truncate max-w-[200px]">
                        • {item.latestSession.lesson_title || item.latestSession.session_date}
                      </span>
                    )}
                  </div>
                </div>

                {/* Right Action */}
                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  {item.latestSession ? (
                    <div className="text-right hidden md:block mr-1">
                      <div className="text-[11px] font-bold font-num text-slate-700 dark:text-slate-300">
                        {item.latestSessionGradedCount} / {item.studentCount} đã chấm
                      </div>
                      <div className="text-[10px] font-num text-slate-400">
                        {item.latestSession.session_date}
                      </div>
                    </div>
                  ) : null}

                  <button
                    onClick={() => classItem.id && onSelectClassForGradeEntry(classItem.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs transition-all active:scale-95"
                  >
                    <BookOpen className="w-3.5 h-3.5 text-white" />
                    <span>Chấm điểm ngay</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
