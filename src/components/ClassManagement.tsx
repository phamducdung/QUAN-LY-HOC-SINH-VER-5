import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ClassItem,
  GradeLevel,
  ClassStatus,
  ClassType,
  UserRole,
  Session,
  Warning,
  StudentSession,
  Student,
  ClassStudent,
  KnowledgeTag,
  KnowledgeResult,
  Settings,
  CRMCustomerStatus,
  CRMInteractionLog,
} from '../types';
import { db, deleteStudent } from '../db/dexie';
import { logAudit } from '../utils/auditLogger';
import { createPreDeleteSnapshot } from '../utils/dbSafetyAndQA';
import {
  authorizeCascadeDeleteIds,
  flushSyncOutbox,
} from '../services/syncService';
import { compareVietnameseNames } from '../utils/sortUtils';
import {
  CRM_CLASSIFICATION_CRITERIA,
  DEFAULT_CRM_MESSAGE_TEMPLATES,
  compileAccurateStudentParentReport,
  renderCRMTemplate,
  compileClassGroupZaloAnnouncement,
} from '../utils/crmEngine';
import * as XLSX from 'xlsx';
import {
  Plus,
  Archive,
  Trash2,
  Edit,
  ArrowUpRight,
  ShieldAlert,
  Users,
  Calendar,
  UserCheck,
  X,
  Sparkles,
  Lock,
  Clock,
  Search,
  AlertTriangle,
  FileSpreadsheet,
  MessageSquareText,
  Megaphone,
  GitMerge,
  Copy,
  Check,
  ExternalLink,
  Phone,
  CheckCircle2,
  Flame,
  Settings2,
} from 'lucide-react';

interface ClassManagementProps {
  classes: ClassItem[];
  selectedYearId: string;
  currentRole?: UserRole;
  onRefresh: () => void;
  onSelectClassForGradeEntry: (classId: string) => void;
}

const EMPTY_ARRAY: any[] = [];

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

export const ClassManagement: React.FC<ClassManagementProps> = ({
  classes,
  selectedYearId,
  currentRole = 'Teacher',
  onRefresh,
  onSelectClassForGradeEntry,
}) => {
  const isAdmin = currentRole === 'Teacher';
  const [activeTabStatus, setActiveTabStatus] = useState<ClassStatus>('active');
  const [selectedGrade, setSelectedGrade] = useState<number | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Live queries for reactive size and sub-list details (stable fallback reference)
  const classStudents =
    useLiveQuery(() => db.class_students.toArray()) ?? (EMPTY_ARRAY as ClassStudent[]);
  const students =
    useLiveQuery(() => db.students.toArray()) ?? (EMPTY_ARRAY as Student[]);
  const sessions =
    useLiveQuery(() => db.sessions.toArray()) ?? (EMPTY_ARRAY as Session[]);
  const studentSessions =
    useLiveQuery(() => db.student_sessions.toArray()) ?? (EMPTY_ARRAY as StudentSession[]);
  const warnings =
    useLiveQuery(() => db.warnings.toArray()) ?? (EMPTY_ARRAY as Warning[]);
  const knowledgeTags =
    useLiveQuery(() => db.knowledge_tags.toArray()) ?? (EMPTY_ARRAY as KnowledgeTag[]);
  const knowledgeResults =
    useLiveQuery(() => db.knowledge_results.toArray()) ?? (EMPTY_ARRAY as KnowledgeResult[]);
  const settingsArr =
    useLiveQuery(() => db.settings.toArray()) ?? (EMPTY_ARRAY as Settings[]);
  const activeSettings = settingsArr[0];

  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassItem | null>(null);
  const [viewingClassDetails, setViewingClassDetails] = useState<ClassItem | null>(null);
  const [detailSubTab, setDetailSubTab] = useState<'roster' | 'sessions'>('roster');
  const [rosterFilterStatus, setRosterFilterStatus] = useState<'active' | 'all' | 'left'>('active');

  // Kaizen CSKH Modals inside Class Details
  const [isGroupZaloOpen, setIsGroupZaloOpen] = useState(false);
  const [groupZaloMode, setGroupZaloMode] = useState<'single_session' | 'cycle_4'>('single_session');
  const [groupZaloSessionId, setGroupZaloSessionId] = useState<string>('');
  const [groupZaloCustomText, setGroupZaloCustomText] = useState<string>('');
  const [isGroupZaloEdited, setIsGroupZaloEdited] = useState(false);
  const [copiedGroupZalo, setCopiedGroupZalo] = useState(false);

  // 1-Click Single Student Parent Report Modal inside Class Details
  const [reportStudentId, setReportStudentId] = useState<string | null>(null);
  const [reportCycleLimit, setReportCycleLimit] = useState<1 | 4 | 8 | 'all'>(4);
  const [reportTemplateId, setReportTemplateId] = useState<string>(
    DEFAULT_CRM_MESSAGE_TEMPLATES[0].id
  );
  const [reportCustomText, setReportCustomText] = useState<string>('');
  const [isReportEdited, setIsReportEdited] = useState(false);
  const [copiedSingleReport, setCopiedSingleReport] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Form States (Clean default placeholders)
  const [classNameInput, setClassNameInput] = useState('');
  const [classTypeInput, setClassTypeInput] = useState<ClassType>('standard');
  const [gradeLevelInput, setGradeLevelInput] = useState<GradeLevel>(9);
  const [targetDescInput, setTargetDescInput] = useState('');
  const [scheduleInput, setScheduleInput] = useState('');
  const [assistantNameInput, setAssistantNameInput] = useState('');
  const [assistantPhoneInput, setAssistantPhoneInput] = useState('');

  // Cascade Delete Guard Modal State
  const [deletingClass, setDeletingClass] = useState<ClassItem | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  // Promote Modal State
  const [promotingClass, setPromotingClass] = useState<ClassItem | null>(null);
  const [promotedClassName, setPromotedClassName] = useState('');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4500);
  };

  const generatePromotedClassName = (currentName: string, currentGrade: number, nextGrade: number) => {
    let name = currentName;
    const gradeStr = String(currentGrade);
    const nextGradeStr = String(nextGrade);

    if (name.includes(`Khối ${gradeStr}`)) {
      name = name.replace(`Khối ${gradeStr}`, `Khối ${nextGradeStr}`);
    } else if (name.includes(`khối ${gradeStr}`)) {
      name = name.replace(`khối ${gradeStr}`, `khối ${nextGradeStr}`);
    } else if (name.includes(`Lớp ${gradeStr}`)) {
      name = name.replace(`Lớp ${gradeStr}`, `Lớp ${nextGradeStr}`);
    } else if (name.includes(`lớp ${gradeStr}`)) {
      name = name.replace(`lớp ${gradeStr}`, `lớp ${nextGradeStr}`);
    } else if (name.includes(`Lơp ${gradeStr}`)) {
      name = name.replace(`Lơp ${gradeStr}`, `Lơp ${nextGradeStr}`);
    } else if (name.match(new RegExp(`\\b${gradeStr}\\b`))) {
      name = name.replace(new RegExp(`\\b${gradeStr}\\b`, 'g'), nextGradeStr);
    } else if (name.includes(gradeStr)) {
      name = name.replace(new RegExp(gradeStr, 'g'), nextGradeStr);
    } else {
      name = `${name} (Khối ${nextGradeStr})`;
    }
    return name;
  };

  // Check Duplicate Class Names
  const isDuplicateClassName = useMemo(() => {
    const nameToTest = (classNameInput || '').trim().toLowerCase();
    if (!nameToTest) return false;
    return (classes || []).some((c) => {
      if (editingClass && String(c.id) === String(editingClass.id)) {
        return false;
      }
      return (c?.class_name || '').trim().toLowerCase() === nameToTest;
    });
  }, [classNameInput, classes, editingClass]);

  const isDuplicatePromotedClassName = useMemo(() => {
    if (!promotingClass) return false;
    const nameToTest = (promotedClassName || '').trim().toLowerCase();
    if (!nameToTest) return false;
    return (classes || []).some((c) => {
      return (c?.class_name || '').trim().toLowerCase() === nameToTest;
    });
  }, [promotedClassName, classes, promotingClass]);

  const handleStartPromoting = (cls: ClassItem) => {
    setPromotingClass(cls);
    const nextGrade = Math.min(9, cls.grade_level + 1);
    setPromotedClassName(generatePromotedClassName(cls.class_name || '', cls.grade_level, nextGrade));
  };

  // Filter Classes
  const filteredClasses = useMemo(() => {
    return (classes || []).filter((c) => {
      if (c.status !== activeTabStatus) return false;
      if (selectedGrade !== 'all' && c.grade_level !== selectedGrade) return false;
      if ((searchQuery || '').trim()) {
        const q = searchQuery.toLowerCase().trim();
        const nameMatch = (c.class_name || '').toLowerCase().includes(q);
        const schedMatch = (c.schedule || '').toLowerCase().includes(q);
        const taMatch = (c.assistant_name || '').toLowerCase().includes(q);
        if (!nameMatch && !schedMatch && !taMatch) return false;
      }
      return true;
    });
  }, [classes, activeTabStatus, selectedGrade, searchQuery]);

  const handleOpenAddModal = () => {
    setEditingClass(null);
    setClassNameInput('');
    setClassTypeInput('standard');
    setGradeLevelInput(9);
    setTargetDescInput('');
    setScheduleInput('');
    setAssistantNameInput('');
    setAssistantPhoneInput('');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (cls: ClassItem) => {
    setEditingClass(cls);
    setClassNameInput(cls.class_name);
    setClassTypeInput(cls.class_type || 'standard');
    setGradeLevelInput(cls.grade_level);
    setTargetDescInput(cls.target_description);
    setScheduleInput(cls.schedule);
    setAssistantNameInput(cls.assistant_name);
    setAssistantPhoneInput(cls.assistant_phone);
    setIsModalOpen(true);
  };

  const handleSaveClass = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!(classNameInput || '').trim()) return;

    if (isDuplicateClassName) {
      alert(`⚠️ CẢNH BÁO: Đã tồn tại lớp học có tên "${(classNameInput || '').trim()}"! Vui lòng chọn tên khác.`);
      return;
    }

    const now = new Date().toISOString();

    if (editingClass) {
      const updatePayload = {
        class_name: classNameInput,
        class_type: classTypeInput,
        grade_level: gradeLevelInput,
        target_description: targetDescInput,
        schedule: scheduleInput,
        assistant_name: assistantNameInput,
        assistant_phone: assistantPhoneInput,
        updated_at: now,
      };
      await db.classes.update(editingClass.id!, updatePayload);
      await logAudit(currentRole as UserRole, 'Sửa thông tin lớp', `Cập nhật thông tin cho ${classNameInput}`);
    } else {
      const addPayload = {
        school_year_id: selectedYearId,
        class_name: classNameInput,
        class_type: classTypeInput,
        grade_level: gradeLevelInput,
        target_description: targetDescInput || 'Mục tiêu chất lượng môn Toán THCS',
        schedule: scheduleInput || 'Thứ 2 & Thứ 6 (18h-20h)',
        assistant_name: assistantNameInput || 'Chưa phân công',
        assistant_phone: assistantPhoneInput || '',
        status: 'active' as ClassStatus,
        created_at: now,
        updated_at: now,
      };
      await db.classes.add(addPayload);
      await logAudit(currentRole as UserRole, 'Tạo lớp học mới', `Tạo lớp mới ${classNameInput} (Khối ${gradeLevelInput})`);
    }

    setIsModalOpen(false);
    onRefresh();
  };

  const handleArchiveClass = async (cls: ClassItem) => {
    const newStatus = cls.status === 'active' ? 'archived' : 'active';
    const now = new Date().toISOString();
    await db.classes.update(cls.id!, {
      status: newStatus,
      updated_at: now,
    });
    await logAudit(currentRole as UserRole, 'Thay đổi trạng thái lớp', `${newStatus === 'archived' ? 'Lưu trữ' : 'Khôi phục'} lớp ${cls.class_name}`);
    setIsModalOpen(false);
    onRefresh();
  };

  // Safe Cascade Delete Guard (with Automatic Pre-Delete Safety Snapshot)
  const handleConfirmDelete = async () => {
    if (!deletingClass || !deletingClass.id) return;
    if ((deleteConfirmText || '').trim() !== (deletingClass.class_name || '').trim()) {
      alert('Tên lớp nhập lại không chính xác!');
      return;
    }

    const targetClassIdStr = String(deletingClass.id);

    // Automatically capture full relational Pre-Delete Safety Snapshot before deleting
    await createPreDeleteSnapshot(
      'class',
      targetClassIdStr,
      `Lớp ${deletingClass.class_name} (Khối ${deletingClass.grade_level})`
    );

    const classSessions = sessions.filter((s) => String(s.class_id) === targetClassIdStr);
    const sessionIdSet = new Set(classSessions.map((s) => String(s.id)).filter(Boolean));

    if (sessionIdSet.size > 0) {
      const targetStudSessions = studentSessions.filter((ss) =>
        sessionIdSet.has(String(ss.session_id))
      );
      for (const ss of targetStudSessions) {
        if (ss.id) await db.student_sessions.delete(String(ss.id));
      }
    }

    for (const s of classSessions) {
      if (s.id) await db.sessions.delete(String(s.id));
    }

    const targetLinks = classStudents.filter((cs) => String(cs.class_id) === targetClassIdStr);
    for (const cs of targetLinks) {
      if (cs.id) await db.class_students.delete(String(cs.id));
    }

    const targetWarnings = warnings.filter((w) => String(w.class_id) === targetClassIdStr);
    for (const w of targetWarnings) {
      if (w.id) await db.warnings.delete(String(w.id));
    }

    await db.classes.delete(String(deletingClass.id));

    await logAudit(currentRole as UserRole, 'Xóa lớp học', `Xóa vĩnh viễn lớp ${deletingClass.class_name} (Đã lưu bản sao dự phòng tự động)`);

    setDeletingClass(null);
    setDeleteConfirmText('');
    onRefresh();
  };

  const handleDeleteSession = async (sess: Session) => {
    if (!sess || !sess.id) return;
    if (
      !confirm(
        `XÁC NHẬN XÓA BUỔI HỌC?\n\n` +
          `- Buổi học: "${sess.lesson_title}" (${sess.session_date})\n` +
          `- Thuộc lớp: ${viewingClassDetails?.class_name}\n\n` +
          `Hệ thống sẽ tự động tạo bản sao lưu dự phòng trước khi xóa để Thầy/Cô có thể hoàn tác trong mục Cài đặt nếu cần.`
      )
    ) {
      return;
    }

    try {
      const sessIdStr = String(sess.id);

      // Automatically capture Pre-Delete Safety Snapshot before deleting session
      await createPreDeleteSnapshot(
        'session',
        sessIdStr,
        `Buổi học "${sess.lesson_title}" (${sess.session_date}) - Lớp ${viewingClassDetails?.class_name || ''}`
      );

      const allStudSessions = await db.student_sessions.toArray();
      const matchedStudentSess = allStudSessions.filter(
        (ss) => String(ss.session_id) === sessIdStr
      );

      for (const ss of matchedStudentSess) {
        if (ss.id) {
          await db.student_sessions.delete(ss.id);
        }
      }

      await (db.sessions as any).delete(sess.id);
      await (db.sessions as any).delete(sessIdStr);

      await logAudit(
        currentRole as UserRole,
        'Xóa buổi học',
        `Xóa buổi học "${sess.lesson_title}" (${sess.session_date}) khỏi lớp ${viewingClassDetails?.class_name} (Đã lưu bản sao dự phòng tự động)`
      );

      onRefresh();
    } catch (error) {
      console.error('Lỗi khi xóa buổi học:', error);
      alert('Có lỗi xảy ra khi xóa buổi học. Vui lòng thử lại!');
    }
  };

  // Promote Class (Chuyển khối / Lên lớp)
  const handleExecutePromote = async () => {
    if (!promotingClass) return;

    if (!(promotedClassName || '').trim()) {
      alert('Vui lòng nhập tên lớp mới!');
      return;
    }

    if (isDuplicatePromotedClassName) {
      alert(`⚠️ CẢNH BÁO: Đã tồn tại lớp học có tên "${(promotedClassName || '').trim()}"! Vui lòng chọn tên khác.`);
      return;
    }

    const nextGrade = Math.min(9, promotingClass.grade_level + 1) as GradeLevel;
    const now = new Date().toISOString();

    const promotePayload = {
      school_year_id: promotingClass.school_year_id || '',
      class_name: (promotedClassName || '').trim() || promotingClass.class_name,
      grade_level: nextGrade,
      target_description: `Lên lớp thành công từ Lớp ${promotingClass.grade_level}`,
      schedule: promotingClass.schedule,
      assistant_name: promotingClass.assistant_name,
      assistant_phone: promotingClass.assistant_phone,
      status: 'active' as ClassStatus,
      created_at: now,
      updated_at: now,
    };

    const newClassId = await db.classes.add(promotePayload);
    await db.classes.update(String(promotingClass.id!), { status: 'archived', updated_at: now });

    const activeLinks = classStudents.filter(
      (l) => String(l.class_id) === String(promotingClass.id) && !l.leave_date
    );
    for (const link of activeLinks) {
      const csPayload = {
        id: `cs_${String(newClassId)}_${String(link.student_id)}`,
        class_id: String(newClassId),
        student_id: String(link.student_id),
        join_date: now.split('T')[0],
        created_at: now,
      };
      await db.class_students.put(csPayload);
    }

    await logAudit(currentRole as UserRole, 'Chuyển khối / Lên lớp', `Chuyển lớp ${promotingClass.class_name} lên Khối ${nextGrade}`);

    setPromotingClass(null);
    onRefresh();
  };

  // Export Roster Excel
  const handleExportRosterExcel = (cls: ClassItem) => {
    const links = classStudents.filter((cs) => String(cs.class_id) === String(cls.id) && !cs.leave_date);
    const exportData = links
      .map((link, idx) => {
        const st = students.find((s) => String(s.id) === String(link.student_id));
        if (!st || st.status === 'stopped') return null;
        return {
          'STT': idx + 1,
          'Họ và Tên Học Sinh': st.full_name || '',
          'Giới Tính': st.gender || '',
          'Ngày Sinh': st.birthday || '',
          'Họ Tên Phụ Huynh': st.parent_name || '',
          'SĐT Phụ Huynh': st.parent_phone || '',
          'Trạng Thái CSKH':
            CRM_CLASSIFICATION_CRITERIA[st.crm_status || 'satisfied'].shortBadge,
          'Ngày Vào Lớp': link.join_date || '',
          'Ghi Chú': st.note || '',
        };
      })
      .filter(Boolean);

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, `DanhSach_${cls.class_name.replace(/[^a-zA-Z0-9]/g, '_')}`);
    XLSX.writeFile(workbook, `Danh_Sach_Lop_${cls.class_name}.xlsx`);
  };

  // Helper for Class Health Indicators (Preserved 100% as requested)
  const getClassHealthData = (classId: string) => {
    const classSess = sessions.filter((s) => String(s.class_id) === String(classId));
    const classP1Count = warnings.filter((w) => String(w.class_id) === String(classId) && !w.resolved && w.priority === 'P1').length;

    if (classSess.length === 0) {
      return { p1Count: classP1Count, latestTestAvg: null, attendanceRate: null };
    }

    const latestSession = [...classSess].sort((a, b) => b.session_date.localeCompare(a.session_date))[0];
    const validStudentIds = new Set(
      classStudents
        .filter((cs) => {
          if (String(cs.class_id) !== String(classId)) return false;
          if (cs.leave_date) return false;
          const st = students.find((s) => String(s.id) === String(cs.student_id));
          return Boolean(st) && st?.status !== 'stopped';
        })
        .map((cs) => String(cs.student_id))
    );

    const rawRecords = studentSessions.filter(
      (ss) => String(ss.session_id) === String(latestSession.id) && (validStudentIds.size === 0 || validStudentIds.has(String(ss.student_id)))
    );

    // Deduplicate by student_id
    const dedupMap = new Map<string, StudentSession>();
    rawRecords.forEach((ss) => {
      dedupMap.set(String(ss.student_id), ss);
    });
    const sessRecords = Array.from(dedupMap.values());

    const validTests = sessRecords.map((ss) => ss.test_score).filter((s): s is number => typeof s === 'number' && s >= 0);
    const latestTestAvg = validTests.length > 0 ? (validTests.reduce((a, b) => a + b, 0) / validTests.length).toFixed(1) : null;

    const presentCount = sessRecords.filter((ss) => ss.attendance === 'present' || ss.attendance === 'late').length;
    const totalCount = validStudentIds.size > 0 ? validStudentIds.size : sessRecords.length;
    const attendanceRate = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : null;

    return { p1Count: classP1Count, latestTestAvg, attendanceRate };
  };

  // Detect Cross-Class Algebra (Đ) <-> Geometry (H) Duplicate Student Pairs for the currently viewed class
  const crossClassDuplicatePairs = useMemo(() => {
    if (!viewingClassDetails?.id) return [];
    const curClassId = String(viewingClassDetails.id);
    const curGrade = viewingClassDetails.grade_level;

    // Active students in current class
    const curClassStudentIds = new Set(
      classStudents
        .filter((cs) => String(cs.class_id) === curClassId && !cs.leave_date)
        .map((cs) => String(cs.student_id))
    );
    const curStudents = students.filter(
      (s) => s.id && curClassStudentIds.has(String(s.id)) && s.status !== 'stopped'
    );

    // Same-grade other classes (e.g. Algebra <-> Geometry sibling classes)
    const siblingClassMap = new Map<string, ClassItem>();
    classes.forEach((c) => {
      if (
        c.id &&
        String(c.id) !== curClassId &&
        c.grade_level === curGrade &&
        c.status === 'active'
      ) {
        siblingClassMap.set(String(c.id), c);
      }
    });

    const pairs: Array<{
      thisStudent: Student;
      otherStudent: Student;
      otherClassName: string;
    }> = [];

    for (const sThis of curStudents) {
      const nThis = removeAccents(sThis.full_name);
      if (!nThis) continue;

      for (const cs of classStudents) {
        if (cs.leave_date) continue;
        const otherCls = siblingClassMap.get(String(cs.class_id));
        if (!otherCls) continue;
        if (String(cs.student_id) === String(sThis.id)) continue; // Already shared ID!

        const sOther = students.find(
          (st) => String(st.id) === String(cs.student_id) && st.status !== 'stopped'
        );
        if (!sOther) continue;

        const nOther = removeAccents(sOther.full_name);
        if (nThis === nOther) {
          pairs.push({
            thisStudent: sThis,
            otherStudent: sOther,
            otherClassName: otherCls.class_name,
          });
        }
      }
    }

    return pairs;
  }, [viewingClassDetails, classes, classStudents, students]);

  // Handler: 1-Click Merge Algebra <-> Geometry Duplicate Pair right inside Class Details
  const handleMergeCrossClassDuplicate = async (pair: {
    thisStudent: Student;
    otherStudent: Student;
    otherClassName: string;
  }) => {
    const primaryId = String(pair.thisStudent.id);
    const secondaryId = String(pair.otherStudent.id);
    if (!primaryId || !secondaryId) return;

    const now = new Date().toISOString();

    await createPreDeleteSnapshot(
      'student',
      secondaryId,
      `Gộp hồ sơ Đại & Hình: ${pair.otherStudent.full_name} (${pair.otherClassName}) vào ${pair.thisStudent.full_name}`
    );

    // 1. Migrate class_students
    const secCS = classStudents.filter((cs) => String(cs.student_id) === secondaryId);
    const oldCsIds: string[] = [];
    for (const cs of secCS) {
      if (cs.id) oldCsIds.push(String(cs.id));
      const cid = String(cs.class_id);
      const newCsId = `cs_${cid}_${primaryId}`;
      const existing = await db.class_students.get(newCsId);
      if (!existing) {
        await db.class_students.put({
          ...cs,
          id: newCsId,
          class_id: cid,
          student_id: primaryId,
        });
      }
    }

    // 2. Migrate student_sessions
    const secSS = studentSessions.filter((ss) => String(ss.student_id) === secondaryId);
    const oldSsIds: string[] = [];
    for (const ss of secSS) {
      if (ss.id) oldSsIds.push(String(ss.id));
      const sessId = String(ss.session_id);
      const newSsId = `ss_${sessId}_${primaryId}`;
      const existing = await db.student_sessions.get(newSsId);
      if (!existing) {
        await db.student_sessions.put({
          ...ss,
          id: newSsId,
          session_id: sessId,
          student_id: primaryId,
          updated_at: now,
        });
      }
    }

    // 3. Migrate knowledge_results
    const secKR = knowledgeResults.filter((kr) => String(kr.student_id) === secondaryId);
    const oldKrIds: string[] = [];
    for (const kr of secKR) {
      if (kr.id) oldKrIds.push(String(kr.id));
      const tagId = String(kr.knowledge_tag_id);
      const newKrId = `kr_${primaryId}_${tagId}`;
      const existing = await db.knowledge_results.get(newKrId);
      if (!existing) {
        await db.knowledge_results.put({
          ...kr,
          id: newKrId,
          student_id: primaryId,
          knowledge_tag_id: tagId,
          last_updated: now,
        });
      }
    }

    // 4. Migrate warnings
    const secWarns = warnings.filter((w) => String(w.student_id) === secondaryId);
    for (const w of secWarns) {
      if (w.id) {
        await db.warnings.update(w.id, {
          student_id: primaryId,
          updated_at: now,
        });
      }
    }

    authorizeCascadeDeleteIds('students', [secondaryId]);
    authorizeCascadeDeleteIds('class_students', oldCsIds);
    authorizeCascadeDeleteIds('student_sessions', oldSsIds);
    authorizeCascadeDeleteIds('knowledge_results', oldKrIds);

    await deleteStudent(secondaryId);
    await flushSyncOutbox();

    await logAudit(
      currentRole as UserRole,
      'Gộp học sinh học cả Đại & Hình',
      `Đã gộp hồ sơ "${pair.otherStudent.full_name}" (Lớp ${pair.otherClassName}) vào "${pair.thisStudent.full_name}" (Lớp ${viewingClassDetails?.class_name})`
    );

    showToast(
      `Đã gộp thành công hồ sơ "${pair.thisStudent.full_name}" học cả 2 lớp ${viewingClassDetails?.class_name} và ${pair.otherClassName}!`
    );
    onRefresh();
  };

  // Compiled Class Group Zalo Announcement
  const compiledGroupZalo = useMemo(() => {
    if (!viewingClassDetails?.id) return null;
    const cid = String(viewingClassDetails.id);
    const clsSessions = sessions.filter((s) => String(s.class_id) === cid);
    const activeIds = new Set(
      classStudents
        .filter((cs) => String(cs.class_id) === cid && !cs.leave_date)
        .map((cs) => String(cs.student_id))
    );
    const activeStuds = students.filter(
      (s) => s.id && activeIds.has(String(s.id)) && s.status !== 'stopped'
    );

    return compileClassGroupZaloAnnouncement({
      cls: viewingClassDetails,
      mode: groupZaloMode,
      targetSessionId: groupZaloSessionId || undefined,
      classSessions: clsSessions,
      activeClassStudents: activeStuds,
      allStudentSessions: studentSessions,
      pronounConfig: activeSettings?.pronoun_config,
    });
  }, [
    viewingClassDetails,
    groupZaloMode,
    groupZaloSessionId,
    sessions,
    classStudents,
    students,
    studentSessions,
    activeSettings,
  ]);

  // Compiled Single Student Parent Report inside Class Details
  const activeSingleReport = useMemo(() => {
    if (!reportStudentId || !viewingClassDetails?.id) return null;
    const st = students.find((s) => String(s.id) === String(reportStudentId));
    if (!st) return null;
    const cid = String(viewingClassDetails.id);
    return compileAccurateStudentParentReport({
      student: st,
      classes,
      enrolledClassIds: [cid],
      selectedClassId: cid,
      cycleLimit: reportCycleLimit,
      allSessions: sessions,
      allStudentSessions: studentSessions,
      allWarnings: warnings,
      allKnowledgeTags: knowledgeTags,
      allKnowledgeResults: knowledgeResults,
    });
  }, [
    reportStudentId,
    viewingClassDetails,
    reportCycleLimit,
    students,
    classes,
    sessions,
    studentSessions,
    warnings,
    knowledgeTags,
    knowledgeResults,
  ]);

  const templates = useMemo(() => {
    if (
      activeSettings?.crm_message_templates &&
      activeSettings.crm_message_templates.length > 0
    ) {
      return activeSettings.crm_message_templates;
    }
    return DEFAULT_CRM_MESSAGE_TEMPLATES;
  }, [activeSettings]);

  const renderedSingleReportMessage = useMemo(() => {
    if (!activeSingleReport) return '';
    const tpl =
      templates.find((t) => t.id === reportTemplateId) || templates[0];
    return renderCRMTemplate(
      tpl.body,
      activeSingleReport,
      activeSettings?.pronoun_config
    );
  }, [activeSingleReport, templates, reportTemplateId, activeSettings]);

  const handleCopySingleReportAndLog = async (openZalo = false) => {
    if (!activeSingleReport?.student.id || !viewingClassDetails) return;
    const st = activeSingleReport.student;
    const textToCopy = isReportEdited
      ? reportCustomText
      : renderedSingleReportMessage;

    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopiedSingleReport(true);
    } catch (e) {}

    const now = new Date().toISOString();
    const d = new Date();
    d.setDate(d.getDate() + 7);
    const nextDate = d.toISOString().slice(0, 10);
    const tpl =
      templates.find((t) => t.id === reportTemplateId) || templates[0];

    const newLog: CRMInteractionLog = {
      id: `crm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      created_at: now,
      channel: 'zalo',
      template_category: tpl.category,
      summary: `[Lớp ${viewingClassDetails.class_name}] Đã gửi ${tpl.title}`,
      message_sent: textToCopy,
      parent_feedback: 'Đã gửi báo cáo từ Chi tiết Lớp học',
      status_snapshot: st.crm_status || activeSingleReport.suggestedStatus,
      next_followup_date: nextDate,
      created_by: 'Giáo viên',
    };

    const existingLogs = Array.isArray(st.crm_interactions)
      ? st.crm_interactions
      : [];

    await db.students.update(st.id!, {
      crm_status: st.crm_status || activeSingleReport.suggestedStatus,
      crm_last_contacted_at: now,
      crm_next_followup_date: nextDate,
      crm_interactions: [newLog, ...existingLogs],
      updated_at: now,
    });

    await logAudit(
      currentRole as UserRole,
      'CRM_SEND_PARENT_REPORT',
      `Gửi báo cáo 1-Click PH em ${st.full_name} tại lớp ${viewingClassDetails.class_name}`
    );

    showToast(
      `Đã sao chép báo cáo của ${st.full_name} và tự động ghi nhận vào Nhật ký CSKH!`
    );

    if (openZalo && st.parent_phone) {
      const clean = st.parent_phone.replace(/\D/g, '');
      if (clean) {
        const a = document.createElement('a');
        a.href = `https://zalo.me/${clean}`;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.click();
      }
    }
  };

  return (
    <div id="class-management-view" className="space-y-6">
      {/* Top Header Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <span>Quản Lý Lớp Học &amp; Điều Phối CSKH</span>
            {!isAdmin && (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300 flex items-center gap-1">
                <Lock className="w-3 h-3" /> Quyền Trợ Giảng (Xem &amp; Nhập Điểm)
              </span>
            )}
          </h2>
          <p className="text-xs text-slate-500">
            Quản lý các lớp Toán THCS (Khối 6-9), gửi báo cáo Nhóm Zalo Phụ huynh cả lớp và chăm sóc từng học sinh 1-Click.
          </p>
        </div>

        <button
          id="btn-add-class"
          onClick={() => {
            if (!isAdmin) {
              alert('Chỉ Admin (Giáo viên chính) mới có quyền tạo lớp học mới!');
              return;
            }
            handleOpenAddModal();
          }}
          disabled={!isAdmin}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-md shrink-0 cursor-pointer ${
            isAdmin
              ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-600/20'
              : 'bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-500 cursor-not-allowed'
          }`}
          title={isAdmin ? 'Tạo lớp học mới' : 'Chỉ Giáo viên chính được tạo lớp mới'}
        >
          {isAdmin ? <Plus className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
          <span>Thêm Lớp Học Mới</span>
        </button>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        {/* Active vs Archived Tabs */}
        <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-xl w-full md:w-auto">
          <button
            id="tab-status-active"
            onClick={() => setActiveTabStatus('active')}
            className={`flex-1 md:flex-none px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTabStatus === 'active'
                ? 'bg-white text-slate-900 dark:bg-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Đang Hoạt Động ({classes.filter((c) => c.status === 'active').length})
          </button>
          <button
            id="tab-status-archived"
            onClick={() => setActiveTabStatus('archived')}
            className={`flex-1 md:flex-none px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTabStatus === 'archived'
                ? 'bg-white text-slate-900 dark:bg-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Lưu Trữ ({classes.filter((c) => c.status === 'archived').length})
          </button>
        </div>

        {/* Grade Filters */}
        <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/60 p-1 rounded-xl w-full md:w-auto overflow-x-auto">
          <button
            onClick={() => setSelectedGrade('all')}
            className={`px-3 py-1 rounded-lg text-xs font-bold shrink-0 cursor-pointer ${
              selectedGrade === 'all'
                ? 'bg-emerald-600 text-white'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            Tất cả Khối
          </button>
          {[6, 7, 8, 9].map((g) => (
            <button
              key={g}
              onClick={() => setSelectedGrade(g)}
              className={`px-3 py-1 rounded-lg text-xs font-bold shrink-0 cursor-pointer ${
                selectedGrade === g
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              Khối {g}
            </button>
          ))}
        </div>

        {/* Search Bar */}
        <div className="relative w-full md:w-64">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm tên lớp, lịch học, TA..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      {/* Class Cards Grid — Preserved Exterior Metrics & Decluttered Action Buttons */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredClasses.length === 0 ? (
          <div className="col-span-full p-8 text-center text-xs text-slate-500 bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800">
            Chưa có lớp học nào phù hợp với bộ lọc!
          </div>
        ) : (
          filteredClasses.map((cls, idx) => {
            const health = getClassHealthData(cls.id!);
            const activeStudentsCount = classStudents.filter((cs) => {
              if (String(cs.class_id) !== String(cls.id)) return false;
              if (cs.leave_date) return false;
              const st = students.find((s) => String(s.id) === String(cs.student_id));
              return Boolean(st) && st?.status !== 'stopped';
            }).length;
            const sessionsCount = sessions.filter((s) => String(s.class_id) === String(cls.id)).length;

            return (
              <div
                key={cls.id ? `${cls.id}-${idx}` : idx}
                className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group"
              >
                <div>
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                          KHỐI {cls.grade_level}
                        </span>
                        {health.p1Count > 0 && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 flex items-center gap-1 animate-pulse">
                            <AlertTriangle className="w-3 h-3" />
                            <span>{health.p1Count} P1 Khẩn</span>
                          </span>
                        )}
                      </div>

                      <button
                        onClick={() => {
                          setViewingClassDetails(cls);
                          setDetailSubTab('roster');
                        }}
                        className="block text-left text-base font-bold text-slate-900 dark:text-slate-100 mt-1.5 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors cursor-pointer"
                        title="Xem danh sách & công cụ CSKH Phụ huynh của lớp"
                      >
                        {cls.class_name}
                      </button>
                    </div>

                    {/* Single clean Settings / Edit button on card header (Delete & Promote moved inside) */}
                    <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => {
                          if (!isAdmin) {
                            alert('Chỉ Admin (Giáo viên chính) mới có quyền sửa/cài đặt thông tin lớp học!');
                            return;
                          }
                          handleOpenEditModal(cls);
                        }}
                        className={`p-1.5 rounded-lg cursor-pointer ${
                          isAdmin
                            ? 'text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                            : 'text-slate-300 dark:text-slate-700 cursor-not-allowed'
                        }`}
                        title={isAdmin ? 'Cài đặt & Sửa thông tin lớp (Lên lớp / Lưu trữ / Xóa an toàn)' : 'Khóa với quyền Trợ giảng'}
                      >
                        <Settings2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Target Description */}
                  <p className="text-xs text-slate-600 dark:text-slate-300 font-medium bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/80 mb-3">
                    🎯 {cls.target_description}
                  </p>

                  {/* Class Health Badges (Preserved as requested) */}
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 text-[11px]">
                      <span className="text-slate-400 block text-[10px] font-semibold">ĐIỂM KT GẦN NHẤT</span>
                      <span className="font-extrabold text-blue-600 dark:text-blue-400">
                        {health.latestTestAvg ? `${health.latestTestAvg}đ` : 'Chưa có'}
                      </span>
                    </div>
                    <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 text-[11px]">
                      <span className="text-slate-400 block text-[10px] font-semibold">CHUYÊN CẦN</span>
                      <span className="font-extrabold text-emerald-600 dark:text-emerald-400">
                        {health.attendanceRate !== null ? `${health.attendanceRate}%` : 'Đầy đủ'}
                      </span>
                    </div>
                  </div>

                  {/* Schedule & TA Details */}
                  <div className="space-y-1.5 text-xs text-slate-500 dark:text-slate-400 mb-4">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{cls.schedule}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <UserCheck className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>Trợ giảng: <strong className="text-slate-700 dark:text-slate-200">{cls.assistant_name}</strong></span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-dashed border-slate-200 dark:border-slate-800">
                      <button
                        onClick={() => {
                          setViewingClassDetails(cls);
                          setDetailSubTab('roster');
                        }}
                        className="flex items-center gap-1.5 p-1.5 bg-slate-50 hover:bg-emerald-50 dark:bg-slate-800/40 dark:hover:bg-slate-800 rounded-lg text-[11px] font-bold text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                      >
                        <Users className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Sĩ số: <strong>{activeStudentsCount} HS</strong></span>
                      </button>
                      <button
                        onClick={() => {
                          setViewingClassDetails(cls);
                          setDetailSubTab('sessions');
                        }}
                        className="flex items-center gap-1.5 p-1.5 bg-slate-50 hover:bg-emerald-50 dark:bg-slate-800/40 dark:hover:bg-slate-800 rounded-lg text-[11px] font-bold text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                      >
                        <Clock className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Đã dạy: <strong>{sessionsCount} buổi</strong></span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Actions Footer — Decluttered: Grade Entry + Class CSKH Details */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                  <button
                    onClick={() => onSelectClassForGradeEntry(cls.id!)}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>Nhập điểm Lớp</span>
                  </button>

                  <button
                    onClick={() => {
                      setViewingClassDetails(cls);
                      setDetailSubTab('roster');
                    }}
                    className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <MessageSquareText className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Chi tiết &amp; CSKH Lớp</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Add / Edit & Class Maintenance Modal (Houses Promote, Archive, and Safe Delete) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {editingClass ? `Cài Đặt & Sửa Thông Tin Lớp: ${editingClass.class_name}` : 'Tạo Lớp Học Mới'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveClass} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 md:col-span-1">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Tên Lớp Học
                  </label>
                  <input
                    type="text"
                    required
                    value={classNameInput}
                    onChange={(e) => setClassNameInput(e.target.value)}
                    placeholder="Nhập tên lớp (VD: 9A1 - Chuyên Luyện Đề Vào 10)"
                    className={`w-full text-xs bg-slate-50 dark:bg-slate-800 border p-2.5 rounded-xl outline-none transition-all ${
                      isDuplicateClassName
                        ? 'border-rose-500 text-rose-900 dark:text-rose-200 bg-rose-50/50 dark:bg-rose-950/20 focus:border-rose-600'
                        : 'border-slate-200 dark:border-slate-700 focus:border-emerald-500'
                    }`}
                  />
                  {isDuplicateClassName && (
                    <div className="mt-1.5 p-2 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl flex items-center gap-1.5 text-xs text-rose-700 dark:text-rose-300 font-bold">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                      <span>Đã tồn tại lớp học trùng tên này! Vui lòng đổi tên khác.</span>
                    </div>
                  )}
                </div>

                <div className="col-span-2 md:col-span-1">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Profile Lớp
                  </label>
                  <select
                    value={classTypeInput}
                    onChange={(e) => setClassTypeInput(e.target.value as ClassType)}
                    className="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2.5 rounded-xl outline-none"
                  >
                    <option value="standard">Tiêu chuẩn (Standard)</option>
                    <option value="specialized">Lớp Chuyên (Specialized)</option>
                    <option value="remedial">Lớp Phụ đạo (Remedial)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Khối Lớp
                  </label>
                  <select
                    value={gradeLevelInput}
                    onChange={(e) => setGradeLevelInput(Number(e.target.value) as GradeLevel)}
                    className="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2.5 rounded-xl outline-none"
                  >
                    <option value={6}>Khối 6 (Số học &amp; Hình trực quan)</option>
                    <option value={7}>Khối 7 (Số hữu tỉ &amp; Hình phẳng)</option>
                    <option value={8}>Khối 8 (Hằng đẳng thức &amp; Đồng dạng)</option>
                    <option value={9}>Khối 9 (Ôn thi Luyện đề Vào 10)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Lịch Học
                  </label>
                  <input
                    type="text"
                    value={scheduleInput}
                    onChange={(e) => setScheduleInput(e.target.value)}
                    placeholder="VD: Thứ 2 (18h-20h), Thứ 6 (18h-20h)"
                    className="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2.5 rounded-xl outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Mục Tiêu Chất Lượng
                </label>
                <input
                  type="text"
                  value={targetDescInput}
                  onChange={(e) => setTargetDescInput(e.target.value)}
                  placeholder="VD: 100% Học sinh đạt 8.0+ Thi Lớp 10 Công Lập"
                  className="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2.5 rounded-xl outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Họ Tên Trợ Giảng (TA)
                  </label>
                  <input
                    type="text"
                    value={assistantNameInput}
                    onChange={(e) => setAssistantNameInput(e.target.value)}
                    placeholder="VD: Cô Lê Thị Thảo"
                    className="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2.5 rounded-xl outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    SĐT Trợ Giảng
                  </label>
                  <input
                    type="text"
                    value={assistantPhoneInput}
                    onChange={(e) => setAssistantPhoneInput(e.target.value)}
                    placeholder="VD: 0988 123 456"
                    className="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2.5 rounded-xl outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Cất gọn thao tác Quản trị Lớp (Lên lớp / Lưu trữ / Xóa an toàn) vào trong Cài đặt lớp */}
              {editingClass && isAdmin && (
                <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Quản Trị &amp; Bảo Trì Lớp Học (Cất gọn chống bấm nhầm)
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {editingClass.status === 'active' && (
                      <button
                        type="button"
                        onClick={() => {
                          const target = editingClass;
                          setIsModalOpen(false);
                          handleStartPromoting(target);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                      >
                        <ArrowUpRight className="w-3.5 h-3.5" />
                        <span>Chuyển khối / Lên lớp</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleArchiveClass(editingClass)}
                      className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Archive className="w-3.5 h-3.5" />
                      <span>
                        {editingClass.status === 'active' ? 'Đưa vào Lưu trữ' : 'Khôi phục Hoạt động'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const target = editingClass;
                        setIsModalOpen(false);
                        setDeletingClass(target);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Xóa an toàn (Có lưu Bản chụp)</span>
                    </button>
                  </div>
                </div>
              )}

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isDuplicateClassName || !(classNameInput || '').trim()}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  Lưu Thông Tin
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Safe Cascade Delete Guard Modal */}
      {deletingClass && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 border border-rose-200 dark:border-rose-900/80 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400">
              <ShieldAlert className="w-8 h-8 shrink-0" />
              <div>
                <h3 className="text-base font-bold">Xác Nhận Xóa An Toàn Lớp Học</h3>
                <p className="text-xs text-slate-500">
                  Hệ thống sẽ tự động lưu 1 Bản chụp dự phòng trước khi xóa để có thể hoàn tác trong Cài đặt.
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300">
              Để bảo vệ dữ liệu, bạn cần nhập lại CHÍNH XÁC tên lớp:{' '}
              <strong className="text-rose-600 font-bold">{deletingClass.class_name}</strong>
            </p>

            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="Nhập lại tên lớp chính xác..."
              className="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2.5 rounded-xl outline-none focus:border-rose-500"
            />

            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setDeletingClass(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={(deleteConfirmText || '').trim() !== (deletingClass?.class_name || '').trim()}
                className="px-4 py-2 bg-rose-600 text-white rounded-xl text-xs font-bold hover:bg-rose-700 disabled:opacity-50 cursor-pointer"
              >
                Xóa Lớp (Lưu Bản Chụp)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Promote Modal */}
      {promotingClass && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-sky-600 dark:text-sky-400">
              <Sparkles className="w-7 h-7 shrink-0 text-sky-500" />
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Chuyển Khối / Lên Lớp Tự Động
                </h3>
                <p className="text-xs text-slate-500">
                  {promotingClass.class_name} (Khối {promotingClass.grade_level})
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300">
              Hệ thống sẽ chuyển tự động danh sách học sinh sang Khối Lớp mới (Khối {Math.min(9, promotingClass.grade_level + 1)}), đồng thời chuyển lớp cũ sang trạng thái Lưu trữ để bảo lưu lịch sử điểm cũ.
            </p>

            <div className="space-y-2.5 bg-slate-50 dark:bg-slate-950/40 p-3.5 rounded-xl border border-slate-100 dark:border-slate-850">
              <label className="block text-xs font-extrabold text-slate-700 dark:text-slate-300">
                Tên lớp mới (Khối {Math.min(9, promotingClass.grade_level + 1)}):
              </label>
              <input
                type="text"
                value={promotedClassName}
                onChange={(e) => setPromotedClassName(e.target.value)}
                placeholder="Nhập tên lớp mới"
                className={`w-full px-3 py-2 text-xs font-bold border rounded-xl bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 outline-none transition-all ${
                  isDuplicatePromotedClassName
                    ? 'border-rose-500 focus:ring-2 focus:ring-rose-500/40'
                    : 'border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500'
                }`}
              />
              {isDuplicatePromotedClassName && (
                <div className="mt-1.5 p-2 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl flex items-center gap-1.5 text-xs text-rose-700 dark:text-rose-300 font-bold">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>Đã tồn tại lớp học trùng tên này trong hệ thống! Vui lòng đổi tên khác.</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                onClick={() => setPromotingClass(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Hủy
              </button>
              <button
                onClick={handleExecutePromote}
                disabled={isDuplicatePromotedClassName || !(promotedClassName || '').trim()}
                className="px-4 py-2 bg-sky-600 text-white rounded-xl text-xs font-bold hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                Xác Nhận Lên Lớp
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================================= */}
      {/* VIEWING CLASS DETAILS MODAL — KAIZEN FOR CUSTOMER CARE (CSKH)           */}
      {/* ======================================================================= */}
      {viewingClassDetails && (
        <div className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-6xl w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
            {/* Toast Notification inside Class Details */}
            {toastMessage && (
              <div className="p-3 rounded-xl bg-emerald-600 text-white text-xs font-bold flex items-center justify-between shadow-md">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{toastMessage}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setToastMessage(null)}
                  className="p-1 hover:bg-emerald-700 rounded-lg cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Modal Header */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                    KHỐI {viewingClassDetails.grade_level}
                  </span>
                  <span className="text-xs font-medium text-slate-500">
                    Lịch học: <strong>{viewingClassDetails.schedule}</strong>
                  </span>
                </div>
                <h3 className="text-lg font-extrabold text-slate-900 dark:text-slate-100">
                  Chi Tiết &amp; CSKH Lớp Học: {viewingClassDetails.class_name}
                </h3>
                <p className="text-[11px] text-slate-500">
                  Trợ giảng phụ trách: <strong>{viewingClassDetails.assistant_name}</strong> ({viewingClassDetails.assistant_phone || 'Chưa có SĐT'})
                </p>
              </div>

              <div className="flex items-center flex-wrap gap-2">
                {/* KAIZEN 1 TRIGGER: 1-Click Class Zalo Group Report */}
                <button
                  type="button"
                  onClick={() => {
                    setIsGroupZaloOpen(true);
                    setIsGroupZaloEdited(false);
                    setCopiedGroupZalo(false);
                  }}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
                  title="Tạo bản tin tổng kết buổi học & bảng vinh danh để gửi Nhóm Zalo Phụ huynh cả lớp"
                >
                  <Megaphone className="w-4 h-4" />
                  <span>Báo cáo Zalo Nhóm PH Cả Lớp 1-Click</span>
                </button>

                <button
                  onClick={() => handleExportRosterExcel(viewingClassDetails)}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  title="Xuất danh sách sĩ số & trạng thái CSKH ra Excel"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Xuất Excel</span>
                </button>

                <button
                  onClick={() => setViewingClassDetails(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* KAIZEN 3 BANNER: Automatic Detection of Algebra (Đ) <-> Geometry (H) Duplicate Profiles */}
            {crossClassDuplicatePairs.length > 0 && (
              <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 space-y-2">
                <div className="text-xs font-bold text-amber-900 dark:text-amber-200 flex items-center gap-2">
                  <GitMerge className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    Phát hiện {crossClassDuplicatePairs.length} học sinh học cả Đại số &amp; Hình học cùng Khối {viewingClassDetails.grade_level} đang bị tách 2 hồ sơ trùng tên:
                  </span>
                </div>
                <div className="space-y-1.5">
                  {crossClassDuplicatePairs.map((pair, idx) => (
                    <div
                      key={idx}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white dark:bg-slate-900 px-3 py-2 rounded-lg border border-amber-200/70 dark:border-amber-900/60 text-xs"
                    >
                      <span className="text-slate-700 dark:text-slate-200">
                        Học sinh <strong>{pair.thisStudent.full_name}</strong> (Lớp {viewingClassDetails.class_name}) trùng với hồ sơ{' '}
                        <strong>{pair.otherStudent.full_name}</strong> đang ở lớp <strong>{pair.otherClassName}</strong>
                      </span>
                      <button
                        type="button"
                        onClick={() => handleMergeCrossClassDuplicate(pair)}
                        className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold flex items-center gap-1.5 shrink-0 cursor-pointer"
                      >
                        <GitMerge className="w-3.5 h-3.5" />
                        <span>Gộp 1-Click (Giữ cả 2 lớp &amp; điểm)</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Sub-tabs inside Detail Modal */}
            <div className="flex border-b border-slate-200 dark:border-slate-800">
              <button
                onClick={() => setDetailSubTab('roster')}
                className={`flex-1 pb-2.5 text-xs font-bold text-center border-b-2 transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  detailSubTab === 'roster'
                    ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <Users className="w-4 h-4" />
                <span>
                  Danh Sách Sĩ Số &amp; Điều Phối CSKH ({
                    classStudents.filter((cs) => {
                      if (String(cs.class_id) !== String(viewingClassDetails.id)) return false;
                      if (cs.leave_date) return false;
                      const st = students.find((s) => String(s.id) === String(cs.student_id));
                      return Boolean(st) && st?.status !== 'stopped';
                    }).length
                  })
                </span>
              </button>
              <button
                onClick={() => setDetailSubTab('sessions')}
                className={`flex-1 pb-2.5 text-xs font-bold text-center border-b-2 transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  detailSubTab === 'sessions'
                    ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <Clock className="w-4 h-4" />
                <span>Nhật Ký &amp; Kết Quả Buổi Học ({sessions.filter((s) => String(s.class_id) === String(viewingClassDetails.id)).length})</span>
              </button>
            </div>

            {/* Sub-tab 1 Content: Class Roster & CSKH */}
            {detailSubTab === 'roster' && (
              <div className="space-y-3">
                {/* Roster Filter Status & Smart Cross-Class Enrollment (No bulk orphan button!) */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
                  <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl shrink-0">
                    <button
                      onClick={() => setRosterFilterStatus('active')}
                      className={`px-3 py-1 rounded-lg font-bold text-[11px] cursor-pointer ${
                        rosterFilterStatus === 'active' ? 'bg-white dark:bg-slate-900 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500'
                      }`}
                    >
                      Đang Học ({
                        classStudents.filter((cs) => {
                          if (String(cs.class_id) !== String(viewingClassDetails.id)) return false;
                          if (cs.leave_date) return false;
                          const st = students.find((s) => String(s.id) === String(cs.student_id));
                          return Boolean(st) && st?.status !== 'stopped';
                        }).length
                      })
                    </button>
                    <button
                      onClick={() => setRosterFilterStatus('left')}
                      className={`px-3 py-1 rounded-lg font-bold text-[11px] cursor-pointer ${
                        rosterFilterStatus === 'left' ? 'bg-white dark:bg-slate-900 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500'
                      }`}
                    >
                      Đã Rút Lớp ({
                        classStudents.filter((cs) => {
                          if (String(cs.class_id) !== String(viewingClassDetails.id)) return false;
                          const st = students.find((s) => String(s.id) === String(cs.student_id));
                          return Boolean(st) && (Boolean(cs.leave_date) || st?.status === 'stopped');
                        }).length
                      })
                    </button>
                    <button
                      onClick={() => setRosterFilterStatus('all')}
                      className={`px-3 py-1 rounded-lg font-bold text-[11px] cursor-pointer ${
                        rosterFilterStatus === 'all' ? 'bg-white dark:bg-slate-900 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500'
                      }`}
                    >
                      Tất Cả ({
                        classStudents.filter((cs) => {
                          if (String(cs.class_id) !== String(viewingClassDetails.id)) return false;
                          const st = students.find((s) => String(s.id) === String(cs.student_id));
                          return Boolean(st);
                        }).length
                      })
                    </button>
                  </div>

                  {/* KAIZEN 3: Smart Cross-Class Enrollment Dropdown (Prioritizes Sibling Algebra/Geometry Students of the Same Grade) */}
                  {isAdmin && (() => {
                    const activeClassIdStr = String(viewingClassDetails.id);
                    const curGrade = viewingClassDetails.grade_level;
                    const enrolledInThisClass = new Set(
                      classStudents
                        .filter((cs) => String(cs.class_id) === activeClassIdStr && !cs.leave_date)
                        .map((cs) => String(cs.student_id))
                    );

                    // Map student_id -> active class names & grades
                    const studentClassNamesMap = new Map<string, string[]>();
                    const studentGradesMap = new Map<string, Set<number>>();
                    for (const cs of classStudents) {
                      if (cs.leave_date) continue;
                      const cObj = classes.find((c) => String(c.id) === String(cs.class_id));
                      if (!cObj) continue;
                      const sid = String(cs.student_id);
                      if (!studentClassNamesMap.has(sid)) studentClassNamesMap.set(sid, []);
                      studentClassNamesMap.get(sid)!.push(cObj.class_name);
                      if (!studentGradesMap.has(sid)) studentGradesMap.set(sid, new Set());
                      studentGradesMap.get(sid)!.add(cObj.grade_level);
                    }

                    const availableToEnroll = students
                      .filter((s) => s.status !== 'stopped' && !enrolledInThisClass.has(String(s.id)))
                      .sort((a, b) => compareVietnameseNames(a.full_name || '', b.full_name || ''));

                    // Priority Group 1: Students already in a same-grade sibling class (e.g. Algebra <-> Geometry)
                    const sameGradeSiblingStudents = availableToEnroll.filter((s) =>
                      studentGradesMap.get(String(s.id))?.has(curGrade)
                    );
                    // Group 2: Other available students
                    const otherAvailableStudents = availableToEnroll.filter(
                      (s) => !studentGradesMap.get(String(s.id))?.has(curGrade)
                    );

                    if (availableToEnroll.length === 0) return null;

                    return (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <select
                          id="quick-enroll-student-select"
                          defaultValue=""
                          className="text-[11px] bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 rounded-xl outline-none font-bold text-slate-700 dark:text-slate-200 max-w-[320px]"
                        >
                          <option value="">
                            + Ghi danh học sinh vào lớp (Chống tạo trùng Đại/Hình)...
                          </option>
                          {sameGradeSiblingStudents.length > 0 && (
                            <optgroup label={`★ Ưu tiên: Học sinh cùng Khối ${curGrade} đang học lớp Đại/Hình đối ứng`}>
                              {sameGradeSiblingStudents.map((s) => {
                                const cNames = studentClassNamesMap.get(String(s.id)) || [];
                                return (
                                  <option key={s.id} value={s.id}>
                                    {s.full_name} (Đang học: {cNames.join(', ')})
                                  </option>
                                );
                              })}
                            </optgroup>
                          )}
                          {otherAvailableStudents.length > 0 && (
                            <optgroup label="Học sinh khác / Chưa xếp lớp">
                              {otherAvailableStudents.map((s) => {
                                const cNames = studentClassNamesMap.get(String(s.id)) || [];
                                return (
                                  <option key={s.id} value={s.id}>
                                    {s.full_name} {cNames.length > 0 ? `(${cNames.join(', ')})` : '(Chưa xếp lớp)'}
                                  </option>
                                );
                              })}
                            </optgroup>
                          )}
                        </select>
                        <button
                          type="button"
                          onClick={async () => {
                            const sel = document.getElementById('quick-enroll-student-select') as HTMLSelectElement;
                            if (!sel || !sel.value) return;
                            const stId = String(sel.value);
                            const stObj = students.find((s) => String(s.id) === stId);
                            const now = new Date().toISOString();
                            await db.class_students.put({
                              id: `cs_${activeClassIdStr}_${stId}`,
                              class_id: activeClassIdStr,
                              student_id: stId,
                              join_date: now.split('T')[0],
                              leave_date: undefined,
                              created_at: now,
                            });
                            if (stObj) {
                              await logAudit(
                                currentRole as UserRole,
                                'Xếp học sinh vào lớp',
                                `Xếp học sinh ${stObj.full_name} học thêm lớp ${viewingClassDetails.class_name} (Dùng chung 1 hồ sơ)`
                              );
                              showToast(
                                `Đã ghi danh "${stObj.full_name}" vào lớp ${viewingClassDetails.class_name} (Liên kết chung 1 hồ sơ)!`
                              );
                            }
                            sel.value = '';
                            onRefresh();
                          }}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-[11px] transition-colors cursor-pointer shrink-0"
                        >
                          Ghi danh vào lớp
                        </button>
                      </div>
                    );
                  })()}
                </div>

                {/* KAIZEN 2: Customer-Care Roster Table with Academic Telemetry, Last Active Date, CRM Status & 1-Click Parent Report */}
                <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-bold uppercase text-[10px]">
                        <th className="py-2.5 px-3">STT</th>
                        <th className="py-2.5 px-3">Học Sinh &amp; Lớp Học Kèm</th>
                        <th className="py-2.5 px-3">Phụ Huynh &amp; Liên Hệ</th>
                        <th className="py-2.5 px-3">Kết Quả Tại Lớp &amp; Buổi Cuối</th>
                        <th className="py-2.5 px-3">Nhãn CSKH</th>
                        <th className="py-2.5 px-3 text-right">Báo Cáo PH 1-Click &amp; Quản Lý</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-slate-700 dark:text-slate-300">
                      {(() => {
                        const curClassIdStr = String(viewingClassDetails.id);
                        const clsSessions = sessions
                          .filter((s) => String(s.class_id) === curClassIdStr)
                          .sort((a, b) => a.session_date.localeCompare(b.session_date));
                        const clsSessionIdSet = new Set(clsSessions.map((s) => String(s.id)));
                        const clsSessionMap = new Map(clsSessions.map((s) => [String(s.id), s]));

                        const classStudLinks = classStudents.filter((cs) => {
                          if (String(cs.class_id) !== curClassIdStr) return false;
                          const st = students.find((s) => String(s.id) === String(cs.student_id));
                          if (!st) return false;

                          const isLeft = Boolean(cs.leave_date) || st.status === 'stopped';
                          if (rosterFilterStatus === 'active' && isLeft) return false;
                          if (rosterFilterStatus === 'left' && !isLeft) return false;
                          return true;
                        });

                        classStudLinks.sort((a, b) => {
                          const stA = students.find((s) => String(s.id) === String(a.student_id));
                          const stB = students.find((s) => String(s.id) === String(b.student_id));
                          return compareVietnameseNames(stA?.full_name || '', stB?.full_name || '');
                        });

                        if (classStudLinks.length === 0) {
                          return (
                            <tr>
                              <td colSpan={6} className="py-8 text-center text-slate-400 italic">
                                Không có học sinh nào trong danh mục này.
                              </td>
                            </tr>
                          );
                        }

                        return classStudLinks.map((link, idx) => {
                          const st = students.find((s) => String(s.id) === String(link.student_id));
                          if (!st) return null;
                          const sid = String(st.id);
                          const isCurrentlyActive = !link.leave_date && st.status !== 'stopped';

                          // Other active classes this student is enrolled in (e.g. Đại <-> Hình)
                          const otherClasses = classStudents
                            .filter(
                              (cs) =>
                                String(cs.student_id) === sid &&
                                String(cs.class_id) !== curClassIdStr &&
                                !cs.leave_date
                            )
                            .map((cs) => classes.find((c) => String(c.id) === String(cs.class_id))?.class_name)
                            .filter(Boolean);

                          // Academic performance inside this class
                          const stClsRecords = studentSessions.filter(
                            (ss) =>
                              String(ss.student_id) === sid &&
                              clsSessionIdSet.has(String(ss.session_id))
                          );
                          const presentRecs = stClsRecords.filter(
                            (r) => r.attendance === 'present' || r.attendance === 'late'
                          );
                          const hwScores = stClsRecords
                            .filter((r) => typeof r.homework_score === 'number' && r.homework_score > 0)
                            .map((r) => Number(r.homework_score));
                          const testScores = stClsRecords
                            .filter((r) => typeof r.test_score === 'number' && r.test_score > 0)
                            .map((r) => Number(r.test_score));

                          const avgHw =
                            hwScores.length > 0
                              ? (hwScores.reduce((a, b) => a + b, 0) / hwScores.length).toFixed(1)
                              : '—';
                          const avgTest =
                            testScores.length > 0
                              ? (testScores.reduce((a, b) => a + b, 0) / testScores.length).toFixed(1)
                              : '—';

                          const activeDates = presentRecs
                            .map((r) => clsSessionMap.get(String(r.session_id))?.session_date)
                            .filter(Boolean)
                            .sort() as string[];
                          const lastActiveDate =
                            activeDates[activeDates.length - 1] || 'Chưa có buổi';

                          const cleanPhone = (st.parent_phone || '').replace(/\D/g, '');
                          const crmStatus: CRMCustomerStatus = st.crm_status || 'satisfied';

                          const handleCycleCrmStatus = async () => {
                            const order: CRMCustomerStatus[] = [
                              'satisfied',
                              'attention',
                              'at_risk',
                            ];
                            const nextStatus =
                              order[(order.indexOf(crmStatus) + 1) % order.length];
                            const now = new Date().toISOString();
                            await db.students.update(sid, {
                              crm_status: nextStatus,
                              crm_status_updated_at: now,
                              updated_at: now,
                            });
                            showToast(
                              `Đã đổi nhãn CSKH của ${st.full_name} sang "${CRM_CLASSIFICATION_CRITERIA[nextStatus].shortBadge}"`
                            );
                          };

                          return (
                            <tr
                              key={link.id ? `${link.id}-${idx}` : idx}
                              className={`hover:bg-slate-50 dark:hover:bg-slate-800/30 ${
                                !isCurrentlyActive ? 'opacity-60 bg-slate-50/40 dark:bg-slate-900/40' : ''
                              }`}
                            >
                              <td className="py-3 px-3 font-mono text-slate-400 align-top">
                                {idx + 1}
                              </td>

                              {/* Col 2: Student Name & Linked Sibling Class */}
                              <td className="py-3 px-3 align-top">
                                <div className="font-bold text-slate-900 dark:text-slate-100">
                                  {st.full_name}
                                  {!isCurrentlyActive && (
                                    <span className="ml-1.5 text-[10px] text-rose-500 font-bold">
                                      (Đã rút {link.leave_date})
                                    </span>
                                  )}
                                </div>
                                {otherClasses.length > 0 && (
                                  <div className="text-[11px] text-sky-700 dark:text-sky-400 font-medium mt-0.5">
                                    Học kèm: {otherClasses.join(', ')}
                                  </div>
                                )}
                              </td>

                              {/* Col 3: Parent & Quick Call / Zalo */}
                              <td className="py-3 px-3 align-top">
                                <div className="font-medium text-slate-800 dark:text-slate-200">
                                  {st.parent_name || 'Phụ huynh'}
                                </div>
                                <div className="text-[11px] font-mono text-slate-500 tabular-nums">
                                  {st.parent_phone || 'Chưa có SĐT'}
                                </div>
                                {cleanPhone && (
                                  <div className="flex items-center gap-2 mt-1">
                                    <a
                                      href={`tel:${cleanPhone}`}
                                      className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:text-emerald-600 flex items-center gap-0.5"
                                    >
                                      <Phone className="w-3 h-3" />
                                      <span>Gọi</span>
                                    </a>
                                    <span>·</span>
                                    <a
                                      href={`https://zalo.me/${cleanPhone}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-[11px] font-semibold text-sky-600 dark:text-sky-400 hover:underline flex items-center gap-0.5"
                                    >
                                      <ExternalLink className="w-3 h-3" />
                                      <span>Zalo</span>
                                    </a>
                                  </div>
                                )}
                              </td>

                              {/* Col 4: Class Academic Telemetry & Last Active Date */}
                              <td className="py-3 px-3 align-top font-mono tabular-nums">
                                <div className="text-[11px]">
                                  Đi học:{' '}
                                  <strong className="text-slate-900 dark:text-slate-100">
                                    {presentRecs.length}/{stClsRecords.length} buổi
                                  </strong>{' '}
                                  · BTVN: <strong>{avgHw}</strong> · KT:{' '}
                                  <strong className="text-emerald-700 dark:text-emerald-400">
                                    {avgTest}
                                  </strong>
                                </div>
                                <div
                                  className={`text-[11px] mt-0.5 ${
                                    lastActiveDate < '2026-10-20'
                                      ? 'text-rose-600 dark:text-rose-400 font-bold'
                                      : 'text-slate-500'
                                  }`}
                                >
                                  Buổi cuối: {lastActiveDate}
                                </div>
                              </td>

                              {/* Col 5: 1-Click CRM Status Toggle */}
                              <td className="py-3 px-3 align-top">
                                <button
                                  type="button"
                                  onClick={handleCycleCrmStatus}
                                  title="Nhấn để chuyển nhanh nhãn CSKH (Hài lòng -> Cần chú ý -> Nguy cơ nghỉ học)"
                                  className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold flex items-center gap-1 cursor-pointer ${
                                    crmStatus === 'satisfied'
                                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800'
                                      : crmStatus === 'attention'
                                      ? 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800'
                                      : 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800'
                                  }`}
                                >
                                  {crmStatus === 'satisfied' && (
                                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                  )}
                                  {crmStatus === 'attention' && (
                                    <AlertTriangle className="w-3 h-3 text-amber-600" />
                                  )}
                                  {crmStatus === 'at_risk' && (
                                    <Flame className="w-3 h-3 text-rose-600" />
                                  )}
                                  <span>
                                    {CRM_CLASSIFICATION_CRITERIA[crmStatus].shortBadge}
                                  </span>
                                </button>
                              </td>

                              {/* Col 6: 1-Click Parent Report & Roster Actions */}
                              <td className="py-3 px-3 align-top text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setReportStudentId(sid);
                                      setIsReportEdited(false);
                                      setCopiedSingleReport(false);
                                      if (crmStatus === 'at_risk') {
                                        setReportTemplateId('tpl_retention_care');
                                      } else if (crmStatus === 'attention') {
                                        setReportTemplateId('tpl_homework_attendance');
                                      } else {
                                        setReportTemplateId('tpl_periodic_report');
                                      }
                                    }}
                                    className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap"
                                  >
                                    <MessageSquareText className="w-3.5 h-3.5" />
                                    <span>Báo cáo PH 1-Click</span>
                                  </button>

                                  {isAdmin && (
                                    <>
                                      {isCurrentlyActive ? (
                                        <button
                                          onClick={async () => {
                                            if (
                                              confirm(
                                                `Bạn có chắc chắn muốn cho học sinh ${st.full_name} rút lui an toàn khỏi lớp ${viewingClassDetails.class_name}?\nDữ liệu lịch sử điểm số cũ vẫn được bảo lưu đầy đủ.`
                                              )
                                            ) {
                                              const todayStr = new Date()
                                                .toISOString()
                                                .split('T')[0];
                                              await db.class_students.update(link.id!, {
                                                leave_date: todayStr,
                                              });
                                              await logAudit(
                                                currentRole as UserRole,
                                                'Cho học sinh rút lui',
                                                `Cho học sinh ${st.full_name} rút lui an toàn khỏi lớp ${viewingClassDetails.class_name}`
                                              );
                                              onRefresh();
                                            }
                                          }}
                                          className="text-amber-600 hover:text-amber-800 font-bold hover:underline text-[11px] cursor-pointer"
                                        >
                                          Rút lớp
                                        </button>
                                      ) : (
                                        <button
                                          onClick={async () => {
                                            if (
                                              confirm(
                                                `Khôi phục học sinh ${st.full_name} quay lại tham gia học lớp ${viewingClassDetails.class_name}?`
                                              )
                                            ) {
                                              await db.class_students.update(link.id!, {
                                                leave_date: undefined,
                                                join_date: new Date()
                                                  .toISOString()
                                                  .split('T')[0],
                                              });
                                              await logAudit(
                                                currentRole as UserRole,
                                                'Khôi phục học sinh',
                                                `Khôi phục ${st.full_name} tham gia học lại lớp ${viewingClassDetails.class_name}`
                                              );
                                              onRefresh();
                                            }
                                          }}
                                          className="text-emerald-600 hover:text-emerald-800 font-bold hover:underline text-[11px] cursor-pointer"
                                        >
                                          Học lại
                                        </button>
                                      )}
                                      <button
                                        onClick={async () => {
                                          if (
                                            confirm(
                                              `Bạn có chắc chắn muốn xóa học sinh ${st.full_name} khỏi danh sách lớp ${viewingClassDetails.class_name}? Các dữ liệu điểm số vẫn được bảo lưu.`
                                            )
                                          ) {
                                            await db.class_students.delete(link.id!);
                                            await logAudit(
                                              currentRole as UserRole,
                                              'Xóa học sinh khỏi lớp',
                                              `Xóa ${st.full_name} khỏi lớp ${viewingClassDetails.class_name}`
                                            );
                                            onRefresh();
                                          }
                                        }}
                                        className="text-rose-500 hover:text-rose-700 font-bold hover:underline text-[11px] cursor-pointer"
                                      >
                                        Xóa
                                      </button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Sub-tab 2 Content: Lesson Log / Sessions taught */}
            {detailSubTab === 'sessions' && (
              <div className="space-y-4">
                {(() => {
                  const classSessions = sessions
                    .filter((s) => String(s.class_id) === String(viewingClassDetails.id))
                    .sort((a, b) => b.session_date.localeCompare(a.session_date));

                  const validClassStudentIds = new Set(
                    classStudents
                      .filter((cs) => String(cs.class_id) === String(viewingClassDetails.id) && !cs.leave_date)
                      .map((cs) => String(cs.student_id))
                  );

                  if (classSessions.length === 0) {
                    return (
                      <p className="text-center py-6 text-xs text-slate-400 italic">
                        Chưa có lịch sử buổi học nào được ghi nhận cho lớp này. Hãy bấm "Nhập điểm Lớp" ở ngoài để tạo buổi dạy học đầu tiên.
                      </p>
                    );
                  }

                  return (
                    <div className="space-y-3">
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Lịch sử bài giảng đã dạy (Mới nhất lên đầu):</p>

                      <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
                        {classSessions.map((sess, sIdx) => {
                          const rawSessScores = studentSessions.filter(
                            (ss) => String(ss.session_id) === String(sess.id) && (validClassStudentIds.size === 0 || validClassStudentIds.has(String(ss.student_id)))
                          );

                          // Deduplicate by student_id
                          const dedupMap = new Map<string, StudentSession>();
                          rawSessScores.forEach((ss) => {
                            const key = String(ss.student_id);
                            const existing = dedupMap.get(key);
                            if (!existing) {
                              dedupMap.set(key, ss);
                            } else {
                              const existingTime = existing.updated_at ? new Date(existing.updated_at).getTime() : 0;
                              const curTime = ss.updated_at ? new Date(ss.updated_at).getTime() : 0;
                              if (curTime >= existingTime) {
                                dedupMap.set(key, ss);
                              }
                            }
                          });

                          const sessStudScores = Array.from(dedupMap.values());
                          sessStudScores.sort((a, b) => {
                            const stA = students.find((s) => String(s.id) === String(a.student_id));
                            const stB = students.find((s) => String(s.id) === String(b.student_id));
                            return compareVietnameseNames(stA?.full_name || '', stB?.full_name || '');
                          });

                          const presentCount = sessStudScores.filter((ss) => !ss.attendance || ss.attendance === 'present' || ss.attendance === 'late').length;
                          const totalCount = validClassStudentIds.size > 0 ? validClassStudentIds.size : sessStudScores.length;

                          const homeworks = sessStudScores.filter((ss) => !(ss.exempt || ss.exempt_homework) && typeof ss.homework_score === 'number' && ss.homework_score >= 0);
                          const avgHW = homeworks.length > 0 ? (homeworks.reduce((sum, h) => sum + (h.homework_score || 0), 0) / homeworks.length).toFixed(1) : 'N/A';

                          const tests = sessStudScores.filter((ss) => !(ss.exempt || ss.exempt_test) && (ss.attendance === 'present' || ss.attendance === 'late') && typeof ss.test_score === 'number' && ss.test_score >= 0);
                          const avgTest = tests.length > 0 ? (tests.reduce((sum, t) => sum + t.test_score, 0) / tests.length).toFixed(1) : 'N/A';

                          return (
                            <details
                              key={sess.id ? `${sess.id}-${sIdx}` : sIdx}
                              className="group bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden [&_summary::-webkit-details-marker]:hidden"
                            >
                              <summary className="flex items-center justify-between p-3.5 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/60 select-none">
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-slate-900 dark:text-slate-100">{sess.lesson_title}</span>
                                    <span className="text-[10px] text-slate-400 font-bold">({sess.session_date})</span>
                                  </div>
                                  <div className="flex items-center gap-3 text-[10px] text-slate-500 font-medium">
                                    <span>Chuyên đề: <strong className="text-slate-700 dark:text-slate-300">{sess.chapter || 'Chưa phân loại'}</strong></span>
                                    <span>•</span>
                                    <span>Đi học: <strong className="text-emerald-600 dark:text-emerald-400">{presentCount}/{totalCount} HS</strong> ({totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0}%)</span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-3">
                                  <div className="text-right text-[10px]">
                                    <span className="block text-slate-400 font-semibold">TB BTVN / Kiểm tra:</span>
                                    <span className="font-extrabold text-emerald-600 dark:text-emerald-400">{avgHW}</span>
                                    <span className="text-slate-400 mx-1">/</span>
                                    <span className="font-extrabold text-blue-600 dark:text-blue-400">{avgTest}</span>
                                  </div>
                                  <span className="text-slate-400 group-open:rotate-180 transition-transform">▼</span>
                                </div>
                              </summary>

                              <div className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 space-y-2.5">
                                <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-800">
                                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Chi tiết điểm danh &amp; nhận xét học sinh:</span>
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setGroupZaloMode('single_session');
                                        setGroupZaloSessionId(String(sess.id));
                                        setIsGroupZaloEdited(false);
                                        setIsGroupZaloOpen(true);
                                      }}
                                      className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                                    >
                                      <Megaphone className="w-3 h-3" />
                                      <span>Tạo Bản tin Zalo Buổi này</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteSession(sess);
                                      }}
                                      className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-950/80 text-rose-600 dark:text-rose-300 border border-rose-200 dark:border-rose-800 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 shadow-sm cursor-pointer"
                                      title="Xóa vĩnh viễn buổi học này và toàn bộ dữ liệu điểm liên quan"
                                    >
                                      <Trash2 className="w-3 h-3 text-rose-500" />
                                      <span>Xóa buổi học này</span>
                                    </button>
                                  </div>
                                </div>

                                {sess.homework_description && (
                                  <div className="p-2 bg-amber-50/50 dark:bg-amber-950/10 border border-amber-100/50 dark:border-amber-900/30 rounded-lg text-[11px] text-amber-800 dark:text-amber-300">
                                    📝 <strong>Bài tập giao về nhà:</strong> {sess.homework_description}
                                  </div>
                                )}

                                <div className="overflow-x-auto">
                                  <table className="w-full text-left text-[11px] border-collapse">
                                    <thead>
                                      <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-semibold uppercase">
                                        <th className="py-1.5 px-2">Học sinh</th>
                                        <th className="py-1.5 px-2">Điểm danh</th>
                                        <th className="py-1.5 px-2 text-center">BTVN</th>
                                        <th className="py-1.5 px-2 text-center">Kiểm tra</th>
                                        <th className="py-1.5 px-2">Nhận xét buổi học</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100/50 dark:divide-slate-800/40 text-slate-700 dark:text-slate-300">
                                      {sessStudScores.map((ss, ssIdx) => {
                                        const student = students.find((s) => s.id === ss.student_id);
                                        if (!student) return null;

                                        const isAbsent = ss.attendance && ss.attendance.startsWith('absent');

                                        return (
                                          <tr key={ss.id ? `${ss.id}-${ssIdx}` : ssIdx}>
                                            <td className="py-2 px-2 font-bold text-slate-800 dark:text-slate-200">{student.full_name}</td>
                                            <td className="py-2 px-2">
                                              <span className={`px-1.5 py-0.5 rounded-md font-bold text-[9px] ${
                                                ss.attendance === 'present'
                                                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20'
                                                  : ss.attendance === 'late'
                                                  ? 'bg-amber-50 text-amber-700'
                                                  : 'bg-rose-50 text-rose-700'
                                              }`}>
                                                {ss.attendance === 'present' ? 'Đi học' : ss.attendance === 'late' ? 'Muộn' : ss.attendance === 'absent_excused' ? 'Vắng (Phép)' : 'Vắng (Không phép)'}
                                              </span>
                                            </td>
                                            <td className="py-2 px-2 text-center font-bold text-emerald-600 dark:text-emerald-400">
                                              {isAbsent ? (
                                                <span className="text-slate-400 font-normal">-</span>
                                              ) : ss.exempt || ss.exempt_homework ? (
                                                <span className="text-sky-600 font-extrabold">Miễn</span>
                                              ) : ss.homework_submitted === false ? (
                                                <span className="text-rose-500 font-bold">Chưa làm</span>
                                              ) : ss.late_submit ? (
                                                <span className="text-amber-600 text-[10px] block font-bold">Nộp muộn</span>
                                              ) : ss.homework_score !== undefined && ss.homework_score !== null ? (
                                                `${ss.homework_score}đ`
                                              ) : (
                                                <span className="text-slate-400 font-normal">Chưa nhập</span>
                                              )}
                                            </td>
                                            <td className="py-2 px-2 text-center font-bold text-blue-600 dark:text-blue-400">
                                              {isAbsent ? (
                                                <span className="text-slate-400 font-normal">-</span>
                                              ) : ss.exempt || ss.exempt_test ? (
                                                <span className="text-sky-600 font-extrabold">Miễn</span>
                                              ) : ss.makeup_test ? (
                                                <span className="text-amber-600 font-bold">{ss.test_score !== undefined && ss.test_score !== null ? `${ss.test_score}đ` : 'Chờ'} (Bù)</span>
                                              ) : ss.test_score !== undefined && ss.test_score !== null ? (
                                                `${ss.test_score}đ`
                                              ) : (
                                                <span className="text-purple-600 font-semibold text-[11px]">Chờ chấm</span>
                                              )}
                                            </td>
                                            <td className="py-2 px-2 text-slate-500 text-[10px] italic whitespace-pre-line">
                                              {ss.custom_comment || (ss.quick_preset_comments && ss.quick_preset_comments.join(', ')) || '-'}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </details>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Modal Footer */}
            <div className="flex justify-end pt-3 border-t border-slate-100 dark:border-slate-800/60">
              <button
                onClick={() => setViewingClassDetails(null)}
                className="px-4 py-2 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 rounded-xl text-xs font-bold shadow cursor-pointer"
              >
                Đóng chi tiết
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================================= */}
      {/* KAIZEN MODAL A: 1-CLICK CLASS ZALO GROUP ANNOUNCEMENT                   */}
      {/* ======================================================================= */}
      {isGroupZaloOpen && viewingClassDetails && compiledGroupZalo && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-600/10 text-emerald-600 flex items-center justify-center">
                  <Megaphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Báo Cáo Nhóm Zalo Phụ Huynh Cả Lớp — {viewingClassDetails.class_name}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Tự động tổng hợp bài học, điểm TB lớp, BTVN và bảng vinh danh học sinh tiêu biểu
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsGroupZaloOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mode & Session Selector */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setGroupZaloMode('single_session');
                    setIsGroupZaloEdited(false);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                    groupZaloMode === 'single_session'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                  }`}
                >
                  Tổng kết 1 Buổi học
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setGroupZaloMode('cycle_4');
                    setIsGroupZaloEdited(false);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                    groupZaloMode === 'cycle_4'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                  }`}
                >
                  Tổng kết Chu kỳ 4 Buổi
                </button>
              </div>

              {groupZaloMode === 'single_session' && (
                <select
                  value={groupZaloSessionId}
                  onChange={(e) => {
                    setGroupZaloSessionId(e.target.value);
                    setIsGroupZaloEdited(false);
                  }}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold"
                >
                  <option value="">Buổi học gần nhất</option>
                  {sessions
                    .filter((s) => String(s.class_id) === String(viewingClassDetails.id))
                    .sort((a, b) => b.session_date.localeCompare(a.session_date))
                    .map((s) => (
                      <option key={s.id} value={String(s.id)}>
                        {s.session_date} — {s.lesson_title}
                      </option>
                    ))}
                </select>
              )}
            </div>

            {/* Editable Announcement Textarea */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                Nội dung bản tin gửi Nhóm Zalo Phụ Huynh Lớp (Có thể chỉnh sửa thêm):
              </label>
              <textarea
                rows={13}
                value={
                  isGroupZaloEdited
                    ? groupZaloCustomText
                    : compiledGroupZalo.announcementText
                }
                onChange={(e) => {
                  setGroupZaloCustomText(e.target.value);
                  setIsGroupZaloEdited(true);
                }}
                className="w-full p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-100 leading-relaxed focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsGroupZaloOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer"
              >
                Đóng
              </button>
              <button
                type="button"
                onClick={async () => {
                  const text = isGroupZaloEdited
                    ? groupZaloCustomText
                    : compiledGroupZalo.announcementText;
                  try {
                    await navigator.clipboard.writeText(text);
                    setCopiedGroupZalo(true);
                    showToast(
                      `Đã sao chép bản tin tổng kết lớp ${viewingClassDetails.class_name} để dán vào Nhóm Zalo Phụ huynh!`
                    );
                  } catch (e) {}
                }}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-2 shadow-sm cursor-pointer"
              >
                {copiedGroupZalo ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Đã Sao Chép Bản Tin Nhóm Lớp!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Sao Chép Bản Tin Gửi Nhóm Zalo Lớp</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================================= */}
      {/* KAIZEN MODAL B: 1-CLICK SINGLE STUDENT PARENT REPORT INSIDE CLASS       */}
      {/* ======================================================================= */}
      {activeSingleReport && viewingClassDetails && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-3xl w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Báo Cáo Học Tập 1-Click — {activeSingleReport.student.full_name} (Lớp {viewingClassDetails.class_name})
                </h3>
                <p className="text-xs text-slate-500">
                  Phụ huynh: {activeSingleReport.student.parent_name || 'Gia đình'} ({activeSingleReport.student.parent_phone || 'Chưa có SĐT'}) ·{' '}
                  {activeSingleReport.periodLabel} ({activeSingleReport.dateRangeText})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReportStudentId(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Period & Template Selectors */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Chu kỳ tổng hợp điểm tại lớp {viewingClassDetails.class_name}:
                </label>
                <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                  {(
                    [
                      { val: 1, label: '1 Buổi' },
                      { val: 4, label: '4 Buổi' },
                      { val: 8, label: '8 Buổi' },
                      { val: 'all', label: 'Toàn khóa' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={String(opt.val)}
                      type="button"
                      onClick={() => {
                        setReportCycleLimit(opt.val);
                        setIsReportEdited(false);
                      }}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                        reportCycleLimit === opt.val
                          ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-300 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Chọn mẫu tin nhắn Zalo / SMS cá nhân hóa:
                </label>
                <select
                  value={reportTemplateId}
                  onChange={(e) => {
                    setReportTemplateId(e.target.value);
                    setIsReportEdited(false);
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold"
                >
                  {templates.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Summary Academic Strip */}
            <div className="grid grid-cols-3 gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 text-xs font-mono tabular-nums">
              <div>
                <span className="text-slate-500 font-sans block text-[11px]">Chuyên cần</span>
                <strong className="text-slate-900 dark:text-slate-100">
                  {activeSingleReport.attendanceRate}% ({activeSingleReport.presentCount}/
                  {activeSingleReport.totalSessionsInPeriod} buổi)
                </strong>
              </div>
              <div>
                <span className="text-slate-500 font-sans block text-[11px]">Điểm TB BTVN (Lớp)</span>
                <strong className="text-slate-900 dark:text-slate-100">
                  {activeSingleReport.studentHwAvg ?? '—'}/10 (Lớp: {activeSingleReport.classHwAvg ?? '—'})
                </strong>
              </div>
              <div>
                <span className="text-slate-500 font-sans block text-[11px]">Điểm TB Kiểm tra (Lớp)</span>
                <strong className="text-emerald-700 dark:text-emerald-400">
                  {activeSingleReport.studentTestAvg ?? '—'}/10 (Lớp: {activeSingleReport.classTestAvg ?? '—'})
                </strong>
              </div>
            </div>

            {/* Editable Message Textarea */}
            <div>
              <textarea
                rows={12}
                value={
                  isReportEdited
                    ? reportCustomText
                    : renderedSingleReportMessage
                }
                onChange={(e) => {
                  setReportCustomText(e.target.value);
                  setIsReportEdited(true);
                }}
                className="w-full p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-100 leading-relaxed focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setReportStudentId(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer"
              >
                Đóng
              </button>

              <button
                type="button"
                onClick={() => handleCopySingleReportAndLog(false)}
                className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                {copiedSingleReport ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Đã Sao Chép &amp; Lưu Nhật Ký CSKH!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Sao Chép &amp; Tự Động Lưu Nhật Ký CSKH</span>
                  </>
                )}
              </button>

              {activeSingleReport.student.parent_phone && (
                <button
                  type="button"
                  onClick={() => handleCopySingleReportAndLog(true)}
                  className="px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Sao Chép &amp; Mở Zalo Phụ Huynh</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
