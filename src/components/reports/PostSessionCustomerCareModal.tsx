import React, { useState, useMemo, useEffect } from 'react';
import {
  ClassItem,
  Session,
  Student,
  StudentSession,
  CRMCustomerStatus,
  CRMInteractionLog,
  PronounConfig,
} from '../../types';
import { db, pushBatchDocsToFirestore } from '../../db/dexie';
import { logAudit } from '../../utils/auditLogger';
import {
  compileClassGroupZaloAnnouncement,
  compileSingleSessionStudentZaloMessage,
  CRM_CLASSIFICATION_CRITERIA,
} from '../../utils/crmEngine';
import {
  X,
  MessageSquare,
  Users,
  AlertTriangle,
  Award,
  Copy,
  Check,
  ExternalLink,
  CheckCircle2,
  Sparkles,
  Phone,
  Edit3,
  HeartHandshake,
} from 'lucide-react';

interface PostSessionCustomerCareModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentClass: ClassItem;
  selectedSession: Session;
  previousSession?: Session | null;
  allClassSessions: Session[];
  students: Student[];
  studentSessions: Record<string, StudentSession>;
  prevStudentSessions: Record<string, StudentSession>;
  allStudentSessions: StudentSession[];
  sessionStats: {
    present: number;
    total: number;
    presentPct: number;
    avgHw: number;
    avgTest: number;
  };
  initialTab?: 'group_zalo' | 'reminder_list' | 'praise_list';
}

export const PostSessionCustomerCareModal: React.FC<PostSessionCustomerCareModalProps> = ({
  isOpen,
  onClose,
  currentClass,
  selectedSession,
  previousSession,
  allClassSessions,
  students,
  studentSessions,
  prevStudentSessions,
  allStudentSessions,
  sessionStats,
  initialTab = 'group_zalo',
}) => {
  const [activeTab, setActiveTab] = useState<'group_zalo' | 'reminder_list' | 'praise_list'>(
    initialTab
  );
  const [groupZaloMode, setGroupZaloMode] = useState<'single_session' | 'cycle_4'>(
    'single_session'
  );
  const [groupZaloDraft, setGroupZaloDraft] = useState<string>('');
  const [copiedGroupZalo, setCopiedGroupZalo] = useState<boolean>(false);

  // Per-student customized message draft & contacted state within this session
  const [customDrafts, setCustomDrafts] = useState<Record<string, string>>({});
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null);
  const [copiedStudentId, setCopiedStudentId] = useState<string | null>(null);
  const [contactedStudentIds, setContactedStudentIds] = useState<Set<string>>(new Set());

  const pronounConfig = useMemo<PronounConfig | undefined>(() => {
    try {
      const raw = localStorage.getItem('app_pronoun_config');
      if (raw) return JSON.parse(raw);
    } catch {
      // ignore
    }
    return undefined;
  }, []);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  // Merge live studentSessions state (including just-entered grades) into allStudentSessions
  const mergedAllStudentSessions = useMemo(() => {
    const map = new Map<string, StudentSession>();
    allStudentSessions.forEach((ss) => {
      const key = `${String(ss.session_id)}_${String(ss.student_id)}`;
      map.set(key, ss);
    });
    (Object.values(studentSessions) as StudentSession[]).forEach((ss) => {
      if (ss && ss.student_id) {
        const key = `${String(selectedSession.id)}_${String(ss.student_id)}`;
        map.set(key, { ...ss, session_id: String(selectedSession.id) });
      }
    });
    if (previousSession?.id) {
      (Object.values(prevStudentSessions) as StudentSession[]).forEach((ss) => {
        if (ss && ss.student_id) {
          const key = `${String(previousSession.id)}_${String(ss.student_id)}`;
          map.set(key, { ...ss, session_id: String(previousSession.id) });
        }
      });
    }
    return Array.from(map.values());
  }, [
    allStudentSessions,
    studentSessions,
    prevStudentSessions,
    selectedSession.id,
    previousSession?.id,
  ]);

  // 1. Group Zalo Announcement data
  const groupZaloData = useMemo(() => {
    return compileClassGroupZaloAnnouncement({
      cls: currentClass,
      mode: groupZaloMode,
      targetSessionId: String(selectedSession.id),
      classSessions: allClassSessions,
      activeClassStudents: students,
      allStudentSessions: mergedAllStudentSessions,
      pronounConfig,
    });
  }, [
    currentClass,
    groupZaloMode,
    selectedSession.id,
    allClassSessions,
    students,
    mergedAllStudentSessions,
    pronounConfig,
  ]);

  useEffect(() => {
    setGroupZaloDraft(groupZaloData.announcementText);
    setCopiedGroupZalo(false);
  }, [groupZaloData.announcementText]);

  // 2. Categorize students for Reminder List vs Praise List
  const { reminderItems, praiseItems } = useMemo(() => {
    const reminders: Array<{
      student: Student;
      rec: Partial<StudentSession>;
      prevRec?: Partial<StudentSession>;
      issueBadges: string[];
      defaultMessage: string;
      suggestedCrmStatus: CRMCustomerStatus;
    }> = [];

    const praises: Array<{
      student: Student;
      rec: Partial<StudentSession>;
      prevRec?: Partial<StudentSession>;
      issueBadges: string[];
      defaultMessage: string;
      suggestedCrmStatus: CRMCustomerStatus;
    }> = [];

    students.forEach((st) => {
      const stId = String(st.id);
      const rec: Partial<StudentSession> = studentSessions[stId] || {
        student_id: stId,
        session_id: String(selectedSession.id),
        attendance: 'present',
      };
      const prevRec = previousSession ? prevStudentSessions[stId] : undefined;

      const att = rec.attendance || 'present';
      const isAbsentOrLate = att !== 'present';
      const isHwExempt = !!(rec.exempt || rec.exempt_homework);
      const isTestExempt = !!(rec.exempt || rec.exempt_test);

      const hasHwIssue =
        selectedSession.has_homework !== false &&
        !isHwExempt &&
        !att.startsWith('absent') &&
        (rec.homework_submitted === false ||
          rec.late_submit === true ||
          (typeof rec.homework_score === 'number' && rec.homework_score < 5));

      const hasTestIssue =
        selectedSession.has_test !== false &&
        !isTestExempt &&
        !att.startsWith('absent') &&
        typeof rec.test_score === 'number' &&
        rec.test_score < 5;

      const hasPrevTestIssue =
        previousSession &&
        prevRec &&
        !prevRec.exempt &&
        !prevRec.exempt_test &&
        typeof prevRec.test_score === 'number' &&
        prevRec.test_score < 5 &&
        (rec.test_score === undefined || rec.test_score === null);

      if (isAbsentOrLate || hasHwIssue || hasTestIssue || hasPrevTestIssue) {
        const compiled = compileSingleSessionStudentZaloMessage({
          student: st,
          cls: currentClass,
          session: selectedSession,
          rec,
          prevSession: previousSession,
          prevRec,
          classAvgHw: sessionStats.avgHw,
          classAvgTest: sessionStats.avgTest,
          mode: 'reminder',
          pronounConfig,
        });
        reminders.push({
          student: st,
          rec,
          prevRec,
          issueBadges: compiled.issueBadges,
          defaultMessage: compiled.messageText,
          suggestedCrmStatus: compiled.suggestedCrmStatus,
        });
      }

      // Check praise condition (attended + high test score >= 8.0 or high HW >= 8.5 or test improved >= +1.0 with test >= 6.5)
      if (!att.startsWith('absent') && !hasTestIssue && !hasHwIssue) {
        const highTest =
          selectedSession.has_test !== false &&
          !isTestExempt &&
          typeof rec.test_score === 'number' &&
          rec.test_score >= 8.0;
        const highHw =
          selectedSession.has_homework !== false &&
          !isHwExempt &&
          typeof rec.homework_score === 'number' &&
          rec.homework_score >= 8.5;
        const strongProgress =
          typeof rec.test_score === 'number' &&
          rec.test_score >= 6.5 &&
          typeof prevRec?.test_score === 'number' &&
          rec.test_score - prevRec.test_score >= 1.0;

        if (highTest || highHw || strongProgress) {
          const compiled = compileSingleSessionStudentZaloMessage({
            student: st,
            cls: currentClass,
            session: selectedSession,
            rec,
            prevSession: previousSession,
            prevRec,
            classAvgHw: sessionStats.avgHw,
            classAvgTest: sessionStats.avgTest,
            mode: 'praise',
            pronounConfig,
          });
          praises.push({
            student: st,
            rec,
            prevRec,
            issueBadges: compiled.issueBadges,
            defaultMessage: compiled.messageText,
            suggestedCrmStatus: compiled.suggestedCrmStatus,
          });
        }
      }
    });

    return { reminderItems: reminders, praiseItems: praises };
  }, [
    students,
    studentSessions,
    prevStudentSessions,
    selectedSession,
    previousSession,
    currentClass,
    sessionStats.avgHw,
    sessionStats.avgTest,
    pronounConfig,
  ]);

  if (!isOpen) return null;

  const handleUpdateStudentCRMStatus = async (
    student: Student,
    newStatus: CRMCustomerStatus
  ) => {
    if (!student.id) return;
    const nowIso = new Date().toISOString();
    const cadenceDays = CRM_CLASSIFICATION_CRITERIA[newStatus].followUpCadenceDays;
    const nextDate = new Date(Date.now() + cadenceDays * 86400000)
      .toISOString()
      .slice(0, 10);

    const updatedStudent: Student = {
      ...student,
      crm_status: newStatus,
      crm_next_followup_date: student.crm_next_followup_date || nextDate,
      updated_at: nowIso,
    };

    await db.students.put(updatedStudent);
    await pushBatchDocsToFirestore('students', [updatedStudent]);
    await logAudit(
      'Teacher',
      'Cập nhật nhãn CSKH sau buổi học',
      `Đổi nhãn CSKH của HS ${student.full_name} sang "${CRM_CLASSIFICATION_CRITERIA[newStatus].label}" tại Trạm CSKH buổi ${selectedSession.session_date}`
    );
  };

  const handleSendStudentMessage = async (
    student: Student,
    mode: 'reminder' | 'praise',
    defaultMsg: string,
    openZaloWindow: boolean
  ) => {
    if (!student.id) return;
    const stId = String(student.id);
    const msgToCopy = (customDrafts[`${mode}_${stId}`] ?? defaultMsg).trim();

    try {
      await navigator.clipboard.writeText(msgToCopy);
    } catch {
      // ignore clipboard fallback
    }

    const nowIso = new Date().toISOString();
    const currentStatus: CRMCustomerStatus = student.crm_status || 'satisfied';
    const cadenceDays = CRM_CLASSIFICATION_CRITERIA[currentStatus].followUpCadenceDays;
    const nextDate = new Date(Date.now() + cadenceDays * 86400000)
      .toISOString()
      .slice(0, 10);

    const newLog: CRMInteractionLog = {
      id: `crm_sess_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      created_at: nowIso,
      channel: 'zalo',
      template_category:
        mode === 'praise' ? 'praise_progress' : 'homework_attendance',
      summary:
        mode === 'praise'
          ? `[CSKH Sau buổi ${selectedSession.session_date} - Lớp ${currentClass.class_name}] Gửi thư khen ngợi kết quả buổi học "${selectedSession.lesson_title}"`
          : `[CSKH Sau buổi ${selectedSession.session_date} - Lớp ${currentClass.class_name}] Nhắn PH phối hợp nhắc nhở sau buổi học "${selectedSession.lesson_title}"`,
      message_sent: msgToCopy,
      parent_feedback: '',
      status_snapshot: currentStatus,
      next_followup_date: nextDate,
      created_by: 'Giáo viên',
    };

    const existingLogs = Array.isArray(student.crm_interactions)
      ? student.crm_interactions
      : [];

    const updatedStudent: Student = {
      ...student,
      crm_status: currentStatus,
      crm_last_contacted_at: nowIso,
      crm_next_followup_date: nextDate,
      crm_interactions: [newLog, ...existingLogs],
      updated_at: nowIso,
    };

    await db.students.put(updatedStudent);
    await pushBatchDocsToFirestore('students', [updatedStudent]);

    await logAudit(
      'Teacher',
      'Gửi báo cáo CSKH sau buổi học',
      `Đã sao chép & lưu nhật ký CSKH Zalo (${mode === 'praise' ? 'Khen ngợi' : 'Nhắc nhở'}) cho PH học sinh ${student.full_name} (Buổi ${selectedSession.session_date})`
    );

    setCopiedStudentId(`${mode}_${stId}`);
    setTimeout(() => setCopiedStudentId(null), 2500);
    setContactedStudentIds((prev) => {
      const next = new Set(prev);
      next.add(stId);
      return next;
    });

    if (openZaloWindow && student.parent_phone) {
      const cleanPhone = student.parent_phone.replace(/\D/g, '');
      if (cleanPhone) {
        window.open(`https://zalo.me/${cleanPhone}`, '_blank', 'noopener,noreferrer');
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-5xl w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-5 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                TRẠM CSKH SAU BUỔI HỌC 1-CLICK
              </span>
              <span className="text-xs font-bold text-slate-500">
                Ngày {selectedSession.session_date}
              </span>
            </div>
            <h3 className="text-lg font-black text-slate-900 dark:text-slate-100 mt-1 flex items-center gap-2">
              <HeartHandshake className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              <span>
                Lớp {currentClass.class_name} — {selectedSession.lesson_title}
              </span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Tự động phân loại học sinh từ điểm số & nhận xét vừa chấm để gửi thông báo Nhóm Zalo lớp, nhắc nhở riêng và khen ngợi 1-Click.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 self-end sm:self-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 3 Actionable Tabs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 shrink-0">
          <button
            onClick={() => setActiveTab('group_zalo')}
            className={`p-3 rounded-xl border text-left transition-all flex items-center justify-between ${
              activeTab === 'group_zalo'
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-600/20'
                : 'bg-slate-50 dark:bg-slate-800/70 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Users className="w-4 h-4 shrink-0" />
              <div>
                <div className="text-xs font-extrabold">1. Báo Cáo Zalo Nhóm Lớp</div>
                <div
                  className={`text-[10px] ${
                    activeTab === 'group_zalo' ? 'text-indigo-100' : 'text-slate-500'
                  }`}
                >
                  Tổng kết buổi học & Vinh danh
                </div>
              </div>
            </div>
            <span
              className={`px-2 py-0.5 rounded-md text-[10px] font-black ${
                activeTab === 'group_zalo'
                  ? 'bg-white/20 text-white'
                  : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300'
              }`}
            >
              Cả lớp
            </span>
          </button>

          <button
            onClick={() => setActiveTab('reminder_list')}
            className={`p-3 rounded-xl border text-left transition-all flex items-center justify-between ${
              activeTab === 'reminder_list'
                ? 'bg-amber-600 text-white border-amber-600 shadow-md shadow-amber-600/20'
                : 'bg-slate-50 dark:bg-slate-800/70 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <div>
                <div className="text-xs font-extrabold">2. DS Cần Nhắc Nhở Riêng</div>
                <div
                  className={`text-[10px] ${
                    activeTab === 'reminder_list' ? 'text-amber-100' : 'text-slate-500'
                  }`}
                >
                  Vắng / Thiếu BTVN / Điểm KT &lt; 5
                </div>
              </div>
            </div>
            <span
              className={`px-2 py-0.5 rounded-md text-xs font-black ${
                activeTab === 'reminder_list'
                  ? 'bg-white/20 text-white'
                  : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
              }`}
            >
              {reminderItems.length} HS
            </span>
          </button>

          <button
            onClick={() => setActiveTab('praise_list')}
            className={`p-3 rounded-xl border text-left transition-all flex items-center justify-between ${
              activeTab === 'praise_list'
                ? 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/20'
                : 'bg-slate-50 dark:bg-slate-800/70 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Award className="w-4 h-4 shrink-0" />
              <div>
                <div className="text-xs font-extrabold">3. DS Khen Ngợi & Tiến Bộ</div>
                <div
                  className={`text-[10px] ${
                    activeTab === 'praise_list' ? 'text-emerald-100' : 'text-slate-500'
                  }`}
                >
                  Điểm KT ≥ 8.0 / BTVN ≥ 8.5
                </div>
              </div>
            </div>
            <span
              className={`px-2 py-0.5 rounded-md text-xs font-black ${
                activeTab === 'praise_list'
                  ? 'bg-white/20 text-white'
                  : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
              }`}
            >
              {praiseItems.length} HS
            </span>
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-4">
          {/* TAB 1: GROUP ZALO ANNOUNCEMENT */}
          {activeTab === 'group_zalo' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setGroupZaloMode('single_session')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      groupZaloMode === 'single_session'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    Báo cáo Buổi học vừa chấm ({selectedSession.session_date})
                  </button>
                  <button
                    onClick={() => setGroupZaloMode('cycle_4')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      groupZaloMode === 'cycle_4'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    Tổng kết Chu kỳ 4 buổi gần nhất
                  </button>
                </div>

                <div className="flex items-center gap-2 text-xs font-bold">
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                    Có mặt: {groupZaloData.presentCount}/{groupZaloData.totalCount}
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 border border-sky-200 dark:border-sky-800">
                    TB BTVN: {groupZaloData.avgHw}
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                    TB KT: {groupZaloData.avgTest}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-extrabold uppercase text-slate-500 mb-1.5">
                  Nội dung Thông báo gửi Nhóm Zalo Phụ Huynh Cả Lớp (Có thể chỉnh sửa trước khi sao chép)
                </label>
                <textarea
                  rows={14}
                  value={groupZaloDraft}
                  onChange={(e) => setGroupZaloDraft(e.target.value)}
                  className="w-full p-4 bg-slate-50 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-800 dark:text-slate-100 leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex justify-end">
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(groupZaloDraft);
                    } catch {
                      // ignore
                    }
                    setCopiedGroupZalo(true);
                    await logAudit(
                      'Teacher',
                      'Sao chép Báo cáo Zalo Nhóm Lớp',
                      `Sao chép thông báo Zalo nhóm PH lớp ${currentClass.class_name} (${groupZaloData.title})`
                    );
                    setTimeout(() => setCopiedGroupZalo(false), 2500);
                  }}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-md shadow-indigo-600/20"
                >
                  {copiedGroupZalo ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Đã sao chép Thông báo Nhóm Lớp!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Sao Chép Gửi Nhóm Zalo Cả Lớp</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: REMINDER LIST */}
          {activeTab === 'reminder_list' && (
            <div className="space-y-3">
              {reminderItems.length === 0 ? (
                <div className="p-10 text-center bg-emerald-50/50 dark:bg-emerald-950/20 rounded-2xl border border-emerald-200 dark:border-emerald-900/50 space-y-2">
                  <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
                  <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    Tuyệt vời! Buổi học này không có học sinh nào vắng mặt, thiếu BTVN hay bị điểm kiểm tra dưới 5.
                  </p>
                  <p className="text-xs text-slate-500">
                    Thầy/Cô có thể chuyển sang tab &ldquo;3. DS Khen Ngợi &amp; Tiến Bộ&rdquo; để gửi lời khen cho các học sinh đạt điểm tốt.
                  </p>
                </div>
              ) : (
                reminderItems.map((item, idx) => {
                  const st = item.student;
                  const stId = String(st.id);
                  const draftKey = `reminder_${stId}`;
                  const currentDraft = customDrafts[draftKey] ?? item.defaultMessage;
                  const isExpanded = expandedStudentId === draftKey || idx === 0;
                  const isCopied = copiedStudentId === draftKey;
                  const isContacted = contactedStudentIds.has(stId);
                  const crmStatus: CRMCustomerStatus = st.crm_status || item.suggestedCrmStatus;

                  return (
                    <div
                      key={stId}
                      className={`p-4 rounded-xl border transition-all space-y-3 ${
                        isContacted
                          ? 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/60'
                          : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-black text-slate-900 dark:text-slate-100">
                              {idx + 1}. {st.full_name}
                            </span>
                            {item.issueBadges.map((b) => (
                              <span
                                key={b}
                                className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 border border-rose-200 dark:border-rose-800"
                              >
                                {b}
                              </span>
                            ))}
                            {isContacted && (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-emerald-600 text-white flex items-center gap-1">
                                <Check className="w-3 h-3" /> Đã báo PH buổi này
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 flex flex-wrap items-center gap-3">
                            <span>
                              PH: <strong className="text-slate-700 dark:text-slate-300">{st.parent_name || 'Chưa cập nhật'}</strong>
                            </span>
                            {st.parent_phone && (
                              <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-semibold">
                                <Phone className="w-3 h-3" /> {st.parent_phone}
                              </span>
                            )}
                            <span>
                              Nhận xét buổi học:{' '}
                              <em className="text-slate-700 dark:text-slate-300">
                                {item.rec.custom_comment || 'Chưa ghi nhận xét riêng'}
                              </em>
                            </span>
                          </div>
                        </div>

                        {/* Actions Right */}
                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          <select
                            value={crmStatus}
                            onChange={(e) =>
                              handleUpdateStudentCRMStatus(
                                st,
                                e.target.value as CRMCustomerStatus
                              )
                            }
                            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-extrabold border focus:outline-none ${
                              crmStatus === 'at_risk'
                                ? 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800'
                                : crmStatus === 'attention'
                                ? 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800'
                                : 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                            }`}
                            title="Gắn nhãn phân loại CSKH cho học sinh này"
                          >
                            <option value="satisfied">🟢 Hài lòng</option>
                            <option value="attention">🟡 Cần chú ý</option>
                            <option value="at_risk">🔴 Nguy cơ nghỉ</option>
                          </select>

                          <button
                            type="button"
                            onClick={() =>
                              setExpandedStudentId(
                                expandedStudentId === draftKey ? null : draftKey
                              )
                            }
                            className="px-2.5 py-1.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-bold hover:bg-slate-200 flex items-center gap-1"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>{isExpanded ? 'Thu gọn tin' : 'Xem / Sửa tin'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              handleSendStudentMessage(
                                st,
                                'reminder',
                                item.defaultMessage,
                                false
                              )
                            }
                            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs"
                          >
                            {isCopied ? (
                              <>
                                <Check className="w-3.5 h-3.5" />
                                <span>Đã Copy & Lưu CSKH!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                <span>Copy Tin & Lưu CSKH</span>
                              </>
                            )}
                          </button>

                          {st.parent_phone && (
                            <button
                              type="button"
                              onClick={() =>
                                handleSendStudentMessage(
                                  st,
                                  'reminder',
                                  item.defaultMessage,
                                  true
                                )
                              }
                              className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1 shadow-xs"
                              title="Copy tin nhắn, lưu lịch sử CSKH và mở khung chat Zalo"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              <span>Mở Zalo</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="pt-2 border-t border-slate-100 dark:border-slate-700/60">
                          <textarea
                            rows={7}
                            value={currentDraft}
                            onChange={(e) =>
                              setCustomDrafts((prev) => ({
                                ...prev,
                                [draftKey]: e.target.value,
                              }))
                            }
                            className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-800 dark:text-slate-200 leading-relaxed focus:outline-none focus:ring-2 focus:ring-amber-500"
                          />
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* TAB 3: PRAISE LIST */}
          {activeTab === 'praise_list' && (
            <div className="space-y-3">
              {praiseItems.length === 0 ? (
                <div className="p-10 text-center bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
                  <Sparkles className="w-9 h-9 text-amber-500 mx-auto" />
                  <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    Chưa có học sinh nào đạt ngưỡng điểm khen ngợi (Điểm KT ≥ 8.0 hoặc BTVN ≥ 8.5) trong buổi học này.
                  </p>
                  <p className="text-xs text-slate-500">
                    Khi Thầy/Cô nhập điểm Kiểm tra từ 8.0 hoặc BTVN từ 8.5 trở lên, danh sách thư khen ngợi sẽ tự động hiển thị tại đây.
                  </p>
                </div>
              ) : (
                praiseItems.map((item, idx) => {
                  const st = item.student;
                  const stId = String(st.id);
                  const draftKey = `praise_${stId}`;
                  const currentDraft = customDrafts[draftKey] ?? item.defaultMessage;
                  const isExpanded = expandedStudentId === draftKey || idx === 0;
                  const isCopied = copiedStudentId === draftKey;
                  const isContacted = contactedStudentIds.has(stId);

                  return (
                    <div
                      key={stId}
                      className={`p-4 rounded-xl border transition-all space-y-3 ${
                        isContacted
                          ? 'bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800'
                          : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-black text-slate-900 dark:text-slate-100">
                              {idx + 1}. {st.full_name}
                            </span>
                            {item.issueBadges.map((b) => (
                              <span
                                key={b}
                                className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                              >
                                🏆 {b}
                              </span>
                            ))}
                            {isContacted && (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-emerald-600 text-white flex items-center gap-1">
                                <Check className="w-3 h-3" /> Đã gửi lời khen
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 flex flex-wrap items-center gap-3">
                            <span>
                              PH: <strong className="text-slate-700 dark:text-slate-300">{st.parent_name || 'Chưa cập nhật'}</strong>
                            </span>
                            {st.parent_phone && (
                              <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-semibold">
                                <Phone className="w-3 h-3" /> {st.parent_phone}
                              </span>
                            )}
                            <span>
                              Nhận xét buổi học:{' '}
                              <em className="text-slate-700 dark:text-slate-300">
                                {item.rec.custom_comment || 'Hoàn thành bài rất tốt'}
                              </em>
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedStudentId(
                                expandedStudentId === draftKey ? null : draftKey
                              )
                            }
                            className="px-2.5 py-1.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-bold hover:bg-slate-200 flex items-center gap-1"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>{isExpanded ? 'Thu gọn tin' : 'Xem / Sửa thư khen'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              handleSendStudentMessage(
                                st,
                                'praise',
                                item.defaultMessage,
                                false
                              )
                            }
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs"
                          >
                            {isCopied ? (
                              <>
                                <Check className="w-3.5 h-3.5" />
                                <span>Đã Copy & Lưu CSKH!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                <span>Copy Lời Khen & Lưu CSKH</span>
                              </>
                            )}
                          </button>

                          {st.parent_phone && (
                            <button
                              type="button"
                              onClick={() =>
                                handleSendStudentMessage(
                                  st,
                                  'praise',
                                  item.defaultMessage,
                                  true
                                )
                              }
                              className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1 shadow-xs"
                              title="Copy lời khen, lưu lịch sử CSKH và mở khung chat Zalo"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              <span>Mở Zalo</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="pt-2 border-t border-slate-100 dark:border-slate-700/60">
                          <textarea
                            rows={7}
                            value={currentDraft}
                            onChange={(e) =>
                              setCustomDrafts((prev) => ({
                                ...prev,
                                [draftKey]: e.target.value,
                              }))
                            }
                            className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-800 dark:text-slate-200 leading-relaxed focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <span>
            Mọi tin nhắn khi bấm <strong>Copy &amp; Lưu CSKH</strong> hoặc <strong>Mở Zalo</strong> đều tự động lưu vào Nhật ký CRM của học sinh.
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 dark:bg-slate-700 text-white rounded-xl font-bold hover:bg-slate-900"
          >
            Đóng Trạm CSKH
          </button>
        </div>
      </div>
    </div>
  );
};
