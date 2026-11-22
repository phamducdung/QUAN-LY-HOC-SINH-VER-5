import { AIDiagnosisData, Student } from '../types';
import { TopicMasteryAnalysis } from './knowledgeEngine';

export interface KnowledgeReportCardContext {
  student: Student;
  className: string;
  gradeLevel: number | 'all';
  teacherName?: string;
  targetGoal?: string;
  topics: TopicMasteryAnalysis[];
  aiDiagnosis?: AIDiagnosisData | null;
}

function resolveTeacherPronoun(teacherName?: string): {
  title: string;
  titleLower: string;
} {
  if (!teacherName || !teacherName.trim()) {
    return { title: 'Thầy/Cô', titleLower: 'thầy/cô' };
  }
  const clean = teacherName.trim();
  const lower = clean.toLowerCase();
  if (lower.startsWith('thầy ') || lower.startsWith('cô ')) {
    const cap = clean.charAt(0).toUpperCase() + clean.slice(1);
    return { title: cap, titleLower: clean };
  }
  return { title: `Thầy/Cô ${clean}`, titleLower: `thầy/cô ${clean}` };
}

/**
 * Tạo tin nhắn Zalo Bản Đồ Năng Lực Chuyên Đề (100% Điểm Kiểm Tra) & Lộ Trình Khắc Phục
 * Gửi Phụ huynh 1-Click, cá nhân hóa xưng hô theo Giáo viên phụ trách lớp.
 */
export function generateZaloKnowledgeMapMessage(ctx: KnowledgeReportCardContext): string {
  const { student, className, teacherName, topics, aiDiagnosis } = ctx;
  const pronoun = resolveTeacherPronoun(teacherName);
  const parentTitle = student.parent_name ? `Anh/Chị ${student.parent_name}` : 'Quý Phụ huynh';

  const testedTopics = topics.filter((t) => t.sessionCount > 0);
  const mastered = testedTopics.filter((t) => t.studentScore >= 8.5);
  const proficient = testedTopics.filter((t) => t.studentScore >= 7.0 && t.studentScore < 8.5);
  const gaps = testedTopics.filter((t) => t.studentScore < 7.0);

  const overallTestAvg =
    testedTopics.length > 0
      ? (
          testedTopics.reduce((acc, t) => acc + t.studentScore, 0) / testedTopics.length
        ).toFixed(2)
      : 'Chưa có bài KT';

  const strongText =
    mastered.length > 0
      ? mastered.map((t) => `${t.fullTagName} (${t.studentScore}đ)`).join(', ')
      : proficient.length > 0
      ? proficient.map((t) => `${t.fullTagName} (${t.studentScore}đ)`).join(', ')
      : 'Đang trong giai đoạn tích lũy nền tảng';

  const gapText =
    gaps.length > 0
      ? gaps
          .map((t) => {
            const trendStr =
              t.trend === 'improving'
                ? ` - đang tiến bộ +${t.trendDelta}đ`
                : t.trend === 'declining'
                ? ` - giảm ${t.trendDelta}đ`
                : '';
            return `${t.fullTagName} (${t.studentScore}đ/${t.sessionCount} bài KT${trendStr})`;
          })
          .join('; ')
      : 'Không có chuyên đề nào dưới ngưỡng 7.0đ (Con nắm chắc kiến thức đã kiểm tra)';

  const roadmapAdvice = aiDiagnosis?.parent_summary
    ? aiDiagnosis.parent_summary
    : gaps.length > 0
    ? `${pronoun.title} đã khoanh vùng chính xác ${gaps.length} chuyên đề con còn hổng qua các bài kiểm tra và chuẩn bị riêng Phiếu bài tập bù lỗ hổng để kèm con lấy lại điểm số trong 2 buổi tới.`
    : `${pronoun.title} đánh giá cao năng lực làm bài kiểm tra vững vàng của con. Thời gian tới ${pronoun.titleLower} sẽ bổ sung thêm các dạng toán phân loại 8.5+ để con bứt phá mục tiêu.`;

  return [
    `📊 [BẢN ĐỒ NĂNG LỰC CHUYÊN ĐỀ TOÁN - ${student.full_name.toUpperCase()}]`,
    `Kính gửi ${parentTitle} (Phụ huynh em ${student.full_name} - Lớp ${className}),`,
    `${pronoun.title} xin gửi gia đình kết quả phân tích Bản Đồ Kiến Thức Chuyên Đề (đo lường 100% qua hệ thống Bài Kiểm Tra thực chiến) của con:`,
    ``,
    `1️⃣ Tổng quan năng lực Kiểm tra Chuyên đề:`,
    `• Điểm TB Kiểm tra các chuyên đề đã học: ${overallTestAvg}/10đ (${testedTopics.length} chuyên đề đã kiểm tra)`,
    `• Chuyên đề Vững vàng (≥ 8.5đ): ${mastered.length} chuyên đề`,
    `• Chuyên đề Khá - Ổn định (7.0 - 8.4đ): ${proficient.length} chuyên đề`,
    `• Chuyên đề Cần bù lỗ hổng (< 7.0đ): ${gaps.length} chuyên đề`,
    ``,
    `2️⃣ Chi tiết điểm mạnh & lỗ hổng kiến thức:`,
    `🌟 Chuyên đề con nắm vững: ${strongText}`,
    `⚠️ Chuyên đề cần tập trung khắc phục: ${gapText}`,
    ``,
    `3️⃣ Lộ trình đồng hành & khắc phục:`,
    `💡 ${roadmapAdvice}`,
    ``,
    `Gia đình xem thêm Phiếu Bản Đồ Năng Lực (ảnh đính kèm) để nắm trọn vẹn từng chuyên đề của con nhé. Cảm ơn gia đình đã luôn đồng hành cùng ${pronoun.titleLower}!`,
  ].join('\n');
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
  maxWidth: number,
  font: string
): string[] {
  ctx.font = font;
  const rawParagraphs = (text || '').split('\n');
  const allLines: string[] = [];

  for (const para of rawParagraphs) {
    const words = para.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      allLines.push('');
      continue;
    }
    let currentLine = words[0];
    for (let i = 1; i < words.length; i++) {
      const candidate = `${currentLine} ${words[i]}`;
      if (ctx.measureText(candidate).width <= maxWidth) {
        currentLine = candidate;
      } else {
        allLines.push(currentLine);
        currentLine = words[i];
      }
    }
    allLines.push(currentLine);
  }
  return allLines.length > 0 ? allLines : [''];
}

function drawWrappedLines(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  x: number,
  startY: number,
  lineHeight: number,
  font: string,
  color: string
): number {
  ctx.font = font;
  ctx.fillStyle = color;
  lines.forEach((line, idx) => {
    ctx.fillText(line, x, startY + idx * lineHeight);
  });
  return startY + lines.length * lineHeight;
}

/**
 * Xuất Ảnh PNG Phiếu Bản Đồ Năng Lực & Lộ Trình Khắc Phục Chuyên Đề (Retina 2x, 0% dấu '...')
 * Sử dụng kiến trúc Two-Pass Dynamic Auto-Height & Full Multi-Line Wrapping để hiển thị 100% tên chuyên đề và lời khuyên.
 */
export async function exportKnowledgeMapReportCardPNG(
  ctxData: KnowledgeReportCardContext
): Promise<void> {
  const { student, className, teacherName, targetGoal, topics, aiDiagnosis } = ctxData;
  const pronoun = resolveTeacherPronoun(teacherName);

  // Ưu tiên hiển thị các chuyên đề đã có bài kiểm tra; nếu chưa có bài nào thì hiển thị tất cả
  const testedTopics = topics.filter((t) => t.sessionCount > 0);
  const displayTopics = testedTopics.length > 0 ? testedTopics : topics;

  const masteredCount = testedTopics.filter((t) => t.studentScore >= 8.5).length;
  const proficientCount = testedTopics.filter(
    (t) => t.studentScore >= 7.0 && t.studentScore < 8.5
  ).length;
  const gapCount = testedTopics.filter((t) => t.studentScore < 7.0).length;
  const overallAvg =
    testedTopics.length > 0
      ? Number(
          (
            testedTopics.reduce((acc, t) => acc + t.studentScore, 0) / testedTopics.length
          ).toFixed(2)
        )
      : 0;

  const width = 1080;
  const scale = 2; // Retina 2x

  const measureCanvas = document.createElement('canvas');
  const mCtx = measureCanvas.getContext('2d')!;

  const fontGoal = 'bold 15px "Inter", "Segoe UI", sans-serif';
  const fontTopicTitle = 'bold 14px "Inter", "Segoe UI", sans-serif';
  const fontAdviceBody = '500 15px "Inter", "Segoe UI", sans-serif';
  const fontAdviceBold = 'bold 14px "Inter", "Segoe UI", sans-serif';

  const goalFullText = `🎯 Mục tiêu đầu ra: ${
    targetGoal || 'Nắm vững 100% chuyên đề trọng tâm & đạt 8.0+ kỳ thi Toán'
  }  |  Giáo viên phụ trách: ${pronoun.title}`;
  const goalLines = measureWrappedLines(mCtx, goalFullText, width - 96, fontGoal);
  const headerBannerH = Math.max(152, 118 + goalLines.length * 22);

  // Đo chiều cao từng dòng chuyên đề trong Bảng & Biểu Đồ Thanh Ngang (hiển thị 100% tên chuyên đề không cắt '...')
  const topicNameColMaxW = 390;
  const measuredTopics = displayTopics.map((t) => {
    const titleLines = measureWrappedLines(
      mCtx,
      t.fullTagName,
      topicNameColMaxW,
      fontTopicTitle
    );
    const rowHeight = Math.max(58, titleLines.length * 20 + 30);
    return {
      topic: t,
      titleLines,
      rowHeight,
    };
  });

  const totalTopicsRowsH = measuredTopics.reduce((acc, r) => acc + r.rowHeight, 0);
  const chartSectionH = 108 + Math.max(80, totalTopicsRowsH) + 24;

  // Đo chiều cao Khung Chẩn Đoán & Lộ Trình Bù Lỗ Hổng ở cuối phiếu
  const strongTopicsText =
    testedTopics.filter((t) => t.studentScore >= 8.0).length > 0
      ? testedTopics
          .filter((t) => t.studentScore >= 8.0)
          .map((t) => `${t.fullTagName} (${t.studentScore}đ)`)
          .join(', ')
      : 'Đang trong giai đoạn tích lũy nền tảng';

  const weakTopicsText =
    testedTopics.filter((t) => t.studentScore < 7.0).length > 0
      ? testedTopics
          .filter((t) => t.studentScore < 7.0)
          .map((t) => `${t.fullTagName} (${t.studentScore}đ - ${t.sessionCount} bài KT)`)
          .join(', ')
      : 'Không có lỗ hổng chuyên đề dưới 7.0đ';

  const mainDiagnosisText = aiDiagnosis?.knowledge_gap
    ? `Chẩn đoán chuyên sâu: ${aiDiagnosis.knowledge_gap}`
    : gapCount > 0
    ? `Qua các bài kiểm tra thực chiến (tính 100% Điểm Kiểm Tra), con còn ${gapCount} chuyên đề dưới ngưỡng 7.0đ cần được bù lỗ hổng kịp thời.`
    : `Con duy trì năng lực làm bài kiểm tra chuyên đề rất ổn định, nắm chắc các dạng bài trọng tâm của chương trình.`;

  const actionPlanText = aiDiagnosis?.actionable_advice
    ? `Lộ trình khắc phục & bài tập bù hổng: ${aiDiagnosis.actionable_advice}`
    : `Định hướng đồng hành: ${pronoun.title} đã biên soạn Phiếu bài tập bù lỗ hổng cá nhân hóa sát với chuyên đề con còn yếu để con luyện tập và cải thiện điểm kiểm tra trong 2 buổi tới.`;

  const adviceInnerMaxW = width - 96;
  const diagLines = measureWrappedLines(mCtx, mainDiagnosisText, adviceInnerMaxW, fontAdviceBody);
  const planLines = measureWrappedLines(mCtx, actionPlanText, adviceInnerMaxW, fontAdviceBody);
  const strongLines = measureWrappedLines(
    mCtx,
    `★ Chuyên đề nắm vững (≥ 8.0đ): ${strongTopicsText}`,
    adviceInnerMaxW,
    fontAdviceBold
  );
  const weakLines = measureWrappedLines(
    mCtx,
    `⚠ Chuyên đề cần bù lỗ hổng (< 7.0đ): ${weakTopicsText}`,
    adviceInnerMaxW,
    fontAdviceBold
  );

  const adviceBoxH =
    62 +
    diagLines.length * 23 +
    10 +
    planLines.length * 23 +
    14 +
    strongLines.length * 21 +
    8 +
    weakLines.length * 21 +
    22;

  const kpiCardsY = headerBannerH + 22;
  const kpiCardsH = 128;
  const chartSectionY = kpiCardsY + kpiCardsH + 22;
  const adviceBoxY = chartSectionY + chartSectionH + 22;
  const totalHeight = adviceBoxY + adviceBoxH + 30;

  // PASS 2: Khởi tạo Canvas Retina 2x với tổng chiều cao động chính xác
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = totalHeight * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);

  // Nền tổng thể
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, width, totalHeight);

  // 1. HEADER BANNER
  const headerGrad = ctx.createLinearGradient(0, 0, width, headerBannerH);
  headerGrad.addColorStop(0, '#064e3b');
  headerGrad.addColorStop(0.55, '#0f766e');
  headerGrad.addColorStop(1, '#115e59');
  ctx.fillStyle = headerGrad;
  ctx.fillRect(0, 0, width, headerBannerH);

  ctx.fillStyle = '#6ee7b7';
  ctx.font = 'bold 13px "Inter", "Segoe UI", sans-serif';
  ctx.fillText(
    'BẢN ĐỒ NĂNG LỰC CHUYÊN ĐỀ TOÁN & LỘ TRÌNH BÙ LỖ HỔNG (CHUẨN 100% ĐIỂM KIỂM TRA)',
    48,
    36
  );

  ctx.fillStyle = '#ffffff';
  ctx.font = '900 32px "Inter", "Segoe UI", sans-serif';
  ctx.fillText(`BẢN ĐỒ KIẾN THỨC: ${student.full_name.toUpperCase()}`, 48, 76);

  ctx.fillStyle = '#ccfbf1';
  ctx.font = '600 15px "Inter", "Segoe UI", sans-serif';
  const parentInfo = student.parent_name
    ? `Phụ huynh: ${student.parent_name}${student.parent_phone ? ` (${student.parent_phone})` : ''}`
    : `Mã HS: #${student.id}`;
  ctx.fillText(`Lớp: ${className}   |   ${parentInfo}`, 48, 104);

  drawWrappedLines(ctx, goalLines, 48, 130, 22, fontGoal, '#a7f3d0');

  // Badge ngày xuất
  drawRoundedRect(ctx, width - 250, 26, 202, 38, 10);
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 13px "Inter", "Segoe UI", sans-serif';
  const todayStr = new Date().toLocaleDateString('vi-VN');
  ctx.fillText(`Ngày xuất: ${todayStr}`, width - 228, 50);

  // 2. 4 KPI CARDS (100% ĐIỂM KIỂM TRA CHUYÊN ĐỀ)
  const cardW = (width - 96 - 36) / 4;
  const kpiItems = [
    {
      title: 'ĐIỂM TB KIỂM TRA CHUYÊN ĐỀ',
      value: testedTopics.length > 0 ? `${overallAvg}đ` : '--',
      sub1: `Tính 100% Điểm Kiểm Tra`,
      sub2: `Đã kiểm tra: ${testedTopics.length}/${topics.length} chuyên đề`,
      accent: overallAvg >= 8.0 ? '#10b981' : overallAvg >= 6.5 ? '#0284c7' : '#e11d48',
      bg: '#ffffff',
    },
    {
      title: 'CHUYÊN ĐỀ VỮNG VÀNG',
      value: `${masteredCount} CĐ`,
      sub1: 'Điểm Kiểm tra ≥ 8.5đ',
      sub2: masteredCount > 0 ? 'Đạt chuẩn bứt phá 8.5+' : 'Cần rèn luyện thêm',
      accent: '#059669',
      bg: '#ffffff',
    },
    {
      title: 'CHUYÊN ĐỀ KHÁ - ỔN ĐỊNH',
      value: `${proficientCount} CĐ`,
      sub1: 'Điểm Kiểm tra 7.0đ - 8.4đ',
      sub2: 'Nắm được kiến thức cơ bản',
      accent: '#0284c7',
      bg: '#ffffff',
    },
    {
      title: 'LỖ HỔNG CẦN PHỤ ĐẠO',
      value: `${gapCount} CĐ`,
      sub1: 'Điểm Kiểm tra < 7.0đ',
      sub2: gapCount > 0 ? 'Ưu tiên làm phiếu bù lỗ hổng' : 'Không có lỗ hổng < 7.0đ',
      accent: gapCount > 0 ? '#e11d48' : '#10b981',
      bg: '#ffffff',
    },
  ];

  kpiItems.forEach((card, idx) => {
    const cx = 48 + idx * (cardW + 12);
    drawRoundedRect(ctx, cx, kpiCardsY, cardW, kpiCardsH, 16);
    ctx.fillStyle = card.bg;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#e2e8f0';
    ctx.stroke();

    // Thanh màu trên đỉnh card
    drawRoundedRect(ctx, cx, kpiCardsY, cardW, 6, 3);
    ctx.fillStyle = card.accent;
    ctx.fill();

    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 11px "Inter", "Segoe UI", sans-serif';
    ctx.fillText(card.title, cx + 16, kpiCardsY + 28);

    ctx.fillStyle = card.accent;
    ctx.font = '900 30px "Inter", "Segoe UI", sans-serif';
    ctx.fillText(card.value, cx + 16, kpiCardsY + 66);

    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 12px "Inter", "Segoe UI", sans-serif';
    ctx.fillText(card.sub1, cx + 16, kpiCardsY + 92);

    ctx.fillStyle = '#64748b';
    ctx.font = '500 11px "Inter", "Segoe UI", sans-serif';
    ctx.fillText(card.sub2, cx + 16, kpiCardsY + 112);
  });

  // 3. BIỂU ĐỒ THANH NGANG SO SÁNH ĐIỂM KIỂM TRA TỪNG CHUYÊN ĐỀ (100% TÊN ĐẦY ĐỦ, KHÔNG DÙNG '...')
  drawRoundedRect(ctx, 48, chartSectionY, width - 96, chartSectionH, 18);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#e2e8f0';
  ctx.stroke();

  // Dòng 1: Tiêu đề
  ctx.fillStyle = '#0f172a';
  ctx.font = '900 16px "Inter", "Segoe UI", sans-serif';
  ctx.fillText(
    'CHI TIẾT MỨC ĐỘ LÀM CHỦ TỪNG CHUYÊN ĐỀ QUA BÀI KIỂM TRA (100% ĐIỂM KT)',
    72,
    chartSectionY + 34
  );

  // Dòng 2: Chú giải tách riêng biệt (không bao giờ đè lên tiêu đề)
  const legendY = chartSectionY + 58;
  ctx.fillStyle = '#10b981';
  ctx.fillRect(72, legendY - 10, 12, 12);
  ctx.fillStyle = '#334155';
  ctx.font = 'bold 12px "Inter", "Segoe UI", sans-serif';
  ctx.fillText('Vững vàng (≥ 8.5đ)', 90, legendY);

  ctx.fillStyle = '#0284c7';
  ctx.fillRect(235, legendY - 10, 12, 12);
  ctx.fillStyle = '#334155';
  ctx.fillText('Khá - Ổn định (7.0 - 8.4đ)', 253, legendY);

  ctx.fillStyle = '#e11d48';
  ctx.fillRect(435, legendY - 10, 12, 12);
  ctx.fillStyle = '#334155';
  ctx.fillText('Lỗ hổng cần phụ đạo (< 7.0đ)', 453, legendY);

  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(655, legendY - 10, 3, 12);
  ctx.fillStyle = '#475569';
  ctx.fillText('Vạch chuẩn TB Lớp', 666, legendY);

  // Header cột của bảng chuyên đề
  const listHeaderY = chartSectionY + 88;
  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(72, listHeaderY - 18, width - 144, 28);
  ctx.fillStyle = '#475569';
  ctx.font = 'bold 11px "Inter", "Segoe UI", sans-serif';
  ctx.fillText('CHUYÊN ĐỀ MÔN TOÁN (HIỂN THỊ 100% ĐẦY ĐỦ)', 84, listHeaderY);
  ctx.fillText('BIỂU ĐỒ ĐIỂM KIỂM TRA VS TB LỚP (THANG 10Đ)', 490, listHeaderY);
  ctx.fillText('ĐIỂM KT', 835, listHeaderY);
  ctx.fillText('XU HƯỚNG 2 BÀI', 910, listHeaderY);

  let currentRowY = listHeaderY + 14;
  const barStartX = 490;
  const barMaxW = 315;

  measuredTopics.forEach((item, idx) => {
    const { topic, titleLines, rowHeight } = item;

    if (idx % 2 === 1) {
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(72, currentRowY, width - 144, rowHeight);
    }

    // Vẽ đường kẻ ngăn cách hàng
    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(72, currentRowY + rowHeight);
    ctx.lineTo(width - 72, currentRowY + rowHeight);
    ctx.stroke();

    // Cột 1: Tên chuyên đề đầy đủ nhiều dòng + Tag phân loại
    drawWrappedLines(
      ctx,
      titleLines,
      84,
      currentRowY + 22,
      19,
      fontTopicTitle,
      '#0f172a'
    );

    const subMetaY = currentRowY + 22 + titleLines.length * 19;
    ctx.fillStyle = '#64748b';
    ctx.font = '600 11px "Inter", "Segoe UI", sans-serif';
    ctx.fillText(
      `${topic.category === 'Algebra' ? 'Đại số' : 'Hình học'} • Khối ${topic.gradeLevel} • Đã làm ${topic.sessionCount} bài kiểm tra`,
      84,
      subMetaY
    );

    // Cột 2: Thanh Bar ngang
    const barCenterY = currentRowY + rowHeight / 2;
    drawRoundedRect(ctx, barStartX, barCenterY - 9, barMaxW, 18, 9);
    ctx.fillStyle = '#e2e8f0';
    ctx.fill();

    const fillW = Math.max(8, Math.min(1, topic.studentScore / 10) * barMaxW);
    const barColor =
      topic.sessionCount === 0
        ? '#94a3b8'
        : topic.studentScore >= 8.5
        ? '#10b981'
        : topic.studentScore >= 7.0
        ? '#0284c7'
        : '#e11d48';

    drawRoundedRect(ctx, barStartX, barCenterY - 9, fillW, 18, 9);
    ctx.fillStyle = barColor;
    ctx.fill();

    // Vạch mốc Điểm Trung Bình Lớp trên thanh Bar
    const classAvgX = barStartX + Math.min(1, Math.max(0, topic.classAvg / 10)) * barMaxW;
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(classAvgX, barCenterY - 13);
    ctx.lineTo(classAvgX, barCenterY + 13);
    ctx.stroke();

    ctx.fillStyle = '#64748b';
    ctx.font = '600 10px "Inter", "Segoe UI", sans-serif';
    ctx.fillText(`TB Lớp: ${topic.classAvg}đ`, barStartX, barCenterY + 22);

    // Cột 3: Điểm KT của Học sinh
    ctx.fillStyle = barColor;
    ctx.font = '900 16px "Inter", "Segoe UI", sans-serif';
    ctx.fillText(
      topic.sessionCount > 0 ? `${topic.studentScore}đ` : 'Chưa KT',
      835,
      barCenterY + 5
    );

    // Cột 4: Xu hướng 2 bài kiểm tra gần nhất
    let trendLabel = 'Ổn định';
    let trendColor = '#64748b';
    if (topic.sessionCount === 0) {
      trendLabel = 'Chưa có bài';
    } else if (topic.trend === 'improving') {
      trendLabel = `Tiến bộ (+${topic.trendDelta}đ)`;
      trendColor = '#059669';
    } else if (topic.trend === 'declining') {
      trendLabel = `Giảm (${topic.trendDelta}đ)`;
      trendColor = '#e11d48';
    }
    ctx.fillStyle = trendColor;
    ctx.font = 'bold 12px "Inter", "Segoe UI", sans-serif';
    ctx.fillText(trendLabel, 910, barCenterY + 4);

    currentRowY += rowHeight;
  });

  // 4. KHUNG CHẨN ĐOÁN LỘ TRÌNH BÙ LỖ HỔNG & ĐỊNH HƯỚNG ĐỒNG HÀNH CÙNG GIA ĐÌNH (100% KHÔNG CẮT CHỮ)
  drawRoundedRect(ctx, 48, adviceBoxY, width - 96, adviceBoxH, 18);
  ctx.fillStyle = '#ecfdf5';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#a7f3d0';
  ctx.stroke();

  ctx.fillStyle = '#065f46';
  ctx.font = '900 16px "Inter", "Segoe UI", sans-serif';
  ctx.fillText(
    'CHẨN ĐOÁN LỘ TRÌNH BÙ LỖ HỔNG CHUYÊN ĐỀ & ĐỊNH HƯỚNG ĐỒNG HÀNH CÙNG GIA ĐÌNH',
    72,
    adviceBoxY + 34
  );

  let cursorY = adviceBoxY + 62;
  cursorY = drawWrappedLines(
    ctx,
    diagLines,
    72,
    cursorY,
    23,
    fontAdviceBody,
    '#0f172a'
  );
  cursorY += 8;
  cursorY = drawWrappedLines(
    ctx,
    planLines,
    72,
    cursorY,
    23,
    fontAdviceBody,
    '#1e293b'
  );
  cursorY += 12;
  cursorY = drawWrappedLines(
    ctx,
    strongLines,
    72,
    cursorY,
    21,
    fontAdviceBold,
    '#047857'
  );
  cursorY += 6;
  drawWrappedLines(ctx, weakLines, 72, cursorY, 21, fontAdviceBold, '#be123c');

  // Tải file PNG về máy
  const dataUrl = canvas.toDataURL('image/png');
  const link = document.createElement('a');
  const safeName = student.full_name.replace(/\s+/g, '_');
  link.download = `Ban_Do_Nang_Luc_${safeName}_${new Date().toISOString().slice(0, 10)}.png`;
  link.href = dataUrl;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
