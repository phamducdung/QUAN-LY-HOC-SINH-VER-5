import { db, pushBatchDocsToFirestore, pushSingleDocToFirestore } from '../db/dexie';
import { logAudit } from './auditLogger';
import {
  Student,
  Session,
  StudentSession,
  Warning,
  WarningRuleConfig,
  StudentStats,
  DetectedWarning,
  PriorityLevel,
} from '../types';

/**
 * Cấu hình ngưỡng chuẩn cho Cửa sổ 2 Buổi Học Gần Nhất (Kaizen CSKH)
 */
export const DEFAULT_WARNING_RULE_CONFIG: WarningRuleConfig = {
  minTestScore: 5.0,
  consecutiveLowTests: 2,
  maxAbsences: 2,
  minHomeworkScore: 5.0,
  consecutiveLowHomework: 2,
  scoreDropThreshold: 2.0,
  excellentTestScore: 9.0,
  progressIncreaseThreshold: 1.5,
  enablePraiseAttendanceHw: true,
};

export interface CalculateStatsOptions {
  /** Số buổi gần nhất cần quét (Mặc định cảnh báo: 2 buổi gần nhất) */
  windowSize?: number;
  /** Mốc ngày buổi học cuối cùng đã được Giáo viên bấm Giải quyết (YYYY-MM-DD) */
  afterSessionDate?: string;
  /** Tập ID các buổi học đã được khép lại khi bấm Giải quyết */
  excludeSessionIds?: Set<string>;
}

/**
 * Lọc danh sách buổi học nằm trong vòng đời học sinh, sau mốc Giải quyết và cắt theo Cửa sổ N buổi gần nhất (Mặc định 2 buổi)
 */
export function filterWindowSessionsForStudent(
  classSessions: Session[],
  classStudentLink?: { join_date?: string; leave_date?: string },
  options?: CalculateStatsOptions
): Session[] {
  const sorted = [...classSessions].sort((a, b) => {
    const cmp = (a.session_date || '').localeCompare(b.session_date || '');
    if (cmp !== 0) return cmp;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });

  const filtered = sorted.filter((sess) => {
    const d = sess.session_date || '';
    if (classStudentLink?.join_date && d < classStudentLink.join_date) return false;
    if (classStudentLink?.leave_date && d > classStudentLink.leave_date) return false;
    if (options?.excludeSessionIds && sess.id && options.excludeSessionIds.has(String(sess.id))) {
      return false;
    }
    if (options?.afterSessionDate && d <= options.afterSessionDate) {
      return false;
    }
    return true;
  });

  if (options?.windowSize && options.windowSize > 0) {
    return filtered.slice(-options.windowSize);
  }
  return filtered;
}

/**
 * Thuật toán Phân tích Chỉ số Học sinh (calculateStudentStats)
 * Chuẩn hóa công thức: Trọng số 70% Bài kiểm tra + 30% Bài tập về nhà
 * Hỗ trợ quét chính xác trên Cửa sổ 2 Buổi Gần Nhất sau mốc Giải quyết.
 */
export function calculateStudentStats(
  studentId: string,
  classSessions: Session[],
  studentSessions: StudentSession[],
  config: WarningRuleConfig = DEFAULT_WARNING_RULE_CONFIG,
  classStudentLink?: { join_date?: string; leave_date?: string },
  options?: CalculateStatsOptions
): StudentStats {
  const effectiveClassSessions = filterWindowSessionsForStudent(
    classSessions,
    classStudentLink,
    options
  );
  const sessionMap = new Map(effectiveClassSessions.map((s) => [String(s.id), s]));

  // Chỉ lấy các bản ghi student_sessions thuộc tập buổi học trong cửa sổ quét
  const validSessions = studentSessions
    .filter((ss) => sessionMap.has(String(ss.session_id)))
    .sort((a, b) => {
      const sa = sessionMap.get(String(a.session_id));
      const sb = sessionMap.get(String(b.session_id));
      const cmp = (sa?.session_date || '').localeCompare(sb?.session_date || '');
      if (cmp !== 0) return cmp;
      return String(a.session_id).localeCompare(String(b.session_id));
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

  validSessions.forEach((s) => {
    const sess = sessionMap.get(String(s.session_id));

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
        hwSessionCount++;
        totalHwScore += 0;
        unsubmittedHwCount++;
      } else if (s.attendance === 'present' || s.attendance === 'late') {
        if (!isHwExempt) {
          if (
            !s.homework_submitted &&
            !s.late_submit &&
            (s.homework_score === undefined || s.homework_score === null)
          ) {
            hwSessionCount++;
            totalHwScore += 0;
            unsubmittedHwCount++;
          } else if (!s.homework_submitted) {
            unsubmittedHwCount++;
            if (typeof s.homework_score === 'number' && s.homework_score >= 0) {
              hwSessionCount++;
              totalHwScore += s.homework_score;
            }
          } else if (typeof s.homework_score === 'number' && s.homework_score >= 0) {
            hwSessionCount++;
            totalHwScore += s.homework_score;
          }
        }
      }
    }

    // 2. Đánh giá Bài kiểm tra
    if (sess?.has_test !== false) {
      if (s.attendance === 'absent_unexcused') {
        testSessionCount++;
        totalTestScore += 0;
      } else if (s.attendance === 'absent_excused') {
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

  // Chuẩn hóa Trọng số: 70% Bài kiểm tra + 30% BTVN xuyên suốt hệ thống
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

  // Quét chuỗi điểm kiểm tra kém liên tiếp (duyệt ngược từ buổi mới nhất trong cửa sổ)
  let consecutiveLowTestCount = 0;
  for (let i = validSessions.length - 1; i >= 0; i--) {
    const s = validSessions[i];
    const sess = sessionMap.get(String(s.session_id));
    const isTestExempt = s.exempt || s.exempt_test;
    if (!isTestExempt && sess?.has_test !== false) {
      if (s.attendance === 'present' || s.attendance === 'late') {
        const effScore = s.test_score;
        if (effScore !== undefined && effScore >= 0 && effScore < config.minTestScore) {
          consecutiveLowTestCount++;
        } else if (effScore !== undefined && effScore >= config.minTestScore) {
          break;
        }
      } else if (s.attendance === 'absent_unexcused') {
        consecutiveLowTestCount++;
      } else if (s.attendance === 'absent_excused') {
        break;
      }
    }
  }

  // Quét chuỗi BTVN kém/thiếu liên tiếp
  let consecutiveLowHwCount = 0;
  for (let i = validSessions.length - 1; i >= 0; i--) {
    const s = validSessions[i];
    const sess = sessionMap.get(String(s.session_id));
    const isHwExempt = s.exempt || s.exempt_homework;
    if (!isHwExempt && sess?.has_homework !== false) {
      if (s.attendance === 'present' || s.attendance === 'late') {
        if (
          !s.homework_submitted ||
          (s.homework_score !== undefined && s.homework_score < config.minHomeworkScore)
        ) {
          consecutiveLowHwCount++;
        } else {
          break;
        }
      } else if (s.attendance === 'absent_unexcused') {
        consecutiveLowHwCount++;
      } else if (s.attendance === 'absent_excused') {
        break;
      }
    }
  }

  // Phân tích xu hướng học tập trong cửa sổ (hỗ trợ ngay cả khi cửa sổ = 2 buổi)
  let scoreTrend: 'Improving' | 'Stable' | 'Declining' = 'Stable';
  const attendedSessions = validSessions.filter(
    (s) => s.attendance === 'present' || s.attendance === 'late'
  );

  const evaluatedTestSessions = attendedSessions.filter((s) => {
    const sess = sessionMap.get(String(s.session_id));
    return (
      !(s.exempt || s.exempt_test) &&
      sess?.has_test !== false &&
      typeof s.test_score === 'number' &&
      s.test_score >= 0
    );
  });

  const evaluatedHwSessions = attendedSessions.filter((s) => {
    const sess = sessionMap.get(String(s.session_id));
    return (
      !(s.exempt || s.exempt_homework) &&
      sess?.has_homework !== false &&
      typeof s.homework_score === 'number' &&
      s.homework_score >= 0
    );
  });

  const latestTestScore =
    evaluatedTestSessions.length > 0
      ? evaluatedTestSessions[evaluatedTestSessions.length - 1].test_score
      : undefined;
  const prevTestScore =
    evaluatedTestSessions.length >= 2
      ? evaluatedTestSessions[evaluatedTestSessions.length - 2].test_score
      : undefined;

  const latestHwScore =
    evaluatedHwSessions.length > 0
      ? evaluatedHwSessions[evaluatedHwSessions.length - 1].homework_score
      : undefined;
  const prevHwScore =
    evaluatedHwSessions.length >= 2
      ? evaluatedHwSessions[evaluatedHwSessions.length - 2].homework_score
      : undefined;

  const threshold = config.progressIncreaseThreshold || 1.5;
  const dropThreshold = config.scoreDropThreshold || 2.0;

  if (latestTestScore !== undefined && prevTestScore !== undefined) {
    if (latestTestScore >= prevTestScore + threshold) {
      scoreTrend = 'Improving';
    } else if (latestTestScore <= prevTestScore - dropThreshold) {
      scoreTrend = 'Declining';
    }
  } else if (attendedSessions.length >= 2) {
    const sessionScores: number[] = [];
    attendedSessions.forEach((s) => {
      if (s.exempt) return;
      const sess = sessionMap.get(String(s.session_id));
      const tScore = s.test_score || 0;
      const hScore = s.homework_score || 0;
      const hasTest =
        sess?.has_test !== false && s.test_score !== undefined && s.test_score >= 0;
      const hasHw =
        sess?.has_homework !== false &&
        s.homework_submitted !== false &&
        s.homework_score !== undefined &&
        s.homework_score >= 0;

      if (hasTest && hasHw) {
        sessionScores.push(tScore * 0.7 + hScore * 0.3);
      } else if (hasTest) {
        sessionScores.push(tScore);
      } else if (hasHw) {
        sessionScores.push(hScore);
      }
    });

    if (sessionScores.length >= 2) {
      const latest = sessionScores[sessionScores.length - 1];
      const prevSlice = sessionScores.slice(0, -1);
      const prevAvg = prevSlice.reduce((a, b) => a + b, 0) / prevSlice.length;
      if (latest >= prevAvg + threshold) {
        scoreTrend = 'Improving';
      } else if (latest <= prevAvg - dropThreshold) {
        scoreTrend = 'Declining';
      }
    }
  }

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
    latestTestScore,
    latestHwScore,
    prevTestScore,
    prevHwScore,
  };
}

/**
 * Động cơ Phân loại & Hợp nhất Cảnh báo (detectStudentWarnings) - KAIZEN V3:
 * 1. Cửa sổ quét: Chỉ đánh giá tối đa 2 buổi học gần nhất (sau mốc Giải quyết).
 * 2. Hợp nhất 1 Học sinh = 1 Thẻ Cảnh báo duy nhất (lấy mức cao nhất: 🔴 P1 > 🟠 P2 > 🟢 Tuyên dương).
 * 3. Loại bỏ hoàn toàn thẻ 🟡 P3 gây nhiễu.
 * 4. Khóa chặn mâu thuẫn tuyệt đối: Học sinh đang có bất kỳ vi phạm P1 hoặc P2 nào sẽ KHÔNG BAO GIỜ sinh thẻ Tuyên dương.
 */
export function detectStudentWarnings(
  student: Student,
  stats: StudentStats,
  classSessions: Session[] = [],
  studentSessions: StudentSession[] = [],
  config: WarningRuleConfig = DEFAULT_WARNING_RULE_CONFIG
): DetectedWarning[] {
  if (student.status !== 'studying' || stats.totalSessions === 0) {
    return [];
  }

  // Chỉ lấy tối đa 2 buổi học gần nhất trong tập classSessions truyền vào
  const windowClassSessions = [...classSessions]
    .sort((a, b) => (a.session_date || '').localeCompare(b.session_date || ''))
    .slice(-2);
  const windowSessionIds = new Set(windowClassSessions.map((s) => String(s.id)));

  const studentSessionsSorted = studentSessions
    .filter((ss) => windowSessionIds.has(String(ss.session_id)))
    .sort((a, b) => {
      const sa = windowClassSessions.find((s) => String(s.id) === String(a.session_id));
      const sb = windowClassSessions.find((s) => String(s.id) === String(b.session_id));
      if (!sa || !sb) return String(a.session_id).localeCompare(String(b.session_id));
      return (sa.session_date || '').localeCompare(sb.session_date || '');
    });

  const getGranularDetailsInWindow = (): string => {
    const weakDetails: string[] = [];
    studentSessionsSorted.forEach((ss) => {
      const sess = windowClassSessions.find((s) => String(s.id) === String(ss.session_id));
      if (!sess) return;

      const isUnexcused = ss.attendance === 'absent_unexcused';
      const isExcused = ss.attendance === 'absent_excused';
      const isLate = ss.attendance === 'late';
      const isWeakTest =
        sess.has_test !== false &&
        !isExcused &&
        !(ss.exempt || ss.exempt_test) &&
        (isUnexcused ||
          (ss.test_score !== undefined &&
            ss.test_score >= 0 &&
            ss.test_score < config.minTestScore));

      const isWeakHw =
        sess.has_homework !== false &&
        !isExcused &&
        !(ss.exempt || ss.exempt_homework) &&
        (isUnexcused ||
          !ss.homework_submitted ||
          (ss.homework_score !== undefined && ss.homework_score < config.minHomeworkScore));

      if (isUnexcused || isExcused || isLate || isWeakTest || isWeakHw) {
        let chTag =
          sess.test_knowledge_tag && sess.test_knowledge_tag !== 'same'
            ? sess.test_knowledge_tag
            : '';
        if (!chTag) {
          chTag = sess.lesson_title.includes(' - ')
            ? sess.lesson_title.split(' - ').slice(-1)[0]
            : sess.chapter || 'Đại số & Hình học THCS';
        }

        const remarksList = [...(ss.quick_preset_comments || [])];
        if (ss.custom_comment) remarksList.push(ss.custom_comment);
        const remarksStr =
          remarksList.length > 0 ? remarksList.join(', ') : 'Cần ôn tập và củng cố thêm';

        let attLabel = 'Đi học';
        if (isUnexcused) attLabel = 'Vắng không phép';
        else if (isExcused) attLabel = 'Nghỉ có phép';
        else if (isLate) attLabel = 'Đi muộn';

        const hw =
          isUnexcused || isExcused
            ? 'Vắng mặt'
            : ss.exempt || ss.exempt_homework
            ? 'Miễn'
            : ss.homework_submitted
            ? ss.homework_score !== undefined
              ? `${ss.homework_score}đ`
              : 'Đã nộp'
            : 'Chưa nộp';

        const kt =
          isUnexcused || isExcused
            ? 'Vắng mặt'
            : ss.exempt || ss.exempt_test
            ? 'Miễn'
            : ss.test_score !== undefined
            ? `${ss.test_score}đ`
            : 'Chưa KT';

        weakDetails.push(
          `• Bài: ${sess.lesson_title} (${sess.session_date}) [Kết quả: ${attLabel} | BTVN: ${hw} | Bài KT: ${kt}]\n  ↳ Chuyên đề: ${chTag}\n  ↳ Nhận xét: ${remarksStr}`
        );
      }
    });

    if (weakDetails.length === 0) return '';
    return `\n\n[CHI TIẾT LỖ HỔNG TRUY VẾT]:\n${weakDetails.join('\n')}`;
  };

  interface SignalItem {
    tag: 'Chuyên cần' | 'BTVN' | 'Điểm KT' | 'Phong độ';
    headline: string;
    detail: string;
  }

  const p1Items: SignalItem[] = [];
  const p2Items: SignalItem[] = [];

  // ============================================================================
  // 1. NHÓM CHUYÊN CẦN (Trong cửa sổ 2 buổi gần nhất)
  // ============================================================================
  const p1AbsenceThreshold = Math.min(2, Math.max(1, config.maxAbsences || 2));
  if (stats.unexcusedCount >= p1AbsenceThreshold) {
    p1Items.push({
      tag: 'Chuyên cần',
      headline: `Vắng không phép ${stats.unexcusedCount} buổi`,
      detail: `Học sinh nghỉ không phép ${stats.unexcusedCount}/${stats.totalSessions} buổi học gần nhất. Cần liên hệ Phụ huynh ngay.`,
    });
  } else if (stats.totalSessions >= 2 && stats.unexcusedCount + stats.excusedCount >= 2) {
    p1Items.push({
      tag: 'Chuyên cần',
      headline: `Nghỉ học liên tiếp 2 buổi gần nhất`,
      detail: `Học sinh vắng mặt cả 2 buổi học gần nhất (${stats.unexcusedCount} không phép, ${stats.excusedCount} có phép), nguy cơ hổng kiến thức chuỗi bài mới.`,
    });
  } else if (stats.unexcusedCount === 1) {
    p2Items.push({
      tag: 'Chuyên cần',
      headline: `Vắng không phép 1 buổi gần đây`,
      detail: `Học sinh vắng không phép 1 buổi trong 2 buổi gần nhất. Cần gửi bài ghi chép và đôn đốc đi học đều.`,
    });
  } else if (stats.lateCount >= 2) {
    p2Items.push({
      tag: 'Chuyên cần',
      headline: `Đi muộn cả 2 buổi gần nhất`,
      detail: `Học sinh đi muộn liên tiếp 2 buổi gần nhất, ảnh hưởng thời gian kiểm tra đầu giờ.`,
    });
  }

  // ============================================================================
  // 2. NHÓM BÀI TẬP VỀ NHÀ (Trong cửa sổ 2 buổi gần nhất)
  // ============================================================================
  const p1HwThreshold = Math.min(2, Math.max(1, config.consecutiveLowHomework || 2));
  if (stats.consecutiveLowHwCount >= p1HwThreshold || stats.unsubmittedHwCount >= 2) {
    const count = Math.max(stats.consecutiveLowHwCount, stats.unsubmittedHwCount);
    p1Items.push({
      tag: 'BTVN',
      headline: `Thiếu/Kém BTVN ${count} buổi liên tiếp`,
      detail: `Chưa nộp hoặc điểm BTVN dưới chuẩn (${config.minHomeworkScore}đ) trong ${count} buổi liên tiếp gần nhất.`,
    });
  } else if (stats.latestHwScore !== undefined && stats.latestHwScore < 4.0) {
    p1Items.push({
      tag: 'BTVN',
      headline: `Điểm BTVN buổi gần nhất quá thấp (${stats.latestHwScore}đ)`,
      detail: `Bài tập về nhà buổi gần nhất chỉ đạt ${stats.latestHwScore}đ (< 4.0đ), cần kiểm tra việc tự làm bài ở nhà.`,
    });
  } else if (stats.unsubmittedHwCount === 1) {
    p2Items.push({
      tag: 'BTVN',
      headline: `Chưa nộp BTVN 1 buổi gần đây`,
      detail: `Học sinh quên hoặc chưa nộp BTVN 1 buổi trong 2 buổi gần nhất. Cần đôn đốc nộp bù.`,
    });
  } else if (
    stats.latestHwScore !== undefined &&
    stats.latestHwScore < config.minHomeworkScore
  ) {
    p2Items.push({
      tag: 'BTVN',
      headline: `Điểm BTVN buổi gần nhất chưa đạt (${stats.latestHwScore}đ)`,
      detail: `Điểm BTVN buổi gần nhất đạt ${stats.latestHwScore}đ (dưới chuẩn ${config.minHomeworkScore}đ).`,
    });
  }

  // ============================================================================
  // 3. NHÓM ĐIỂM KIỂM TRA & ĐỘ LỆCH NĂNG LỰC (Trong cửa sổ 2 buổi gần nhất)
  // ============================================================================
  const p1TestThreshold = Math.min(2, Math.max(1, config.consecutiveLowTests || 2));
  const testDrop =
    stats.prevTestScore !== undefined && stats.latestTestScore !== undefined
      ? parseFloat((stats.prevTestScore - stats.latestTestScore).toFixed(1))
      : undefined;

  if (stats.consecutiveLowTestCount >= p1TestThreshold) {
    p1Items.push({
      tag: 'Điểm KT',
      headline: `Điểm KT kém ${stats.consecutiveLowTestCount} buổi liên tiếp`,
      detail: `Có ${stats.consecutiveLowTestCount} buổi liên tiếp điểm kiểm tra dưới chuẩn ${config.minTestScore}đ (Điểm mới nhất: ${stats.latestTestScore ?? '0'}đ).`,
    });
  } else if (stats.latestTestScore !== undefined && stats.latestTestScore < 3.5) {
    p1Items.push({
      tag: 'Điểm KT',
      headline: `Điểm KT buổi gần nhất báo động (${stats.latestTestScore}đ)`,
      detail: `Bài kiểm tra trực tiếp buổi gần nhất chỉ đạt ${stats.latestTestScore}đ (< 3.5đ), cần kèm bù kiến thức ngay.`,
    });
  } else if (
    testDrop !== undefined &&
    testDrop >= Math.max(2.0, config.scoreDropThreshold || 2.0) &&
    stats.latestTestScore !== undefined &&
    stats.latestTestScore < 6.5
  ) {
    p1Items.push({
      tag: 'Phong độ',
      headline: `Điểm KT tụt sâu -${testDrop}đ (${stats.prevTestScore}đ -> ${stats.latestTestScore}đ)`,
      detail: `Điểm bài kiểm tra sụt giảm mạnh ${testDrop}đ so với buổi liền trước.`,
    });
  } else if (
    stats.latestTestScore !== undefined &&
    stats.latestTestScore < config.minTestScore
  ) {
    p2Items.push({
      tag: 'Điểm KT',
      headline: `Điểm KT buổi gần nhất chưa đạt (${stats.latestTestScore}đ)`,
      detail: `Bài kiểm tra buổi gần nhất đạt ${stats.latestTestScore}đ (dưới ngưỡng chuẩn ${config.minTestScore}đ). Cần hỗ trợ gỡ điểm ở buổi tới.`,
    });
  } else if (
    testDrop !== undefined &&
    testDrop >= 1.5 &&
    stats.latestTestScore !== undefined &&
    stats.latestTestScore < 7.0
  ) {
    p2Items.push({
      tag: 'Phong độ',
      headline: `Điểm KT giảm -${testDrop}đ (${stats.prevTestScore}đ -> ${stats.latestTestScore}đ)`,
      detail: `Điểm kiểm tra có dấu hiệu chững lại và giảm ${testDrop}đ trong 2 buổi gần nhất.`,
    });
  }

  // Kiểm tra độ lệch BTVN cao nhưng Kiểm tra thấp
  if (
    stats.latestHwScore !== undefined &&
    stats.latestTestScore !== undefined &&
    stats.latestHwScore >= 7.5 &&
    stats.latestTestScore < config.minTestScore &&
    stats.latestTestScore > 0
  ) {
    p2Items.push({
      tag: 'Phong độ',
      headline: `Lệch BTVN (${stats.latestHwScore}đ) vs Kiểm tra (${stats.latestTestScore}đ)`,
      detail: `BTVN làm ở nhà đạt điểm cao (${stats.latestHwScore}đ) nhưng bài kiểm tra trực tiếp trên lớp chỉ đạt ${stats.latestTestScore}đ.`,
    });
  }

  // ============================================================================
  // 4. HỢP NHẤT 1 HỌC SINH = 1 THẺ DUY NHẤT (P1 > P2 > TUYÊN DƯƠNG)
  // ============================================================================
  if (p1Items.length > 0 || p2Items.length > 0) {
    // Khóa chặn tuyệt đối: Đã có P1 hoặc P2 thì KHÔNG BAO GIỜ phát sinh thẻ Tuyên dương
    const finalPriority: PriorityLevel = p1Items.length > 0 ? 'P1' : 'P2';
    const allItems = [...p1Items, ...p2Items];
    const uniqueTags = Array.from(new Set(allItems.map((i) => i.tag)));
    const prefix = finalPriority === 'P1' ? '🔴' : '🟠';

    const title = `${prefix} [${uniqueTags.join(' + ')}] ${allItems
      .map((i) => i.headline)
      .join(' · ')}`;

    const detailsTrace = getGranularDetailsInWindow();
    const reasonLines = allItems.map((i) => `• [${i.tag}] ${i.detail}`).join('\n');

    return [
      {
        type: 'unified',
        priority: finalPriority,
        badgeColor: finalPriority === 'P1' ? 'red' : 'amber',
        title,
        reason: `${reasonLines}${detailsTrace}`,
        issue_tags: uniqueTags,
      },
    ];
  }

  // ============================================================================
  // 5. HỆ THỐNG TUYÊN DƯƠNG HỢP NHẤT (CHỈ KHI KHÔNG CÓ BẤT KỲ VI PHẠM P1/P2 NÀO)
  // ============================================================================
  const praiseItems: { tag: string; headline: string; detail: string }[] = [];
  const excelThreshold = config.excellentTestScore || 9.0;

  if (stats.latestTestScore !== undefined && stats.latestTestScore >= excelThreshold) {
    praiseItems.push({
      tag: 'Điểm xuất sắc',
      headline: `Bài KT đạt ${stats.latestTestScore}đ`,
      detail: `Đạt điểm xuất sắc ${stats.latestTestScore}đ trong bài kiểm tra trực tiếp gần nhất (Ngưỡng vinh danh >= ${excelThreshold}đ).`,
    });
  } else if (stats.weightedAverage >= 8.5 && stats.totalSessions >= 2) {
    praiseItems.push({
      tag: 'Phong độ xuất sắc',
      headline: `Điểm TB 2 buổi đạt ${stats.weightedAverage}đ`,
      detail: `Điểm trung bình tổng hợp 2 buổi gần nhất đạt ${stats.weightedAverage}đ (70% KT + 30% BTVN).`,
    });
  }

  if (
    stats.prevTestScore !== undefined &&
    stats.latestTestScore !== undefined &&
    stats.latestTestScore - stats.prevTestScore >= (config.progressIncreaseThreshold || 1.5) &&
    stats.latestTestScore >= 7.0
  ) {
    const gain = parseFloat((stats.latestTestScore - stats.prevTestScore).toFixed(1));
    praiseItems.push({
      tag: 'Tiến bộ bứt phá',
      headline: `Tăng +${gain}đ (${stats.prevTestScore}đ -> ${stats.latestTestScore}đ)`,
      detail: `Điểm bài kiểm tra tăng bứt phá +${gain}đ so với buổi liền trước.`,
    });
  }

  if (
    config.enablePraiseAttendanceHw !== false &&
    stats.totalSessions >= 2 &&
    stats.unexcusedCount === 0 &&
    stats.excusedCount === 0 &&
    stats.lateCount === 0 &&
    stats.unsubmittedHwCount === 0 &&
    stats.hwAverage >= 8.0
  ) {
    praiseItems.push({
      tag: 'Chuyên cần & BTVN',
      headline: `Chuyên cần 100% & TB BTVN ${stats.hwAverage}đ`,
      detail: `Tham gia đầy đủ 100% buổi học đúng giờ và hoàn thành trọn vẹn BTVN với điểm TB ${stats.hwAverage}đ.`,
    });
  }

  if (praiseItems.length > 0) {
    const uniqueTags = Array.from(new Set(praiseItems.map((i) => i.tag)));
    const title = `🟢 Tuyên dương: ${praiseItems.map((i) => i.headline).join(' · ')}`;
    const reason = praiseItems.map((i) => `• [${i.tag}] ${i.detail}`).join('\n');

    return [
      {
        type: 'unified',
        priority: 'Praise',
        badgeColor: 'emerald',
        title,
        reason,
        issue_tags: uniqueTags,
      },
    ];
  }

  return [];
}

/**
 * Tìm mốc Giải quyết gần nhất của học sinh trong lớp để không bao giờ quét lại lỗi cũ đã xử lý
 */
function getStudentResolutionAnchor(
  existingWarnings: Warning[],
  classSessions: Session[]
): { afterSessionDate?: string; excludeSessionIds: Set<string> } {
  const resolvedList = existingWarnings
    .filter((w) => w.resolved)
    .sort((a, b) => {
      const ta = a.resolved_at || a.updated_at || a.created_at || '';
      const tb = b.resolved_at || b.updated_at || b.created_at || '';
      return tb.localeCompare(ta);
    });

  const excludeSessionIds = new Set<string>();
  let afterSessionDate: string | undefined = undefined;

  if (resolvedList.length === 0) {
    return { afterSessionDate, excludeSessionIds };
  }

  // Gom tất cả session_id đã khép lại từ các lần giải quyết trước
  resolvedList.forEach((rw) => {
    if (Array.isArray(rw.resolved_session_ids)) {
      rw.resolved_session_ids.forEach((sid) => excludeSessionIds.add(String(sid)));
    }
    if (rw.resolved_after_session_date) {
      if (!afterSessionDate || rw.resolved_after_session_date > afterSessionDate) {
        afterSessionDate = rw.resolved_after_session_date;
      }
    }
  });

  // Tương thích ngược với các cảnh báo cũ được bấm Giải quyết trước bản Kaizen (chỉ có updated_at)
  const latestResolved = resolvedList[0];
  if (!afterSessionDate && excludeSessionIds.size === 0) {
    const resolvedIso = latestResolved.resolved_at || latestResolved.updated_at || '';
    const resolvedDateStr = resolvedIso.slice(0, 10);
    if (resolvedDateStr) {
      // Tìm buổi học có session_date <= ngày bấm Giải quyết để khóa các buổi cũ đó lại
      const sessionsUpToResolve = classSessions.filter(
        (s) => (s.session_date || '') <= resolvedDateStr
      );
      if (sessionsUpToResolve.length > 0) {
        sessionsUpToResolve.forEach((s) => {
          if (s.id) excludeSessionIds.add(String(s.id));
        });
        afterSessionDate =
          sessionsUpToResolve[sessionsUpToResolve.length - 1].session_date;
      } else if (classSessions.length > 0) {
        // Nếu ngày thực tế bấm Giải quyết nhỏ hơn hoặc lệch múi giờ, khóa các buổi được tạo trước thời điểm bấm Giải quyết
        const resolvedTimeMs = new Date(resolvedIso).getTime();
        classSessions.forEach((s) => {
          const sCreatedMs = s.created_at ? new Date(s.created_at).getTime() : 0;
          if (sCreatedMs > 0 && sCreatedMs <= resolvedTimeMs + 60000) {
            if (s.id) excludeSessionIds.add(String(s.id));
            if (!afterSessionDate || (s.session_date || '') > afterSessionDate) {
              afterSessionDate = s.session_date;
            }
          }
        });
      }
    }
  }

  return { afterSessionDate, excludeSessionIds };
}

/**
 * Quét & Đồng bộ Cảnh báo Hợp nhất cho 1 Lớp học (runWarningScanForClass)
 * - Tự động dọn sạch các thẻ lẻ kiểu cũ (warn_class_student_type) và các thẻ P3.
 * - Chỉ quét 2 buổi học gần nhất diễn ra SAU mốc Giáo viên đã bấm Giải quyết.
 */
export async function runWarningScanForClass(
  classId: string,
  customConfig?: WarningRuleConfig
): Promise<number> {
  const now = new Date().toISOString();
  const classIdStr = String(classId);
  let newWarningsCount = 0;

  let config = customConfig || DEFAULT_WARNING_RULE_CONFIG;
  const settings = await db.settings.toArray();
  const activeSettings = settings.length > 0 ? settings[0] : null;

  if (!customConfig && activeSettings && activeSettings.warning_rule_config) {
    config = activeSettings.warning_rule_config;
  }

  const allLinks = await db.class_students.toArray();
  const classStudentLinks = allLinks.filter(
    (l) => String(l.class_id) === classIdStr && !l.leave_date
  );
  const studentIds = classStudentLinks.map((cs) => String(cs.student_id));
  if (studentIds.length === 0) return 0;

  const allSess = await db.sessions.toArray();
  const classSessions = allSess
    .filter((s) => String(s.class_id) === classIdStr)
    .sort((a, b) => (a.session_date || '').localeCompare(b.session_date || ''));
  if (classSessions.length === 0) return 0;

  const cls = await db.classes.get(classIdStr);
  const className = cls?.class_name || `Lớp #${classIdStr}`;

  if (!customConfig && cls && cls.class_type && activeSettings?.class_profile_configs) {
    const profileType = cls.class_type as 'standard' | 'specialized' | 'remedial';
    if (activeSettings.class_profile_configs[profileType]) {
      config = activeSettings.class_profile_configs[profileType];
    }
  }

  const sessionIdSet = new Set(classSessions.map((s) => String(s.id)).filter(Boolean));
  const allStudSess = await db.student_sessions.toArray();
  const allClassStudentSessions = allStudSess.filter((ss) =>
    sessionIdSet.has(String(ss.session_id))
  );
  const studentSessionsMap = new Map<string, StudentSession[]>();
  allClassStudentSessions.forEach((ss) => {
    const sKey = String(ss.student_id);
    if (!studentSessionsMap.has(sKey)) studentSessionsMap.set(sKey, []);
    studentSessionsMap.get(sKey)!.push(ss);
  });

  const allStudents = await db.students.toArray();
  const studentMap = new Map(allStudents.map((s) => [String(s.id), s]));

  const allWarnings = await db.warnings.toArray();
  const classWarnings = allWarnings.filter((w) => String(w.class_id) === classIdStr);
  const warningsByStudent = new Map<string, Warning[]>();
  classWarnings.forEach((w) => {
    const sKey = String(w.student_id);
    if (!warningsByStudent.has(sKey)) warningsByStudent.set(sKey, []);
    warningsByStudent.get(sKey)!.push(w);
  });

  const warningsToPut: Warning[] = [];
  const warningIdsToDelete: string[] = [];

  // Xóa mọi thẻ P3 cũ còn tồn đọng trong lớp này
  classWarnings.forEach((w) => {
    if (w.priority === 'P3' && w.id) {
      warningIdsToDelete.push(String(w.id));
    }
  });

  for (const studentId of studentIds) {
    const studentIdStr = String(studentId);
    const student = studentMap.get(studentIdStr);
    if (!student) continue;

    const canonicalId = `warn_${classIdStr}_${studentIdStr}`;
    const existingWarnings = (warningsByStudent.get(studentIdStr) || []).filter(
      (w) => w.priority !== 'P3'
    );

    // Nếu học sinh đã Tạm nghỉ hoặc Nghỉ hẳn -> Tự động đóng mọi cảnh báo chưa xử lý
    if (student.status !== 'studying') {
      const activeWarnings = existingWarnings.filter((w) => !w.resolved);
      for (const w of activeWarnings) {
        const resolveAction = `Tự động đóng cảnh báo do học sinh chuyển trạng thái: ${
          student.status === 'paused' ? 'Tạm nghỉ' : 'Nghỉ hẳn'
        }`;
        warningsToPut.push({
          ...w,
          resolved: true,
          resolved_action: resolveAction,
          resolved_at: now,
          updated_at: now,
        });
      }
      continue;
    }

    // 1. Lấy mốc Giải quyết gần nhất để khóa toàn bộ các buổi học cũ trước khi Giải quyết
    const { afterSessionDate, excludeSessionIds } = getStudentResolutionAnchor(
      existingWarnings,
      classSessions
    );

    // 2. Dọn các thẻ cảnh báo lẻ kiểu cũ (warn_class_student_test_score, _homework...) chưa giải quyết
    const legacyUnresolved = existingWarnings.filter(
      (w) => !w.resolved && w.id && w.id !== canonicalId
    );
    legacyUnresolved.forEach((lw) => {
      if (lw.id) warningIdsToDelete.push(String(lw.id));
    });

    // Nếu có nhiều thẻ đã giải quyết kiểu cũ, chỉ giữ lại 1 bản ghi đã giải quyết gần nhất để lịch sử gọn gàng
    const resolvedWarnings = existingWarnings
      .filter((w) => w.resolved)
      .sort((a, b) =>
        (b.resolved_at || b.updated_at || '').localeCompare(
          a.resolved_at || a.updated_at || ''
        )
      );
    if (resolvedWarnings.length > 1) {
      resolvedWarnings.slice(1).forEach((oldRw) => {
        if (oldRw.id && oldRw.id !== canonicalId) {
          warningIdsToDelete.push(String(oldRw.id));
        }
      });
    }

    // 3. Lọc ra tối đa 2 buổi học gần nhất diễn ra SAU mốc Giải quyết
    const csLink = classStudentLinks.find((l) => String(l.student_id) === studentIdStr);
    const windowClassSessions = filterWindowSessionsForStudent(classSessions, csLink, {
      windowSize: 2,
      afterSessionDate,
      excludeSessionIds,
    });

    const studentSessions = studentSessionsMap.get(studentIdStr) || [];

    // Nếu không có buổi học mới nào sau mốc Giải quyết -> Bảo toàn 100% trạng thái đã giải quyết!
    if (windowClassSessions.length === 0) {
      continue;
    }

    const stats = calculateStudentStats(
      studentIdStr,
      windowClassSessions,
      studentSessions,
      config,
      csLink,
      {
        windowSize: 2,
        afterSessionDate,
        excludeSessionIds,
      }
    );

    const detectedList = detectStudentWarnings(
      student,
      stats,
      windowClassSessions,
      studentSessions,
      config
    );

    const currentCanonical = existingWarnings.find((w) => w.id === canonicalId);

    if (detectedList.length === 0) {
      // Học sinh không có vi phạm trong 2 buổi gần nhất -> Nếu đang có thẻ canonical chưa xử lý thì tự động hoàn thành
      if (currentCanonical && !currentCanonical.resolved) {
        warningsToPut.push({
          ...currentCanonical,
          resolved: true,
          resolved_action:
            'Tự động hoàn thành do kết quả 2 buổi gần nhất đã cải thiện đạt yêu cầu',
          resolved_at: now,
          resolved_after_session_date:
            windowClassSessions[windowClassSessions.length - 1]?.session_date,
          resolved_session_ids: classSessions
            .map((s) => String(s.id))
            .filter(Boolean),
          updated_at: now,
        });
      }
    } else {
      // Có đúng 01 thẻ hợp nhất (P1, P2 hoặc Praise) từ các buổi học mới sau mốc Giải quyết
      const det = detectedList[0];

      // Nếu bản ghi canonical hiện tại đang là một cảnh báo ĐÃ GIẢI QUYẾT cũ và học sinh TÁI PHẠM ở buổi học mới,
      // lưu bản đã giải quyết sang ID lịch sử trước khi cập nhật thẻ canonical mới
      if (currentCanonical && currentCanonical.resolved) {
        const archiveId = `warn_hist_${classIdStr}_${studentIdStr}`;
        warningsToPut.push({
          ...currentCanonical,
          id: archiveId,
          resolved_after_session_date:
            currentCanonical.resolved_after_session_date || afterSessionDate,
          resolved_session_ids: Array.from(excludeSessionIds),
        });
      }

      const isNewlyTriggered = !currentCanonical || currentCanonical.resolved;
      const unifiedPayload: Warning = {
        id: canonicalId,
        student_id: studentIdStr,
        class_id: classIdStr,
        priority: det.priority,
        warning_type: det.title,
        reason: det.reason,
        issue_tags: det.issue_tags,
        resolved: false,
        is_demo: student.is_demo || false,
        created_at: isNewlyTriggered ? now : currentCanonical.created_at || now,
        updated_at: now,
      };

      // Chỉ ghi xuống DB khi có thay đổi nội dung hoặc mới phát sinh
      if (
        isNewlyTriggered ||
        currentCanonical.priority !== unifiedPayload.priority ||
        currentCanonical.warning_type !== unifiedPayload.warning_type ||
        currentCanonical.reason !== unifiedPayload.reason
      ) {
        warningsToPut.push(unifiedPayload);
        if (isNewlyTriggered) {
          newWarningsCount++;
        }
      }
    }
  }

  // Thực thi xóa các thẻ P3 / thẻ lẻ trùng lặp cũ
  const uniqueIdsToDelete = Array.from(new Set(warningIdsToDelete));
  if (uniqueIdsToDelete.length > 0) {
    await db.warnings.bulkDelete(uniqueIdsToDelete);
    for (const delId of uniqueIdsToDelete) {
      await pushSingleDocToFirestore('warnings', delId, null, true);
    }
  }

  if (warningsToPut.length > 0) {
    await db.warnings.bulkPut(warningsToPut);
    await pushBatchDocsToFirestore('warnings', warningsToPut);
  }

  if (newWarningsCount > 0) {
    await logAudit(
      'Teacher',
      'Quét cảnh báo tự động (Cửa sổ 2 buổi)',
      `Cập nhật ${newWarningsCount} hồ sơ cảnh báo/tuyên dương hợp nhất cho ${className}`
    );
  }

  return newWarningsCount;
}
