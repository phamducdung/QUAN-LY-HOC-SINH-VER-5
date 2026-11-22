import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';

export interface RemedialExerciseItem {
  level: string; // "Mức độ 1: Cơ bản - Lấy lại gốc", "Mức độ 2: Vận dụng - Rèn kỹ năng", "Mức độ 3: Vận dụng cao - Mục tiêu 8.5+"
  points: string; // e.g., "2.0 điểm"
  question: string; // Chứa công thức toán trong $...$ hoặc $$...$$
  hintOrSolution: string; // Hướng dẫn giải & đáp số chứa công thức trong $...$ hoặc $$...$$
}

export interface RemedialWorksheetData {
  worksheetTitle: string;
  targetTopicNames: string[];
  schoolOrCenterName?: string;
  className: string;
  gradeLevel: number | string;
  studentNames: string[]; // 1 học sinh hoặc danh sách nhóm học sinh cùng hổng chuyên đề
  teacherName?: string;
  durationMinutes?: number;
  diagnosisSummary: string;
  theorySummary: string[]; // Các gạch đầu dòng lý thuyết & công thức trọng tâm ($...$ / $$...$$)
  exercises: RemedialExerciseItem[];
  parentNote: string;
}

/**
 * Tách văn bản có chứa công thức Toán học dạng $$...$$ (block) hoặc $...$ (inline)
 * thành danh sách các TextRun của thư viện `docx`.
 * - Các đoạn công thức ($...$ hoặc $$...$$) giữ nguyên cặp dấu $...$ / $$...$$ và ép font "Cambria Math"
 *   để Giáo viên mở Word nhấn phím tắt 'Alt + \' (hoặc MathType Toggle TeX) là tự động chuyển 100% sang MathType.
 * - Các đoạn văn bản tiếng Việt thông thường dùng font "Times New Roman" cỡ 12pt (size: 24).
 */
function parseMathTextToRuns(
  rawText: string,
  options?: {
    bold?: boolean;
    italics?: boolean;
    color?: string;
    fontSizeHalfPt?: number;
  }
): TextRun[] {
  const text = rawText || '';
  const size = options?.fontSizeHalfPt || 24; // 12pt
  const regex = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g;
  const parts = text.split(regex);
  const runs: TextRun[] = [];

  for (const part of parts) {
    if (!part) continue;
    const isBlockMath = part.startsWith('$$') && part.endsWith('$$');
    const isInlineMath = !isBlockMath && part.startsWith('$') && part.endsWith('$');

    if (isBlockMath || isInlineMath) {
      runs.push(
        new TextRun({
          text: part,
          font: 'Cambria Math',
          size,
          bold: options?.bold,
          italics: false,
          color: options?.color || '0F172A',
        })
      );
    } else {
      runs.push(
        new TextRun({
          text: part,
          font: 'Times New Roman',
          size,
          bold: options?.bold,
          italics: options?.italics,
          color: options?.color || '000000',
        })
      );
    }
  }

  return runs.length > 0
    ? runs
    : [
        new TextRun({
          text: '',
          font: 'Times New Roman',
          size,
        }),
      ];
}

/**
 * Tạo danh sách Paragraph hỗ trợ xuống dòng (\n) và tự động tách dòng riêng cho công thức Block $$...$$
 */
function createMathParagraphs(
  rawText: string,
  options?: {
    prefix?: string;
    prefixBold?: boolean;
    bold?: boolean;
    italics?: boolean;
    color?: string;
    indentLeft?: number;
  }
): Paragraph[] {
  const lines = (rawText || '').split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  return lines.map((line, idx) => {
    const runs: TextRun[] = [];
    if (idx === 0 && options?.prefix) {
      runs.push(
        new TextRun({
          text: options.prefix,
          font: 'Times New Roman',
          size: 24,
          bold: options.prefixBold !== false,
          color: options?.color || '000000',
        })
      );
    }
    runs.push(
      ...parseMathTextToRuns(line, {
        bold: options?.bold,
        italics: options?.italics,
        color: options?.color,
      })
    );

    const isPureBlockMath = line.startsWith('$$') && line.endsWith('$$');

    return new Paragraph({
      alignment: isPureBlockMath ? AlignmentType.CENTER : AlignmentType.JUSTIFIED,
      spacing: { before: 80, after: 100, line: 320 },
      indent: options?.indentLeft ? { left: options.indentLeft } : undefined,
      children: runs,
    });
  });
}

/**
 * Xuất File Word (.DOCX) Phiếu Bài Tập Bù Lỗ Hổng Cá Nhân Hóa Chuẩn Cambria Math ($...$ & $$...$$)
 */
export async function exportRemedialWorksheetDocx(
  data: RemedialWorksheetData
): Promise<void> {
  const centerName =
    data.schoolOrCenterName || 'HỆ THỐNG QUẢN LÝ CHẤT LƯỢNG & CSKH TOÁN THCS';
  const duration = data.durationMinutes || 45;
  const studentDisplay =
    data.studentNames.length === 1
      ? data.studentNames[0]
      : `Nhóm phụ đạo (${data.studentNames.length} HS): ${data.studentNames.join(', ')}`;
  const topicsDisplay =
    data.targetTopicNames.length > 0
      ? data.targetTopicNames.join('; ')
      : 'Chuyên đề Toán THCS Trọng tâm';

  const thinBorder = {
    top: { style: BorderStyle.SINGLE, size: 6, color: '334155' },
    bottom: { style: BorderStyle.SINGLE, size: 6, color: '334155' },
    left: { style: BorderStyle.SINGLE, size: 6, color: '334155' },
    right: { style: BorderStyle.SINGLE, size: 6, color: '334155' },
  };

  // 1. BẢNG HEADER TRƯỜNG / TRUNG TÂM & THÔNG TIN ĐỀ BÀI
  const headerTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 46, type: WidthType.PERCENTAGE },
            borders: thinBorder,
            margins: { top: 120, bottom: 120, left: 160, right: 160 },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 60 },
                children: [
                  new TextRun({
                    text: centerName.toUpperCase(),
                    font: 'Times New Roman',
                    size: 22,
                    bold: true,
                  }),
                ],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 60 },
                children: [
                  new TextRun({
                    text: `TỔ TOÁN THCS - KHỐI ${data.gradeLevel}`,
                    font: 'Times New Roman',
                    size: 22,
                    bold: true,
                  }),
                ],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: `Lớp: ${data.className} | Giáo viên: ${data.teacherName || 'Thầy/Cô phụ trách'}`,
                    font: 'Times New Roman',
                    size: 20,
                    italics: true,
                  }),
                ],
              }),
            ],
          }),
          new TableCell({
            width: { size: 54, type: WidthType.PERCENTAGE },
            borders: thinBorder,
            margins: { top: 120, bottom: 120, left: 160, right: 160 },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 60 },
                children: [
                  new TextRun({
                    text: (
                      data.worksheetTitle || 'PHIẾU BÀI TẬP BÙ LỖ HỔNG CHUYÊN ĐỀ TOÁN'
                    ).toUpperCase(),
                    font: 'Times New Roman',
                    size: 24,
                    bold: true,
                  }),
                ],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 60 },
                children: [
                  new TextRun({
                    text: `Môn: Toán ${data.gradeLevel} — Thời gian làm bài: ${duration} phút`,
                    font: 'Times New Roman',
                    size: 22,
                    bold: true,
                  }),
                ],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: `Chuyên đề trọng tâm: ${topicsDisplay}`,
                    font: 'Times New Roman',
                    size: 20,
                    italics: true,
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });

  // 2. BẢNG THÔNG TIN HỌC SINH & KHUNG CHẤM ĐIỂM / LỜI PHÊ CỦA GIÁO VIÊN
  const gradingTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 65, type: WidthType.PERCENTAGE },
            borders: thinBorder,
            margins: { top: 100, bottom: 100, left: 160, right: 160 },
            children: [
              new Paragraph({
                spacing: { after: 60 },
                children: [
                  new TextRun({
                    text: 'Họ và tên học sinh: ',
                    font: 'Times New Roman',
                    size: 23,
                    bold: true,
                  }),
                  new TextRun({
                    text: studentDisplay,
                    font: 'Times New Roman',
                    size: 23,
                  }),
                ],
              }),
              new Paragraph({
                children: [
                  new TextRun({
                    text: 'Mục tiêu phiếu bài tập: ',
                    font: 'Times New Roman',
                    size: 22,
                    bold: true,
                  }),
                  ...parseMathTextToRuns(data.diagnosisSummary, { fontSizeHalfPt: 22 }),
                ],
              }),
            ],
          }),
          new TableCell({
            width: { size: 35, type: WidthType.PERCENTAGE },
            borders: thinBorder,
            margins: { top: 100, bottom: 100, left: 160, right: 160 },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: 'ĐIỂM KIỂM TRA BÙ HỔNG',
                    font: 'Times New Roman',
                    size: 21,
                    bold: true,
                  }),
                ],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 120, after: 120 },
                children: [
                  new TextRun({
                    text: '....... / 10 điểm',
                    font: 'Times New Roman',
                    size: 24,
                    bold: true,
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            columnSpan: 2,
            borders: thinBorder,
            margins: { top: 100, bottom: 100, left: 160, right: 160 },
            children: [
              new Paragraph({
                spacing: { after: 80 },
                children: [
                  new TextRun({
                    text: 'Nhận xét của Giáo viên & Xác nhận của Phụ huynh: ',
                    font: 'Times New Roman',
                    size: 22,
                    bold: true,
                  }),
                  ...parseMathTextToRuns(data.parentNote || '', {
                    italics: true,
                    fontSizeHalfPt: 22,
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });

  // 3. PHẦN I: TÓM TẮT CÔNG THỨC & PHƯƠNG PHÁP GIẢI TRỌNG TÂM
  const theoryParagraphs: Paragraph[] = [
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 280, after: 120 },
      children: [
        new TextRun({
          text: 'PHẦN I. TÓM TẮT LÝ THUYẾT & CÔNG THỨC TRỌNG TÂM CẦN NHỚ',
          font: 'Times New Roman',
          size: 26,
          bold: true,
        }),
      ],
    }),
  ];

  (data.theorySummary || []).forEach((item, idx) => {
    theoryParagraphs.push(
      ...createMathParagraphs(item, {
        prefix: `${idx + 1}. `,
        prefixBold: true,
      })
    );
  });

  // 4. PHẦN II: BÀI TẬP TỰ LUẬN BÙ LỖ HỔNG PHÂN BẬC (CHUẨN CAMBRIA MATH $...$)
  const exercisesParagraphs: Paragraph[] = [
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 280, after: 120 },
      children: [
        new TextRun({
          text: 'PHẦN II. HỆ THỐNG BÀI TẬP TỰ LUẬN BÙ LỖ HỔNG (CHIA ĐIỂM CHUẨN)',
          font: 'Times New Roman',
          size: 26,
          bold: true,
        }),
      ],
    }),
  ];

  (data.exercises || []).forEach((ex, idx) => {
    exercisesParagraphs.push(
      new Paragraph({
        spacing: { before: 180, after: 80 },
        children: [
          new TextRun({
            text: `Bài ${idx + 1} (${ex.points || '2.0 điểm'} - ${ex.level || 'Trọng tâm'}): `,
            font: 'Times New Roman',
            size: 24,
            bold: true,
          }),
        ],
      })
    );

    exercisesParagraphs.push(
      ...createMathParagraphs(ex.question, {
        indentLeft: 240,
      })
    );
  });

  // 5. PHẦN III: HƯỚNG DẪN GIẢI CHI TIẾT & ĐÁP SỐ DÀNH CHO HỌC SINH / PHỤ HUYNH ĐỐI CHIẾU
  const solutionParagraphs: Paragraph[] = [
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 320, after: 120 },
      children: [
        new TextRun({
          text: 'PHẦN III. ĐÁP SỐ & HƯỚNG DẪN GIẢI CHI TIẾT (DÀNH CHO GIÁO VIÊN & GIA ĐÌNH ĐỐI CHIẾU)',
          font: 'Times New Roman',
          size: 26,
          bold: true,
        }),
      ],
    }),
  ];

  (data.exercises || []).forEach((ex, idx) => {
    solutionParagraphs.push(
      ...createMathParagraphs(ex.hintOrSolution || 'Học sinh trình bày chi tiết từng bước vào vở.', {
        prefix: `Hướng dẫn Bài ${idx + 1}: `,
        prefixBold: true,
      })
    );
  });

  // Gợi ý phím tắt MathType ở chân trang dành cho Giáo viên
  const footerTip = new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 360 },
    children: [
      new TextRun({
        text: '--- HẾT --- (Mẹo cho Giáo viên: Toàn bộ công thức Toán $...$ đã được chuẩn hóa font Cambria Math, nhấn Alt + \\ trong Word để chuyển tức thì sang MathType)',
        font: 'Times New Roman',
        size: 19,
        italics: true,
        color: '475569',
      }),
    ],
  });

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1000,
              right: 1000,
              bottom: 1000,
              left: 1134, // Căn lề chuẩn 2cm
            },
          },
        },
        children: [
          headerTable,
          new Paragraph({ spacing: { after: 140 }, children: [] }),
          gradingTable,
          ...theoryParagraphs,
          ...exercisesParagraphs,
          ...solutionParagraphs,
          footerTip,
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const safeStudent =
    data.studentNames.length === 1
      ? data.studentNames[0].replace(/\s+/g, '_')
      : `Nhom_${data.studentNames.length}_HS`;
  link.href = url;
  link.download = `Phieu_Bu_Lo_Hong_Toan_${safeStudent}_${new Date().toISOString().slice(0, 10)}.docx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
