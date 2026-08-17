import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ClassItem, GradeLevel, ClassStatus, ClassType, UserRole, Session, Warning, StudentSession } from '../types';
import { db } from '../db/dexie';
import { logAudit } from '../utils/auditLogger';
import { compareVietnameseNames } from '../utils/sortUtils';
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
  Download,
  Printer,
  AlertTriangle,
  FileSpreadsheet,
} from 'lucide-react';

interface ClassManagementProps {
  classes: ClassItem[];
  selectedYearId: string;
  currentRole?: UserRole;
  onRefresh: () => void;
  onSelectClassForGradeEntry: (classId: string) => void;
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

  // Live queries for reactive size and sub-list details
  const classStudents = useLiveQuery(() => db.class_students.toArray()) || [];
  const students = useLiveQuery(() => db.students.toArray()) || [];
  const sessions = useLiveQuery(() => db.sessions.toArray()) || [];
  const studentSessions = useLiveQuery(() => db.student_sessions.toArray()) || [];
  const warnings = useLiveQuery(() => db.warnings.toArray()) || [];

  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassItem | null>(null);
  const [viewingClassDetails, setViewingClassDetails] = useState<ClassItem | null>(null);
  const [detailSubTab, setDetailSubTab] = useState<'roster' | 'sessions'>('roster');
  const [rosterFilterStatus, setRosterFilterStatus] = useState<'active' | 'all' | 'left'>('active');

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
    onRefresh();
  };

  // Safe Cascade Delete Guard
  const handleConfirmDelete = async () => {
    if (!deletingClass) return;
    if ((deleteConfirmText || '').trim() !== (deletingClass.class_name || '').trim()) {
      alert('Tên lớp nhập lại không chính xác!');
      return;
    }

    const classSessions = await db.sessions.where('class_id').equals(deletingClass.id!).toArray();
    const sessionIds = classSessions.map((s) => s.id!).filter(Boolean);
    if (sessionIds.length > 0) {
      await db.student_sessions.where('session_id').anyOf(sessionIds).delete();
    }

    await db.classes.delete(deletingClass.id!);
    await db.class_students.where('class_id').equals(deletingClass.id!).delete();
    await db.sessions.where('class_id').equals(deletingClass.id!).delete();
    await db.warnings.where('class_id').equals(deletingClass.id!).delete();

    await logAudit(currentRole as UserRole, 'Xóa lớp học', `Xóa vĩnh viễn lớp ${deletingClass.class_name}`);

    setDeletingClass(null);
    setDeleteConfirmText('');
    onRefresh();
  };

  const handleDeleteSession = async (sess: Session) => {
    if (!sess || !sess.id) return;
    if (
      !confirm(
        `XÁC NHẬN XÓA BUỔI HỌC VĨNH VIỄN?\n\n` +
          `- Buổi học: "${sess.lesson_title}" (${sess.session_date})\n` +
          `- Thuộc lớp: ${viewingClassDetails?.class_name}\n\n` +
          `Hành động này sẽ xóa toàn bộ điểm số, điểm danh và nhận xét của học sinh trong buổi học này khỏi cơ sở dữ liệu. Không thể hoàn tác!`
      )
    ) {
      return;
    }

    try {
      const sessIdStr = String(sess.id);
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
        `Xóa vĩnh viễn buổi học "${sess.lesson_title}" (${sess.session_date}) khỏi lớp ${viewingClassDetails?.class_name}`
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
    await db.classes.update(promotingClass.id!, { status: 'archived', updated_at: now });

    const studentLinks = await db.class_students.where('class_id').equals(promotingClass.id!).toArray();
    const activeLinks = studentLinks.filter(l => !l.leave_date);
    for (const link of activeLinks) {
      const csPayload = {
        class_id: newClassId,
        student_id: link.student_id,
        join_date: now.split('T')[0],
        created_at: now,
      };
      await db.class_students.add(csPayload);
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
          'Địa Chỉ': st.address || '',
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

  // Helper for Class Health Indicators
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

  return (
    <div id="class-management-view" className="space-y-6">
      {/* Top Header Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <span>Quản Lý Lớp Học &amp; Chuyển Khối</span>
            {!isAdmin && (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300 flex items-center gap-1">
                <Lock className="w-3 h-3" /> Quyền Trợ Giảng (Xem &amp; Nhập Điểm)
              </span>
            )}
          </h2>
          <p className="text-xs text-slate-500">
            Phân loại Lớp học môn Toán THCS (Khối 6-9), phân công Trợ giảng &amp; Lên lớp đầu năm.
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
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-md shrink-0 ${
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
            className={`flex-1 md:flex-none px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
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
            className={`flex-1 md:flex-none px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
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
            className={`px-3 py-1 rounded-lg text-xs font-bold shrink-0 ${
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
              className={`px-3 py-1 rounded-lg text-xs font-bold shrink-0 ${
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

      {/* Class Cards Grid */}
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
                        title="Xem danh sách & lịch sử dạy học"
                      >
                        {cls.class_name}
                      </button>
                    </div>

                    <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => {
                          if (!isAdmin) {
                            alert('Chỉ Admin (Giáo viên chính) mới có quyền sửa thông tin lớp học!');
                            return;
                          }
                          handleOpenEditModal(cls);
                        }}
                        className={`p-1.5 rounded-lg ${
                          isAdmin
                            ? 'text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                            : 'text-slate-300 dark:text-slate-700 cursor-not-allowed'
                        }`}
                        title={isAdmin ? 'Sửa thông tin lớp' : 'Khóa với quyền Trợ giảng'}
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (!isAdmin) {
                            alert('Chỉ Admin (Giáo viên chính) mới có quyền xóa lớp học!');
                            return;
                          }
                          setDeletingClass(cls);
                        }}
                        className={`p-1.5 rounded-lg ${
                          isAdmin
                            ? 'text-slate-400 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-800'
                            : 'text-slate-300 dark:text-slate-700 cursor-not-allowed'
                        }`}
                        title={isAdmin ? 'Xóa an toàn lớp học' : 'Khóa với quyền Trợ giảng'}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Target Description */}
                  <p className="text-xs text-slate-600 dark:text-slate-300 font-medium bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/80 mb-3">
                    🎯 {cls.target_description}
                  </p>

                  {/* Class Health Badges */}
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
                        className="flex items-center gap-1.5 p-1.5 bg-slate-50 hover:bg-emerald-50 dark:bg-slate-800/40 dark:hover:bg-slate-800 rounded-lg text-[11px] font-bold text-slate-600 dark:text-slate-300 transition-colors"
                      >
                        <Users className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Sĩ số: <strong>{activeStudentsCount} HS</strong></span>
                      </button>
                      <button
                        onClick={() => {
                          setViewingClassDetails(cls);
                          setDetailSubTab('sessions');
                        }}
                        className="flex items-center gap-1.5 p-1.5 bg-slate-50 hover:bg-emerald-50 dark:bg-slate-800/40 dark:hover:bg-slate-800 rounded-lg text-[11px] font-bold text-slate-600 dark:text-slate-300 transition-colors"
                      >
                        <Clock className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Đã dạy: <strong>{sessionsCount} buổi</strong></span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Actions Footer */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                  <button
                    onClick={() => onSelectClassForGradeEntry(cls.id!)}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>Nhập điểm Lớp</span>
                  </button>

                  <div className="flex items-center gap-1">
                    {cls.status === 'active' && (
                      <button
                        onClick={() => {
                          if (!isAdmin) {
                            alert('Chỉ Admin (Giáo viên chính) mới có quyền chuyển khối lên lớp!');
                            return;
                          }
                          handleStartPromoting(cls);
                        }}
                        className={`px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 ${
                          isAdmin
                            ? 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 hover:bg-sky-100'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                        }`}
                        title={isAdmin ? 'Chuyển khối / Lên lớp tự động' : 'Khóa với quyền Trợ giảng'}
                      >
                        <ArrowUpRight className="w-3.5 h-3.5" />
                        <span>Lên Lớp</span>
                      </button>
                    )}

                    <button
                      onClick={() => {
                        if (!isAdmin) {
                          alert('Chỉ Admin (Giáo viên chính) mới có quyền thay đổi trạng thái lưu trữ lớp!');
                          return;
                        }
                        handleArchiveClass(cls);
                      }}
                      className={`p-1.5 rounded-xl ${
                        isAdmin
                          ? 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                          : 'text-slate-300 dark:text-slate-700 cursor-not-allowed'
                      }`}
                      title={isAdmin ? (cls.status === 'active' ? 'Lưu trữ lớp này' : 'Khôi phục hoạt động') : 'Khóa với quyền Trợ giảng'}
                    >
                      <Archive className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {editingClass ? 'Sửa Thông Tin Lớp Học' : 'Tạo Lớp Học Mới'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
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
                    <div className="mt-1.5 p-2 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl flex items-center gap-1.5 text-xs text-rose-700 dark:text-rose-300 font-bold animate-fadeIn">
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
                  className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
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
                <h3 className="text-base font-bold">Xác Nhận Xóa Vĩnh Viễn Lớp Học</h3>
                <p className="text-xs text-slate-500">Thao tác này KHÔNG THỂ KHÔI PHỤC!</p>
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
                className="px-4 py-2 bg-rose-600 text-white rounded-xl text-xs font-bold hover:bg-rose-700 disabled:opacity-50"
              >
                Xóa Vĩnh Viễn
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
                <div className="mt-1.5 p-2 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl flex items-center gap-1.5 text-xs text-rose-700 dark:text-rose-300 font-bold animate-fadeIn">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>Đã tồn tại lớp học trùng tên này trong hệ thống! Vui lòng đổi tên khác.</span>
                </div>
              )}
              <p className="text-[10px] text-slate-400">
                *Hệ thống tự động đề xuất tăng tên lớp lên +1 đơn vị. Thầy cô có thể tự do chỉnh sửa lại.
              </p>
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
                className="px-4 py-2 bg-sky-600 text-white rounded-xl text-xs font-bold hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Xác Nhận Lên Lớp
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Viewing Class Details Modal */}
      {viewingClassDetails && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-4xl w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
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
                  Chi Tiết Lớp Học: {viewingClassDetails.class_name}
                </h3>
                <p className="text-[11px] text-slate-500">
                  Trợ giảng phụ trách: <strong>{viewingClassDetails.assistant_name}</strong> ({viewingClassDetails.assistant_phone || 'Chưa có SĐT'})
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleExportRosterExcel(viewingClassDetails)}
                  className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm"
                  title="Xuất danh sách sĩ số ra Excel"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Xuất Excel</span>
                </button>
                <button
                  onClick={() => setViewingClassDetails(null)}
                  className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Sub-tabs inside Detail Modal */}
            <div className="flex border-b border-slate-200 dark:border-slate-800">
              <button
                onClick={() => setDetailSubTab('roster')}
                className={`flex-1 pb-2.5 text-xs font-bold text-center border-b-2 transition-all flex items-center justify-center gap-1.5 ${
                  detailSubTab === 'roster'
                    ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <Users className="w-4 h-4" />
                <span>
                  Danh Sách Sĩ Số ({
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
                className={`flex-1 pb-2.5 text-xs font-bold text-center border-b-2 transition-all flex items-center justify-center gap-1.5 ${
                  detailSubTab === 'sessions'
                    ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <Clock className="w-4 h-4" />
                <span>Nhật Ký &amp; Kết Quả Buổi Học ({sessions.filter((s) => String(s.class_id) === String(viewingClassDetails.id)).length})</span>
              </button>
            </div>

            {/* Sub-tab 1 Content: Class Roster */}
            {detailSubTab === 'roster' && (
              <div className="space-y-3">
                {/* Roster Filter Status */}
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                    <button
                      onClick={() => setRosterFilterStatus('active')}
                      className={`px-3 py-1 rounded-lg font-bold text-[11px] ${
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
                      className={`px-3 py-1 rounded-lg font-bold text-[11px] ${
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
                      className={`px-3 py-1 rounded-lg font-bold text-[11px] ${
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
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-bold uppercase text-[10px]">
                        <th className="py-2.5 px-3">STT</th>
                        <th className="py-2.5 px-3">Học Sinh</th>
                        <th className="py-2.5 px-3">Giới Tính</th>
                        <th className="py-2.5 px-3">Phụ Huynh</th>
                        <th className="py-2.5 px-3">SĐT Phụ Huynh</th>
                        <th className="py-2.5 px-3">Trạng Thái</th>
                        {isAdmin && <th className="py-2.5 px-3 text-right">Thao Tác</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-slate-700 dark:text-slate-300">
                      {(() => {
                        const classStudLinks = classStudents.filter((cs) => {
                          if (String(cs.class_id) !== String(viewingClassDetails.id)) return false;
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
                              <td colSpan={7} className="py-8 text-center text-slate-400 italic">
                                Không có học sinh nào trong danh mục này.
                              </td>
                            </tr>
                          );
                        }

                        return classStudLinks.map((link, idx) => {
                          const st = students.find((s) => String(s.id) === String(link.student_id));
                          if (!st) return null;
                          const isCurrentlyActive = !link.leave_date;

                          return (
                            <tr key={link.id ? `${link.id}-${idx}` : idx} className={`hover:bg-slate-50 dark:hover:bg-slate-800/30 ${!isCurrentlyActive ? 'opacity-60 bg-slate-50/40 dark:bg-slate-900/40' : ''}`}>
                              <td className="py-3 px-3 font-mono text-slate-400">{idx + 1}</td>
                              <td className="py-3 px-3 font-bold text-slate-900 dark:text-slate-100">
                                {st.full_name}
                                {!isCurrentlyActive && (
                                  <span className="ml-1.5 text-[10px] text-rose-500 font-bold">(Đã rút)</span>
                                )}
                              </td>
                              <td className="py-3 px-3 text-slate-500">{st.gender}</td>
                              <td className="py-3 px-3">{st.parent_name}</td>
                              <td className="py-3 px-3 font-medium text-emerald-600 dark:text-emerald-400">{st.parent_phone}</td>
                              <td className="py-3 px-3">
                                {isCurrentlyActive ? (
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                                    st.status === 'studying'
                                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                                      : st.status === 'paused'
                                      ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40'
                                      : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40'
                                  }`}>
                                    {st.status === 'studying' ? 'Đang Học' : st.status === 'paused' ? 'Tạm Nghỉ' : 'Nghỉ Hẳn'}
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                                    Rút ngày {link.leave_date}
                                  </span>
                                )}
                              </td>
                              {isAdmin && (
                                <td className="py-3 px-3 text-right space-x-2.5">
                                  {isCurrentlyActive ? (
                                    <button
                                      onClick={async () => {
                                        if (confirm(`Bạn có chắc chắn muốn cho học sinh ${st.full_name} rút lui an toàn khỏi lớp ${viewingClassDetails.class_name}?\nDữ liệu lịch sử điểm số cũ vẫn được bảo lưu đầy đủ.`)) {
                                          const todayStr = new Date().toISOString().split('T')[0];
                                          await db.class_students.update(link.id!, { leave_date: todayStr });
                                          await logAudit(currentRole as UserRole, 'Cho học sinh rút lui', `Cho học sinh ${st.full_name} rút lui an toàn khỏi lớp ${viewingClassDetails.class_name}`);
                                          onRefresh();
                                        }
                                      }}
                                      className="text-amber-500 hover:text-amber-700 font-bold hover:underline text-[11px]"
                                    >
                                      Rút lui
                                    </button>
                                  ) : (
                                    <button
                                      onClick={async () => {
                                        if (confirm(`Khôi phục học sinh ${st.full_name} quay lại tham gia học lớp ${viewingClassDetails.class_name}?`)) {
                                          await db.class_students.update(link.id!, {
                                            leave_date: undefined,
                                            join_date: new Date().toISOString().split('T')[0]
                                          });
                                          await logAudit(currentRole as UserRole, 'Khôi phục học sinh', `Khôi phục ${st.full_name} tham gia học lại lớp ${viewingClassDetails.class_name}`);
                                          onRefresh();
                                        }
                                      }}
                                      className="text-emerald-500 hover:text-emerald-700 font-bold hover:underline text-[11px]"
                                    >
                                      Học lại
                                    </button>
                                  )}
                                  <button
                                    onClick={async () => {
                                      if (confirm(`Bạn có chắc chắn muốn xóa học sinh ${st.full_name} khỏi lớp ${viewingClassDetails.class_name}? Các dữ liệu điểm số vẫn được bảo lưu nhưng học sinh sẽ không còn thuộc sĩ số lớp này.`)) {
                                        await db.class_students.delete(link.id!);
                                        await logAudit(currentRole as UserRole, 'Xóa học sinh khỏi lớp', `Xóa ${st.full_name} khỏi lớp ${viewingClassDetails.class_name}`);
                                        onRefresh();
                                      }
                                    }}
                                    className="text-rose-500 hover:text-rose-700 font-bold hover:underline"
                                  >
                                    Xóa
                                  </button>
                                </td>
                              )}
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
                      
                      <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-1">
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
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteSession(sess);
                                    }}
                                    className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-950/80 text-rose-600 dark:text-rose-300 border border-rose-200 dark:border-rose-800 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 shadow-sm"
                                    title="Xóa vĩnh viễn buổi học này và toàn bộ dữ liệu điểm liên quan"
                                  >
                                    <Trash2 className="w-3 h-3 text-rose-500" />
                                    <span>Xóa buổi học này</span>
                                  </button>
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
                className="px-4 py-2 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 rounded-xl text-xs font-bold shadow"
              >
                Đóng chi tiết
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
