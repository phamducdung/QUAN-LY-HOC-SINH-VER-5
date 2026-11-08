import * as XLSX from 'xlsx';
import { ClassItem, Session, Student, StudentSession, KnowledgeTag } from '../types';
import { calculateStudentCycleGrades } from '../lib/calculations';
import { sortStudentsByName } from './sortUtils';
import { sanitizeVietnameseText } from './pdfGenerator';

export interface ExportMatrixOptions {
  includeComments?: boolean;
  includeParentPhone?: boolean;
  includeKnowledgeSummary?: boolean;
  exportScope: 'full_cycle' | 'single_session';
  selectedSessionId?: string | number;
}

/**
 * Generates and downloads a multi-dimensional Gradebook Matrix in Excel format
 */
export async function exportGradebookMatrixToExcel(
  currentClass: ClassItem,
  sessions: Session[],
  students: Student[],
  studentSessions: StudentSession[],
  classStudents: { student_id?: string | number; class_id?: string | number; join_date?: string; leave_date?: string }[] = [],
  options: ExportMatrixOptions = { exportScope: 'full_cycle' }
): Promise<void> {
  const sortedStudents = sortStudentsByName(students);
  const sortedSessions = [...sessions].sort((a, b) => (a.session_date > b.session_date ? 1 : -1));

  const workbook = XLSX.utils.book_new();

  // -------------------------------------------------------------
  // SHEET 1: MA TRẬN SỔ ĐIỂM CHI TIẾT
  // -------------------------------------------------------------
  const matrixHeadersRow1: string[] = ['STT', 'Họ và tên'];
  if (options.includeParentPhone) {
    matrixHeadersRow1.push('SĐT Phụ huynh');
  }

  // Determine target sessions
  const targetSessions =
    options.exportScope === 'single_session' && options.selectedSessionId
      ? sortedSessions.filter((s) => s.id === options.selectedSessionId)
      : sortedSessions;

  // Session headers (e.g. Buổi 1 (12/09) - BT, KT, Điểm danh)
  targetSessions.forEach((sess, idx) => {
    const sDate = sess.session_date ? sess.session_date.slice(5) : `B${idx + 1}`;
    matrixHeadersRow1.push(`B${idx + 1} (${sDate}) - Điểm danh`);
    if (sess.has_homework !== false) {
      matrixHeadersRow1.push(`B${idx + 1} (${sDate}) - BTVN`);
    }
    if (sess.has_test !== false) {
      matrixHeadersRow1.push(`B${idx + 1} (${sDate}) - Bài KT`);
    }
    if (options.includeComments) {
      matrixHeadersRow1.push(`B${idx + 1} (${sDate}) - Nhận xét`);
    }
  });

  // Summary Metrics headers
  matrixHeadersRow1.push('Chuyên cần (Buổi)', 'TB BTVN (30%)', 'TB KT (70%)', 'TB Tổng Hợp Chu Kỳ', 'Xếp loại');

  // Compute breakdown for each student
  const rowsData: any[][] = [];

  sortedStudents.forEach((st, sIdx) => {
    const link = classStudents.find((cs) => cs.student_id === st.id && cs.class_id === currentClass.id);
    const breakdown = calculateStudentCycleGrades(st.id!, sessions, studentSessions, link);

    const row: any[] = [sIdx + 1, st.full_name];
    if (options.includeParentPhone) {
      row.push(st.parent_phone || '-');
    }

    targetSessions.forEach((sess) => {
      const detail = breakdown.sessionDetails.find((d) => d.sessionId === sess.id);
      if (!detail) {
        row.push('-');
        if (sess.has_homework !== false) row.push('-');
        if (sess.has_test !== false) row.push('-');
        if (options.includeComments) row.push('-');
        return;
      }

      // Attendance display
      let attDisplay = 'Có mặt';
      if (detail.attendance === 'absent_excused') attDisplay = 'Vắng (CP)';
      else if (detail.attendance === 'absent_unexcused') attDisplay = 'Vắng (KP - 0đ)';
      else if (detail.attendance === 'late') attDisplay = 'Đi muộn';
      else if (detail.attendance === 'not_joined') attDisplay = detail.comment || 'Chưa học';
      row.push(attDisplay);

      // Homework display
      if (sess.has_homework !== false) {
        if (detail.hwStatus === 'exempt' || detail.hwStatus === 'excused_exempt') {
          row.push('Miễn');
        } else if (detail.hwStatus === 'unsubmitted_zero' || detail.hwStatus === 'unexcused_zero') {
          row.push(0);
        } else if (detail.hwScore !== null && detail.hwScore !== undefined) {
          row.push(detail.hwScore);
        } else {
          row.push('-');
        }
      }

      // Test display
      if (sess.has_test !== false) {
        if (detail.testStatus === 'exempt') {
          row.push('Miễn');
        } else if (detail.testStatus === 'unexcused_zero') {
          row.push(0);
        } else if (detail.testStatus === 'pending_makeup') {
          row.push('Chờ thi bù');
        } else if (detail.testScore !== null && detail.testScore !== undefined) {
          row.push(detail.testScore);
        } else {
          row.push('-');
        }
      }

      // Comment
      if (options.includeComments) {
        row.push(detail.comment || '-');
      }
    });

    // Summary calculations
    const attendedCount = breakdown.presentCount + breakdown.lateCount;
    const totalValid = breakdown.totalSessions - breakdown.notJoinedCount;
    const presentSummary = `${attendedCount}/${totalValid}`;
    const hwAvgDisplay = breakdown.hwAverage !== null ? breakdown.hwAverage : '-';
    const testAvgDisplay = breakdown.testAverage !== null ? breakdown.testAverage : '-';
    const weightedAvgDisplay = breakdown.weightedAverage !== null ? breakdown.weightedAverage : '-';

    let rankDisplay = 'Chưa xếp loại';
    if (breakdown.weightedAverage !== null) {
      if (breakdown.weightedAverage >= 8.5) rankDisplay = 'Xuất sắc';
      else if (breakdown.weightedAverage >= 7.0) rankDisplay = 'Khá giỏi';
      else if (breakdown.weightedAverage >= 5.0) rankDisplay = 'Trung bình';
      else rankDisplay = 'Cần phụ đạo thêm';
    }

    row.push(presentSummary, hwAvgDisplay, testAvgDisplay, weightedAvgDisplay, rankDisplay);
    rowsData.push(row);
  });

  // Create Title info rows
  const sheetHeader = [
    [`SỔ ĐIỂM MA TRẬN TỔNG HỢP - LỚP: ${currentClass.class_name.toUpperCase()}`],
    [`Ngày xuất báo cáo: ${new Date().toLocaleDateString('vi-VN')} | Tổng số học sinh: ${students.length} | Tổng số buổi: ${sessions.length}`],
    [],
    matrixHeadersRow1,
    ...rowsData,
  ];

  const mainWorksheet = XLSX.utils.aoa_to_sheet(sheetHeader);

  // Auto column widths
  const colWidths = matrixHeadersRow1.map((col, idx) => {
    if (idx === 1) return { wch: 24 }; // Full name
    if (col.includes('Nhận xét')) return { wch: 30 };
    return { wch: Math.max(col.length + 3, 12) };
  });
  mainWorksheet['!cols'] = colWidths;

  XLSX.utils.book_append_sheet(workbook, mainWorksheet, 'Ma_Tran_So_Diem');

  // -------------------------------------------------------------
  // SHEET 2: TỔNG QUAN TỪNG BUỔI HỌC (SESSION OVERVIEW)
  // -------------------------------------------------------------
  const sessionSummaryRows: any[][] = [
    ['DANH SÁCH CHI TIẾT CÁC BUỔI HỌC TRONG CHU KỲ'],
    [],
    ['STT', 'Tựa đề buổi học', 'Ngày diễn ra', 'Có BTVN', 'Có KT', 'Mô tả BTVN / Nội dung'],
  ];

  sortedSessions.forEach((sess, idx) => {
    sessionSummaryRows.push([
      idx + 1,
      sess.lesson_title,
      sess.session_date,
      sess.has_homework !== false ? 'Có' : 'Không',
      sess.has_test !== false ? 'Có' : 'Không',
      sess.homework_description || 'Không có mô tả',
    ]);
  });

  const sessionWorksheet = XLSX.utils.aoa_to_sheet(sessionSummaryRows);
  sessionWorksheet['!cols'] = [{ wch: 6 }, { wch: 35 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 45 }];
  XLSX.utils.book_append_sheet(workbook, sessionWorksheet, 'Danh_Sach_Buoi_Hoc');

  const fileName = `Ma_Tran_So_Diem_${sanitizeVietnameseText(currentClass.class_name).replace(
    /\s+/g,
    '_'
  )}_${new Date().toISOString().split('T')[0]}.xlsx`;

  XLSX.writeFile(workbook, fileName);
}
