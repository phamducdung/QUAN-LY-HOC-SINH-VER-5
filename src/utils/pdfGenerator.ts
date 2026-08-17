import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ClassItem, Session, Student, StudentSession, Warning } from '../types';
import { sortStudentsByName } from './sortUtils';

/**
 * Normalizes Vietnamese text for standard jsPDF fonts to prevent garbled character output
 */
export function sanitizeVietnameseText(str: string): string {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

// In-memory cache for base64 fonts to avoid redundant fetching
let cachedRegularFontBase64: string | null = null;
let cachedBoldFontBase64: string | null = null;

/**
 * Dynamic CDN font downloader for beautiful Vietnamese support in downloaded PDFs
 */
async function getFontBase64(isBold: boolean = false): Promise<string | null> {
  if (isBold && cachedBoldFontBase64) return cachedBoldFontBase64;
  if (!isBold && cachedRegularFontBase64) return cachedRegularFontBase64;

  const url = isBold
    ? 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/Roboto-Medium.ttf'
    : 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/Roboto-Regular.ttf';

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch font from CDN');
    const arrayBuffer = await res.arrayBuffer();

    const uint8 = new Uint8Array(arrayBuffer);
    let binary = '';
    const chunk = 8192;
    for (let i = 0; i < uint8.length; i += chunk) {
      binary += String.fromCharCode.apply(null, Array.from(uint8.subarray(i, i + chunk)));
    }
    const base64 = btoa(binary);

    if (isBold) {
      cachedBoldFontBase64 = base64;
    } else {
      cachedRegularFontBase64 = base64;
    }
    return base64;
  } catch (error) {
    console.warn('Unicode font could not be fetched (offline or CDN blocked). Falling back to standard Helvetica:', error);
    return null;
  }
}

export async function exportSessionReportPDF(
  selectedClass: ClassItem,
  selectedSession: Session,
  students: Student[],
  studentSessions: Record<number, StudentSession>,
  activeClassWarnings?: Record<number, Warning[]>
) {
  const doc = new jsPDF();

  // Load custom Unicode fonts
  const regularFont = await getFontBase64(false);
  const boldFont = await getFontBase64(true);
  const hasUnicode = !!(regularFont && boldFont);

  if (hasUnicode) {
    doc.addFileToVFS('Roboto-Regular.ttf', regularFont!);
    doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');
    doc.addFileToVFS('Roboto-Bold.ttf', boldFont!);
    doc.addFont('Roboto-Bold.ttf', 'Roboto', 'bold');
    doc.setFont('Roboto', 'normal');
  } else {
    doc.setFont('helvetica', 'normal');
  }

  const cleanText = (text: string) => {
    return hasUnicode ? text : sanitizeVietnameseText(text);
  };

  // Header Title
  if (hasUnicode) {
    doc.setFont('Roboto', 'bold');
  } else {
    doc.setFont('helvetica', 'bold');
  }
  doc.setFontSize(16);
  doc.text(
    cleanText('SMART EDU MANAGER - BÁO CÁO KẾT QUẢ BUỔI HỌC'),
    14,
    15
  );

  if (hasUnicode) {
    doc.setFont('Roboto', 'normal');
  } else {
    doc.setFont('helvetica', 'normal');
  }
  doc.setFontSize(10);
  let currentY = 23;

  doc.text(
    cleanText(`Lớp học: ${selectedClass.class_name}`),
    14,
    currentY
  );
  currentY += 6;

  doc.text(
    cleanText(
      `Buổi học & Tựa đề: ${selectedSession.lesson_title} (${selectedSession.session_date})`
    ),
    14,
    currentY
  );
  currentY += 6;

  const hwDescText = `Nội dung BTVN: ${selectedSession.homework_description || 'Không có BTVN giao về nhà'}`;
  const splitHw = doc.splitTextToSize(cleanText(hwDescText), 180);
  doc.text(splitHw, 14, currentY);
  currentY += splitHw.length * 5;

  doc.text(
    cleanText(
      `Trợ giảng quản lý: ${selectedClass.assistant_name || 'Giáo viên'} (${
        selectedClass.assistant_phone || 'N/A'
      })`
    ),
    14,
    currentY
  );
  currentY += 6;

  // Calculate session summary metrics for PDF header
  let totalHw = 0;
  let hwCount = 0;
  let totalTest = 0;
  let testCount = 0;
  let presentCount = 0;

  const sortedStudents = sortStudentsByName(students);

  sortedStudents.forEach((s) => {
    const ss = studentSessions[s.id!] || {};
    const isAttended = !ss.attendance || ss.attendance === 'present' || ss.attendance === 'late';
    if (isAttended) {
      presentCount++;
      if (selectedSession.has_homework !== false && !(ss.exempt || ss.exempt_homework) && typeof ss.homework_score === 'number') {
        totalHw += ss.homework_score;
        hwCount++;
      }
      if (selectedSession.has_test !== false && ss.test_score !== undefined) {
        totalTest += ss.test_score;
        testCount++;
      }
    }
  });

  const avgHwText = selectedSession.has_homework !== false && hwCount > 0 ? `${(totalHw / hwCount).toFixed(1)}/10` : '';
  const avgTestText = selectedSession.has_test !== false && testCount > 0 ? `${(totalTest / testCount).toFixed(1)}/10` : '';

  doc.text(
    cleanText(
      `Sĩ số có mặt: ${presentCount}/${students.length} | Điểm TB BTVN: ${avgHwText || 'Trống'} | Điểm TB Kiểm Tra: ${avgTestText || 'Trống'}`
    ),
    14,
    currentY
  );
  currentY += 7;

  const tableRows = sortedStudents.map((s, index) => {
    const ss: Partial<StudentSession> = studentSessions[s.id!] || {
      attendance: 'present',
      homework_score: undefined,
      test_score: undefined,
      homework_submitted: true,
      custom_comment: '',
      quick_preset_comments: [],
    };

    let attText = 'Có mặt';
    if (ss.attendance === 'absent_excused') attText = 'Vắng (Có phép)';
    else if (ss.attendance === 'absent_unexcused') attText = 'Vắng (Không phép)';
    else if (ss.attendance === 'late') attText = 'Đi muộn';

    const commentStr =
      ss.custom_comment ||
      (ss.quick_preset_comments ? ss.quick_preset_comments.join('; ') : '-');

    const studentWarns = activeClassWarnings && s.id ? activeClassWarnings[s.id] : [];
    let warningText = '-';
    if (studentWarns && studentWarns.length > 0) {
      warningText = studentWarns
        .map((w) => {
          const prefix =
            w.priority === 'P1'
              ? '[P1 KHẨN CẤP]'
              : w.priority === 'Praise'
              ? '[TUYÊN DƯƠNG]'
              : '[P2 NỘI BỘ]';
          return `${prefix} ${w.warning_type}`;
        })
        .join('; ');
    }

    const isAttended = !ss.attendance || ss.attendance === 'present' || ss.attendance === 'late';

    const formatHomeworkScore = () => {
      if (selectedSession.has_homework === false) return '';
      if (!isAttended) return '-';
      if (ss.exempt || ss.exempt_homework) return 'Miễn';
      if (ss.homework_submitted === false) return 'Chưa làm';
      if (ss.late_submit) return 'Nộp muộn';
      return ss.homework_score !== undefined ? `${ss.homework_score}đ` : '';
    };

    const formatTestScore = () => {
      if (selectedSession.has_test === false) return '';
      if (!isAttended) return '-';
      if (ss.exempt || ss.exempt_test) return 'Miễn';
      if (ss.makeup_test) return ss.test_score !== undefined && ss.test_score !== null ? `${ss.test_score}đ (Bù)` : 'Chờ (Bù)';
      return ss.test_score !== undefined && ss.test_score !== null ? `${ss.test_score}đ` : '';
    };

    return [
      (index + 1).toString(),
      cleanText(s.full_name),
      cleanText(warningText),
      cleanText(attText),
      cleanText(formatHomeworkScore()),
      cleanText(formatTestScore()),
      cleanText(commentStr),
    ];
  });

  autoTable(doc, {
    startY: currentY,
    head: [
      [
        cleanText('STT'),
        cleanText('Họ và tên Học sinh'),
        cleanText('Cảnh báo / Tuyên dương'),
        cleanText('Điểm danh'),
        cleanText('Điểm BTVN'),
        cleanText('Điểm KT'),
        cleanText('Nhận xét Thầy/Cô'),
      ],
    ],
    body: tableRows,
    theme: 'grid',
    headStyles: {
      fillColor: [16, 185, 129],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      font: hasUnicode ? 'Roboto' : 'helvetica',
    },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    styles: { 
      font: hasUnicode ? 'Roboto' : 'helvetica',
      fontSize: 8.5, 
      cellPadding: 2.5,
      overflow: 'linebreak',
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 35 },
      2: { cellWidth: 32 },
      3: { cellWidth: 22, halign: 'center' },
      4: { cellWidth: 18, halign: 'center' },
      5: { cellWidth: 18, halign: 'center' },
      6: { cellWidth: 'auto' },
    },
    rowPageBreak: 'avoid',
  });

  doc.save(
    `Bao_Cao_${sanitizeVietnameseText(selectedClass.class_name).replace(
      /\s+/g,
      '_'
    )}_${selectedSession.session_date}.pdf`
  );
}

export async function exportCycleReportPDF(
  selectedClass: ClassItem,
  cycleName: string,
  dateRange: string,
  classMetrics: {
    avgAttendance: number;
    avgHomework: number;
    avgTest: number;
    totalP1: number;
    totalP2: number;
    totalPraise: number;
  },
  compiledStudents: any[]
) {
  const doc = new jsPDF();

  // Load custom Unicode fonts
  const regularFont = await getFontBase64(false);
  const boldFont = await getFontBase64(true);
  const hasUnicode = !!(regularFont && boldFont);

  if (hasUnicode) {
    doc.addFileToVFS('Roboto-Regular.ttf', regularFont!);
    doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');
    doc.addFileToVFS('Roboto-Bold.ttf', boldFont!);
    doc.addFont('Roboto-Bold.ttf', 'Roboto', 'bold');
    doc.setFont('Roboto', 'normal');
  } else {
    doc.setFont('helvetica', 'normal');
  }

  const cleanText = (text: string) => {
    return hasUnicode ? text : sanitizeVietnameseText(text);
  };

  // Header Title
  if (hasUnicode) {
    doc.setFont('Roboto', 'bold');
  } else {
    doc.setFont('helvetica', 'bold');
  }
  doc.setFontSize(16);
  doc.text(
    cleanText('SMART EDU MANAGER - BÁO CÁO CHU KỲ HỌC TẬP (4 BUỔI)'),
    14,
    15
  );

  if (hasUnicode) {
    doc.setFont('Roboto', 'normal');
  } else {
    doc.setFont('helvetica', 'normal');
  }
  doc.setFontSize(11);
  doc.text(
    cleanText(`Lớp học: ${selectedClass.class_name}`),
    14,
    23
  );
  doc.text(
    cleanText(`Chu kỳ: ${cycleName} (${dateRange || 'Chưa xác định'})`),
    14,
    29
  );
  doc.text(
    cleanText(`Trợ giảng quản lý: ${selectedClass.assistant_name || 'Giáo viên'} (${selectedClass.assistant_phone || 'N/A'})`),
    14,
    35
  );

  // Overall statistics
  doc.text(
    cleanText(
      `Chỉ số lớp - Chuyên cần TB: ${classMetrics.avgAttendance}%, TB BTVN: ${classMetrics.avgHomework}đ, TB Kiểm tra: ${classMetrics.avgTest}đ`
    ),
    14,
    43
  );
  doc.text(
    cleanText(
      `Tổng số trong chu kỳ - Cảnh báo P1: ${classMetrics.totalP1}, Cảnh báo P2: ${classMetrics.totalP2}, Tuyên dương: ${classMetrics.totalPraise}`
    ),
    14,
    49
  );

  const sortedCompiledStudents = sortStudentsByName(compiledStudents);

  const tableRows = sortedCompiledStudents.map((s, index) => {
    let statusText = 'Bình thường';
    if (s.warningStatus === 'P1') statusText = `[P1 KHẨN CẤP] ${s.warningReason}`;
    else if (s.warningStatus === 'P2') statusText = `[P2 NỘI BỘ] ${s.warningReason}`;
    else if (s.warningStatus === 'Praise') statusText = `[TUYÊN DƯƠNG] ${s.warningReason}`;

    return [
      (index + 1).toString(),
      cleanText(s.full_name),
      `${s.attendancePercent}%`,
      s.hwAvg > 0 ? `${s.hwAvg}đ` : '-',
      s.testAvg > 0 ? `${s.testAvg}đ` : '-',
      cleanText(statusText),
    ];
  });

  autoTable(doc, {
    startY: 54,
    head: [
      [
        cleanText('STT'),
        cleanText('Họ và tên Học sinh'),
        cleanText('Chuyên cần'),
        cleanText('TB BTVN'),
        cleanText('TB Kiểm tra'),
        cleanText('Đánh giá & Cảnh báo Chu kỳ'),
      ],
    ],
    body: tableRows,
    theme: 'grid',
    headStyles: {
      fillColor: [16, 185, 129],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      font: hasUnicode ? 'Roboto' : 'helvetica',
    },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    styles: { 
      font: hasUnicode ? 'Roboto' : 'helvetica',
      fontSize: 8.5, 
      cellPadding: 2.5,
      overflow: 'linebreak',
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 35 },
      2: { cellWidth: 22, halign: 'center' },
      3: { cellWidth: 20, halign: 'center' },
      4: { cellWidth: 20, halign: 'center' },
      5: { cellWidth: 'auto' },
    },
    rowPageBreak: 'avoid',
  });

  doc.save(
    `Bao_Cao_Chu_Ky_${sanitizeVietnameseText(selectedClass.class_name).replace(
      /\s+/g,
      '_'
    )}_${sanitizeVietnameseText(cycleName).replace(/\s+/g, '_')}.pdf`
  );
}
