import React, { useState, useMemo, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/dexie';
import {
  Student,
  ClassItem,
  ClassStudent,
  Session,
  StudentSession,
  Warning,
  KnowledgeTag,
  KnowledgeResult,
  Settings,
  CRMCustomerStatus,
  CRMContactChannel,
  CRMInteractionLog,
  CRMMessageTemplate,
} from '../types';
import {
  CRM_CLASSIFICATION_CRITERIA,
  DEFAULT_CRM_MESSAGE_TEMPLATES,
  compileAccurateStudentParentReport,
  renderCRMTemplate,
  getFollowUpUrgency,
  StudentParentReportData,
} from '../utils/crmEngine';
import { logAudit } from '../utils/auditLogger';
import {
  HeartHandshake,
  CheckCircle2,
  AlertTriangle,
  Flame,
  CalendarClock,
  Phone,
  MessageSquareText,
  Copy,
  Check,
  ExternalLink,
  Search,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  Printer,
  Clock,
  Plus,
  Sparkles,
  BookOpen,
  UserCheck,
  History,
  X,
  Save,
  RefreshCw,
  FileText,
} from 'lucide-react';

interface CustomerCRMProps {
  students: Student[];
  classes: ClassItem[];
  warnings: Warning[];
  knowledgeTags: KnowledgeTag[];
}

const EMPTY_ARRAY: any[] = [];

export const CustomerCRM: React.FC<CustomerCRMProps> = ({
  students,
  classes,
  warnings,
  knowledgeTags,
}) => {
  // Live queries from IndexedDB (auto-synced with Supabase)
  const classStudents =
    useLiveQuery(() => db.class_students.toArray()) ?? (EMPTY_ARRAY as ClassStudent[]);
  const allSessions =
    useLiveQuery(() => db.sessions.toArray()) ?? (EMPTY_ARRAY as Session[]);
  const allStudentSessions =
    useLiveQuery(() => db.student_sessions.toArray()) ?? (EMPTY_ARRAY as StudentSession[]);
  const allKnowledgeResults =
    useLiveQuery(() => db.knowledge_results.toArray()) ?? (EMPTY_ARRAY as KnowledgeResult[]);
  const settingsArr =
    useLiveQuery(() => db.settings.toArray()) ?? (EMPTY_ARRAY as Settings[]);
  const activeSettings = settingsArr[0];

  // Filters & UI states
  const [selectedClassId, setSelectedClassId] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | CRMCustomerStatus | 'needs_review'>('all');
  const [followUpFilter, setFollowUpFilter] = useState<
    'all' | 'urgent_due' | 'stale_14d' | 'upcoming_7d'
  >('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCriteriaGuide, setShowCriteriaGuide] = useState(true);
  const [cycleLimit, setCycleLimit] = useState<1 | 4 | 8 | 'all'>(4);

  // Active modals
  const [reportModalStudentId, setReportModalStudentId] = useState<string | null>(null);
  const [timelineModalStudentId, setTimelineModalStudentId] = useState<string | null>(null);
  const [statusEditStudentId, setStatusEditStudentId] = useState<string | null>(null);

  // Report Modal internal state
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(
    DEFAULT_CRM_MESSAGE_TEMPLATES[0].id
  );
  const [customMessageDraft, setCustomMessageDraft] = useState<string>('');
  const [isMessageEdited, setIsMessageEdited] = useState(false);
  const [copiedSuccess, setCopiedSuccess] = useState(false);
  const [autoFollowupDays, setAutoFollowupDays] = useState<number>(7);
  const [toastBanner, setToastBanner] = useState<string | null>(null);

  // Timeline Modal internal state
  const [newLogChannel, setNewLogChannel] = useState<CRMContactChannel>('zalo');
  const [newLogSummary, setNewLogSummary] = useState('');
  const [newLogParentFeedback, setNewLogParentFeedback] = useState('');
  const [newLogStatus, setNewLogStatus] = useState<CRMCustomerStatus>('satisfied');
  const [newLogReason, setNewLogReason] = useState('');
  const [newLogFollowupDate, setNewLogFollowupDate] = useState('');

  // Status quick change popover state
  const [pendingStatus, setPendingStatus] = useState<CRMCustomerStatus>('satisfied');
  const [pendingReason, setPendingReason] = useState('');
  const [pendingFollowupDate, setPendingFollowupDate] = useState('');

  const printReportRef = useRef<HTMLDivElement>(null);

  const showToast = (msg: string) => {
    setToastBanner(msg);
    setTimeout(() => setToastBanner(null), 4000);
  };

  // Map student_id -> enrolled class_ids
  const enrolledMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const cs of classStudents) {
      if (cs.leave_date) continue;
      const sid = String(cs.student_id);
      if (!map.has(sid)) map.set(sid, []);
      map.get(sid)!.push(String(cs.class_id));
    }
    return map;
  }, [classStudents]);

  // Compile deterministic CRM & Academic Report for every studying/paused student
  const compiledRows = useMemo(() => {
    const activeStudents = students.filter((s) => s.status !== 'stopped');
    return activeStudents.map((student) => {
      const sid = String(student.id);
      const enrolledClassIds = enrolledMap.get(sid) || [];
      const report = compileAccurateStudentParentReport({
        student,
        classes,
        enrolledClassIds,
        selectedClassId: selectedClassId !== 'all' ? selectedClassId : undefined,
        cycleLimit,
        allSessions,
        allStudentSessions,
        allWarnings: warnings,
        allKnowledgeTags: knowledgeTags,
        allKnowledgeResults,
      });

      const currentStatus: CRMCustomerStatus =
        student.crm_status || report.suggestedStatus;
      const isManualSet = Boolean(student.crm_status);
      const differsFromSuggestion =
        isManualSet && student.crm_status !== report.suggestedStatus;

      const urgency = getFollowUpUrgency(
        student.crm_next_followup_date,
        report.daysSinceLastContact,
        currentStatus
      );

      return {
        student,
        report,
        currentStatus,
        isManualSet,
        differsFromSuggestion,
        urgency,
        enrolledClassIds,
      };
    });
  }, [
    students,
    classes,
    enrolledMap,
    selectedClassId,
    cycleLimit,
    allSessions,
    allStudentSessions,
    warnings,
    knowledgeTags,
    allKnowledgeResults,
  ]);

  // Filter rows by class, status, follow-up urgency, and search query
  const filteredRows = useMemo(() => {
    return compiledRows.filter((row) => {
      if (
        selectedClassId !== 'all' &&
        !row.enrolledClassIds.includes(String(selectedClassId))
      ) {
        return false;
      }

      if (statusFilter === 'needs_review') {
        if (!row.differsFromSuggestion) return false;
      } else if (statusFilter !== 'all' && row.currentStatus !== statusFilter) {
        return false;
      }

      if (followUpFilter === 'urgent_due') {
        if (
          row.urgency.level !== 'overdue' &&
          row.urgency.level !== 'due_today'
        ) {
          return false;
        }
      } else if (followUpFilter === 'stale_14d') {
        if (
          row.report.daysSinceLastContact !== null &&
          row.report.daysSinceLastContact <= 14
        ) {
          return false;
        }
      } else if (followUpFilter === 'upcoming_7d') {
        if (
          row.urgency.level !== 'upcoming' &&
          row.urgency.level !== 'due_today'
        ) {
          return false;
        }
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = row.student.full_name?.toLowerCase().includes(q);
        const matchParent = row.student.parent_name?.toLowerCase().includes(q);
        const matchPhone =
          row.student.parent_phone?.toLowerCase().includes(q) ||
          row.student.phone?.toLowerCase().includes(q);
        const matchReason = row.student.crm_status_reason?.toLowerCase().includes(q);
        if (!matchName && !matchParent && !matchPhone && !matchReason) {
          return false;
        }
      }

      return true;
    });
  }, [
    compiledRows,
    selectedClassId,
    statusFilter,
    followUpFilter,
    searchQuery,
  ]);

  // Summary KPI counts (respecting class filter)
  const kpiStats = useMemo(() => {
    const classScoped =
      selectedClassId === 'all'
        ? compiledRows
        : compiledRows.filter((r) =>
            r.enrolledClassIds.includes(String(selectedClassId))
          );
    const total = classScoped.length;
    const satisfied = classScoped.filter((r) => r.currentStatus === 'satisfied').length;
    const attention = classScoped.filter((r) => r.currentStatus === 'attention').length;
    const atRisk = classScoped.filter((r) => r.currentStatus === 'at_risk').length;
    const urgentFollowUp = classScoped.filter(
      (r) =>
        r.urgency.level === 'overdue' ||
        r.urgency.level === 'due_today' ||
        r.urgency.level === 'stale_contact'
    ).length;
    const differsCount = classScoped.filter((r) => r.differsFromSuggestion).length;

    return {
      total,
      satisfied,
      attention,
      atRisk,
      urgentFollowUp,
      differsCount,
    };
  }, [compiledRows, selectedClassId]);

  const templates: CRMMessageTemplate[] = useMemo(() => {
    if (
      activeSettings?.crm_message_templates &&
      activeSettings.crm_message_templates.length > 0
    ) {
      return activeSettings.crm_message_templates;
    }
    return DEFAULT_CRM_MESSAGE_TEMPLATES;
  }, [activeSettings]);

  const activeReportRow = useMemo(() => {
    if (!reportModalStudentId) return null;
    return (
      compiledRows.find(
        (r) => String(r.student.id) === String(reportModalStudentId)
      ) || null
    );
  }, [compiledRows, reportModalStudentId]);

  const activeTimelineRow = useMemo(() => {
    if (!timelineModalStudentId) return null;
    return (
      compiledRows.find(
        (r) => String(r.student.id) === String(timelineModalStudentId)
      ) || null
    );
  }, [compiledRows, timelineModalStudentId]);

  const activeStatusEditRow = useMemo(() => {
    if (!statusEditStudentId) return null;
    return (
      compiledRows.find(
        (r) => String(r.student.id) === String(statusEditStudentId)
      ) || null
    );
  }, [compiledRows, statusEditStudentId]);

  // Compute rendered message in Report Modal
  const renderedTemplateMessage = useMemo(() => {
    if (!activeReportRow) return '';
    const tpl =
      templates.find((t) => t.id === selectedTemplateId) || templates[0];
    return renderCRMTemplate(
      tpl.body,
      activeReportRow.report,
      activeSettings?.pronoun_config
    );
  }, [activeReportRow, templates, selectedTemplateId, activeSettings]);

  const displayedMessage = isMessageEdited
    ? customMessageDraft
    : renderedTemplateMessage;

  const getFutureDateStr = (daysAhead: number): string => {
    const d = new Date();
    d.setDate(d.getDate() + daysAhead);
    return d.toISOString().slice(0, 10);
  };

  // Handler: Open 1-Click Parent Report Modal
  const handleOpenReportModal = (row: (typeof compiledRows)[number]) => {
    setReportModalStudentId(String(row.student.id));
    // Auto-select the best matching template based on student status
    if (row.currentStatus === 'at_risk') {
      setSelectedTemplateId('tpl_retention_care');
      setAutoFollowupDays(3);
    } else if (row.currentStatus === 'attention') {
      if (row.report.hwCompletionRate < 85 || row.report.unexcusedCount > 0) {
        setSelectedTemplateId('tpl_homework_attendance');
      } else {
        setSelectedTemplateId('tpl_knowledge_remedial');
      }
      setAutoFollowupDays(7);
    } else {
      if (
        row.report.studentTestAvg !== null &&
        row.report.studentTestAvg >= 8.0
      ) {
        setSelectedTemplateId('tpl_praise_progress');
      } else {
        setSelectedTemplateId('tpl_periodic_report');
      }
      setAutoFollowupDays(14);
    }
    setIsMessageEdited(false);
    setCopiedSuccess(false);
  };

  // Handler: Open CRM Timeline & Follow-up Modal
  const handleOpenTimelineModal = (row: (typeof compiledRows)[number]) => {
    setTimelineModalStudentId(String(row.student.id));
    setNewLogChannel('zalo');
    setNewLogSummary('');
    setNewLogParentFeedback('');
    setNewLogStatus(row.currentStatus);
    setNewLogReason(
      row.student.crm_status_reason ||
        row.report.suggestedReasons[0] ||
        CRM_CLASSIFICATION_CRITERIA[row.currentStatus].presetReasons[0]
    );
    const defaultDays =
      CRM_CLASSIFICATION_CRITERIA[row.currentStatus].followUpCadenceDays;
    setNewLogFollowupDate(
      row.student.crm_next_followup_date || getFutureDateStr(defaultDays)
    );
  };

  // Handler: Open Quick Status Classification Modal
  const handleOpenStatusModal = (
    row: (typeof compiledRows)[number],
    targetStatus?: CRMCustomerStatus
  ) => {
    const st = targetStatus || row.currentStatus;
    setStatusEditStudentId(String(row.student.id));
    setPendingStatus(st);
    setPendingReason(
      row.student.crm_status_reason ||
        (st === row.report.suggestedStatus
          ? row.report.suggestedReasons.join('; ')
          : CRM_CLASSIFICATION_CRITERIA[st].presetReasons[0])
    );
    const cadence = CRM_CLASSIFICATION_CRITERIA[st].followUpCadenceDays;
    setPendingFollowupDate(
      row.student.crm_next_followup_date || getFutureDateStr(cadence)
    );
  };

  // Handler: Save Manual Status Classification
  const handleSaveManualStatus = async () => {
    if (!activeStatusEditRow?.student.id) return;
    const now = new Date().toISOString();
    const student = activeStatusEditRow.student;

    await db.students.update(student.id!, {
      crm_status: pendingStatus,
      crm_status_reason:
        pendingReason.trim() ||
        CRM_CLASSIFICATION_CRITERIA[pendingStatus].presetReasons[0],
      crm_status_updated_at: now,
      crm_next_followup_date: pendingFollowupDate || undefined,
      updated_at: now,
    });

    await logAudit(
      'Teacher',
      'CRM_UPDATE_STATUS',
      `Phân loại CSKH học sinh ${student.full_name}: ${CRM_CLASSIFICATION_CRITERIA[pendingStatus].label} (${pendingReason})`
    );

    setStatusEditStudentId(null);
    showToast(
      `Đã cập nhật nhãn "${CRM_CLASSIFICATION_CRITERIA[pendingStatus].shortBadge}" cho ${student.full_name}!`
    );
  };

  // Handler: Batch apply criteria suggestions for all students in current view
  const handleApplyAllCriteriaSuggestions = async () => {
    const now = new Date().toISOString();
    let updatedCount = 0;

    for (const row of filteredRows) {
      if (!row.student.id) continue;
      const suggested = row.report.suggestedStatus;
      const reasonText = row.report.suggestedReasons.join('; ');
      if (
        row.student.crm_status !== suggested ||
        !row.student.crm_status_reason
      ) {
        const cadence = CRM_CLASSIFICATION_CRITERIA[suggested].followUpCadenceDays;
        await db.students.update(row.student.id, {
          crm_status: suggested,
          crm_status_reason: reasonText,
          crm_status_updated_at: now,
          crm_next_followup_date:
            row.student.crm_next_followup_date || getFutureDateStr(cadence),
          updated_at: now,
        });
        updatedCount++;
      }
    }

    showToast(
      updatedCount > 0
        ? `Đã đồng bộ phân loại theo Bộ Tiêu Chí Chuẩn cho ${updatedCount} học sinh!`
        : 'Tất cả học sinh trong danh sách đã khớp với Bộ Tiêu Chí Chuẩn!'
    );
  };

  // Handler: Copy Message & Auto-Log CRM Interaction
  const handleCopyAndLogReport = async (openZaloAfterCopy = false) => {
    if (!activeReportRow?.student.id) return;
    const student = activeReportRow.student;
    const messageToCopy = displayedMessage;

    try {
      await navigator.clipboard.writeText(messageToCopy);
      setCopiedSuccess(true);
    } catch (e) {
      // Fallback copy
    }

    const now = new Date().toISOString();
    const nextDate = getFutureDateStr(autoFollowupDays);
    const tpl =
      templates.find((t) => t.id === selectedTemplateId) || templates[0];

    const newEntry: CRMInteractionLog = {
      id: `crm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      created_at: now,
      channel: 'zalo',
      template_category: tpl.category,
      summary: `Đã gửi ${tpl.title} (${activeReportRow.report.periodLabel})`,
      message_sent: messageToCopy,
      parent_feedback: 'Đã gửi báo cáo qua Zalo, đang chờ Phụ huynh phản hồi',
      status_snapshot: activeReportRow.currentStatus,
      next_followup_date: nextDate,
      created_by: 'Giáo viên',
    };

    const existingLogs = Array.isArray(student.crm_interactions)
      ? student.crm_interactions
      : [];

    await db.students.update(student.id!, {
      crm_status: student.crm_status || activeReportRow.currentStatus,
      crm_status_reason:
        student.crm_status_reason ||
        activeReportRow.report.suggestedReasons.join('; '),
      crm_last_contacted_at: now,
      crm_next_followup_date: nextDate,
      crm_interactions: [newEntry, ...existingLogs],
      updated_at: now,
    });

    await logAudit(
      'Teacher',
      'CRM_SEND_PARENT_REPORT',
      `Đã xuất báo cáo 1-Click & lưu nhật ký CSKH cho PH em ${student.full_name} (Hẹn tiếp: ${nextDate})`
    );

    showToast(
      `Đã sao chép báo cáo, lưu nhật ký CSKH và đặt lịch nhắc tiếp theo vào ${nextDate}!`
    );

    if (openZaloAfterCopy && student.parent_phone) {
      const cleanPhone = student.parent_phone.replace(/\D/g, '');
      if (cleanPhone) {
        const a = document.createElement('a');
        a.href = `https://zalo.me/${cleanPhone}`;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.click();
      }
    }
  };

  // Handler: Save customized template into Settings
  const handleSaveCustomTemplate = async () => {
    if (!activeSettings?.id || !isMessageEdited) return;
    const now = new Date().toISOString();
    const updatedTemplates = templates.map((t) =>
      t.id === selectedTemplateId
        ? { ...t, body: customMessageDraft, isCustom: true }
        : t
    );
    await db.settings.update(activeSettings.id, {
      crm_message_templates: updatedTemplates,
      updated_at: now,
    });
    showToast('Đã lưu mẫu tin nhắn tùy chỉnh vào Cài đặt hệ thống!');
  };

  // Handler: Add a new interaction log from Timeline Modal
  const handleAddInteractionLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTimelineRow?.student.id) return;
    const student = activeTimelineRow.student;
    const now = new Date().toISOString();

    const summaryText =
      newLogSummary.trim() ||
      `Trao đổi với Phụ huynh em ${student.full_name} qua ${newLogChannel.toUpperCase()}`;

    const entry: CRMInteractionLog = {
      id: `crm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      created_at: now,
      channel: newLogChannel,
      summary: summaryText,
      parent_feedback: newLogParentFeedback.trim() || 'Đã ghi nhận trao đổi',
      status_snapshot: newLogStatus,
      next_followup_date: newLogFollowupDate || undefined,
      created_by: 'Giáo viên',
    };

    const existingLogs = Array.isArray(student.crm_interactions)
      ? student.crm_interactions
      : [];

    await db.students.update(student.id!, {
      crm_status: newLogStatus,
      crm_status_reason:
        newLogReason.trim() ||
        CRM_CLASSIFICATION_CRITERIA[newLogStatus].presetReasons[0],
      crm_status_updated_at: now,
      crm_last_contacted_at: now,
      crm_next_followup_date: newLogFollowupDate || undefined,
      crm_interactions: [entry, ...existingLogs],
      updated_at: now,
    });

    await logAudit(
      'Teacher',
      'CRM_LOG_INTERACTION',
      `Ghi nhật ký CSKH PH em ${student.full_name}: ${summaryText}`
    );

    setNewLogSummary('');
    setNewLogParentFeedback('');
    showToast(`Đã lưu nhật ký CSKH & cập nhật lịch hẹn cho ${student.full_name}!`);
  };

  // Handler: Print / Save PDF of 1-Click Parent Report Card
  const handlePrintParentReportCard = () => {
    window.print();
  };

  const renderStatusSelectBadge = (
    row: (typeof compiledRows)[number]
  ) => {
    const st = row.currentStatus;
    const badgeColor =
      st === 'satisfied'
        ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
        : st === 'attention'
        ? 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800'
        : 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800';

    return (
      <div className="space-y-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => handleOpenStatusModal(row)}
            className={`px-2.5 py-1 rounded-lg border text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${badgeColor}`}
            title="Nhấn để phân loại trạng thái & ghi chú tiêu chí"
          >
            {st === 'satisfied' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
            {st === 'attention' && <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />}
            {st === 'at_risk' && <Flame className="w-3.5 h-3.5 text-rose-600 shrink-0" />}
            <span>{CRM_CLASSIFICATION_CRITERIA[st].shortBadge}</span>
            <ChevronDown className="w-3 h-3 opacity-60" />
          </button>

          {row.differsFromSuggestion && (
            <button
              type="button"
              onClick={() =>
                handleOpenStatusModal(row, row.report.suggestedStatus)
              }
              className="text-[11px] font-medium text-sky-700 dark:text-sky-300 hover:underline cursor-pointer"
              title={`Dữ liệu học tập thực tế gợi ý mức: ${
                CRM_CLASSIFICATION_CRITERIA[row.report.suggestedStatus].shortBadge
              } (${row.report.suggestedReasons.join(', ')})`}
            >
              Gợi ý: {CRM_CLASSIFICATION_CRITERIA[row.report.suggestedStatus].shortBadge}
            </button>
          )}
        </div>

        <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 leading-snug">
          {row.student.crm_status_reason ||
            row.report.suggestedReasons.join(' · ')}
        </p>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* Toast Notification */}
      {toastBanner && (
        <div className="p-3.5 rounded-xl bg-emerald-600 text-white text-xs font-bold flex items-center justify-between shadow-md">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{toastBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setToastBanner(null)}
            className="p-1 hover:bg-emerald-700 rounded-lg cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Top Header & Cycle Scope Selector */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-600/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <HeartHandshake className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                CRM Chăm Sóc Học Sinh & Báo Cáo Phụ Huynh Chính Xác
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Phân loại 3 trạng thái gắn kết theo tiêu chí chuẩn · Báo cáo học tập 1-Click · Mẫu tin Zalo/SMS cá nhân hóa & Nhắc lịch CSKH
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
            {(
              [
                { val: 1, label: '1 Buổi gần nhất' },
                { val: 4, label: 'Chu kỳ 4 Buổi' },
                { val: 8, label: 'Chu kỳ 8 Buổi' },
                { val: 'all', label: 'Toàn khóa' },
              ] as const
            ).map((opt) => (
              <button
                key={String(opt.val)}
                type="button"
                onClick={() => setCycleLimit(opt.val)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  cycleLimit === opt.val
                    ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-300 shadow-xs font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setShowCriteriaGuide((prev) => !prev)}
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <BookOpen className="w-3.5 h-3.5 text-emerald-600" />
            <span>Bộ Tiêu Chí Phân Loại</span>
            {showCriteriaGuide ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>

          <button
            type="button"
            onClick={handleApplyAllCriteriaSuggestions}
            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Tự động gắn nhãn phân loại cho các học sinh dựa trên số liệu điểm số, chuyên cần và cảnh báo thực tế"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Đồng bộ Gợi ý theo Tiêu chí</span>
          </button>
        </div>
      </div>

      {/* Collapsible Customer Classification Criteria Matrix */}
      {showCriteriaGuide && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Khung Tiêu Chí Chuẩn Phân Loại Học Sinh & Phụ Huynh (3 Nhóm Trạng Thái Gắn Kết)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Hệ thống tự động đối chiếu số liệu Chuyên cần, Điểm BTVN, Điểm Kiểm tra và Cảnh báo để gợi ý nhãn, đồng thời cho phép Giáo viên phân loại thủ công 1-Click.
              </p>
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
              Chu kỳ tính số liệu: {cycleLimit === 'all' ? 'Toàn khóa' : `${cycleLimit} buổi gần nhất`}
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Tier 1: Satisfied */}
            <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-900/70 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <h3 className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                    1. Nhóm Hài lòng & Ổn định (Satisfied)
                  </h3>
                </div>
                <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 font-mono">
                  CSKH: 14 ngày/lần
                </span>
              </div>
              <div className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
                <p className="font-semibold text-slate-900 dark:text-slate-100">
                  Tiêu chí học tập & chuyên cần:
                </p>
                <ul className="list-disc pl-4 space-y-1 text-[11px] text-slate-600 dark:text-slate-300">
                  {CRM_CLASSIFICATION_CRITERIA.satisfied.academicCriteria.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
                <p className="font-semibold text-slate-900 dark:text-slate-100 pt-1">
                  Tiêu chí tương tác Phụ huynh:
                </p>
                <ul className="list-disc pl-4 space-y-1 text-[11px] text-slate-600 dark:text-slate-300">
                  {CRM_CLASSIFICATION_CRITERIA.satisfied.parentInteractionCriteria.map(
                    (c, i) => (
                      <li key={i}>{c}</li>
                    )
                  )}
                </ul>
                <p className="text-[11px] text-emerald-800 dark:text-emerald-300 pt-1 font-medium">
                  Quy trình CSKH: {CRM_CLASSIFICATION_CRITERIA.satisfied.recommendedAction}
                </p>
              </div>
            </div>

            {/* Tier 2: Attention */}
            <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-900/70 bg-amber-50/40 dark:bg-amber-950/20 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <h3 className="text-xs font-bold text-amber-900 dark:text-amber-200">
                    2. Nhóm Cần chú ý (Attention)
                  </h3>
                </div>
                <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 font-mono">
                  CSKH: 7 ngày/lần
                </span>
              </div>
              <div className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
                <p className="font-semibold text-slate-900 dark:text-slate-100">
                  Tiêu chí học tập & chuyên cần:
                </p>
                <ul className="list-disc pl-4 space-y-1 text-[11px] text-slate-600 dark:text-slate-300">
                  {CRM_CLASSIFICATION_CRITERIA.attention.academicCriteria.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
                <p className="font-semibold text-slate-900 dark:text-slate-100 pt-1">
                  Tiêu chí tương tác Phụ huynh:
                </p>
                <ul className="list-disc pl-4 space-y-1 text-[11px] text-slate-600 dark:text-slate-300">
                  {CRM_CLASSIFICATION_CRITERIA.attention.parentInteractionCriteria.map(
                    (c, i) => (
                      <li key={i}>{c}</li>
                    )
                  )}
                </ul>
                <p className="text-[11px] text-amber-800 dark:text-amber-300 pt-1 font-medium">
                  Quy trình CSKH: {CRM_CLASSIFICATION_CRITERIA.attention.recommendedAction}
                </p>
              </div>
            </div>

            {/* Tier 3: At Risk */}
            <div className="p-4 rounded-xl border border-rose-200 dark:border-rose-900/70 bg-rose-50/40 dark:bg-rose-950/20 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Flame className="w-4 h-4 text-rose-600" />
                  <h3 className="text-xs font-bold text-rose-900 dark:text-rose-200">
                    3. Nhóm Nguy cơ nghỉ học (At Risk)
                  </h3>
                </div>
                <span className="text-[11px] font-semibold text-rose-700 dark:text-rose-400 font-mono">
                  CSKH: 3 – 5 ngày/lần
                </span>
              </div>
              <div className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
                <p className="font-semibold text-slate-900 dark:text-slate-100">
                  Tiêu chí học tập & chuyên cần:
                </p>
                <ul className="list-disc pl-4 space-y-1 text-[11px] text-slate-600 dark:text-slate-300">
                  {CRM_CLASSIFICATION_CRITERIA.at_risk.academicCriteria.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
                <p className="font-semibold text-slate-900 dark:text-slate-100 pt-1">
                  Tiêu chí tương tác Phụ huynh:
                </p>
                <ul className="list-disc pl-4 space-y-1 text-[11px] text-slate-600 dark:text-slate-300">
                  {CRM_CLASSIFICATION_CRITERIA.at_risk.parentInteractionCriteria.map(
                    (c, i) => (
                      <li key={i}>{c}</li>
                    )
                  )}
                </ul>
                <p className="text-[11px] text-rose-800 dark:text-rose-300 pt-1 font-medium">
                  Quy trình CSKH: {CRM_CLASSIFICATION_CRITERIA.at_risk.recommendedAction}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4 KPI Summary Filter Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <button
          type="button"
          onClick={() => {
            setStatusFilter(statusFilter === 'satisfied' ? 'all' : 'satisfied');
            setFollowUpFilter('all');
          }}
          className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
            statusFilter === 'satisfied'
              ? 'bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-500 ring-1 ring-emerald-500'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-emerald-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
            <span>Hài lòng & Ổn định</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
              {kpiStats.satisfied}
            </span>
            <span className="text-xs text-emerald-700 dark:text-emerald-400 font-mono tabular-nums">
              {kpiStats.total > 0
                ? `${Math.round((kpiStats.satisfied / kpiStats.total) * 100)}% sĩ số`
                : '0%'}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            Điểm KT ≥ 7.0 · BTVN ≥ 85% · CSKH 14 ngày/lần
          </p>
        </button>

        <button
          type="button"
          onClick={() => {
            setStatusFilter(statusFilter === 'attention' ? 'all' : 'attention');
            setFollowUpFilter('all');
          }}
          className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
            statusFilter === 'attention'
              ? 'bg-amber-50/80 dark:bg-amber-950/40 border-amber-500 ring-1 ring-amber-500'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-amber-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
            <span>Cần chú ý</span>
            <AlertTriangle className="w-4 h-4 text-amber-600" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-amber-700 dark:text-amber-400 font-mono tabular-nums">
              {kpiStats.attention}
            </span>
            <span className="text-xs text-amber-700 dark:text-amber-400 font-mono tabular-nums">
              {kpiStats.total > 0
                ? `${Math.round((kpiStats.attention / kpiStats.total) * 100)}% sĩ số`
                : '0%'}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            Có cảnh báo P2 / Thiếu BTVN · CSKH 7 ngày/lần
          </p>
        </button>

        <button
          type="button"
          onClick={() => {
            setStatusFilter(statusFilter === 'at_risk' ? 'all' : 'at_risk');
            setFollowUpFilter('all');
          }}
          className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
            statusFilter === 'at_risk'
              ? 'bg-rose-50/80 dark:bg-rose-950/40 border-rose-500 ring-1 ring-rose-500'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-rose-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
            <span>Nguy cơ nghỉ học</span>
            <Flame className="w-4 h-4 text-rose-600" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-rose-600 dark:text-rose-400 font-mono tabular-nums">
              {kpiStats.atRisk}
            </span>
            <span className="text-xs text-rose-700 dark:text-rose-400 font-mono tabular-nums">
              Ưu tiên xử lý 24h
            </span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            Cảnh báo P1 / Điểm KT &lt; 5.0 · CSKH 3-5 ngày/lần
          </p>
        </button>

        <button
          type="button"
          onClick={() => {
            setFollowUpFilter(
              followUpFilter === 'urgent_due' ? 'all' : 'urgent_due'
            );
            setStatusFilter('all');
          }}
          className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
            followUpFilter === 'urgent_due'
              ? 'bg-sky-50/80 dark:bg-sky-950/40 border-sky-500 ring-1 ring-sky-500'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-sky-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
            <span>Lịch nhắc CSKH cần xử lý</span>
            <CalendarClock className="w-4 h-4 text-sky-600" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-slate-900 dark:text-slate-100 font-mono tabular-nums">
              {kpiStats.urgentFollowUp}
            </span>
            <span className="text-xs text-sky-700 dark:text-sky-400 font-mono tabular-nums">
              Đến hạn / Quá hạn
            </span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            Hẹn gọi hôm nay hoặc quá hạn chu kỳ chăm sóc
          </p>
        </button>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Class Filter */}
          <select
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="all">Tất cả lớp học ({classes.length} lớp)</option>
            {classes.map((cls) => (
              <option key={cls.id} value={String(cls.id)}>
                {cls.class_name} (Khối {cls.grade_level})
              </option>
            ))}
          </select>

          {/* Segmented Status Filter */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
            {(
              [
                { key: 'all', label: `Tất cả (${kpiStats.total})` },
                { key: 'satisfied', label: `Hài lòng (${kpiStats.satisfied})` },
                { key: 'attention', label: `Cần chú ý (${kpiStats.attention})` },
                { key: 'at_risk', label: `Nguy cơ nghỉ (${kpiStats.atRisk})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setStatusFilter(tab.key)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  statusFilter === tab.key
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Follow-up Filter */}
          <select
            value={followUpFilter}
            onChange={(e) => setFollowUpFilter(e.target.value as any)}
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="all">Mọi lịch hẹn CSKH</option>
            <option value="urgent_due">Đến hạn hôm nay / Quá hạn hẹn</option>
            <option value="stale_14d">Chưa liên hệ Phụ huynh &gt; 14 ngày</option>
            <option value="upcoming_7d">Lịch hẹn trong 7 ngày tới</option>
          </select>
        </div>

        {/* Search Input */}
        <div className="relative min-w-[240px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm học sinh, tên phụ huynh, SĐT..."
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>

      {/* Main High-Density CRM Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <th className="py-3 px-4">Học sinh & Lớp</th>
                <th className="py-3 px-4">Phụ huynh & Liên hệ</th>
                <th className="py-3 px-4">Tình trạng học tập ({cycleLimit === 'all' ? 'Toàn khóa' : `${cycleLimit} buổi`})</th>
                <th className="py-3 px-4 min-w-[220px]">Phân loại Khách hàng (Thủ công + Tiêu chí)</th>
                <th className="py-3 px-4">Lịch sử & Nhắc lịch CSKH</th>
                <th className="py-3 px-4 text-right">Báo cáo 1-Click & CSKH</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800 text-xs">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500 dark:text-slate-400">
                    Không tìm thấy học sinh nào khớp với bộ lọc hiện tại.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const { student, report, urgency } = row;
                  const p1Count = report.activeWarnings.filter(
                    (w) => w.priority === 'P1'
                  ).length;
                  const p2Count = report.activeWarnings.filter(
                    (w) => w.priority === 'P2'
                  ).length;
                  const cleanParentPhone = (student.parent_phone || '').replace(
                    /\D/g,
                    ''
                  );
                  const lastLog = student.crm_interactions?.[0];

                  return (
                    <tr
                      key={student.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      {/* Col 1: Student & Class */}
                      <td className="py-3.5 px-4 align-top">
                        <div className="font-bold text-slate-900 dark:text-slate-100">
                          {student.full_name}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          {report.primaryClass?.class_name || 'Chưa xếp lớp'}
                          {student.status === 'paused' && ' · Đang tạm nghỉ'}
                        </div>
                        {(p1Count > 0 || p2Count > 0) && (
                          <div className="text-[11px] font-semibold mt-1 flex items-center gap-2">
                            {p1Count > 0 && (
                              <span className="text-rose-600 dark:text-rose-400">
                                {p1Count} Cảnh báo P1
                              </span>
                            )}
                            {p1Count > 0 && p2Count > 0 && <span>·</span>}
                            {p2Count > 0 && (
                              <span className="text-amber-600 dark:text-amber-400">
                                {p2Count} Cảnh báo P2
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Col 2: Parent & Quick Contact */}
                      <td className="py-3.5 px-4 align-top">
                        <div className="font-semibold text-slate-800 dark:text-slate-200">
                          {student.parent_name || 'Phụ huynh'}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-0.5">
                          {student.parent_phone || 'Chưa cập nhật SĐT'}
                        </div>
                        {cleanParentPhone && (
                          <div className="flex items-center gap-2 mt-1.5">
                            <a
                              href={`tel:${cleanParentPhone}`}
                              className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:text-emerald-600 flex items-center gap-1"
                            >
                              <Phone className="w-3 h-3" />
                              <span>Gọi</span>
                            </a>
                            <span className="text-slate-300 dark:text-slate-700">·</span>
                            <a
                              href={`https://zalo.me/${cleanParentPhone}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[11px] font-semibold text-sky-600 dark:text-sky-400 hover:underline flex items-center gap-1"
                            >
                              <ExternalLink className="w-3 h-3" />
                              <span>Mở Zalo</span>
                            </a>
                          </div>
                        )}
                      </td>

                      {/* Col 3: Real Academic Metrics */}
                      <td className="py-3.5 px-4 align-top font-mono tabular-nums">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-slate-500 dark:text-slate-400 font-sans">
                            Chuyên cần:
                          </span>
                          <span
                            className={`font-bold ${
                              report.attendanceRate >= 90
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : report.attendanceRate >= 75
                                ? 'text-amber-700 dark:text-amber-400'
                                : 'text-rose-600 dark:text-rose-400'
                            }`}
                          >
                            {report.attendanceRate}% ({report.presentCount}/
                            {report.totalSessionsInPeriod})
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs mt-1">
                          <span className="text-slate-500 dark:text-slate-400 font-sans">
                            Điểm BTVN:
                          </span>
                          <span className="font-bold text-slate-800 dark:text-slate-200">
                            {report.studentHwAvg !== null
                              ? `${report.studentHwAvg}/10`
                              : '—'}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            (Nộp {report.hwCompletionRate}%)
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs mt-1">
                          <span className="text-slate-500 dark:text-slate-400 font-sans">
                            Điểm KT:
                          </span>
                          <span
                            className={`font-bold ${
                              report.studentTestAvg === null
                                ? 'text-slate-500'
                                : report.studentTestAvg >= 7.0
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : report.studentTestAvg >= 5.0
                                ? 'text-amber-700 dark:text-amber-400'
                                : 'text-rose-600 dark:text-rose-400'
                            }`}
                          >
                            {report.studentTestAvg !== null
                              ? `${report.studentTestAvg}/10`
                              : 'Chưa KT'}
                          </span>
                          {report.classTestAvg !== null && (
                            <span className="text-[11px] text-slate-400">
                              (Lớp: {report.classTestAvg})
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Col 4: Manual Customer Status & Criteria Reasoning */}
                      <td className="py-3.5 px-4 align-top">
                        {renderStatusSelectBadge(row)}
                      </td>

                      {/* Col 5: Follow-up Reminder & Last Interaction */}
                      <td className="py-3.5 px-4 align-top">
                        <div
                          className={`text-xs font-semibold font-mono tabular-nums ${
                            urgency.level === 'overdue'
                              ? 'text-rose-600 dark:text-rose-400'
                              : urgency.level === 'due_today'
                              ? 'text-amber-600 dark:text-amber-400'
                              : urgency.level === 'stale_contact'
                              ? 'text-amber-700 dark:text-amber-300'
                              : 'text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {urgency.label}
                        </div>
                        {lastLog ? (
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                            Gần nhất ({new Date(lastLog.created_at).toLocaleDateString('vi-VN')}):{' '}
                            {lastLog.summary}
                          </div>
                        ) : (
                          <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                            Chưa có lịch sử gửi báo cáo
                          </div>
                        )}
                      </td>

                      {/* Col 6: Actions */}
                      <td className="py-3.5 px-4 align-top text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenReportModal(row)}
                            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                          >
                            <MessageSquareText className="w-3.5 h-3.5" />
                            <span>Báo cáo PH 1-Click</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenTimelineModal(row)}
                            className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
                            title="Xem lịch sử chăm sóc & Đặt lịch nhắc CSKH"
                          >
                            <History className="w-3.5 h-3.5 text-slate-500" />
                            <span>
                              Nhật ký ({student.crm_interactions?.length || 0})
                            </span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* MODAL 1: 1-CLICK ACCURATE PARENT REPORT & PERSONALIZED ZALO/SMS       */}
      {/* ===================================================================== */}
      {activeReportRow && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-6xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-800/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-600/10 text-emerald-600 flex items-center justify-center font-bold">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Báo Cáo Tình Trạng Học Tập Chính Xác 1-Click — {activeReportRow.student.full_name}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Phụ huynh: {activeReportRow.student.parent_name || 'Gia đình'} ({activeReportRow.student.parent_phone || 'Chưa có SĐT'}) ·{' '}
                    {activeReportRow.report.primaryClass?.class_name} · {activeReportRow.report.periodLabel}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrintParentReportCard}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 text-emerald-600" />
                  <span>In / Xuất PDF Phiếu Báo Cáo</span>
                </button>
                <button
                  type="button"
                  onClick={() => setReportModalStudentId(null)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body: 2 Columns */}
            <div className="p-5 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1">
              {/* LEFT COLUMN (7 cols): Accurate Academic Telemetry & Session Breakdown */}
              <div
                ref={printReportRef}
                className="lg:col-span-7 space-y-4 print:col-span-12"
              >
                {/* Cycle Switcher inside Modal */}
                <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200 dark:border-slate-800 print:hidden">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                    Khoảng dữ liệu tổng hợp báo cáo:
                  </span>
                  <div className="flex items-center gap-1">
                    {(
                      [
                        { val: 1, label: '1 Buổi gần nhất' },
                        { val: 4, label: '4 Buổi gần nhất' },
                        { val: 8, label: '8 Buổi gần nhất' },
                        { val: 'all', label: 'Toàn khóa' },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={String(opt.val)}
                        type="button"
                        onClick={() => {
                          setCycleLimit(opt.val);
                          setIsMessageEdited(false);
                        }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                          cycleLimit === opt.val
                            ? 'bg-emerald-600 text-white font-bold'
                            : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Printable Report Card Box */}
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
                  <div className="border-b border-slate-200 dark:border-slate-800 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase">
                        Phiếu Báo Cáo Kết Quả Học Tập Môn Toán
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Học sinh: <strong>{activeReportRow.student.full_name}</strong> · Lớp:{' '}
                        <strong>{activeReportRow.report.primaryClass?.class_name}</strong> · Kỳ báo cáo:{' '}
                        <span className="font-mono">{activeReportRow.report.dateRangeText}</span>
                      </p>
                    </div>
                    <div className="text-xs font-bold text-emerald-700 dark:text-emerald-400 font-mono">
                      {activeReportRow.report.scoreTrendText}
                    </div>
                  </div>

                  {/* 3 Core Academic Metric Boxes */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono tabular-nums">
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                      <div className="text-[11px] font-sans font-semibold text-slate-500 dark:text-slate-400">
                        1. Tỷ lệ Chuyên cần
                      </div>
                      <div className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                        {activeReportRow.report.attendanceRate}% ({activeReportRow.report.presentCount}/
                        {activeReportRow.report.totalSessionsInPeriod} buổi)
                      </div>
                      <div className="text-[11px] font-sans text-slate-500 dark:text-slate-400 mt-1">
                        Muộn: {activeReportRow.report.lateCount} · Phép: {activeReportRow.report.excusedCount} · K.Phép:{' '}
                        {activeReportRow.report.unexcusedCount}
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                      <div className="text-[11px] font-sans font-semibold text-slate-500 dark:text-slate-400">
                        2. Điểm TB BTVN vs Lớp
                      </div>
                      <div className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                        {activeReportRow.report.studentHwAvg !== null
                          ? `${activeReportRow.report.studentHwAvg}/10`
                          : 'Chưa chấm'}{' '}
                        <span className="text-xs font-normal text-slate-500">
                          (Lớp: {activeReportRow.report.classHwAvg ?? '—'})
                        </span>
                      </div>
                      <div className="text-[11px] font-sans text-slate-500 dark:text-slate-400 mt-1">
                        Hoàn thành: {activeReportRow.report.hwSubmittedCount}/
                        {activeReportRow.report.hwSessionCount} bài ({activeReportRow.report.hwCompletionRate}%)
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                      <div className="text-[11px] font-sans font-semibold text-slate-500 dark:text-slate-400">
                        3. Điểm TB Kiểm tra vs Lớp
                      </div>
                      <div className="text-lg font-bold text-emerald-700 dark:text-emerald-400 mt-0.5">
                        {activeReportRow.report.studentTestAvg !== null
                          ? `${activeReportRow.report.studentTestAvg}/10`
                          : 'Chưa có KT'}{' '}
                        <span className="text-xs font-normal text-slate-500">
                          (Lớp: {activeReportRow.report.classTestAvg ?? '—'})
                        </span>
                      </div>
                      <div className="text-[11px] font-sans text-slate-500 dark:text-slate-400 mt-1">
                        Cao nhất: {activeReportRow.report.highestTestScore ?? '—'} · Gần nhất:{' '}
                        {activeReportRow.report.latestTestScore ?? '—'}
                      </div>
                    </div>
                  </div>

                  {/* Knowledge Topics Analysis */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="p-3 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20">
                      <div className="font-bold text-emerald-900 dark:text-emerald-200 mb-1">
                        Chuyên đề Toán đã nắm vững (≥ 7.5đ):
                      </div>
                      {activeReportRow.report.strongTopics.length > 0 ? (
                        <p className="text-slate-700 dark:text-slate-300">
                          {activeReportRow.report.strongTopics
                            .map((t) => `${t.name} (${t.score}đ)`)
                            .join(' · ')}
                        </p>
                      ) : (
                        <p className="text-slate-500">
                          Đang theo dõi tích lũy qua các bài kiểm tra chuyên đề.
                        </p>
                      )}
                    </div>

                    <div className="p-3 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/40 dark:bg-amber-950/20">
                      <div className="font-bold text-amber-900 dark:text-amber-200 mb-1">
                        Chuyên đề cần rèn luyện & củng cố thêm:
                      </div>
                      {activeReportRow.report.weakTopics.length > 0 ? (
                        <p className="text-slate-700 dark:text-slate-300">
                          {activeReportRow.report.weakTopics
                            .map((t) => `${t.name} (${t.score}đ)`)
                            .join(' · ')}
                        </p>
                      ) : (
                        <p className="text-slate-500">
                          Không có chuyên đề hổng kiến thức nghiêm trọng trong kỳ.
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Detailed Session-by-Session Grade & Comment Table */}
                  <div>
                    <h4 className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-2">
                      Bảng Chi Tiết Điểm Từng Buổi Học & Nhận Xét Của Giáo Viên
                    </h4>
                    <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-500">
                            <th className="py-2 px-3">Ngày</th>
                            <th className="py-2 px-3">Nội dung bài học</th>
                            <th className="py-2 px-3">Điểm danh</th>
                            <th className="py-2 px-3 text-right">BTVN (Lớp)</th>
                            <th className="py-2 px-3 text-right">Điểm KT (Lớp)</th>
                            <th className="py-2 px-3">Nhận xét của Giáo viên</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800">
                          {activeReportRow.report.sessionRows.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="py-6 text-center text-slate-400">
                                Chưa có dữ liệu buổi học trong chu kỳ này.
                              </td>
                            </tr>
                          ) : (
                            activeReportRow.report.sessionRows.map((sr) => {
                              const attLabel =
                                sr.record.attendance === 'present'
                                  ? 'Có mặt'
                                  : sr.record.attendance === 'late'
                                  ? 'Đi muộn'
                                  : sr.record.attendance === 'absent_excused'
                                  ? 'Nghỉ có phép'
                                  : 'Vắng K.Phép';
                              const commentText = [
                                ...(sr.record.quick_preset_comments || []),
                                sr.record.custom_comment,
                              ]
                                .filter(Boolean)
                                .join('. ');

                              return (
                                <tr key={sr.session.id}>
                                  <td className="py-2 px-3 font-mono tabular-nums whitespace-nowrap">
                                    {sr.session.session_date}
                                  </td>
                                  <td className="py-2 px-3 font-medium text-slate-800 dark:text-slate-200">
                                    {sr.session.lesson_title}
                                  </td>
                                  <td className="py-2 px-3 whitespace-nowrap">
                                    {attLabel}
                                  </td>
                                  <td className="py-2 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                                    {sr.record.homework_score > 0
                                      ? `${sr.record.homework_score}`
                                      : sr.record.homework_submitted
                                      ? 'Đã nộp'
                                      : 'Chưa nộp'}
                                    {sr.classAvgHw !== null && (
                                      <span className="text-[10px] text-slate-400">
                                        {' '}
                                        ({sr.classAvgHw})
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-2 px-3 text-right font-mono tabular-nums whitespace-nowrap font-bold">
                                    {sr.record.test_score > 0
                                      ? `${sr.record.test_score}`
                                      : '—'}
                                    {sr.classAvgTest !== null &&
                                      sr.record.test_score > 0 && (
                                        <span className="text-[10px] font-normal text-slate-400">
                                          {' '}
                                          ({sr.classAvgTest})
                                        </span>
                                      )}
                                  </td>
                                  <td className="py-2 px-3 text-slate-600 dark:text-slate-300">
                                    {commentText || '—'}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>

              {/* RIGHT COLUMN (5 cols): Personalized Zalo/SMS Templates & 1-Click Send + Schedule */}
              <div className="lg:col-span-5 flex flex-col justify-between space-y-4 print:hidden">
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                      Chọn Mẫu Tin Nhắn Zalo / SMS Cá Nhân Hóa (Tự điền số liệu thật):
                    </label>
                    <div className="space-y-1.5">
                      {templates.map((tpl) => (
                        <button
                          key={tpl.id}
                          type="button"
                          onClick={() => {
                            setSelectedTemplateId(tpl.id);
                            setIsMessageEdited(false);
                            setCopiedSuccess(false);
                          }}
                          className={`w-full p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                            selectedTemplateId === tpl.id
                              ? 'bg-emerald-50/80 dark:bg-emerald-950/50 border-emerald-500 ring-1 ring-emerald-500'
                              : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                            {tpl.title}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                            {tpl.description}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Editable Personalized Message Textarea */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-200">
                        Nội dung tin nhắn gửi Phụ huynh (Có thể sửa trực tiếp):
                      </label>
                      {isMessageEdited && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setIsMessageEdited(false)}
                            className="text-[11px] text-slate-500 hover:underline cursor-pointer"
                          >
                            Khôi phục mặc định
                          </button>
                          <button
                            type="button"
                            onClick={handleSaveCustomTemplate}
                            className="text-[11px] font-bold text-emerald-600 hover:underline flex items-center gap-1 cursor-pointer"
                          >
                            <Save className="w-3 h-3" />
                            <span>Lưu làm mẫu chuẩn</span>
                          </button>
                        </div>
                      )}
                    </div>
                    <textarea
                      rows={12}
                      value={displayedMessage}
                      onChange={(e) => {
                        setCustomMessageDraft(e.target.value);
                        setIsMessageEdited(true);
                      }}
                      className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/90 text-xs text-slate-800 dark:text-slate-100 leading-relaxed focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  {/* Follow-up Reminder Selector after sending */}
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                      Tự động nhắc lịch CSKH lần tiếp theo sau:
                    </span>
                    <div className="flex items-center gap-1">
                      {[3, 7, 14, 30].map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setAutoFollowupDays(d)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold cursor-pointer ${
                            autoFollowupDays === d
                              ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          +{d} ngày
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => handleCopyAndLogReport(false)}
                    className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
                  >
                    {copiedSuccess ? (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Đã Sao Chép & Đã Ghi Nhận Nhật Ký CSKH!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        <span>Sao Chép Tin Nhắn & Tự Động Lưu Nhật Ký CSKH</span>
                      </>
                    )}
                  </button>

                  {activeReportRow.student.parent_phone && (
                    <button
                      type="button"
                      onClick={() => handleCopyAndLogReport(true)}
                      className="w-full py-2.5 px-4 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span>
                        Sao Chép & Mở Ngay Zalo Phụ Huynh ({activeReportRow.student.parent_phone})
                      </span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 2: MANUAL STATUS CLASSIFICATION & CRITERIA REASONING            */}
      {/* ===================================================================== */}
      {activeStatusEditRow && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Phân Loại Trạng Thái Khách Hàng — {activeStatusEditRow.student.full_name}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Gợi ý từ hệ thống:{' '}
                  <strong>
                    {
                      CRM_CLASSIFICATION_CRITERIA[
                        activeStatusEditRow.report.suggestedStatus
                      ].label
                    }
                  </strong>{' '}
                  ({activeStatusEditRow.report.suggestedReasons.join(', ')})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setStatusEditStudentId(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 3 Status Radio Buttons */}
            <div className="grid grid-cols-3 gap-2.5">
              {(['satisfied', 'attention', 'at_risk'] as CRMCustomerStatus[]).map(
                (st) => {
                  const cfg = CRM_CLASSIFICATION_CRITERIA[st];
                  const active = pendingStatus === st;
                  return (
                    <button
                      key={st}
                      type="button"
                      onClick={() => {
                        setPendingStatus(st);
                        setPendingReason(
                          st === activeStatusEditRow.report.suggestedStatus
                            ? activeStatusEditRow.report.suggestedReasons.join('; ')
                            : cfg.presetReasons[0]
                        );
                        setPendingFollowupDate(
                          getFutureDateStr(cfg.followUpCadenceDays)
                        );
                      }}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        active
                          ? st === 'satisfied'
                            ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-500 ring-1 ring-emerald-500'
                            : st === 'attention'
                            ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-500 ring-1 ring-amber-500'
                            : 'bg-rose-50 dark:bg-rose-950/60 border-rose-500 ring-1 ring-rose-500'
                          : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                        {cfg.shortBadge}
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 font-mono">
                        {cfg.followUpCadenceText}
                      </div>
                    </button>
                  );
                }
              )}
            </div>

            {/* Preset Reasons for the chosen tier */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                Chọn nhanh tiêu chí / lý do phân loại:
              </label>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {CRM_CLASSIFICATION_CRITERIA[pendingStatus].presetReasons.map(
                  (reason, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setPendingReason(reason)}
                      className={`w-full text-left px-3 py-2 rounded-lg border text-xs transition-colors cursor-pointer ${
                        pendingReason === reason
                          ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 font-semibold border-slate-900'
                          : 'bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {reason}
                    </button>
                  )
                )}
              </div>
            </div>

            {/* Custom Reason Input */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                Ghi chú chi tiết lý do phân loại:
              </label>
              <input
                type="text"
                value={pendingReason}
                onChange={(e) => setPendingReason(e.target.value)}
                placeholder="Nhập lý do cụ thể..."
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100"
              />
            </div>

            {/* Follow-up Date */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                Lịch hẹn CSKH tiếp theo:
              </label>
              <input
                type="date"
                value={pendingFollowupDate}
                onChange={(e) => setPendingFollowupDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono text-slate-900 dark:text-slate-100"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setStatusEditStudentId(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleSaveManualStatus}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
              >
                Lưu Phân Loại
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 3: PARENT INTERACTION TIMELINE & FOLLOW-UP SCHEDULER            */}
      {/* ===================================================================== */}
      {activeTimelineRow && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-800/50">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Nhật Ký Tương Tác Phụ Huynh & Lịch Nhắc CSKH — {activeTimelineRow.student.full_name}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Phụ huynh: {activeTimelineRow.student.parent_name || 'Gia đình'} ({activeTimelineRow.student.parent_phone || 'Chưa có SĐT'})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTimelineModalStudentId(null)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-xl cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-5 flex-1">
              {/* Add New Interaction Form */}
              <form
                onSubmit={handleAddInteractionLog}
                className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 space-y-3"
              >
                <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  <Plus className="w-4 h-4 text-emerald-600" />
                  <span>Ghi Nhận Cuộc Gọi / Tin Nhắn CSKH Mới</span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      Kênh liên hệ
                    </label>
                    <select
                      value={newLogChannel}
                      onChange={(e) =>
                        setNewLogChannel(e.target.value as CRMContactChannel)
                      }
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold"
                    >
                      <option value="zalo">Tin nhắn Zalo</option>
                      <option value="call">Gọi điện thoại</option>
                      <option value="sms">Tin nhắn SMS</option>
                      <option value="meeting">Trao đổi trực tiếp tại Trung tâm</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      Cập nhật nhãn trạng thái
                    </label>
                    <select
                      value={newLogStatus}
                      onChange={(e) => {
                        const st = e.target.value as CRMCustomerStatus;
                        setNewLogStatus(st);
                        setNewLogReason(
                          CRM_CLASSIFICATION_CRITERIA[st].presetReasons[0]
                        );
                        setNewLogFollowupDate(
                          getFutureDateStr(
                            CRM_CLASSIFICATION_CRITERIA[st].followUpCadenceDays
                          )
                        );
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold"
                    >
                      <option value="satisfied">Hài lòng & Ổn định</option>
                      <option value="attention">Cần chú ý</option>
                      <option value="at_risk">Nguy cơ nghỉ học</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      Ngày hẹn chăm sóc tiếp theo
                    </label>
                    <input
                      type="date"
                      value={newLogFollowupDate}
                      onChange={(e) => setNewLogFollowupDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Nội dung đã trao đổi với Phụ huynh
                  </label>
                  <input
                    type="text"
                    value={newLogSummary}
                    onChange={(e) => setNewLogSummary(e.target.value)}
                    placeholder="VD: Báo cáo điểm kiểm tra chương Hình học & nhắc con làm đủ BTVN..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Phản hồi của Phụ huynh (Chọn nhanh hoặc nhập):
                  </label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {[
                      'Phụ huynh cảm ơn, hài lòng với sự sát sao của Giáo viên',
                      'Phụ huynh sẽ nhắc nhở con hoàn thành đầy đủ BTVN',
                      'Phụ huynh nhờ Thầy/Cô kèm kỹ thêm phần bài tập nâng cao',
                      'Phụ huynh báo con đang ôn thi trên trường nên hơi quá tải',
                      'Phụ huynh chưa nghe máy, đã để lại tin nhắn Zalo',
                    ].map((fb, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setNewLogParentFeedback(fb)}
                        className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] text-slate-700 dark:text-slate-300 hover:border-emerald-500 cursor-pointer"
                      >
                        {fb}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={newLogParentFeedback}
                    onChange={(e) => setNewLogParentFeedback(e.target.value)}
                    placeholder="Ghi chú phản hồi của Phụ huynh..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
                  >
                    Lưu Nhật Ký & Cập Nhật Lịch Hẹn
                  </button>
                </div>
              </form>

              {/* Interaction History List */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  Lịch Sử Chăm Sóc ({activeTimelineRow.student.crm_interactions?.length || 0} lần tương tác)
                </h3>

                {!activeTimelineRow.student.crm_interactions ||
                activeTimelineRow.student.crm_interactions.length === 0 ? (
                  <div className="p-6 text-center rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-xs text-slate-400">
                    Chưa có bản ghi tương tác nào với Phụ huynh em{' '}
                    {activeTimelineRow.student.full_name}.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {activeTimelineRow.student.crm_interactions.map((log) => (
                      <div
                        key={log.id}
                        className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1.5"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <div className="font-bold text-slate-900 dark:text-slate-100">
                            [{log.channel.toUpperCase()}] {log.summary}
                          </div>
                          <span className="text-[11px] text-slate-500 font-mono tabular-nums">
                            {new Date(log.created_at).toLocaleString('vi-VN')}
                          </span>
                        </div>
                        {log.parent_feedback && (
                          <p className="text-xs text-emerald-700 dark:text-emerald-400">
                            Phản hồi của PH: {log.parent_feedback}
                          </p>
                        )}
                        {log.next_followup_date && (
                          <p className="text-[11px] text-slate-500 font-mono">
                            Lịch hẹn tiếp theo: {log.next_followup_date}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
