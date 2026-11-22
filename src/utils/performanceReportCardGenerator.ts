import { Student } from '../types';

function resolveTeacherPronoun(): string {
  try {
    const raw = localStorage.getItem('smart_edu_pronoun_config');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.teacherTitle) return parsed.teacherTitle;
    }
  } catch {
    // ignore
  }
  return localStorage.getItem('teacher_pronoun') || 'Thầy';
}

export interface RawSessionHistoryPoint {
  sessionId?: string;
  session: string; // e.g. "20/11"
  sessionDate?: string; // YYYY-MM-DD
  sessionFullName?: string; // e.g. "2026-11-20 - Hàm số bậc nhất"
  topicName?: string;
  testScore: number | null;
  hwScore: number | null;
  attendance?: 'present' | 'absent_excused' | 'absent_unexcused' | 'late';
  homework_submitted?: boolean;
  late_submit?: boolean;
  exempt?: boolean;
  exempt_homework?: boolean;
  teacher_comment?: string;
}

export interface ComputedPerformanceSummary {
  avgTest: number | null;
  avgHw: number | null;
  compositeScore: number | null; // 70% Test + 30% HW
  targetScore: number;
  targetAchievementPct: number | null;
  // 2-session window analysis
  recentTwoSessions: RawSessionHistoryPoint[];
  latestSession: RawSessionHistoryPoint | null;
  prevSession: RawSessionHistoryPoint | null;
  deltaTest2Sessions: number | null;
  deltaHw2Sessions: number | null;
  recent2CompositeAvg: number | null;
  twoSessionStatus: 'improving' | 'stable_good' | 'attention' | 'declining' | 'insufficient';
  twoSessionBadgeText: string;
  twoSessionAdvice: string;
  // Attendance & HW Discipline
  totalSessions: number;
  presentCount: number;
  lateCount: number;
  absentExcusedCount: number;
  absentUnexcusedCount: number;
  attendanceRate: number;
  hwSubmittedOnTimeCount: number;
  hwLateCount: number;
  hwMissingCount: number;
  hwCompletionRate: number;
  recent2MissingHwCount: number;
  recent2UnexcusedAbsentCount: number;
}

export function extractTargetScore(desc?: string): number {
  if (!desc) return 8.0;
  const match = desc.match(/(\d+(\.\d+)?)\+?/g);
  if (match && match.length > 0) {
    for (const m of match) {
      const val = parseFloat(m);
      if (val > 0 && val <= 10 && val !== 10) {
        return val;
      }
    }
    const lastVal = parseFloat(match[match.length - 1]);
    if (lastVal <= 10) return lastVal;
  }
  return 8.0;
}

export function computeSessionComposite(testScore: number | null, hwScore: number | null): number | null {
  if (testScore !== null && hwScore !== null) {
    return Number((testScore * 0.7 + hwScore * 0.3).toFixed(2));
  }
  if (testScore !== null) return Number(testScore.toFixed(2));
  if (hwScore !== null) return Number(hwScore.toFixed(2));
  return null;
}

export function computePerformanceSummary(
  rawHistory: RawSessionHistoryPoint[],
  targetDescription?: string
): ComputedPerformanceSummary {
  const targetScore = extractTargetScore(targetDescription);

  const validTests = rawHistory.map((h) => h.testScore).filter((s): s is number => s !== null && !isNaN(s));
  const validHws = rawHistory.map((h) => h.hwScore).filter((s): s is number => s !== null && !isNaN(s));

  const avgTest =
    validTests.length > 0
      ? Number((validTests.reduce((a, b) => a + b, 0) / validTests.length).toFixed(2))
      : null;
  const avgHw =
    validHws.length > 0
      ? Number((validHws.reduce((a, b) => a + b, 0) / validHws.length).toFixed(2))
      : null;

  const compositeScore = computeSessionComposite(avgTest, avgHw);
  const targetAchievementPct =
    compositeScore !== null && targetScore > 0
      ? Math.min(100, Math.round((compositeScore / targetScore) * 100))
      : null;

  // 2 most recent sessions
  const recentTwoSessions = rawHistory.slice(-2);
  const latestSession = recentTwoSessions.length > 0 ? recentTwoSessions[recentTwoSessions.length - 1] : null;
  const prevSession = recentTwoSessions.length === 2 ? recentTwoSessions[0] : null;

  const deltaTest2Sessions =
    latestSession && prevSession && latestSession.testScore !== null && prevSession.testScore !== null
      ? Number((latestSession.testScore - prevSession.testScore).toFixed(2))
      : null;

  const deltaHw2Sessions =
    latestSession && prevSession && latestSession.hwScore !== null && prevSession.hwScore !== null
      ? Number((latestSession.hwScore - prevSession.hwScore).toFixed(2))
      : null;

  const recent2Composites = recentTwoSessions
    .map((s) => computeSessionComposite(s.testScore, s.hwScore))
    .filter((v): v is number => v !== null);
  const recent2CompositeAvg =
    recent2Composites.length > 0
      ? Number((recent2Composites.reduce((a, b) => a + b, 0) / recent2Composites.length).toFixed(2))
      : null;

  // Attendance & Homework discipline
  const totalSessions = rawHistory.length;
  const presentCount = rawHistory.filter((s) => !s.attendance || s.attendance === 'present').length;
  const lateCount = rawHistory.filter((s) => s.attendance === 'late').length;
  const absentExcusedCount = rawHistory.filter((s) => s.attendance === 'absent_excused').length;
  const absentUnexcusedCount = rawHistory.filter((s) => s.attendance === 'absent_unexcused').length;
  const attendanceRate =
    totalSessions > 0 ? Math.round(((presentCount + lateCount) / totalSessions) * 100) : 100;

  const nonExemptHwSessions = rawHistory.filter(
    (s) => !s.exempt && !s.exempt_homework && s.attendance !== 'absent_excused'
  );
  const hwMissingCount = nonExemptHwSessions.filter(
    (s) => s.homework_submitted === false || s.attendance === 'absent_unexcused'
  ).length;
  const hwLateCount = nonExemptHwSessions.filter(
    (s) => s.homework_submitted !== false && s.late_submit === true
  ).length;
  const hwSubmittedOnTimeCount = Math.max(
    0,
    nonExemptHwSessions.length - hwMissingCount - hwLateCount
  );
  const hwCompletionRate =
    nonExemptHwSessions.length > 0
      ? Math.round(((hwSubmittedOnTimeCount + hwLateCount) / nonExemptHwSessions.length) * 100)
      : 100;

  const recent2MissingHwCount = recentTwoSessions.filter(
    (s) =>
      !s.exempt &&
      !s.exempt_homework &&
      s.attendance !== 'absent_excused' &&
      (s.homework_submitted === false || s.attendance === 'absent_unexcused')
  ).length;
  const recent2UnexcusedAbsentCount = recentTwoSessions.filter(
    (s) => s.attendance === 'absent_unexcused'
  ).length;

  // Evaluate 2-session status aligned with the 2-session warning engine
  let twoSessionStatus: ComputedPerformanceSummary['twoSessionStatus'] = 'insufficient';
  let twoSessionBadgeText = 'Chưa đủ dữ liệu 2 buổi';
  let twoSessionAdvice =
    'Cần cập nhật điểm tối thiểu 1-2 buổi học để hệ thống phân tích xu hướng phong độ.';

  if (latestSession) {
    const latestComp = computeSessionComposite(latestSession.testScore, latestSession.hwScore);
    const prevComp = prevSession ? computeSessionComposite(prevSession.testScore, prevSession.hwScore) : null;

    const hasP1Risk =
      recent2UnexcusedAbsentCount >= 1 ||
      recent2MissingHwCount >= 2 ||
      (latestSession.testScore !== null && latestSession.testScore < 5.0) ||
      (deltaTest2Sessions !== null && deltaTest2Sessions <= -2.0);

    const hasP2Attention =
      recent2MissingHwCount === 1 ||
      (latestSession.testScore !== null && latestSession.testScore < 6.5) ||
      (latestSession.hwScore !== null && latestSession.hwScore < 6.0) ||
      (deltaTest2Sessions !== null && deltaTest2Sessions <= -1.0);

    if (hasP1Risk) {
      twoSessionStatus = 'declining';
      twoSessionBadgeText = 'Cần Kèm Sát (2 buổi gần nhất)';
      const reasons: string[] = [];
      if (recent2UnexcusedAbsentCount > 0) reasons.push(`vắng không phép ${recent2UnexcusedAbsentCount} buổi`);
      if (recent2MissingHwCount >= 2) reasons.push('chưa nộp BTVN 2 buổi liên tiếp');
      if (latestSession.testScore !== null && latestSession.testScore < 5.0)
        reasons.push(`điểm kiểm tra buổi mới nhất đạt ${latestSession.testScore}đ (< 5.0đ)`);
      else if (deltaTest2Sessions !== null && deltaTest2Sessions <= -2.0)
        reasons.push(`điểm kiểm tra giảm ${Math.abs(deltaTest2Sessions)}đ so với buổi trước`);
      twoSessionAdvice = `Trong 2 buổi gần nhất, con ${reasons.join(', ')}. Gia đình và Giáo viên cần phối hợp đôn đốc sát sao ngay tuần này.`;
    } else if (hasP2Attention) {
      twoSessionStatus = 'attention';
      twoSessionBadgeText = 'Đang Chững Lại / Cần Lưu Ý';
      const reasons: string[] = [];
      if (recent2MissingHwCount === 1) reasons.push('còn thiếu BTVN 1 buổi');
      if (latestSession.testScore !== null && latestSession.testScore < 6.5)
        reasons.push(`điểm KT buổi gần nhất (${latestSession.testScore}đ) chưa đạt ngưỡng an toàn 6.5đ`);
      else if (deltaTest2Sessions !== null && deltaTest2Sessions < 0)
        reasons.push(`điểm KT giảm nhẹ ${Math.abs(deltaTest2Sessions)}đ so với buổi trước`);
      twoSessionAdvice = `Phong độ 2 buổi gần nhất có dấu hiệu chững lại (${reasons.join(', ')}). Con cần ôn kỹ lại bài trên lớp và hoàn thành đầy đủ BTVN.`;
    } else if (
      (deltaTest2Sessions !== null && deltaTest2Sessions >= 0.75) ||
      (latestComp !== null && prevComp !== null && latestComp - prevComp >= 0.75)
    ) {
      twoSessionStatus = 'improving';
      twoSessionBadgeText = 'Đang Tiến Bộ Rõ Rệt';
      twoSessionAdvice = `Phong độ 2 buổi gần nhất bứt phá tích cực (Điểm KT buổi mới nhất đạt ${latestSession.testScore ?? '--'}đ${deltaTest2Sessions !== null && deltaTest2Sessions > 0 ? `, tăng +${deltaTest2Sessions}đ` : ''}). Rất đáng khen ngợi!`;
    } else {
      twoSessionStatus = 'stable_good';
      twoSessionBadgeText = 'Phong Độ Ổn Định Tốt';
      twoSessionAdvice = `Trong 2 buổi gần nhất, con duy trì nề nếp chuyên cần, hoàn thành BTVN đầy đủ và giữ vững điểm tổng hợp ${recent2CompositeAvg ?? compositeScore ?? '--'}đ.`;
    }
  }

  return {
    avgTest,
    avgHw,
    compositeScore,
    targetScore,
    targetAchievementPct,
    recentTwoSessions,
    latestSession,
    prevSession,
    deltaTest2Sessions,
    deltaHw2Sessions,
    recent2CompositeAvg,
    twoSessionStatus,
    twoSessionBadgeText,
    twoSessionAdvice,
    totalSessions,
    presentCount,
    lateCount,
    absentExcusedCount,
    absentUnexcusedCount,
    attendanceRate,
    hwSubmittedOnTimeCount,
    hwLateCount,
    hwMissingCount,
    hwCompletionRate,
    recent2MissingHwCount,
    recent2UnexcusedAbsentCount,
  };
}

export function generateZaloPerformanceSummary(params: {
  student: Student;
  className: string;
  targetDescription: string;
  summary: ComputedPerformanceSummary;
  topicAverages: { topic: string; avgScore: number }[];
  teacherTitle?: string;
}): string {
  const { student, className, targetDescription, summary, topicAverages, teacherTitle } = params;
  const pronoun = teacherTitle || resolveTeacherPronoun();
  const pronounLower = pronoun.toLowerCase();
  const parentLabel = student.parent_name ? `Phụ huynh (${student.parent_name})` : 'Gia đình';

  const masteredTopics = topicAverages.filter((t) => t.avgScore >= 8.0).map((t) => `${t.topic} (${t.avgScore}đ)`);
  const weakTopics = topicAverages.filter((t) => t.avgScore < 6.5).map((t) => `${t.topic} (${t.avgScore}đ)`);

  const lines: string[] = [];
  lines.push(`📊 PHIẾU BÁO CÁO PHONG ĐỘ HỌC TẬP CÁ NHÂN`);
  lines.push(`Kính gửi ${parentLabel} của em ${student.full_name} (${className}),`);
  lines.push(
    `${pronoun} xin gửi Gia đình tổng kết phong độ học tập môn Toán của con tính đến thời điểm hiện tại:`
  );
  lines.push('');

  lines.push(`1️⃣ ĐIỂM PHONG ĐỘ TỔNG HỢP (70% Kiểm tra - 30% BTVN):`);
  lines.push(
    `• Điểm Tổng Hợp: ${summary.compositeScore !== null ? `${summary.compositeScore}/10đ` : 'Chưa có'} (Mục tiêu lớp: ${targetDescription})`
  );
  lines.push(
    `• Điểm TB Kiểm tra trên lớp (70%): ${summary.avgTest !== null ? `${summary.avgTest}đ` : 'Chưa có'} | Điểm TB BTVN (30%): ${summary.avgHw !== null ? `${summary.avgHw}đ` : 'Chưa có'}`
  );
  lines.push(
    `• Chuyên cần: Có mặt ${summary.presentCount + summary.lateCount}/${summary.totalSessions} buổi (${summary.attendanceRate}%)${summary.lateCount > 0 ? `, đi muộn ${summary.lateCount} buổi` : ''}${summary.absentUnexcusedCount > 0 ? `, vắng không phép ${summary.absentUnexcusedCount} buổi` : ''} | Tỷ lệ hoàn thành BTVN: ${summary.hwCompletionRate}%`
  );
  lines.push('');

  lines.push(`2️⃣ PHONG ĐỘ 2 BUỔI HỌC GẦN NHẤT: [${summary.twoSessionBadgeText.toUpperCase()}]`);
  if (summary.recentTwoSessions.length === 0) {
    lines.push(`• Chưa có dữ liệu buổi học.`);
  } else {
    summary.recentTwoSessions.forEach((s, idx) => {
      const label =
        summary.recentTwoSessions.length === 2
          ? idx === 0
            ? 'Buổi liền trước'
            : 'Buổi gần nhất'
          : 'Buổi gần nhất';
      const comp = computeSessionComposite(s.testScore, s.hwScore);
      const hwNote =
        s.homework_submitted === false
          ? 'Chưa nộp BTVN (0đ)'
          : s.late_submit
          ? `BTVN nộp muộn (${s.hwScore ?? 0}đ)`
          : `BTVN: ${s.hwScore !== null ? `${s.hwScore}đ` : 'Miễn'}`;
      lines.push(
        `• ${label} (${s.session}${s.topicName ? ` - ${s.topicName}` : ''}): KT ${s.testScore !== null ? `${s.testScore}đ` : 'Miễn'} | ${hwNote} ➔ Tổng hợp: ${comp !== null ? `${comp}đ` : '--'}`
      );
    });
  }
  lines.push('');

  if (masteredTopics.length > 0 || weakTopics.length > 0) {
    lines.push(`3️⃣ ĐÁNH GIÁ CHUYÊN ĐỀ KIẾN THỨC:`);
    if (masteredTopics.length > 0) {
      lines.push(`• Chuyên đề con đã nắm vững (≥ 8.0đ): ${masteredTopics.slice(0, 4).join(', ')}`);
    }
    if (weakTopics.length > 0) {
      lines.push(`• Chuyên đề cần củng cố thêm (< 6.5đ): ${weakTopics.slice(0, 4).join(', ')}`);
    }
    lines.push('');
  }

  lines.push(`4️⃣ NHẬN XÉT & ĐỊNH HƯỚNG CỦA ${pronoun.toUpperCase()}:`);
  lines.push(`• ${summary.twoSessionAdvice}`);
  lines.push(
    `Rất mong Gia đình tiếp tục đồng hành cùng ${pronounLower} để khích lệ và sát sao việc học của con ạ. ${pronoun} cảm ơn Gia đình!`
  );

  return lines.join('\n');
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function measureWrappedLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const cleaned = (text || '').trim();
  if (!cleaned) return [''];

  const paragraphs = cleaned.split('\n');
  const allLines: string[] = [];

  for (const para of paragraphs) {
    const words = para.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      allLines.push('');
      continue;
    }

    let currentLine = '';
    for (let i = 0; i < words.length; i++) {
      const word = words[i];

      // Handle extremely long single token without spaces
      if (ctx.measureText(word).width > maxWidth) {
        if (currentLine.trim()) {
          allLines.push(currentLine.trim());
          currentLine = '';
        }
        let chunk = '';
        for (const ch of word) {
          if (ctx.measureText(chunk + ch).width > maxWidth && chunk.length > 0) {
            allLines.push(chunk);
            chunk = ch;
          } else {
            chunk += ch;
          }
        }
        currentLine = chunk + ' ';
        continue;
      }

      const testLine = currentLine + word + ' ';
      if (ctx.measureText(testLine.trim()).width > maxWidth && currentLine.trim().length > 0) {
        allLines.push(currentLine.trim());
        currentLine = word + ' ';
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine.trim()) {
      allLines.push(currentLine.trim());
    }
  }

  return allLines.length > 0 ? allLines : [''];
}

function drawWrappedLines(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  x: number,
  startY: number,
  lineHeight: number
): number {
  let currentY = startY;
  for (const line of lines) {
    ctx.fillText(line, x, currentY);
    currentY += lineHeight;
  }
  return currentY;
}

export async function generatePerformanceReportCardBlob(params: {
  student: Student;
  className: string;
  targetDescription: string;
  summary: ComputedPerformanceSummary;
  rawHistory: RawSessionHistoryPoint[];
  topicAverages: { topic: string; avgScore: number }[];
}): Promise<Blob> {
  const { student, className, targetDescription, summary, rawHistory, topicAverages } = params;

  const scale = 2; // Retina 2x
  const width = 920;
  const fontStack = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const innerMaxWidth = width - 112; // 808px safe content width inside boxes

  // ============================================================================
  // PASS 1: MEASURE ALL MULTI-LINE TEXTS & CALCULATE DYNAMIC BOX HEIGHTS
  // ============================================================================
  const measureCanvas = document.createElement('canvas');
  const mCtx = measureCanvas.getContext('2d')!;

  // 1. Measure Header lines
  mCtx.font = `800 26px ${fontStack}`;
  const headerTitleLines = measureWrappedLines(
    mCtx,
    `PHIẾU PHONG ĐỘ: ${(student.full_name || '').toUpperCase()}`,
    width - 255
  );

  const parentStr = student.parent_name
    ? `Phụ huynh: ${student.parent_name}${student.parent_phone ? ` (${student.parent_phone})` : ''}`
    : `SĐT Phụ huynh: ${student.parent_phone || 'Chưa cập nhật'}`;
  mCtx.font = `600 13.5px ${fontStack}`;
  const headerClassParentLines = measureWrappedLines(
    mCtx,
    `Lớp: ${className}   |   ${parentStr}`,
    width - 72
  );

  mCtx.font = `700 13px ${fontStack}`;
  const headerTargetLines = measureWrappedLines(
    mCtx,
    `🎯 Mục tiêu đầu ra: ${targetDescription}`,
    width - 72
  );

  const headerH =
    46 +
    headerTitleLines.length * 31 +
    6 +
    headerClassParentLines.length * 20 +
    4 +
    headerTargetLines.length * 20 +
    16;

  // 2. Measure 4 KPI Cards
  const cardGap = 16;
  const cardW = (width - 72 - cardGap * 3) / 4;
  const cardInnerW = cardW - 28;

  const rawCards = [
    {
      title: 'ĐIỂM TỔNG HỢP (70/30)',
      main: summary.compositeScore !== null ? `${summary.compositeScore}đ` : '--',
      sub1: `KT (70%): ${summary.avgTest ?? '--'}đ | BTVN (30%): ${summary.avgHw ?? '--'}đ`,
      sub2: `Mục tiêu lớp: ${summary.targetScore}đ (${summary.targetAchievementPct ?? 0}%)`,
      accent: '#059669',
    },
    {
      title: 'PHONG ĐỘ 2 BUỔI GẦN NHẤT',
      main:
        summary.recent2CompositeAvg !== null
          ? `${summary.recent2CompositeAvg}đ`
          : summary.latestSession?.testScore !== null && summary.latestSession?.testScore !== undefined
          ? `${summary.latestSession.testScore}đ`
          : '--',
      sub1: summary.twoSessionBadgeText,
      sub2:
        summary.deltaTest2Sessions !== null
          ? `Biến thiên KT 2 buổi: ${summary.deltaTest2Sessions > 0 ? '+' : ''}${summary.deltaTest2Sessions}đ`
          : 'Đang theo dõi 2 buổi gần nhất',
      accent:
        summary.twoSessionStatus === 'declining'
          ? '#e11d48'
          : summary.twoSessionStatus === 'attention'
          ? '#d97706'
          : '#0284c7',
    },
    {
      title: 'TỶ LỆ CHUYÊN CẦN',
      main: `${summary.attendanceRate}%`,
      sub1: `Có mặt: ${summary.presentCount + summary.lateCount}/${summary.totalSessions} buổi`,
      sub2:
        summary.absentUnexcusedCount > 0
          ? `Vắng không phép: ${summary.absentUnexcusedCount} buổi`
          : summary.lateCount > 0
          ? `Đi muộn: ${summary.lateCount} buổi`
          : 'Chuyên cần đầy đủ, đúng giờ',
      accent: summary.absentUnexcusedCount > 0 ? '#e11d48' : '#4f46e5',
    },
    {
      title: 'KỶ LUẬT BTVN',
      main: `${summary.hwCompletionRate}%`,
      sub1: `Đúng hạn: ${summary.hwSubmittedOnTimeCount} | Muộn: ${summary.hwLateCount}`,
      sub2:
        summary.hwMissingCount > 0
          ? `Chưa nộp BTVN: ${summary.hwMissingCount} buổi`
          : 'Hoàn thành 100% BTVN được giao',
      accent: summary.recent2MissingHwCount > 0 ? '#d97706' : '#0d9488',
    },
  ];

  const measuredCards = rawCards.map((c) => {
    mCtx.font = `700 11px ${fontStack}`;
    const sub1Lines = measureWrappedLines(mCtx, c.sub1, cardInnerW);
    mCtx.font = `600 10px ${fontStack}`;
    const sub2Lines = measureWrappedLines(mCtx, c.sub2, cardInnerW);
    const neededH = 74 + sub1Lines.length * 15 + 4 + sub2Lines.length * 14 + 14;
    return { ...c, sub1Lines, sub2Lines, neededH };
  });

  const cardY = headerH + 20;
  const cardH = Math.max(124, ...measuredCards.map((c) => c.neededH));

  // 3. Chart Box (2-row header: Row 1 = Full Title, Row 2 = Legend Bar)
  const chartBoxY = cardY + cardH + 18;
  const chartBoxH = 288;

  // 4. Measure Recent 5 Sessions Table Box (multi-line topic wrapping per row)
  const recent5 = [...rawHistory].slice(-5).reverse();
  const topicColWidth = 258; // From x=160 to x=418
  mCtx.font = `600 11px ${fontStack}`;
  const measuredRows = recent5.map((row) => {
    const rawTopic = row.topicName || row.sessionFullName || 'Buổi học thường kỳ';
    const topicLines = measureWrappedLines(mCtx, rawTopic, topicColWidth);
    const rowH = Math.max(36, topicLines.length * 16 + 16);
    return { row, topicLines, rowH };
  });

  const totalRowsH =
    measuredRows.length > 0
      ? measuredRows.reduce((acc, r) => acc + r.rowH, 0)
      : 54;
  const tableBoxY = chartBoxY + chartBoxH + 18;
  const tableBoxH = 84 + totalRowsH + 14;

  // 5. Measure Bottom Advice & Full Topic Lists Box (0% truncation)
  mCtx.font = `600 12.5px ${fontStack}`;
  const adviceLines = measureWrappedLines(mCtx, summary.twoSessionAdvice, innerMaxWidth);

  const mastered = topicAverages
    .filter((t) => t.avgScore >= 8.0)
    .map((t) => `${t.topic} (${t.avgScore}đ)`);
  const weak = topicAverages
    .filter((t) => t.avgScore < 6.5)
    .map((t) => `${t.topic} (${t.avgScore}đ)`);

  const masteredText = `★ Chuyên đề nắm vững (≥ 8.0đ): ${
    mastered.length > 0 ? mastered.join(', ') : 'Đang tích lũy thêm'
  }`;
  const weakText = `⚠ Chuyên đề cần ôn thêm (< 6.5đ): ${
    weak.length > 0 ? weak.join(', ') : 'Không có lỗ hổng kiến thức dưới 6.5đ'
  }`;

  mCtx.font = `700 11.5px ${fontStack}`;
  const masteredLines = measureWrappedLines(mCtx, masteredText, innerMaxWidth);
  const weakLines = measureWrappedLines(mCtx, weakText, innerMaxWidth);

  const adviceY = tableBoxY + tableBoxH + 18;
  const adviceH =
    46 +
    adviceLines.length * 20 +
    14 +
    masteredLines.length * 19 +
    8 +
    weakLines.length * 19 +
    20;

  const height = adviceY + adviceH + 28;

  // ============================================================================
  // PASS 2: INITIALIZE RETINA 2X CANVAS & DRAW 100% CONTENT
  // ============================================================================
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);

  // Background
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, width, height);

  // 1. Header Banner
  const headerGrad = ctx.createLinearGradient(0, 0, width, headerH);
  headerGrad.addColorStop(0, '#0f172a');
  headerGrad.addColorStop(1, '#065f46');
  ctx.fillStyle = headerGrad;
  ctx.fillRect(0, 0, width, headerH);

  ctx.fillStyle = '#34d399';
  ctx.font = `800 12px ${fontStack}`;
  ctx.fillText('HỆ THỐNG QUẢN LÝ CHẤT LƯỢNG & CSKH TOÁN THCS/THPT', 36, 32);

  // Date badge on top-right
  const todayStr = new Date().toLocaleDateString('vi-VN');
  drawRoundedRect(ctx, width - 210, 22, 174, 34, 10);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 12px ${fontStack}`;
  ctx.fillText(`Ngày xuất: ${todayStr}`, width - 192, 43);

  let curHeaderY = 66;
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 26px ${fontStack}`;
  curHeaderY = drawWrappedLines(ctx, headerTitleLines, 36, curHeaderY, 31);

  curHeaderY += 2;
  ctx.fillStyle = '#cbd5e1';
  ctx.font = `600 13.5px ${fontStack}`;
  curHeaderY = drawWrappedLines(ctx, headerClassParentLines, 36, curHeaderY, 20);

  curHeaderY += 4;
  ctx.fillStyle = '#a7f3d0';
  ctx.font = `700 13px ${fontStack}`;
  drawWrappedLines(ctx, headerTargetLines, 36, curHeaderY, 20);

  // 2. Four KPI Cards Row
  measuredCards.forEach((c, idx) => {
    const x = 36 + idx * (cardW + cardGap);
    drawRoundedRect(ctx, x, cardY, cardW, cardH, 14);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#e2e8f0';
    ctx.stroke();

    // Top accent bar
    drawRoundedRect(ctx, x, cardY, cardW, 6, 4);
    ctx.fillStyle = c.accent;
    ctx.fill();

    ctx.fillStyle = '#64748b';
    ctx.font = `800 10px ${fontStack}`;
    ctx.fillText(c.title, x + 14, cardY + 26);

    ctx.fillStyle = c.accent;
    ctx.font = `800 28px ${fontStack}`;
    ctx.fillText(c.main, x + 14, cardY + 60);

    ctx.fillStyle = '#1e293b';
    ctx.font = `700 11px ${fontStack}`;
    const afterSub1Y = drawWrappedLines(ctx, c.sub1Lines, x + 14, cardY + 84, 15);

    ctx.fillStyle = '#64748b';
    ctx.font = `600 10px ${fontStack}`;
    drawWrappedLines(ctx, c.sub2Lines, x + 14, afterSub1Y + 4, 14);
  });

  // 3. Chart Box (2-tier header: Full Title on Row 1 + Legend on Row 2)
  drawRoundedRect(ctx, 36, chartBoxY, width - 72, chartBoxH, 16);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Tier 1: Full Chart Title (100% preserved)
  ctx.fillStyle = '#0f172a';
  ctx.font = `800 13.5px ${fontStack}`;
  ctx.fillText(
    'BIỂU ĐỒ PHONG ĐỘ ĐIỂM KIỂM TRA (70%) & ĐIỂM BTVN (30%) QUA CÁC BUỔI HỌC',
    56,
    chartBoxY + 26
  );

  // Tier 2: Dedicated Legend Row below the title
  const legendY = chartBoxY + 38;
  ctx.fillStyle = '#10b981';
  ctx.fillRect(56, legendY, 11, 11);
  ctx.fillStyle = '#334155';
  ctx.font = `700 11px ${fontStack}`;
  ctx.fillText('Điểm Kiểm Tra (70%)', 73, legendY + 10);

  ctx.fillStyle = '#3b82f6';
  ctx.fillRect(215, legendY, 11, 11);
  ctx.fillStyle = '#334155';
  ctx.fillText('Điểm BTVN (30%)', 232, legendY + 10);

  ctx.fillStyle = '#ef4444';
  ctx.fillRect(355, legendY + 4, 16, 3);
  ctx.fillStyle = '#334155';
  ctx.fillText(`Đường mục tiêu lớp (${summary.targetScore}đ)`, 377, legendY + 10);

  const plotX = 82;
  const plotY = chartBoxY + 74;
  const plotW = width - 140;
  const plotH = 172;

  // Grid lines (0, 2, 4, 6, 8, 10)
  for (let score = 0; score <= 10; score += 2) {
    const y = plotY + plotH - (score / 10) * plotH;
    ctx.beginPath();
    ctx.moveTo(plotX, y);
    ctx.lineTo(plotX + plotW, y);
    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#94a3b8';
    ctx.font = `600 10px ${fontStack}`;
    ctx.fillText(`${score}đ`, plotX - 30, y + 4);
  }

  // Target line
  const targetY = plotY + plotH - (summary.targetScore / 10) * plotH;
  ctx.save();
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(plotX, targetY);
  ctx.lineTo(plotX + plotW, targetY);
  ctx.strokeStyle = '#ef4444';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  const chartPoints = rawHistory.slice(-10);
  if (chartPoints.length === 0) {
    ctx.fillStyle = '#94a3b8';
    ctx.font = `600 13px ${fontStack}`;
    ctx.fillText('Chưa có dữ liệu điểm các buổi học để vẽ biểu đồ.', plotX + 200, plotY + plotH / 2);
  } else {
    const stepX = chartPoints.length > 1 ? plotW / (chartPoints.length - 1) : 0;

    // Draw HW line (#3b82f6)
    ctx.beginPath();
    let startedHw = false;
    chartPoints.forEach((pt, idx) => {
      if (pt.hwScore !== null) {
        const x = chartPoints.length > 1 ? plotX + idx * stepX : plotX + plotW / 2;
        const y = plotY + plotH - (Math.max(0, Math.min(10, pt.hwScore)) / 10) * plotH;
        if (!startedHw) {
          ctx.moveTo(x, y);
          startedHw = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
    });
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Draw Test line (#10b981)
    ctx.beginPath();
    let startedTest = false;
    chartPoints.forEach((pt, idx) => {
      if (pt.testScore !== null) {
        const x = chartPoints.length > 1 ? plotX + idx * stepX : plotX + plotW / 2;
        const y = plotY + plotH - (Math.max(0, Math.min(10, pt.testScore)) / 10) * plotH;
        if (!startedTest) {
          ctx.moveTo(x, y);
          startedTest = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
    });
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Draw dots, X labels, and non-overlapping score labels
    chartPoints.forEach((pt, idx) => {
      const x = chartPoints.length > 1 ? plotX + idx * stepX : plotX + plotW / 2;
      ctx.fillStyle = '#475569';
      ctx.font = `700 10px ${fontStack}`;
      ctx.fillText(pt.session, x - 14, plotY + plotH + 22);

      const hasBoth = pt.hwScore !== null && pt.testScore !== null;
      const closeTogether =
        hasBoth && Math.abs((pt.testScore as number) - (pt.hwScore as number)) < 1.8;

      if (pt.hwScore !== null) {
        const y = plotY + plotH - (Math.max(0, Math.min(10, pt.hwScore)) / 10) * plotH;
        ctx.beginPath();
        ctx.arc(x, y, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = '#3b82f6';
        ctx.fill();

        ctx.fillStyle = '#1d4ed8';
        ctx.font = `800 9.5px ${fontStack}`;
        const labelOffsetY =
          closeTogether && (pt.hwScore as number) <= (pt.testScore as number) ? 14 : -8;
        ctx.fillText(`${pt.hwScore}`, x - 4, y + labelOffsetY);
      }

      if (pt.testScore !== null) {
        const y = plotY + plotH - (Math.max(0, Math.min(10, pt.testScore)) / 10) * plotH;
        ctx.beginPath();
        ctx.arc(x, y, 5.5, 0, Math.PI * 2);
        ctx.fillStyle = '#10b981';
        ctx.fill();

        ctx.fillStyle = '#065f46';
        ctx.font = `800 10px ${fontStack}`;
        const labelOffsetY =
          closeTogether && (pt.testScore as number) < (pt.hwScore as number) ? 15 : -9;
        ctx.fillText(`${pt.testScore}`, x - 4, y + labelOffsetY);
      }
    });
  }

  // 4. Recent Sessions Table Box (Dynamic Row Height with Full Multi-Line Topic Names)
  drawRoundedRect(ctx, 36, tableBoxY, width - 72, tableBoxH, 16);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = '#0f172a';
  ctx.font = `800 14px ${fontStack}`;
  ctx.fillText('BẢNG ĐIỂM & NHẬN XÉT 5 BUỔI HỌC GẦN NHẤT', 56, tableBoxY + 28);

  // Table Header
  const thY = tableBoxY + 42;
  drawRoundedRect(ctx, 52, thY, width - 104, 30, 8);
  ctx.fillStyle = '#f1f5f9';
  ctx.fill();

  ctx.fillStyle = '#475569';
  ctx.font = `800 11px ${fontStack}`;
  ctx.fillText('NGÀY HỌC', 66, thY + 19);
  ctx.fillText('CHUYÊN ĐỀ / BÀI HỌC', 160, thY + 19);
  ctx.fillText('ĐIỂM KT (70%)', 430, thY + 19);
  ctx.fillText('ĐIỂM BTVN (30%)', 540, thY + 19);
  ctx.fillText('TỔNG HỢP', 665, thY + 19);
  ctx.fillText('TRẠNG THÁI', 755, thY + 19);

  if (measuredRows.length === 0) {
    ctx.fillStyle = '#94a3b8';
    ctx.font = `600 12px ${fontStack}`;
    ctx.fillText('Chưa có lịch sử buổi học.', 66, thY + 56);
  } else {
    let currentRowTop = thY + 34;
    measuredRows.forEach((item, idx) => {
      const { row, topicLines, rowH } = item;
      if (idx > 0) {
        ctx.beginPath();
        ctx.moveTo(56, currentRowTop);
        ctx.lineTo(width - 56, currentRowTop);
        ctx.strokeStyle = '#f1f5f9';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      const comp = computeSessionComposite(row.testScore, row.hwScore);
      const firstLineY = currentRowTop + 20;

      // Column 1: Date
      ctx.fillStyle = '#0f172a';
      ctx.font = `700 11px ${fontStack}`;
      ctx.fillText(row.sessionDate || row.session, 66, firstLineY);

      // Column 2: Full Multi-Line Topic / Lesson Name (0% ellipsis)
      ctx.fillStyle = '#334155';
      ctx.font = `600 11px ${fontStack}`;
      drawWrappedLines(ctx, topicLines, 160, firstLineY, 16);

      // Column 3: Test Score
      ctx.fillStyle =
        row.testScore !== null && row.testScore < 6
          ? '#e11d48'
          : row.testScore !== null && row.testScore >= 8
          ? '#059669'
          : '#0f172a';
      ctx.font = `800 12px ${fontStack}`;
      ctx.fillText(row.testScore !== null ? `${row.testScore}đ` : 'Miễn', 450, firstLineY);

      // Column 4: Homework Score
      ctx.fillStyle =
        row.homework_submitted === false
          ? '#e11d48'
          : row.hwScore !== null && row.hwScore >= 8
          ? '#2563eb'
          : '#0f172a';
      ctx.fillText(
        row.homework_submitted === false
          ? '0đ (Chưa nộp)'
          : row.hwScore !== null
          ? `${row.hwScore}đ${row.late_submit ? ' (Muộn)' : ''}`
          : 'Miễn',
        550,
        firstLineY
      );

      // Column 5: Composite Score
      ctx.fillStyle = '#0f172a';
      ctx.font = `800 12px ${fontStack}`;
      ctx.fillText(comp !== null ? `${comp}đ` : '--', 680, firstLineY);

      // Column 6: Attendance Status
      const statusLabel =
        row.attendance === 'absent_unexcused'
          ? 'Vắng K.Phép'
          : row.attendance === 'absent_excused'
          ? 'Vắng C.Phép'
          : row.attendance === 'late'
          ? 'Đi muộn'
          : 'Có mặt';
      ctx.fillStyle =
        row.attendance === 'absent_unexcused'
          ? '#e11d48'
          : row.attendance === 'late'
          ? '#d97706'
          : '#059669';
      ctx.font = `700 11px ${fontStack}`;
      ctx.fillText(statusLabel, 755, firstLineY);

      currentRowTop += rowH;
    });
  }

  // 5. Bottom Advice & Topic Mastery Box (Dynamic Auto-Height, 100% Wrapped Text, Zero Ellipsis)
  drawRoundedRect(ctx, 36, adviceY, width - 72, adviceH, 16);
  ctx.fillStyle = '#ecfdf5';
  ctx.fill();
  ctx.strokeStyle = '#a7f3d0';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = '#065f46';
  ctx.font = `800 13px ${fontStack}`;
  ctx.fillText(
    'NHẬN XÉT PHONG ĐỘ 2 BUỔI GẦN NHẤT & ĐỊNH HƯỚNG ĐỒNG HÀNH CÙNG GIA ĐÌNH',
    56,
    adviceY + 26
  );

  ctx.fillStyle = '#0f172a';
  ctx.font = `600 12.5px ${fontStack}`;
  const afterAdviceY = drawWrappedLines(ctx, adviceLines, 56, adviceY + 48, 20);

  // Divider inside bottom box
  const dividerY = afterAdviceY - 4;
  ctx.beginPath();
  ctx.moveTo(56, dividerY);
  ctx.lineTo(width - 56, dividerY);
  ctx.strokeStyle = '#a7f3d0';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Mastered topics (all lines wrapped cleanly)
  ctx.fillStyle = '#047857';
  ctx.font = `700 11.5px ${fontStack}`;
  const afterMasteredY = drawWrappedLines(ctx, masteredLines, 56, dividerY + 20, 19);

  // Weak topics needing review (all lines wrapped cleanly)
  ctx.fillStyle = weak.length > 0 ? '#b45309' : '#047857';
  ctx.font = `700 11.5px ${fontStack}`;
  drawWrappedLines(ctx, weakLines, 56, afterMasteredY + 6, 19);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Không thể xuất ảnh PNG từ Canvas'));
    }, 'image/png');
  });
}
