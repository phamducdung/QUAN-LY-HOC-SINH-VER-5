import { ClassItem, Student, Session, StudentSession, Warning, GradeLevel, PriorityLevel } from '../types';

export interface DashboardMetrics {
  // Module 7: Sĩ số & Quy mô Lớp
  activeClassesCount: number;
  activeStudentsCount: number;
  stoppedStudentsCount: number;
  pausedStudentsCount: number;
  totalStudentsRegistered: number;
  averageClassSize: number;

  // Module 6: Điểm TB & Đánh giá Học lực
  centerAvgTestScore: number; // Điểm TB Kiểm Tra toàn trung tâm
  centerAvgHwScore: number;   // Điểm TB BTVN toàn trung tâm
  totalGradedSessions: number; // Tổng số lượt chấm điểm
  homeworkCompletionRate: number; // % làm bài BTVN
  submittedHomeworkCount: number;
  totalHomeworkCount: number;
  attendanceRate: number; // % có mặt đúng giờ
  presentCount: number;
  totalAttendanceRecords: number;
  absenceRate: number; // % học sinh nghỉ / vắng

  // Phổ điểm trung tâm (Score distribution)
  excellentCount: number; // >= 8.5
  goodCount: number;      // 6.5 - 8.4
  averageCount: number;   // 5.0 - 6.4
  belowStandardCount: number; // < 5.0

  // Module 2: Smart Warning Engine (Thống kê theo SỐ HỌC SINH DUY NHẤT)
  uniqueStudentsWithWarningsCount: number; // Tổng số học sinh đang có cảnh báo chưa xử lý
  uniqueP1StudentCount: number; // Số HS có mức ưu tiên cao nhất là P1 (Khẩn cấp)
  uniqueP2StudentCount: number; // Số HS có mức ưu tiên cao nhất là P2 (Theo dõi)
  uniqueP3StudentCount: number; // Số HS có mức ưu tiên cao nhất là P3 (Nhắc nhở)
  totalActiveWarningsCount: number; // Tổng số lượt/vụ việc cảnh báo chưa đóng
  resolvedWarningsCount: number;
  academicSafetyRate: number; // % học sinh không vướng cảnh báo nguy cơ P1/P2

  // Tuyên Dương & Bứt Phá (Thống kê theo SỐ HỌC SINH DUY NHẤT)
  uniquePraisedStudentsCount: number; // Số học sinh được tuyên dương
  topScorePraisedStudentCount: number; // Số HS vinh danh điểm cao / xuất sắc
  breakthroughPraisedStudentCount: number; // Số HS vinh danh tiến bộ bứt phá
  totalPraiseEventsCount: number; // Tổng lượt vinh danh
}

export interface SessionScorePoint {
  sessionId: string;
  sessionDate: string;
  formattedDate: string;
  lessonTitle: string;
  className: string;
  avgHomework: number;
  avgTest: number;
  totalStudents: number;
  submittedHwRate: number;
}

export interface GradeTrendData {
  gradeLevel: GradeLevel;
  gradeName: string;
  dataPoints: SessionScorePoint[];
  hasData: boolean;
  overallAvgHw: number;
  overallAvgTest: number;
}

export interface TodayClassInfo {
  classItem: ClassItem;
  studentCount: number;
  isToday: boolean;
  scheduleText: string;
  latestSession?: Session;
  latestSessionGradedCount?: number;
}

/**
 * Helper to check if a class schedule matches today's day of week
 */
export function isClassScheduledToday(scheduleStr: string): boolean {
  if (!scheduleStr) return false;
  const todayDay = new Date().getDay(); // 0 is Sunday, 1 is Monday ... 6 is Saturday

  const lower = scheduleStr.toLowerCase();

  // Keyword check per day of week
  const patterns: Record<number, (string | RegExp)[]> = {
    0: ['chủ nhật', 'chu nhat', 'cn', 'sunday', /\bcn\b/i],
    1: ['thứ 2', 'thứ hai', 'thu 2', 'thu hai', /\bt2\b/i, 'monday'],
    2: ['thứ 3', 'thứ ba', 'thu 3', 'thu ba', /\bt3\b/i, 'tuesday'],
    3: ['thứ 4', 'thứ tư', 'thu 4', 'thu tu', /\bt4\b/i, 'wednesday'],
    4: ['thứ 5', 'thứ năm', 'thu 5', 'thu nam', /\bt5\b/i, 'thursday'],
    5: ['thứ 6', 'thứ sáu', 'thu 6', 'thu sau', /\bt6\b/i, 'friday'],
    6: ['thứ 7', 'thứ bảy', 'thu 7', 'thu bay', /\bt7\b/i, 'saturday'],
  };

  const list = patterns[todayDay] || [];
  return list.some((item) => {
    if (typeof item === 'string') {
      return lower.includes(item);
    }
    return item.test(scheduleStr);
  });
}

/**
 * Format short date (DD/MM)
 */
export function formatShortDate(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}`;
    }
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
    }
  } catch {
    // fallback
  }
  return dateStr;
}

/**
 * Calculate all high-level KPI Metrics for Dashboard
 */
export function computeDashboardMetrics(
  classes: ClassItem[],
  students: Student[],
  warnings: Warning[],
  studentSessions: StudentSession[],
  classStudents?: { class_id: string; student_id: string; leave_date?: string }[]
): DashboardMetrics {
  // 1. Module 7: Số lớp & Sĩ số
  const activeClasses = classes.filter((c) => c.status === 'active');
  const activeClassesCount = activeClasses.length;

  const activeStudents = students.filter((s) => s.status === 'studying');
  const activeStudentsCount = activeStudents.length;
  const stoppedStudents = students.filter((s) => s.status === 'stopped');
  const stoppedStudentsCount = stoppedStudents.length;
  const pausedStudents = students.filter((s) => s.status === 'paused');
  const pausedStudentsCount = pausedStudents.length;
  const totalStudentsRegistered = students.length;

  const averageClassSize =
    activeClassesCount > 0
      ? parseFloat((activeStudentsCount / activeClassesCount).toFixed(1))
      : 0;

  // 2. Module 6: Điểm TB & Đánh giá Học lực toàn trung tâm
  let totalHwRecords = 0;
  let submittedHwRecords = 0;
  let totalTestScoreSum = 0;
  let totalTestScoreCount = 0;
  let totalHwScoreSum = 0;
  let totalHwScoreCount = 0;

  let presentCount = 0;
  let totalAttendanceRecords = 0;

  let excellentCount = 0; // >= 8.5
  let goodCount = 0;      // 6.5 - 8.4
  let averageCount = 0;   // 5.0 - 6.4
  let belowStandardCount = 0; // < 5.0

  for (const ss of studentSessions) {
    // Attendance stats
    if (ss.attendance) {
      totalAttendanceRecords++;
      if (ss.attendance === 'present' || ss.attendance === 'late') {
        presentCount++;
      }
    }

    // Homework stats (nếu không được miễn bài tập)
    if (!ss.exempt && !ss.exempt_homework) {
      totalHwRecords++;
      if (ss.homework_submitted || (ss.homework_score !== undefined && ss.homework_score > 0)) {
        submittedHwRecords++;
      }
      if (ss.homework_score !== undefined && ss.homework_score !== null && ss.homework_score >= 0) {
        totalHwScoreSum += ss.homework_score;
        totalHwScoreCount++;
      }
    }

    // Test stats (nếu không được miễn thi)
    if (!ss.exempt && !ss.exempt_test) {
      if (ss.test_score !== undefined && ss.test_score !== null && ss.test_score >= 0) {
        totalTestScoreSum += ss.test_score;
        totalTestScoreCount++;

        // Phân phối phổ điểm
        if (ss.test_score >= 8.5) {
          excellentCount++;
        } else if (ss.test_score >= 6.5) {
          goodCount++;
        } else if (ss.test_score >= 5.0) {
          averageCount++;
        } else {
          belowStandardCount++;
        }
      }
    }
  }

  const centerAvgTestScore =
    totalTestScoreCount > 0
      ? parseFloat((totalTestScoreSum / totalTestScoreCount).toFixed(1))
      : 0;

  const centerAvgHwScore =
    totalHwScoreCount > 0
      ? parseFloat((totalHwScoreSum / totalHwScoreCount).toFixed(1))
      : 0;

  const homeworkCompletionRate =
    totalHwRecords > 0 ? Math.round((submittedHwRecords / totalHwRecords) * 100) : 100;

  const attendanceRate =
    totalAttendanceRecords > 0 ? Math.round((presentCount / totalAttendanceRecords) * 100) : 100;

  // Tỉ lệ học sinh nghỉ hẳn trên tổng số học sinh đang học
  const absenceRate =
    activeStudentsCount > 0
      ? Math.round((stoppedStudentsCount / activeStudentsCount) * 1000) / 10
      : 0;

  // 3. Module 2: Smart Warning Engine (Thống kê theo SỐ HỌC SINH DUY NHẤT)
  const unresolvedWarnings = warnings.filter((w) => !w.resolved);
  const totalActiveWarningsCount = unresolvedWarnings.length;
  const resolvedWarningsCount = warnings.filter((w) => w.resolved).length;

  // Gom theo student_id để xác định mức độ ưu tiên cao nhất của từng học sinh
  // Thứ tự ưu tiên: P1 (Khẩn cấp) > P2 (Theo dõi) > P3 (Nhắc nhở)
  const studentHighestPriorityMap = new Map<string, PriorityLevel>();

  for (const w of unresolvedWarnings) {
    if (!w.student_id) continue;
    const current = studentHighestPriorityMap.get(w.student_id);
    if (!current) {
      studentHighestPriorityMap.set(w.student_id, w.priority);
    } else {
      if (w.priority === 'P1') {
        studentHighestPriorityMap.set(w.student_id, 'P1');
      } else if (w.priority === 'P2' && current !== 'P1') {
        studentHighestPriorityMap.set(w.student_id, 'P2');
      } else if (w.priority === 'P3' && current !== 'P1' && current !== 'P2') {
        studentHighestPriorityMap.set(w.student_id, 'P3');
      }
    }
  }

  let uniqueP1StudentCount = 0;
  let uniqueP2StudentCount = 0;
  let uniqueP3StudentCount = 0;

  for (const priority of studentHighestPriorityMap.values()) {
    if (priority === 'P1') uniqueP1StudentCount++;
    else if (priority === 'P2') uniqueP2StudentCount++;
    else if (priority === 'P3') uniqueP3StudentCount++;
  }

  const uniqueStudentsWithWarningsCount = studentHighestPriorityMap.size;

  // Tuyên Dương & Bứt Phá (Thống kê theo SỐ HỌC SINH DUY NHẤT)
  const praiseWarnings = warnings.filter((w) => w.priority === 'Praise');
  const praisedStudentIds = new Set<string>();
  const topScoreStudentIds = new Set<string>();
  const breakthroughStudentIds = new Set<string>();

  for (const w of praiseWarnings) {
    if (!w.student_id) continue;
    praisedStudentIds.add(w.student_id);
    const text = ((w.warning_type || '') + ' ' + (w.reason || '')).toLowerCase();
    if (
      text.includes('tiến bộ') ||
      text.includes('bứt phá') ||
      text.includes('vượt bậc') ||
      text.includes('cải thiện') ||
      text.includes('tăng điểm')
    ) {
      breakthroughStudentIds.add(w.student_id);
    } else {
      topScoreStudentIds.add(w.student_id);
    }
  }

  const uniquePraisedStudentsCount = praisedStudentIds.size;
  const topScorePraisedStudentCount = topScoreStudentIds.size;
  const breakthroughPraisedStudentCount = breakthroughStudentIds.size;
  const totalPraiseEventsCount = praiseWarnings.length;

  // Học sinh vướng cảnh báo nguy cơ nặng (P1 hoặc P2)
  const riskStudentIds = new Set(
    unresolvedWarnings
      .filter((w) => w.priority === 'P1' || w.priority === 'P2')
      .map((w) => w.student_id)
  );

  const academicSafetyRate =
    activeStudentsCount > 0
      ? Math.max(0, Math.round(((activeStudentsCount - riskStudentIds.size) / activeStudentsCount) * 100))
      : 100;

  return {
    activeClassesCount,
    activeStudentsCount,
    stoppedStudentsCount,
    pausedStudentsCount,
    totalStudentsRegistered,
    averageClassSize,
    centerAvgTestScore,
    centerAvgHwScore,
    totalGradedSessions: totalTestScoreCount,
    homeworkCompletionRate,
    submittedHomeworkCount: submittedHwRecords,
    totalHomeworkCount: totalHwRecords,
    attendanceRate,
    presentCount,
    totalAttendanceRecords,
    absenceRate,
    excellentCount,
    goodCount,
    averageCount,
    belowStandardCount,
    uniqueStudentsWithWarningsCount,
    uniqueP1StudentCount,
    uniqueP2StudentCount,
    uniqueP3StudentCount,
    totalActiveWarningsCount,
    resolvedWarningsCount,
    academicSafetyRate,
    uniquePraisedStudentsCount,
    topScorePraisedStudentCount,
    breakthroughPraisedStudentCount,
    totalPraiseEventsCount,
  };
}

/**
 * Calculate Grade Trends for 4 Latest Sessions per Grade Level (Khối 6, 7, 8, 9)
 */
export function computeGradeLevelTrends(
  classes: ClassItem[],
  sessions: Session[],
  studentSessions: StudentSession[]
): Record<GradeLevel, GradeTrendData> {
  const grades: GradeLevel[] = [6, 7, 8, 9];
  const result = {} as Record<GradeLevel, GradeTrendData>;

  // Build maps for fast lookups
  const classById = new Map<string, ClassItem>();
  classes.forEach((c) => {
    if (c.id) classById.set(c.id, c);
  });

  const ssBySessionId = new Map<string, StudentSession[]>();
  studentSessions.forEach((ss) => {
    const list = ssBySessionId.get(ss.session_id) || [];
    list.push(ss);
    ssBySessionId.set(ss.session_id, list);
  });

  for (const grade of grades) {
    const gradeClasses = classes.filter((c) => c.status === 'active' && c.grade_level === grade);
    const gradeClassIds = new Set(gradeClasses.map((c) => c.id).filter(Boolean) as string[]);

    // Find all sessions belonging to this grade's classes
    const gradeSessions = sessions
      .filter((s) => s.class_id && gradeClassIds.has(s.class_id))
      .sort((a, b) => {
        const dateA = a.session_date || '';
        const dateB = b.session_date || '';
        return dateB.localeCompare(dateA); // newest first
      });

    // Take the 4 latest sessions
    const latest4Sessions = gradeSessions.slice(0, 4).reverse(); // order chronological for chart (left to right)

    const dataPoints: SessionScorePoint[] = [];
    let sumHw = 0;
    let sumTest = 0;
    let validHwCount = 0;
    let validTestCount = 0;

    latest4Sessions.forEach((session, index) => {
      if (!session.id) return;
      const records = ssBySessionId.get(session.id) || [];
      const parentClass = classById.get(session.class_id);

      let hwTotal = 0;
      let hwCount = 0;
      let testTotal = 0;
      let testCount = 0;
      let submittedHw = 0;

      for (const r of records) {
        if (r.attendance === 'present' || r.attendance === 'late') {
          if (r.homework_submitted) submittedHw++;

          if (r.homework_score !== undefined && r.homework_score >= 0) {
            hwTotal += r.homework_score;
            hwCount++;
          }
          if (r.test_score !== undefined && r.test_score >= 0) {
            testTotal += r.test_score;
            testCount++;
          }
        }
      }

      const avgHw = hwCount > 0 ? Math.round((hwTotal / hwCount) * 10) / 10 : 0;
      const avgTest = testCount > 0 ? Math.round((testTotal / testCount) * 10) / 10 : 0;
      const submittedHwRate = records.length > 0 ? Math.round((submittedHw / records.length) * 100) : 0;

      if (hwCount > 0) {
        sumHw += avgHw;
        validHwCount++;
      }
      if (testCount > 0) {
        sumTest += avgTest;
        validTestCount++;
      }

      dataPoints.push({
        sessionId: session.id,
        sessionDate: session.session_date,
        formattedDate: formatShortDate(session.session_date) || `B.${index + 1}`,
        lessonTitle: session.lesson_title || `Buổi ${index + 1}`,
        className: parentClass?.class_name || `Khối ${grade}`,
        avgHomework: avgHw,
        avgTest: avgTest,
        totalStudents: records.length,
        submittedHwRate,
      });
    });

    const overallAvgHw = validHwCount > 0 ? Math.round((sumHw / validHwCount) * 10) / 10 : 0;
    const overallAvgTest = validTestCount > 0 ? Math.round((sumTest / validTestCount) * 10) / 10 : 0;

    result[grade] = {
      gradeLevel: grade,
      gradeName: `Khối ${grade}`,
      dataPoints,
      hasData: dataPoints.length > 0,
      overallAvgHw,
      overallAvgTest,
    };
  }

  return result;
}

/**
 * Get active classes with schedule indicators and latest session status
 */
export function computeTodayClassesList(
  classes: ClassItem[],
  sessions: Session[],
  studentSessions: StudentSession[],
  classStudents: { class_id: string; student_id: string }[]
): TodayClassInfo[] {
  const activeClasses = classes.filter((c) => c.status === 'active');

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const studentCountByClass = new Map<string, number>();
  classStudents.forEach((cs) => {
    const count = studentCountByClass.get(cs.class_id) || 0;
    studentCountByClass.set(cs.class_id, count + 1);
  });

  const sessionsByClass = new Map<string, Session[]>();
  sessions.forEach((s) => {
    const list = sessionsByClass.get(s.class_id) || [];
    list.push(s);
    sessionsByClass.set(s.class_id, list);
  });

  const ssBySessionId = new Map<string, number>();
  studentSessions.forEach((ss) => {
    const count = ssBySessionId.get(ss.session_id) || 0;
    ssBySessionId.set(ss.session_id, count + 1);
  });

  return activeClasses.map((classItem) => {
    const classId = classItem.id || '';
    const classSessions = sessionsByClass.get(classId) || [];
    // Sort newest first
    classSessions.sort((a, b) => (b.session_date || '').localeCompare(a.session_date || ''));

    const latestSession = classSessions[0];
    const latestSessionGradedCount = latestSession?.id ? ssBySessionId.get(latestSession.id) || 0 : 0;

    const isScheduledToday = isClassScheduledToday(classItem.schedule);
    const hasTodaySession = latestSession?.session_date === todayStr;
    const isToday = isScheduledToday || hasTodaySession;

    return {
      classItem,
      studentCount: studentCountByClass.get(classId) || 0,
      isToday,
      scheduleText: classItem.schedule || 'Chưa xếp lịch',
      latestSession,
      latestSessionGradedCount,
    };
  });
}
