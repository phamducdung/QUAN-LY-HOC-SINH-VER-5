import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { Warning, Student, ClassItem, WarningRuleConfig, Session } from '../types';
import { db, seedDemoData } from '../db/dexie';
import { logAudit } from '../utils/auditLogger';
import { exportCycleReportPDF } from '../utils/pdfGenerator';
import { PrintableCycleReport } from './PrintableCycleReport';
import {
  runWarningScanForClass,
  DEFAULT_WARNING_RULE_CONFIG,
  calculateStudentStats,
} from '../utils/warningEngine';
import {
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Filter,
  PhoneCall,
  UserCheck,
  RefreshCw,
  X,
  MessageSquare,
  Copy,
  ExternalLink,
  Sparkles,
  Check,
  Sliders,
  Save,
  Info,
  Calendar,
  FileSpreadsheet,
  FileDown,
  BookOpen,
  PlusCircle,
  Award,
  Printer,
  Zap,
} from 'lucide-react';

interface WarningCenterProps {
  warnings: Warning[];
  students: Student[];
  classes: ClassItem[];
  onRefresh: () => void;
}

export const WarningCenter: React.FC<WarningCenterProps> = ({
  warnings,
  students,
  classes,
  onRefresh,
}) => {
  const [statusFilter, setStatusFilter] = useState<'unresolved' | 'resolved' | 'all'>('unresolved');
  const [priorityFilter, setPriorityFilter] = useState<'P1' | 'P2' | 'P3' | 'Praise' | 'all'>('all');
  const [selectedClassId, setSelectedClassId] = useState<number | 'all'>('all');

  // Sub Tab Navigation
  const [activeSubTab, setActiveSubTab] = useState<'warnings_list' | 'periodic_reports'>('warnings_list');

  // Periodic Report State
  const [reportClassId, setReportClassId] = useState<number | undefined>(undefined);
  const [cycles, setCycles] = useState<Array<{
    index: number;
    name: string;
    sessions: any[];
    dateRange: string;
    isCurrent: boolean;
  }>>([]);
  const [selectedCycleIndex, setSelectedCycleIndex] = useState<number | undefined>(undefined);

  // Compiled report results
  const [compiledStudents, setCompiledStudents] = useState<any[]>([]);
  const [classMetrics, setClassMetrics] = useState({
    avgAttendance: 0,
    avgHomework: 0,
    avgTest: 0,
    totalP1: 0,
    totalP2: 0,
    totalPraise: 0,
  });

  // AI Diagnostic for Cycle
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiReport, setAiReport] = useState<{
    knowledge_gap_summary: string;
    outstanding_students: string;
    critical_tutoring_students: string;
    general_feedback: string;
    parent_group_announcement: string;
  } | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [copiedAiAnnouncement, setCopiedAiAnnouncement] = useState(false);

  // Single Student Cycle Zalo Message Modal
  const [zaloSingleText, setZaloSingleText] = useState<string>('');
  const [isZaloSingleOpen, setIsZaloSingleOpen] = useState(false);
  const [copiedSingleSuccess, setCopiedSingleSuccess] = useState(false);
  const [singleStudentPhone, setSingleStudentPhone] = useState<string>('');

  // State for detailed student modal & smart knowledge gap mapping
  const [selectedDetailStudent, setSelectedDetailStudent] = useState<any | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [studentDetailSessions, setStudentDetailSessions] = useState<any[]>([]);
  const [studentActiveWarnings, setStudentActiveWarnings] = useState<Warning[]>([]);

  // Set default reportClassId
  useEffect(() => {
    if (classes.length > 0 && !reportClassId) {
      const firstActive = classes.find(c => c.status === 'active') || classes[0];
      if (firstActive?.id) {
        setReportClassId(firstActive.id);
      }
    }
  }, [classes, reportClassId]);

  // Load Cycles
  useEffect(() => {
    if (!reportClassId) return;

    async function loadCyclesAndData() {
      const sessions = await db.sessions.where('class_id').equals(reportClassId!).toArray();
      sessions.sort((a, b) => {
        const dateDiff = new Date(a.session_date).getTime() - new Date(b.session_date).getTime();
        if (dateDiff !== 0) return dateDiff;
        return (a.id || "").localeCompare(b.id || "");
      });

      const groupedCycles: any[] = [];
      const cycleLength = 4;

      for (let i = 0; i < sessions.length; i += cycleLength) {
        const cycleSessions = sessions.slice(i, i + cycleLength);
        const cycleIndex = Math.floor(i / cycleLength);

        let dateRange = '';
        if (cycleSessions.length > 0) {
          const startDate = new Date(cycleSessions[0].session_date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
          const endDate = new Date(cycleSessions[cycleSessions.length - 1].session_date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
          dateRange = `${startDate} - ${endDate}`;
        }

        const isCurrent = i + cycleLength >= sessions.length;

        groupedCycles.push({
          index: cycleIndex,
          name: `Chu kỳ ${cycleIndex + 1} (Buổi ${i + 1} - ${i + cycleSessions.length})`,
          sessions: cycleSessions,
          dateRange,
          isCurrent,
        });
      }

      setCycles(groupedCycles);

      if (groupedCycles.length > 0) {
        if (selectedCycleIndex === undefined || selectedCycleIndex >= groupedCycles.length) {
          setSelectedCycleIndex(groupedCycles.length - 1);
        }
      } else {
        setSelectedCycleIndex(undefined);
        setCompiledStudents([]);
        setAiReport(null);
      }
    }

    loadCyclesAndData();
  }, [reportClassId, warnings, students]);

  // Compile student metrics for the selected cycle
  useEffect(() => {
    if (selectedCycleIndex === undefined || cycles.length === 0 || !reportClassId) {
      setCompiledStudents([]);
      return;
    }

    const currentCycle = cycles.find(c => c.index === selectedCycleIndex);
    if (!currentCycle || currentCycle.sessions.length === 0) {
      setCompiledStudents([]);
      return;
    }

    async function compileCycleReport() {
      const cycleSessions = currentCycle.sessions;
      const sessionIds = cycleSessions.map(s => s.id!);

      const studentSessions = await db.student_sessions.where('session_id').anyOf(sessionIds).toArray();
      const classStudentRelations = await db.class_students
        .where('class_id')
        .equals(reportClassId!)
        .toArray()
        .then(relations => relations.filter(r => !r.leave_date));
      const studentIdsInClass = classStudentRelations.map(cs => cs.student_id);
      const classStudents = students.filter(s => studentIdsInClass.includes(s.id!));

      let totalAttendanceRateSum = 0;
      let totalHwSum = 0;
      let totalTestSum = 0;
      let hwCount = 0;
      let testCount = 0;
      let presentCountTotal = 0;
      let totalOpportunity = 0;

      let p1TotalCount = 0;
      let p2TotalCount = 0;
      let praiseTotalCount = 0;

      const studentData = classStudents.map(student => {
        const ssList = studentSessions.filter(ss => ss.student_id === student.id);

        const attendanceMap = cycleSessions.map(session => {
          const ss = ssList.find(ss => ss.session_id === session.id);
          return ss ? {
            attendance: ss.attendance,
            homework_score: ss.homework_score,
            test_score: ss.test_score,
            session_date: session.session_date,
            lesson_title: session.lesson_title,
          } : null;
        });

        const presentSessions = ssList.filter(ss => ss.attendance === 'present' || ss.attendance === 'late');
        const presentCount = presentSessions.length;
        const totalOpportunities = cycleSessions.length;
        const attendancePercent = totalOpportunities > 0 ? (presentCount / totalOpportunities) * 100 : 0;

        totalAttendanceRateSum += attendancePercent;
        presentCountTotal += presentCount;
        totalOpportunity += totalOpportunities;

        const hwSessions = ssList.filter(ss => {
          const session = cycleSessions.find(s => s.id === ss.session_id);
          return session?.has_homework !== false && ss.homework_score !== undefined && ss.homework_score >= 0;
        });
        const hwSum = hwSessions.reduce((acc, ss) => acc + ss.homework_score, 0);
        const hwAvg = hwSessions.length > 0 ? Number((hwSum / hwSessions.length).toFixed(1)) : 0;

        if (hwSessions.length > 0) {
          totalHwSum += hwAvg;
          hwCount++;
        }

        const testSessions = ssList.filter(ss => {
          const session = cycleSessions.find(s => s.id === ss.session_id);
          return session?.has_test !== false && ss.test_score !== undefined && ss.test_score >= 0;
        });
        const testSum = testSessions.reduce((acc, ss) => acc + ss.test_score, 0);
        const testAvg = testSessions.length > 0 ? Number((testSum / testSessions.length).toFixed(1)) : 0;

        if (testSessions.length > 0) {
          totalTestSum += testAvg;
          testCount++;
        }

        const unexcusedCount = ssList.filter(ss => ss.attendance === 'absent_unexcused').length;
        const missingHwCount = ssList.filter(ss => {
          const session = cycleSessions.find(s => s.id === ss.session_id);
          return session?.has_homework !== false && ss.attendance === 'present' && !ss.homework_submitted;
        }).length;
        const lowTestsCount = ssList.filter(ss => {
          const session = cycleSessions.find(s => s.id === ss.session_id);
          return session?.has_test !== false && ss.attendance === 'present' && ss.test_score < 5.0;
        }).length;

        let warningStatus: 'normal' | 'P1' | 'P2' | 'Praise' = 'normal';
        let warningReason = '';

        if (unexcusedCount >= 1 || missingHwCount >= 2 || lowTestsCount >= 2) {
          warningStatus = 'P1';
          const reasons: string[] = [];
          if (unexcusedCount >= 1) reasons.push(`Vắng không phép ${unexcusedCount}b`);
          if (missingHwCount >= 2) reasons.push(`Thiếu BTVN ${missingHwCount}b`);
          if (lowTestsCount >= 2) reasons.push(`Điểm kiểm tra < 5đ (${lowTestsCount}b)`);
          warningReason = reasons.join(', ');
          p1TotalCount++;
        } else if (testAvg > 0 && testAvg < 6.5) {
          warningStatus = 'P2';
          warningReason = `TB kiểm tra chu kỳ thấp (${testAvg}đ)`;
          p2TotalCount++;
        } else if (attendancePercent === 100 && hwAvg >= 8.5 && testAvg >= 8.5) {
          warningStatus = 'Praise';
          warningReason = `Tuyên dương: Xuất sắc (BTVN ${hwAvg}đ, Kiểm tra ${testAvg}đ, Chuyên cần 100%)`;
          praiseTotalCount++;
        }

        return {
          id: student.id,
          full_name: student.full_name,
          parent_name: student.parent_name,
          parent_phone: student.parent_phone,
          attendancePercent,
          attendanceMap,
          hwAvg,
          testAvg,
          warningStatus,
          warningReason,
        };
      });

      setCompiledStudents(studentData);
      setClassMetrics({
        avgAttendance: totalOpportunity > 0 ? Number(((presentCountTotal / totalOpportunity) * 100).toFixed(0)) : 100,
        avgHomework: hwCount > 0 ? Number((totalHwSum / hwCount).toFixed(1)) : 0,
        avgTest: testCount > 0 ? Number((totalTestSum / testCount).toFixed(1)) : 0,
        totalP1: p1TotalCount,
        totalP2: p2TotalCount,
        totalPraise: praiseTotalCount,
      });

      setAiReport(null);
      setAiError(null);
    }

    compileCycleReport();
  }, [selectedCycleIndex, cycles]);

  // AI analysis trigger
  const handleRunAiCycleReport = async () => {
    if (!reportClassId || selectedCycleIndex === undefined) return;
    const currentCycle = cycles.find(c => c.index === selectedCycleIndex);
    if (!currentCycle) return;

    setIsAiLoading(true);
    setAiError(null);

    try {
      const cls = classes.find(c => c.id === reportClassId);
      const className = cls?.class_name || 'Lớp Toán THCS';

      const sessionThemes = currentCycle.sessions.map(s => ({
        date: s.session_date,
        lesson_title: s.lesson_title,
        chapter: s.chapter,
      }));

      const studentSummaryList = compiledStudents.map(s => ({
        name: s.full_name,
        attendance_rate: `${s.attendancePercent}%`,
        homework_avg: s.hwAvg,
        test_avg: s.testAvg,
        warning_or_praise: s.warningStatus === 'normal' ? 'Bình thường' : `${s.warningStatus} (${s.warningReason})`,
      }));

      const settingsList = await db.settings.toArray();
      const apiKey = settingsList[0]?.gemini_api_key || '';

      const res = await fetch('/api/ai-cycle-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          className,
          cycleName: currentCycle.name,
          sessionThemes,
          classMetrics,
          studentSummaryList,
          userApiKey: apiKey,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Lỗi hệ thống khi phân tích báo cáo AI');
      }

      setAiReport(data.report);

      await logAudit(
        'Teacher',
        'Báo cáo chu kỳ AI',
        `Chạy phân tích AI cho ${currentCycle.name} của lớp ${className}`
      );
    } catch (err: any) {
      setAiError(err.message || 'Không thể kết nối Gemini AI. Vui lòng kiểm tra lại API Key.');
    } finally {
      setIsAiLoading(false);
    }
  };

  // Excel exporter
  const handleExportCycleExcel = async () => {
    if (compiledStudents.length === 0) return;
    const currentCycle = cycles.find(c => c.index === selectedCycleIndex);
    const cls = classes.find(c => c.id === reportClassId);
    const className = cls?.class_name || 'Lớp';

    const data = compiledStudents.map((s, idx) => ({
      'STT': idx + 1,
      'Họ và tên': s.full_name,
      'Chuyên cần (%)': `${s.attendancePercent}%`,
      'TB BTVN (Điểm)': s.hwAvg,
      'TB Kiểm tra (Điểm)': s.testAvg,
      'Đánh giá / Cảnh báo': s.warningReason || 'Bình thường',
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Báo cáo chu kỳ');
    XLSX.writeFile(workbook, `Bao_Cao_Chu_Ky_${className.replace(/\s+/g, '_')}_${currentCycle?.name.replace(/\s+/g, '_')}.xlsx`);

    await logAudit(
      'Teacher',
      'Xuất Excel Chu kỳ',
      `Xuất báo cáo Excel chu kỳ ${currentCycle?.name} cho lớp ${className}`
    );
  };

  // PDF exporter
  const handleExportCyclePDF = async () => {
    setIsPrintModalOpen(true);
  };

  // Single Zalo summary trigger
  const handleOpenZaloSingle = (student: any) => {
    const cls = classes.find(c => c.id === reportClassId);
    const currentCycle = cycles.find(c => c.index === selectedCycleIndex);
    const parentName = student.parent_name ? `anh/chị ${student.parent_name}` : 'Phụ huynh';

    let evaluationStr = 'Con có ý thức học tập rất tốt trong chu kỳ này!';
    if (student.warningStatus === 'P1') {
      evaluationStr = `⚠️ Cảnh báo chu kỳ: ${student.warningReason}. Nhờ phụ huynh sát sao đôn đốc con học tập và làm bài đầy đủ.`;
    } else if (student.warningStatus === 'P2') {
      evaluationStr = `⚠️ Lưu ý chu kỳ: ${student.warningReason}. Con cần tập trung hơn trong giờ kiểm tra.`;
    } else if (student.warningStatus === 'Praise') {
      evaluationStr = `🌟 Tuyên dương: ${student.warningReason}. Thành tích xuất sắc, tinh thần học tập gương mẫu!`;
    }

    const text = `Kính gửi ${parentName} em ${student.full_name},

Trung tâm Toán TCT trân trọng gửi báo cáo kết quả học tập của con trong ${currentCycle?.name} (${currentCycle?.dateRange || 'vừa qua'}):

📊 CHỈ SỐ HỌC TẬP CHU KỲ:
- Chuyên cần: ${student.attendancePercent}% (Số buổi học: ${student.attendanceMap.filter((a: any) => a !== null).length}/4)
- Trung bình Bài tập về nhà (BTVN): ${student.hwAvg > 0 ? student.hwAvg + 'đ' : 'Chưa nhập'}
- Trung bình Bài kiểm tra (KT): ${student.testAvg > 0 ? student.testAvg + 'đ' : 'Chưa nhập'}

📝 ĐÁNH GIÁ TỪ GIÁO VIÊN:
- ${evaluationStr}

Cảm ơn sự đồng hành sát sao từ quý gia đình trong thời gian qua để giúp con tiến bộ hơn mỗi ngày!`;

    setZaloSingleText(text);
    setSingleStudentPhone(student.parent_phone ? student.parent_phone.replace(/\s+/g, '') : '');
    setIsZaloSingleOpen(true);
    setCopiedSingleSuccess(false);
  };

  // Open detailed smart diagnosis for a single student with backward homework mapping
  const handleOpenStudentDetail = async (student: any) => {
    if (!reportClassId) return;

    // Fetch all sessions of this class, sorted by date/id
    const allSessions = await db.sessions.where('class_id').equals(reportClassId).toArray();
    allSessions.sort((a, b) => {
      const dateDiff = new Date(a.session_date).getTime() - new Date(b.session_date).getTime();
      if (dateDiff !== 0) return dateDiff;
      return (a.id || "").localeCompare(b.id || "");
    });

    const currentCycle = cycles.find(c => c.index === selectedCycleIndex);
    if (!currentCycle) return;

    const cycleSessions = currentCycle.sessions;

    // Fetch student_sessions
    const allStudentSessions = await db.student_sessions
      .where('student_id')
      .equals(student.id)
      .toArray();

    // Fetch current unresolved warnings
    const activeWarns = await db.warnings
      .where({ student_id: student.id, class_id: reportClassId, resolved: 0 })
      .toArray();
    setStudentActiveWarnings(activeWarns);

    // Build smart diagnostic mapping
    const detailedList = cycleSessions.map((session) => {
      const curSS = allStudentSessions.find(ss => ss.session_id === session.id);

      // Find the next session in sequence for homework score retrieval
      const curIndexInAll = allSessions.findIndex(s => s.id === session.id);
      const nextSession = curIndexInAll !== -1 && curIndexInAll < allSessions.length - 1 
        ? allSessions[curIndexInAll + 1] 
        : null;

      const nextSS = nextSession 
        ? allStudentSessions.find(ss => ss.session_id === nextSession.id)
        : null;

      // Extract Knowledge Tag
      let knowledgeTag = 'Đại số 9 - Căn thức bậc hai';
      let titleOnly = session.lesson_title;
      if (session.lesson_title.includes(' - ')) {
        const parts = session.lesson_title.split(' - ');
        knowledgeTag = parts[0].trim();
        titleOnly = parts.slice(1).join(' - ').trim();
      } else if (session.lesson_title.includes('-')) {
        const parts = session.lesson_title.split('-');
        knowledgeTag = parts[0].trim();
        titleOnly = parts.slice(1).join('-').trim();
      }

      const testScore = curSS?.test_score;
      const hwScore = nextSS?.homework_score;
      const hwSubmitted = nextSS?.homework_submitted;
      const hwLate = nextSS?.late_submit;
      const hwExempt = nextSS?.exempt || nextSS?.exempt_homework || false;

      // Pedagogical Diagnostic
      let masteryStatus: 'excellent' | 'good' | 'practice_needed' | 'imbalanced' | 'weak' | 'pending' = 'pending';
      let diagnosticMessage = '';

      const isAttended = curSS && (curSS.attendance === 'present' || curSS.attendance === 'late');
      const hasTest = testScore !== undefined && testScore >= 0 && isAttended && !(curSS?.exempt || curSS?.exempt_test);
      const hasHw = hwScore !== undefined && hwScore >= 0 && nextSS && !hwExempt;

      if (hasTest && hasHw) {
        if (testScore >= 8.0 && hwScore >= 8.0) {
          masteryStatus = 'excellent';
          diagnosticMessage = '🌟 Xuất sắc: Con vững vàng chuyên đề này, hoàn thành BTVN rất chỉn chu.';
        } else if (testScore >= 6.5 && hwScore >= 6.5) {
          masteryStatus = 'good';
          diagnosticMessage = '✅ Khá: Con nắm chắc bài học, kỹ năng làm bài tốt.';
        } else if (testScore >= 5.0 && hwScore < 5.0) {
          masteryStatus = 'practice_needed';
          diagnosticMessage = '⚠️ Chưa tự giác: Con hiểu bài trên lớp nhưng lười hoàn thành BTVN hoặc làm rất ẩu.';
        } else if (testScore < 5.0 && hwScore >= 8.0) {
          masteryStatus = 'imbalanced';
          diagnosticMessage = '⚠️ Lệch phong độ: Điểm BTVN tự làm tại nhà rất cao nhưng thi trực tiếp kém. Cần rèn tính tự lập.';
        } else {
          masteryStatus = 'weak';
          diagnosticMessage = '🚨 Yếu: Hổng kiến thức nặng cả trên lớp và bài tập về nhà. Cần kèm cặp gấp.';
        }
      } else if (hasTest) {
        if (testScore >= 8.0) {
          masteryStatus = 'excellent';
          diagnosticMessage = '🌟 Xuất sắc: Kết quả kiểm tra tại lớp đạt cao. Đang chờ kết quả chấm BTVN buổi sau.';
        } else if (testScore >= 5.0) {
          masteryStatus = 'good';
          diagnosticMessage = '✅ Hiểu bài học căn bản. Đang chờ chấm BTVN ở buổi học sau.';
        } else {
          masteryStatus = 'weak';
          diagnosticMessage = '🚨 Yếu: Điểm kiểm tra chưa đạt yêu cầu. Đang chờ chấm BTVN ở buổi học sau.';
        }
      } else {
        masteryStatus = 'pending';
        diagnosticMessage = curSS?.attendance === 'absent_unexcused' 
          ? '❌ Học sinh vắng học không phép buổi này, bỏ lỡ bài giảng và kiểm tra.'
          : curSS?.attendance === 'absent_excused'
          ? '🔵 Nghỉ học có phép. Cần xin lại phiếu học tập để làm bài bù gỡ điểm.'
          : 'Đang tích lũy điểm hoặc học sinh chưa được đánh giá.';
      }

      return {
        sessionId: session.id,
        sessionDate: session.session_date,
        lessonTitle: session.lesson_title,
        titleOnly,
        knowledgeTag,
        homeworkDescription: session.homework_description,
        attendance: curSS?.attendance || 'absent_unexcused',
        testScore,
        hwScore,
        hwSubmitted,
        hwLate,
        hwExempt,
        nextSessionDate: nextSession?.session_date,
        masteryStatus,
        diagnosticMessage,
        curSS,
      };
    });

    setStudentDetailSessions(detailedList);
    setSelectedDetailStudent(student);
    setIsDetailModalOpen(true);
  };

  // Modal State for Warning Rule Configuration
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [ruleConfig, setRuleConfig] = useState<WarningRuleConfig>(DEFAULT_WARNING_RULE_CONFIG);

  // Load Rule Config from DB Settings
  useEffect(() => {
    async function loadConfig() {
      const settingsList = await db.settings.toArray();
      if (settingsList.length > 0 && settingsList[0].warning_rule_config) {
        setRuleConfig(settingsList[0].warning_rule_config);
      }
    }
    loadConfig();
  }, []);

  // Modal State for Resolve Warning
  const [resolvingWarning, setResolvingWarning] = useState<Warning | null>(null);
  const [actionChoice, setActionChoice] = useState<string>('Đã gọi Phụ huynh');
  const [actionNotes, setActionNotes] = useState<string>('');
  const [checkedTasks, setCheckedTasks] = useState<string[]>([]);
  const [makeupScore, setMakeupScore] = useState<string>('8');

  // Modal State for Zalo Message
  const [zaloModalWarning, setZaloModalWarning] = useState<Warning | null>(null);
  const [zaloMessageText, setZaloMessageText] = useState<string>('');
  const [zaloTextSession, setZaloTextSession] = useState<string>('');
  const [zaloTextCycle, setZaloTextCycle] = useState<string>('');
  const [zaloMode, setZaloMode] = useState<'session' | 'cycle'>('cycle');
  const [copiedSuccess, setCopiedSuccess] = useState(false);

  // Cycle Range Selection States
  const [cycleClassId, setCycleClassId] = useState<string>('');
  const [cycleSessions, setCycleSessions] = useState<Session[]>([]);
  const [cycleStartIdx, setCycleStartIdx] = useState<number>(0);
  const [cycleEndIdx, setCycleEndIdx] = useState<number>(0);
  const [cycleIncompleteSessions, setCycleIncompleteSessions] = useState<{
    sessionTitle: string;
    date: string;
    sessionNum: number;
    missingInfo: string[];
  }[]>([]);

  const handleSwitchZaloMode = (mode: 'session' | 'cycle') => {
    setZaloMode(mode);
    setZaloMessageText(mode === 'session' ? zaloTextSession : zaloTextCycle);
    setCopiedSuccess(false);
  };

  // Scanning State
  const [isScanning, setIsScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);

  const filteredWarnings = warnings.filter((w) => {
    if (statusFilter === 'unresolved' && w.resolved) return false;
    if (statusFilter === 'resolved' && !w.resolved) return false;
    if (priorityFilter !== 'all' && w.priority !== priorityFilter) return false;
    if (selectedClassId !== 'all' && w.class_id !== selectedClassId) return false;
    return true;
  });

  // Save Warning Rule Config
  const handleSaveRuleConfig = async () => {
    const settingsList = await db.settings.toArray();
    if (settingsList.length > 0) {
      await db.settings.update(settingsList[0].id!, {
        warning_rule_config: ruleConfig,
        updated_at: new Date().toISOString(),
      });
    } else {
      await db.settings.add({
        warning_rule_config: ruleConfig,
        pronoun_config: { teacher_title: 'Thầy/Cô', teacher_name: 'Giáo viên', student_pronoun: 'Con' },
        theme: 'light',
        updated_at: new Date().toISOString(),
      });
    }

    setIsRuleModalOpen(false);
    setScanMessage('Đã lưu cấu hình quy tắc cảnh báo! Đang tiến hành quét lại...');
    await handleRunManualScan();
  };

  // Manual Trigger Auto Scan across all active classes
  const handleRunManualScan = async () => {
    setIsScanning(true);
    setScanMessage(null);
    let totalNew = 0;
    const activeClasses = classes.filter((c) => c.status === 'active');

    for (const c of activeClasses) {
      if (c.id) {
        const count = await runWarningScanForClass(c.id, ruleConfig);
        totalNew += count;
      }
    }

    setIsScanning(false);
    setScanMessage(`Quét hoàn tất! Phát hiện ${totalNew} cảnh báo mới.`);
    onRefresh();
    setTimeout(() => setScanMessage(null), 4000);
  };

  // Seed Comprehensive Test Scenarios for Warning Center Verification
  const handleSeedScenarios = async () => {
    setIsScanning(true);
    setScanMessage('Đang nạp dữ liệu điểm & các kịch bản thử nghiệm cảnh báo...');
    try {
      await seedDemoData();
      let totalNew = 0;
      const activeClasses = (await db.classes.where('status').equals('active').toArray());
      for (const c of activeClasses) {
        if (c.id) {
          const count = await runWarningScanForClass(c.id, ruleConfig);
          totalNew += count;
        }
      }
      setIsScanning(false);
      setScanMessage(`Đã khởi tạo bộ kịch bản thử nghiệm! Hệ thống quét ra ${totalNew} cảnh báo mới.`);
      onRefresh();
      setTimeout(() => setScanMessage(null), 5000);
    } catch (err) {
      console.error("Lỗi nạp kịch bản thử nghiệm:", err);
      setIsScanning(false);
      setScanMessage("Có lỗi xảy ra khi nạp dữ liệu kịch bản thử nghiệm.");
      setTimeout(() => setScanMessage(null), 4000);
    }
  };

  // Open Resolve Modal
  const handleOpenResolveModal = (w: Warning) => {
    setResolvingWarning(w);
    setActionChoice('Đã gọi Phụ huynh');
    setActionNotes('');
    setCheckedTasks([]);
    setMakeupScore('8');
  };

  const parseWarningDetails = (reason: string) => {
    const lessonMatch = reason.match(/• \*\*(.*?)\*\*/);
    const tagMatch = reason.match(/↳ Chuyên đề: (.*?)(?:\n|$)/);
    
    return {
      lessonName: lessonMatch ? lessonMatch[1] : '',
      tagName: tagMatch ? tagMatch[1].trim() : ''
    };
  };

  // Execute Resolve
  const handleExecuteResolve = async () => {
    if (!resolvingWarning) return;

    const student = students.find((s) => s.id === resolvingWarning.student_id);
    const studentName = student?.full_name || 'Học sinh';

    const details = parseWarningDetails(resolvingWarning.reason || '');
    const task1 = `Đã gọi điện/nhắn tin trao đổi riêng với phụ huynh về lỗ hổng ${details.lessonName || '[Tên bài học]'}`;
    const task2 = `Đã trợ giảng kèm bù kiến thức chuyên đề ${details.tagName || '[Chuyên đề]'}`;
    const task3 = `Đã cho làm lại bài tập đạt điểm ${makeupScore}/10`;

    const selectedActions: string[] = [];
    if (checkedTasks.includes('task1')) selectedActions.push(task1);
    if (checkedTasks.includes('task2')) selectedActions.push(task2);
    if (checkedTasks.includes('task3')) selectedActions.push(task3);

    let fullActionDesc = actionChoice;
    if (selectedActions.length > 0) {
      fullActionDesc += ` (${selectedActions.join('; ')})`;
    }
    if (actionNotes) {
      fullActionDesc += ` - Chi tiết ghi chú: ${actionNotes}`;
    }

    const now = new Date().toISOString();
    await db.warnings.update(resolvingWarning.id!, {
      resolved: true,
      resolved_action: fullActionDesc,
      updated_at: now,
    });

    // Record in Audit Log
    await logAudit(
      'Teacher',
      'Giải quyết cảnh báo',
      `Giải quyết cảnh báo [${resolvingWarning.warning_type}] cho học sinh ${studentName}: ${fullActionDesc}`
    );

    // Refresh active warnings list for student detail modal if it's open
    if (selectedDetailStudent && reportClassId) {
      const activeWarns = await db.warnings
        .where({ student_id: selectedDetailStudent.id, class_id: reportClassId, resolved: 0 })
        .toArray();
      setStudentActiveWarnings(activeWarns);
    }

    setResolvingWarning(null);
    setActionNotes('');
    onRefresh();
  };

  // Generate cycle text dynamically for a specific student, class & session range
  const generateCycleTextForRange = async (
    studentId: string,
    classId: string,
    startIdx: number,
    endIdx: number,
    w: Warning
  ) => {
    const student = students.find((s) => s.id === studentId);
    const cls = classes.find((c) => c.id === classId);
    const studentName = student?.full_name || 'em';
    const parentName = student?.parent_name ? `anh/chị ${student.parent_name}` : 'Phụ huynh';

    const classSessions = await db.sessions.where('class_id').equals(classId).toArray();
    const sortedClassSessions = [...classSessions].sort((a, b) => a.session_date.localeCompare(b.session_date));

    if (sortedClassSessions.length === 0) {
      return `Kính gửi ${parentName} em ${studentName},\nTrung tâm Toán TCT thông báo: Hiện chưa có dữ liệu buổi học cho lớp ${cls?.class_name || ''}.`;
    }

    const validStart = Math.max(0, Math.min(startIdx, sortedClassSessions.length - 1));
    const validEnd = Math.max(validStart, Math.min(endIdx, sortedClassSessions.length - 1));

    const slicedClassSessions = sortedClassSessions.slice(validStart, validEnd + 1);
    const slicedSessionIds = new Set(slicedClassSessions.map((s) => s.id));

    const allStudentSessions = await db.student_sessions.where('student_id').equals(studentId).toArray();
    const slicedStudentSessions = allStudentSessions.filter((ss) => slicedSessionIds.has(ss.session_id));

    // Validate completeness of session records for the selected range
    const incompleteList: { sessionTitle: string; date: string; sessionNum: number; missingInfo: string[] }[] = [];

    slicedClassSessions.forEach((sess, idx) => {
      const ss = slicedStudentSessions.find((s) => s.session_id === sess.id);
      const missingInfo: string[] = [];

      if (!ss || !ss.attendance) {
        missingInfo.push('Chưa điểm danh');
      } else if (ss.attendance === 'present' || ss.attendance === 'late') {
        if (sess.has_homework !== false && !ss.exempt && !ss.exempt_homework) {
          if (ss.homework_submitted === undefined) {
            missingInfo.push('Chưa nộp/kiểm tra BTVN');
          } else if (ss.homework_submitted && ss.homework_score === undefined) {
            missingInfo.push('Chưa nhập điểm BTVN');
          }
        }
        if (sess.has_test !== false && !ss.exempt && !ss.exempt_test) {
          if (ss.test_score === undefined && !ss.makeup_test) {
            missingInfo.push('Chưa nhập điểm Kiểm tra');
          }
        }
      }

      if (missingInfo.length > 0) {
        incompleteList.push({
          sessionTitle: sess.lesson_title,
          date: sess.session_date,
          sessionNum: validStart + idx + 1,
          missingInfo,
        });
      }
    });

    setCycleIncompleteSessions(incompleteList);

    const stats = calculateStudentStats(studentId, slicedClassSessions, slicedStudentSessions, ruleConfig);

    const firstSess = slicedClassSessions[0];
    const lastSess = slicedClassSessions[slicedClassSessions.length - 1];
    const countInSlice = slicedClassSessions.length;

    const cycleRangeStr = firstSess && lastSess
      ? `Buổi ${validStart + 1} (${firstSess.session_date}) -> Buổi ${validEnd + 1} (${lastSess.session_date})`
      : `Tích lũy ${stats.totalSessions} buổi`;

    const statsSummary = `📊 KẾT QUẢ TỔNG HỢP CHU KỲ (${countInSlice} BUỔI):
- Tỷ lệ chuyên cần: ${stats.presentCount}/${countInSlice} buổi (${Math.round((stats.presentCount / (countInSlice || 1)) * 100)}%)
- Điểm TB Bài kiểm tra (Trọng số 60%): ${stats.testAverage}đ
- Điểm TB Bài tập về nhà (Trọng số 40%): ${stats.hwAverage}đ
🎯 Điểm TB Tổng hợp Chu kỳ: ${stats.weightedAverage}đ`;

    const sortedStudentSessions = [...slicedStudentSessions].sort((a, b) => {
      const sa = slicedClassSessions.find((s) => s.id === a.session_id);
      const sb = slicedClassSessions.find((s) => s.id === b.session_id);
      if (!sa || !sb) return 0;
      return sa.session_date.localeCompare(sb.session_date);
    });

    const weakSessionItems: string[] = [];
    const weakTopicsSet = new Set<string>();
    const processedSessionIds = new Set<string>();
    let hasMissingHw = false;
    let hasLowScore = false;
    let hasAbsence = false;

    sortedStudentSessions.forEach((ss) => {
      if (!ss.session_id || processedSessionIds.has(ss.session_id)) return;
      processedSessionIds.add(ss.session_id);

      const sess = slicedClassSessions.find((s) => s.id === ss.session_id);
      if (!sess) return;

      const isAbsent = ss.attendance === 'absent_unexcused' || ss.attendance === 'absent_excused';
      const isHwWeak = sess.has_homework !== false && !ss.exempt && !ss.exempt_homework && (!ss.homework_submitted || (ss.homework_score !== undefined && ss.homework_score < 5));
      const isTestWeak = sess.has_test !== false && !ss.exempt && !ss.exempt_test && (ss.test_score !== undefined && ss.test_score < 5);
      const hasComments = (ss.quick_preset_comments && ss.quick_preset_comments.length > 0) || !!ss.custom_comment;

      if (isAbsent || isHwWeak || isTestWeak || hasComments) {
        let chTag = sess.test_knowledge_tag && sess.test_knowledge_tag !== 'same' ? sess.test_knowledge_tag : '';
        if (!chTag) {
          const lTitle = sess?.lesson_title || '';
          chTag = lTitle.includes(' - ') ? lTitle.split(' - ').slice(-1)[0] : 'Đại số & Hình học';
        }
        if (chTag) weakTopicsSet.add(chTag);

        if (isAbsent) hasAbsence = true;
        if (isHwWeak) hasMissingHw = true;
        if (isTestWeak) hasLowScore = true;

        const remarksList = [...(ss.quick_preset_comments || [])];
        if (ss.custom_comment) remarksList.push(ss.custom_comment);
        const remarksStr = remarksList.length > 0 ? remarksList.join(', ') : 'Cần chú ý ôn tập thêm';

        let hwStr = 'Chưa nộp';
        if (ss.exempt || ss.exempt_homework) {
          hwStr = 'Miễn';
        } else if (ss.homework_submitted) {
          hwStr = ss.homework_score !== undefined ? `${ss.homework_score}đ` : 'Đã nộp';
        }
        let testStr = ss.test_score !== undefined ? `${ss.test_score}đ` : 'Chưa kiểm tra';
        if (ss.exempt || ss.exempt_test) {
          testStr = 'Miễn';
        }

        if (isAbsent) {
          testStr = ss.attendance === 'absent_unexcused' ? 'Nghỉ không phép' : 'Nghỉ có phép';
          hwStr = 'Vắng mặt';
        }

        weakSessionItems.push(
          `• Bài: ${sess.lesson_title} (${sess.session_date})\n  ↳ Chuyên đề: ${chTag}\n  ↳ Kết quả: BTVN: ${hwStr} | Kiểm tra: ${testStr}\n  ↳ Nhận xét: ${remarksStr}`
        );
      }
    });

    let weakTopicsSection = '';
    if (weakSessionItems.length > 0) {
      weakTopicsSection = `\n📌 CHI TIẾT BÀI HỌC & CHUYÊN ĐỀ CẦN LƯU Ý:\n${weakSessionItems.join('\n')}\n`;
    }

    const actionAdviceList: string[] = [];
    if (hasMissingHw) {
      actionAdviceList.push('• Đôn đốc em hoàn thành nộp bổ sung Bài tập về nhà cho Thầy/Cô trước buổi học tới.');
    }
    if (hasLowScore || weakTopicsSet.size > 0) {
      const topicsStr = Array.from(weakTopicsSet).join(', ') || 'Chuyên đề môn Toán';
      actionAdviceList.push(`• Hướng dẫn em xem lại lý thuyết & luyện tập thêm các dạng bài thuộc Chuyên đề: ${topicsStr}.`);
    }
    if (hasAbsence) {
      actionAdviceList.push('• Nhắc em mượn vở bạn chép bài đầy đủ và lấy phiếu bài tập của các buổi nghỉ.');
    }
    if (actionAdviceList.length === 0) {
      actionAdviceList.push('• Kiểm tra góc học tập và đôn đốc em duy trì thói quen ôn bài cũ 20 phút mỗi ngày.');
    }

    const actionGuideSection = `\n💡 HƯỚNG KHẮC PHỤC DÀNH CHO PHỤ HUYNH:\n${actionAdviceList.join('\n')}\n`;

    const isPraise = w.priority === 'Praise';
    const cleanReasonFull = (w.reason || '').replace(/\*\*/g, '').replace(/\[CHI TIẾT LỖ HỔNG TRUY VẾT\]:/g, '').trim();
    const primaryReasonRaw = cleanReasonFull.split('\n')[0].trim();
    // Tách phần danh sách buổi phía sau dấu hai chấm để không lặp lại danh sách buổi đã có ở mục bên dưới
    const primaryReasonSummary = primaryReasonRaw.includes(': Buổi')
      ? primaryReasonRaw.split(': Buổi')[0].trim()
      : primaryReasonRaw;

    const normWarnType = (w.warning_type || '').replace(/^[🔴🟡🟢⚡📊⚠️\s]+/, '').trim().toLowerCase();
    const normReason = primaryReasonSummary.replace(/^[🔴🟡🟢⚡📊⚠️\s]+/, '').trim().toLowerCase();

    let warningHeaderBlock = '';
    if (isPraise) {
      warningHeaderBlock = `🌟 THÀNH TÍCH XUẤT SẮC: ${w.warning_type}`;
    } else {
      if (normReason && normReason !== normWarnType && !normWarnType.includes(normReason)) {
        warningHeaderBlock = `⚠️ NỘI DUNG CẢNH BÁO: ${w.warning_type}\n- Ghi chú: ${primaryReasonSummary}`;
      } else {
        warningHeaderBlock = `⚠️ NỘI DUNG CẢNH BÁO: ${w.warning_type}`;
      }
    }

    return isPraise
      ? `Kính gửi ${parentName} em ${studentName},

Trung tâm Toán TCT trân trọng gửi lời TUYÊN DƯƠNG đến em ${studentName} (Lớp ${cls?.class_name || 'Toán'}):

${warningHeaderBlock}

${statsSummary}

Thầy/Cô tuyên dương tinh thần nỗ lực học tập tuyệt vời của em ${studentName} và mong em tiếp tục giữ vững phong độ xuất sắc! Xin chân thành cảm ơn PH!`
      : `Kính gửi ${parentName} em ${studentName},

Trung tâm Toán TCT xin thông báo báo cáo học tập định kỳ Chu kỳ ${countInSlice} buổi (${cycleRangeStr} - Lớp ${cls?.class_name || 'Toán'}):

${warningHeaderBlock}

${statsSummary}
${weakTopicsSection}
${actionGuideSection}
Rất mong Quý Phụ huynh phối hợp cùng Trung tâm đôn đốc em ${studentName} ôn tập để giúp em nhanh chóng tiến bộ. Xin chân thành cảm ơn PH!`;
  };

  // Handle Changing Class in Cycle Range Picker
  const handleCycleClassChange = async (newClassId: string) => {
    setCycleClassId(newClassId);
    const classSessions = await db.sessions.where('class_id').equals(newClassId).toArray();
    const sorted = [...classSessions].sort((a, b) => a.session_date.localeCompare(b.session_date));
    setCycleSessions(sorted);
    const start = Math.max(0, sorted.length - 4);
    const end = Math.max(0, sorted.length - 1);
    setCycleStartIdx(start);
    setCycleEndIdx(end);

    if (zaloModalWarning) {
      const text = await generateCycleTextForRange(zaloModalWarning.student_id, newClassId, start, end, zaloModalWarning);
      setZaloTextCycle(text);
      if (zaloMode === 'cycle') setZaloMessageText(text);
    }
  };

  // Handle Changing Start/End Session Range in Picker
  const handleCycleRangeChange = async (newStart: number, newEnd: number) => {
    setCycleStartIdx(newStart);
    setCycleEndIdx(newEnd);

    if (zaloModalWarning && cycleClassId) {
      const text = await generateCycleTextForRange(zaloModalWarning.student_id, cycleClassId, newStart, newEnd, zaloModalWarning);
      setZaloTextCycle(text);
      if (zaloMode === 'cycle') setZaloMessageText(text);
    }
  };

  // Open Zalo Message Modal & Generate Template with Real-time Student Stats
  const handleOpenZaloModal = async (w: Warning) => {
    const student = students.find((s) => s.id === w.student_id);
    const cls = classes.find((c) => c.id === w.class_id);
    const studentName = student?.full_name || 'em';
    const parentName = student?.parent_name ? `anh/chị ${student.parent_name}` : 'Phụ huynh';

    let textCycle = '';
    let textSession = '';

    if (student?.id && w.class_id) {
      const classSessions = await db.sessions.where('class_id').equals(w.class_id).toArray();
      const sortedClassSessions = [...classSessions].sort((a, b) => a.session_date.localeCompare(b.session_date));

      setCycleClassId(w.class_id);
      setCycleSessions(sortedClassSessions);

      const defaultStart = Math.max(0, sortedClassSessions.length - 4);
      const defaultEnd = Math.max(0, sortedClassSessions.length - 1);
      setCycleStartIdx(defaultStart);
      setCycleEndIdx(defaultEnd);

      textCycle = await generateCycleTextForRange(student.id, w.class_id, defaultStart, defaultEnd, w);

      // Single session message generator for latest session
      const studentSessions = await db.student_sessions.where('student_id').equals(student.id).toArray();
      const sortedStudentSessions = [...studentSessions].sort((a, b) => {
        const sa = sortedClassSessions.find((s) => s.id === a.session_id);
        const sb = sortedClassSessions.find((s) => s.id === b.session_id);
        if (!sa || !sb) return 0;
        return sa.session_date.localeCompare(sb.session_date);
      });

      const latestStudentSession = sortedStudentSessions[sortedStudentSessions.length - 1];
      const latestSessionObj = latestStudentSession ? sortedClassSessions.find((s) => s.id === latestStudentSession.session_id) : null;

      if (latestSessionObj && latestStudentSession) {
        let attStr = 'Đi học';
        if (latestStudentSession.attendance === 'absent_unexcused') attStr = 'Vắng không phép';
        else if (latestStudentSession.attendance === 'absent_excused') attStr = 'Vắng có phép';
        else if (latestStudentSession.attendance === 'late') attStr = 'Đi muộn';

        let hwStr = 'Chưa làm';
        if (latestStudentSession.homework_submitted) {
          hwStr = latestStudentSession.homework_score !== undefined ? `Đã nộp - ${latestStudentSession.homework_score}đ` : 'Đã nộp';
        }

        let testStr = latestStudentSession.test_score !== undefined ? `${latestStudentSession.test_score}đ` : 'Chưa kiểm tra';
        if (latestStudentSession.attendance.startsWith('absent')) testStr = 'Vắng mặt';

        const remList = [...(latestStudentSession.quick_preset_comments || [])];
        if (latestStudentSession.custom_comment) remList.push(latestStudentSession.custom_comment);
        const remStr = remList.length > 0 ? remList.join(', ') : 'Tiếp thu bài ổn định';

        const latestIdx = sortedClassSessions.findIndex((s) => s.id === latestSessionObj.id);
        const nextSessionObj = latestIdx >= 0 && latestIdx < sortedClassSessions.length - 1 ? sortedClassSessions[latestIdx + 1] : null;
        const nextDateStr = nextSessionObj ? `ngày ${nextSessionObj.session_date}` : 'tiếp theo';

        const parentGreeting = student?.parent_name ? `anh/chị ${student.parent_name}` : 'anh/chị Phụ huynh';
        const cleanReasonFull = (w.reason || '').replace(/\*\*/g, '').replace(/\[CHI TIẾT LỖ HỔNG TRUY VẾT\]:/g, '').trim();
        const primaryReason = cleanReasonFull.split('\n')[0].trim();

        const isCumulativeWarning = w.warning_type.toLowerCase().includes('tích lũy') || w.warning_type.toLowerCase().includes('trung bình tích lũy');
        const warningLine = isCumulativeWarning ? '' : `⚠️ Lưu ý: ${w.warning_type}${primaryReason ? ` (${primaryReason})` : ''}\n\n`;

        textSession = `Kính gửi ${parentGreeting} em ${studentName} (Lớp ${cls?.class_name || 'Toán'}),
Trung tâm Toán TCT xin thông báo kết quả buổi học ngày ${latestSessionObj.session_date} - Bài "${latestSessionObj.lesson_title}":
${warningLine}Tình hình buổi học:
• Chuyên cần: ${attStr}
• BTVN: ${hwStr}
• Kiểm tra đầu giờ: ${testStr}
• Nhận xét: ${remStr}

💡 Đề xuất phối hợp: Rất mong Gia đình đôn đốc em ôn lại bài "${latestSessionObj.lesson_title}" và hoàn thành bài tập trước buổi học ${nextDateStr}.
Trân trọng cảm ơn PH!`;
      } else {
        textSession = textCycle;
      }
    }

    setZaloTextCycle(textCycle);
    setZaloTextSession(textSession);

    // Mặc định chọn mẫu 1 buổi cho các cảnh báo theo buổi/nhắc nhở, chỉ chọn chu kỳ khi là báo cáo tổng hợp tích lũy
    const isCycleType = w.warning_type.toLowerCase().includes('tích lũy') || w.warning_type.toLowerCase().includes('chu kỳ');
    const defaultMode = isCycleType ? 'cycle' : 'session';
    setZaloMode(defaultMode);
    setZaloMessageText(defaultMode === 'session' ? textSession : textCycle);
    setZaloModalWarning(w);
    setCopiedSuccess(false);
  };

  // Copy Zalo Text & Open Zalo
  const handleCopyAndOpenZalo = () => {
    navigator.clipboard.writeText(zaloMessageText);
    setCopiedSuccess(true);

    const student = students.find((s) => s.id === zaloModalWarning?.student_id);
    const phone = student?.parent_phone ? student.parent_phone.replace(/\s+/g, '') : '';

    setTimeout(() => {
      if (phone) {
        window.open(`https://zalo.me/${phone}`, '_blank');
      } else {
        window.open('https://chat.zalo.me/', '_blank');
      }
      setCopiedSuccess(false);
    }, 800);
  };

  return (
    <div id="warning-center-view" className="space-y-6">
      {/* Sub-Tabs Navigation */}
      <div className="flex items-center p-1 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm w-full md:w-auto self-start">
        <button
          onClick={() => setActiveSubTab('warnings_list')}
          className={`flex-1 md:flex-none px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
            activeSubTab === 'warnings_list'
              ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50'
          }`}
        >
          <ShieldAlert className="w-4 h-4" />
          <span>Danh Sách Cảnh Báo</span>
        </button>
        <button
          onClick={() => setActiveSubTab('periodic_reports')}
          className={`flex-1 md:flex-none px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
            activeSubTab === 'periodic_reports'
              ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>Báo Cáo Chu Kỳ (4 Buổi)</span>
          <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-[9px] text-emerald-600 font-extrabold border border-emerald-500/20">MỚI</span>
        </button>
      </div>

      {activeSubTab === 'warnings_list' ? (
        <>
          {/* Header Info */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-rose-600 dark:text-rose-400" />
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Hệ Thống Cảnh Báo Thông Minh
                </h2>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleRunManualScan}
                disabled={isScanning}
                className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-600/20 flex items-center gap-1.5 disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isScanning ? 'animate-spin' : ''}`} />
                <span>Quét Cảnh Báo Ngay</span>
              </button>

              <span className="px-3 py-2 bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 rounded-xl text-xs font-bold border border-rose-200 dark:border-rose-800">
                P1 Khẩn cấp: {warnings.filter((w) => !w.resolved && w.priority === 'P1').length}
              </span>
              <span className="px-3 py-2 bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 rounded-xl text-xs font-bold border border-amber-200 dark:border-amber-800">
                P2 Nội bộ: {warnings.filter((w) => !w.resolved && w.priority === 'P2').length}
              </span>
              <span className="px-3 py-2 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 rounded-xl text-xs font-bold border border-emerald-200 dark:border-emerald-800">
                🟢 Tuyên dương: {warnings.filter((w) => !w.resolved && w.priority === 'Praise').length}
              </span>
            </div>
          </div>

          {scanMessage && (
            <div className="p-3 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>{scanMessage}</span>
            </div>
          )}

          {/* Filter Controls */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-400 ml-1" />
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Lọc Cảnh Báo:</span>

              {/* Status Tabs */}
              <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                <button
                  onClick={() => setStatusFilter('unresolved')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    statusFilter === 'unresolved'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-500'
                  }`}
                >
                  Chưa Xử Lý
                </button>
                <button
                  onClick={() => setStatusFilter('resolved')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    statusFilter === 'resolved'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-500'
                  }`}
                >
                  Đã Giải Quyết
                </button>
                <button
                  onClick={() => setStatusFilter('all')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    statusFilter === 'all'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-500'
                  }`}
                >
                  Tất Cả
                </button>
              </div>
            </div>

            {/* Priority & Class Dropdowns */}
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value as any)}
                className="text-xs font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2 rounded-xl outline-none"
              >
                <option value="all">Tất cả Cấp Độ (P1, P2, P3 & Praise)</option>
                <option value="P1">🔴 P1 - Khẩn cấp (Màu đỏ)</option>
                <option value="P2">🟠 P2 - Theo dõi (Màu cam)</option>
                <option value="P3">🟡 P3 - Cảnh báo sớm (Màu vàng)</option>
                <option value="Praise">🟢 Praise - Tuyên dương (Màu xanh)</option>
              </select>

              <select
                value={selectedClassId}
                onChange={(e) =>
                  setSelectedClassId(e.target.value === 'all' ? 'all' : e.target.value)
                }
                className="text-xs font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2 rounded-xl outline-none"
              >
                <option value="all">Tất cả Lớp học</option>
                {classes.map((c, idx) => (
                  <option key={c.id ? `${c.id}-${idx}` : idx} value={c.id}>
                    {c.class_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Warnings List */}
          <div className="space-y-3">
            {filteredWarnings.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800">
                Không tìm thấy cảnh báo nào phù hợp!
              </div>
            ) : (
              filteredWarnings.map((w, idx) => {
                const st = students.find((s) => s.id === w.student_id);
                const cls = classes.find((c) => c.id === w.class_id);

                return (
                  <div
                    key={w.id ? `${w.id}-${idx}` : idx}
                    className={`p-4 rounded-2xl border transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-4 ${
                      w.resolved
                        ? 'bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800'
                        : w.priority === 'P1'
                        ? 'bg-rose-50/80 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900/80 shadow-sm'
                        : w.priority === 'P2'
                        ? 'bg-amber-50/80 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/80 shadow-sm'
                        : w.priority === 'P3'
                        ? 'bg-yellow-50/80 dark:bg-yellow-950/40 border-yellow-200 dark:border-yellow-900/80 shadow-sm'
                        : 'bg-emerald-50/90 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-800 shadow-sm'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`px-2.5 py-0.5 rounded text-[10px] font-extrabold shadow-2xs ${
                            w.priority === 'P1'
                              ? 'bg-rose-600 text-white'
                              : w.priority === 'P2'
                              ? 'bg-amber-600 text-white'
                              : w.priority === 'P3'
                              ? 'bg-yellow-400 text-slate-950 font-black'
                              : 'bg-emerald-600 text-white'
                          }`}
                        >
                          {w.priority === 'P1'
                            ? 'P1 - KHẨN CẤP'
                            : w.priority === 'P2'
                            ? 'P2 - THEO DÕI'
                            : w.priority === 'P3'
                            ? 'P3 - CẢNH BÁO SỚM'
                            : '🟢 TUYÊN DƯƠNG'}
                        </span>

                        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                          {st?.full_name || 'Học sinh'}
                        </h3>

                        <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                          (Lớp {cls?.class_name || 'Toán'})
                        </span>
                      </div>

                      <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                        Loại cảnh báo:{' '}
                        <span className="text-rose-700 dark:text-rose-400 font-bold">{w.warning_type}</span>
                      </p>
                      {(() => {
                        const parts = (w.reason || '').split('[CHI TIẾT LỖ HỔNG TRUY VẾT]:');
                        const mainReason = parts[0].replace(/\*\*/g, '').trim();
                        const traceDetails = parts[1] ? parts[1].trim() : null;

                        return (
                          <div className="space-y-1 mt-0.5">
                            <p className="text-xs text-slate-700 dark:text-slate-200 font-medium leading-relaxed">
                              {mainReason}
                            </p>
                            {traceDetails && (
                              <details className="text-[11px] text-slate-600 dark:text-slate-300 bg-white/80 dark:bg-slate-950 p-2.5 rounded-lg border border-slate-200/80 dark:border-slate-800">
                                <summary className="font-bold text-indigo-700 dark:text-indigo-400 cursor-pointer hover:underline select-none">
                                  🔍 Xem chi tiết truy vết các buổi học & điểm số ({Math.max(1, traceDetails.split('• Bài:').length - 1)} buổi)
                                </summary>
                                <pre className="mt-1.5 whitespace-pre-wrap font-sans text-[11px] leading-snug text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-900 p-2 rounded border border-slate-100 dark:border-slate-800">
                                  {traceDetails}
                                </pre>
                              </details>
                            )}
                          </div>
                        );
                      })()}

                      <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400 pt-1">
                        <span>
                          SĐT Phụ huynh: <strong className="font-num text-slate-800 dark:text-slate-200 font-bold">{st?.parent_phone || 'N/A'}</strong>
                        </span>
                        <span>• Ngày tạo: {new Date(w.created_at).toLocaleDateString('vi-VN')}</span>
                      </div>

                      {w.resolved && (
                        <div className="mt-2 p-2 bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-300 dark:border-emerald-800 rounded-xl text-xs font-semibold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          <span>Đã xử lý: {w.resolved_action}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                      <button
                        onClick={() => handleOpenZaloModal(w)}
                        className="px-3 py-2 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:bg-sky-950/60 dark:text-sky-300 border border-sky-200 dark:border-sky-800 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                      >
                        <MessageSquare className="w-4 h-4 text-sky-600" />
                        <span>Gửi Zalo</span>
                      </button>

                      {!w.resolved && (
                        <button
                          onClick={() => handleOpenResolveModal(w)}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Giải Quyết Cảnh Báo</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      ) : (
        <div id="periodic-reports-dashboard" className="space-y-6">
          {/* Class & Cycle select toolbars */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
              <div className="space-y-1">
                <label className="block text-[11px] uppercase font-bold text-slate-400">Chọn Lớp Học:</label>
                <select
                  value={reportClassId || ''}
                  onChange={(e) => {
                    setReportClassId(e.target.value);
                    setSelectedCycleIndex(undefined);
                    setAiReport(null);
                  }}
                  className="text-xs font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2 rounded-xl outline-none"
                >
                  {classes.map((c, idx) => (
                    <option key={c.id ? `${c.id}-${idx}` : idx} value={c.id}>
                      {c.class_name}
                    </option>
                  ))}
                </select>
              </div>

              {cycles.length > 0 && (
                <div className="space-y-1">
                  <label className="block text-[11px] uppercase font-bold text-slate-400">Chọn Chu Kỳ:</label>
                  <select
                    value={selectedCycleIndex !== undefined ? selectedCycleIndex : ''}
                    onChange={(e) => {
                      setSelectedCycleIndex(e.target.value);
                      setAiReport(null);
                    }}
                    className="text-xs font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2 rounded-xl outline-none"
                  >
                    {cycles.map((cycle) => (
                      <option key={cycle.index} value={cycle.index}>
                        {cycle.name} {cycle.isCurrent ? '(Đang diễn ra)' : '(Hoàn thành)'}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
              <button
                onClick={handleExportCycleExcel}
                disabled={compiledStudents.length === 0}
                className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 disabled:opacity-50"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                <span>Xuất Excel</span>
              </button>

              <button
                onClick={handleExportCyclePDF}
                disabled={compiledStudents.length === 0}
                className="px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-600/20 flex items-center gap-1.5 disabled:opacity-50"
              >
                <FileDown className="w-4 h-4" />
                <span>In/Xuất PDF A4</span>
              </button>
            </div>
          </div>

          {cycles.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500 bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800">
              <Calendar className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <span>Lớp học này chưa có buổi học nào được tạo. Vui lòng vào <strong>Nhập điểm Thần tốc</strong> để thêm tối thiểu 1 buổi học để tổng hợp chu kỳ.</span>
            </div>
          ) : (
            <>
              {/* KPIs Summary */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Chuyên cần Chu kỳ</span>
                  <p className="text-xl font-black text-slate-800 dark:text-slate-100">{classMetrics.avgAttendance}%</p>
                  <p className="text-[10px] text-slate-500">Tỷ lệ đi học trung bình</p>
                </div>
                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Điểm TB BTVN</span>
                  <p className="text-xl font-black text-emerald-600 dark:text-emerald-400">{classMetrics.avgHomework}đ</p>
                  <p className="text-[10px] text-slate-500">Bài tập làm tại nhà</p>
                </div>
                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Điểm TB Kiểm tra</span>
                  <p className="text-xl font-black text-sky-600 dark:text-sky-400">{classMetrics.avgTest}đ</p>
                  <p className="text-[10px] text-slate-500">Bài kiểm tra tại lớp</p>
                </div>
                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between gap-2">
                  <div className="space-y-1 w-full">
                    <span className="text-[10px] uppercase font-bold text-slate-400">Cảnh báo / Khen ngợi</span>
                    <div className="flex items-center gap-1.5 flex-wrap pt-1">
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-500 text-white" title="P1">
                        P1: {classMetrics.totalP1}
                      </span>
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500 text-white" title="P2">
                        P2: {classMetrics.totalP2}
                      </span>
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500 text-white" title="Praise">
                        ⭐: {classMetrics.totalPraise}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Dynamic Warning Scanning Note if cycle is current & < 4 sessions */}
              {cycles.find(c => c.index === selectedCycleIndex) && cycles.find(c => c.index === selectedCycleIndex)!.sessions.length < 4 && (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-900/50 rounded-xl text-xs flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                  <span>
                    <strong>Chú ý:</strong> Chu kỳ này mới có <strong>{cycles.find(c => c.index === selectedCycleIndex)!.sessions.length}/4</strong> buổi học. Đây là báo cáo nháp, một số chỉ số cảnh báo sẽ tự động cập nhật chính xác nhất khi chu kỳ hoàn thành đủ 4 buổi học.
                  </span>
                </div>
              )}

              {/* Classroom Roster Table with Session Matrix */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden p-5 space-y-4">
                <div className="flex items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                    <BookOpen className="w-4 h-4 text-emerald-600" />
                    <span>Bảng Kết Quả Học Tập & Điểm Danh Chu Kỳ</span>
                  </h3>
                  <span className="text-[10.5px] text-slate-400">
                    Ký hiệu điểm danh: 🟢 Đi học | 🟡 Muộn | 🔵 CP (Có phép) | 🔴 KP (Không phép)
                  </span>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 text-[10px] font-extrabold uppercase border-b border-slate-200 dark:border-slate-700">
                        <th className="p-3 w-12 text-center">STT</th>
                        <th className="p-3 w-48">Học Sinh</th>
                        <th className="p-3 text-center w-40">Chuyên Cần 4 Buổi</th>
                        <th className="p-3 text-center w-20">TB BTVN</th>
                        <th className="p-3 text-center w-20">TB KT</th>
                        <th className="p-3">Tình Trạng & Canh Báo Chu Kỳ</th>
                        <th className="p-3 text-right w-24">Báo Cáo Zalo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                      {compiledStudents.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-6 text-center text-slate-400">
                            Chưa có học sinh nào trong lớp học này.
                          </td>
                        </tr>
                      ) : (
                        compiledStudents.map((student, idx) => {
                          return (
                            <tr key={student.id ? `${student.id}-${idx}` : idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors">
                              <td className="p-3 text-center text-slate-400">{idx + 1}</td>
                              <td 
                                className="p-3 font-bold text-slate-800 dark:text-slate-200 cursor-pointer hover:text-emerald-600 dark:hover:text-emerald-400 group transition-all"
                                onClick={() => handleOpenStudentDetail(student)}
                                title="Click để xem chi tiết hổng kiến thức & chẩn đoán sư phạm"
                              >
                                <div className="flex items-center gap-1.5">
                                  <div>
                                    <p className="group-hover:underline flex items-center gap-1">
                                      <span>{student.full_name}</span>
                                      <Info className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 group-hover:text-emerald-500 shrink-0" />
                                    </p>
                                    <p className="text-[10px] text-slate-400 font-normal">{student.parent_phone}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="p-3 text-center">
                                <div className="flex items-center justify-center gap-1.5">
                                  {student.attendanceMap.map((att: any, sIdx: number) => {
                                    if (!att) return <span key={sIdx} className="w-5 h-5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-300 text-[10px] flex items-center justify-center">-</span>;
                                    let colorCls = 'bg-slate-100 text-slate-400';
                                    let text = '-';
                                    if (att.attendance === 'present') { colorCls = 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-400 border border-emerald-200'; text = '🟢'; }
                                    else if (att.attendance === 'late') { colorCls = 'bg-amber-50 text-amber-700 dark:bg-amber-950/80 dark:text-amber-400 border border-amber-200'; text = '🟡'; }
                                    else if (att.attendance === 'absent_excused') { colorCls = 'bg-sky-50 text-sky-700 dark:bg-sky-950/80 dark:text-sky-400 border border-sky-200'; text = '🔵'; }
                                    else if (att.attendance === 'absent_unexcused') { colorCls = 'bg-rose-50 text-rose-700 dark:bg-rose-950/80 dark:text-rose-400 border border-rose-200'; text = '🔴'; }

                                    const tooltipText = `${new Date(att.session_date).toLocaleDateString('vi-VN')}: HW ${att.homework_score}đ | Test ${att.test_score}đ`;

                                    return (
                                      <span
                                        key={sIdx}
                                        className={`w-6 h-6 rounded-lg font-bold text-[10px] flex items-center justify-center shrink-0 ${colorCls}`}
                                        title={tooltipText}
                                      >
                                        {text}
                                      </span>
                                    );
                                  })}
                                </div>
                              </td>
                              <td className="p-3 text-center font-bold text-emerald-600 dark:text-emerald-400">
                                {student.hwAvg > 0 ? `${student.hwAvg}đ` : '-'}
                              </td>
                              <td className="p-3 text-center font-bold text-sky-600 dark:text-sky-400">
                                {student.testAvg > 0 ? `${student.testAvg}đ` : '-'}
                              </td>
                              <td className="p-3">
                                {student.warningStatus === 'normal' ? (
                                  <span className="text-slate-400 text-xs">Bình thường</span>
                                ) : (
                                  <div className="flex items-center gap-1.5">
                                    <span
                                      className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                                        student.warningStatus === 'P1'
                                          ? 'bg-rose-600 text-white'
                                          : student.warningStatus === 'Praise'
                                          ? 'bg-emerald-600 text-white'
                                          : 'bg-amber-500 text-white'
                                      }`}
                                    >
                                      {student.warningStatus === 'P1' ? 'P1' : student.warningStatus === 'Praise' ? '⭐ PRAISE' : 'P2'}
                                    </span>
                                    <span className="text-xs text-slate-700 dark:text-slate-300 font-semibold truncate max-w-xs">
                                      {student.warningReason}
                                    </span>
                                  </div>
                                )}
                              </td>
                              <td className="p-3 text-right">
                                <button
                                  onClick={() => handleOpenZaloSingle(student)}
                                  className="px-2.5 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 border border-sky-100 dark:border-sky-800 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 ml-auto"
                                >
                                  <MessageSquare className="w-3.5 h-3.5" />
                                  <span>Gửi Zalo</span>
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* AI Diagnostic for Cycle Section */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-5 space-y-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                      <Sparkles className="w-4.5 h-4.5 text-amber-500 animate-pulse" />
                      <span>Trợ Lý Sư Phạm AI - Chẩn Đoán Sinh Động Chu Kỳ</span>
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Phân tích chuyên sâu 4 buổi học bằng Gemini AI giúp giáo viên thiết lập giáo án cá ý chí giai đoạn tiếp theo.
                    </p>
                  </div>

                  <button
                    onClick={handleRunAiCycleReport}
                    disabled={isAiLoading || compiledStudents.length === 0}
                    className="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-orange-500/15 flex items-center gap-2 disabled:opacity-50 shrink-0"
                  >
                    {isAiLoading ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    <span>Phân Tích Sư Phạm AI</span>
                  </button>
                </div>

                {aiError && (
                  <div className="p-3 bg-rose-50 text-rose-800 border border-rose-200 rounded-xl text-xs font-medium flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{aiError}</span>
                  </div>
                )}

                {isAiLoading && (
                  <div className="p-10 flex flex-col items-center justify-center space-y-3">
                    <RefreshCw className="w-8 h-8 animate-spin text-orange-500" />
                    <p className="text-xs font-bold text-slate-600 dark:text-slate-300">
                      Gemini đang phân tích toàn bộ dữ liệu 4 buổi học của {compiledStudents.length} học sinh...
                    </p>
                    <p className="text-[11px] text-slate-400">Quá trình này mất khoảng 2-4 giây.</p>
                  </div>
                )}

                {aiReport && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs animate-fade-in">
                    {/* Left Column: Pedagogical Diagnostics */}
                    <div className="space-y-3">
                      <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
                        <h4 className="font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                          <AlertTriangle className="w-4 h-4 text-rose-500" />
                          <span>Lỗ hổng kiến thức tập thể</span>
                        </h4>
                        <p className="text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
                          {aiReport.knowledge_gap_summary}
                        </p>
                      </div>

                      <div className="p-4 bg-emerald-50/50 dark:bg-emerald-950/20 rounded-xl border border-emerald-100 dark:border-emerald-900/40 space-y-1.5">
                        <h4 className="font-extrabold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                          <Award className="w-4 h-4 text-emerald-600" />
                          <span>Tuyên dương học lực xuất sắc / Tiến bộ</span>
                        </h4>
                        <p className="text-emerald-700 dark:text-emerald-400 leading-relaxed font-medium">
                          {aiReport.outstanding_students}
                        </p>
                      </div>

                      <div className="p-4 bg-amber-50/50 dark:bg-amber-950/20 rounded-xl border border-amber-100 dark:border-amber-900/40 space-y-1.5">
                        <h4 className="font-extrabold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                          <AlertTriangle className="w-4 h-4 text-amber-500" />
                          <span>Nhóm cần kèm cặp & phụ đạo bổ sung</span>
                        </h4>
                        <p className="text-amber-700 dark:text-amber-400 leading-relaxed font-medium">
                          {aiReport.critical_tutoring_students}
                        </p>
                      </div>
                    </div>

                    {/* Right Column: General feedback & Parent announcement */}
                    <div className="space-y-3 flex flex-col justify-between">
                      <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
                        <h4 className="font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                          <PlusCircle className="w-4 h-4 text-emerald-600" />
                          <span>Định hướng phương pháp giảng dạy chu kỳ tới</span>
                        </h4>
                        <p className="text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
                          {aiReport.general_feedback}
                        </p>
                      </div>

                      <div className="p-4 bg-sky-50/50 dark:bg-sky-950/20 rounded-xl border border-sky-100 dark:border-sky-900/40 space-y-2 flex-1 flex flex-col justify-between">
                        <div className="space-y-1">
                          <h4 className="font-extrabold text-sky-800 dark:text-sky-300 flex items-center justify-between">
                            <span className="flex items-center gap-1.5">
                              <MessageSquare className="w-4 h-4 text-sky-600" />
                              <span>Bản tin Zalo Group gửi Phụ Huynh Lớp</span>
                            </span>
                          </h4>
                          <textarea
                            readOnly
                            rows={5}
                            value={aiReport.parent_group_announcement}
                            className="w-full text-[11px] bg-white dark:bg-slate-900 border border-sky-200 dark:border-sky-800 p-2 rounded-lg leading-relaxed text-slate-700 dark:text-slate-300 outline-none resize-none font-sans mt-1"
                          />
                        </div>

                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(aiReport.parent_group_announcement);
                            setCopiedAiAnnouncement(true);
                            setTimeout(() => setCopiedAiAnnouncement(false), 2500);
                          }}
                          className="w-full py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 self-end mt-2"
                        >
                          {copiedAiAnnouncement ? (
                            <Check className="w-4 h-4" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                          <span>
                            {copiedAiAnnouncement ? 'Đã sao chép thành công!' : 'Sao chép bản tin Zalo'}
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* RESOLVE ACTION MODAL */}
      {resolvingWarning && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span>Giải Quyết Cảnh Báo Học Tập</span>
              </h3>
              <button
                onClick={() => setResolvingWarning(null)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Chọn Phương Án Xử Lý:
                </label>
                <select
                  value={actionChoice}
                  onChange={(e) => setActionChoice(e.target.value)}
                  className="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2.5 rounded-xl outline-none font-bold"
                >
                  <option value="Đã gọi Phụ huynh">Đã gọi Phụ huynh thông báo trực tiếp</option>
                  <option value="Đã phụ đạo bù">Đã phụ đạo bù ngoài giờ học</option>
                  <option value="Đã cho làm lại bài">Đã cho làm lại bài kiểm tra gỡ điểm</option>
                  <option value="Đã nhắc nhở học sinh">Đã nhắc nhở trực tiếp học sinh trên lớp</option>
                </select>
              </div>

              {/* CHECKLIST ĐẦU VIỆC THỰC HIỆN V2 */}
              <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800 space-y-2.5">
                <span className="block text-[11px] font-extrabold text-slate-800 dark:text-slate-200">
                  ☑️ Các đầu việc đã thực hiện (Chọn nhiều):
                </span>
                
                {(() => {
                  const details = parseWarningDetails(resolvingWarning.reason || '');
                  return (
                    <div className="space-y-2">
                      <label className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checkedTasks.includes('task1')}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setCheckedTasks([...checkedTasks, 'task1']);
                            } else {
                              setCheckedTasks(checkedTasks.filter(t => t !== 'task1'));
                            }
                          }}
                          className="mt-0.5 rounded border-slate-300 dark:border-slate-700 text-emerald-600 focus:ring-emerald-500"
                        />
                        <span>
                          Đã gọi/nhắn tin trao đổi riêng với phụ huynh về lỗ hổng: <strong className="text-rose-600 dark:text-rose-400">{details.lessonName || 'Bài học yếu'}</strong>
                        </span>
                      </label>

                      <label className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checkedTasks.includes('task2')}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setCheckedTasks([...checkedTasks, 'task2']);
                            } else {
                              setCheckedTasks(checkedTasks.filter(t => t !== 'task2'));
                            }
                          }}
                          className="mt-0.5 rounded border-slate-300 dark:border-slate-700 text-emerald-600 focus:ring-emerald-500"
                        />
                        <span>
                          Đã trợ giảng kèm bù kiến thức chuyên đề: <strong className="text-emerald-600 dark:text-emerald-400">{details.tagName || 'Chuyên đề'}</strong>
                        </span>
                      </label>

                      <div className="flex flex-col gap-1">
                        <label className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={checkedTasks.includes('task3')}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setCheckedTasks([...checkedTasks, 'task3']);
                              } else {
                                setCheckedTasks(checkedTasks.filter(t => t !== 'task3'));
                              }
                            }}
                            className="mt-0.5 rounded border-slate-300 dark:border-slate-700 text-emerald-600 focus:ring-emerald-500"
                          />
                          <span>Đã cho làm lại bài kiểm tra đạt điểm</span>
                        </label>
                        {checkedTasks.includes('task3') && (
                          <div className="pl-6 flex items-center gap-1.5 mt-1">
                            <span className="text-xs text-slate-500">Điểm số đạt:</span>
                            <input
                              type="number"
                              min={0}
                              max={10}
                              step={0.5}
                              value={makeupScore}
                              onChange={(e) => setMakeupScore(e.target.value)}
                              className="w-16 px-2 py-1 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 font-bold text-center"
                            />
                            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">/ 10</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Ghi Chú Chi Tiết Khác (Tùy chọn)
                </label>
                <textarea
                  rows={3}
                  value={actionNotes}
                  onChange={(e) => setActionNotes(e.target.value)}
                  placeholder="VD: Phụ huynh hứa phối hợp đôn đốc con làm bài tập về nhà đầy đủ..."
                  className="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2.5 rounded-xl outline-none"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
                <button
                  onClick={() => setResolvingWarning(null)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold"
                >
                  Hủy
                </button>
                <button
                  onClick={handleExecuteResolve}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 shadow-md shadow-emerald-600/20"
                >
                  Xác Nhận Đã Giải Quyết
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ZALO MESSAGE TEMPLATE MODAL */}
      {zaloModalWarning && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-sky-600" />
                <span>Mẫu Tin Nhắn Zalo Phụ Huynh</span>
              </h3>
              <button
                onClick={() => setZaloModalWarning(null)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mode Switch Tabs */}
            <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl gap-1">
              <button
                type="button"
                onClick={() => handleSwitchZaloMode('session')}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  zaloMode === 'session'
                    ? 'bg-white dark:bg-slate-700 text-sky-700 dark:text-sky-300 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Zap className="w-3.5 h-3.5 text-amber-500" />
                <span>⚡ Mẫu Nhanh (Theo Buổi)</span>
              </button>
              <button
                type="button"
                onClick={() => handleSwitchZaloMode('cycle')}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  zaloMode === 'cycle'
                    ? 'bg-white dark:bg-slate-700 text-sky-700 dark:text-sky-300 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                <span>📊 Mẫu Chu Kỳ (4 Buổi)</span>
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-xs text-slate-500">
                {zaloMode === 'session'
                  ? '⚡ Mẫu Nhanh: Tóm tắt trực diện kết quả buổi vừa học xong (Chuyên cần, BTVN, Điểm KT, Nhận xét). Ngắn gọn, đọc hiểu trong 5 giây.'
                  : '📊 Mẫu Chu Kỳ: Báo cáo bức tranh toàn cảnh 4 buổi (Mốc từ buổi X -> buổi Y, điểm TB BTVN & KT, lỗ hổng chuyên đề và hướng khắc phục).'}
              </p>

              {zaloMode === 'cycle' && (
                <div className="bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 p-3.5 rounded-xl space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold text-indigo-900 dark:text-indigo-200">
                    <span className="flex items-center gap-1.5">
                      <Filter className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                      <span>Bước Chọn Phạm Vi Tính Toán Chu Kỳ</span>
                    </span>
                    {cycleSessions.length > 0 && (
                      <span className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-100 dark:bg-indigo-900/60 px-2 py-0.5 rounded-md">
                        {cycleSessions.length} buổi học khả dụng
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {/* Chọn Lớp */}
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                        1. Lớp học:
                      </label>
                      <select
                        value={cycleClassId}
                        onChange={(e) => handleCycleClassChange(e.target.value)}
                        className="w-full text-xs bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-700/60 p-2 rounded-lg outline-none font-medium text-slate-800 dark:text-slate-200"
                      >
                        {classes.map((c, idx) => (
                          <option key={c.id ? `${c.id}-${idx}` : idx} value={c.id}>
                            Lớp {c.class_name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Từ Buổi */}
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                        2. Từ buổi:
                      </label>
                      <select
                        value={cycleStartIdx}
                        onChange={(e) => {
                          const sIdx = Number(e.target.value);
                          const eIdx = Math.max(sIdx, cycleEndIdx);
                          handleCycleRangeChange(sIdx, eIdx);
                        }}
                        className="w-full text-xs bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-700/60 p-2 rounded-lg outline-none font-medium text-slate-800 dark:text-slate-200"
                      >
                        {cycleSessions.map((s, idx) => (
                          <option key={s.id ? `${s.id}-${idx}` : idx} value={idx}>
                            Buổi {idx + 1} ({(s?.session_date || '').slice(5)}) - {(s?.lesson_title || '').slice(0, 15)}...
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Đến Buổi */}
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                        3. Đến buổi:
                      </label>
                      <select
                        value={cycleEndIdx}
                        onChange={(e) => {
                          const eIdx = Number(e.target.value);
                          const sIdx = Math.min(eIdx, cycleStartIdx);
                          handleCycleRangeChange(sIdx, eIdx);
                        }}
                        className="w-full text-xs bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-700/60 p-2 rounded-lg outline-none font-medium text-slate-800 dark:text-slate-200"
                      >
                        {cycleSessions.map((s, idx) => (
                          <option key={s.id ? `${s.id}-${idx}` : idx} value={idx} disabled={idx < cycleStartIdx}>
                            Buổi {idx + 1} ({(s?.session_date || '').slice(5)}) - {(s?.lesson_title || '').slice(0, 15)}...
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Quick Range Presets */}
                  <div className="flex items-center gap-1.5 pt-1 text-[11px] flex-wrap">
                    <span className="text-slate-500 font-medium">Chọn nhanh:</span>
                    <button
                      type="button"
                      onClick={() => {
                        const end = Math.max(0, cycleSessions.length - 1);
                        const start = Math.max(0, cycleSessions.length - 4);
                        handleCycleRangeChange(start, end);
                      }}
                      className="px-2 py-0.5 bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 rounded hover:bg-indigo-50 font-semibold cursor-pointer"
                    >
                      ⚡ 4 buổi gần nhất
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const start = 0;
                        const end = Math.min(3, cycleSessions.length - 1);
                        handleCycleRangeChange(start, end);
                      }}
                      className="px-2 py-0.5 bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 rounded hover:bg-indigo-50 font-semibold cursor-pointer"
                    >
                      📍 Buổi 1 đến 4
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        handleCycleRangeChange(0, Math.max(0, cycleSessions.length - 1));
                      }}
                      className="px-2 py-0.5 bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 rounded hover:bg-indigo-50 font-semibold cursor-pointer"
                    >
                      🌐 Tất cả ({cycleSessions.length} buổi)
                    </button>
                  </div>

                  {/* Warning Box for Incomplete Sessions */}
                  {cycleIncompleteSessions.length > 0 && (
                    <div className="bg-amber-50 dark:bg-amber-950/70 border-2 border-amber-400 dark:border-amber-700 p-3 rounded-xl space-y-2 mt-2">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900 dark:text-amber-200">
                        <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                        <span>⚠️ PHÁT HIỆN {cycleIncompleteSessions.length} BUỔI CHƯA HOÀN THÀNH HỒ SƠ ĐIỂM:</span>
                      </div>
                      <p className="text-[11px] text-amber-800 dark:text-amber-300 font-medium leading-relaxed">
                        Thầy/Cô nên hoàn thiện điểm danh, điểm BTVN hoặc điểm Kiểm tra trong Sổ điểm cho các buổi sau để báo cáo chu kỳ đạt độ chính xác tuyệt đối:
                      </p>
                      <div className="space-y-1.5 pt-0.5">
                        {cycleIncompleteSessions.map((item, idx) => (
                          <div
                            key={idx}
                            className="flex flex-wrap items-center justify-between gap-1.5 text-xs bg-white dark:bg-slate-900 p-2 rounded-lg border border-amber-200 dark:border-amber-800/80 shadow-xs"
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950 px-1.5 py-0.5 rounded text-[11px]">
                                Buổi {item.sessionNum} ({(item?.date || '').slice(5)})
                              </span>
                              <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                                {item.sessionTitle}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 flex-wrap">
                              {item.missingInfo.map((m, mIdx) => (
                                <span
                                  key={mIdx}
                                  className="text-[10px] font-bold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950 px-1.5 py-0.5 rounded-md border border-rose-200 dark:border-rose-800"
                                >
                                  {m}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <textarea
                rows={9}
                value={zaloMessageText}
                onChange={(e) => setZaloMessageText(e.target.value)}
                className="w-full text-xs font-sans bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 rounded-xl outline-none leading-relaxed text-slate-800 dark:text-slate-100"
              />

              {copiedSuccess && (
                <div className="p-2.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5">
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span>Đã sao chép! Đang mở Zalo...</span>
                </div>
              )}

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
                <button
                  onClick={() => setZaloModalWarning(null)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold"
                >
                  Đóng
                </button>
                <button
                  onClick={handleCopyAndOpenZalo}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-sky-600/20 flex items-center gap-1.5"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Copy & Mở Zalo 1-Click</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SINGLE STUDENT CYCLE ZALO MESSAGE MODAL */}
      {isZaloSingleOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4 animate-fade-in">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-sky-600" />
                <span>Gửi Báo Cáo Chu Kỳ Zalo Cho Phụ Huynh</span>
              </h3>
              <button
                onClick={() => setIsZaloSingleOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-slate-500">
                Bản tin học tập cá nhân hóa tóm tắt kết quả chuyên cần, điểm BTVN, điểm kiểm tra và xếp loại cảnh báo sư phạm trong 4 buổi học vừa qua. Bạn có thể sửa đổi trước khi gửi đi:
              </p>

              <textarea
                rows={9}
                value={zaloSingleText}
                onChange={(e) => setZaloSingleText(e.target.value)}
                className="w-full text-xs font-sans bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 rounded-xl outline-none leading-relaxed text-slate-800 dark:text-slate-100 focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
              />

              {copiedSingleSuccess && (
                <div className="p-2.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl font-bold flex items-center justify-center gap-1.5">
                  <Check className="w-4.5 h-4.5 text-emerald-600" />
                  <span>Đã sao chép báo cáo cá nhân! Đang chuyển tiếp Zalo...</span>
                </div>
              )}

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
                <button
                  onClick={() => setIsZaloSingleOpen(false)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold"
                >
                  Đóng
                </button>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(zaloSingleText);
                    setCopiedSingleSuccess(true);
                    setTimeout(() => {
                      setCopiedSingleSuccess(false);
                      setIsZaloSingleOpen(false);
                      // Format phone for zalo.me link
                      let sanitizedPhone = (singleStudentPhone || '').replace(/[\s.-]/g, '');
                      if (sanitizedPhone.startsWith('0')) {
                        sanitizedPhone = '84' + sanitizedPhone.slice(1);
                      }
                      window.open(`https://zalo.me/${sanitizedPhone}`, '_blank');
                    }, 1200);
                  }}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl font-bold transition-all shadow-md shadow-sky-600/20 flex items-center gap-1.5"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Sao Chép & Gửi Zalo</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* WARNING RULE CONFIGURATION MODAL */}
      {isRuleModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-emerald-600" />
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Cấu Hình Quy Tắc Cảnh Báo (WarningRuleConfig)
                </h3>
              </div>
              <button
                onClick={() => setIsRuleModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 flex items-start gap-2">
                <Info className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  Tùy chỉnh ngưỡng đánh giá để hệ thống tự động quét và kích hoạt cảnh báo cho giáo viên &amp; trợ giảng.
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* minTestScore */}
                <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 space-y-1">
                  <label className="block font-bold text-slate-800 dark:text-slate-200">
                    1. Điểm kiểm tra tối thiểu (minTestScore)
                  </label>
                  <p className="text-[11px] text-slate-500">Ngưỡng điểm chuẩn bài kiểm tra</p>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max="10"
                    value={ruleConfig.minTestScore}
                    onChange={(e) =>
                      setRuleConfig({
                        ...ruleConfig,
                        minTestScore: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg font-bold text-slate-900 dark:text-slate-100"
                  />
                </div>

                {/* consecutiveLowTests */}
                <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 space-y-1">
                  <label className="block font-bold text-slate-800 dark:text-slate-200">
                    2. Số lần kiểm tra kém liên tiếp
                  </label>
                  <p className="text-[11px] text-slate-500">Số buổi kiểm tra &lt; chuẩn liên tiếp</p>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={ruleConfig.consecutiveLowTests}
                    onChange={(e) =>
                      setRuleConfig({
                        ...ruleConfig,
                        consecutiveLowTests: parseInt(e.target.value) || 1,
                      })
                    }
                    className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg font-bold text-slate-900 dark:text-slate-100"
                  />
                </div>

                {/* maxAbsences */}
                <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 space-y-1">
                  <label className="block font-bold text-slate-800 dark:text-slate-200">
                    3. Số buổi vắng tối đa (maxAbsences)
                  </label>
                  <p className="text-[11px] text-slate-500">Giới hạn vắng mặt không phép</p>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={ruleConfig.maxAbsences}
                    onChange={(e) =>
                      setRuleConfig({
                        ...ruleConfig,
                        maxAbsences: parseInt(e.target.value) || 1,
                      })
                    }
                    className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg font-bold text-slate-900 dark:text-slate-100"
                  />
                </div>

                {/* minHomeworkScore */}
                <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 space-y-1">
                  <label className="block font-bold text-slate-800 dark:text-slate-200">
                    4. Điểm BTVN tối thiểu (minHomeworkScore)
                  </label>
                  <p className="text-[11px] text-slate-500">Ngưỡng điểm bài tập làm ở nhà</p>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max="10"
                    value={ruleConfig.minHomeworkScore}
                    onChange={(e) =>
                      setRuleConfig({
                        ...ruleConfig,
                        minHomeworkScore: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg font-bold text-slate-900 dark:text-slate-100"
                  />
                </div>

                {/* consecutiveLowHomework */}
                <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 space-y-1">
                  <label className="block font-bold text-slate-800 dark:text-slate-200">
                    5. Số buổi thiếu/kém BTVN liên tiếp
                  </label>
                  <p className="text-[11px] text-slate-500">Chuỗi quên BTVN hoặc làm kém</p>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={ruleConfig.consecutiveLowHomework}
                    onChange={(e) =>
                      setRuleConfig({
                        ...ruleConfig,
                        consecutiveLowHomework: parseInt(e.target.value) || 1,
                      })
                    }
                    className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg font-bold text-slate-900 dark:text-slate-100"
                  />
                </div>

                {/* scoreDropThreshold */}
                <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 space-y-1">
                  <label className="block font-bold text-slate-800 dark:text-slate-200">
                    6. Ngưỡng sụt giảm điểm (scoreDropThreshold)
                  </label>
                  <p className="text-[11px] text-slate-500">Số điểm giảm so với trung bình cũ</p>
                  <input
                    type="number"
                    step="0.5"
                    min="0.5"
                    max="5"
                    value={ruleConfig.scoreDropThreshold}
                    onChange={(e) =>
                      setRuleConfig({
                        ...ruleConfig,
                        scoreDropThreshold: parseFloat(e.target.value) || 1.0,
                      })
                    }
                    className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg font-bold text-slate-900 dark:text-slate-100"
                  />
                </div>

                {/* excellentTestScore */}
                <div className="p-3 bg-emerald-50/60 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 dark:border-emerald-800/80 space-y-1">
                  <label className="block font-bold text-emerald-900 dark:text-emerald-200">
                    7. 🌟 Điểm tuyên dương xuất sắc
                  </label>
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-300">Điểm kiểm tra &gt;= mức này sẽ tự động vinh danh</p>
                  <input
                    type="number"
                    step="0.5"
                    min="7.0"
                    max="10"
                    value={ruleConfig.excellentTestScore ?? 9.0}
                    onChange={(e) =>
                      setRuleConfig({
                        ...ruleConfig,
                        excellentTestScore: parseFloat(e.target.value) || 9.0,
                      })
                    }
                    className="w-full p-2 bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-700 rounded-lg font-bold text-slate-900 dark:text-slate-100"
                  />
                </div>

                {/* enablePraiseAttendanceHw */}
                <div className="p-3 bg-emerald-50/60 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 dark:border-emerald-800/80 space-y-1 flex items-center justify-between col-span-1 sm:col-span-2">
                  <div>
                    <label className="block font-bold text-emerald-900 dark:text-emerald-200">
                      8. 🌟 Tuyên dương Chuyên cần 100% & BTVN xuất sắc
                    </label>
                    <p className="text-[11px] text-emerald-700 dark:text-emerald-300">
                      Tự động ghi nhận vinh danh học sinh tham gia 100% các buổi học và nộp 100% bài tập về nhà đúng hạn.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={ruleConfig.enablePraiseAttendanceHw ?? true}
                    onChange={(e) =>
                      setRuleConfig({
                        ...ruleConfig,
                        enablePraiseAttendanceHw: e.target.checked,
                      })
                    }
                    className="w-5 h-5 accent-emerald-600 rounded cursor-pointer shrink-0 ml-3"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  onClick={() => setRuleConfig(DEFAULT_WARNING_RULE_CONFIG)}
                  className="px-3 py-1.5 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 font-bold"
                >
                  Đặt lại mặc định
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={() => setIsRuleModalOpen(false)}
                    className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold"
                  >
                    Hủy
                  </button>
                  <button
                    onClick={handleSaveRuleConfig}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-md shadow-emerald-600/20 flex items-center gap-1.5"
                  >
                    <Save className="w-4 h-4" />
                    <span>Lưu &amp; Quét Cảnh Báo</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PRINT OPTIONS MODAL */}
      {isPrintModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 no-print">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-emerald-50 dark:bg-emerald-950/50 rounded-xl">
                    <FileDown className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      Tùy Chọn Xuất Báo Cáo Chu Kỳ
                    </h3>
                    <p className="text-[10px] text-slate-500 font-medium">
                      Lớp {classes.find(c => c.id === reportClassId)?.class_name} • {cycles.find(c => c.index === selectedCycleIndex)?.name}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsPrintModalOpen(false)}
                  className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Notice about iframe constraints */}
              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-900/50 rounded-xl text-xs space-y-1">
                <p className="font-bold flex items-center gap-1">
                  <span>💡 Lưu ý quan trọng khi dùng iFrame:</span>
                </p>
                <p className="leading-relaxed">
                  Trình duyệt thường chặn hộp thoại in trực tiếp (`window.print()`) khi chạy trong khung Xem Trước (iFrame) của AI Studio. Bạn nên sử dụng **Cách 1** hoặc **Cách 3** để đạt kết quả tốt nhất.
                </p>
              </div>

              <div className="space-y-3">
                {/* Mode 1: Download PDF */}
                <button
                  onClick={async () => {
                    const cls = classes.find(c => c.id === reportClassId);
                    const currentCycle = cycles.find(c => c.index === selectedCycleIndex);
                    if (cls && currentCycle) {
                      await exportCycleReportPDF(cls, currentCycle.name, currentCycle.dateRange, classMetrics, compiledStudents);
                      await logAudit(
                        'Teacher',
                        'Tải PDF Chu kỳ',
                        `Tải báo cáo PDF chu kỳ ${currentCycle.name} cho lớp ${cls.class_name}`
                      );
                      setIsPrintModalOpen(false);
                    }
                  }}
                  className="w-full p-4 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:hover:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-2xl text-left transition-all flex items-center justify-between group cursor-pointer"
                >
                  <div className="space-y-0.5">
                    <p className="text-xs font-extrabold text-emerald-800 dark:text-emerald-300 uppercase tracking-wide">
                      Cách 1: Tải tệp PDF chất lượng cao (Khuyên dùng)
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Tự động tạo tệp tin PDF lưu trữ trực tiếp vào máy tính của bạn.
                    </p>
                  </div>
                  <FileDown className="w-5 h-5 text-emerald-600 dark:text-emerald-400 group-hover:translate-y-0.5 transition-transform" />
                </button>

                {/* Mode 2: Browser Print */}
                <button
                  onClick={async () => {
                    const cls = classes.find(c => c.id === reportClassId);
                    const currentCycle = cycles.find(c => c.index === selectedCycleIndex);
                    if (cls && currentCycle) {
                      window.print();
                      await logAudit(
                        'Teacher',
                        'In Trực tiếp',
                        `Yêu cầu in trực tiếp chu kỳ ${currentCycle.name} lớp ${cls.class_name}`
                      );
                    }
                  }}
                  className="w-full p-4 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/40 dark:hover:bg-slate-800/80 border border-slate-200 dark:border-slate-800 rounded-2xl text-left transition-all flex items-center justify-between group cursor-pointer"
                >
                  <div className="space-y-0.5">
                    <p className="text-xs font-extrabold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
                      Cách 2: Thử In bằng Trình duyệt (A4)
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Gọi hộp thoại In mặc định để chọn máy in hoặc Lưu dưới dạng PDF.
                    </p>
                  </div>
                  <Printer className="w-5 h-5 text-slate-500 group-hover:scale-110 transition-transform" />
                </button>

                {/* Mode 3: Open in a new tab */}
                <div className="p-4 bg-sky-50 dark:bg-sky-950/20 border border-sky-100 dark:border-sky-900/30 rounded-2xl flex items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <p className="text-xs font-bold text-sky-800 dark:text-sky-300 uppercase tracking-wide">
                      Cách 3: Mở trong Tab mới để In không bị chặn
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Mở ứng dụng ở Tab độc lập để hộp thoại In hoạt động hoàn hảo 100%.
                    </p>
                  </div>
                  <a
                    href={window.location.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold shrink-0 shadow-sm transition-all flex items-center gap-1"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>Mở tab mới</span>
                  </a>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={() => setIsPrintModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold text-xs cursor-pointer"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DETAILED STUDENT PEDAGOGICAL DIAGNOSIS MODAL */}
      {isDetailModalOpen && selectedDetailStudent && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto no-print">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-4xl w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-6 my-8 animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-2xl">
                  <Sparkles className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100">
                    Báo Cáo Sư Phạm Cá Nhân Hóa &amp; Chẩn Đoán Lỗ Hổng
                  </h3>
                  <p className="text-xs text-slate-500 font-bold flex items-center gap-2 mt-0.5">
                    <span>Học sinh: <span className="text-emerald-600 dark:text-emerald-400 font-extrabold">{selectedDetailStudent.full_name}</span></span>
                    <span className="text-slate-300 dark:text-slate-700">•</span>
                    <span>Phụ huynh: {selectedDetailStudent.parent_name || 'N/A'}{selectedDetailStudent.parent_phone ? ` (${selectedDetailStudent.parent_phone})` : ''}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsDetailModalOpen(false)}
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Performance KPIs Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-1">
                <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Chuyên Cần Chu Kỳ</p>
                <p className="text-lg font-black text-slate-800 dark:text-slate-200">{selectedDetailStudent.attendancePercent}%</p>
                <p className="text-[10px] text-slate-500 font-medium">Chỉ số tham gia lớp học</p>
              </div>

              <div className="p-4 bg-sky-50/50 dark:bg-sky-950/20 rounded-2xl border border-sky-100/60 dark:border-sky-900/40 space-y-1">
                <p className="text-[10px] font-extrabold text-sky-700 dark:text-sky-300 uppercase tracking-wider">TB Kiểm Tra Chu Kỳ</p>
                <p className="text-lg font-black text-sky-700 dark:text-sky-400">{selectedDetailStudent.testAvg > 0 ? `${selectedDetailStudent.testAvg}đ` : 'Chưa nhập'}</p>
                <p className="text-[10px] text-sky-500 font-medium">Đánh giá trực tiếp tại lớp</p>
              </div>

              <div className="p-4 bg-emerald-50/50 dark:bg-emerald-950/20 rounded-2xl border border-emerald-100/60 dark:border-emerald-900/40 space-y-1">
                <p className="text-[10px] font-extrabold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider">TB Bài Tập Về Nhà</p>
                <p className="text-lg font-black text-emerald-700 dark:text-emerald-400">{selectedDetailStudent.hwAvg > 0 ? `${selectedDetailStudent.hwAvg}đ` : 'Chưa nhập'}</p>
                <p className="text-[10px] text-emerald-500 font-medium">Kết quả luyện tập tự học</p>
              </div>

              <div className="p-4 bg-rose-50/60 dark:bg-rose-950/20 rounded-2xl border border-rose-100 dark:border-rose-900/40 space-y-1">
                <p className="text-[10px] font-extrabold text-rose-700 dark:text-rose-300 uppercase tracking-wider">Trạng Thế Chu Kỳ</p>
                <div>
                  {selectedDetailStudent.warningStatus === 'normal' ? (
                    <span className="inline-block px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded text-[10px] font-extrabold">BÌNH THƯỜNG</span>
                  ) : selectedDetailStudent.warningStatus === 'Praise' ? (
                    <span className="inline-block px-2 py-0.5 bg-emerald-600 text-white rounded text-[10px] font-extrabold">⭐ TUYÊN DƯƠNG</span>
                  ) : (
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-extrabold text-white ${selectedDetailStudent.warningStatus === 'P1' ? 'bg-rose-600' : 'bg-amber-500'}`}>
                      ⚠️ {selectedDetailStudent.warningStatus === 'P1' ? 'CẢNH BÁO P1' : 'CẢNH BÁO P2'}
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-rose-500 font-semibold truncate" title={selectedDetailStudent.warningReason || 'Phong độ ổn định'}>
                  {selectedDetailStudent.warningReason || 'Học lực ổn định'}
                </p>
              </div>
            </div>

            {/* Smart Backward Homework Mapping Analysis */}
            <div className="space-y-3">
              <div>
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                  <BookOpen className="w-4 h-4 text-emerald-600" />
                  <span>Phân tích chi tiết hổng kiến thức chuẩn sư phạm Toán THCS</span>
                </h4>
                <p className="text-[10.5px] text-slate-500 leading-relaxed mt-1">
                  💡 <strong>Giải thuật Ánh xạ Thông minh:</strong> Điểm Bài kiểm tra đánh giá trực tiếp kiến thức tại lớp của buổi đó. Điểm Bài tập về nhà được đối sánh lùi 1 buổi (lấy điểm nộp ở buổi tiếp theo) để ánh xạ chính xác kết quả luyện tập của đúng chuyên đề đã học!
                </p>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px] font-extrabold uppercase border-b border-slate-200 dark:border-slate-700">
                      <th className="p-3 w-28">Thông Tin Buổi Học</th>
                      <th className="p-3">Chuyên Đề (Knowledge Tag)</th>
                      <th className="p-3 text-center w-24">Kiểm Tra Lớp</th>
                      <th className="p-3 text-center w-24">BTVN (Ánh Xạ)</th>
                      <th className="p-3">Chẩn Đoán Tiếp Thu &amp; Lỗ Hổng</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-[11px]">
                    {studentDetailSessions.map((item, idx) => {
                      let masteryBadgeCls = '';
                      let masteryText = '';
                      if (item.masteryStatus === 'excellent') {
                        masteryBadgeCls = 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200';
                        masteryText = 'XUẤT SẮC';
                      } else if (item.masteryStatus === 'good') {
                        masteryBadgeCls = 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400 border border-sky-200';
                        masteryText = 'KHÁ';
                      } else if (item.masteryStatus === 'practice_needed') {
                        masteryBadgeCls = 'bg-yellow-50 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-400 border border-yellow-200';
                        masteryText = 'LƯỜI BTVN';
                      } else if (item.masteryStatus === 'imbalanced') {
                        masteryBadgeCls = 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200';
                        masteryText = 'LỆCH PHONG ĐỘ';
                      } else if (item.masteryStatus === 'weak') {
                        masteryBadgeCls = 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-200';
                        masteryText = '🚨 HỔNG NẶNG';
                      } else {
                        masteryBadgeCls = 'bg-slate-100 text-slate-500 border border-slate-200';
                        masteryText = 'ĐANG TÍCH LŨY';
                      }

                      return (
                        <tr key={idx} className="hover:bg-slate-50/30 transition-colors">
                          <td className="p-3 space-y-0.5">
                            <p className="font-bold text-slate-850 dark:text-slate-200 text-xs">Buổi {idx + 1}</p>
                            <p className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              <span>{new Date(item.sessionDate).toLocaleDateString('vi-VN')}</span>
                            </p>
                          </td>
                          <td className="p-3 space-y-0.5">
                            <p className="font-extrabold text-slate-700 dark:text-slate-300 text-xs">{item.knowledgeTag}</p>
                            <p className="text-[10px] text-slate-400 font-normal truncate max-w-xs" title={item.titleOnly}>
                              Nội dung: {item.titleOnly}
                            </p>
                            <p className="text-[10px] text-slate-400 italic truncate max-w-xs" title={item.homeworkDescription}>
                              BTVN giao: {item.homeworkDescription || 'Không giao'}
                            </p>
                          </td>
                          <td className="p-3 text-center">
                            {item.attendance === 'absent_unexcused' ? (
                              <span className="text-[10px] font-bold text-rose-600 bg-rose-50 dark:bg-rose-950/40 px-1.5 py-0.5 rounded">Vắng KP</span>
                            ) : item.attendance === 'absent_excused' ? (
                              <span className="text-[10px] font-bold text-sky-600 bg-sky-50 dark:bg-sky-950/40 px-1.5 py-0.5 rounded">Vắng CP</span>
                            ) : item.testScore !== undefined && item.testScore >= 0 ? (
                              <span className={`text-xs font-extrabold ${item.testScore >= 8.0 ? 'text-emerald-600' : item.testScore < 5.0 ? 'text-rose-600 font-black' : 'text-slate-700 dark:text-slate-300'}`}>
                                {item.testScore}đ
                              </span>
                            ) : (
                              <span className="text-slate-300">-</span>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            {item.hwExempt ? (
                              <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">Miễn</span>
                            ) : item.hwScore !== undefined && item.hwScore >= 0 ? (
                              <div className="space-y-0.5">
                                <p className={`text-xs font-extrabold ${item.hwScore >= 8.0 ? 'text-emerald-600' : item.hwScore < 5.0 ? 'text-rose-600 font-black' : 'text-slate-700 dark:text-slate-300'}`}>
                                  {item.hwScore}đ
                                </p>
                                {item.hwLate && <p className="text-[9px] text-amber-650 font-extrabold">Nộp muộn</p>}
                              </div>
                            ) : item.hwSubmitted === false ? (
                              <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded">Thiếu bài</span>
                            ) : item.nextSessionDate ? (
                              <span className="text-[10px] text-slate-400 font-medium" title={`Học sinh nộp bài vào buổi tiếp theo ngày ${new Date(item.nextSessionDate).toLocaleDateString('vi-VN')}`}>Đang chấm</span>
                            ) : (
                              <span className="text-slate-300">-</span>
                            )}
                          </td>
                          <td className="p-3 space-y-1">
                            <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-black ${masteryBadgeCls}`}>
                              {masteryText}
                            </span>
                            <p className="text-[11px] text-slate-600 dark:text-slate-300 font-medium leading-relaxed">
                              {item.diagnosticMessage}
                            </p>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Active Warnings & Quick Action Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
              {/* Left Column: Active Warnings & Manual Resolve */}
              <div className="bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800 p-4 space-y-3">
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-rose-500" />
                  <span>Cảnh báo học tập đang hoạt động ({studentActiveWarnings.length})</span>
                </h4>

                {studentActiveWarnings.length === 0 ? (
                  <div className="p-4 bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300 rounded-xl text-[11px] font-bold flex items-center gap-2 leading-relaxed">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Con hiện tại không bị cảnh báo học tập nào! Học sinh đang duy trì nhịp độ học tập bình thường hoặc đạt thành tích tuyên dương.</span>
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-[180px] overflow-y-auto">
                    {studentActiveWarnings.map((w, idx) => (
                      <div key={w.id ? `${w.id}-${idx}` : idx} className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex items-center justify-between gap-3 text-[11px] shadow-sm">
                        <div className="space-y-0.5 flex-1">
                          <p className="font-extrabold text-rose-700 dark:text-rose-400">{w.warning_type}</p>
                          <p className="text-[10px] text-slate-500 leading-relaxed font-medium">{w.reason}</p>
                        </div>
                        <button
                          onClick={() => {
                            setResolvingWarning(w);
                            setActionChoice('Đã gọi Phụ huynh');
                            setActionNotes('');
                          }}
                          className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold shadow-sm shrink-0 transition-colors cursor-pointer"
                        >
                          Giải Quyết
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Right Column: Roadmap to Resolve & Reward */}
              <div className="bg-emerald-50/30 dark:bg-emerald-950/10 rounded-2xl border border-emerald-100/60 dark:border-emerald-900/20 p-4 space-y-3">
                <h4 className="text-xs font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-emerald-600" />
                  <span>Quy trình tháo gỡ cảnh báo &amp; Vinh danh xuất sắc</span>
                </h4>
                
                <div className="text-[11px] text-slate-600 dark:text-slate-300 space-y-2.5 leading-relaxed">
                  <div className="flex items-start gap-1.5">
                    <span className="text-emerald-600 font-extrabold shrink-0 mt-0.5">1.</span>
                    <p>
                      <strong>Điều kiện gỡ cảnh báo:</strong> Giáo viên/TA ghi nhận hành động xử lý trực tiếp (Click nút <i>"Giải quyết"</i> và điền phương án như gọi điện, phụ đạo, kiểm tra lại) <strong>HOẶC</strong> điểm trung bình trong chu kỳ học tiếp theo tiến bộ lên trên ngưỡng cảnh báo (&gt; 5.5đ) và nộp BTVN đầy đủ.
                    </p>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <span className="text-emerald-600 font-extrabold shrink-0 mt-0.5">2.</span>
                    <p>
                      <strong>Điều kiện Tuyên dương (Praise):</strong> Học sinh đạt 100% chuyên cần (không nghỉ học không phép, không đi muộn tái diễn) <strong>VÀ</strong> đạt điểm số trung bình chu kỳ vượt trội từ <strong>8.5đ trở lên</strong>.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions Footer */}
            <div className="flex justify-between items-center pt-4 border-t border-slate-100 dark:border-slate-800 text-xs">
              <button
                onClick={() => handleOpenZaloSingle(selectedDetailStudent)}
                className="px-4 py-2 bg-sky-50 hover:bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300 border border-sky-200 rounded-xl font-bold transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <MessageSquare className="w-4 h-4" />
                <span>Gửi Báo Cáo Zalo Cho Phụ Huynh</span>
              </button>

              <button
                onClick={() => setIsDetailModalOpen(false)}
                className="px-5 py-2 bg-slate-900 text-white dark:bg-slate-850 rounded-xl font-bold hover:bg-slate-800 dark:hover:bg-slate-800 transition-all cursor-pointer"
              >
                Đóng Báo Cáo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PERFECT A4 PRINT LAYOUT - VISIBLE ONLY WHEN PRINTING */}
      <PrintableCycleReport
        cls={classes.find(c => c.id === reportClassId)}
        currentCycle={cycles.find(c => c.index === selectedCycleIndex)}
        classMetrics={classMetrics}
        compiledStudents={compiledStudents}
        aiReport={aiReport}
      />
    </div>
  );
};
