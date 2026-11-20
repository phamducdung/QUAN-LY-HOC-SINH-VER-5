import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, deleteStudent, setRemoteSyncing } from '../../db/dexie';
import {
  Student,
  ClassItem,
  ClassStudent,
  Session,
  StudentSession,
  Warning,
  KnowledgeResult,
} from '../../types';
import { createPreDeleteSnapshot } from '../../utils/dbSafetyAndQA';
import {
  enqueueSyncOperation,
  flushSyncOutbox,
  authorizeCascadeDeleteIds,
} from '../../services/syncService';
import { logAudit } from '../../utils/auditLogger';
import {
  AlertTriangle,
  CheckCircle2,
  GitMerge,
  UserMinus,
  Trash2,
  X,
  Search,
  ShieldAlert,
  Sparkles,
  Users,
  CalendarOff,
} from 'lucide-react';

interface StudentDuplicateAuditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: Student[];
  classes: ClassItem[];
  onRefresh: () => void;
}

const EMPTY_ARRAY: any[] = [];

function normalizeExact(str?: string): string {
  return (str || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function removeAccents(str?: string): string {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export interface DuplicatePairItem {
  id: string;
  matchType: 'exact_name' | 'accent_mismatch' | 'short_name_substring';
  matchLabel: string;
  primary: Student;
  secondary: Student;
  primaryClasses: string[];
  secondaryClasses: string[];
  primarySessionCount: number;
  secondarySessionCount: number;
  primaryLastDate: string;
  secondaryLastDate: string;
}

export interface GhostStudentItem {
  student: Student;
  reasonType: 'not_in_latest_3_sessions' | 'no_active_class' | 'zero_scores';
  reasonLabel: string;
  activeClassNames: string[];
  activeClassIds: string[];
  totalSessions: number;
  scoredSessions: number;
  lastSessionDate: string;
}

export const StudentDuplicateAuditorModal: React.FC<
  StudentDuplicateAuditorModalProps
> = ({ isOpen, onClose, students, classes, onRefresh }) => {
  const [activeTab, setActiveTab] = useState<'duplicates' | 'ghosts'>('duplicates');
  const [isProcessing, setIsProcessing] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [dismissedPairIds, setDismissedPairIds] = useState<string[]>([]);

  const classStudents =
    useLiveQuery(() => db.class_students.toArray()) ?? (EMPTY_ARRAY as ClassStudent[]);
  const sessions =
    useLiveQuery(() => db.sessions.toArray()) ?? (EMPTY_ARRAY as Session[]);
  const studentSessions =
    useLiveQuery(() => db.student_sessions.toArray()) ?? (EMPTY_ARRAY as StudentSession[]);
  const warnings =
    useLiveQuery(() => db.warnings.toArray()) ?? (EMPTY_ARRAY as Warning[]);
  const knowledgeResults =
    useLiveQuery(() => db.knowledge_results.toArray()) ?? (EMPTY_ARRAY as KnowledgeResult[]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 5000);
  };

  // Compute maps and audit results
  const { duplicatePairs, ghostStudents } = useMemo(() => {
    const classMap = new Map<string, ClassItem>();
    classes.forEach((c) => {
      if (c.id) classMap.set(String(c.id), c);
    });

    const sessionMap = new Map<string, Session>();
    sessions.forEach((s) => {
      if (s.id) sessionMap.set(String(s.id), s);
    });

    const csByStudent = new Map<string, ClassStudent[]>();
    for (const cs of classStudents) {
      const sid = String(cs.student_id);
      if (!csByStudent.has(sid)) csByStudent.set(sid, []);
      csByStudent.get(sid)!.push(cs);
    }

    const ssByStudent = new Map<string, StudentSession[]>();
    for (const ss of studentSessions) {
      const sid = String(ss.student_id);
      if (!ssByStudent.has(sid)) ssByStudent.set(sid, []);
      ssByStudent.get(sid)!.push(ss);
    }

    const getStudentMeta = (s: Student) => {
      const sid = String(s.id);
      const csList = (csByStudent.get(sid) || []).filter((cs) => !cs.leave_date);
      const classNames = csList.map(
        (cs) => classMap.get(String(cs.class_id))?.class_name || String(cs.class_id)
      );
      const classIds = csList.map((cs) => String(cs.class_id));
      const ssList = ssByStudent.get(sid) || [];
      const scored = ssList.filter(
        (r) =>
          Number(r.homework_score || 0) > 0 ||
          Number(r.test_score || 0) > 0 ||
          r.homework_submitted
      );
      const activeDates = ssList
        .filter(
          (r) =>
            r.attendance === 'present' ||
            r.attendance === 'late' ||
            Number(r.homework_score || 0) > 0 ||
            Number(r.test_score || 0) > 0
        )
        .map((r) => sessionMap.get(String(r.session_id))?.session_date)
        .filter(Boolean)
        .sort() as string[];

      return {
        classNames,
        classIds,
        totalSessions: ssList.length,
        scoredSessions: scored.length,
        lastDate: activeDates[activeDates.length - 1] || 'Chưa có buổi học',
      };
    };

    // 1. Detect Duplicate & Fuzzy Pairs
    const pairs: DuplicatePairItem[] = [];
    const seenPairKeys = new Set<string>();

    for (let i = 0; i < students.length; i++) {
      for (let j = i + 1; j < students.length; j++) {
        const s1 = students[i];
        const s2 = students[j];
        if (!s1.id || !s2.id) continue;

        const n1 = normalizeExact(s1.full_name);
        const n2 = normalizeExact(s2.full_name);
        const na1 = removeAccents(s1.full_name);
        const na2 = removeAccents(s2.full_name);

        let matchType: DuplicatePairItem['matchType'] | null = null;
        let matchLabel = '';

        if (n1 === n2 && n1.length > 0) {
          matchType = 'exact_name';
          matchLabel = 'Trùng 100% Họ & Tên (Tách 2 hồ sơ ở 2 lớp Đại / Hình)';
        } else if (na1 === na2 && na1.length > 0) {
          matchType = 'accent_mismatch';
          matchLabel = 'Trùng Họ & Tên không dấu (Lệch dấu thanh điệu)';
        } else if (
          (n1.split(' ').length <= 2 || n2.split(' ').length <= 2) &&
          (n1.endsWith(` ${n2}`) || n2.endsWith(` ${n1}`))
        ) {
          matchType = 'short_name_substring';
          matchLabel = 'Hồ sơ ghi thiếu Họ trùng với Hồ sơ đầy đủ Họ Tên';
        }

        if (!matchType) continue;

        const m1 = getStudentMeta(s1);
        const m2 = getStudentMeta(s2);

        // Choose the one with full name and more sessions as primary
        const s1IsBetter =
          s1.full_name.trim().length > s2.full_name.trim().length ||
          (s1.full_name.trim().length === s2.full_name.trim().length &&
            m1.totalSessions >= m2.totalSessions);

        const primary = s1IsBetter ? s1 : s2;
        const secondary = s1IsBetter ? s2 : s1;
        const pm = s1IsBetter ? m1 : m2;
        const sm = s1IsBetter ? m2 : m1;

        const pairId = `${primary.id}_${secondary.id}`;
        if (seenPairKeys.has(pairId) || dismissedPairIds.includes(pairId)) continue;
        seenPairKeys.add(pairId);

        pairs.push({
          id: pairId,
          matchType,
          matchLabel,
          primary,
          secondary,
          primaryClasses: pm.classNames,
          secondaryClasses: sm.classNames,
          primarySessionCount: pm.totalSessions,
          secondarySessionCount: sm.totalSessions,
          primaryLastDate: pm.lastDate,
          secondaryLastDate: sm.lastDate,
        });
      }
    }

    // 2. Detect Ghost / Virtual / Inactive Students in Active Rosters
    // Compute latest 3 sessions for each class
    const latest3SessionIdsByClass = new Map<string, Set<string>>();
    for (const cls of classes) {
      if (!cls.id) continue;
      const cid = String(cls.id);
      const clsSessions = sessions
        .filter((s) => String(s.class_id) === cid)
        .sort((a, b) => a.session_date.localeCompare(b.session_date));
      const latest3 = clsSessions.slice(-3);
      latest3SessionIdsByClass.set(
        cid,
        new Set(latest3.map((s) => String(s.id)))
      );
    }

    const ghosts: GhostStudentItem[] = [];
    for (const s of students) {
      if (!s.id || s.status === 'stopped') continue;
      const sid = String(s.id);
      const meta = getStudentMeta(s);
      const ssList = ssByStudent.get(sid) || [];

      if (meta.classIds.length === 0) {
        ghosts.push({
          student: s,
          reasonType: 'no_active_class',
          reasonLabel: 'Đang ở trạng thái Đang học nhưng không thuộc lớp nào (Hồ sơ mồ côi)',
          activeClassNames: [],
          activeClassIds: [],
          totalSessions: meta.totalSessions,
          scoredSessions: meta.scoredSessions,
          lastSessionDate: meta.lastDate,
        });
        continue;
      }

      // Check if student appeared in ANY of the latest 3 sessions of their enrolled classes
      let appearedInRecentClassSessions = false;
      for (const cid of meta.classIds) {
        const recentSet = latest3SessionIdsByClass.get(cid);
        if (!recentSet || recentSet.size === 0) {
          appearedInRecentClassSessions = true;
          continue;
        }
        const hasRec = ssList.some((ss) => recentSet.has(String(ss.session_id)));
        if (hasRec) {
          appearedInRecentClassSessions = true;
          break;
        }
      }

      if (!appearedInRecentClassSessions && meta.lastDate < '2026-10-20') {
        ghosts.push({
          student: s,
          reasonType: 'not_in_latest_3_sessions',
          reasonLabel: `Không có tên trong các buổi học tháng 11 (Buổi cuối từ ${meta.lastDate}) — Nghi ngờ đã nghỉ hoặc hồ sơ cũ khôi phục`,
          activeClassNames: meta.classNames,
          activeClassIds: meta.classIds,
          totalSessions: meta.totalSessions,
          scoredSessions: meta.scoredSessions,
          lastSessionDate: meta.lastDate,
        });
      }
    }

    // Sort ghosts by lastSessionDate ascending
    ghosts.sort((a, b) => a.lastSessionDate.localeCompare(b.lastSessionDate));

    return { duplicatePairs: pairs, ghostStudents: ghosts };
  }, [
    students,
    classes,
    classStudents,
    sessions,
    studentSessions,
    dismissedPairIds,
  ]);

  if (!isOpen) return null;

  /**
   * 1-Click Safe Merge of a Duplicate Student Pair:
   * - Creates a Pre-Delete Safety Snapshot first
   * - Moves all class enrollments, session grades, warnings, and knowledge results
   *   from `secondary` into `primary` with canonical IDs
   * - Deletes `secondary` student record
   */
  const handleMergeDuplicatePair = async (pair: DuplicatePairItem) => {
    const primaryId = String(pair.primary.id);
    const secondaryId = String(pair.secondary.id);
    if (!primaryId || !secondaryId) return;

    setIsProcessing(true);
    try {
      const now = new Date().toISOString();

      // 1. Capture Pre-Delete Safety Snapshot for the secondary student before merging
      await createPreDeleteSnapshot(
        'student',
        secondaryId,
        `Gộp hồ sơ trùng: ${pair.secondary.full_name} vào ${pair.primary.full_name}`
      );

      // 2. Migrate class_students
      const secCS = classStudents.filter(
        (cs) => String(cs.student_id) === secondaryId
      );
      const oldCsIds: string[] = [];
      for (const cs of secCS) {
        if (cs.id) oldCsIds.push(String(cs.id));
        const cid = String(cs.class_id);
        const newCsId = `cs_${cid}_${primaryId}`;
        const existingPrimaryCs = await db.class_students.get(newCsId);
        if (!existingPrimaryCs) {
          const mergedCs: ClassStudent = {
            ...cs,
            id: newCsId,
            class_id: cid,
            student_id: primaryId,
          };
          await db.class_students.put(mergedCs);
        }
      }

      // 3. Migrate student_sessions
      const secSS = studentSessions.filter(
        (ss) => String(ss.student_id) === secondaryId
      );
      const oldSsIds: string[] = [];
      for (const ss of secSS) {
        if (ss.id) oldSsIds.push(String(ss.id));
        const sessId = String(ss.session_id);
        const newSsId = `ss_${sessId}_${primaryId}`;
        const existingPrimarySs = await db.student_sessions.get(newSsId);
        if (
          !existingPrimarySs ||
          (Number(existingPrimarySs.homework_score || 0) === 0 &&
            Number(existingPrimarySs.test_score || 0) === 0)
        ) {
          const mergedSs: StudentSession = {
            ...ss,
            id: newSsId,
            session_id: sessId,
            student_id: primaryId,
            updated_at: now,
          };
          await db.student_sessions.put(mergedSs);
        }
      }

      // 4. Migrate knowledge_results
      const secKR = knowledgeResults.filter(
        (kr) => String(kr.student_id) === secondaryId
      );
      const oldKrIds: string[] = [];
      for (const kr of secKR) {
        if (kr.id) oldKrIds.push(String(kr.id));
        const tagId = String(kr.knowledge_tag_id);
        const newKrId = `kr_${primaryId}_${tagId}`;
        const existingPrimaryKr = await db.knowledge_results.get(newKrId);
        if (!existingPrimaryKr) {
          await db.knowledge_results.put({
            ...kr,
            id: newKrId,
            student_id: primaryId,
            knowledge_tag_id: tagId,
            last_updated: now,
          });
        }
      }

      // 5. Migrate warnings
      const secWarnings = warnings.filter(
        (w) => String(w.student_id) === secondaryId
      );
      for (const w of secWarnings) {
        if (w.id) {
          await db.warnings.update(w.id, {
            student_id: primaryId,
            updated_at: now,
          });
        }
      }

      // 6. Authorize and delete secondary student & old child records
      authorizeCascadeDeleteIds('students', [secondaryId]);
      authorizeCascadeDeleteIds('class_students', oldCsIds);
      authorizeCascadeDeleteIds('student_sessions', oldSsIds);
      authorizeCascadeDeleteIds('knowledge_results', oldKrIds);

      await deleteStudent(secondaryId);
      await flushSyncOutbox();

      await logAudit(
        'Teacher',
        'MERGE_DUPLICATE_STUDENT',
        `Đã gộp hồ sơ trùng "${pair.secondary.full_name}" (${secondaryId}) vào "${pair.primary.full_name}" (${primaryId})`
      );

      showToast(
        `Đã gộp thành công hồ sơ "${pair.secondary.full_name}" vào "${pair.primary.full_name}" (Giữ nguyên tất cả các lớp và điểm số)!`
      );
      onRefresh();
    } finally {
      setIsProcessing(false);
    }
  };

  /**
   * 1-Click Archive Ghost Student (Mark as left class & stopped studying, keeping history safe)
   */
  const handleArchiveGhostStudent = async (ghost: GhostStudentItem) => {
    const sid = String(ghost.student.id);
    if (!sid) return;
    setIsProcessing(true);
    try {
      const now = new Date().toISOString();
      const leaveDate =
        ghost.lastSessionDate !== 'Chưa có buổi học'
          ? ghost.lastSessionDate
          : now.slice(0, 10);

      const activeCsRows = classStudents.filter(
        (cs) => String(cs.student_id) === sid && !cs.leave_date
      );
      for (const cs of activeCsRows) {
        if (cs.id) {
          await db.class_students.update(cs.id, {
            leave_date: leaveDate,
          });
        }
      }

      await db.students.update(sid, {
        status: 'stopped',
        leave_reason: `Rà soát danh sách lớp: Đã dừng tham gia lớp từ sau ngày ${leaveDate}`,
        updated_at: now,
      });

      await flushSyncOutbox();
      showToast(
        `Đã rút "${ghost.student.full_name}" khỏi danh sách lớp đang học và chuyển sang mục Nghỉ hẳn!`
      );
      onRefresh();
    } finally {
      setIsProcessing(false);
    }
  };

  /**
   * Batch Archive all 20 Ghost Students in 1 Click
   */
  const handleBatchArchiveAllGhosts = async () => {
    if (ghostStudents.length === 0) return;
    setIsProcessing(true);
    try {
      const now = new Date().toISOString();
      let count = 0;
      for (const ghost of ghostStudents) {
        const sid = String(ghost.student.id);
        if (!sid) continue;
        const leaveDate =
          ghost.lastSessionDate !== 'Chưa có buổi học'
            ? ghost.lastSessionDate
            : now.slice(0, 10);

        const activeCsRows = classStudents.filter(
          (cs) => String(cs.student_id) === sid && !cs.leave_date
        );
        for (const cs of activeCsRows) {
          if (cs.id) {
            await db.class_students.update(cs.id, {
              leave_date: leaveDate,
            });
          }
        }

        await db.students.update(sid, {
          status: 'stopped',
          leave_reason: `Rà soát danh sách lớp: Không tham gia các buổi học tháng 11 (Buổi cuối: ${leaveDate})`,
          updated_at: now,
        });
        count++;
      }

      await flushSyncOutbox();
      showToast(
        `Đã rút toàn bộ ${count} học sinh không còn theo học khỏi danh sách lớp hiện tại (Chuyển sang mục Nghỉ hẳn)!`
      );
      onRefresh();
    } finally {
      setIsProcessing(false);
    }
  };

  /**
   * 1-Click Delete Ghost Student (with Pre-Delete Safety Snapshot)
   */
  const handleDeleteGhostStudent = async (ghost: GhostStudentItem) => {
    const sid = String(ghost.student.id);
    if (!sid) return;
    setIsProcessing(true);
    try {
      await createPreDeleteSnapshot(
        'student',
        sid,
        `Xóa hồ sơ ảo / đã nghỉ: ${ghost.student.full_name}`
      );
      await deleteStudent(sid);
      await flushSyncOutbox();
      showToast(
        `Đã xóa hồ sơ "${ghost.student.full_name}" (Đã lưu Bản chụp an toàn trong Cài đặt để khôi phục 1-Click nếu cần)!`
      );
      onRefresh();
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-800/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Trung Tâm Rà Soát Học Sinh Trùng Lặp & Học Sinh Ảo / Đã Nghỉ
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Đối chiếu chéo toàn bộ hồ sơ học sinh với các buổi điểm danh tháng 11/2026 trên từng lớp
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toast Banner */}
        {toastMsg && (
          <div className="mx-5 mt-4 p-3 rounded-xl bg-emerald-600 text-white text-xs font-bold flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{toastMsg}</span>
            </div>
            <button
              type="button"
              onClick={() => setToastMsg(null)}
              className="p-1 hover:bg-emerald-700 rounded-lg cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Sub-Tabs */}
        <div className="px-5 pt-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2 pb-3">
            <button
              type="button"
              onClick={() => setActiveTab('duplicates')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer ${
                activeTab === 'duplicates'
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              <GitMerge className="w-4 h-4" />
              <span>
                1. Cặp Học Sinh Trùng Lặp / Gần Giống ({duplicatePairs.length})
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('ghosts')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer ${
                activeTab === 'ghosts'
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              <CalendarOff className="w-4 h-4" />
              <span>
                2. Học Sinh Ảo / Vắng Mặt Toàn Bộ Tháng 11 ({ghostStudents.length})
              </span>
            </button>
          </div>

          {activeTab === 'ghosts' && ghostStudents.length > 0 && (
            <button
              type="button"
              disabled={isProcessing}
              onClick={handleBatchArchiveAllGhosts}
              className="mb-3 px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <UserMinus className="w-3.5 h-3.5" />
              <span>
                Rút tất cả {ghostStudents.length} HS đã nghỉ khỏi lớp hiện tại (Chuyển sang Nghỉ hẳn)
              </span>
            </button>
          )}
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {activeTab === 'duplicates' ? (
            duplicatePairs.length === 0 ? (
              <div className="p-10 text-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  Không còn cặp học sinh nào bị trùng lặp hồ sơ!
                </p>
              </div>
            ) : (
              duplicatePairs.map((pair) => (
                <div
                  key={pair.id}
                  className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="text-xs font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>{pair.matchLabel}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setDismissedPairIds((prev) => [...prev, pair.id])
                        }
                        className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 cursor-pointer"
                      >
                        Là 2 học sinh khác nhau (Bỏ qua)
                      </button>

                      <button
                        type="button"
                        disabled={isProcessing}
                        onClick={() => handleMergeDuplicatePair(pair)}
                        className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <GitMerge className="w-3.5 h-3.5" />
                        <span>Gộp Thành 1 Hồ Sơ (Giữ Cả 2 Lớp & Điểm)</span>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    {/* Primary Record */}
                    <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-900/60">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                          {pair.primary.full_name}
                        </span>
                        <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                          Hồ sơ chính (Giữ lại)
                        </span>
                      </div>
                      <div className="text-slate-600 dark:text-slate-300 mt-1.5 space-y-1 font-mono text-[11px]">
                        <div>
                          Lớp đang học:{' '}
                          <strong>
                            {pair.primaryClasses.join(', ') || 'Chưa xếp lớp'}
                          </strong>
                        </div>
                        <div>
                          Số buổi học: <strong>{pair.primarySessionCount} buổi</strong> · Buổi cuối:{' '}
                          <strong>{pair.primaryLastDate}</strong>
                        </div>
                        <div>ID: {String(pair.primary.id).slice(0, 13)}...</div>
                      </div>
                    </div>

                    {/* Secondary Record */}
                    <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900/60">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                          {pair.secondary.full_name}
                        </span>
                        <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400">
                          Hồ sơ trùng (Sẽ gộp lớp & điểm sang hồ sơ chính)
                        </span>
                      </div>
                      <div className="text-slate-600 dark:text-slate-300 mt-1.5 space-y-1 font-mono text-[11px]">
                        <div>
                          Lớp đang học:{' '}
                          <strong>
                            {pair.secondaryClasses.join(', ') || 'Chưa xếp lớp'}
                          </strong>
                        </div>
                        <div>
                          Số buổi học: <strong>{pair.secondarySessionCount} buổi</strong> · Buổi cuối:{' '}
                          <strong>{pair.secondaryLastDate}</strong>
                        </div>
                        <div>ID: {String(pair.secondary.id).slice(0, 13)}...</div>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )
          ) : ghostStudents.length === 0 ? (
            <div className="p-10 text-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 space-y-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
              <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                100% học sinh trong các lớp đều đang đi học đầy đủ trong tháng 11!
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-2xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-500 uppercase">
                    <th className="py-3 px-4">Học sinh</th>
                    <th className="py-3 px-4">Lớp đang đứng tên</th>
                    <th className="py-3 px-4">Số buổi & Buổi cuối có mặt</th>
                    <th className="py-3 px-4">Chẩn đoán</th>
                    <th className="py-3 px-4 text-right">Xử lý 1-Click</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800">
                  {ghostStudents.map((g) => (
                    <tr
                      key={g.student.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                    >
                      <td className="py-3 px-4 font-bold text-slate-900 dark:text-slate-100">
                        {g.student.full_name}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-700 dark:text-slate-300">
                        {g.activeClassNames.join(', ') || 'Không có lớp'}
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums">
                        <div>
                          Tổng: {g.totalSessions} buổi (Có điểm: {g.scoredSessions})
                        </div>
                        <div className="text-rose-600 dark:text-rose-400 font-bold">
                          Buổi cuối: {g.lastSessionDate}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-300 max-w-xs">
                        {g.reasonLabel}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            disabled={isProcessing}
                            onClick={() => handleArchiveGhostStudent(g)}
                            className="px-2.5 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-xs font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap"
                            title="Rút tên khỏi lớp hiện tại và chuyển sang mục Nghỉ hẳn (Giữ nguyên lịch sử điểm cũ)"
                          >
                            <UserMinus className="w-3.5 h-3.5" />
                            <span>Chuyển sang Nghỉ hẳn</span>
                          </button>

                          <button
                            type="button"
                            disabled={isProcessing}
                            onClick={() => handleDeleteGhostStudent(g)}
                            className="px-2.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-xs font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap"
                            title="Lưu bản chụp an toàn và xóa hẳn hồ sơ ảo này"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Xóa hẳn</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
