import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/dexie';
import { ClassItem, Student, Warning, GradeLevel } from '../types';
import { DataFreshnessBar } from './DataFreshnessBar';
import { DashboardHeader } from './dashboard/DashboardHeader';
import { DashboardKpiCards } from './dashboard/DashboardKpiCards';
import { TodayClassesCard } from './dashboard/TodayClassesCard';
import { GradeTrendCharts } from './dashboard/GradeTrendCharts';
import { UrgentWarningsCard } from './dashboard/UrgentWarningsCard';
import {
  computeDashboardMetrics,
  computeGradeLevelTrends,
  computeTodayClassesList,
} from '../services/dashboardService';
import { Loader2, Plus, BookOpen, Inbox } from 'lucide-react';

interface DashboardProps {
  classes: ClassItem[];
  students: Student[];
  warnings: Warning[];
  isLoadingData?: boolean;
  isSyncing?: boolean;
  syncStatus?: string | null;
  onPullFromCloud?: () => Promise<void> | void;
  onInspectCloud?: () => void;
  onNavigateTab: (tab: any) => void;
  onResolveWarning: (warning: Warning) => void;
  onSelectClassForGradeEntry?: (classId: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  classes,
  students,
  warnings,
  isLoadingData = false,
  isSyncing = false,
  syncStatus,
  onPullFromCloud,
  onInspectCloud,
  onNavigateTab,
  onResolveWarning,
  onSelectClassForGradeEntry,
}) => {
  // Selected grade filter for whole dashboard view
  const [selectedGrade, setSelectedGrade] = useState<GradeLevel | 'all'>('all');

  // Dexie live queries (reactive to local offline/online changes)
  const sessions = useLiveQuery(() => db.sessions.toArray()) || [];
  const studentSessions = useLiveQuery(() => db.student_sessions.toArray()) || [];
  const classStudents = useLiveQuery(() => db.class_students.toArray()) || [];

  // Filtered classes based on grade selection
  const filteredClasses = useMemo(() => {
    if (selectedGrade === 'all') return classes;
    return classes.filter((c) => c.grade_level === selectedGrade);
  }, [classes, selectedGrade]);

  const filteredClassIdSet = useMemo(() => {
    return new Set(filteredClasses.map((c) => c.id).filter(Boolean) as string[]);
  }, [filteredClasses]);

  // Filtered students & sessions if grade filter is active
  const filteredStudents = useMemo(() => {
    if (selectedGrade === 'all') return students;
    const activeStudentIdsInGrade = new Set(
      classStudents
        .filter((cs) => filteredClassIdSet.has(cs.class_id) && !cs.leave_date)
        .map((cs) => cs.student_id)
    );
    return students.filter((s) => s.id && activeStudentIdsInGrade.has(s.id));
  }, [selectedGrade, students, classStudents, filteredClassIdSet]);

  const filteredWarnings = useMemo(() => {
    if (selectedGrade === 'all') return warnings;
    return warnings.filter((w) => filteredClassIdSet.has(w.class_id));
  }, [selectedGrade, warnings, filteredClassIdSet]);

  const filteredStudentSessions = useMemo(() => {
    if (selectedGrade === 'all') return studentSessions;
    const gradeSessionIds = new Set(
      sessions
        .filter((s) => filteredClassIdSet.has(s.class_id))
        .map((s) => s.id)
        .filter(Boolean) as string[]
    );
    return studentSessions.filter((ss) => gradeSessionIds.has(ss.session_id));
  }, [selectedGrade, studentSessions, sessions, filteredClassIdSet]);

  // Compute 5 core KPI metrics
  const metrics = useMemo(() => {
    return computeDashboardMetrics(
      filteredClasses,
      filteredStudents,
      filteredWarnings,
      filteredStudentSessions,
      classStudents
    );
  }, [filteredClasses, filteredStudents, filteredWarnings, filteredStudentSessions, classStudents]);

  // Compute 4 grade level trend charts (4 latest sessions for Grades 6, 7, 8, 9)
  const gradeTrends = useMemo(() => {
    return computeGradeLevelTrends(classes, sessions, studentSessions);
  }, [classes, sessions, studentSessions]);

  // Compute class schedules & status
  const todayClassesList = useMemo(() => {
    return computeTodayClassesList(filteredClasses, sessions, studentSessions, classStudents);
  }, [filteredClasses, sessions, studentSessions, classStudents]);

  const handleSelectClass = (classId: string) => {
    if (onSelectClassForGradeEntry) {
      onSelectClassForGradeEntry(classId);
    } else {
      onNavigateTab('grade-entry');
    }
  };

  if (isLoadingData) {
    return (
      <div className="space-y-4">
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-2xl flex items-center gap-3 text-xs font-bold text-emerald-800 dark:text-emerald-300 animate-pulse">
          <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
          <span>Đang nạp dữ liệu cơ sở dữ liệu IndexedDB... Vui lòng chờ trong giây lát.</span>
        </div>
      </div>
    );
  }

  const hasZeroData = classes.length === 0 && students.length === 0;

  return (
    <div className="space-y-5 pb-8 max-w-7xl mx-auto">
      {/* Realtime Data Freshness & Sync Bar */}
      <DataFreshnessBar
        isSyncing={isSyncing}
        syncStatus={syncStatus}
        onPullFromCloud={onPullFromCloud}
        onInspectCloud={onInspectCloud}
      />

      {/* Header & Grade Level Filters */}
      <DashboardHeader
        selectedGrade={selectedGrade}
        onGradeChange={setSelectedGrade}
      />

      {/* Empty State Banner if no classes or students */}
      {hasZeroData && (
        <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl text-center space-y-3 shadow-xs">
          <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 mx-auto flex items-center justify-center">
            <Inbox className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
              Hệ Thống Chưa Có Dữ Liệu Lớp Học &amp; Học Sinh
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto mt-1">
              Hãy bắt đầu bằng cách thêm Lớp Học hoặc Học Sinh mới để hệ thống tự động thống kê số liệu và vẽ biểu đồ xu hướng.
            </p>
          </div>
          <div className="flex items-center justify-center gap-2 pt-1">
            <button
              onClick={() => onNavigateTab('classes')}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tạo Lớp Học Mới</span>
            </button>
            <button
              onClick={() => onNavigateTab('students')}
              className="px-3.5 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-lg text-xs font-semibold transition-colors"
            >
              <span>Thêm Học Sinh</span>
            </button>
          </div>
        </div>
      )}

      {/* 5 Core KPI Metric Cards */}
      <DashboardKpiCards
        metrics={metrics}
        onNavigateToClasses={() => onNavigateTab('classes')}
        onNavigateToStudents={() => onNavigateTab('students')}
        onNavigateToGradeEntry={() => onNavigateTab('grade-entry')}
        onNavigateToWarnings={() => onNavigateTab('warnings')}
      />

      {/* 2-Column Bento Grid: Today's Classes & Urgent Warnings */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
        <div className="lg:col-span-2">
          <TodayClassesCard
            todayClasses={todayClassesList}
            onSelectClassForGradeEntry={handleSelectClass}
            onNavigateToClasses={() => onNavigateTab('classes')}
          />
        </div>
        <div className="lg:col-span-1">
          <UrgentWarningsCard
            warnings={warnings}
            students={students}
            classes={classes}
            onOpenWarnings={() => onNavigateTab('warnings')}
            onResolveWarning={onResolveWarning}
          />
        </div>
      </div>

      {/* Full-width 4-Grade Level Trend Charts (4 latest sessions: BTVN vs Test Score) */}
      <div className="pt-1">
        <GradeTrendCharts
          gradeTrends={gradeTrends}
          selectedGradeFilter={selectedGrade}
        />
      </div>
    </div>
  );
};
