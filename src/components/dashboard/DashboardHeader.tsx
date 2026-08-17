import React from 'react';
import { GradeLevel } from '../../types';
import { Calendar } from 'lucide-react';

interface DashboardHeaderProps {
  selectedGrade: GradeLevel | 'all';
  onGradeChange: (grade: GradeLevel | 'all') => void;
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  selectedGrade,
  onGradeChange,
}) => {
  const getFormattedDate = () => {
    const now = new Date();
    const days = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
    const dayName = days[now.getDay()];
    const dateStr = now.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    return `${dayName}, ${dateStr}`;
  };

  const grades: (GradeLevel | 'all')[] = ['all', 6, 7, 8, 9];

  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-3 border-b border-slate-200/80 dark:border-slate-800">
      {/* Title & Greeting */}
      <div>
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-slate-100/90 dark:bg-slate-800/90 text-slate-700 dark:text-slate-300 ring-1 ring-slate-200/60 dark:ring-slate-700/60">
            <Calendar className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="font-semibold font-num text-slate-800 dark:text-slate-200">{getFormattedDate()}</span>
          </div>
        </div>
      </div>

      {/* Grade Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center p-1 bg-slate-100/80 dark:bg-slate-800/80 rounded-xl border border-slate-200/80 dark:border-slate-700/60 shadow-inner">
          {grades.map((g) => (
            <button
              key={g}
              onClick={() => onGradeChange(g)}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all duration-200 ${
                selectedGrade === g
                  ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-xs ring-1 ring-slate-200/80 dark:ring-slate-700/80'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              {g === 'all' ? 'Tất cả khối' : `Khối ${g}`}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
