import { db } from '../db/dexie';
import { logAudit } from './auditLogger';
import {
  Student,
  Session,
  StudentSession,
  WarningRuleConfig,
  StudentStats,
  DetectedWarning,
} from '../types';

export const DEFAULT_WARNING_RULE_CONFIG: WarningRuleConfig = {
  minTestScore: 5.0,
  consecutiveLowTests: 2,
  maxAbsences: 2,
  minHomeworkScore: 5.0,
  consecutiveLowHomework: 3,
  scoreDropThreshold: 2.0,
  excellentTestScore: 9.0,
  progressIncreaseThreshold: 1.5,
  enablePraiseAttendanceHw: true,
};

/**
 * Thuật toán Phân tích Chỉ số Học sinh (calculateStudentStats)
 * Quét toàn bộ lịch sử học tập của học sinh dựa trên tiêu chí giáo dục chuẩn hóa
 */
export function calculateStudentStats(
  studentId: string,
  classSessions: Session[],
  studentSessions: StudentSession[],
  config: WarningRuleConfig = DEFAULT_WARNING_RULE_CONFIG,
  classStudentLink?: { join_date?: string; leave_date?: string }
): StudentStats {
  const sessionMap = new Map(classSessions.map((s) => [s.id!, s]));
  
  // Filter student sessions belonging to these class sessions, skipping out-of-lifecycle sessions
  const validSessions = studentSessions
    .filter((ss) => {
      const sess = sessionMap.get(ss.session_id);
      if (!sess) return false;
      const d = sess.session_date;
      if (classStudentLink?.join_date && d < classStudentLink.join_date) return false;
      if (classStudentLink?.leave_date && d > classStudentLink.leave_date) return false;
      return true;
    })
    .sort((a, b) => {
      const sa = sessionMap.get(a.session_id);
      const sb = sessionMap.get(b.session_id);
      return (sa?.session_date || '').localeCompare(sb?.session_date || '');
    });

  const totalSessions = validSessions.length;
  if (totalSessions === 0) {
    return {
      studentId,
      totalSessions: 0,
      presentCount: 0,
      lateCount: 0,
      excusedCount: 0,
      unexcusedCount: 0,
      hwAverage: 0,
      testAverage: 0,
      weightedAverage: 0,
      consecutiveLowTestCount: 0,
      consecutiveLowHwCount: 0,
      unsubmittedHwCount: 0,
      scoreTrend: 'Stable',
    };
  }

  let presentCount = 0;
  let lateCount = 0;
  let excusedCount = 0;
  let unexcusedCount = 0;
  let unsubmittedHwCount = 0;

  let totalHwScore = 0;
  let hwSessionCount = 0;
  let totalTestScore = 0;
  let testSessionCount = 0;

  let totalSessionWeightedScores = 0;
  let evaluatedSessionCount = 0;

  validSessions.forEach((s) => {
    const sess = sessionMap.get(s.session_id);
    const isAttended = s.attendance === 'present' || s.attendance === 'late';

    if (s.attendance === 'present') {
      presentCount++;
    } else if (s.attendance === 'late') {
      lateCount++;
    } else if (s.attendance === 'absent_excused') {
      excusedCount++;
    } else if (s.attendance === 'absent_unexcused') {
      unexcusedCount++;
    }

    const isHwExempt = s.exempt || s.exempt_homework;
    const isTestExempt = s.exempt || s.exempt_test;

    // 1. Đánh giá BTVN
    if (sess?.has_homework !== false) {
      if (s.attendance === 'absent_unexcused') {
        // Vắng không phép -> Tính 0 điểm BTVN, tính vào mẫu số
        hwSessionCount++;
        totalHwScore += 0;
        unsubmittedHwCount++;
      } else if (s.attendance === 'present' || s.attendance === 'late') {
        if (!isHwExempt) {
          if (!s.homework_submitted && !s.late_submit && (s.homework_score === undefined || s.homework_score === null)) {
            // Không nộp -> 0đ
            hwSessionCount++;
            totalHwScore += 0;
            unsubmittedHwCount++;
          } else if (typeof s.homework_score === 'number' && s.homework_score >= 0) {
            hwSessionCount++;
            totalHwScore += s.homework_score;
          }
        }
      }
      // absent_excused -> miễn BTVN
    }

    // 2. Đánh giá Bài kiểm tra
    if (sess?.has_test !== false) {
      if (s.attendance === 'absent_unexcused') {
        // Vắng không phép -> 0 điểm kiểm tra, tính vào mẫu số
        testSessionCount++;
        totalTestScore += 0;
      } else if (s.attendance === 'absent_excused') {
        // Vắng có phép -> Nếu đã thi bù có điểm thì tính điểm thi bù
        if (typeof s.test_score === 'number' && s.test_score >= 0) {
          testSessionCount++;
          totalTestScore += s.test_score;
        }
      } else if (s.attendance === 'present' || s.attendance === 'late') {
        if (!isTestExempt && typeof s.test_score === 'number' && s.test_score >= 0) {
          testSessionCount++;
          totalTestScore += s.test_score;
        }
      }
    }
  });

  const rawHwAvg = hwSessionCount > 0 ? totalHwScore / hwSessionCount : 0;
  const rawTestAvg = testSessionCount > 0 ? totalTestScore / testSessionCount : 0;
  
  // Trọng số 30% BTVN, 70% Bài kiểm tra
  let rawWeightedAvg = 0;
  if (hwSessionCount > 0 && testSessionCount > 0) {
    rawWeightedAvg = rawHwAvg * 0.3 + rawTestAvg * 0.7;
  } else if (hwSessionCount > 0) {
    rawWeightedAvg = rawHwAvg;
  } else if (testSessionCount > 0) {
    rawWeightedAvg = rawTestAvg;
  }

  const hwAverage = parseFloat(rawHwAvg.toFixed(1));
  const testAverage = parseFloat(rawTestAvg.toFixed(1));
  const weightedAverage = parseFloat(rawWeightedAvg.toFixed(1));

  // Quét chuỗi điểm kém liên tiếp (duyệt ngược từ buổi mới nhất)
  let consecutiveLowTestCount = 0;
  for (let i = validSessions.length - 1; i >= 0; i--) {
    const s = validSessions[i];
    const sess = sessionMap.get(s.session_id);
    const isTestExempt = s.exempt || s.exempt_test;
    if (!isTestExempt && sess?.has_test !== false) {
      if (s.attendance === 'present' || s.attendance === 'late') {
        const effScore = s.test_score;
        if (effScore !== undefined && effScore >= 0 && effScore < config.minTestScore) {
          consecutiveLowTestCount++;
        } else if (effScore !== undefined && effScore >= config.minTestScore) {
          break; // Chuỗi bị ngắt nếu điểm đạt yêu cầu
        }
      } else if (s.attendance === 'absent_unexcused') {
        // Nghỉ không phép tính là 1 buổi điểm kém (0đ do không thi)
        consecutiveLowTestCount++;
      } else if (s.attendance === 'absent_excused') {
        // Nghỉ có phép ngắt chuỗi (Mitigate false-positive)
        break;
      }
    }
  }

  // Quét chuỗi BTVN kém/thiếu liên tiếp
  let consecutiveLowHwCount = 0;
  for (let i = validSessions.length - 1; i >= 0; i--) {
    const s = validSessions[i];
    const sess = sessionMap.get(s.session_id);
    const isHwExempt = s.exempt || s.exempt_homework;
    if (!isHwExempt && sess?.has_homework !== false) {
      if (s.attendance === 'present' || s.attendance === 'late') {
        if (!s.homework_submitted || (s.homework_score !== undefined && s.homework_score < config.minHomeworkScore)) {
          consecutiveLowHwCount++;
        } else {
          break; // Nộp đủ và điểm đạt -> ngắt chuỗi
        }
      } else if (s.attendance === 'absent_unexcused') {
        // Nghỉ không phép tính là không nộp BTVN
        consecutiveLowHwCount++;
      } else if (s.attendance === 'absent_excused') {
        // Nghỉ có phép ngắt chuỗi (Mitigate false-positive)
        break;
      }
    }
  }

  // Phân tích xu hướng học tập (scoreTrend): Tiến bộ (Improving) / Ổn định (Stable) / Sa sút (Declining)
  let scoreTrend: 'Improving' | 'Stable' | 'Declining' = 'Stable';
  const attendedSessions = validSessions.filter(
    (s) => s.attendance === 'present' || s.attendance === 'late'
  );

  if (attendedSessions.length >= 3) {
    const sessionScores: number[] = [];
    attendedSessions.forEach((s) => {
      if (s.exempt) return;
      const sess = sessionMap.get(s.session_id);
      const tScore = s.test_score || 0;
      const hScore = s.homework_score || 0;
      const hasTest = sess?.has_test !== false && s.test_score !== undefined && s.test_score >= 0;
      const hasHw = sess?.has_homework !== false && s.homework_submitted !== false && !s.late_submit && s.homework_score !== undefined && s.homework_score >= 0;
      
      if (hasTest && hasHw) {
        sessionScores.push(tScore * 0.6 + hScore * 0.4);
      } else if (hasTest) {
        sessionScores.push(tScore);
      } else if (hasHw) {
        sessionScores.push(hScore);
      }
    });

    if (sessionScores.length >= 3) {
      const lastTwo = sessionScores.slice(-2);
      const avgLastTwo = (lastTwo[0] + lastTwo[1]) / 2;

      const previousScores = sessionScores.slice(0, -2);
      const avgPrev =
        previousScores.reduce((acc, val) => acc + val, 0) / previousScores.length;

      const threshold = config.progressIncreaseThreshold || 1.5;
      const dropThreshold = config.scoreDropThreshold || 2.0;

      if (avgLastTwo >= avgPrev + threshold) {
        scoreTrend = 'Improving';
      } else if (avgLastTwo <= avgPrev - dropThreshold) {
        scoreTrend = 'Declining';
      }
    }
  }

  const latestSession = attendedSessions[attendedSessions.length - 1];

  return {
    studentId,
    totalSessions,
    presentCount,
    lateCount,
    excusedCount,
    unexcusedCount,
    hwAverage,
    testAverage,
    weightedAverage,
    consecutiveLowTestCount,
    consecutiveLowHwCount,
    unsubmittedHwCount,
    scoreTrend,
    latestTestScore: latestSession?.test_score,
    latestHwScore: latestSession?.homework_score,
  };
}

/**
 * Phân loại & Kích hoạt Cảnh báo Tự động (detectStudentWarnings)
 * Sinh ra các mức độ cảnh báo (Alerts) và Tuyên dương (Praise) theo chuẩn Sư phạm:
 * 🔴 Cảnh báo Điểm số Nghiêm trọng
 * 🟠 Cảnh báo Bài tập Về nhà
 * 🟡 Cảnh báo Chuyên cần
 * 🟢 Tuyên dương Thành tích & Tiến bộ
 */
export function detectStudentWarnings(
  student: Student,
  stats: StudentStats,
  classSessions: Session[] = [],
  studentSessions: StudentSession[] = [],
  config: WarningRuleConfig = DEFAULT_WARNING_RULE_CONFIG
): DetectedWarning[] {
  const warnings: DetectedWarning[] = [];

  if (student.status !== 'studying') {
    return warnings; // Không tạo cảnh báo nếu học sinh không còn trong trạng thái đang học
  }

  // Sắp xếp các buổi học của học sinh theo thời gian để truy vết chính xác
  const studentSessionsSorted = [...studentSessions].sort((a, b) => {
    const sa = classSessions.find(s => s.id === a.session_id);
    const sb = classSessions.find(s => s.id === b.session_id);
    if (!sa || !sb) return String(a.session_id).localeCompare(String(b.session_id));
    return sa.session_date.localeCompare(sb.session_date);
  });

  const getGranularDetails = (type: 'test_score' | 'homework' | 'all'): string => {
    const weakDetails: string[] = [];
    studentSessionsSorted.forEach((ss) => {
      const sess = classSessions.find((s) => s.id === ss.session_id);
      if (!sess) return;
      
      const checkTest = type === 'test_score' || type === 'all';
      const checkHw = type === 'homework' || type === 'all';

      const isWeakTest = checkTest && sess.has_test !== false && ss.attendance !== 'absent_excused' && !(ss.exempt || ss.exempt_test) && 
        (ss.attendance === 'absent_unexcused' || (ss.test_score !== undefined && ss.test_score >= 0 && ss.test_score < config.minTestScore));
        
      const isWeakHw = checkHw && sess.has_homework !== false && ss.attendance !== 'absent_excused' && !(ss.exempt || ss.exempt_homework) && 
        (ss.attendance === 'absent_unexcused' || !ss.homework_submitted || (ss.homework_score !== undefined && ss.homework_score < config.minHomeworkScore));

      if (isWeakTest || isWeakHw) {
        let chTag = sess.test_knowledge_tag && sess.test_knowledge_tag !== 'same' ? sess.test_knowledge_tag : '';
        if (!chTag) {
          chTag = sess.lesson_title.includes(' - ') ? sess.lesson_title.split(' - ').slice(-1)[0] : 'Đại số & Hình học THCS';
        }

        const remarksList = [...(ss.quick_preset_comments || [])];
        if (ss.custom_comment) remarksList.push(ss.custom_comment);
        const remarksStr = remarksList.length > 0 ? remarksList.join(', ') : 'Chưa ghi nhận nhận xét cụ thể';

        let scoreStr = '';
        if (ss.attendance === 'absent_unexcused') {
          scoreStr = '0đ (Nghỉ không phép)';
        } else if (type === 'test_score') {
          scoreStr = `${ss.test_score !== undefined ? ss.test_score + 'đ' : 'Chưa có điểm'}`;
        } else if (type === 'homework') {
          scoreStr = `${ss.homework_submitted ? (ss.homework_score !== undefined ? ss.homework_score + 'đ' : 'Đã nộp') : 'Chưa nộp'}`;
        } else {
          const hw = ss.homework_submitted ? (ss.homework_score !== undefined ? `${ss.homework_score}đ` : 'Đã nộp') : 'Chưa nộp';
          const kt = ss.test_score !== undefined ? `${ss.test_score}đ` : 'Chưa kiểm tra';
          scoreStr = `BTVN: ${hw} | Bài KT: ${kt}`;
        }

        weakDetails.push(
          `• Bài: ${sess.lesson_title} (Kết quả: ${scoreStr})\n  ↳ Chuyên đề: ${chTag}\n  ↳ Nhận xét: ${remarksStr}`
        );
      }
    });

    if (weakDetails.length === 0) return '';
    return `\n\n[CHI TIẾT LỖ HỔNG TRUY VẾT]:\n${weakDetails.join('\n')}`;
  };

  // 🔴 1. Cảnh báo Điểm số Nghiêm trọng (P1)
  if (stats.consecutiveLowTestCount >= config.consecutiveLowTests) {
    const details = getGranularDetails('test_score');
    warnings.push({
      type: 'test_score',
      priority: 'P1',
      badgeColor: 'red',
      title: `🔴 Điểm số kém ${stats.consecutiveLowTestCount} buổi liền`,
      reason: `Có ${stats.consecutiveLowTestCount} buổi liên tiếp điểm đánh giá dưới ngưỡng ${config.minTestScore}đ (Điểm mới nhất: ${stats.latestTestScore ?? stats.latestHwScore ?? 'N/A'}đ).${details}`,
    });
  } else if (stats.weightedAverage > 0 && stats.weightedAverage < config.minTestScore && stats.totalSessions >= 2) {
    const details = getGranularDetails('all');
    warnings.push({
      type: 'test_score',
      priority: 'P1',
      badgeColor: 'red',
      title: `🔴 Điểm trung bình tích lũy quá thấp (${stats.weightedAverage}đ)`,
      reason: `Điểm TB tổng hợp (${stats.weightedAverage}đ) thấp hơn mức chuẩn mục tiêu tối thiểu (${config.minTestScore}đ).${details}`,
    });
  }

  // 🔴 / 🟠 2. Cảnh báo Bài tập Về nhà (P1 / P2)
  if (stats.consecutiveLowHwCount >= config.consecutiveLowHomework) {
    const details = getGranularDetails('homework');
    warnings.push({
      type: 'homework',
      priority: 'P1',
      badgeColor: 'red',
      title: `🔴 Thiếu/Kém BTVN ${stats.consecutiveLowHwCount} buổi liền`,
      reason: `Chưa hoàn thành bài hoặc điểm BTVN kém < ${config.minHomeworkScore}đ trong ${stats.consecutiveLowHwCount} buổi liên tiếp.${details}`,
    });
  } else if (stats.unsubmittedHwCount >= 2) {
    const details = getGranularDetails('homework');
    warnings.push({
      type: 'homework',
      priority: 'P2',
      badgeColor: 'amber',
      title: `🟠 Chưa nộp BTVN (${stats.unsubmittedHwCount} buổi)`,
      reason: `Học sinh quên nộp hoặc chưa hoàn thành BTVN ${stats.unsubmittedHwCount} buổi rải rác trong chuỗi học.${details}`,
    });
  }

  // 🔴 / 🟠 3. Cảnh báo Chuyên cần (P1 / P2)
  if (stats.unexcusedCount >= config.maxAbsences) {
    warnings.push({
      type: 'attendance',
      priority: 'P1',
      badgeColor: 'red',
      title: `🔴 Vắng không phép ${stats.unexcusedCount} buổi`,
      reason: `Học sinh đã nghỉ không phép ${stats.unexcusedCount} buổi (Giới hạn quy định: ${config.maxAbsences} buổi). Cần liên hệ PH khẩn cấp.`,
    });
  } else if (stats.unexcusedCount + stats.excusedCount >= 3) {
    warnings.push({
      type: 'attendance',
      priority: 'P2',
      badgeColor: 'amber',
      title: `🟠 Nghỉ học nhiều (${stats.unexcusedCount + stats.excusedCount} buổi)`,
      reason: `Tổng số buổi nghỉ (có phép & không phép) là ${stats.unexcusedCount + stats.excusedCount} buổi, ảnh hưởng tiến độ học Toán.`,
    });
  }

  // 🟠 4. Cảnh báo Nhắc nhở Đi muộn tái diễn (P2)
  if (stats.lateCount >= 3) {
    warnings.push({
      type: 'attendance',
      priority: 'P2',
      badgeColor: 'amber',
      title: `🟠 Nhắc nhở: Tái diễn đi muộn (${stats.lateCount} buổi)`,
      reason: `Học sinh ghi nhận đi muộn ${stats.lateCount} buổi. Cần nhắc nhở nhẹ nhàng để không bỏ lỡ phần kiểm tra đầu giờ.`,
    });
  }

  // 🟠 5. Cảnh báo Single-Session Low Score & Sa sút / Lệch phong độ (P2)
  const hasSevereScoreP1 = warnings.some((w) => w.priority === 'P1' && w.type === 'test_score');
  const hasHwP1 = warnings.some((w) => w.priority === 'P1' && w.type === 'homework');
  const hasHwP2 = warnings.some((w) => w.priority === 'P2' && w.type === 'homework');
  const hasAttendanceP1 = warnings.some((w) => w.priority === 'P1' && w.type === 'attendance');
  const hasAttendanceP2 = warnings.some((w) => w.priority === 'P2' && w.type === 'attendance');

  if (!hasSevereScoreP1 && stats.consecutiveLowTestCount === 1) {
    // Chỉ 1 buổi điểm yếu - Xếp P2 Nhắc nhở nội bộ để gỡ điểm
    const badScore = stats.latestTestScore ?? stats.latestHwScore ?? 'Dưới 5.0';
    warnings.push({
      type: 'test_score',
      priority: 'P2',
      badgeColor: 'amber',
      title: `🟠 Nhắc nhở: Điểm đánh giá buổi gần nhất chưa đạt (${badScore}đ)`,
      reason: `Bài đánh giá buổi gần nhất đạt điểm dưới mức chuẩn ${config.minTestScore}đ. Giáo viên cần hỗ trợ học sinh gỡ điểm ở buổi kế tiếp.`,
    });
  }

  const hasSevereScoreP2 = warnings.some((w) => w.priority === 'P2' && w.type === 'test_score');

  if (stats.scoreTrend === 'Declining' && !hasSevereScoreP1) {
    warnings.push({
      type: 'performance_gap',
      priority: 'P2',
      badgeColor: 'amber',
      title: `🟠 Theo dõi: Phong độ học tập có dấu hiệu sa sút`,
      reason: `Điểm số 2 buổi gần nhất sụt giảm từ ${config.scoreDropThreshold || 2.0}đ trở lên so với trung bình giai đoạn trước.`,
    });
  } else if (
    stats.latestHwScore !== undefined &&
    stats.latestTestScore !== undefined &&
    stats.latestHwScore >= 8.5 &&
    stats.latestTestScore < 6.0 &&
    stats.latestTestScore > 0 &&
    !hasSevereScoreP1
  ) {
    warnings.push({
      type: 'performance_gap',
      priority: 'P2',
      badgeColor: 'amber',
      title: `🟠 Lệch phong độ (BTVN ${stats.latestHwScore}đ vs Kiểm tra ${stats.latestTestScore}đ)`,
      reason: `BTVN tự làm ở nhà đạt điểm tốt nhưng điểm bài kiểm tra trực tiếp tại lớp đạt thấp. Cần kiểm tra kỹ năng tự làm bài.`,
    });
  }

  // 🟡 6. CẢNH BÁO MỨC P3 (CẢNH BÁO SỚM & LƯU Ý THEO DÕI)
  // P3 Chuyên cần: Vắng không phép 1 buổi đơn lẻ (khi ngưỡng P1 > 1)
  if (stats.unexcusedCount === 1 && config.maxAbsences > 1 && !hasAttendanceP1 && !hasAttendanceP2) {
    warnings.push({
      type: 'attendance',
      priority: 'P3',
      badgeColor: 'yellow',
      title: `🟡 Cảnh báo sớm: Vắng không phép 1 buổi`,
      reason: `Học sinh đã nghỉ không phép 1 buổi gần nhất. Lưu ý nhắc nhở để không vượt quá giới hạn cho phép (${config.maxAbsences} buổi).`,
    });
  }

  // P3 Đi muộn: Đi muộn 2 buổi (sắp chạm ngưỡng P2 3 buổi)
  if (stats.lateCount === 2) {
    warnings.push({
      type: 'attendance',
      priority: 'P3',
      badgeColor: 'yellow',
      title: `🟡 Lưu ý: Đi muộn 2 buổi`,
      reason: `Học sinh đã đi muộn 2 buổi trong quá trình học. Cần nhắc nhở đi học đúng giờ.`,
    });
  }

  // P3 BTVN: Chưa nộp 1 buổi đơn lẻ hoặc điểm mấp mé chuẩn
  if (!hasHwP1 && !hasHwP2) {
    if (stats.unsubmittedHwCount === 1) {
      warnings.push({
        type: 'homework',
        priority: 'P3',
        badgeColor: 'yellow',
        title: `🟡 Lưu ý: Chưa nộp BTVN 1 buổi`,
        reason: `Học sinh chưa hoàn thành/nộp BTVN 1 buổi gần đây. Cần đôn đốc nộp bù.`,
      });
    } else if (
      stats.latestHwScore !== undefined &&
      stats.latestHwScore >= config.minHomeworkScore &&
      stats.latestHwScore <= config.minHomeworkScore + 1.0
    ) {
      warnings.push({
        type: 'homework',
        priority: 'P3',
        badgeColor: 'yellow',
        title: `🟡 Lưu ý: Điểm BTVN mấp mé trung bình (${stats.latestHwScore}đ)`,
        reason: `Điểm BTVN buổi gần nhất đạt ${stats.latestHwScore}đ, ở mức vừa đủ chuẩn. Cần động viên con làm bài kỹ càng hơn.`,
      });
    }
  }

  // P3 Điểm kiểm tra: Điểm bài gần nhất mấp mé chuẩn (từ minTestScore đến minTestScore + 0.5)
  if (
    !hasSevereScoreP1 &&
    !hasSevereScoreP2 &&
    stats.latestTestScore !== undefined &&
    stats.latestTestScore >= config.minTestScore &&
    stats.latestTestScore <= config.minTestScore + 0.5
  ) {
    warnings.push({
      type: 'test_score',
      priority: 'P3',
      badgeColor: 'yellow',
      title: `🟡 Lưu ý: Điểm kiểm tra mấp mé chuẩn (${stats.latestTestScore}đ)`,
      reason: `Điểm bài kiểm tra buổi gần nhất đạt ${stats.latestTestScore}đ (mấp mé mức chuẩn tối thiểu ${config.minTestScore}đ). Cần lưu ý kèm cặp thêm.`,
    });
  }

  // 🟢 7. HỆ THỐNG TUYÊN DƯƠNG KHOA HỌC (SCIENTIFIC PRAISE ENGINE)
  // Nếu học sinh đang bị cảnh báo P1 về Điểm số nghiêm trọng, không xuất thẻ Tuyên dương để tránh thông điệp mâu thuẫn
  if (!hasSevereScoreP1) {
    const excelThreshold = config.excellentTestScore || 9.0;

    // 🌟 Tiêu chí A: Bài kiểm tra trực tiếp đạt Xuất sắc (Single Outstanding Exam)
    if (stats.latestTestScore !== undefined && stats.latestTestScore >= excelThreshold) {
      warnings.push({
        type: 'praise_score',
        priority: 'Praise',
        badgeColor: 'emerald',
        title: `🟢 Tuyên dương: Bài thi xuất sắc (${stats.latestTestScore}đ)`,
        reason: `Học sinh xuất sắc đạt ${stats.latestTestScore}đ trong bài kiểm tra trực tiếp gần nhất (Ngưỡng vinh danh: >= ${excelThreshold}đ).`,
      });
    }

    // 🌟 Tiêu chí B: Điểm trung bình tích lũy Xuất sắc qua nhiều buổi (Cumulative Excellence)
    if (stats.weightedAverage >= 8.5 && stats.totalSessions >= 2) {
      warnings.push({
        type: 'praise_score',
        priority: 'Praise',
        badgeColor: 'emerald',
        title: `🟢 Tuyên dương: Điểm TB tích lũy xuất sắc (${stats.weightedAverage}đ)`,
        reason: `Điểm trung bình học tập tổng hợp đạt ${stats.weightedAverage}đ (trên 8.5đ) qua ${stats.totalSessions} buổi học.`,
      });
    } else if (stats.totalSessions === 1 && stats.weightedAverage >= 8.0 && stats.latestTestScore === undefined) {
      warnings.push({
        type: 'praise_score',
        priority: 'Praise',
        badgeColor: 'emerald',
        title: `🟢 Tuyên dương: Khởi đầu xuất sắc (${stats.weightedAverage}đ)`,
        reason: `Học sinh đạt kết quả đánh giá khởi đầu xuất sắc (${stats.weightedAverage}đ > 8.0đ) trong buổi học đầu tiên.`,
      });
    }

    // 🌟 Tiêu chí C: Tiến bộ bứt phá vượt bậc (Progressive Growth)
    if (stats.scoreTrend === 'Improving' && stats.weightedAverage < 8.5 && stats.totalSessions >= 3) {
      warnings.push({
        type: 'praise_progress',
        priority: 'Praise',
        badgeColor: 'emerald',
        title: `🟢 Tuyên dương: Nỗ lực tiến bộ bứt phá`,
        reason: `Điểm số các buổi học gần đây có mức tăng trưởng bứt phá rõ rệt (+${config.progressIncreaseThreshold || 1.5}đ trở lên) so với giai đoạn đầu.`,
      });
    }

    // 🌟 Tiêu chí D: Chuyên cần 100% & Chăm chỉ BTVN (Diligence & Engagement)
    if (
      config.enablePraiseAttendanceHw !== false &&
      stats.totalSessions >= 2 &&
      stats.unexcusedCount === 0 &&
      stats.excusedCount === 0 &&
      stats.unsubmittedHwCount === 0 &&
      stats.hwAverage >= 8.0
    ) {
      warnings.push({
        type: 'praise_diligence',
        priority: 'Praise',
        badgeColor: 'emerald',
        title: `🟢 Tuyên dương: Chuyên cần 100% & BTVN xuất sắc`,
        reason: `Tham gia đầy đủ 100% các buổi học (${stats.presentCount}/${stats.totalSessions}), hoàn thành 100% BTVN đúng hạn với điểm TB BTVN đạt ${stats.hwAverage}đ.`,
      });
    }
  }

  return warnings;
}


export async function runWarningScanForClass(
  classId: string,
  customConfig?: WarningRuleConfig
): Promise<number> {
  const now = new Date().toISOString();
  let newWarningsCount = 0;

  // Load custom config or global config from Dexie settings if available
  let config = customConfig || DEFAULT_WARNING_RULE_CONFIG;
  const settings = await db.settings.toArray();
  const activeSettings = settings.length > 0 ? settings[0] : null;

  if (!customConfig && activeSettings && activeSettings.warning_rule_config) {
    config = activeSettings.warning_rule_config;
  }

  // Fetch all students linked to this class (only those who are active)
  const classStudentLinks = await db.class_students
    .where('class_id')
    .equals(classId)
    .toArray()
    .then(links => links.filter(l => !l.leave_date));
  const studentIds = classStudentLinks.map((cs) => cs.student_id);

  // Fetch all sessions for class ordered by date
  const classSessions = await db.sessions.where('class_id').equals(classId).sortBy('session_date');
  if (classSessions.length === 0) return 0;

  const cls = await db.classes.get(classId);
  const className = cls?.class_name || `Lớp #${classId}`;

  // Adjust config dynamically based on class profile from settings
  if (!customConfig && cls && cls.class_type && activeSettings?.class_profile_configs) {
    const profileType = cls.class_type as 'standard' | 'specialized' | 'remedial';
    if (activeSettings.class_profile_configs[profileType]) {
      config = activeSettings.class_profile_configs[profileType];
    }
  }

  // Pre-fetch all student sessions for this class's sessions in 1 query
  const sessionIds = classSessions.map(s => s.id!).filter(Boolean);
  const allClassStudentSessions = await db.student_sessions
    .where('session_id')
    .anyOf(sessionIds)
    .toArray();
  const studentSessionsMap = new Map<string, StudentSession[]>();
  allClassStudentSessions.forEach(ss => {
    const sKey = String(ss.student_id);
    if (!studentSessionsMap.has(sKey)) studentSessionsMap.set(sKey, []);
    studentSessionsMap.get(sKey)!.push(ss);
  });

  // Pre-fetch all students in 1 query
  const allStudents = await db.students.where('id').anyOf(studentIds).toArray();
  const studentMap = new Map(allStudents.map(s => [String(s.id), s]));

  // Pre-fetch all warnings for these students
  const allStudentWarnings = await db.warnings.where('student_id').anyOf(studentIds).toArray();
  const warningsByStudent = new Map<string, any[]>();
  allStudentWarnings.forEach(w => {
    const sKey = String(w.student_id);
    if (!warningsByStudent.has(sKey)) warningsByStudent.set(sKey, []);
    warningsByStudent.get(sKey)!.push(w);
  });

  const warningsToPut: any[] = [];

  for (const studentId of studentIds) {
    const student = studentMap.get(String(studentId));
    if (!student) continue;

    const studentIdStr = String(studentId);
    const existingWarnings = warningsByStudent.get(studentIdStr) || [];

    // Auto cancel/resolve active warnings if student status is 'paused' or 'stopped'
    if (student.status !== 'studying') {
      const activeWarnings = existingWarnings.filter(w => !w.resolved);

      for (const w of activeWarnings) {
        const resolveAction = `Tự động hủy cảnh báo do học sinh chuyển trạng thái: ${
          student.status === 'paused' ? 'Tạm nghỉ' : 'Nghỉ hẳn'
        }`;
        const updatedW = {
          ...w,
          resolved: true,
          resolved_action: resolveAction,
          updated_at: now,
        };
        warningsToPut.push(updatedW);
      }
      continue;
    }

    // Get student sessions
    const studentSessions = studentSessionsMap.get(studentIdStr) || [];
    const csLink = classStudentLinks.find(l => String(l.student_id) === studentIdStr);

    const stats = calculateStudentStats(studentId, classSessions, studentSessions, config, csLink);
    const detectedList = detectStudentWarnings(student, stats, classSessions, studentSessions, config);

    // Fetch all currently active (unresolved) warnings for this student
    const activeWarnings = existingWarnings.filter((w) => !w.resolved);

    // 1. Tự động đánh giá và HỦY/HOÀN THÀNH các cảnh báo cũ nếu không còn vi phạm tiêu chí (do sửa điểm/làm bài bù)
    const detectedTitles = new Set(detectedList.map((d) => d.title));
    const detectedReasons = new Set(detectedList.map((d) => d.reason));

    for (const activeWarn of activeWarnings) {
      const stillTriggers =
        detectedTitles.has(activeWarn.warning_type) || detectedReasons.has(activeWarn.reason);

      if (!stillTriggers) {
        const resolveAction = 'Tự động hoàn thành/hủy do điểm số hoặc BTVN đã được cập nhật đạt yêu cầu';
        const updatedW = {
          ...activeWarn,
          resolved: true,
          resolved_action: resolveAction,
          updated_at: now,
        };
        warningsToPut.push(updatedW);
      }
    }

    // 2. Thêm cảnh báo mới nếu phát hiện vi phạm chưa có trong danh sách
    for (const det of detectedList) {
      const existing = activeWarnings.find(
        (w) =>
          w.student_id === studentId &&
          (w.warning_type === det.title ||
            w.reason === det.reason ||
            (w.warning_type || '').replace(/^[🔴🟡🟢⚡📊⚠️\s]+/, '').trim() ===
              (det.title || '').replace(/^[🔴🟡🟢⚡📊⚠️\s]+/, '').trim())
      );

      if (!existing) {
        const newWarnId = `warn_${studentId}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const warnPayload = {
          id: newWarnId,
          student_id: studentId,
          class_id: classId,
          priority: det.priority,
          warning_type: det.title,
          reason: det.reason,
          resolved: false,
          is_demo: student.is_demo || false,
          created_at: now,
          updated_at: now,
        };

        activeWarnings.push(warnPayload);
        warningsToPut.push(warnPayload);

        newWarningsCount++;
      }
    }
  }

  if (warningsToPut.length > 0) {
    await db.warnings.bulkPut(warningsToPut);
  }

  if (newWarningsCount > 0) {
    await logAudit(
      'Teacher',
      'Quét cảnh báo tự động',
      `Phát hiện ${newWarningsCount} cảnh báo học tập mới cho ${className}`
    );
  }

  return newWarningsCount;
}
