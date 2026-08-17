import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Tooltip,
  Legend,
} from 'recharts';
import { ClassItem, Session, Student, StudentSession, AttendanceStatus, KnowledgeTag } from '../types';
import { db, pushBatchDocsToFirestore } from '../db/dexie';
import { sortStudentsByName } from '../utils/sortUtils';
import { logAudit } from '../utils/auditLogger';
import { exportSessionReportPDF } from '../utils/pdfGenerator';
import { recalculateKnowledgeResultsForClass } from '../utils/knowledgeEngine';
import { runWarningScanForClass } from '../utils/warningEngine';
import { GradeEntryRow } from './GradeEntryRow';
import { GradebookView } from './GradebookView';
import { generateAICommentsForSession, GeneratedAIComment } from '../services/aiCommentService';
import {
  Keyboard,
  Plus,
  FileDown,
  FileSpreadsheet,
  Save,
  CheckCircle2,
  Calendar,
  BookOpen,
  Check,
  AlertTriangle,
  Sparkles,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Layers,
  PieChart as PieChartIcon,
  HelpCircle,
  X,
  Target,
  Award,
  Settings,
  Edit3,
  Trash2,
  RotateCcw,
  PlusCircle,
  Tag,
  SlidersHorizontal,
  Search,
  Filter,
  Users,
  CheckSquare,
  AlertCircle,
  RefreshCw,
  Clock,
  Zap,
  Loader2,
  Wand2,
} from 'lucide-react';

interface UltraFastGradeEntryProps {
  classes: ClassItem[];
  selectedClassId?: string;
  onSelectClassId: (id: string) => void;
  onRefreshData: () => void;
}

// Preset comments specifically for Middle School Math (THCS)
const ALGEBRA_PRESETS = [
  'Tính toán cẩu thả',
  'Chưa thuộc công thức căn thức',
  'Sai dấu khi chuyển vế',
  'Nhầm lẫn điều kiện xác định (ĐKXĐ)',
  'Chưa thuộc Định lý Vi-ét',
  'Biến đổi biểu thức chưa tối giản',
  'Sai công thức nghiệm phương trình bậc 2',
];

const GEOMETRY_PRESETS = [
  'Chưa thuộc hệ thức lượng',
  'Vẽ hình sai/thiếu',
  'Chứng minh Tứ giác nội tiếp chưa chặt chẽ',
  'Thiếu ký hiệu vuông góc/bằng nhau trên hình',
  'Quên giải thích góc nội tiếp chắn nửa đường tròn',
  'Nhầm lẫn tỉ số đồng dạng tam giác',
  'Vẽ thiếu đường phụ để giải toán hình',
];

const TEST_PRESETS = [
  'Bài kiểm tra: Làm bài rất xuất sắc, tư duy bài toán tốt',
  'Bài kiểm tra: Nắm vững kiến thức trọng tâm, điểm số cao',
  'Bài kiểm tra: Đạt yêu cầu cơ bản, cần rèn thêm bài tập nâng cao',
  'Bài kiểm tra: Trình bày bài mạch lạc, lập luận chặt chẽ',
  'Bài kiểm tra: Tính toán sai sót nhiều ở các câu cơ bản',
  'Bài kiểm tra: Chưa thuộc công thức / định lý trọng tâm',
  'Bài kiểm tra: Vẽ hình sai hoặc chưa hoàn thành bài chứng minh',
  'Bài kiểm tra: Phân bổ thời gian chưa hợp lý, bỏ dở bài',
  'Bài kiểm tra: Kết quả chưa đạt, cần học phụ đạo & làm bài thi bù',
];

const KNOWLEDGE_TAGS_PRESETS = [
  'Đại số 9 - Căn thức bậc hai & Rút gọn',
  'Đại số 9 - Phương trình bậc hai & Vi-ét',
  'Đại số 9 - Hệ phương trình 2 ẩn',
  'Hình học 9 - Tứ giác nội tiếp',
  'Hình học 9 - Đường tròn & Tiếp tuyến',
  'Hình học 9 - Hệ thức lượng tam giác vuông',
  'Đại số 8 - Hằng đẳng thức & Phân thức',
  'Hình học 8 - Định lý Ta-lét & Tam giác đồng dạng',
];

const ABSENT_DEFAULT_COMMENT = 'Cần đi học bù vào ngày';
const HW_DEFAULT_COMMENT = 'Nhờ phụ huynh nhắc nhở con làm bổ sung nộp lại cho thầy';

const addCommentSegment = (existing: string | undefined, textToAdd: string): string => {
  const currentText = (existing || '').trim();
  if (!currentText) return textToAdd;
  if (currentText.includes(textToAdd)) return currentText;
  return `${currentText}; ${textToAdd}`;
};

const removeCommentSegment = (existing: string | undefined, textToRemove: string): string => {
  if (!existing) return '';
  return existing
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s && s !== textToRemove)
    .join('; ');
};

const ensurePresentCommentFormat = (
  comment: string | undefined,
  isHwMissingOrLate: boolean,
  isExemptHW: boolean
): string => {
  let text = (comment || '').trim();

  if (text === ABSENT_DEFAULT_COMMENT) {
    text = '';
  } else if (text.includes(ABSENT_DEFAULT_COMMENT)) {
    text = removeCommentSegment(text, ABSENT_DEFAULT_COMMENT);
  }

  if (isHwMissingOrLate && !isExemptHW) {
    if (!text.includes(HW_DEFAULT_COMMENT)) {
      text = text ? `${HW_DEFAULT_COMMENT}; ${text}` : HW_DEFAULT_COMMENT;
    }
  } else {
    if (text.includes(HW_DEFAULT_COMMENT)) {
      text = text
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s && s !== HW_DEFAULT_COMMENT)
        .join('; ');
    }
  }

  return text;
};

const ensureAbsentCommentFormat = (comment: string | undefined): string => {
  let text = (comment || '').trim();

  text = removeCommentSegment(text, ABSENT_DEFAULT_COMMENT);

  if (!text || text === HW_DEFAULT_COMMENT) {
    return ABSENT_DEFAULT_COMMENT;
  }

  return addCommentSegment(text, ABSENT_DEFAULT_COMMENT);
};

const addPresetToFormattedComment = (
  comment: string,
  presetText: string,
  isAdd: boolean
): string => {
  let text = (comment || '').trim();

  if (isAdd) {
    if (!text.includes(presetText)) {
      text = text ? `${text}; ${presetText}` : presetText;
    }
  } else {
    text = text
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s && s !== presetText)
      .join('; ');
  }

  return text;
};

const formatKnowledgeTagLabel = (tag: KnowledgeTag): string => {
  const categoryPrefix = tag.category === 'Algebra' ? 'Đại số' : 'Hình học';
  if (tag.tag_name.startsWith('Đại số') || tag.tag_name.startsWith('Hình học')) {
    return tag.tag_name;
  }
  return `${categoryPrefix} ${tag.grade_level} - ${tag.tag_name}`;
};

export const UltraFastGradeEntry: React.FC<UltraFastGradeEntryProps> = ({
  classes,
  selectedClassId,
  onSelectClassId,
  onRefreshData,
}) => {
  const activeClasses = classes.filter((c) => c.status === 'active');
  const currentClass = activeClasses.find((c) => c.id === selectedClassId) || activeClasses[0];

  // Real-time IndexedDB Live Queries for realtime data synchronization
  const liveKnowledgeTags = useLiveQuery(() => db.knowledge_tags.toArray()) || [];

  const liveSessions = useLiveQuery(
    async () => {
      if (!currentClass?.id) return [];
      const classIdStr = String(currentClass.id);
      const all = await db.sessions.toArray();
      return all
        .filter((s) => String(s.class_id) === classIdStr)
        .sort((a, b) => (a.session_date || '').localeCompare(b.session_date || ''));
    },
    [currentClass?.id]
  ) || [];

  const liveClassStudents = useLiveQuery(
    async () => {
      if (!currentClass?.id) return [];
      const classIdStr = String(currentClass.id);
      const all = await db.class_students.toArray();
      return all.filter((cs) => String(cs.class_id) === classIdStr);
    },
    [currentClass?.id]
  ) || [];

  const liveStudents = useLiveQuery(() => db.students.toArray()) || [];

  const liveStudentSessions = useLiveQuery(() => db.student_sessions.toArray()) || [];

  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<number | undefined>(undefined);
  const [students, setStudents] = useState<Student[]>([]);
  const [studentSessions, setStudentSessions] = useState<Record<string, StudentSession>>({});
  const initialStudentSessionsRef = useRef<Record<string, StudentSession>>({});

  // Active view tab: 'entry', 'knowledge_map', or 'gradebook'
  const [activeTab, setActiveTab] = useState<'entry' | 'knowledge_map' | 'gradebook'>('entry');

  const selectedSession = sessions.find((s) => s.id === selectedSessionId);
  const selectedSessionIndex = selectedSession ? sessions.findIndex((s) => s.id === selectedSession.id) : -1;
  const previousSession = selectedSessionIndex > 0 ? sessions[selectedSessionIndex - 1] : null;

  // Currently focused student row & field column index for Keyboard Navigation
  const [activeRow, setActiveRow] = useState<number>(0);
  const [activeCol, setActiveCol] = useState<number>(1); // 0: Attendance, 1: HW score, 2: Test score, 3: Comment
  const [activePresetCategory, setActivePresetCategory] = useState<'smart_ai' | 'session' | 'test' | 'algebra' | 'geometry'>('smart_ai');

  // Focus filters & Search state
  const [focusFilter, setFocusFilter] = useState<'all' | 'no_hw' | 'low_test' | 'warning' | 'absent' | 'pending_test'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Persistence & Sync strategy state
  const [syncStatus, setSyncStatus] = useState<'synced' | 'saving' | 'offline'>('synced');
  const [lastSyncedTime, setLastSyncedTime] = useState<string>('');

  // Custom presets states for each category / session
  const [algebraPresets, setAlgebraPresets] = useState<string[]>(ALGEBRA_PRESETS);
  const [geometryPresets, setGeometryPresets] = useState<string[]>(GEOMETRY_PRESETS);
  const [testPresets, setTestPresets] = useState<string[]>(TEST_PRESETS);
  const [sessionCustomPresets, setSessionCustomPresets] = useState<string[]>([]);

  // Quick preset customization UI states
  const [isAddingPresetInline, setIsAddingPresetInline] = useState<boolean>(false);
  const [newPresetTextInput, setNewPresetTextInput] = useState<string>('');
  const [isDeleteModeActive, setIsDeleteModeActive] = useState<boolean>(false);
  const [isManagePresetsModalOpen, setIsManagePresetsModalOpen] = useState<boolean>(false);

  // Load saved custom presets from localStorage when selectedSessionId changes
  useEffect(() => {
    if (selectedSessionId) {
      const savedSession = localStorage.getItem(`session_presets_${selectedSessionId}`);
      if (savedSession) {
        try {
          setSessionCustomPresets(JSON.parse(savedSession));
        } catch (e) {
          setSessionCustomPresets([]);
        }
      } else {
        setSessionCustomPresets([]);
      }
    }

    const savedAlgebra = localStorage.getItem('custom_algebra_presets');
    if (savedAlgebra) {
      try {
        setAlgebraPresets(JSON.parse(savedAlgebra));
      } catch (e) {}
    }

    const savedGeometry = localStorage.getItem('custom_geometry_presets');
    if (savedGeometry) {
      try {
        setGeometryPresets(JSON.parse(savedGeometry));
      } catch (e) {}
    }

    const savedTest = localStorage.getItem('custom_test_presets');
    if (savedTest) {
      try {
        setTestPresets(JSON.parse(savedTest));
      } catch (e) {}
    }
  }, [selectedSessionId]);

  // Helper to add new preset comment
  const handleAddPreset = (textToAdd?: string) => {
    const text = (textToAdd || newPresetTextInput).trim();
    if (!text) return;

    if (activePresetCategory === 'session') {
      if (!selectedSessionId) return;
      if (sessionCustomPresets.includes(text)) return;
      const updated = [...sessionCustomPresets, text];
      setSessionCustomPresets(updated);
      localStorage.setItem(`session_presets_${selectedSessionId}`, JSON.stringify(updated));
    } else if (activePresetCategory === 'test') {
      if (testPresets.includes(text)) return;
      const updated = [...testPresets, text];
      setTestPresets(updated);
      localStorage.setItem('custom_test_presets', JSON.stringify(updated));
    } else if (activePresetCategory === 'algebra') {
      if (algebraPresets.includes(text)) return;
      const updated = [...algebraPresets, text];
      setAlgebraPresets(updated);
      localStorage.setItem('custom_algebra_presets', JSON.stringify(updated));
    } else if (activePresetCategory === 'geometry') {
      if (geometryPresets.includes(text)) return;
      const updated = [...geometryPresets, text];
      setGeometryPresets(updated);
      localStorage.setItem('custom_geometry_presets', JSON.stringify(updated));
    }

    setNewPresetTextInput('');
    setIsAddingPresetInline(false);
  };

  // Helper to delete a preset comment
  const handleDeletePreset = (textToDelete: string) => {
    if (activePresetCategory === 'session') {
      if (!selectedSessionId) return;
      const updated = sessionCustomPresets.filter((p) => p !== textToDelete);
      setSessionCustomPresets(updated);
      localStorage.setItem(`session_presets_${selectedSessionId}`, JSON.stringify(updated));
    } else if (activePresetCategory === 'test') {
      const updated = testPresets.filter((p) => p !== textToDelete);
      setTestPresets(updated);
      localStorage.setItem('custom_test_presets', JSON.stringify(updated));
    } else if (activePresetCategory === 'algebra') {
      const updated = algebraPresets.filter((p) => p !== textToDelete);
      setAlgebraPresets(updated);
      localStorage.setItem('custom_algebra_presets', JSON.stringify(updated));
    } else if (activePresetCategory === 'geometry') {
      const updated = geometryPresets.filter((p) => p !== textToDelete);
      setGeometryPresets(updated);
      localStorage.setItem('custom_geometry_presets', JSON.stringify(updated));
    }
  };

  // Helper to reset presets to standard THCS Math
  const handleResetPresetsToDefault = () => {
    if (window.confirm('Khôi phục danh sách nhận xét mặc định môn Toán THCS?')) {
      setAlgebraPresets(ALGEBRA_PRESETS);
      setGeometryPresets(GEOMETRY_PRESETS);
      setTestPresets(TEST_PRESETS);
      localStorage.removeItem('custom_algebra_presets');
      localStorage.removeItem('custom_geometry_presets');
      localStorage.removeItem('custom_test_presets');
      if (selectedSessionId) {
        setSessionCustomPresets([]);
        localStorage.removeItem(`session_presets_${selectedSessionId}`);
      }
    }
  };

  // Generate Smart Contextual Presets dynamically for focused student
  const smartAiPresets = useMemo(() => {
    const selectedStudent = students[activeRow];
    if (!selectedStudent) {
      return [
        'BTVN: Hoàn thành đầy đủ bài tập được giao',
        'BTVN: Chưa làm / Thiếu bài tập về nhà',
        'Bài kiểm tra: Cần ôn luyện thêm dạng bài biến đổi',
        'Bài kiểm tra: Tính toán cẩu thả, sai dấu',
      ];
    }

    const rec = studentSessions[selectedStudent.id!];
    const presets: string[] = [];

    if (!rec) {
      return [
        'BTVN: Hoàn thành đầy đủ bài tập được giao',
        'BTVN: Chưa làm / Thiếu bài tập về nhà',
        'Bài kiểm tra: Cần ôn lại lý thuyết Toán THCS',
        'Bài kiểm tra: Tính toán cẩu thả, sai dấu',
      ];
    }

    // Attendance contextual
    if (rec.attendance === 'absent_unexcused') {
      presets.push(ABSENT_DEFAULT_COMMENT);
      presets.push('Vắng học KHÔNG PHÉP, cần liên hệ Phụ huynh');
      presets.push('Nghỉ học không xin phép, giao BTVN ôn tại nhà');
    } else if (rec.attendance === 'absent_excused') {
      presets.push(ABSENT_DEFAULT_COMMENT);
      presets.push('Vắng học có phép, cần lấy bài vở chép bù');
      presets.push('Cần làm bù bài kiểm tra buổi này');
    } else if (rec.attendance === 'late') {
      presets.push('Đi học muộn, cần nhắc nhở đúng giờ');
    }

    // Homework contextual
    if (rec.homework_submitted === false || rec.late_submit || rec.homework_score < 5) {
      presets.push(`BTVN: ${HW_DEFAULT_COMMENT}`);
      presets.push('BTVN: Chưa hoàn thành đầy đủ bài tập');
      presets.push('BTVN: Cần nộp bù bài tập trước buổi học sau');
      presets.push('BTVN: Làm đối phó, thiếu nhiều câu');
    } else if (rec.homework_score >= 8) {
      presets.push('BTVN: Làm bài rất chu đáo, đầy đủ');
    }

    // Test Score contextual
    if (rec.test_score < 5 && !rec.attendance.startsWith('absent')) {
      presets.push('Bài kiểm tra: Chưa thuộc công thức/Định lý môn Toán');
      presets.push('Bài kiểm tra: Tính toán cẩu thả, sai dấu khi chuyển vế');
      presets.push('Bài kiểm tra: Vẽ hình sai/thiếu yếu tố vuông góc');
      presets.push('Bài kiểm tra: Bài làm dưới trung bình, cần phụ đạo thêm');
    } else if (rec.test_score >= 8 && !rec.attendance.startsWith('absent')) {
      presets.push('Bài kiểm tra: Trình bày bài rất xuất sắc & chặt chẽ');
      presets.push('Bài kiểm tra: Tư duy logic tốt, tính toán chuẩn xác');
      presets.push('Bài kiểm tra: Nắm rất vững chuyên đề học');
    }

    // Default fallbacks
    if (presets.length < 3) {
      presets.push('BTVN: Hoàn thành đầy đủ bài tập được giao');
      presets.push('Bài kiểm tra: Trình bày mạch lạc, cẩn thận');
      presets.push('Bài kiểm tra: Cần chú ý kỹ năng tính toán');
    }

    return Array.from(new Set(presets));
  }, [students, activeRow, studentSessions]);

  // Contextual BTVN Presets
  const bTvnPresets = useMemo(() => {
    const list: string[] = [
      'BTVN: Hoàn thành đầy đủ bài tập được giao',
      'BTVN: Làm bài chu đáo, trình bày sạch đẹp',
      'BTVN: Chưa làm / Thiếu bài tập về nhà',
      'BTVN: Làm đối phó, thiếu các câu vận dụng',
      'BTVN: Tính toán còn sai sót nhiều',
      'BTVN: Cần nộp bù bài tập trước buổi học sau',
    ];

    // Include custom session/BTVN presets added manually by teacher
    sessionCustomPresets.forEach((p) => {
      if (!list.includes(p)) list.push(p);
    });

    return Array.from(new Set(list));
  }, [sessionCustomPresets]);

  // Get current active presets list based on category
  const getCurrentActivePresetsList = (): string[] => {
    if (activePresetCategory === 'smart_ai') {
      return smartAiPresets;
    } else if (activePresetCategory === 'session') {
      return bTvnPresets;
    } else if (activePresetCategory === 'test') {
      return testPresets;
    } else if (activePresetCategory === 'algebra') {
      return algebraPresets;
    } else {
      return geometryPresets;
    }
  };

  // Filtered Students list based on Focus Filter & Search Query
  const filteredStudents = useMemo(() => {
    const list = students.filter((st) => {
      // Search query filter
      const q = searchQuery.trim().toLowerCase();
      if (q) {
        const nameMatch = st.full_name.toLowerCase().includes(q);
        const parentMatch = st.parent_name?.toLowerCase().includes(q) || st.parent_phone?.includes(q);
        if (!nameMatch && !parentMatch) return false;
      }

      const rec = studentSessions[st.id!];
      if (!rec) return focusFilter === 'all';

      const isHwExempt = rec.exempt || rec.exempt_homework;
      const isTestExempt = rec.exempt || rec.exempt_test;

      if (focusFilter === 'no_hw') {
        if (isHwExempt) return false;
        return (typeof rec.homework_score === 'number' && rec.homework_score < 5) || rec.late_submit || !rec.homework_submitted;
      }
      if (focusFilter === 'low_test') {
        if (isTestExempt) return false;
        return typeof rec.test_score === 'number' && rec.test_score < 5 && !rec.attendance.startsWith('absent');
      }
      if (focusFilter === 'pending_test') {
        if (isTestExempt) return false;
        return (rec.test_score === undefined || rec.test_score === null) && !rec.attendance.startsWith('absent');
      }
      if (focusFilter === 'absent') {
        return rec.attendance !== 'present';
      }
      if (focusFilter === 'warning') {
        return (
          (!isTestExempt && typeof rec.test_score === 'number' && rec.test_score < 5) ||
          (!isHwExempt && typeof rec.homework_score === 'number' && rec.homework_score < 5) ||
          rec.attendance === 'absent_unexcused' ||
          (!isHwExempt && rec.late_submit)
        );
      }

      return true;
    });
    return sortStudentsByName(list);
  }, [students, studentSessions, focusFilter, searchQuery]);

  // Mini Dashboard Statistics computed real-time
  const sessionStats = useMemo(() => {
    const total = students.length;
    if (total === 0) {
      return { total: 0, present: 0, presentPct: 0, hwDone: 0, hwPct: 0, avgHw: 0, avgTest: 0, pendingTestCount: 0, needSupport: 0 };
    }

    let present = 0;
    let hwDone = 0;
    let totalHw = 0;
    let hwCount = 0;
    let totalTest = 0;
    let testCount = 0;
    let pendingTestCount = 0;
    let needSupport = 0;

    const hasTest = selectedSession?.has_test !== false;
    const hasHw = selectedSession?.has_homework !== false;

    students.forEach((st) => {
      const rec = studentSessions[st.id!];
      // Default to present if record exists or missing
      const attendance = rec?.attendance;
      const isAttended = !attendance || attendance === 'present' || attendance === 'late';
      if (isAttended) present++;

      if (!rec) return;

      const isHwExempt = rec.exempt || rec.exempt_homework;
      const isTestExempt = rec.exempt || rec.exempt_test;

      // 1. Nộp BTVN: Đã nộp (kể cả nộp muộn), hoặc được Miễn BTVN
      const isHwSubmitted = isHwExempt || rec.homework_submitted !== false || rec.late_submit === true;
      if (isAttended && hasHw && isHwSubmitted) {
        hwDone++;
      }

      // 2. Điểm TB BTVN: Tất cả điểm số BTVN hợp lệ của học sinh có mặt và không miễn trừ
      if (isAttended && hasHw && !isHwExempt && typeof rec.homework_score === 'number') {
        totalHw += rec.homework_score;
        hwCount++;
      }

      // 3. Điểm TB Kiểm Tra & Chờ chấm
      if (isAttended && hasTest && !isTestExempt) {
        if (typeof rec.test_score === 'number') {
          totalTest += rec.test_score;
          testCount++;
        } else if (rec.test_score === undefined || rec.test_score === null) {
          pendingTestCount++;
        }
      }

      // 4. Cần hỗ trợ
      const isHwWeak = hasHw && !isHwExempt && (rec.homework_submitted === false || (typeof rec.homework_score === 'number' && rec.homework_score < 5));
      const isTestWeak = hasTest && !isTestExempt && typeof rec.test_score === 'number' && rec.test_score < 5;
      if (attendance === 'absent_unexcused' || (isAttended && (isHwWeak || isTestWeak))) {
        needSupport++;
      }
    });

    return {
      total,
      present,
      presentPct: total > 0 ? Math.round((present / total) * 100) : 0,
      hwDone,
      hwPct: present > 0 ? Math.round((hwDone / present) * 100) : 0,
      avgHw: hwCount > 0 ? parseFloat((totalHw / hwCount).toFixed(1)) : 0,
      avgTest: testCount > 0 ? parseFloat((totalTest / testCount).toFixed(1)) : 0,
      pendingTestCount: hasTest ? pendingTestCount : 0,
      needSupport,
    };
  }, [students, studentSessions, selectedSession]);

  const tagOptions = useMemo(() => {
    if (Array.isArray(liveKnowledgeTags)) {
      const classGrade = currentClass?.grade_level;
      let filtered = liveKnowledgeTags;
      if (classGrade !== undefined) {
        const gradeNum = Number(classGrade);
        const gradeMatches = liveKnowledgeTags.filter((t) => Number(t.grade_level) === gradeNum);
        if (gradeMatches.length > 0) {
          filtered = gradeMatches;
        }
      }

      const sorted = [...filtered].sort((a, b) => {
        if (b.grade_level !== a.grade_level) return b.grade_level - a.grade_level;
        if (a.category !== b.category) return a.category === 'Algebra' ? -1 : 1;
        return a.tag_name.localeCompare(b.tag_name, 'vi');
      });

      return sorted.map((t) => ({
        id: t.id,
        label: formatKnowledgeTagLabel(t),
        tag_name: t.tag_name,
      }));
    }

    const classGrade = currentClass?.grade_level || 9;
    const filteredPresets = KNOWLEDGE_TAGS_PRESETS.filter((t) =>
      t.includes(` ${classGrade} `) || t.includes(`Lớp ${classGrade}`) || t.includes(` 9 - `)
    );
    const presetsToUse = filteredPresets.length > 0 ? filteredPresets : KNOWLEDGE_TAGS_PRESETS;

    return presetsToUse.map((t) => ({
      id: undefined,
      label: t,
      tag_name: t,
    }));
  }, [liveKnowledgeTags, currentClass?.grade_level]);

  const renderTagOptions = (selectedValue?: string) => {
    const validLabels = tagOptions.map((opt) => opt.label);
    const showExtra = selectedValue && selectedValue !== 'same' && !validLabels.includes(selectedValue);

    return (
      <>
        {showExtra && (
          <option key={selectedValue} value={selectedValue}>
            📌 {selectedValue}
          </option>
        )}
        {tagOptions.map((opt) => (
          <option key={opt.id || opt.label} value={opt.label}>
            📌 {opt.label}
          </option>
        ))}
      </>
    );
  };

  // Knowledge Tag for current session
  const [currentKnowledgeTag, setCurrentKnowledgeTag] = useState<string>('');

  // Selected Student for Radar Chart in Knowledge Map
  const [selectedRadarStudentId, setSelectedRadarStudentId] = useState<number | 'class_avg'>('class_avg');

  // Add Session Modal
  const [isAddSessionOpen, setIsAddSessionOpen] = useState(false);
  const [newLessonTitle, setNewLessonTitle] = useState('');
  const [newSessionDate, setNewSessionDate] = useState(new Date().toISOString().split('T')[0]);
  const [newChapter, setNewChapter] = useState('Chương 1: Đại số & Hình học THCS');
  const [newHwDesc, setNewHwDesc] = useState('Làm Bài 1 đến 5 trong Phiếu BTVN');
  const [newKnowledgeTag, setNewKnowledgeTag] = useState('');
  const [newTestKnowledgeTag, setNewTestKnowledgeTag] = useState('same');
  const [isNewTestTagCustom, setIsNewTestTagCustom] = useState(false);
  const [newHasHomework, setNewHasHomework] = useState(true);
  const [newHasTest, setNewHasTest] = useState(true);

  // Edit Session Modal
  const [isEditSessionOpen, setIsEditSessionOpen] = useState(false);
  const [editLessonTitle, setEditLessonTitle] = useState('');
  const [editSessionDate, setEditSessionDate] = useState('');
  const [editChapter, setEditChapter] = useState('');
  const [editHwDesc, setEditHwDesc] = useState('');
  const [editKnowledgeTag, setEditKnowledgeTag] = useState('');
  const [editTestKnowledgeTag, setEditTestKnowledgeTag] = useState('same');
  const [isEditTestTagCustom, setIsEditTestTagCustom] = useState(false);
  const [editHasHomework, setEditHasHomework] = useState(true);
  const [editHasTest, setEditHasTest] = useState(true);

  // Helper renderer for Test Knowledge Tag options (combining Same, Past Sessions, and Standard Tags)
  const renderTestKnowledgeTagOptions = (selectedValue?: string, excludeSessionId?: number) => {
    const pastSessions = (liveSessions || [])
      .filter((s) => !excludeSessionId || String(s.id) !== String(excludeSessionId))
      .sort((a, b) => b.session_date.localeCompare(a.session_date));

    const validTagLabels = tagOptions.map((opt) => opt.label);
    const pastLessonTitles = pastSessions.map((s) => s.lesson_title);

    const isCustomValue =
      selectedValue &&
      selectedValue !== 'same' &&
      selectedValue !== '__custom__' &&
      !pastLessonTitles.includes(selectedValue) &&
      !validTagLabels.includes(selectedValue);

    return (
      <>
        <optgroup label="🎯 Mặc định">
          <option value="same">
            🎯 Trùng với tên tựa đề bài học hôm nay (chuyên đề buổi này)
          </option>
        </optgroup>

        {pastSessions.length > 0 && (
          <optgroup label="📚 Từ tựa đề các buổi học đã từng diễn ra (Lớp này)">
            {pastSessions.map((s) => (
              <option key={`sess_${s.id}`} value={s.lesson_title}>
                📅 Ngày {s.session_date}: {s.lesson_title}
              </option>
            ))}
          </optgroup>
        )}

        <optgroup label="🏷️ Danh sách Chuyên đề Toán THCS chuẩn">
          {tagOptions.map((t) => (
            <option key={t.id || t.label} value={t.label}>
              {t.label}
            </option>
          ))}
        </optgroup>

        {isCustomValue && (
          <optgroup label="📌 Chủ đề tùy chỉnh đang chọn">
            <option value={selectedValue}>📌 {selectedValue}</option>
          </optgroup>
        )}

        <optgroup label="✏️ Tùy chọn mở rộng">
          <option value="__custom__">✏️ Nhập chủ đề bài kiểm tra khác...</option>
        </optgroup>
      </>
    );
  };

  // Auto-align tag selection state variables when tagOptions change
  useEffect(() => {
    if (tagOptions.length > 0) {
      const validLabels = tagOptions.map((o) => o.label);
      const firstLabel = tagOptions[0].label;

      if (!currentKnowledgeTag || !validLabels.includes(currentKnowledgeTag)) {
        setCurrentKnowledgeTag(firstLabel);
      }
      if (!newKnowledgeTag || !validLabels.includes(newKnowledgeTag)) {
        setNewKnowledgeTag(firstLabel);
      }
      if (editKnowledgeTag && !validLabels.includes(editKnowledgeTag)) {
        setEditKnowledgeTag(firstLabel);
      }
    } else {
      setCurrentKnowledgeTag('');
      setNewKnowledgeTag('');
      setEditKnowledgeTag('');
    }
  }, [tagOptions]);

  const [saveSuccessMsg, setSaveSuccessMsg] = useState(false);
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  // Grid element refs for keyboard focus management
  const cellRefs = useRef<Record<string, HTMLElement | null>>({});

  // Synchronize liveSessions into component state and select valid session
  useEffect(() => {
    setSessions(liveSessions);
    if (liveSessions.length > 0) {
      const exists = liveSessions.some((s) => String(s.id) === String(selectedSessionId));
      if (!exists || selectedSessionId === undefined) {
        const latestSession = liveSessions[liveSessions.length - 1];
        setSelectedSessionId(latestSession.id);
      }
    } else {
      setSelectedSessionId(undefined);
    }
  }, [liveSessions, selectedSessionId]);

  // Synchronize Knowledge Tag label for selected Session
  useEffect(() => {
    if (!selectedSessionId || !liveKnowledgeTags) return;
    const currentSess = liveSessions.find((s) => String(s.id) === String(selectedSessionId));
    if (!currentSess) return;

    if (currentSess.knowledge_tag_id) {
      const tag = liveKnowledgeTags.find((t) => t.id === currentSess.knowledge_tag_id);
      if (tag) {
        setCurrentKnowledgeTag(formatKnowledgeTagLabel(tag));
      } else if (currentSess.lesson_title.includes('-')) {
        const parts = currentSess.lesson_title.split('-');
        if (parts.length > 1) setCurrentKnowledgeTag(parts[0].trim());
      }
    } else if (currentSess.lesson_title.includes('-')) {
      const parts = currentSess.lesson_title.split('-');
      if (parts.length > 1) setCurrentKnowledgeTag(parts[0].trim());
    }
  }, [selectedSessionId, liveSessions, liveKnowledgeTags]);

  // Synchronize Students & StudentSession scores reactively from IndexedDB/Firestore
  useEffect(() => {
    if (!currentClass?.id) {
      setStudents([]);
      setStudentSessions({});
      return;
    }

    const activeLinks = liveClassStudents.filter((l) => !l.leave_date);
    const stIds = new Set(activeLinks.map((l) => String(l.student_id)));
    const validStudents = sortStudentsByName(
      liveStudents.filter((s) => s.id && stIds.has(String(s.id)) && s.status === 'studying')
    );
    setStudents(validStudents);

    if (selectedSessionId) {
      const sessIdStr = String(selectedSessionId);
      const scoreRecords = liveStudentSessions.filter(
        (ss) => String(ss.session_id) === sessIdStr
      );

      const recordMap: Record<string, StudentSession> = {};
      validStudents.forEach((st) => {
        const found = scoreRecords.find((r) => String(r.student_id) === String(st.id));
        if (found) {
          let comment = found.custom_comment || '';
          const isAbsent = typeof found.attendance === 'string' && found.attendance.startsWith('absent');
          const isHwMissingOrLate = found.homework_submitted === false || found.late_submit === true;
          const isExemptHW = found.exempt || (found as any).exempt_homework;

          if (isAbsent) {
            if (!comment) comment = ABSENT_DEFAULT_COMMENT;
          } else {
            comment = ensurePresentCommentFormat(comment, isHwMissingOrLate, !!isExemptHW);
          }
          recordMap[st.id!] = { ...found, custom_comment: comment };
        } else {
          recordMap[st.id!] = {
            student_id: st.id!,
            session_id: selectedSessionId,
            attendance: 'present',
            homework_score: undefined as any,
            test_score: undefined as any,
            homework_submitted: true,
            late_submit: false,
            makeup_test: false,
            exempt: false,
            quick_preset_comments: [],
            custom_comment: ensurePresentCommentFormat('', false, false),
            updated_at: new Date().toISOString(),
          };
        }
      });
      initialStudentSessionsRef.current = JSON.parse(JSON.stringify(recordMap));
      setStudentSessions(recordMap);
    } else {
      setStudentSessions({});
    }
  }, [currentClass?.id, selectedSessionId, liveClassStudents, liveStudents, liveStudentSessions]);

  // Helper to focus grid cell by row & col
  const focusCell = (row: number, col: number) => {
    const clampedRow = Math.max(0, Math.min(students.length - 1, row));
    const clampedCol = Math.max(0, Math.min(3, col));
    setActiveRow(clampedRow);
    setActiveCol(clampedCol);

    const key = `${clampedRow}-${clampedCol}`;
    const el = cellRefs.current[key];
    if (el) {
      el.focus();
      if ('select' in el && typeof (el as any).select === 'function') {
        (el as HTMLInputElement).select();
      }
    }
  };

  // Keyboard Navigation Handler
  const handleKeyDown = (
    e: React.KeyboardEvent,
    rowIndex: number,
    colIndex: number
  ) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        focusCell(rowIndex + 1, colIndex);
        break;

      case 'ArrowUp':
        e.preventDefault();
        focusCell(rowIndex - 1, colIndex);
        break;

      case 'Enter':
        if (e.target instanceof HTMLTextAreaElement) {
          if (e.shiftKey) {
            // Shift + Enter: Move to next student row
            e.preventDefault();
            if (rowIndex < students.length - 1) {
              focusCell(rowIndex + 1, colIndex);
            } else {
              focusCell(0, (colIndex + 1) % 4);
            }
          } else {
            // Plain Enter: Allow standard newline inside textarea
            return;
          }
        } else {
          e.preventDefault();
          // Move to next student row in same column
          if (rowIndex < students.length - 1) {
            focusCell(rowIndex + 1, colIndex);
          } else {
            // If at last row, move to next column or stay
            focusCell(0, (colIndex + 1) % 4);
          }
        }
        break;

      case 'ArrowRight':
        // Only move right if cursor is at the end of input or in select
        if (
          e.target instanceof HTMLSelectElement ||
          (e.target instanceof HTMLInputElement &&
            (e.target.selectionEnd === e.target.value.length || e.target.type === 'number')) ||
          (e.target instanceof HTMLTextAreaElement &&
            e.target.selectionEnd === e.target.value.length)
        ) {
          if (colIndex < 3) {
            e.preventDefault();
            focusCell(rowIndex, colIndex + 1);
          }
        }
        break;

      case 'ArrowLeft':
        if (
          e.target instanceof HTMLSelectElement ||
          (e.target instanceof HTMLInputElement &&
            (e.target.selectionStart === 0 || e.target.type === 'number')) ||
          (e.target instanceof HTMLTextAreaElement &&
            e.target.selectionStart === 0)
        ) {
          if (colIndex > 0) {
            e.preventDefault();
            focusCell(rowIndex, colIndex - 1);
          }
        }
        break;

      default:
        break;
    }
  };

  const handleUpdateStudentSession = useCallback((
    studentId: number,
    field: keyof StudentSession,
    value: any
  ) => {
    setStudentSessions((prev) => {
      const current = prev[studentId] || {
        student_id: studentId,
        session_id: selectedSessionId!,
        attendance: 'present',
        homework_score: undefined as any,
        test_score: undefined as any,
        homework_submitted: true,
        late_submit: false,
        makeup_test: false,
        exempt: false,
        quick_preset_comments: [],
        custom_comment: ensurePresentCommentFormat('', false, false),
        updated_at: new Date().toISOString(),
      };

      const updated = {
        ...current,
        [field]: value,
      };

      if (field === 'attendance') {
        if (value === 'absent_excused') {
          updated.exempt_homework = true;
          updated.homework_submitted = true;
          updated.homework_score = undefined as any;
          if (updated.test_score === undefined || updated.test_score === null) {
            updated.makeup_test = true;
          }
        } else if (value === 'absent_unexcused') {
          updated.exempt_homework = false;
          updated.exempt_test = false;
          updated.exempt = false;
          updated.homework_submitted = false;
          updated.homework_score = 0;
          updated.test_score = 0;
          updated.makeup_test = false;
          updated.late_submit = false;
        }
      } else if (field === 'exempt_homework') {
        if (value) {
          updated.homework_submitted = true;
          updated.homework_score = undefined as any;
          updated.late_submit = false;
        }
      } else if (field === 'exempt_test') {
        if (value) {
          updated.test_score = undefined as any;
          updated.makeup_test = false;
        }
      }

      let newComment = updated.custom_comment || '';

      if (field === 'custom_comment') {
        newComment = value;
      } else {
        const isAbsent = typeof updated.attendance === 'string' && updated.attendance.startsWith('absent');
        const isHwMissingOrLate = updated.homework_submitted === false || updated.late_submit === true;
        const isExemptHW = updated.exempt || updated.exempt_homework;

        if (isAbsent) {
          newComment = ensureAbsentCommentFormat(updated.custom_comment);
        } else {
          newComment = ensurePresentCommentFormat(updated.custom_comment, isHwMissingOrLate, !!isExemptHW);
        }
      }

      return {
        ...prev,
        [studentId]: {
          ...updated,
          custom_comment: newComment,
        },
      };
    });
  }, [selectedSessionId]);

  // 1-Click Preset Comment Appender
  const handleTogglePresetComment = useCallback((studentId: number, presetText: string) => {
    setStudentSessions((prev) => {
      const current = prev[studentId];
      if (!current) return prev;

      const list = current.quick_preset_comments || [];
      const exists = list.includes(presetText);
      const updatedList = exists ? list.filter((p) => p !== presetText) : [...list, presetText];

      const isAbsent = typeof current.attendance === 'string' && current.attendance.startsWith('absent');
      const isHwMissingOrLate = current.homework_submitted === false || current.late_submit === true;
      const isExemptHW = current.exempt || current.exempt_homework;

      let newComment = current.custom_comment || '';

      if (isAbsent) {
        newComment = updatedList.join('; ');
        newComment = addCommentSegment(newComment, ABSENT_DEFAULT_COMMENT);
      } else {
        newComment = addPresetToFormattedComment(newComment, presetText, !exists);
        newComment = ensurePresentCommentFormat(newComment, isHwMissingOrLate, !!isExemptHW);
      }

      return {
        ...prev,
        [studentId]: {
          ...current,
          quick_preset_comments: updatedList,
          custom_comment: newComment,
        },
      };
    });
  }, []);

  const handleSaveAllGrades = async () => {
    if (!selectedSessionId || !currentClass?.id) return;

    setSyncStatus('saving');
    const now = new Date().toISOString();
    const allRecords: StudentSession[] = Object.values(studentSessions);
    const initialMap = initialStudentSessionsRef.current;

    // Lọc chỉ những học sinh có thay đổi thực sự so với bản nạp ban đầu (Dirty Check)
    const dirtyRecords = allRecords.filter((rec: StudentSession) => {
      const initRec = initialMap[rec.student_id];
      if (!initRec || !rec.id) return true; // Bản ghi mới hoặc chưa lưu DB

      return (
        rec.attendance !== initRec.attendance ||
        rec.homework_score !== initRec.homework_score ||
        rec.test_score !== initRec.test_score ||
        rec.homework_submitted !== initRec.homework_submitted ||
        rec.late_submit !== initRec.late_submit ||
        rec.makeup_test !== initRec.makeup_test ||
        rec.exempt !== initRec.exempt ||
        rec.exempt_homework !== initRec.exempt_homework ||
        rec.exempt_test !== initRec.exempt_test ||
        (rec.custom_comment || '') !== (initRec.custom_comment || '') ||
        JSON.stringify(rec.quick_preset_comments || []) !== JSON.stringify(initRec.quick_preset_comments || [])
      );
    });

    if (dirtyRecords.length === 0) {
      // Không có thay đổi nào mới -> Không ghi thừa dữ liệu
      setSyncStatus('synced');
      setLastSyncedTime(new Date().toLocaleTimeString('vi-VN'));
      setSaveSuccessMsg(true);
      setTimeout(() => setSaveSuccessMsg(false), 3000);
      return;
    }

    const recordsToSave = dirtyRecords.map((rec: StudentSession) => ({
      student_id: rec.student_id,
      session_id: rec.session_id,
      attendance: rec.attendance,
      homework_score: rec.homework_score,
      test_score: rec.test_score,
      homework_submitted: rec.homework_submitted,
      late_submit: rec.late_submit,
      makeup_test: rec.makeup_test,
      exempt: rec.exempt,
      exempt_homework: rec.exempt_homework,
      exempt_test: rec.exempt_test,
      quick_preset_comments: rec.quick_preset_comments,
      custom_comment: rec.custom_comment,
      id: rec.id,
      updated_at: now,
    }));

    const backupSessions = JSON.parse(JSON.stringify(studentSessions));
    try {
      const updatedSessions = { ...studentSessions };

      // Pre-fetch existing sessions for this session_id from Dexie in 1 query
      const existingDbSessions = await db.student_sessions
        .where('session_id')
        .equals(selectedSessionId)
        .toArray();
      const existingMap = new Map(existingDbSessions.map((s) => [String(s.student_id), s]));

      const docsToBulkPut: any[] = [];

      for (const rec of recordsToSave) {
        let finalId = rec.id;

        if (!finalId) {
          const existing = existingMap.get(String(rec.student_id));
          if (existing) {
            finalId = existing.id;
          }
        }

        if (!finalId) {
          finalId = `ss_${rec.session_id}_${rec.student_id}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        }

        const payload = {
          ...rec,
          id: finalId,
        };

        docsToBulkPut.push(payload);

        if (rec.student_id) {
          updatedSessions[rec.student_id] = payload;
        }
      }

      // Bulk update IndexedDB
      if (docsToBulkPut.length > 0) {
        await db.student_sessions.bulkPut(docsToBulkPut);
        // Explicitly sync batch to Firestore for multi-device realtime visibility
        await pushBatchDocsToFirestore('student_sessions', docsToBulkPut);
      }

      setStudentSessions(updatedSessions);
      initialStudentSessionsRef.current = JSON.parse(JSON.stringify(updatedSessions));

      setSyncStatus('synced');
      setLastSyncedTime(new Date().toLocaleTimeString('vi-VN'));
      setSaveSuccessMsg(true);
      setTimeout(() => setSaveSuccessMsg(false), 3000);

      // 3. Asynchronously run secondary tasks (AuditLog, Knowledge Recalculation, Warning Engine) in background
      // so the UI save finishes instantly (<20ms) for the user!
      Promise.all([
        (async () => {
          const selectedSess = sessions.find((s) => s.id === selectedSessionId);
          await logAudit(
            'TA',
            'Nhập điểm tốc độ cao',
            `Lưu bảng điểm cho buổi học "${selectedSess?.lesson_title || selectedSessionId}" (Lớp ${currentClass.class_name}) - Cập nhật ${dirtyRecords.length} học sinh`
          );
        })(),
        recalculateKnowledgeResultsForClass(currentClass.id),
        runWarningScanForClass(String(currentClass.id)),
      ]).then(() => {
        onRefreshData();
      }).catch((err) => {
        console.warn('Background sync calculations warning:', err);
      });
    } catch (error) {
      console.error('Error saving grades:', error);
      // Rollback to prior UI state if saving crashes
      setStudentSessions(backupSessions);
      setSyncStatus('offline');
      alert('Có lỗi khi lưu dữ liệu. Đã khôi phục lại trạng thái trước khi lưu!');
    }
  };

  const handleCreateNewSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentClass?.id) return;

    const matchedTag = liveKnowledgeTags.find(
      (t) =>
        formatKnowledgeTagLabel(t) === newKnowledgeTag ||
        t.tag_name === newKnowledgeTag ||
        newKnowledgeTag.includes(t.tag_name)
    );

    const now = new Date().toISOString();
    const fullLessonTitle = `${newKnowledgeTag} - ${newLessonTitle}`;
    const sessionPayload = {
      class_id: currentClass.id,
      session_date: newSessionDate,
      lesson_title: fullLessonTitle,
      chapter: '',
      knowledge_tag_id: matchedTag ? matchedTag.id : undefined,
      homework_description: newHwDesc,
      test_knowledge_tag: newTestKnowledgeTag,
      has_homework: newHasHomework,
      has_test: newHasTest,
      created_at: now,
      updated_at: now,
    };
    const newId = await db.sessions.add(sessionPayload);

    await logAudit(
      'Teacher',
      'Tạo buổi học mới',
      `Tạo buổi học "${fullLessonTitle}" ngày ${newSessionDate} cho Lớp ${currentClass.class_name}`
    );

    setIsAddSessionOpen(false);
    setSelectedSessionId(newId);
    setCurrentKnowledgeTag(newKnowledgeTag);
    setNewTestKnowledgeTag('same');
    setIsNewTestTagCustom(false);

    // Refresh session list
    const updatedSessions = await db.sessions
      .where('class_id')
      .equals(currentClass.id)
      .sortBy('session_date');
    setSessions(updatedSessions);
  };

  const handleOpenEditSession = () => {
    const selectedSess = sessions.find((s) => s.id === selectedSessionId);
    if (!selectedSess) return;

    let kTag = tagOptions[0]?.label || 'Đại số 9 - Căn thức bậc hai & Rút gọn';
    let title = selectedSess.lesson_title;

    if (selectedSess.knowledge_tag_id) {
      const tag = liveKnowledgeTags.find((t) => t.id === selectedSess.knowledge_tag_id);
      if (tag) {
        kTag = formatKnowledgeTagLabel(tag);
      }
    }

    if (selectedSess.lesson_title.includes(' - ')) {
      const idx = selectedSess.lesson_title.indexOf(' - ');
      if (!selectedSess.knowledge_tag_id) {
        kTag = selectedSess.lesson_title.substring(0, idx).trim();
      }
      title = selectedSess.lesson_title.substring(idx + 3).trim();
    } else if (selectedSess.lesson_title.includes('-')) {
      const idx = selectedSess.lesson_title.indexOf('-');
      if (!selectedSess.knowledge_tag_id) {
        kTag = selectedSess.lesson_title.substring(0, idx).trim();
      }
      title = selectedSess.lesson_title.substring(idx + 1).trim();
    }

    setEditLessonTitle(title);
    setEditSessionDate(selectedSess.session_date);
    setEditHwDesc(selectedSess.homework_description || '');
    setEditKnowledgeTag(kTag);
    setEditTestKnowledgeTag(selectedSess.test_knowledge_tag || 'same');
    setIsEditTestTagCustom(false);
    setEditHasHomework(selectedSess.has_homework ?? true);
    setEditHasTest(selectedSess.has_test ?? true);
    setIsEditSessionOpen(true);
  };

  const handleSaveEditedSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSessionId || !currentClass?.id) return;

    const selectedSess = sessions.find((s) => s.id === selectedSessionId);
    if (!selectedSess) return;

    const matchedTag = liveKnowledgeTags.find(
      (t) =>
        formatKnowledgeTagLabel(t) === editKnowledgeTag ||
        t.tag_name === editKnowledgeTag ||
        editKnowledgeTag.includes(t.tag_name)
    );

    const now = new Date().toISOString();
    const fullLessonTitle = `${editKnowledgeTag} - ${editLessonTitle}`;

    await db.sessions.update(selectedSessionId, {
      session_date: editSessionDate,
      lesson_title: fullLessonTitle,
      chapter: '',
      knowledge_tag_id: matchedTag ? matchedTag.id : undefined,
      homework_description: editHwDesc,
      test_knowledge_tag: editTestKnowledgeTag,
      has_homework: editHasHomework,
      has_test: editHasTest,
      updated_at: now,
    });

    await logAudit(
      'Teacher',
      'Chỉnh sửa buổi học',
      `Sửa buổi học "${selectedSess.lesson_title}" thành "${fullLessonTitle}" ngày ${editSessionDate} (Lớp ${currentClass.class_name})`
    );

    setIsEditSessionOpen(false);
    setCurrentKnowledgeTag(editKnowledgeTag);

    // Refresh session list
    const updatedSessions = await db.sessions
      .where('class_id')
      .equals(currentClass.id)
      .sortBy('session_date');
    setSessions(updatedSessions);
  };

  const handleDeleteSession = async () => {
    if (!selectedSessionId || !currentClass?.id) return;
    const selectedSess = sessions.find((s) => String(s.id) === String(selectedSessionId));
    if (!selectedSess) return;

    if (
      window.confirm(
        `Bạn có chắc chắn muốn xóa vĩnh viễn buổi học "${selectedSess.lesson_title}"? Toàn bộ điểm số đã nhập của học sinh trong buổi học này cũng sẽ bị xóa vĩnh viễn.`
      )
    ) {
      const sessIdStr = String(selectedSessionId);

      // Find and delete matching student_sessions across Dexie
      const allStudSessions = await db.student_sessions.toArray();
      const targetStudSess = allStudSessions.filter(
        (ss) => String(ss.session_id) === sessIdStr
      );

      for (const ss of targetStudSess) {
        if (ss.id) {
          await db.student_sessions.delete(ss.id);
        }
      }

      // Delete session from Dexie (string or number ID)
      await (db.sessions as any).delete(selectedSessionId);
      await (db.sessions as any).delete(sessIdStr);

      await logAudit(
        'Teacher',
        'Xóa buổi học',
        `Xóa vĩnh viễn buổi học "${selectedSess.lesson_title}" (Lớp ${currentClass.class_name})`
      );

      setIsEditSessionOpen(false);

      // Refresh sessions
      const allSess = await db.sessions.toArray();
      const updatedSessions = allSess
        .filter((s) => String(s.class_id) === String(currentClass.id))
        .sort((a, b) => a.session_date.localeCompare(b.session_date));

      setSessions(updatedSessions);
      if (updatedSessions.length > 0) {
        setSelectedSessionId(updatedSessions[updatedSessions.length - 1].id);
      } else {
        setSelectedSessionId(undefined);
      }
    }
  };

  // Export PDF Report
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [isGeneratingBatchAi, setIsGeneratingBatchAi] = useState(false);

  // Module 4: Batch AI Comment Generation for the whole session
  const handleGenerateBatchAiComments = async () => {
    const selectedSess = sessions.find((s) => String(s.id) === String(selectedSessionId));
    if (!currentClass || !selectedSess) {
      alert('Vui lòng chọn lớp học và buổi học trước khi tạo nhận xét AI.');
      return;
    }

    if (students.length === 0) {
      alert('Danh sách lớp chưa có học sinh nào.');
      return;
    }

    if (!window.confirm(`Bạn có muốn sử dụng Gemini AI để tự động tạo nhận xét cá nhân hóa cho tất cả ${students.length} học sinh trong buổi học này không?\n\n(Hệ thống sẽ đọc điểm BTVN, Điểm KT và chuyên cần để sinh nhận xét sư phạm môn Toán)`)) {
      return;
    }

    try {
      setIsGeneratingBatchAi(true);

      const studentsPayload = students.map((st) => {
        const rec = studentSessions[st.id!] || {
          attendance: 'present',
          homework_submitted: true,
        };

        return {
          student_id: st.id!,
          student_name: st.full_name,
          attendance: rec.attendance || 'present',
          homework_submitted: rec.homework_submitted,
          homework_score: rec.homework_score,
          exempt_homework: rec.exempt || rec.exempt_homework,
          late_submit: rec.late_submit,
          test_score: rec.test_score,
          exempt_test: rec.exempt || rec.exempt_test,
          makeup_test: rec.makeup_test,
          existing_comment: rec.custom_comment,
        };
      });

      const res = await generateAICommentsForSession({
        sessionInfo: {
          className: currentClass.class_name,
          gradeLevel: currentClass.grade_level || 9,
          lessonTitle: selectedSess.lesson_title,
          testKnowledgeTag: selectedSess.test_knowledge_tag,
          homeworkDescription: selectedSess.homework_description,
        },
        studentsData: studentsPayload,
      });

      if (res.success && res.comments.length > 0) {
        // Cập nhật nhận xét vào state local cho từng học sinh
        setStudentSessions((prev) => {
          const next = { ...prev };
          res.comments.forEach((c) => {
            const numId = Number(c.student_id);
            if (next[numId]) {
              next[numId] = {
                ...next[numId],
                custom_comment: c.ai_comment,
              };
            }
          });
          return next;
        });

        await logAudit(
          'Teacher',
          'AI Tạo nhận xét hàng loạt',
          `Gemini AI sinh nhận xét cá nhân hóa cho ${res.comments.length} học sinh buổi "${selectedSess.lesson_title}" (Lớp ${currentClass.class_name})`
        );

        alert(`✅ Đã hoàn tất tạo nhận xét AI cho ${res.comments.length} học sinh! Bạn có thể chỉnh sửa lại trước khi bấm "Lưu Điểm".`);
      } else {
        alert(res.error || 'Không thể tạo nhận xét bằng AI. Vui lòng kiểm tra lại cấu hình API Key.');
      }
    } catch (err: any) {
      console.error('Batch AI Comments Error:', err);
      alert(err.message || 'Có lỗi xảy ra trong quá trình gọi AI.');
    } finally {
      setIsGeneratingBatchAi(false);
    }
  };

  const handleExportPDF = async () => {
    const selectedSess = sessions.find((s) => String(s.id) === String(selectedSessionId));
    if (!currentClass || !selectedSess) return;

    setIsExportingPDF(true);

    try {
      await logAudit(
        'Teacher',
        'In / Tải PDF Báo cáo buổi học',
        `Mở hộp thoại In trình duyệt cho lớp ${currentClass.class_name} buổi ${selectedSess.session_date}`
      );

      // Trigger standard browser print window, which naturally supports page-break-inside: avoid
      window.print();
    } catch (error) {
      console.error('Error triggering print:', error);
      alert('Có lỗi xảy ra khi mở hộp thoại in. Vui lòng sử dụng chức năng "Tải File PDF".');
    } finally {
      setIsExportingPDF(false);
    }
  };

  const handleDownloadDirectPDF = async () => {
    const selectedSess = sessions.find((s) => String(s.id) === String(selectedSessionId));
    if (!currentClass || !selectedSess) return;

    setIsExportingPDF(true);

    try {
      await logAudit(
        'Teacher',
        'In / Tải PDF Báo cáo buổi học',
        `Tải file PDF trực tiếp cho lớp ${currentClass.class_name} buổi ${selectedSess.session_date}`
      );

      await exportSessionReportPDF(
        currentClass,
        selectedSess,
        students,
        studentSessions
      );
    } catch (error) {
      console.error('Error downloading direct PDF:', error);
      alert('Có lỗi xảy ra khi xuất PDF. Vui lòng thử lại.');
    } finally {
      setIsExportingPDF(false);
    }
  };

  // Export Excel File
  const handleExportExcel = () => {
    const selectedSess = sessions.find((s) => s.id === selectedSessionId);
    if (!currentClass || !selectedSess) return;

    const exportData = students.map((st, idx) => {
      const rec = studentSessions[st.id!] || {};
      let attText = 'Có mặt';
      if (rec.attendance === 'absent_excused') attText = 'Vắng (Có phép)';
      else if (rec.attendance === 'absent_unexcused') attText = 'Vắng (KHÔNG PHÉP)';
      else if (rec.attendance === 'late') attText = 'Đi muộn';

      let warnStr = '';

      return {
        STT: idx + 1,
        'Họ và Tên': st.full_name,
        'Cảnh báo / Tuyên dương': warnStr,
        'Điểm danh': attText,
        'Điểm BTVN': (rec.exempt || rec.exempt_homework) ? 'Miễn' : (!rec.attendance || rec.attendance === 'present' || rec.attendance === 'late') ? (rec.homework_submitted === false ? 'Chưa làm' : rec.late_submit ? 'Nộp muộn' : rec.homework_score !== undefined && rec.homework_score !== null ? rec.homework_score : 'Chưa nhập') : '-',
        'Điểm Kiểm tra': (rec.exempt || rec.exempt_test) ? 'Miễn' : (!rec.attendance || rec.attendance === 'present' || rec.attendance === 'late') ? (rec.test_score !== undefined && rec.test_score !== null ? rec.test_score : 'Chờ chấm') : '-',
        'Nhận xét':
          rec.custom_comment ||
          (rec.quick_preset_comments ? rec.quick_preset_comments.join('; ') : ''),
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'BangDiem');
    XLSX.writeFile(
      workbook,
      `BangDiem_${currentClass.class_name.replace(/\s+/g, '_')}_${selectedSess.session_date}.xlsx`
    );
  };

  // Generate Radar Data for Knowledge Map
  const generateRadarData = () => {
    const topics = [
      'Căn thức & Rút gọn',
      'Hệ thức lượng',
      'Tứ giác nội tiếp',
      'Đường tròn & Tiếp tuyến',
      'Phương trình bậc 2 & Vi-ét',
      'Hằng đẳng thức & BĐS',
    ];

    if (selectedRadarStudentId === 'class_avg') {
      // Average across class
      return topics.map((topic, i) => {
        const scores = (Object.values(studentSessions) as StudentSession[])
          .map((ss) => ss.test_score)
          .filter((s): s is number => typeof s === 'number' && s >= 0);
        const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 7.5;
        // Mock variations per topic for realistic display
        const val = Math.min(10, Math.max(4, avg + (i % 2 === 0 ? 0.8 : -0.6)));
        return {
          topic,
          'Mức độ làm chủ': parseFloat(val.toFixed(1)),
          'Mục tiêu Lớp 10': 8.5,
        };
      });
    } else {
      const rec = studentSessions[selectedRadarStudentId as number];
      const hwScore = rec?.homework_score || 7.0;
      const testScore = rec?.test_score || 6.5;

      return topics.map((topic, i) => {
        const val = Math.min(10, Math.max(3, (hwScore * 0.4 + testScore * 0.6) + (i % 3 === 0 ? 1.0 : -0.8)));
        return {
          topic,
          'Mức độ làm chủ': parseFloat(val.toFixed(1)),
          'Mục tiêu Lớp 10': 8.5,
        };
      });
    }
  };

  const activeStudentForPreset = students[activeRow];

  return (
    <div id="ultra-fast-grade-entry-container" className="space-y-6">
      {/* Top Navigation & Class / Session Toolbar */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Keyboard className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              <span>Nhập Điểm Tốc Độ Cao</span>
            </h2>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsPrintModalOpen(true)}
              disabled={!selectedSessionId}
              className="px-3 py-2 bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800 rounded-xl text-xs font-bold hover:bg-rose-100 transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-50"
            >
              <FileDown className="w-4 h-4 text-rose-600" />
              <span>In / Báo Cáo PDF</span>
            </button>
          </div>
        </div>

        {/* Keyboard Shortcuts Banner */}
        {showKeyboardHelp && (
          <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs text-emerald-900 dark:text-emerald-200 space-y-2 relative animate-fadeIn">
            <button
              onClick={() => setShowKeyboardHelp(false)}
              className="absolute top-2.5 right-2.5 text-emerald-600 dark:text-emerald-400 hover:opacity-80"
            >
              <X className="w-4 h-4" />
            </button>
            <p className="font-bold flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-emerald-600" />
              Quy Trình Nhập Điểm Phím Tắt Tốc Độ Cao:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 text-[11px] font-mono">
              <div className="p-2 bg-white dark:bg-slate-900 rounded-lg border border-emerald-200 dark:border-emerald-800/60">
                <span className="font-bold text-emerald-700 dark:text-emerald-400">Arrow Down (↓) / Enter:</span>
                <p className="text-slate-600 dark:text-slate-400 mt-0.5">Xuống học sinh tiếp theo</p>
              </div>
              <div className="p-2 bg-white dark:bg-slate-900 rounded-lg border border-emerald-200 dark:border-emerald-800/60">
                <span className="font-bold text-emerald-700 dark:text-emerald-400">Arrow Up (↑):</span>
                <p className="text-slate-600 dark:text-slate-400 mt-0.5">Lên học sinh phía trên</p>
              </div>
              <div className="p-2 bg-white dark:bg-slate-900 rounded-lg border border-emerald-200 dark:border-emerald-800/60">
                <span className="font-bold text-emerald-700 dark:text-emerald-400">Arrow Left/Right (←/→):</span>
                <p className="text-slate-600 dark:text-slate-400 mt-0.5">Chuyển giữa các cột ô điểm</p>
              </div>
              <div className="p-2 bg-white dark:bg-slate-900 rounded-lg border border-emerald-200 dark:border-emerald-800/60">
                <span className="font-bold text-emerald-700 dark:text-emerald-400">1-Click Presets:</span>
                <p className="text-slate-600 dark:text-slate-400 mt-0.5">Bấm chip nhận xét Toán chèn tự động</p>
              </div>
            </div>
          </div>
        )}

        {/* Selectors Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
          {/* Class Select */}
          <div>
            <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
              Lớp Học
            </label>
            <select
              value={currentClass?.id || ''}
              onChange={(e) => onSelectClassId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {activeClasses.map((c, idx) => (
                <option key={c.id ? `${c.id}-${idx}` : idx} value={c.id}>
                  {c.class_name} (Khối {c.grade_level})
                </option>
              ))}
            </select>
          </div>

          {/* Session Select */}
          <div>
            <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
              Buổi Học Hiện Tại
            </label>
            <div className="flex gap-2">
              <select
                value={selectedSessionId || ''}
                onChange={(e) => setSelectedSessionId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {sessions.map((s, idx) => (
                  <option key={s.id ? `${s.id}-${idx}` : idx} value={s.id}>
                    {s.session_date} - {s.lesson_title}
                  </option>
                ))}
              </select>

              <button
                onClick={() => setIsAddSessionOpen(true)}
                className="px-3 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-all shrink-0 flex items-center gap-1"
                title="Tạo buổi học mới"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Thêm Buổi</span>
              </button>

              <button
                onClick={handleOpenEditSession}
                disabled={!selectedSessionId}
                className="px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1 disabled:opacity-50"
                title="Chỉnh sửa thông tin buổi học đang chọn"
              >
                <Edit3 className="w-4 h-4" />
                <span className="hidden sm:inline">Sửa Buổi</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main View Mode Selector Tabs */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('entry')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'entry'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Keyboard className="w-4 h-4" />
            <span>1. Bảng Nhập Điểm Tốc Độ Cao</span>
          </button>

          <button
            onClick={() => setActiveTab('knowledge_map')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'knowledge_map'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Target className="w-4 h-4" />
            <span>2. Bản Đồ Kiến Thức (Radar Chart)</span>
          </button>

          <button
            onClick={() => setActiveTab('gradebook')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'gradebook'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>3. Bảng Điểm Tổng Hợp & Miễn Trừ</span>
          </button>
        </div>

        {saveSuccessMsg && (
          <div className="px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800/80 rounded-xl text-xs font-bold flex items-center gap-1.5 animate-bounce">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Đã lưu thành công dữ liệu vào cơ sở dữ liệu IndexedDB!</span>
          </div>
        )}
      </div>

      {/* TAB 1: ULTRA-FAST GRADE ENTRY TABLE */}
      {activeTab === 'entry' && (
        <div className="space-y-6">
          {/* Mini Dashboard Session Stats Toolbar */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="p-3.5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
              <div>
                <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Sĩ số có mặt</div>
                <div className="text-base font-black text-slate-900 dark:text-slate-100 mt-0.5">
                  {sessionStats.present} / {sessionStats.total} <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">({sessionStats.presentPct}%)</span>
                </div>
              </div>
              <div className="p-2 bg-emerald-50 dark:bg-emerald-950/60 rounded-xl text-emerald-600 dark:text-emerald-400">
                <Users className="w-5 h-5" />
              </div>
            </div>

            <div className="p-3.5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
              <div>
                <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Nộp BTVN</div>
                <div className="text-base font-black text-slate-900 dark:text-slate-100 mt-0.5">
                  {selectedSession?.has_homework !== false ? (
                    `${sessionStats.hwDone} (${sessionStats.hwPct}%)`
                  ) : (
                    ''
                  )}
                </div>
              </div>
              <div className="p-2 bg-sky-50 dark:bg-sky-950/60 rounded-xl text-sky-600 dark:text-sky-400">
                <CheckSquare className="w-5 h-5" />
              </div>
            </div>

            <div className="p-3.5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
              <div>
                <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Điểm TB BTVN</div>
                <div className="text-base font-black text-slate-900 dark:text-slate-100 mt-0.5">
                  {selectedSession?.has_homework !== false ? (
                    <span>{sessionStats.avgHw} <span className="text-xs font-bold text-slate-400">/ 10</span></span>
                  ) : (
                    ''
                  )}
                </div>
              </div>
              <div className="p-2 bg-sky-50 dark:bg-sky-950/60 rounded-xl text-sky-600 dark:text-sky-400">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
            </div>

            <div className="p-3.5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
              <div>
                <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Điểm TB Kiểm Tra</div>
                <div className="text-base font-black text-slate-900 dark:text-slate-100 mt-0.5">
                  {selectedSession?.has_test !== false ? (
                    <div>
                      <span>{sessionStats.avgTest > 0 ? sessionStats.avgTest : '-'} <span className="text-xs font-bold text-slate-400">/ 10</span></span>
                      {sessionStats.pendingTestCount > 0 && (
                        <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 block mt-0.5">
                          ⏳ Chờ chấm {sessionStats.pendingTestCount} bài
                        </span>
                      )}
                    </div>
                  ) : (
                    ''
                  )}
                </div>
              </div>
              <div className="p-2 bg-purple-50 dark:bg-purple-950/60 rounded-xl text-purple-600 dark:text-purple-400">
                <Award className="w-5 h-5" />
              </div>
            </div>

            <div className="p-3.5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
              <div>
                <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Trạng thái Sync</div>
                <div className="text-xs font-bold mt-1 flex items-center gap-1.5">
                  {syncStatus === 'saving' ? (
                    <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Đang đồng bộ Cloud...
                    </span>
                  ) : syncStatus === 'synced' ? (
                    <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Đã lưu cục bộ IndexedDB {lastSyncedTime && `(${lastSyncedTime})`}
                    </span>
                  ) : (
                    <span className="text-slate-500 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" /> Lưu Cục bộ (Offline)
                    </span>
                  )}
                </div>
              </div>
              <div className={`p-2 rounded-xl ${
                syncStatus === 'synced'
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
                  : syncStatus === 'saving'
                  ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
              }`}>
                <Zap className="w-5 h-5" />
              </div>
            </div>
          </div>

          {/* Quick Preset Comments Header bar for Middle School Math */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex flex-wrap items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                  Bảng Nhận Xét Ngữ Cảnh Tự Động (Smart Preset Palette)
                </h3>
                {activeStudentForPreset && (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300">
                    HS #{activeRow + 1}: {activeStudentForPreset.full_name}
                  </span>
                )}
              </div>

              {/* Category Selector & Customization Controls */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                  <button
                    onClick={() => setActivePresetCategory('smart_ai')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                      activePresetCategory === 'smart_ai'
                        ? 'bg-emerald-600 text-white shadow-sm font-extrabold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    <Zap className="w-3.5 h-3.5 text-amber-300" />
                    <span>Gợi Ý Ngữ Cảnh AI</span>
                  </button>

                  <button
                    onClick={() => setActivePresetCategory('session')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                      activePresetCategory === 'session'
                        ? 'bg-amber-600 text-white shadow-sm font-extrabold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    <Tag className="w-3.5 h-3.5" />
                    <span>BTVN ({bTvnPresets.length})</span>
                  </button>

                  <button
                    onClick={() => setActivePresetCategory('test')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                      activePresetCategory === 'test'
                        ? 'bg-indigo-600 text-white shadow-sm font-extrabold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    <Award className="w-3.5 h-3.5" />
                    <span>Bài Kiểm Tra ({testPresets.length})</span>
                  </button>
                </div>

                {/* Inline Controls */}
                <button
                  onClick={() => setIsAddingPresetInline(!isAddingPresetInline)}
                  className="px-2.5 py-1.5 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs font-bold hover:bg-emerald-100 transition-all flex items-center gap-1"
                  title="Thêm nhận xét nhanh mới cho buổi học / danh mục đang chọn"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>Thêm Mới</span>
                </button>

                <button
                  onClick={() => setIsDeleteModeActive(!isDeleteModeActive)}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 border ${
                    isDeleteModeActive
                      ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200'
                  }`}
                  title="Bật/Tắt chế độ xóa bớt nhận xét"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{isDeleteModeActive ? 'Xong Xóa' : 'Xóa Bớt'}</span>
                </button>

                <button
                  onClick={() => setIsManagePresetsModalOpen(true)}
                  className="p-1.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-emerald-600 rounded-xl border border-slate-200 dark:border-slate-700 transition-all"
                  title="Tùy chỉnh toàn bộ bộ nhận xét"
                >
                  <SlidersHorizontal className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Inline Add Input */}
            {isAddingPresetInline && (
              <div className="p-2.5 bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center gap-2 animate-fadeIn">
                <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300 whitespace-nowrap">
                  Thêm nhận xét [{activePresetCategory === 'session' ? 'BTVN' : activePresetCategory === 'test' ? 'Bài Kiểm Tra' : 'Chung'}]:
                </span>
                <input
                  type="text"
                  value={newPresetTextInput}
                  onChange={(e) => setNewPresetTextInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddPreset();
                    if (e.key === 'Escape') setIsAddingPresetInline(false);
                  }}
                  placeholder="Gõ nhận xét tùy chỉnh cho buổi học..."
                  className="flex-1 px-3 py-1 bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-700 rounded-lg text-xs text-slate-900 dark:text-slate-100 outline-none font-medium"
                  autoFocus
                />
                <button
                  onClick={() => handleAddPreset()}
                  className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm"
                >
                  Thêm
                </button>
                <button
                  onClick={() => setIsAddingPresetInline(false)}
                  className="p-1 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Presets Chips */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {getCurrentActivePresetsList().length === 0 ? (
                <div className="text-xs text-slate-400 italic py-1 flex items-center gap-2">
                  <span>Chưa có nhận xét riêng nào cho danh mục này. Bấm </span>
                  <button
                    onClick={() => setIsAddingPresetInline(true)}
                    className="font-bold text-emerald-600 hover:underline inline-flex items-center gap-1"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span>Thêm Mới</span>
                  </button>
                  <span> để tạo nhận xét nhanh cho buổi học này!</span>
                </div>
              ) : (
                getCurrentActivePresetsList().map((presetText) => {
                  const currentRec = activeStudentForPreset
                    ? studentSessions[activeStudentForPreset.id!]
                    : null;
                  const isSelected = currentRec?.quick_preset_comments?.includes(presetText);

                  return (
                    <div key={presetText} className="relative group inline-flex items-center">
                      <button
                        onClick={() => {
                          if (isDeleteModeActive) {
                            handleDeletePreset(presetText);
                          } else if (activeStudentForPreset?.id) {
                            handleTogglePresetComment(activeStudentForPreset.id, presetText);
                          }
                        }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all flex items-center gap-1 ${
                          isSelected
                            ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30 font-bold'
                            : isDeleteModeActive
                            ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-700'
                        }`}
                      >
                        {isDeleteModeActive ? (
                          <X className="w-3.5 h-3.5 text-rose-600" />
                        ) : isSelected ? (
                          <Check className="w-3.5 h-3.5" />
                        ) : (
                          <Plus className="w-3.5 h-3.5" />
                        )}
                        <span>{presetText}</span>
                      </button>

                      {/* Hover delete button when delete mode is off */}
                      {!isDeleteModeActive && activePresetCategory !== 'smart_ai' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeletePreset(presetText);
                          }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity ml-0.5 p-1 text-slate-400 hover:text-rose-600"
                          title="Xóa nhận xét này"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Focus Filters & Search Bar */}
          <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
            {/* Focus Filter Pills */}
            <div className="flex flex-wrap items-center gap-1.5 w-full md:w-auto">
              <span className="text-[11px] font-extrabold uppercase text-slate-400 mr-1 flex items-center gap-1">
                <Filter className="w-3.5 h-3.5" /> Lọc nhanh:
              </span>

              <button
                onClick={() => setFocusFilter('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  focusFilter === 'all'
                    ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                }`}
              >
                Tất cả ({students.length})
              </button>

              <button
                onClick={() => setFocusFilter('no_hw')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  focusFilter === 'no_hw'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 hover:bg-amber-100'
                }`}
              >
                ⚠️ Thiếu/Muộn BTVN
              </button>

              <button
                onClick={() => setFocusFilter('low_test')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  focusFilter === 'low_test'
                    ? 'bg-rose-600 text-white shadow-sm'
                    : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 hover:bg-rose-100'
                }`}
              >
                📉 Kiểm tra &lt; 5 điểm
              </button>

              <button
                onClick={() => setFocusFilter('pending_test')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  focusFilter === 'pending_test'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'bg-purple-50 dark:bg-purple-950/40 text-purple-800 dark:text-purple-300 hover:bg-purple-100'
                }`}
              >
                ⏳ Chờ nhập điểm KT {sessionStats.pendingTestCount > 0 ? `(${sessionStats.pendingTestCount})` : ''}
              </button>

              <button
                onClick={() => setFocusFilter('absent')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  focusFilter === 'absent'
                    ? 'bg-sky-600 text-white shadow-sm'
                    : 'bg-sky-50 dark:bg-sky-950/40 text-sky-800 dark:text-sky-300 hover:bg-sky-100'
                }`}
              >
                ❌ Vắng mặt / Đi muộn
              </button>
            </div>

            {/* Search Input */}
            <div className="relative w-full md:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm học sinh / SĐT phụ huynh..."
                className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Grade Entry Table */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="max-h-[calc(100vh-280px)] min-h-[350px] overflow-auto relative">
              <table className="w-full text-left border-separate border-spacing-0">
                <thead className="sticky top-0 z-20 shadow-xs">
                  <tr className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] uppercase tracking-wider font-extrabold">
                    <th className="py-3 px-3 w-12 text-center sticky top-0 z-20 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">STT</th>
                    <th className="py-3 px-4 min-w-[170px] sticky top-0 z-20 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">Họ và Tên Học Sinh</th>
                    <th className="py-3 px-3 min-w-[140px] sticky top-0 z-20 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">Điểm Danh</th>
                    {selectedSession?.has_homework !== false && (
                      <th className="py-2 px-3 min-w-[150px] text-center sticky top-0 z-20 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                        <div>Điểm BTVN</div>
                        {previousSession ? (
                          <div className="text-[9px] text-emerald-600 dark:text-emerald-400 font-bold normal-case mt-0.5 tracking-normal">
                            (BTVN của: {(previousSession.lesson_title || '').includes(' - ') ? previousSession.lesson_title.split(' - ').slice(-1)[0] : (previousSession.lesson_title || 'Buổi trước')})
                          </div>
                        ) : (
                          <div className="text-[9px] text-slate-400 font-normal normal-case mt-0.5 tracking-normal">
                            (Buổi đầu tiên)
                          </div>
                        )}
                      </th>
                    )}
                    {selectedSession?.has_test !== false && (
                      <th className="py-2 px-3 min-w-[150px] text-center sticky top-0 z-20 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                        <div>Điểm Kiểm Tra</div>
                        {selectedSession?.test_knowledge_tag && selectedSession.test_knowledge_tag !== 'same' ? (
                          <div className="text-[9px] text-blue-600 dark:text-blue-400 font-bold normal-case mt-0.5 tracking-normal" title={selectedSession.test_knowledge_tag}>
                            (Chủ đề: {selectedSession.test_knowledge_tag})
                          </div>
                        ) : (
                          <div className="text-[9px] text-slate-400 font-normal normal-case mt-0.5 tracking-normal">
                            (Trùng chuyên đề bài học)
                          </div>
                        )}
                      </th>
                    )}
                    <th className="py-3 px-4 min-w-[280px] sticky top-0 z-20 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                      <div className="flex items-center justify-between gap-2">
                        <span>Nhận Xét & Preset Toán THCS</span>
                        <button
                          type="button"
                          onClick={handleGenerateBatchAiComments}
                          disabled={isGeneratingBatchAi || !selectedSessionId || students.length === 0}
                          className="px-2 py-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-lg text-[10px] font-extrabold transition-all shadow-xs flex items-center gap-1 normal-case tracking-normal disabled:opacity-50"
                          title="Tự động sinh nhận xét cá nhân hóa bằng Gemini AI cho toàn bộ học sinh trong lớp"
                        >
                          {isGeneratingBatchAi ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" />
                              <span>AI Đang viết...</span>
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-3 h-3 text-amber-300" />
                              <span>✨ AI Nhận xét cả lớp</span>
                            </>
                          )}
                        </button>
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
                  {filteredStudents.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400 font-medium">
                        Không tìm thấy học sinh nào phù hợp với bộ lọc.
                      </td>
                    </tr>
                  ) : (
                    filteredStudents.map((st, rowIndex) => {
                      const rec = studentSessions[st.id!] || {
                        student_id: st.id!,
                        session_id: selectedSessionId!,
                        attendance: 'present',
                        homework_score: undefined as any,
                        test_score: undefined as any,
                        custom_comment: '',
                        quick_preset_comments: [],
                      };

                      const isRowActive = activeRow === rowIndex;
                      const csLink = liveClassStudents.find((cs) => String(cs.student_id) === String(st.id));

                      return (
                        <GradeEntryRow
                          key={st.id ? `${st.id}-${rowIndex}` : rowIndex}
                          student={st}
                          rowIndex={rowIndex}
                          rec={rec}
                          isRowActive={isRowActive}
                          selectedSession={selectedSession}
                          classNameTitle={currentClass?.class_name}
                          gradeLevel={currentClass?.grade_level}
                          classStudent={csLink}
                          onSelectRow={(idx) => setActiveRow(idx)}
                          onFocusCell={(r, c) => {
                            setActiveRow(r);
                            setActiveCol(c);
                          }}
                          onKeyDown={handleKeyDown}
                          onUpdateSession={handleUpdateStudentSession}
                          cellRefs={cellRefs}
                        />
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Bottom Footer Action Bar */}
            <div className="p-4 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-xs text-slate-500 font-medium">
                Sĩ số: <strong className="text-slate-900 dark:text-slate-100">{students.length}</strong> học sinh | Buổi học: <strong className="text-emerald-600">{selectedSession?.lesson_title || 'Chưa chọn'}</strong>
              </div>

              <button
                id="btn-save-grades-bottom"
                onClick={handleSaveAllGrades}
                disabled={!selectedSessionId}
                className="w-full sm:w-auto px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-md shadow-emerald-600/20 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>Hoàn Tất & Lưu Điểm</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: KNOWLEDGE MAP RADAR CHART */}
      {activeTab === 'knowledge_map' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Award className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  <span>Chẩn Đoán Đa Chiều Năng Lực Môn Toán THCS</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Biểu đồ Radar chẩn đoán độ vững các chuyên đề Toán (Căn thức, Tứ giác nội tiếp, Vi-ét...) dựa trên điểm kiểm tra tích lũy.
                </p>
              </div>

              {/* Student Filter Selector for Radar */}
              <div className="w-full sm:w-auto">
                <label className="block text-[10px] font-extrabold uppercase text-slate-400 mb-1">
                  Chọn Học Sinh Phân Tích
                </label>
                <select
                  value={selectedRadarStudentId}
                  onChange={(e) =>
                    setSelectedRadarStudentId(
                      e.target.value === 'class_avg' ? 'class_avg' : e.target.value
                    )
                  }
                  className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="class_avg">📊 Trung Bình Toàn Lớp</option>
                  {students.map((st, idx) => (
                    <option key={st.id ? `${st.id}-${idx}` : idx} value={st.id}>
                      👤 {st.full_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Radar Chart Display */}
            <div className="h-[380px] w-full pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="80%" data={generateRadarData()}>
                  <PolarGrid stroke="#e2e8f0" />
                  <PolarAngleAxis dataKey="topic" tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }} />
                  <PolarRadiusAxis angle={30} domain={[0, 10]} stroke="#cbd5e1" />
                  <Radar
                    name="Mức độ làm chủ"
                    dataKey="Mức độ làm chủ"
                    stroke="#10b981"
                    fill="#10b981"
                    fillOpacity={0.4}
                  />
                  <Radar
                    name="Mục tiêu Lớp 10"
                    dataKey="Mục tiêu Lớp 10"
                    stroke="#0284c7"
                    fill="#0284c7"
                    fillOpacity={0.1}
                    strokeDasharray="4 4"
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderRadius: '12px',
                      color: '#fff',
                      fontSize: '12px',
                    }}
                  />
                  <Legend />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: GRADEBOOK & CYCLE ANALYTICS */}
      {activeTab === 'gradebook' && (
        <GradebookView
          currentClass={currentClass}
          sessions={sessions}
          students={students}
          studentSessions={liveStudentSessions || []}
        />
      )}

      {/* CREATE SESSION MODAL */}
      {isAddSessionOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 space-y-5 border border-slate-200 dark:border-slate-800 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Plus className="w-5 h-5 text-emerald-600" />
                <span>Thêm Buổi Học Mới</span>
              </h3>
              <button
                onClick={() => setIsAddSessionOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateNewSession} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Chuyên Đề Môn Toán (Knowledge Tag)
                </label>
                <select
                  value={newKnowledgeTag}
                  onChange={(e) => setNewKnowledgeTag(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {renderTagOptions(newKnowledgeTag)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Tên Tựa Đề Buổi Học
                </label>
                <input
                  type="text"
                  required
                  value={newLessonTitle}
                  onChange={(e) => setNewLessonTitle(e.target.value)}
                  placeholder="VD: Buổi 5: Chứng minh Tứ giác nội tiếp & Biến đổi Căn thức"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Ngày Học
                </label>
                <input
                  type="date"
                  required
                  value={newSessionDate}
                  onChange={(e) => setNewSessionDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Nhiệm Vụ BTVN Cho Buổi Sau
                </label>
                <textarea
                  rows={2}
                  value={newHwDesc}
                  onChange={(e) => setNewHwDesc(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Chủ Đề Bài Kiểm Tra Đầu Giờ (Tùy Chọn)
                </label>
                <select
                  value={isNewTestTagCustom ? '__custom__' : newTestKnowledgeTag}
                  onChange={(e) => {
                    if (e.target.value === '__custom__') {
                      setIsNewTestTagCustom(true);
                      setNewTestKnowledgeTag('');
                    } else {
                      setIsNewTestTagCustom(false);
                      setNewTestKnowledgeTag(e.target.value);
                    }
                  }}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {renderTestKnowledgeTagOptions(newTestKnowledgeTag)}
                </select>

                {isNewTestTagCustom && (
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="text"
                      required
                      value={newTestKnowledgeTag}
                      onChange={(e) => setNewTestKnowledgeTag(e.target.value)}
                      placeholder="Nhập tên chủ đề bài kiểm tra tùy chỉnh..."
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setIsNewTestTagCustom(false);
                        setNewTestKnowledgeTag('same');
                      }}
                      className="px-3 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-xl shrink-0"
                      title="Hủy nhập tùy chỉnh"
                    >
                      Hủy
                    </button>
                  </div>
                )}
              </div>

              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newHasHomework}
                    onChange={(e) => setNewHasHomework(e.target.checked)}
                    className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                  />
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Có BTVN</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newHasTest}
                    onChange={(e) => setNewHasTest(e.target.checked)}
                    className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                  />
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Có Kiểm tra đầu giờ</span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddSessionOpen(false)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold hover:bg-slate-200"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 shadow-md shadow-emerald-600/20"
                >
                  Tạo Buổi Học
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT SESSION MODAL */}
      {isEditSessionOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 space-y-5 border border-slate-200 dark:border-slate-800 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-amber-500" />
                <span>Chỉnh Sửa Thông Tin Buổi Học</span>
              </h3>
              <button
                onClick={() => setIsEditSessionOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditedSession} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Chuyên Đề Môn Toán (Knowledge Tag)
                </label>
                <select
                  value={editKnowledgeTag}
                  onChange={(e) => setEditKnowledgeTag(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {renderTagOptions(editKnowledgeTag)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Tên Tựa Đề Buổi Học
                </label>
                <input
                  type="text"
                  required
                  value={editLessonTitle}
                  onChange={(e) => setEditLessonTitle(e.target.value)}
                  placeholder="VD: Buổi 5: Chứng minh Tứ giác nội tiếp & Biến đổi Căn thức"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Ngày Học
                </label>
                <input
                  type="date"
                  required
                  value={editSessionDate}
                  onChange={(e) => setEditSessionDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Nhiệm Vụ BTVN Cho Buổi Sau
                </label>
                <textarea
                  rows={2}
                  value={editHwDesc}
                  onChange={(e) => setEditHwDesc(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Chủ Đề Bài Kiểm Tra Đầu Giờ (Tùy Chọn)
                </label>
                <select
                  value={isEditTestTagCustom ? '__custom__' : editTestKnowledgeTag}
                  onChange={(e) => {
                    if (e.target.value === '__custom__') {
                      setIsEditTestTagCustom(true);
                      setEditTestKnowledgeTag('');
                    } else {
                      setIsEditTestTagCustom(false);
                      setEditTestKnowledgeTag(e.target.value);
                    }
                  }}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {renderTestKnowledgeTagOptions(editTestKnowledgeTag, selectedSessionId)}
                </select>

                {isEditTestTagCustom && (
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="text"
                      required
                      value={editTestKnowledgeTag}
                      onChange={(e) => setEditTestKnowledgeTag(e.target.value)}
                      placeholder="Nhập tên chủ đề bài kiểm tra tùy chỉnh..."
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditTestTagCustom(false);
                        setEditTestKnowledgeTag('same');
                      }}
                      className="px-3 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-xl shrink-0"
                      title="Hủy nhập tùy chỉnh"
                    >
                      Hủy
                    </button>
                  </div>
                )}
              </div>

              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editHasHomework}
                    onChange={(e) => setEditHasHomework(e.target.checked)}
                    className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                  />
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Có BTVN</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editHasTest}
                    onChange={(e) => setEditHasTest(e.target.checked)}
                    className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                  />
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Có Kiểm tra đầu giờ</span>
                </label>
              </div>

              <div className="flex justify-between items-center pt-2">
                <button
                  type="button"
                  onClick={handleDeleteSession}
                  className="px-4 py-2 bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800 rounded-xl text-xs font-bold hover:bg-rose-100 transition-all flex items-center gap-1.5"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Xóa Buổi Học</span>
                </button>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditSessionOpen(false)}
                    className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold hover:bg-slate-200"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 shadow-md shadow-emerald-600/20"
                  >
                    Lưu Thay Đổi
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PRINT REPORT A4 MODAL */}
      {isPrintModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-4xl w-full p-6 space-y-6 border border-slate-200 dark:border-slate-800 shadow-2xl max-h-[90vh] overflow-y-auto">
            {/* Top Toolbar in Modal */}
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4 no-print">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <FileDown className="w-5 h-5 text-rose-600" />
                  <span>Xem Trước Báo Cáo Buổi Học (A4 Print Preview)</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Báo cáo chuẩn tiếng Việt 100% không lỗi chính tả, hỗ trợ In trực tiếp hoặc chụp ảnh gửi nhóm Phụ huynh Zalo.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportPDF}
                  disabled={isExportingPDF}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-md shadow-emerald-600/20 disabled:opacity-50"
                  title="In / Lưu thành PDF chuẩn A4 căn chỉnh lề hoàn hảo"
                >
                  <Award className="w-4 h-4" />
                  <span>{isExportingPDF ? 'Đang xuất Báo Cáo...' : '🖨️ In / Lưu PDF A4'}</span>
                </button>
                <button
                  onClick={handleDownloadDirectPDF}
                  disabled={isExportingPDF}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-md shadow-sky-600/20 disabled:opacity-50"
                  title="Tải nhanh file PDF vector không vỡ chữ, tự động tách trang chuẩn xác"
                >
                  <FileDown className="w-4 h-4" />
                  <span>📥 Tải File PDF</span>
                </button>
                <button
                  onClick={() => setIsPrintModalOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
                  title="Đóng"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* A4 Printable Area */}
            <div className="printable-a4-area bg-white text-slate-900 p-8 rounded-xl border border-slate-200 shadow-sm space-y-6 text-sm font-sans">
              {/* Report Header */}
              <div className="border-b-2 border-emerald-600 pb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
                    SMART EDU MANAGER - TOÁN THCS
                  </span>
                  <h1 className="text-xl font-black text-slate-900 uppercase tracking-tight mt-1.5">
                    BÁO CÁO KẾT QUẢ BUỔI HỌC TOÁN
                  </h1>
                  <p className="text-xs text-slate-600 font-medium mt-0.5">
                    Hệ thống Quản lý Lớp học & Cảnh báo Học tập Thông minh
                  </p>
                </div>
                <div className="text-right text-xs text-slate-600 space-y-0.5 bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <p><span className="font-bold text-slate-800">Ngày lập báo cáo:</span> {new Date().toLocaleDateString('vi-VN')}</p>
                  <p><span className="font-bold text-slate-800">Trợ giảng phụ trách:</span> {currentClass?.assistant_name || 'Thầy/Cô Toán THCS'}</p>
                  <p><span className="font-bold text-slate-800">Số điện thoại:</span> {currentClass?.assistant_phone || 'N/A'}</p>
                </div>
              </div>

              {/* Class & Session Detail Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs bg-slate-50/80 p-4 rounded-xl border border-slate-200">
                <div>
                  <p className="text-slate-500 font-medium">Lớp học:</p>
                  <p className="text-sm font-bold text-slate-900">{currentClass?.class_name} ({currentClass?.grade_level ? `Khối ${currentClass.grade_level}` : ''})</p>
                  <p className="text-slate-500 font-medium mt-2">Buổi học & Tựa đề:</p>
                  <p className="text-xs font-bold text-slate-900">{sessions.find(s => s.id === selectedSessionId)?.lesson_title || 'N/A'}</p>
                  <p className="text-slate-500 font-medium mt-2">Nội dung Bài tập về nhà (BTVN):</p>
                  <p className="text-xs font-semibold text-slate-800 bg-amber-50/80 text-amber-900 p-2 rounded-lg border border-amber-200/80 mt-0.5 whitespace-pre-line">
                    {sessions.find(s => s.id === selectedSessionId)?.homework_description || 'Không có BTVN giao về nhà'}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500 font-medium">Ngày diễn ra buổi học:</p>
                  <p className="text-sm font-bold text-slate-900">{sessions.find(s => s.id === selectedSessionId)?.session_date || 'N/A'}</p>
                  <p className="text-slate-500 font-medium mt-2">Chuyên đề Toán THCS:</p>
                  <p className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded inline-block mt-0.5">
                    {currentKnowledgeTag}
                  </p>
                </div>
              </div>

              {/* Attendance & Score Summary Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <p className="text-[11px] font-bold text-slate-500">Tổng số học sinh</p>
                  <p className="text-lg font-black text-slate-900">{students.length}</p>
                </div>
                <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                  <p className="text-[11px] font-bold text-emerald-700">Có mặt / Đi muộn</p>
                  <p className="text-lg font-black text-emerald-800">
                    {students.filter(s => {
                      const att = studentSessions[s.id!]?.attendance;
                      return !att || att === 'present' || att === 'late';
                    }).length}
                  </p>
                </div>
                <div className="p-3 bg-rose-50 rounded-lg border border-rose-200">
                  <p className="text-[11px] font-bold text-rose-700">Vắng mặt</p>
                  <p className="text-lg font-black text-rose-800">
                    {students.filter(s => {
                      const att = studentSessions[s.id!]?.attendance;
                      return att === 'absent_excused' || att === 'absent_unexcused';
                    }).length}
                  </p>
                </div>
                <div className="p-3 bg-sky-50 rounded-lg border border-sky-200">
                  <p className="text-[11px] font-bold text-sky-700">Điểm TB BTVN</p>
                  <p className="text-lg font-black text-sky-800">
                    {(() => {
                      if (selectedSession?.has_homework === false) return '';
                      let totalHw = 0;
                      let validCount = 0;

                      students.forEach(s => {
                        const rec = studentSessions[s.id!];
                        if (!rec || rec.attendance.startsWith('absent') || rec.exempt) return;
                        
                        if (rec.homework_submitted !== false && !rec.late_submit && rec.homework_score !== undefined) {
                          totalHw += rec.homework_score;
                          validCount++;
                        }
                      });

                      return validCount > 0 ? (totalHw / validCount).toFixed(1) : '-';
                    })()}
                  </p>
                </div>
                <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                  <p className="text-[11px] font-bold text-purple-700">Điểm TB Kiểm Tra</p>
                  <p className="text-lg font-black text-purple-800">
                    {(() => {
                      if (selectedSession?.has_test === false) return '';
                      let totalTest = 0;
                      let validCount = 0;

                      students.forEach(s => {
                        const rec = studentSessions[s.id!];
                        if (!rec || rec.attendance.startsWith('absent') || rec.exempt) return;
                        
                        if (rec.test_score !== undefined) {
                          totalTest += rec.test_score;
                          validCount++;
                        }
                      });

                      return validCount > 0 ? (totalTest / validCount).toFixed(1) : '-';
                    })()}
                  </p>
                </div>
              </div>

              {/* Student Roster Table */}
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-emerald-700 text-white font-bold text-[11px]">
                      <th className="p-2.5 border-b border-emerald-800 w-10 text-center">STT</th>
                      <th className="p-2.5 border-b border-emerald-800">Họ và tên Học sinh</th>
                      <th className="p-2.5 border-b border-emerald-800 text-center">Điểm danh</th>
                      {selectedSession?.has_homework !== false && (
                        <th className="p-2.5 border-b border-emerald-800 text-center w-20">Điểm BTVN</th>
                      )}
                      {selectedSession?.has_test !== false && (
                        <th className="p-2.5 border-b border-emerald-800 text-center w-20">Điểm KT</th>
                      )}
                      <th className="p-2.5 border-b border-emerald-800">Nhận xét chi tiết Thầy/Cô</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {students.map((student, idx) => {
                      const rec = studentSessions[student.id!] || {};
                      const isAttended = !rec.attendance || rec.attendance === 'present' || rec.attendance === 'late';
                      let attLabel = 'Có mặt';
                      let attBadgeClass = 'bg-emerald-100 text-emerald-800 font-bold';

                      if (rec.attendance === 'absent_excused') {
                        attLabel = 'Vắng (Có phép)';
                        attBadgeClass = 'bg-amber-100 text-amber-800 font-bold';
                      } else if (rec.attendance === 'absent_unexcused') {
                        attLabel = 'Vắng (KHÔNG PHÉP)';
                        attBadgeClass = 'bg-rose-100 text-rose-800 font-bold';
                      } else if (rec.attendance === 'late') {
                        attLabel = 'Đi muộn';
                        attBadgeClass = 'bg-blue-100 text-blue-800 font-bold';
                      }

                      const commentText = rec.custom_comment
                        ? rec.custom_comment
                        : rec.quick_preset_comments && rec.quick_preset_comments.length > 0
                        ? rec.quick_preset_comments.join('; ')
                        : 'Học tập tích cực, hoàn thành bài tốt.';

                      return (
                        <tr key={student.id || idx} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'} avoid-break`}>
                          <td className="p-2.5 text-center font-bold text-slate-500">{idx + 1}</td>
                          <td className="p-2.5 font-bold text-slate-900">{student.full_name}</td>
                          <td className="p-2.5 text-center">
                            <span className={`px-2 py-0.5 rounded text-[10px] ${attBadgeClass}`}>
                              {attLabel}
                            </span>
                          </td>
                          {selectedSession?.has_homework !== false && (
                            <td className="p-2.5 text-center font-bold text-slate-800">
                              {(() => {
                                if (!isAttended) return '-';
                                if (rec.exempt || rec.exempt_homework) {
                                  return (
                                    <span className="text-sky-600 font-extrabold block text-[10px] leading-tight">
                                      Miễn
                                    </span>
                                  );
                                }
                                if (rec.homework_submitted === false) {
                                  return (
                                    <span className="text-rose-600 font-extrabold block text-[10px] leading-tight">
                                      Chưa làm bài
                                    </span>
                                  );
                                }
                                if (rec.late_submit) {
                                  return (
                                    <span className="text-amber-600 font-extrabold block text-[10px] leading-tight">
                                      Nộp muộn
                                    </span>
                                  );
                                }
                                return rec.homework_score !== undefined && rec.homework_score !== null ? `${rec.homework_score}đ` : 'Chưa nhập';
                              })()}
                            </td>
                          )}
                          {selectedSession?.has_test !== false && (
                            <td className="p-2.5 text-center font-bold text-emerald-700">
                              {(() => {
                                if (!isAttended) return '-';
                                if (rec.exempt || rec.exempt_test) {
                                  return (
                                    <span className="text-sky-600 font-extrabold block text-[10px] leading-tight">
                                      Miễn
                                    </span>
                                  );
                                }
                                return rec.test_score !== undefined && rec.test_score !== null ? `${rec.test_score}đ` : <span className="text-purple-600 font-bold">Chờ chấm</span>;
                              })()}
                            </td>
                          )}
                          <td className="p-2.5 text-slate-700 text-[11px] leading-relaxed whitespace-pre-line">
                            {commentText}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Signatures & Footer Note */}
              <div className="pt-6 border-t border-slate-200 grid grid-cols-2 gap-8 text-center text-xs">
                <div>
                  <p className="font-bold text-slate-700">Đại diện Phụ huynh Học sinh</p>
                  <p className="text-[10px] text-slate-400 italic mt-0.5">(Ký và ghi rõ họ tên)</p>
                  <div className="h-16"></div>
                </div>
                <div>
                  <p className="font-bold text-slate-700">Giáo viên / Trợ giảng Phụ trách</p>
                  <p className="text-[10px] text-slate-400 italic mt-0.5">(Ký và xác nhận điểm số)</p>
                  <div className="h-16 flex items-end justify-center">
                    <span className="font-bold text-emerald-800 text-xs border-b border-emerald-800 pb-0.5">
                      {currentClass?.assistant_name || 'Thầy/Cô Toán THCS'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MANAGE PRESETS MODAL */}
      {isManagePresetsModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-xl w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-5 h-5 text-emerald-600" />
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Tùy Chỉnh Bộ Nhận Xét Nhanh (Giáo Viên &amp; Trợ Giảng)
                </h3>
              </div>
              <button
                onClick={() => setIsManagePresetsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <p className="text-slate-500 leading-relaxed">
                Tùy chỉnh danh sách các câu nhận xét 1-click. Nhận xét riêng buổi học được áp dụng cho buổi học hiện tại, trong khi các nhận xét Đại Số và Hình Học sẽ dùng làm mẫu chung.
              </p>

              {/* Modal Category Selector */}
              <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
                <button
                  onClick={() => setActivePresetCategory('session')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 ${
                    activePresetCategory === 'session'
                      ? 'bg-amber-600 text-white shadow-sm'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <Tag className="w-3.5 h-3.5" />
                  <span>Mẫu BTVN ({bTvnPresets.length})</span>
                </button>
                <button
                  onClick={() => setActivePresetCategory('test')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 ${
                    activePresetCategory === 'test'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <Award className="w-3.5 h-3.5" />
                  <span>Mẫu Bài Kiểm Tra ({testPresets.length})</span>
                </button>
              </div>

              {/* Preset Items List */}
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {getCurrentActivePresetsList().length === 0 ? (
                  <div className="p-4 text-center text-slate-400 italic bg-slate-50 dark:bg-slate-800/40 rounded-xl">
                    Chưa có nhận xét nào trong danh mục này. Hãy nhập bên dưới để thêm mới!
                  </div>
                ) : (
                  getCurrentActivePresetsList().map((preset, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2"
                    >
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {idx + 1}. {preset}
                      </span>
                      <button
                        onClick={() => handleDeletePreset(preset)}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-all"
                        title="Xóa nhận xét này"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Add New Preset Input */}
              <div className="flex gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <input
                  type="text"
                  value={newPresetTextInput}
                  onChange={(e) => setNewPresetTextInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddPreset()}
                  placeholder="Nhập nhận xét mới..."
                  className="flex-1 p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none font-medium text-slate-900 dark:text-slate-100"
                />
                <button
                  onClick={() => handleAddPreset()}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-md shadow-emerald-600/20"
                >
                  Thêm Mới
                </button>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  onClick={handleResetPresetsToDefault}
                  className="px-3 py-1.5 text-rose-600 hover:text-rose-700 font-bold flex items-center gap-1.5 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-all"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Khôi Phục Mặc Định THCS</span>
                </button>
                <button
                  onClick={() => setIsManagePresetsModalOpen(false)}
                  className="px-5 py-2 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-900 shadow-md"
                >
                  Hoàn Tất
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UltraFastGradeEntry;
