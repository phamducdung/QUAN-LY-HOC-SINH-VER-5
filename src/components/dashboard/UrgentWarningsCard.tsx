import React from 'react';
import { Warning, Student, ClassItem } from '../../types';
import { ShieldAlert, ArrowRight, CheckCircle2, AlertTriangle, User, ChevronRight } from 'lucide-react';

interface UrgentWarningsCardProps {
  warnings: Warning[];
  students: Student[];
  classes: ClassItem[];
  onOpenWarnings: () => void;
  onResolveWarning: (warning: Warning) => void;
}

export const UrgentWarningsCard: React.FC<UrgentWarningsCardProps> = ({
  warnings,
  students,
  classes,
  onOpenWarnings,
  onResolveWarning,
}) => {
  const studentMap = new Map<string, Student>();
  students.forEach((s) => s.id && studentMap.set(s.id, s));

  const classMap = new Map<string, ClassItem>();
  classes.forEach((c) => c.id && classMap.set(c.id, c));

  const unresolvedWarnings = warnings.filter((w) => !w.resolved);
  const p1Warnings = unresolvedWarnings.filter((w) => w.priority === 'P1');
  const p2Warnings = unresolvedWarnings.filter((w) => w.priority === 'P2');
  const p3Warnings = unresolvedWarnings.filter((w) => w.priority === 'P3');

  // Display top P1 warnings, then P2, then P3 (deduplicated)
  const seenIds = new Set<string>();
  const uniqueTopWarnings: typeof warnings = [];
  for (const w of [...p1Warnings, ...p2Warnings, ...p3Warnings]) {
    const keyStr = w.id || `${w.student_id}-${w.warning_type}-${w.created_at}`;
    if (!seenIds.has(keyStr)) {
      seenIds.add(keyStr);
      uniqueTopWarnings.push(w);
    }
  }
  const topWarnings = uniqueTopWarnings.slice(0, 4);

  return (
    <div className="bg-white dark:bg-slate-900/90 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden flex flex-col h-full">
      {/* Header */}
      <div className="p-3.5 px-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
        <div className="flex items-center gap-2.5">
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center ring-1 ${
              p1Warnings.length > 0
                ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 ring-rose-200/50 dark:ring-rose-800/50'
                : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 ring-emerald-200/50 dark:ring-emerald-800/50'
            }`}
          >
            <ShieldAlert className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <span>Cảnh Báo Cần Can Thiệp</span>
              {p1Warnings.length > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold font-num bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                  {p1Warnings.length} P1
                </span>
              )}
            </h2>
          </div>
        </div>

        <button
          onClick={onOpenWarnings}
          className="text-xs font-bold text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 flex items-center gap-1 transition-colors"
        >
          <span>Xem tất cả</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* List */}
      <div className="p-3 divide-y divide-slate-100 dark:divide-slate-800/80 flex-1 overflow-y-auto max-h-[380px]">
        {topWarnings.length === 0 ? (
          <div className="py-8 text-center text-slate-400 dark:text-slate-500 text-xs">
            <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-500 opacity-60" />
            <p className="font-bold text-slate-700 dark:text-slate-300">Tuyệt vời! Không có cảnh báo khẩn cấp nào</p>
            <p className="text-[11px] mt-0.5 font-medium text-slate-400">Tất cả học sinh đều duy trì phong độ học tập tốt.</p>
          </div>
        ) : (
          topWarnings.map((warning, idx) => {
            const student = studentMap.get(warning.student_id);
            const parentClass = classMap.get(warning.class_id);
            const isP1 = warning.priority === 'P1';

            return (
              <div
                key={warning.id ? `${warning.id}-${idx}` : `${warning.student_id}-${warning.created_at}-${idx}`}
                className="py-3 px-2.5 flex items-start justify-between gap-3 hover:bg-slate-50/80 dark:hover:bg-slate-800/50 rounded-lg transition-all duration-150 group"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-black font-num shrink-0 ${
                        warning.priority === 'P1'
                          ? 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                          : warning.priority === 'P2'
                          ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                          : warning.priority === 'P3'
                          ? 'bg-yellow-100 dark:bg-yellow-950 text-yellow-800 dark:text-yellow-300 border border-yellow-300 dark:border-yellow-700'
                          : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                      }`}
                    >
                      {warning.priority}
                    </span>
                    <span className="font-bold text-xs text-slate-900 dark:text-slate-100 truncate">
                      {student?.full_name || 'Học sinh'}
                    </span>
                    {parentClass && (
                      <span className="text-[10px] font-medium text-slate-400 truncate">
                        • {parentClass.class_name}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 font-medium line-clamp-1">
                    {warning.reason || warning.warning_type}
                  </p>
                </div>

                <button
                  onClick={() => onResolveWarning(warning)}
                  className="shrink-0 px-2.5 py-1 text-[11px] font-bold text-rose-700 dark:text-rose-300 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/60 dark:hover:bg-rose-900/60 border border-rose-200/80 dark:border-rose-900/80 rounded-md transition-all active:scale-95 shadow-2xs"
                >
                  Xử lý
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
