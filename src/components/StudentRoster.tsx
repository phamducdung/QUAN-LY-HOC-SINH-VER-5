import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Student, StudentStatus, ClassItem, StudentSession, Session, Warning } from '../types';
import { db, deleteStudent } from '../db/dexie';
import { sortStudentsByName } from '../utils/sortUtils';
import { StudentPerformanceTrend } from './student/StudentPerformanceTrend';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import {
  Users,
  Plus,
  Search,
  Phone,
  UserCheck,
  Edit,
  Trash2,
  X,
  FileText,
  Clock,
  TrendingUp,
  AlertTriangle,
  User,
  Lock,
  Sparkles,
  Brain,
  CheckSquare,
  Square,
  AlertCircle,
  Award,
  Activity,
  Copy,
  Filter,
  GraduationCap,
} from 'lucide-react';
import { UserRole } from '../types';

interface StudentRosterProps {
  students: Student[];
  classes: ClassItem[];
  currentRole?: UserRole;
  onRefresh: () => void;
  isLoadingData?: boolean;
}

export const StudentRoster: React.FC<StudentRosterProps> = ({
  students,
  classes,
  currentRole = 'Teacher',
  onRefresh,
  isLoadingData = false,
}) => {
  const isAdmin = currentRole === 'Teacher';
  const [statusFilter, setStatusFilter] = useState<StudentStatus | 'all'>('studying');
  const [searchQuery, setSearchQuery] = useState('');

  // Live queries for reactive data
  const classStudents = useLiveQuery(() => db.class_students.toArray()) || [];
  const knowledgeTags = useLiveQuery(() => db.knowledge_tags.toArray()) || [];

  // Add / Edit Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);

  // Form Inputs
  const [fullName, setFullName] = useState('');
  const [gender, setGender] = useState<'Nam' | 'Nữ'>('Nam');
  const [parentName, setParentName] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [statusInput, setStatusInput] = useState<StudentStatus>('studying');
  const [leaveReason, setLeaveReason] = useState('');
  const [note, setNote] = useState('');
  const [enrollClassIds, setEnrollClassIds] = useState<string[]>([]);

  // Student Profile Drawer
  const [viewingStudent, setViewingStudent] = useState<Student | null>(null);
  const [activeTab, setActiveTab] = useState<'performance' | 'gaps' | 'classes' | 'warnings'>('performance');
  const [studentSessionsRaw, setStudentSessionsRaw] = useState<StudentSession[]>([]);
  const [studentSessionsList, setStudentSessionsList] = useState<Session[]>([]);
  const [selectedProfileClassId, setSelectedProfileClassId] = useState<number | 'all'>('all');

  // Quick resolution states within student profile
  const [resolvingWarningId, setResolvingWarningId] = useState<string | null>(null);
  const [actionChoiceProfile, setActionChoiceProfile] = useState('Đã gọi điện cho Phụ huynh trao đổi tình hình');
  const [actionNotesProfile, setActionNotesProfile] = useState('');
  const [isResolvingProfile, setIsResolvingProfile] = useState(false);

  // Transfer class states
  const [transferFromClassId, setTransferFromClassId] = useState<number | ''>('');
  const [transferToClassId, setTransferToClassId] = useState<number | ''>('');

  // Dynamically calculate performance history based on class filter
  const studentPerformanceHistory = useMemo(() => {
    if (!viewingStudent) return [];

    const filteredRaw = selectedProfileClassId === 'all'
      ? studentSessionsRaw
      : studentSessionsRaw.filter(ss => {
          const sess = studentSessionsList.find(s => s.id === ss.session_id);
          return sess && sess.class_id === selectedProfileClassId;
        });

    const sortedSessList = [...studentSessionsList].sort((a, b) => a.session_date.localeCompare(b.session_date));

    return filteredRaw
      .map((ss) => {
        const sess = sortedSessList.find((s) => s.id === ss.session_id);
        return {
          session_id: ss.session_id,
          class_id: sess ? sess.class_id : undefined,
          date: sess ? sess.session_date : '',
          title: sess ? sess.lesson_title : '',
          hwScore: (ss.exempt || ss.exempt_homework || ss.homework_submitted === false || ss.late_submit) ? null : ss.homework_score,
          testScore: (ss.exempt || ss.exempt_test) ? null : ss.test_score,
        };
      })
      .filter(item => item.date !== '')
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((item, idx) => ({
        session: `Buổi ${idx + 1}`,
        sessionFullName: item.title,
        date: item.date,
        hwScore: item.hwScore,
        testScore: item.testScore,
      }));
  }, [viewingStudent, studentSessionsRaw, studentSessionsList, selectedProfileClassId]);

  // Dynamically calculate topic averages based on class filter
  const topicAverages = useMemo(() => {
    if (!viewingStudent) return [];

    const topicGroupMap: { [tagName: string]: { sum: number; count: number; category: string } } = {};

    const filteredRaw = selectedProfileClassId === 'all'
      ? studentSessionsRaw
      : studentSessionsRaw.filter(ss => {
          const sess = studentSessionsList.find(s => s.id === ss.session_id);
          return sess && sess.class_id === selectedProfileClassId;
        });

    filteredRaw.forEach((ss) => {
      if (ss.exempt) return;
      const sess = studentSessionsList.find((s) => s.id === ss.session_id);
      if (!sess) return;

      let topicName = '';
      let category = 'Algebra';

      if (sess.knowledge_tag_id) {
        const tag = knowledgeTags.find(t => t.id === sess.knowledge_tag_id);
        if (tag) {
          topicName = tag.tag_name;
          category = tag.category;
        }
      }

      if (!topicName) {
        topicName = sess.test_knowledge_tag && sess.test_knowledge_tag !== 'same' ? sess.test_knowledge_tag : '';
      }

      if (!topicName) {
        const title = sess?.lesson_title || '';
        topicName = title.includes(' - ') ? title.split(' - ').slice(-1)[0] : 'Đại số & Hình học';
      }

      const lowerTopic = topicName.toLowerCase();
      if (lowerTopic.includes('hình') || lowerTopic.includes('tứ giác') || lowerTopic.includes('đường tròn') || lowerTopic.includes('hệ thức lượng')) {
        category = 'Geometry';
      }

      const hasValidTest = typeof ss.test_score === 'number' && ss.test_score >= 0;
      const hasValidHw = !(ss.exempt || ss.exempt_homework) && typeof ss.homework_score === 'number' && ss.homework_score >= 0;

      if (!hasValidTest && !hasValidHw) {
        return;
      }

      const score = hasValidTest ? ss.test_score : ss.homework_score;

      if (!topicGroupMap[topicName]) {
        topicGroupMap[topicName] = { sum: 0, count: 0, category };
      }
      topicGroupMap[topicName].sum += score;
      topicGroupMap[topicName].count += 1;
    });

    return Object.entries(topicGroupMap).map(([name, data]) => ({
      topic: name,
      category: data.category === 'Algebra' ? 'Đại số' : 'Hình học',
      avgScore: parseFloat((data.sum / data.count).toFixed(1)),
    }));
  }, [viewingStudent, studentSessionsRaw, studentSessionsList, selectedProfileClassId, knowledgeTags]);

  // AI Diagnostics State
  const [aiDiagnosis, setAiDiagnosis] = useState<any | null>(null);
  const [isLoadingAi, setIsLoadingAi] = useState<boolean>(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [studentWarnings, setStudentWarnings] = useState<Warning[]>([]);

  // Grade & Class Filters State
  const [gradeFilter, setGradeFilter] = useState<string>('all'); // 'all', '6', '7', '8', '9'
  const [classFilter, setClassFilter] = useState<string>('all'); // 'all' or class.id

  const availableClassesForFilter = useMemo(() => {
    const validClasses = (classes || []).filter(
      (c) => c && c.id && typeof c.class_name === 'string' && c.class_name.trim() !== ''
    );
    if (gradeFilter === 'all') return validClasses;
    const gNum = Number(gradeFilter);
    return validClasses.filter((c) => Number(c.grade_level) === gNum);
  }, [classes, gradeFilter]);

  const handleGradeFilterChange = (newGrade: string) => {
    setGradeFilter(newGrade);
    if (newGrade !== 'all' && classFilter !== 'all') {
      const cls = classes.find((c) => String(c.id) === classFilter);
      if (cls && Number(cls.grade_level) !== Number(newGrade)) {
        setClassFilter('all');
      }
    }
  };

  const filteredStudents = useMemo(() => {
    const list = students.filter((s) => {
      // 1. Status Filter
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;

      // Find student enrolled class IDs
      const studentClassIds = classStudents
        .filter((cs) => String(cs.student_id) === String(s.id))
        .map((cs) => String(cs.class_id));

      // 2. Class Filter
      if (classFilter !== 'all') {
        if (!studentClassIds.includes(String(classFilter))) return false;
      }

      // 3. Grade Filter
      if (gradeFilter !== 'all') {
        const targetGrade = Number(gradeFilter);
        const isMatchGrade = studentClassIds.some((cid) => {
          const cls = classes.find((c) => String(c.id) === cid);
          return cls && Number(cls.grade_level) === targetGrade;
        });
        if (!isMatchGrade) return false;
      }

      // 4. Search Query
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchName = s.full_name.toLowerCase().includes(q);
        const matchPhone = s.parent_phone?.toLowerCase().includes(q);
        return matchName || matchPhone;
      }

      return true;
    });
    return sortStudentsByName(list);
  }, [students, statusFilter, gradeFilter, classFilter, searchQuery, classStudents, classes]);

  // Check Duplicate Student Name
  const duplicateStudent = useMemo(() => {
    const normName = (fullName || '').trim().toLowerCase();
    if (!normName) return null;

    return (students || []).find((s) => {
      if (editingStudent && String(s.id) === String(editingStudent.id)) {
        return false;
      }
      return (s.full_name || '').trim().toLowerCase() === normName;
    }) || null;
  }, [fullName, students, editingStudent]);

  const duplicateStudentClasses = useMemo(() => {
    if (!duplicateStudent) return [];
    const activeMemberships = classStudents.filter(
      (cs) => String(cs.student_id) === String(duplicateStudent.id) && !cs.leave_date
    );
    return activeMemberships
      .map((cs) => {
        const cls = (classes || []).find((c) => String(c.id) === String(cs.class_id));
        return cls ? `${cls.class_name}${cls.grade_level ? ` (Khối ${cls.grade_level})` : ''}` : null;
      })
      .filter((name): name is string => name !== null);
  }, [duplicateStudent, classStudents, classes]);

  const handleOpenAddModal = () => {
    setEditingStudent(null);
    setFullName('');
    setGender('Nam');
    setParentName('');
    setParentPhone('');
    setStatusInput('studying');
    setLeaveReason('');
    setNote('');
    setEnrollClassIds([]);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (st: Student) => {
    setEditingStudent(st);
    setFullName(st.full_name);
    setGender(st.gender);
    setParentName(st.parent_name);
    setParentPhone(st.parent_phone);
    setStatusInput(st.status);
    setLeaveReason(st.leave_reason || '');
    setNote(st.note || '');
    setIsModalOpen(true);
  };

  const handleSaveStudent = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!(fullName || '').trim()) return;

    const now = new Date().toISOString();

    if (editingStudent) {
      const updatePayload = {
        full_name: fullName,
        gender: gender,
        parent_name: parentName,
        parent_phone: parentPhone,
        status: statusInput,
        leave_reason: leaveReason,
        note: note,
        updated_at: now,
      };
      await db.students.update(editingStudent.id!, updatePayload);
    } else {
      const addPayload = {
        full_name: fullName,
        gender: gender,
        parent_name: parentName,
        parent_phone: parentPhone,
        status: statusInput,
        leave_reason: leaveReason,
        note: note,
        created_at: now,
        updated_at: now,
      };
      const studentId = await db.students.add(addPayload);

      // Ghi danh vào các lớp học đã chọn
      const todayStr = now.split('T')[0];
      for (const classId of enrollClassIds) {
        const csPayload = {
          class_id: classId,
          student_id: studentId,
          join_date: todayStr,
          created_at: now
        };
        await db.class_students.add(csPayload);
      }
      
      await db.audit_logs.add({
        user_role: currentRole as any,
        action_type: 'Edit',
        description: `Thêm mới học sinh ${fullName} và ghi danh vào ${enrollClassIds.length} lớp`,
        timestamp: now
      });
    }

    setIsModalOpen(false);
    onRefresh();
  };

  const handleOpenStudentDrawer = async (st: Student) => {
    setViewingStudent(st);
    setActiveTab('performance');
    setAiDiagnosis(null);
    setAiError(null);
    setIsLoadingAi(false);
    setSelectedProfileClassId('all');
    setTransferFromClassId('');
    setTransferToClassId('');

    // Fetch student sessions with type-safe string comparison
    const stIdStr = String(st.id);
    const allStudSessions = await db.student_sessions.toArray();
    const studSessions = allStudSessions.filter((ss) => String(ss.student_id) === stIdStr);
    setStudentSessionsRaw(studSessions);

    // Fetch corresponding session details
    const sessionIds = new Set(studSessions.map((ss) => String(ss.session_id)));
    const allSessions = await db.sessions.toArray();
    const sessList = allSessions.filter((s) => sessionIds.has(String(s.id)));
    // Sort sessions by date
    sessList.sort((a, b) => (a.session_date || '').localeCompare(b.session_date || ''));
    setStudentSessionsList(sessList);

    // Fetch or load the last saved AI Diagnosis for this student
    const allDiags = await db.ai_diagnoses.toArray();
    const savedDiag = allDiags.filter((d) => String(d.student_id) === stIdStr);
    if (savedDiag.length > 0) {
      savedDiag.sort((a, b) => String(b.id || '').localeCompare(String(a.id || '')));
      setAiDiagnosis(savedDiag[0].diagnosis_json);
    }

    // Fetch student's warnings
    const allWarns = await db.warnings.toArray();
    const warns = allWarns.filter((w) => String(w.student_id) === stIdStr);
    setStudentWarnings(warns);
  };

  const handleTriggerAiDiagnosis = async () => {
    if (!viewingStudent) return;
    setIsLoadingAi(true);
    setAiError(null);

    try {
      // 1. Fetch user's Gemini API Key from settings table
      const settingsList = await db.settings.toArray();
      const userApiKey = settingsList.length > 0 ? settingsList[0].gemini_api_key : '';

      // 2. Prepare payload
      const recentSessions = studentPerformanceHistory.slice(-5).map(item => ({
        lesson: item.sessionFullName || item.session,
        homeworkScore: item.hwScore,
        testScore: item.testScore,
      }));

      const knowledgeScores = topicAverages.map(item => ({
        topic: item.topic,
        averageScore: item.avgScore,
      }));

      let gradeLevel = '9';
      let targetScore = viewingStudent.note || 'Thi vào Lớp 10 Công lập 8.0+';

      const memberships = await db.class_students.where('student_id').equals(viewingStudent.id!).toArray();
      if (memberships.length > 0) {
        const cls = await db.classes.get(memberships[0].class_id);
        if (cls) {
          gradeLevel = String(cls.grade_level);
          if (cls.target_description) {
            targetScore = cls.target_description;
          }
        }
      }

      // 3. Post to endpoint
      const response = await fetch('/api/ai-diagnose', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          studentName: viewingStudent.full_name,
          gradeLevel,
          targetScore,
          recentSessions,
          knowledgeScores,
          userApiKey,
        }),
      });

      if (!response.ok) {
        const errJson = await response.json();
        throw new Error(errJson.error || 'Lỗi hệ thống khi phân tích AI');
      }

      const resData = await response.json();
      setAiDiagnosis(resData);

      // Save to diagnoses database
      await db.ai_diagnoses.add({
        student_id: viewingStudent.id!,
        diagnosis_json: resData,
        created_at: new Date().toISOString(),
      });

    } catch (err: any) {
      console.error('AI diagnosis failed:', err);
      setAiError(err.message || 'Đã có lỗi xảy ra khi thực hiện chẩn đoán AI.');
    } finally {
      setIsLoadingAi(false);
    }
  };

  return (
    <div id="student-roster-view" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            Hồ Sơ & Danh Sách Học Sinh
          </h2>
          <p className="text-xs text-slate-500">
            Quản lý lý lịch, nguyên nhân tạm nghỉ/nghỉ hẳn và lịch sử phong độ thi cử.
          </p>
        </div>

        <button
          onClick={() => {
            if (!isAdmin && currentRole !== 'TA') {
              alert('Chỉ Giáo viên chính hoặc Trợ giảng (TA) mới có quyền thêm học sinh mới!');
              return;
            }
            handleOpenAddModal();
          }}
          className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-md shrink-0 ${
            (isAdmin || currentRole === 'TA')
              ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-600/20'
              : 'bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-500 cursor-not-allowed'
          }`}
          title={(isAdmin || currentRole === 'TA') ? 'Thêm học sinh mới' : 'Chỉ Giáo viên hoặc Trợ giảng (TA) được thêm học sinh mới'}
        >
          {(isAdmin || currentRole === 'TA') ? <Plus className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
          <span>Thêm Học Sinh Mới</span>
        </button>
      </div>

      {/* Sticky Filter Bar & Filters */}
      <div className="sticky top-0 z-20 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-md pt-1 pb-3 border-b border-slate-200/80 dark:border-slate-800/80 space-y-2">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
          
          {/* Status Filter Pills */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl overflow-x-auto shrink-0">
            <button
              onClick={() => setStatusFilter('studying')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                statusFilter === 'studying'
                  ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Đang Học ({students.filter((s) => s.status === 'studying').length})
            </button>
            <button
              onClick={() => setStatusFilter('paused')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                statusFilter === 'paused'
                  ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Tạm Nghỉ ({students.filter((s) => s.status === 'paused').length})
            </button>
            <button
              onClick={() => setStatusFilter('stopped')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                statusFilter === 'stopped'
                  ? 'bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Nghỉ Hẳn ({students.filter((s) => s.status === 'stopped').length})
            </button>
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                statusFilter === 'all'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Tất Cả ({students.length})
            </button>
          </div>

          {/* Grade, Class & Search Filters */}
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap shrink-0">
            {/* Grade Filter */}
            <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300">
              <GraduationCap className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <select
                value={gradeFilter}
                onChange={(e) => handleGradeFilterChange(e.target.value)}
                className="bg-transparent font-bold text-xs text-slate-900 dark:text-slate-100 outline-none cursor-pointer"
              >
                <option value="all">Tất cả Khối (6-9)</option>
                <option value="6">Khối 6</option>
                <option value="7">Khối 7</option>
                <option value="8">Khối 8</option>
                <option value="9">Khối 9</option>
              </select>
            </div>

            {/* Class Filter */}
            <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300">
              <Filter className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
              <select
                value={classFilter}
                onChange={(e) => setClassFilter(e.target.value)}
                className="bg-transparent font-bold text-xs text-slate-900 dark:text-slate-100 outline-none cursor-pointer max-w-[160px] truncate"
              >
                <option value="all">Tất cả Lớp học ({availableClassesForFilter.length})</option>
                {availableClassesForFilter.map((c, idx) => {
                  const classNameClean = c.class_name?.trim() || `Lớp chưa đặt tên (#${String(c.id).slice(0, 4)})`;
                  const isArchived = c.status === 'archived';
                  return (
                    <option key={c.id ? `${c.id}-${idx}` : idx} value={c.id}>
                      Lớp {classNameClean} {isArchived ? '(Đã lưu trữ)' : ''}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Search */}
            <div className="relative w-full sm:w-48 lg:w-56">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm tên hoặc SĐT..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 pl-9 pr-3 py-2 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Active Filters Summary & Count */}
        <div className="flex items-center justify-between px-2 pt-1 text-[11px] text-slate-500 dark:text-slate-400 font-medium">
          <div>
            Hiển thị <strong className="text-emerald-600 dark:text-emerald-400 font-extrabold">{filteredStudents.length}</strong> / {students.length} học sinh
            {(gradeFilter !== 'all' || classFilter !== 'all' || searchQuery) && (
              <span className="ml-1 text-slate-400 font-normal">(Đã lọc)</span>
            )}
          </div>
          {(gradeFilter !== 'all' || classFilter !== 'all' || searchQuery || statusFilter !== 'studying') && (
            <button
              onClick={() => {
                setGradeFilter('all');
                setClassFilter('all');
                setSearchQuery('');
                setStatusFilter('studying');
              }}
              className="text-emerald-600 dark:text-emerald-400 hover:underline font-bold text-[11px]"
            >
              Xóa bộ lọc
            </button>
          )}
        </div>
      </div>

      {/* Student List Grid (Scrollable Container) */}
      <div className="max-h-[calc(100vh-270px)] min-h-[350px] overflow-y-auto pr-1 pb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {isLoadingData ? (
            Array.from({ length: 6 }).map((_, idx) => (
              <div key={idx} className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 animate-pulse space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-800" />
                  <div className="space-y-1.5 flex-1">
                    <div className="h-4 w-28 bg-slate-200 dark:bg-slate-800 rounded" />
                    <div className="h-3 w-16 bg-slate-200 dark:bg-slate-800 rounded" />
                  </div>
                </div>
                <div className="h-3 w-3/4 bg-slate-200 dark:bg-slate-800 rounded" />
                <div className="h-3 w-1/2 bg-slate-200 dark:bg-slate-800 rounded" />
              </div>
            ))
          ) : students.length === 0 ? (
            <div className="col-span-full p-10 text-center bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 space-y-3">
              <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  Chưa có dữ liệu học sinh trong hệ thống
                </p>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                  Hệ thống hiện tại chưa ghi nhận học sinh nào. Bạn có thể thêm học sinh mới hoặc kiểm tra lại kết nối đồng bộ Cloud.
                </p>
              </div>
              {(isAdmin || currentRole === 'TA') && (
                <button
                  onClick={handleOpenAddModal}
                  className="px-4 py-2 bg-emerald-600 text-white hover:bg-emerald-700 text-xs font-bold rounded-xl shadow-xs transition-all inline-flex items-center gap-2 mt-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>Thêm Học Sinh Mới</span>
                </button>
              )}
            </div>
          ) : filteredStudents.length === 0 ? (
            <div className="col-span-full p-8 text-center bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 space-y-3">
              <div className="w-10 h-10 mx-auto rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                <Search className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Không tìm thấy học sinh nào phù hợp với bộ lọc
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Đang lọc theo: {statusFilter !== 'all' ? `Trạng thái (${statusFilter})` : ''} {gradeFilter !== 'all' ? `Khối ${gradeFilter}` : ''} {classFilter !== 'all' ? `Lớp selected` : ''} {searchQuery ? `Từ khóa "${searchQuery}"` : ''}
                </p>
              </div>
              <button
                onClick={() => {
                  setGradeFilter('all');
                  setClassFilter('all');
                  setSearchQuery('');
                  setStatusFilter('all');
                }}
                className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 text-xs font-bold rounded-xl transition-all"
              >
                Xóa tất cả bộ lọc
              </button>
            </div>
          ) : (
            filteredStudents.map((st, idx) => (
              <div
                key={st.id ? `${st.id}-${idx}` : idx}
                className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-bold flex items-center justify-center text-xs">
                        {(st.full_name || '?').slice(-1)}
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                          {st.full_name || 'Học sinh'}
                        </h3>
                        <p className="text-[10px] text-slate-400">Giới tính: {st.gender}</p>
                      </div>
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                        st.status === 'studying'
                          ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-800'
                          : st.status === 'paused'
                          ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 border border-amber-300 dark:border-amber-800'
                          : 'bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200 border border-rose-300 dark:border-rose-800'
                      }`}
                    >
                      {st.status === 'studying'
                        ? 'Đang Học'
                        : st.status === 'paused'
                        ? 'Tạm Nghỉ'
                        : 'Nghỉ Hẳn'}
                    </span>
                  </div>

                  <div className="text-xs text-slate-700 dark:text-slate-200 space-y-1.5 my-3 bg-slate-50 dark:bg-slate-800/80 p-3 rounded-xl border border-slate-100 dark:border-slate-750">
                    <p>Phụ huynh: <strong className="text-slate-900 dark:text-slate-100">{st.parent_name}</strong></p>
                    <p>SĐT Liên hệ: <strong className="font-num text-emerald-700 dark:text-emerald-400 font-bold">{st.parent_phone}</strong></p>
                    <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                      <span className="text-slate-500 dark:text-slate-400">Lớp:</span>
                      {(() => {
                        const enrolled = classStudents
                          .filter((cs) => cs.student_id === st.id)
                          .map((cs) => classes.find((c) => c.id === cs.class_id))
                          .filter((c): c is ClassItem => !!c);
                        if (enrolled.length === 0) {
                          return <span className="text-rose-600 dark:text-rose-400 font-bold text-[10px]">Chưa xếp lớp</span>;
                        }
                        return enrolled.map((c, cIdx) => (
                          <span
                            key={c.id ? `${c.id}-${cIdx}` : cIdx}
                            className="px-2 py-0.5 bg-blue-50 dark:bg-blue-950/70 text-blue-800 dark:text-blue-200 border border-blue-200 dark:border-blue-800 rounded font-bold text-[10px]"
                          >
                            {c.class_name.split(' - ')[0]}
                          </span>
                        ));
                      })()}
                    </div>
                    {st.leave_reason && (
                      <p className="text-rose-700 dark:text-rose-400 font-medium pt-0.5">Lý do nghỉ: {st.leave_reason}</p>
                    )}
                    {st.note && <p className="text-slate-500 dark:text-slate-400 italic pt-0.5">Ghi chú: {st.note}</p>}
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <button
                    onClick={() => handleOpenStudentDrawer(st)}
                    className="px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 rounded-xl text-xs font-bold flex items-center gap-1"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Xem Hồ Sơ Phong Độ</span>
                  </button>

                  <button
                    onClick={() => handleOpenEditModal(st)}
                    className="p-1.5 text-slate-400 hover:text-emerald-600 rounded-lg hover:bg-slate-100"
                    title="Sửa thông tin"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {editingStudent ? 'Sửa Hồ Sơ Học Sinh' : 'Thêm Học Sinh Mới'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="p-1 text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveStudent} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Họ và Tên Học Sinh
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="VD: Phạm Quốc Đạt"
                    className={`w-full text-xs bg-slate-50 dark:bg-slate-800 border p-2.5 rounded-xl outline-none transition-all ${
                      duplicateStudent
                        ? 'border-amber-400 text-slate-900 dark:text-slate-100 bg-amber-50/40 dark:bg-amber-950/20 focus:border-amber-500'
                        : 'border-slate-200 dark:border-slate-700 focus:border-emerald-500'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Giới Tính
                  </label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value as any)}
                    className="w-full text-xs bg-slate-50 dark:bg-slate-800 border p-2.5 rounded-xl outline-none"
                  >
                    <option value="Nam">Nam</option>
                    <option value="Nữ">Nữ</option>
                  </select>
                </div>
              </div>

              {duplicateStudent && (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-200 animate-fadeIn">
                  <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-extrabold text-amber-800 dark:text-amber-300">
                      💡 LƯU Ý: Phát hiện học sinh trùng họ và tên!
                    </p>
                    <p>
                      Đã có học sinh <strong className="underline decoration-amber-400 font-bold">{duplicateStudent.full_name}</strong> trong cơ sở dữ liệu.
                    </p>
                    <p className="text-[11px] font-bold text-amber-800 dark:text-amber-300">
                      📍 Đang học tại: <span className="bg-amber-100 dark:bg-amber-900/60 px-1.5 py-0.5 rounded text-amber-950 dark:text-amber-100 font-extrabold">{duplicateStudentClasses.length > 0 ? duplicateStudentClasses.join(', ') : 'Chưa tham gia lớp nào (hoặc đã dừng học)'}</span>
                    </p>
                    {duplicateStudent.parent_phone && (
                      <p className="text-[11px] text-amber-700 dark:text-amber-400">
                        📞 PH đã có: {duplicateStudent.parent_name || 'Phụ huynh'} ({duplicateStudent.parent_phone})
                      </p>
                    )}
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 italic pt-0.5">
                      * Nếu đây là học sinh khác trùng tên, Thầy/Cô vẫn có thể tiếp tục nhấn "Lưu Học Sinh" bình thường.
                    </p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Họ Tên Phụ Huynh
                  </label>
                  <input
                    type="text"
                    required
                    value={parentName}
                    onChange={(e) => setParentName(e.target.value)}
                    placeholder="VD: Phạm Văn Nam"
                    className="w-full text-xs bg-slate-50 dark:bg-slate-800 border p-2.5 rounded-xl outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    SĐT Phụ Huynh
                  </label>
                  <input
                    type="text"
                    required
                    value={parentPhone}
                    onChange={(e) => setParentPhone(e.target.value)}
                    placeholder="VD: 0912 345 678"
                    className="w-full text-xs bg-slate-50 dark:bg-slate-800 border p-2.5 rounded-xl outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Trạng Thái Học
                  </label>
                  <select
                    value={statusInput}
                    onChange={(e) => setStatusInput(e.target.value as StudentStatus)}
                    className="w-full text-xs bg-slate-50 dark:bg-slate-800 border p-2.5 rounded-xl outline-none"
                  >
                    <option value="studying">Đang Học</option>
                    <option value="paused">Tạm Nghỉ</option>
                    <option value="stopped">Nghỉ Hẳn</option>
                  </select>
                </div>

                {statusInput !== 'studying' && (
                  <div>
                    <label className="block text-xs font-bold text-rose-600 mb-1">
                      Nguyên Nhân Nghỉ Học
                    </label>
                    <input
                      type="text"
                      value={leaveReason}
                      onChange={(e) => setLeaveReason(e.target.value)}
                      placeholder="VD: Trùng lịch học, Đã đạt mục tiêu..."
                      className="w-full text-xs bg-rose-50 border border-rose-200 p-2.5 rounded-xl outline-none"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Ghi Chú Học Sinh
                </label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="VD: Học sinh giỏi, mục tiêu chuyên Toán"
                  className="w-full text-xs bg-slate-50 dark:bg-slate-800 border p-2.5 rounded-xl outline-none"
                />
              </div>

              {!editingStudent && (
                <div className="pt-2">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                    Xếp Vào Lớp Học (Có thể chọn nhiều)
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto p-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                    {classes.filter(c => c.status === 'active').length === 0 ? (
                      <p className="text-xs text-slate-500 italic col-span-2">Chưa có lớp học nào đang hoạt động. Vui lòng tạo lớp học trước.</p>
                    ) : (
                      classes.filter(c => c.status === 'active').map((cls, idx) => {
                        const isSelected = enrollClassIds.includes(cls.id!);
                        return (
                          <label
                            key={cls.id ? `${cls.id}-${idx}` : idx}
                            className={`flex items-center gap-2.5 p-2 rounded-lg border cursor-pointer transition-colors ${
                              isSelected 
                                ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800/50' 
                                : 'bg-white border-slate-200 hover:border-emerald-200 dark:bg-slate-900 dark:border-slate-700'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setEnrollClassIds(prev => [...prev, cls.id!]);
                                } else {
                                  setEnrollClassIds(prev => prev.filter(id => id !== cls.id!));
                                }
                              }}
                              className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                            />
                            <div className="flex flex-col">
                              <span className={`text-xs font-bold ${isSelected ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-300'}`}>
                                {cls.class_name}
                              </span>
                              <span className="text-[10px] text-slate-500 font-medium">Khối {cls.grade_level}</span>
                            </div>
                          </label>
                        );
                      })
                    )}
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
                  disabled={!(fullName || '').trim()}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm cursor-pointer"
                >
                  Lưu Học Sinh
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Student Profile Drawer / Modal */}
      {viewingStudent && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-2xl w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-bold text-sm shadow-md shadow-emerald-600/10">
                  {(viewingStudent.full_name || '?').slice(-1)}
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Hồ Sơ Phong Độ: {viewingStudent.full_name || ''}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Phụ huynh: {viewingStudent.parent_name || 'N/A'}{viewingStudent.parent_phone ? ` (${viewingStudent.parent_phone})` : ''}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    if (confirm(`Bạn có chắc chắn muốn xóa học sinh ${viewingStudent.full_name}? Hành động này sẽ xóa toàn bộ dữ liệu liên quan và không thể khôi phục!`)) {
                      await deleteStudent(viewingStudent.id!);
                      setViewingStudent(null);
                      onRefresh();
                    }
                  }}
                  className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition-colors"
                  title="Xóa học sinh"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button onClick={() => setViewingStudent(null)} className="p-1 text-slate-400 hover:text-slate-600 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Class Filter if they have multiple classes */}
            {(() => {
              const enrolledClassIds = classStudents
                .filter((cs) => cs.student_id === viewingStudent.id)
                .map((cs) => cs.class_id);
              const enrolledClasses = classes.filter((c) => enrolledClassIds.includes(c.id!));
              
              if (enrolledClasses.length <= 1) return null;
              
              return (
                <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/40 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/60">
                  <span className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider shrink-0">Chọn Lớp Phân Tích:</span>
                  <select
                    value={selectedProfileClassId}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSelectedProfileClassId(val === 'all' ? 'all' : val);
                    }}
                    className="text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 rounded-lg outline-none font-bold text-slate-800 dark:text-slate-100 shadow-sm"
                  >
                    <option value="all">Tất cả lớp đang học ({enrolledClasses.length})</option>
                    {enrolledClasses.map((c, idx) => (
                      <option key={c.id ? `${c.id}-${idx}` : idx} value={c.id}>
                        {c.class_name}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })()}

            {/* Tabs */}
            <div className="flex border-b border-slate-200 dark:border-slate-800">
              <button
                onClick={() => setActiveTab('performance')}
                className={`flex-1 pb-3 text-xs font-bold text-center border-b-2 transition-all flex items-center justify-center gap-1.5 ${
                  activeTab === 'performance'
                    ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
                    : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                <Activity className="w-4 h-4" />
                <span>Biểu Đồ & Phong Độ</span>
              </button>
              <button
                onClick={() => setActiveTab('gaps')}
                className={`flex-1 pb-3 text-xs font-bold text-center border-b-2 transition-all flex items-center justify-center gap-1.5 ${
                  activeTab === 'gaps'
                    ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
                    : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                <Brain className="w-4 h-4" />
                <span>Lỗ Hổng & Khắc Phục (V2)</span>
              </button>
              <button
                onClick={() => setActiveTab('classes')}
                className={`flex-1 pb-3 text-xs font-bold text-center border-b-2 transition-all flex items-center justify-center gap-1.5 ${
                  activeTab === 'classes'
                    ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
                    : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                <Users className="w-4 h-4" />
                <span>Xếp Lớp & Chuyển Lớp ({classStudents.filter(cs => cs.student_id === viewingStudent.id).length})</span>
              </button>
              <button
                onClick={() => setActiveTab('warnings')}
                className={`flex-1 pb-3 text-xs font-bold text-center border-b-2 transition-all flex items-center justify-center gap-1.5 ${
                  activeTab === 'warnings'
                    ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
                    : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                <AlertTriangle className="w-4 h-4" />
                <span>Cảnh Báo & Xử Lý ({studentWarnings.filter(w => !w.resolved).length})</span>
              </button>
            </div>

            {/* Tab 1 Content: Performance & Overall Trend */}
            {activeTab === 'performance' && (
              <div className="space-y-4">
                {(() => {
                  // Determine target description based on selected profile class or student active class
                  let targetDesc = 'Thi vào Lớp 10 Công lập 8.0+';
                  if (selectedProfileClassId !== 'all') {
                    const specificClass = classes.find(c => c.id === selectedProfileClassId);
                    if (specificClass?.target_description) {
                      targetDesc = specificClass.target_description;
                    }
                  } else {
                    const activeRel = classStudents.find(cs => cs.student_id === viewingStudent.id && !cs.leave_date);
                    const activeClassObj = activeRel ? classes.find(c => c.id === activeRel.class_id) : null;
                    if (activeClassObj?.target_description) {
                      targetDesc = activeClassObj.target_description;
                    }
                  }

                  return (
                    <>
                      {/* Module 12: Student Performance Trend & Moving Average Engine */}
                      <StudentPerformanceTrend
                        rawHistory={studentPerformanceHistory}
                        targetDescription={targetDesc}
                      />

                      {/* Attendance Quick Stats */}
                      <div className="bg-slate-50 dark:bg-slate-800/40 p-3 rounded-2xl border border-slate-100 dark:border-slate-800/60 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-indigo-500" />
                          <span className="font-bold text-slate-700 dark:text-slate-300">Tỷ Lệ Chuyên Cần & Có Mặt:</span>
                        </div>
                        <div className="flex items-center gap-3 font-bold">
                          {(() => {
                            const present = studentSessionsRaw.filter(s => s.attendance === 'present').length;
                            const late = studentSessionsRaw.filter(s => s.attendance === 'late').length;
                            const absent = studentSessionsRaw.filter(s => s.attendance === 'absent_unexcused' || s.attendance === 'absent_excused').length;
                            const total = studentSessionsRaw.length;
                            const rate = total > 0 ? Math.round((present / total) * 100) : 0;
                            return (
                              <>
                                <span className="text-emerald-600 dark:text-emerald-400">Có mặt: {present}/{total} ({rate}%)</span>
                                {late > 0 && <span className="text-amber-600 dark:text-amber-400">Đi muộn: {late}</span>}
                                {absent > 0 && <span className="text-rose-600 dark:text-rose-400">Vắng: {absent}</span>}
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}

            {/* Tab 2 Content: Gaps & Actionable Resolutions */}
            {activeTab === 'gaps' && (
              <div className="space-y-4">
                {/* Biểu đồ Đánh giá Chuyên đề */}
                <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-700/60">
                  <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 mb-3 flex items-center gap-1.5">
                    <Award className="w-4 h-4 text-emerald-600" />
                    <span>Mức Độ Làm Chủ Kiến Thức Theo Chuyên Đề (Điểm trung bình tích lũy)</span>
                  </h4>
                  {topicAverages.length === 0 ? (
                    <p className="text-xs text-slate-500 text-center py-4">Chưa có dữ liệu chuyên đề để thống kê.</p>
                  ) : (
                    <div className="h-52">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={topicAverages} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" className="dark:stroke-slate-800" />
                          <XAxis dataKey="topic" tick={{ fontSize: 9 }} />
                          <YAxis domain={[0, 10]} tick={{ fontSize: 11 }} />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: '#0f172a',
                              borderRadius: '12px',
                              color: '#fff',
                              fontSize: '11px',
                            }}
                          />
                          <Bar dataKey="avgScore" name="Điểm làm chủ" radius={[4, 4, 0, 0]}>
                            {topicAverages.map((entry, index) => {
                              const score = entry.avgScore;
                              let fill = '#10b981'; // Xanh lá nếu >= 8
                              if (score < 5) fill = '#ef4444'; // Đỏ nếu < 5
                              else if (score < 8) fill = '#eab308'; // Vàng nếu từ 5 đến 8
                              return <Cell key={`cell-${index}`} fill={fill} />;
                            })}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>

                {/* Lỗ hổng cụ thể & Biện pháp khắc phục */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Lỗ hổng cụ thể */}
                  <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                    <h5 className="text-xs font-bold text-slate-800 dark:text-slate-200 mb-2.5 flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4 text-rose-500" />
                      <span>Các buổi học bị đuối (Điểm kiểm tra/BTVN &lt; 6)</span>
                    </h5>
                    
                    {(() => {
                      const gaps = studentPerformanceHistory.filter(h => (h.hwScore !== null && h.hwScore < 6) || (h.testScore !== null && h.testScore < 6));
                      if (gaps.length === 0) {
                        return (
                          <div className="text-xs text-slate-500 py-3 text-center bg-white dark:bg-slate-900 rounded-lg border border-slate-100 dark:border-slate-800">
                            🌟 Không phát hiện lỗ hổng học lực nào dưới trung bình!
                          </div>
                        );
                      }
                      return (
                        <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                          {gaps.map((g, idx) => (
                            <div key={idx} className="p-2 bg-rose-50/50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/40 rounded-lg text-xs flex justify-between items-center gap-2">
                              <span className="font-medium text-rose-950 dark:text-rose-300 truncate max-w-[200px]" title={g.sessionFullName}>
                                {g.sessionFullName || g.session}
                              </span>
                              <div className="flex gap-1.5 text-[10px] font-bold shrink-0">
                                {g.testScore !== null && g.testScore < 6 && (
                                  <span className="px-1.5 py-0.5 bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300 rounded">
                                    KT: {g.testScore}đ
                                  </span>
                                )}
                                {g.hwScore !== null && g.hwScore < 6 && (
                                  <span className="px-1.5 py-0.5 bg-orange-100 dark:bg-orange-900/60 text-orange-700 dark:text-orange-300 rounded">
                                    BTVN: {g.hwScore}đ
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Hành động khắc phục đã thực hiện */}
                  <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                    <h5 className="text-xs font-bold text-slate-800 dark:text-slate-200 mb-2.5 flex items-center gap-1.5">
                      <UserCheck className="w-4 h-4 text-emerald-600" />
                      <span>Nhật ký hành động khắc phục (Trợ giảng ghi nhận)</span>
                    </h5>
                    
                    {(() => {
                      const resolvedActions = studentWarnings
                        .filter(w => w.resolved && w.resolved_action)
                        .map(w => ({
                          type: w.warning_type,
                          date: w.updated_at ? w.updated_at.split('T')[0] : '',
                          action: w.resolved_action
                        }));
                      
                      if (resolvedActions.length === 0) {
                        return (
                          <div className="text-xs text-slate-500 py-3 text-center bg-white dark:bg-slate-900 rounded-lg border border-slate-100 dark:border-slate-800">
                            Chưa có nhật ký hành động khắc phục cho học sinh này.
                          </div>
                        );
                      }
                      
                      return (
                        <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                          {resolvedActions.map((ra, idx) => (
                            <div key={idx} className="p-2 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40 rounded-lg text-xs">
                              <div className="flex justify-between text-[9px] text-slate-400 font-bold mb-0.5">
                                <span className="truncate max-w-[120px]">{ra.type}</span>
                                <span>{ra.date}</span>
                              </div>
                              <p className="text-slate-700 dark:text-slate-300 text-[11px] leading-relaxed font-medium">
                                {ra.action}
                              </p>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* AI Diagnostics Panel */}
                <div className="bg-gradient-to-r from-sky-50 to-indigo-50 dark:from-slate-800/40 dark:to-indigo-950/20 p-4 rounded-2xl border border-indigo-100 dark:border-indigo-950/60 space-y-3 relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-3 pointer-events-none opacity-20">
                    <Sparkles className="w-16 h-16 text-indigo-500" />
                  </div>
                  
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-lg">
                        <Sparkles className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-extrabold text-slate-800 dark:text-slate-100 uppercase tracking-wider flex items-center gap-1.5">
                          <span>AI Chẩn Đoán Học Tập Cá Nhân</span>
                        </h4>
                        <p className="text-[10px] text-slate-500">
                          Sử dụng Gemini để phân tích lỗ hổng chuyên đề sâu và soạn tin báo phụ huynh.
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={handleTriggerAiDiagnosis}
                      disabled={isLoadingAi}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-[11px] font-bold rounded-xl shadow-md shadow-indigo-600/10 flex items-center gap-1.5 transition-all shrink-0"
                    >
                      {isLoadingAi ? (
                        <>
                          <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>Đang phân tích...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                          <span>Chẩn Đoán Với Gemini</span>
                        </>
                      )}
                    </button>
                  </div>

                  {aiError && (
                    <div className="p-2.5 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/40 text-rose-600 dark:text-rose-400 text-xs rounded-xl font-bold">
                      ⚠️ {aiError}
                    </div>
                  )}

                  {aiDiagnosis ? (
                    <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-indigo-100 dark:border-indigo-900/50 space-y-3 text-xs shadow-inner">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <span className="block text-[10px] font-bold text-rose-500 uppercase">🧠 Lỗ hổng phát hiện bởi AI:</span>
                          <p className="text-slate-700 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-800/40 p-2 rounded-lg border border-slate-100 dark:border-slate-800/40 font-medium">
                            {aiDiagnosis.knowledge_gap}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <span className="block text-[10px] font-bold text-sky-500 uppercase">📈 Xu hướng học lực:</span>
                          <p className="text-slate-700 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-800/40 p-2 rounded-lg border border-slate-100 dark:border-slate-800/40 font-medium">
                            {aiDiagnosis.learning_trend}
                          </p>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <span className="block text-[10px] font-bold text-indigo-500 uppercase">📋 Hành động khắc phục đề xuất:</span>
                        <p className="text-slate-700 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-800/40 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800/40 font-medium">
                          {aiDiagnosis.actionable_advice}
                        </p>
                      </div>

                      <div className="space-y-1 border-t border-slate-100 dark:border-slate-800/60 pt-2.5">
                        <span className="block text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">💬 Đoạn tin gửi Phụ huynh:</span>
                        <div className="relative">
                          <p className="text-slate-700 dark:text-slate-300 leading-relaxed italic bg-emerald-50/40 dark:bg-emerald-950/10 p-3 rounded-lg border border-emerald-100/60 dark:border-emerald-900/40 font-medium">
                            "{aiDiagnosis.parent_summary}"
                          </p>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(aiDiagnosis.parent_summary);
                              alert('Đã sao chép tin nhắn Zalo gửi Phụ huynh!');
                            }}
                            className="absolute top-2 right-2 p-1.5 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 rounded-lg shadow-sm"
                            title="Sao chép"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    !isLoadingAi && (
                      <p className="text-center py-2 text-[11px] text-slate-400 italic font-medium">
                        Chưa có bản chẩn đoán AI cho học sinh này. Hãy nhấn nút "Chẩn Đoán Với Gemini" ở trên.
                      </p>
                    )
                  )}
                </div>
              </div>
            )}

            {activeTab === 'classes' && (
              <div className="space-y-4">
                {/* 1. Class List & History */}
                <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-700/60 space-y-3">
                  <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-emerald-600" />
                    <span>Lịch sử học tập & Lớp đang học</span>
                  </h4>
                  <div className="space-y-2.5">
                    {(() => {
                      const studentMemberships = classStudents.filter((cs) => cs.student_id === viewingStudent.id);

                      if (studentMemberships.length === 0) {
                        return (
                          <div className="p-3 bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 text-xs rounded-xl font-medium border border-rose-100/50">
                            Học sinh chưa từng tham gia lớp học nào! Hãy thực hiện Ghi Danh Lớp Mới ở dưới.
                          </div>
                        );
                      }

                      return studentMemberships.map((cs, idx) => {
                        const c = classes.find((cls) => cls.id === cs.class_id);
                        if (!c) return null;
                        const isCurrentlyActive = !cs.leave_date;

                        return (
                          <div
                            key={cs.id ? `${cs.id}-${idx}` : idx}
                            className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl gap-3 shadow-sm"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200">{c.class_name}</span>
                                <span className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded text-[9px] font-bold">Khối {c.grade_level}</span>
                                {isCurrentlyActive ? (
                                  <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 rounded text-[9px] font-bold border border-emerald-100/50">Đang học</span>
                                ) : (
                                  <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-400 rounded text-[9px] font-bold">Đã rút lui</span>
                                )}
                              </div>
                              <p className="text-[10px] text-slate-500">
                                Ngày gia nhập: <strong>{cs.join_date}</strong>
                                {!isCurrentlyActive && (
                                  <span> | Ngày rút lớp: <strong className="text-rose-600">{cs.leave_date}</strong></span>
                                )}
                              </p>
                            </div>

                            {(isAdmin || currentRole === 'TA') && (
                              <div className="flex items-center gap-2.5 self-end sm:self-auto text-[10px]">
                                {isCurrentlyActive ? (
                                  <button
                                    onClick={async () => {
                                      if (confirm(`Bạn có chắc chắn muốn cho học sinh ${viewingStudent.full_name} rút lui an toàn khỏi lớp ${c.class_name}?\nHệ thống sẽ chốt ngày rút là ngày hôm nay. Dữ liệu điểm số và cảnh báo cũ vẫn được bảo lưu đầy đủ trong nhật ký.`)) {
                                        const todayStr = new Date().toISOString().split('T')[0];
                                        await db.class_students.update(cs.id!, {
                                          leave_date: todayStr
                                        });

                                        await db.audit_logs.add({
                                          user_role: currentRole as any,
                                          action_type: 'Edit',
                                          description: `Cho học sinh ${viewingStudent.full_name} rút lui an toàn khỏi lớp ${c.class_name}`,
                                          timestamp: new Date().toISOString()
                                        });
                                        onRefresh();
                                      }
                                    }}
                                    className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 dark:bg-amber-950/20 dark:text-amber-300 font-bold rounded-lg border border-amber-200/50 transition-colors"
                                  >
                                    Rút lui an toàn
                                  </button>
                                ) : (
                                  <button
                                    onClick={async () => {
                                      if (confirm(`Bạn muốn khôi phục học sinh ${viewingStudent.full_name} quay trở lại học lớp ${c.class_name}?`)) {
                                        await db.class_students.update(cs.id!, {
                                          leave_date: undefined,
                                          join_date: new Date().toISOString().split('T')[0]
                                        });

                                        await db.audit_logs.add({
                                          user_role: currentRole as any,
                                          action_type: 'Edit',
                                          description: `Khôi phục học sinh ${viewingStudent.full_name} vào lại lớp ${c.class_name}`,
                                          timestamp: new Date().toISOString()
                                        });
                                        onRefresh();
                                      }
                                    }}
                                    className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-300 font-bold rounded-lg border border-emerald-200/50 transition-colors"
                                  >
                                    Gia nhập lại
                                  </button>
                                )}
                                <button
                                  onClick={async () => {
                                    if (confirm(`CẢNH BÁO: Bạn có chắc chắn muốn xóa VĨNH VIỄN mối liên kết lớp của ${viewingStudent.full_name} với lớp ${c.class_name}?\nHành động này sẽ xóa hẳn dòng liên kết trong database. Để lưu vết chuyển lớp, khuyến khích sử dụng nút "Rút lui an toàn".`)) {
                                      await db.class_students.delete(cs.id!);
                                      await db.audit_logs.add({
                                        user_role: currentRole as any,
                                        action_type: 'Edit',
                                        description: `Xóa vĩnh viễn học sinh ${viewingStudent.full_name} khỏi lớp ${c.class_name}`,
                                        timestamp: new Date().toISOString()
                                      });
                                      onRefresh();
                                    }
                                  }}
                                  className="text-rose-500 hover:text-rose-700 font-bold hover:underline"
                                >
                                  Xóa vĩnh viễn
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>

                {/* 2. Safe Class Transfer (Chuyển lớp an toàn) */}
                {(isAdmin || currentRole === 'TA') && (
                  <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-700/60 space-y-3.5">
                    <div className="space-y-1">
                      <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                        <span className="p-1 bg-emerald-100 dark:bg-emerald-950 rounded text-emerald-700 dark:text-emerald-300 text-[10px]">⇄</span>
                        <span>Chuyển Lớp An Toàn (Safe Transfer)</span>
                      </h4>
                      <p className="text-[10px] text-slate-500 leading-relaxed">
                        Hỗ trợ chuyển học sinh từ một lớp cũ sang lớp mới. Hệ thống sẽ chốt ngày rút lui của lớp cũ và tự động thêm học sinh vào danh sách lớp mới vào ngày hôm nay để bảo lưu vết lịch sử dạy học.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">Từ lớp học cũ:</label>
                        <select
                          value={transferFromClassId}
                          onChange={(e) => setTransferFromClassId(e.target.value === '' ? '' : e.target.value)}
                          className="text-xs w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-3 py-2 rounded-xl outline-none text-slate-800 dark:text-slate-100 font-bold"
                        >
                          <option value="">-- Chọn lớp rời đi --</option>
                          {classStudents
                            .filter((cs) => cs.student_id === viewingStudent.id && !cs.leave_date)
                            .map((cs, idx) => {
                              const c = classes.find((cls) => cls.id === cs.class_id);
                              if (!c) return null;
                              return (
                                <option key={c.id ? `${c.id}-${idx}` : idx} value={c.id}>
                                  {c.class_name} (Khối {c.grade_level})
                                </option>
                              );
                            })}
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">Đến lớp học mới:</label>
                        <select
                          value={transferToClassId}
                          onChange={(e) => setTransferToClassId(e.target.value === '' ? '' : e.target.value)}
                          className="text-xs w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-3 py-2 rounded-xl outline-none text-slate-800 dark:text-slate-100 font-bold"
                        >
                          <option value="">-- Chọn lớp nhận mới --</option>
                          {classes
                            .filter((c) => c.status === 'active')
                            .filter((c) => {
                              const enrolledActiveIds = classStudents
                                .filter((cs) => cs.student_id === viewingStudent.id && !cs.leave_date)
                                .map((cs) => cs.class_id);
                              return !enrolledActiveIds.includes(c.id!);
                            })
                            .map((c, idx) => (
                              <option key={c.id ? `${c.id}-${idx}` : idx} value={c.id}>
                                {c.class_name} (Khối {c.grade_level})
                              </option>
                            ))}
                        </select>
                      </div>
                    </div>

                    <div className="flex justify-end pt-1">
                      <button
                        onClick={async () => {
                          if (!transferFromClassId || !transferToClassId) {
                            alert('Vui lòng chọn cả lớp cũ cần rời và lớp mới cần chuyển đến!');
                            return;
                          }

                          const oldClass = classes.find((c) => c.id === transferFromClassId);
                          const newClass = classes.find((c) => c.id === transferToClassId);

                          if (!oldClass || !newClass) return;

                          if (
                            confirm(
                              `Xác nhận chuyển học sinh ${viewingStudent.full_name}:\nRời khỏi lớp: ${oldClass.class_name}\nGia nhập lớp: ${newClass.class_name}\n\nHệ thống sẽ chốt ngày rút lớp cũ và thêm mới vào lớp mới hôm nay.`
                            )
                          ) {
                            const todayStr = new Date().toISOString().split('T')[0];

                            // 1. Update old class leave_date
                            const oldRel = classStudents.find(
                              (cs) => cs.student_id === viewingStudent.id && cs.class_id === transferFromClassId && !cs.leave_date
                            );
                            if (oldRel) {
                              await db.class_students.update(oldRel.id!, {
                                leave_date: todayStr,
                              });
                            }

                            // 2. Add new class join_date
                            await db.class_students.add({
                              class_id: transferToClassId,
                              student_id: viewingStudent.id!,
                              join_date: todayStr,
                              created_at: new Date().toISOString(),
                            });

                            // 3. Log Audit
                            await db.audit_logs.add({
                              user_role: currentRole as any,
                              action_type: 'Edit',
                              description: `Chuyển học sinh ${viewingStudent.full_name} an toàn từ lớp ${oldClass.class_name} sang lớp ${newClass.class_name}`,
                              timestamp: new Date().toISOString(),
                            });

                            // Reset states
                            setTransferFromClassId('');
                            setTransferToClassId('');
                            onRefresh();
                          }
                        }}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-md transition-all flex items-center gap-1.5"
                      >
                        <span>⇄</span>
                        <span>Xác Nhận Chuyển Lớp</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* 3. Enroll In Additional Class (Ghi danh lớp học song song) */}
                {(isAdmin || currentRole === 'TA') && (
                  <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-700/60 space-y-3">
                    <div className="space-y-1">
                      <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        Ghi Danh Lớp Học Mới (Học Song Song)
                      </h4>
                      <p className="text-[10px] text-slate-500">
                        Sử dụng trong tình huống học sinh muốn học thêm một lớp khác (ví dụ học cả lớp Đại số và Hình học). Hệ thống hỗ trợ chấm điểm và đánh giá độc lập hoàn toàn cho từng lớp học sinh theo học.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <select
                        id="enroll-class-select"
                        className="text-xs flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-2.5 py-2 rounded-xl outline-none text-slate-800 dark:text-slate-100 font-bold"
                      >
                        <option value="">-- Chọn lớp ghi danh --</option>
                        {classes
                          .filter((c) => c.status === 'active')
                          .filter((c) => {
                            const enrolledActiveIds = classStudents
                              .filter((cs) => cs.student_id === viewingStudent.id && !cs.leave_date)
                              .map((cs) => cs.class_id);
                            return !enrolledActiveIds.includes(c.id!);
                          })
                          .map((c, idx) => (
                            <option key={c.id ? `${c.id}-${idx}` : idx} value={c.id}>
                              {c.class_name} (Khối {c.grade_level})
                            </option>
                          ))}
                      </select>
                      <button
                        onClick={async () => {
                          const selectEl = document.getElementById('enroll-class-select') as HTMLSelectElement;
                          if (!selectEl || !selectEl.value) {
                            alert('Vui lòng chọn một lớp học!');
                            return;
                          }
                          const targetClassId = selectEl.value;
                          const targetClass = classes.find(c => c.id === targetClassId);
                          const todayStr = new Date().toISOString().split('T')[0];
                          
                          await db.class_students.add({
                            class_id: targetClassId,
                            student_id: viewingStudent.id!,
                            join_date: todayStr,
                            created_at: new Date().toISOString()
                          });

                          await db.audit_logs.add({
                            user_role: currentRole as any,
                            action_type: 'Edit',
                            description: `Xếp học sinh ${viewingStudent.full_name} học thêm lớp ${targetClass?.class_name}`,
                            timestamp: new Date().toISOString()
                          });

                          selectEl.value = '';
                          onRefresh();
                        }}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow-md transition-all"
                      >
                        Ghi Danh Thêm
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'warnings' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    <span>Lịch Sử & Trạng Thái Cảnh Báo Học Tập</span>
                  </h4>
                  <span className="px-2 py-0.5 bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-100/50 rounded text-[10px] font-bold">
                    Chưa xử lý: {studentWarnings.filter(w => !w.resolved).length}
                  </span>
                </div>

                {/* Unresolved warnings */}
                <div className="space-y-2.5">
                  <h5 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Cảnh báo hiện tại đang kích hoạt</h5>
                  
                  {studentWarnings.filter(w => !w.resolved).length === 0 ? (
                    <div className="p-4 bg-emerald-50/50 dark:bg-emerald-950/10 text-emerald-700 dark:text-emerald-400 text-xs rounded-xl font-medium border border-emerald-100/50 text-center">
                      🎉 Tuyệt vời! Học sinh hiện tại không có cảnh báo học tập nào chưa xử lý.
                    </div>
                  ) : (
                    studentWarnings.filter(w => !w.resolved).map((w, idx) => {
                      const isP1 = w.priority === 'P1';
                      const isPraise = w.priority === 'Praise';
                      const warningClass = classes.find(c => c.id === w.class_id);

                      return (
                        <div
                          key={w.id ? `${w.id}-${idx}` : idx}
                          className={`p-4 border rounded-2xl space-y-3 shadow-sm ${
                            isPraise
                              ? 'bg-emerald-50/50 border-emerald-200/50 dark:bg-emerald-950/20 dark:border-emerald-900/40'
                              : isP1
                              ? 'bg-rose-50/40 border-rose-200/50 dark:bg-rose-950/20 dark:border-rose-900/40'
                              : 'bg-amber-50/40 border-amber-200/50 dark:bg-amber-950/20 dark:border-amber-900/40'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase ${
                                    isPraise
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : isP1
                                      ? 'bg-rose-100 text-rose-800'
                                      : 'bg-amber-100 text-amber-800'
                                  }`}
                                >
                                  {isPraise ? '🟢 Tuyên dương' : isP1 ? 'P1 - Khẩn cấp' : 'P2 - Nội bộ'}
                                </span>
                                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                                  {w.warning_type}
                                </span>
                                {warningClass && (
                                  <span className="text-[10px] text-slate-500 font-medium">
                                    ({warningClass.class_name})
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
                                Lý do: {w.reason}
                              </p>
                              <span className="text-[9px] text-slate-400 block font-medium">
                                Phát hiện ngày: {w.created_at ? w.created_at.split('T')[0] : ''}
                              </span>
                            </div>
                          </div>

                          {/* Quick Resolve Button or Form */}
                          {resolvingWarningId === w.id ? (
                            <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3 text-xs">
                              <div className="space-y-1.5">
                                <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">Chọn hành động khắc phục nhanh:</label>
                                <select
                                  value={actionChoiceProfile}
                                  onChange={(e) => setActionChoiceProfile(e.target.value)}
                                  className="text-xs w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-2 rounded-xl outline-none font-bold text-slate-800 dark:text-slate-100"
                                >
                                  <option value="Đã gọi điện cho Phụ huynh trao đổi tình hình">📞 Đã gọi điện trao đổi với Phụ huynh</option>
                                  <option value="Đã kèm cặp / phụ đạo bù chuyên đề hổng kiến thức">✏️ Đã kèm cặp / phụ đạo bù kiến thức hổng</option>
                                  <option value="Đã yêu cầu hoàn thành bài tập về nhà và nộp bù">📚 Đã yêu cầu hoàn thành & nộp bù BTVN</option>
                                  <option value="Đã cho làm lại bài kiểm tra để gỡ điểm">💯 Đã cho làm lại bài kiểm tra gỡ điểm</option>
                                  <option value="Đã nhắc nhở học sinh tập trung hơn trong giờ học">⚠️ Đã trực tiếp nhắc nhở & chấn chỉnh học sinh</option>
                                </select>
                              </div>

                              <div className="space-y-1.5">
                                <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">Ghi chú bổ sung (nếu có):</label>
                                <input
                                  type="text"
                                  placeholder="Nhập thêm chi tiết biện pháp đã thực hiện..."
                                  value={actionNotesProfile}
                                  onChange={(e) => setActionNotesProfile(e.target.value)}
                                  className="text-xs w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-2 rounded-xl outline-none text-slate-800 dark:text-slate-100"
                                />
                              </div>

                              <div className="flex justify-end gap-2">
                                <button
                                  onClick={() => setResolvingWarningId(null)}
                                  className="px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold rounded-lg text-[11px] transition-colors"
                                >
                                  Hủy
                                </button>
                                <button
                                  onClick={async () => {
                                    if (isResolvingProfile) return;
                                    setIsResolvingProfile(true);

                                    try {
                                      const now = new Date().toISOString();
                                      let fullActionDesc = actionChoiceProfile;
                                      if (actionNotesProfile) {
                                        fullActionDesc += ` - Chi tiết: ${actionNotesProfile}`;
                                      }

                                      // Update in Dexie
                                      await db.warnings.update(w.id!, {
                                        resolved: true,
                                        resolved_action: fullActionDesc,
                                        updated_at: now
                                      });

                                      // Log Audit
                                      await db.audit_logs.add({
                                        user_role: currentRole as any,
                                        action_type: 'Edit',
                                        description: `Giải quyết cảnh báo [${w.warning_type}] cho học sinh ${viewingStudent.full_name}: ${fullActionDesc}`,
                                        timestamp: now
                                      });

                                      // Reload student warnings
                                      const updatedWarns = await db.warnings.where('student_id').equals(viewingStudent.id!).toArray();
                                      setStudentWarnings(updatedWarns);

                                      // Reset states
                                      setResolvingWarningId(null);
                                      setActionNotesProfile('');
                                      onRefresh();
                                    } catch (err) {
                                      console.error(err);
                                      alert('Đã xảy ra lỗi khi giải quyết cảnh báo.');
                                    } finally {
                                      setIsResolvingProfile(false);
                                    }
                                  }}
                                  disabled={isResolvingProfile}
                                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-bold rounded-lg text-[11px] shadow-sm transition-colors"
                                >
                                  {isResolvingProfile ? 'Đang lưu...' : 'Hoàn thành giải quyết'}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex justify-end pt-1">
                              <button
                                onClick={() => {
                                  setResolvingWarningId(w.id!);
                                  setActionNotesProfile('');
                                }}
                                className="px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-extrabold rounded-xl text-[10px] shadow-sm flex items-center gap-1.5 transition-all"
                              >
                                <span>🔧</span>
                                <span>Thực hiện xử lý khắc phục</span>
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Resolved warnings history list */}
                <div className="space-y-2.5 pt-2 border-t border-slate-100 dark:border-slate-800/60">
                  <h5 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Lịch sử cảnh báo đã giải quyết</h5>
                  
                  {studentWarnings.filter(w => w.resolved).length === 0 ? (
                    <p className="text-center py-4 text-[11px] text-slate-400 italic">
                      Chưa có cảnh báo nào được giải quyết trước đây.
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      {studentWarnings.filter(w => w.resolved).map((w, idx) => {
                        const warningClass = classes.find(c => c.id === w.class_id);
                        return (
                          <div
                            key={w.id ? `${w.id}-${idx}` : idx}
                            className="p-3 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800/60 rounded-xl text-xs space-y-1"
                          >
                            <div className="flex items-center justify-between text-[10px] text-slate-400">
                              <span className="font-extrabold text-emerald-600 uppercase flex items-center gap-1">
                                <span>✓</span>
                                <span>Đã giải quyết</span>
                              </span>
                              <span>Ngày xử lý: {w.updated_at ? w.updated_at.split('T')[0] : ''}</span>
                            </div>
                            <div className="font-bold text-slate-800 dark:text-slate-200">
                              {w.warning_type} {warningClass && `(${warningClass.class_name})`}
                            </div>
                            <p className="text-slate-500 text-[11px]">
                              Lý do: {w.reason}
                            </p>
                            <div className="p-2 bg-white dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800/60 rounded-lg text-slate-700 dark:text-slate-300 text-[11px] leading-relaxed font-medium">
                              Biện pháp: <span className="font-semibold">{w.resolved_action}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-slate-100 dark:border-slate-800/60">
              <button
                onClick={() => setViewingStudent(null)}
                className="px-4 py-2 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 rounded-xl text-xs font-bold shadow-md"
              >
                Đóng Hồ Sơ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
