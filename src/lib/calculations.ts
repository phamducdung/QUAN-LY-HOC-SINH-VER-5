import { Session, StudentSession, AttendanceStatus, Student } from '../types';

export interface StudentGradeBreakdown {
  studentId: string;
  totalSessions: number;
  presentCount: number;
  lateCount: number;
  excusedCount: number;
  unexcusedCount: number;
  notJoinedCount: number;
  
  // Homework stats
  hwValidCount: number;
  hwTotalScore: number;
  hwAverage: number | null; // null if all exempt/no HW
  
  // Test stats
  testValidCount: number;
  testTotalScore: number;
  testAverage: number | null; // null if all exempt/no test
  
  // Weighted Cycle Average
  weightedAverage: number | null;
  
  // Status flags
  hasPendingMakeup: boolean;
  unsubmittedHwCount: number;
  
  // Detailed per-session breakdown for UI render
  sessionDetails: {
    sessionId: string;
    sessionDate: string;
    lessonTitle: string;
    attendance: AttendanceStatus | 'not_joined';
    
    // HW details
    hwStatus: 'graded' | 'exempt' | 'excused_exempt' | 'unexcused_zero' | 'unsubmitted_zero' | 'not_applicable' | 'not_joined';
    hwScore?: number;
    
    // Test details
    testStatus: 'graded' | 'exempt' | 'pending_makeup' | 'makeup_graded' | 'unexcused_zero' | 'not_applicable' | 'not_joined';
    testScore?: number;
    
    comment?: string;
  }[];
}

/**
 * Calculations Engine for Module 6 & Module 7:
 * Handles grading, exempt homework/tests, excused/unexcused absences, makeup tests, weighted averages,
 * and Student Lifecycle (join_date and leave_date movement logic).
 */
export function calculateStudentCycleGrades(
  studentId: string,
  classSessions: Session[],
  studentSessions: StudentSession[],
  classStudentLink?: { join_date?: string; leave_date?: string }
): StudentGradeBreakdown {
  const sessionMap = new Map(classSessions.map((s) => [s.id!, s]));
  const validSessions = studentSessions
    .filter((ss) => ss.student_id === studentId && sessionMap.has(ss.session_id))
    .sort((a, b) => {
      const sa = sessionMap.get(a.session_id);
      const sb = sessionMap.get(b.session_id);
      return (sa?.session_date || '').localeCompare(sb?.session_date || '');
    });

  let presentCount = 0;
  let lateCount = 0;
  let excusedCount = 0;
  let unexcusedCount = 0;
  let notJoinedCount = 0;

  let hwValidCount = 0;
  let hwTotalScore = 0;

  let testValidCount = 0;
  let testTotalScore = 0;

  let hasPendingMakeup = false;
  let unsubmittedHwCount = 0;

  const sessionDetails: StudentGradeBreakdown['sessionDetails'] = [];

  const sortedClassSessions = [...classSessions].sort((a, b) =>
    a.session_date.localeCompare(b.session_date)
  );

  sortedClassSessions.forEach((sessionInfo) => {
    const ss = validSessions.find((s) => s.session_id === sessionInfo.id);
    const sessionDate = sessionInfo.session_date;

    // Check Student Lifecycle bounds (join_date and leave_date)
    const isBeforeJoin = classStudentLink?.join_date && sessionDate < classStudentLink.join_date;
    const isAfterLeave = classStudentLink?.leave_date && sessionDate > classStudentLink.leave_date;
    const isNotJoined = !!(isBeforeJoin || isAfterLeave);

    if (isNotJoined) {
      notJoinedCount++;
      sessionDetails.push({
        sessionId: sessionInfo.id!,
        sessionDate: sessionInfo.session_date,
        lessonTitle: sessionInfo.lesson_title,
        attendance: 'not_joined',
        hwStatus: 'not_joined',
        testStatus: 'not_joined',
        comment: isBeforeJoin ? 'Chưa gia nhập lớp' : 'Đã rút khỏi lớp',
      });
      return;
    }

    if (!ss) {
      sessionDetails.push({
        sessionId: sessionInfo.id!,
        sessionDate: sessionInfo.session_date,
        lessonTitle: sessionInfo.lesson_title,
        attendance: 'present',
        hwStatus: 'not_applicable',
        testStatus: 'not_applicable',
      });
      return;
    }

    // Track Attendance
    if (ss.attendance === 'present') presentCount++;
    else if (ss.attendance === 'late') lateCount++;
    else if (ss.attendance === 'absent_excused') excusedCount++;
    else if (ss.attendance === 'absent_unexcused') unexcusedCount++;

    const isExemptAll = !!ss.exempt;
    const isExemptHw = isExemptAll || !!ss.exempt_homework;
    const isExemptTest = isExemptAll || !!ss.exempt_test;

    // --- 1. HOMEWORK EVALUATION ---
    let hwStatus: StudentGradeBreakdown['sessionDetails'][0]['hwStatus'] = 'not_applicable';
    let effectiveHwScore: number | undefined = undefined;

    if (sessionInfo.has_homework !== false) {
      if (isExemptHw) {
        hwStatus = 'exempt';
      } else if (ss.attendance === 'absent_excused') {
        // Vắng có phép -> Miễn BTVN (loại khỏi mẫu số)
        hwStatus = 'excused_exempt';
      } else if (ss.attendance === 'absent_unexcused') {
        // Vắng không phép -> Tính 0 điểm BTVN, giữ mẫu số
        hwStatus = 'unexcused_zero';
        effectiveHwScore = 0;
        hwValidCount++;
        hwTotalScore += 0;
      } else if (!ss.homework_submitted && !ss.late_submit && (ss.homework_score === undefined || ss.homework_score === null)) {
        // Có mặt nhưng không làm/không nộp BTVN -> 0 điểm
        hwStatus = 'unsubmitted_zero';
        effectiveHwScore = 0;
        hwValidCount++;
        hwTotalScore += 0;
        unsubmittedHwCount++;
      } else if (typeof ss.homework_score === 'number' && !Number.isNaN(ss.homework_score) && ss.homework_score >= 0) {
        // Được chấm điểm bình thường
        hwStatus = 'graded';
        effectiveHwScore = ss.homework_score;
        hwValidCount++;
        hwTotalScore += ss.homework_score;
      } else {
        // Chưa nhập điểm
        hwStatus = 'not_applicable';
      }
    }

    // --- 2. TEST EVALUATION ---
    let testStatus: StudentGradeBreakdown['sessionDetails'][0]['testStatus'] = 'not_applicable';
    let effectiveTestScore: number | undefined = undefined;

    if (sessionInfo.has_test !== false) {
      if (isExemptTest) {
        testStatus = 'exempt';
      } else if (ss.attendance === 'absent_unexcused') {
        // Vắng không phép -> 0 điểm kiểm tra, giữ mẫu số (không được thi bù)
        testStatus = 'unexcused_zero';
        effectiveTestScore = 0;
        testValidCount++;
        testTotalScore += 0;
      } else if (ss.attendance === 'absent_excused') {
        // Vắng có phép: Nếu đã có điểm thi bù -> tính điểm thi bù. Nếu chưa -> Tạm miễn (chờ thi bù)
        if (typeof ss.test_score === 'number' && !Number.isNaN(ss.test_score) && ss.test_score >= 0) {
          testStatus = 'makeup_graded';
          effectiveTestScore = ss.test_score;
          testValidCount++;
          testTotalScore += ss.test_score;
        } else {
          testStatus = 'pending_makeup';
          hasPendingMakeup = true;
        }
      } else if (typeof ss.test_score === 'number' && !Number.isNaN(ss.test_score) && ss.test_score >= 0) {
        testStatus = ss.makeup_test ? 'makeup_graded' : 'graded';
        effectiveTestScore = ss.test_score;
        testValidCount++;
        testTotalScore += ss.test_score;
      } else if (ss.makeup_test) {
        testStatus = 'pending_makeup';
        hasPendingMakeup = true;
      } else {
        testStatus = 'not_applicable';
      }
    }

    sessionDetails.push({
      sessionId: ss.session_id,
      sessionDate: sessionInfo.session_date,
      lessonTitle: sessionInfo.lesson_title,
      attendance: ss.attendance,
      hwStatus,
      hwScore: effectiveHwScore,
      testStatus,
      testScore: effectiveTestScore,
      comment: ss.custom_comment,
    });
  });

  // Calculate averages
  const hwAverageRaw = hwValidCount > 0 ? parseFloat((hwTotalScore / hwValidCount).toFixed(1)) : null;
  const hwAverage = hwAverageRaw !== null && !Number.isNaN(hwAverageRaw) ? hwAverageRaw : null;

  const testAverageRaw = testValidCount > 0 ? parseFloat((testTotalScore / testValidCount).toFixed(1)) : null;
  const testAverage = testAverageRaw !== null && !Number.isNaN(testAverageRaw) ? testAverageRaw : null;

  // Calculate weighted average
  let weightedAverage: number | null = null;
  if (hwAverage !== null && testAverage !== null) {
    const calc = parseFloat((hwAverage * 0.3 + testAverage * 0.7).toFixed(1));
    weightedAverage = !Number.isNaN(calc) ? calc : null;
  } else if (hwAverage !== null) {
    weightedAverage = hwAverage; // 100% weight to HW if test is totally exempt
  } else if (testAverage !== null) {
    weightedAverage = testAverage; // 100% weight to Test if HW is totally exempt
  }

  return {
    studentId,
    totalSessions: sessionDetails.filter(s => s.attendance !== 'not_joined').length,
    presentCount,
    lateCount,
    excusedCount,
    unexcusedCount,
    notJoinedCount,
    hwValidCount,
    hwTotalScore,
    hwAverage,
    testValidCount,
    testTotalScore,
    testAverage,
    weightedAverage,
    hasPendingMakeup,
    unsubmittedHwCount,
    sessionDetails,
  };
}

/**
 * Format average score for display
 */
export function formatScore(score: number | null | undefined): string {
  if (score === null || score === undefined || typeof score !== 'number' || Number.isNaN(score) || !Number.isFinite(score)) {
    return 'Miễn';
  }
  return score.toFixed(1);
}

export interface SessionSummaryMetrics {
  total: number;
  present: number;
  presentPct: number;
  absentCount: number;
  hwDone: number;
  hwPct: number;
  avgHw: number;
  avgTest: number;
  pendingTestCount: number;
  needSupport: number;
  hasHomework: boolean;
  hasTest: boolean;
  hwCount: number;
  testCount: number;
  hwRequiredCount: number; // Số học sinh có nghĩa vụ nộp BTVN (Sĩ số - Miễn - Vắng có phép)
  unsubmittedHwCount: number; // Số học sinh không nộp/chưa làm
  unexcusedAbsentCount: number; // Số học sinh vắng không phép (bị 0đ)
}

/**
 * Standardized Single Source of Truth for calculating session-level metrics:
 * Chuẩn hóa Quản lý Chất lượng Giáo dục (QA Educational Matrix):
 * - BTVN:
 *   + Có điểm hợp lệ -> Cộng điểm, mẫu số + 1
 *   + Chưa làm / Không nộp BTVN -> Tự động 0đ, mẫu số + 1
 *   + Vắng không phép (absent_unexcused) -> Tự động 0đ, mẫu số + 1
 *   + Miễn BTVN, Vắng có phép, Nộp muộn chờ chấm -> Loại khỏi mẫu số
 * - Bài Kiểm Tra:
 *   + Có điểm hợp lệ -> Cộng điểm, mẫu số + 1
 *   + Vắng không phép -> Tự động 0đ, mẫu số + 1
 *   + Vắng có phép / Chờ thi bù / Miễn KT -> Loại khỏi mẫu số
 * - Tỉ lệ Nộp BTVN (%): hwDone / hwRequiredCount * 100
 */
export function calculateSessionSummaryMetrics(
  students: Student[],
  studentSessions: Record<number | string, StudentSession | Partial<StudentSession>>,
  selectedSession?: Session | null
): SessionSummaryMetrics {
  const total = students.length;
  const hasHw = selectedSession?.has_homework !== false;
  const hasTest = selectedSession?.has_test !== false;

  if (total === 0) {
    return {
      total: 0,
      present: 0,
      presentPct: 0,
      absentCount: 0,
      hwDone: 0,
      hwPct: 0,
      avgHw: 0,
      avgTest: 0,
      pendingTestCount: 0,
      needSupport: 0,
      hasHomework: hasHw,
      hasTest,
      hwCount: 0,
      testCount: 0,
      hwRequiredCount: 0,
      unsubmittedHwCount: 0,
      unexcusedAbsentCount: 0,
    };
  }

  let present = 0;
  let absentCount = 0;
  let unexcusedAbsentCount = 0;
  let hwDone = 0;
  let hwRequiredCount = 0;
  let unsubmittedHwCount = 0;
  let totalHw = 0;
  let hwCount = 0;
  let totalTest = 0;
  let testCount = 0;
  let pendingTestCount = 0;
  let needSupport = 0;

  students.forEach((st) => {
    const rec = studentSessions[st.id!];
    const attendance = rec?.attendance || 'present';
    const isAttended = attendance === 'present' || attendance === 'late';
    const isAbsentExcused = attendance === 'absent_excused';
    const isAbsentUnexcused = attendance === 'absent_unexcused';

    if (isAttended) {
      present++;
    } else {
      absentCount++;
      if (isAbsentUnexcused) unexcusedAbsentCount++;
    }

    if (!rec) {
      // Trường hợp học sinh chưa có record nhưng có đi học
      if (hasHw && isAttended) {
        hwRequiredCount++;
      }
      return;
    }

    const isHwExempt = !!(rec.exempt || rec.exempt_homework);
    const isTestExempt = !!(rec.exempt || rec.exempt_test);

    // ==========================================
    // 1. TÍNH TOÁN BÀI TẬP VỀ NHÀ (BTVN)
    // ==========================================
    if (hasHw) {
      const isObligatedForHw = !isHwExempt && !isAbsentExcused;
      if (isObligatedForHw) {
        hwRequiredCount++;
      }

      if (isHwExempt) {
        // Miễn BTVN: Bỏ qua khỏi ĐTB và tỷ lệ
      } else if (isAbsentExcused) {
        // Vắng có phép: Bỏ qua (học sinh được quyền nộp bù sau)
      } else if (isAbsentUnexcused) {
        // Vắng không phép: Nhận 0đ kỷ luật vào ĐTB buổi học
        totalHw += 0;
        hwCount++;
        unsubmittedHwCount++;
      } else if (isAttended) {
        // Học sinh có mặt/đi muộn
        if (rec.late_submit) {
          // Nộp muộn:
          if (typeof rec.homework_score === 'number' && !Number.isNaN(rec.homework_score) && rec.homework_score >= 0) {
            totalHw += rec.homework_score;
            hwCount++;
            hwDone++;
          }
          // Nếu nộp muộn mà chưa chấm điểm -> tạm thời chờ chấm, không phạt 0đ ngay
        } else if (rec.homework_submitted === false) {
          // Chưa làm / Không nộp BTVN -> Tự động 0đ vào ĐTB
          const score = typeof rec.homework_score === 'number' && !Number.isNaN(rec.homework_score) ? rec.homework_score : 0;
          totalHw += score;
          hwCount++;
          unsubmittedHwCount++;
        } else if (typeof rec.homework_score === 'number' && !Number.isNaN(rec.homework_score) && rec.homework_score >= 0) {
          // Đã làm và có điểm hợp lệ
          totalHw += rec.homework_score;
          hwCount++;
          hwDone++;
        } else {
          // homework_submitted === true nhưng chưa gõ điểm -> đang chấm dở, chưa tính vào hwCount
          hwDone++;
        }
      }
    }

    // ==========================================
    // 2. TÍNH TOÁN BÀI KIỂM TRA (TEST)
    // ==========================================
    if (hasTest) {
      if (isTestExempt) {
        // Miễn kiểm tra
      } else if (isAbsentExcused) {
        // Vắng có phép: Nếu đã thi bù có điểm -> tính điểm thi bù. Nếu chưa -> loại khỏi mẫu số
        if (typeof rec.test_score === 'number' && !Number.isNaN(rec.test_score) && rec.test_score >= 0) {
          totalTest += rec.test_score;
          testCount++;
        }
      } else if (isAbsentUnexcused) {
        // Vắng không phép: Nhận 0đ kỷ luật vào ĐTB bài kiểm tra
        totalTest += 0;
        testCount++;
      } else if (isAttended) {
        if (rec.makeup_test && (rec.test_score === undefined || rec.test_score === null)) {
          // Chờ thi bù
          pendingTestCount++;
        } else if (typeof rec.test_score === 'number' && !Number.isNaN(rec.test_score) && rec.test_score >= 0) {
          // Đã có điểm kiểm tra
          totalTest += rec.test_score;
          testCount++;
        } else {
          // Chưa nhập điểm
          pendingTestCount++;
        }
      }
    }

    // ==========================================
    // 3. ĐÁNH GIÁ HỌC SINH CẦN HỖ TRỢ / NGUY CƠ
    // ==========================================
    const isHwWeak = hasHw && !isHwExempt && (
      rec.homework_submitted === false ||
      (typeof rec.homework_score === 'number' && rec.homework_score < 5)
    );
    const isTestWeak = hasTest && !isTestExempt && typeof rec.test_score === 'number' && rec.test_score < 5;

    if (isAbsentUnexcused || (isAttended && (isHwWeak || isTestWeak))) {
      needSupport++;
    }
  });

  const effectiveHwPct = hwRequiredCount > 0 ? Math.round((hwDone / hwRequiredCount) * 100) : (present > 0 ? Math.round((hwDone / present) * 100) : 0);

  return {
    total,
    present,
    presentPct: total > 0 ? Math.round((present / total) * 100) : 0,
    absentCount,
    hwDone,
    hwPct: effectiveHwPct,
    avgHw: hwCount > 0 ? parseFloat((totalHw / hwCount).toFixed(1)) : 0,
    avgTest: testCount > 0 ? parseFloat((totalTest / testCount).toFixed(1)) : 0,
    pendingTestCount: hasTest ? pendingTestCount : 0,
    needSupport,
    hasHomework: hasHw,
    hasTest,
    hwCount,
    testCount,
    hwRequiredCount,
    unsubmittedHwCount,
    unexcusedAbsentCount,
  };
}
