/**
 * Test & Verification Suite for the Batch Report Generator Module
 * 
 * Programmatically verifies:
 * 1. Data fetching and entity association for dummy classes and students.
 * 2. Schema compliance and strict non-NaN validation before UI state dispatch.
 * 3. Batch PDF slip formatting (single-session & multi-student).
 * 4. Gradebook Excel Matrix dataset compilation (full cycle & single session).
 * 5. Edge case handling (exemptions, lifecycle join dates, unexcused absences, missing notes).
 */

import { ClassItem, Session, Student, StudentSession, KnowledgeTag, Warning, ClassStudent } from '../types';
import { calculateStudentCycleGrades, StudentGradeBreakdown } from '../lib/calculations';
import { sortStudentsByName } from '../utils/sortUtils';
import { ExportMatrixOptions } from '../utils/excelMatrixExporter';

// ============================================================================
// 1. DUMMY DATASET FIXTURES
// ============================================================================

export const DUMMY_CLASS: ClassItem = {
  id: 'cls_dummy_9a1',
  school_year_id: 'sy_2025_2026',
  class_name: '9A1 - Chuyên Ôn Thi Vào 10',
  grade_level: 9,
  class_type: 'specialized',
  target_description: 'Mục tiêu: Đạt 8.5+ Toán Chuyên & Công Lập',
  schedule: 'Thứ 3 (18h-20h), Chủ Nhật (14h-16h)',
  assistant_name: 'Nguyễn Văn Hùng (Trợ giảng)',
  assistant_phone: '0988.123.456',
  status: 'active',
  is_demo: true,
  created_at: '2025-08-01T08:00:00.000Z',
  updated_at: '2025-08-01T08:00:00.000Z',
};

export const DUMMY_STUDENTS: Student[] = [
  {
    id: 'st_001',
    full_name: 'Nguyễn An Bình',
    gender: 'Nam',
    birthday: '2010-03-15',
    phone: '0912.345.671',
    parent_name: 'Nguyễn Văn An',
    parent_phone: '0903.111.222',
    status: 'studying',
    created_at: '2025-08-01T08:00:00.000Z',
    updated_at: '2025-08-01T08:00:00.000Z',
  },
  {
    id: 'st_002',
    full_name: 'Trần Bảo Châu',
    gender: 'Nữ',
    birthday: '2010-07-22',
    phone: '0912.345.672',
    parent_name: 'Trần Quốc Bảo',
    parent_phone: '0903.333.444',
    status: 'studying',
    created_at: '2025-08-01T08:00:00.000Z',
    updated_at: '2025-08-01T08:00:00.000Z',
  },
  {
    id: 'st_003',
    full_name: 'Phạm Đăng Khoa',
    gender: 'Nam',
    birthday: '2010-11-05',
    phone: '0912.345.673',
    parent_name: 'Phạm Văn Đăng',
    parent_phone: '0903.555.666',
    status: 'studying',
    created_at: '2025-08-01T08:00:00.000Z',
    updated_at: '2025-08-01T08:00:00.000Z',
  },
  {
    id: 'st_004',
    full_name: 'Lê Hoàng Yến',
    gender: 'Nữ',
    birthday: '2010-09-18',
    phone: '0912.345.674',
    parent_name: 'Lê Minh Hoàng',
    parent_phone: '0903.777.888',
    status: 'studying',
    created_at: '2025-08-10T08:00:00.000Z',
    updated_at: '2025-08-10T08:00:00.000Z',
  },
];

export const DUMMY_CLASS_STUDENTS: ClassStudent[] = [
  { id: 'cs_001', class_id: 'cls_dummy_9a1', student_id: 'st_001', join_date: '2025-08-01', created_at: '2025-08-01T08:00:00.000Z' },
  { id: 'cs_002', class_id: 'cls_dummy_9a1', student_id: 'st_002', join_date: '2025-08-01', created_at: '2025-08-01T08:00:00.000Z' },
  { id: 'cs_003', class_id: 'cls_dummy_9a1', student_id: 'st_003', join_date: '2025-08-01', created_at: '2025-08-01T08:00:00.000Z' },
  // Student 4 joined starting from Session 2 ('2025-08-08')
  { id: 'cs_004', class_id: 'cls_dummy_9a1', student_id: 'st_004', join_date: '2025-08-08', created_at: '2025-08-08T08:00:00.000Z' },
];

export const DUMMY_KNOWLEDGE_TAGS: KnowledgeTag[] = [
  {
    id: 'tag_001',
    grade_level: 9,
    category: 'Algebra',
    tag_name: 'Căn thức bậc hai và rút gọn biểu thức',
    created_at: '2025-08-01T08:00:00.000Z',
  },
  {
    id: 'tag_002',
    grade_level: 9,
    category: 'Geometry',
    tag_name: 'Hệ thức lượng trong tam giác vuông',
    created_at: '2025-08-01T08:00:00.000Z',
  },
];

export const DUMMY_SESSIONS: Session[] = [
  {
    id: 'sess_001',
    class_id: 'cls_dummy_9a1',
    session_date: '2025-08-03',
    lesson_title: 'Buổi 1: Căn thức bậc hai & Rút gọn biểu thức chứa căn',
    chapter: 'Chương 1: Căn bậc hai',
    knowledge_tag_id: 'tag_001',
    homework_description: 'Bài tập SGK trang 15 bài 1 đến 5',
    has_homework: true,
    has_test: true,
    test_knowledge_tag: 'tag_001',
    created_at: '2025-08-03T08:00:00.000Z',
    updated_at: '2025-08-03T08:00:00.000Z',
  },
  {
    id: 'sess_002',
    class_id: 'cls_dummy_9a1',
    session_date: '2025-08-10',
    lesson_title: 'Buổi 2: Hệ thức lượng trong tam giác vuông cơ bản',
    chapter: 'Chương 1: Hệ thức lượng',
    knowledge_tag_id: 'tag_002',
    homework_description: 'Phiếu bài tập số 2 (Hình học)',
    has_homework: true,
    has_test: true,
    test_knowledge_tag: 'tag_002',
    created_at: '2025-08-10T08:00:00.000Z',
    updated_at: '2025-08-10T08:00:00.000Z',
  },
];

export const DUMMY_STUDENT_SESSIONS: StudentSession[] = [
  // Session 1:
  {
    id: 'ss_001',
    student_id: 'st_001',
    session_id: 'sess_001',
    attendance: 'present',
    homework_score: 9.0,
    test_score: 8.5,
    homework_submitted: true,
    late_submit: false,
    makeup_test: false,
    exempt: false,
    exempt_homework: false,
    exempt_test: false,
    quick_preset_comments: ['Nắm vững lý thuyết căn bậc hai', 'Trình bày cẩn thận'],
    custom_comment: 'Con tiếp thu rất nhanh, làm bài kiểm tra đạt điểm tốt.',
    updated_at: '2025-08-03T10:00:00.000Z',
  },
  {
    id: 'ss_002',
    student_id: 'st_002',
    session_id: 'sess_001',
    attendance: 'absent_excused',
    homework_score: 8.0,
    test_score: 7.5,
    homework_submitted: true,
    late_submit: true,
    makeup_test: true,
    exempt: false,
    exempt_homework: false,
    exempt_test: false,
    quick_preset_comments: ['Có phép vắng', 'Đã kiểm tra bù đầy đủ'],
    custom_comment: 'Vắng có phép do bị ốm, đã chủ động làm bài bù đạt 7.5đ.',
    updated_at: '2025-08-03T10:00:00.000Z',
  },
  {
    id: 'ss_003',
    student_id: 'st_003',
    session_id: 'sess_001',
    attendance: 'absent_unexcused',
    homework_score: 0,
    test_score: 0,
    homework_submitted: false,
    late_submit: false,
    makeup_test: false,
    exempt: false,
    exempt_homework: false,
    exempt_test: false,
    quick_preset_comments: ['Vắng không phép'],
    custom_comment: 'Vắng không phép, không nộp bài tập về nhà.',
    updated_at: '2025-08-03T10:00:00.000Z',
  },
  // st_004 not joined yet in Session 1

  // Session 2:
  {
    id: 'ss_004',
    student_id: 'st_001',
    session_id: 'sess_002',
    attendance: 'present',
    homework_score: 9.5,
    test_score: 9.0,
    homework_submitted: true,
    late_submit: false,
    makeup_test: false,
    exempt: false,
    quick_preset_comments: ['Giải toán hình học sáng tạo'],
    custom_comment: 'Làm tốt các bài toán nâng cao về hệ thức lượng.',
    updated_at: '2025-08-10T10:00:00.000Z',
  },
  {
    id: 'ss_005',
    student_id: 'st_002',
    session_id: 'sess_002',
    attendance: 'present',
    homework_score: 8.5,
    test_score: 8.0,
    homework_submitted: true,
    late_submit: false,
    makeup_test: false,
    exempt: false,
    quick_preset_comments: ['Tiến bộ rõ rệt'],
    custom_comment: 'Học tập chuyên cần, điểm số duy trì khá tốt.',
    updated_at: '2025-08-10T10:00:00.000Z',
  },
  {
    id: 'ss_006',
    student_id: 'st_003',
    session_id: 'sess_002',
    attendance: 'present',
    homework_score: 6.0,
    test_score: 5.5,
    homework_submitted: true,
    late_submit: false,
    makeup_test: false,
    exempt: false,
    quick_preset_comments: ['Cần tập trung hơn'],
    custom_comment: 'Đã đi học lại, cần bổ sung phần kiến thức bài trước bị hổng.',
    updated_at: '2025-08-10T10:00:00.000Z',
  },
  {
    id: 'ss_007',
    student_id: 'st_004',
    session_id: 'sess_002',
    attendance: 'present',
    homework_score: 8.0,
    test_score: 8.0,
    homework_submitted: true,
    late_submit: false,
    makeup_test: false,
    exempt: false,
    exempt_homework: false,
    exempt_test: false,
    quick_preset_comments: ['Buổi đầu nhập học hòa nhập tốt'],
    custom_comment: 'Buổi đầu gia nhập lớp, nắm bài tốt.',
    updated_at: '2025-08-10T10:00:00.000Z',
  },
];

export const DUMMY_WARNINGS: Warning[] = [
  {
    id: 'warn_001',
    student_id: 'st_003',
    class_id: 'cls_dummy_9a1',
    priority: 'P1',
    warning_type: 'absence_unexcused',
    reason: 'Học sinh vắng không phép buổi 1 ngày 03/08/2025',
    resolved: false,
    created_at: '2025-08-03T10:00:00.000Z',
    updated_at: '2025-08-03T10:00:00.000Z',
  },
];

// ============================================================================
// 2. SCHEMA CONTRACTS & OUTPUT TYPES
// ============================================================================

export interface BatchReportFetchedData {
  targetClass: ClassItem;
  sortedStudents: Student[];
  sortedSessions: Session[];
  studentSessions: StudentSession[];
  classStudents: ClassStudent[];
  knowledgeTags: KnowledgeTag[];
  warnings: Warning[];
  classStats: {
    totalStudents: number;
    activeStudentsCount: number;
    avgHomeworkScore: number | null;
    avgTestScore: number | null;
    attendanceRate: number; // 0 - 100%
  };
}

export interface FormattedStudentSlip {
  studentId: string;
  studentName: string;
  parentPhone: string;
  attendanceStatus: string;
  homeworkScoreFormatted: string;
  testScoreFormatted: string;
  comments: string;
  knowledgeTagName: string;
  warningsCount: number;
}

export interface FormattedExcelRow {
  stt: number;
  fullName: string;
  parentPhone: string;
  sessionColumns: Record<string, string | number>;
  attendanceSummary: number;
  avgHomework: string;
  avgTest: string;
  weightedAverage: string;
  classification: string;
}

export interface ValidationReport {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  assertionsPassed: number;
  assertionsFailed: number;
}

// ============================================================================
// 3. CORE REPORT MODULE PROCESSING FUNCTIONS
// ============================================================================

/**
 * Fetches, filters, and standardizes batch report data for a class.
 */
export function fetchAndFormatBatchReportData(
  targetClass: ClassItem,
  students: Student[],
  sessions: Session[],
  studentSessions: StudentSession[],
  classStudents: ClassStudent[] = [],
  knowledgeTags: KnowledgeTag[] = [],
  warnings: Warning[] = []
): BatchReportFetchedData {
  // 1. Sort students alphabetically according to Vietnamese rules
  const sortedStudents = sortStudentsByName(students);

  // 2. Sort sessions chronologically
  const sortedSessions = [...sessions].sort((a, b) => a.session_date.localeCompare(b.session_date));

  // 3. Filter student sessions belonging only to this class's sessions
  const sessionIds = new Set(sortedSessions.map((s) => s.id));
  const filteredStudentSessions = studentSessions.filter((ss) => sessionIds.has(ss.session_id));

  // 4. Calculate Aggregate Class-Level Metrics with zero NaN risk
  const validHwScores = filteredStudentSessions
    .map((ss) => ss.homework_score)
    .filter((v): v is number => typeof v === 'number' && !isNaN(v) && v >= 0);

  const validTestScores = filteredStudentSessions
    .map((ss) => ss.test_score)
    .filter((v): v is number => typeof v === 'number' && !isNaN(v) && v >= 0);

  const avgHomeworkScore =
    validHwScores.length > 0
      ? Number((validHwScores.reduce((a, b) => a + b, 0) / validHwScores.length).toFixed(1))
      : null;

  const avgTestScore =
    validTestScores.length > 0
      ? Number((validTestScores.reduce((a, b) => a + b, 0) / validTestScores.length).toFixed(1))
      : null;

  const presentCount = filteredStudentSessions.filter(
    (ss) => !ss.attendance || ss.attendance === 'present' || ss.attendance === 'late'
  ).length;

  const attendanceRate =
    filteredStudentSessions.length > 0
      ? Number(((presentCount / filteredStudentSessions.length) * 100).toFixed(1))
      : 0;

  return {
    targetClass,
    sortedStudents,
    sortedSessions,
    studentSessions: filteredStudentSessions,
    classStudents,
    knowledgeTags,
    warnings,
    classStats: {
      totalStudents: students.length,
      activeStudentsCount: sortedStudents.filter((s) => s.status === 'studying').length,
      avgHomeworkScore,
      avgTestScore,
      attendanceRate,
    },
  };
}

/**
 * Validates the fetched Batch Report schema and verifies non-NaN safety.
 */
export function validateBatchReportSchema(data: BatchReportFetchedData): ValidationReport {
  const errors: string[] = [];
  const warningsList: string[] = [];
  let passed = 0;
  let failed = 0;

  const assert = (condition: boolean, errorMsg: string, isWarning = false) => {
    if (condition) {
      passed++;
    } else {
      failed++;
      if (isWarning) {
        warningsList.push(errorMsg);
      } else {
        errors.push(errorMsg);
      }
    }
  };

  // Class Validations
  assert(!!data.targetClass?.id, 'Target class ID must be defined and non-empty');
  assert(!!data.targetClass?.class_name, 'Target class name must be defined');
  assert([6, 7, 8, 9].includes(data.targetClass?.grade_level), 'Grade level must be between 6 and 9');

  // Students Validations
  assert(Array.isArray(data.sortedStudents) && data.sortedStudents.length > 0, 'Students list cannot be empty');
  data.sortedStudents.forEach((st, idx) => {
    assert(!!st.id, `Student at index ${idx} must have a valid ID`);
    assert(typeof st.full_name === 'string' && st.full_name.trim().length > 0, `Student ${st.id} has invalid name`);
    assert(st.gender === 'Nam' || st.gender === 'Nữ', `Student ${st.full_name} has invalid gender`);
  });

  // Sessions Validations
  assert(Array.isArray(data.sortedSessions) && data.sortedSessions.length > 0, 'Sessions list cannot be empty');
  data.sortedSessions.forEach((sess, idx) => {
    assert(!!sess.id, `Session at index ${idx} must have an ID`);
    assert(/^\d{4}-\d{2}-\d{2}$/.test(sess.session_date), `Session ${sess.id} date format must be YYYY-MM-DD`);
    assert(typeof sess.lesson_title === 'string', `Session ${sess.id} must have a lesson title`);
  });

  // StudentSessions Validations (Non-NaN check)
  data.studentSessions.forEach((ss) => {
    if (typeof ss.homework_score === 'number') {
      assert(!isNaN(ss.homework_score), `Homework score for student ${ss.student_id} in session ${ss.session_id} is NaN`);
      assert(ss.homework_score >= 0 && ss.homework_score <= 10, `Homework score must be between 0 and 10`);
    }
    if (typeof ss.test_score === 'number') {
      assert(!isNaN(ss.test_score), `Test score for student ${ss.student_id} in session ${ss.session_id} is NaN`);
      assert(ss.test_score >= 0 && ss.test_score <= 10, `Test score must be between 0 and 10`);
    }
  });

  // Stats Validations (Non-NaN check)
  if (data.classStats.avgHomeworkScore !== null) {
    assert(!isNaN(data.classStats.avgHomeworkScore), 'Class average homework score cannot be NaN');
  }
  if (data.classStats.avgTestScore !== null) {
    assert(!isNaN(data.classStats.avgTestScore), 'Class average test score cannot be NaN');
  }
  assert(!isNaN(data.classStats.attendanceRate), 'Attendance rate cannot be NaN');
  assert(
    data.classStats.attendanceRate >= 0 && data.classStats.attendanceRate <= 100,
    'Attendance rate must be between 0% and 100%'
  );

  return {
    isValid: errors.length === 0,
    errors,
    warnings: warningsList,
    assertionsPassed: passed,
    assertionsFailed: failed,
  };
}

/**
 * Formats single-session report slips for PDF generation.
 */
export function formatSingleSessionReportSlips(
  data: BatchReportFetchedData,
  sessionId: string
): FormattedStudentSlip[] {
  const targetSession = data.sortedSessions.find((s) => s.id === sessionId);
  if (!targetSession) {
    throw new Error(`Session with ID ${sessionId} not found in class ${data.targetClass.class_name}`);
  }

  const sessionTag = data.knowledgeTags.find((t) => t.id === targetSession.knowledge_tag_id);
  const tagDisplayName = sessionTag ? sessionTag.tag_name : targetSession.chapter || '-';

  return data.sortedStudents.map((st) => {
    const rec = data.studentSessions.find((ss) => ss.student_id === st.id && ss.session_id === sessionId);
    const link = data.classStudents.find((cs) => cs.student_id === st.id && cs.class_id === data.targetClass.id);

    // Lifecycle check
    const isBeforeJoin = link?.join_date && targetSession.session_date < link.join_date;
    const isAfterLeave = link?.leave_date && targetSession.session_date > link.leave_date;

    let attendanceStr = 'Có mặt';
    let hwFormatted = '-';
    let testFormatted = '-';

    if (isBeforeJoin) {
      attendanceStr = 'Chưa nhập học';
    } else if (isAfterLeave) {
      attendanceStr = 'Đã thôi học';
    } else if (!rec) {
      attendanceStr = 'Chưa có dữ liệu';
    } else {
      switch (rec.attendance) {
        case 'absent_excused':
          attendanceStr = 'Vắng (Có phép)';
          break;
        case 'absent_unexcused':
          attendanceStr = 'Vắng (Không phép)';
          break;
        case 'late':
          attendanceStr = 'Đi muộn';
          break;
        case 'present':
        default:
          attendanceStr = 'Có mặt';
          break;
      }

      // HW Score
      if (rec.exempt || rec.exempt_homework) {
        hwFormatted = 'Miễn nộp';
      } else if (typeof rec.homework_score === 'number' && !isNaN(rec.homework_score)) {
        hwFormatted = `${rec.homework_score.toFixed(1)}/10`;
      } else if (rec.homework_submitted === false) {
        hwFormatted = 'Chưa nộp (0đ)';
      }

      // Test Score
      if (rec.exempt || rec.exempt_test) {
        testFormatted = 'Miễn KT';
      } else if (typeof rec.test_score === 'number' && !isNaN(rec.test_score)) {
        testFormatted = `${rec.test_score.toFixed(1)}/10`;
      } else if (rec.makeup_test) {
        testFormatted = 'Chờ KT bù';
      }
    }

    const commentParts: string[] = [];
    if (rec?.quick_preset_comments && rec.quick_preset_comments.length > 0) {
      commentParts.push(rec.quick_preset_comments.join('; '));
    }
    if (rec?.custom_comment) {
      commentParts.push(rec.custom_comment);
    }

    const stWarnings = data.warnings.filter((w) => w.student_id === st.id);

    return {
      studentId: st.id!,
      studentName: st.full_name,
      parentPhone: st.parent_phone || '-',
      attendanceStatus: attendanceStr,
      homeworkScoreFormatted: hwFormatted,
      testScoreFormatted: testFormatted,
      comments: commentParts.join(' | ') || 'Hoàn thành tốt nhiệm vụ buổi học.',
      knowledgeTagName: tagDisplayName,
      warningsCount: stWarnings.length,
    };
  });
}

/**
 * Formats multi-session Gradebook Excel rows and summary metrics.
 */
export function formatExcelMatrixDataset(
  data: BatchReportFetchedData,
  options: ExportMatrixOptions = { exportScope: 'full_cycle' }
): { headers: string[]; rows: FormattedExcelRow[] } {
  const headers = ['STT', 'Họ và tên'];
  if (options.includeParentPhone) {
    headers.push('SĐT Phụ huynh');
  }

  const targetSessions =
    options.exportScope === 'single_session' && options.selectedSessionId
      ? data.sortedSessions.filter((s) => s.id === options.selectedSessionId)
      : data.sortedSessions;

  targetSessions.forEach((sess, idx) => {
    const sDate = sess.session_date.slice(5);
    headers.push(`B${idx + 1} (${sDate}) - Điểm danh`);
    if (sess.has_homework !== false) headers.push(`B${idx + 1} (${sDate}) - BTVN`);
    if (sess.has_test !== false) headers.push(`B${idx + 1} (${sDate}) - Bài KT`);
    if (options.includeComments) headers.push(`B${idx + 1} (${sDate}) - Nhận xét`);
  });

  headers.push('Chuyên cần (Buổi)', 'TB BTVN (30%)', 'TB KT (70%)', 'TB Tổng Hợp Chu Kỳ', 'Xếp loại');

  const rows: FormattedExcelRow[] = data.sortedStudents.map((st, idx) => {
    const link = data.classStudents.find((cs) => cs.student_id === st.id && cs.class_id === data.targetClass.id);
    const breakdown: StudentGradeBreakdown = calculateStudentCycleGrades(
      st.id!,
      data.sortedSessions,
      data.studentSessions,
      link
    );

    const sessionCols: Record<string, string | number> = {};

    targetSessions.forEach((sess, sIdx) => {
      const detail = breakdown.sessionDetails.find((d) => d.sessionId === sess.id);
      const prefix = `B${sIdx + 1}`;

      if (!detail) {
        sessionCols[`${prefix}_att`] = '-';
        if (sess.has_homework !== false) sessionCols[`${prefix}_hw`] = '-';
        if (sess.has_test !== false) sessionCols[`${prefix}_test`] = '-';
        if (options.includeComments) sessionCols[`${prefix}_cmt`] = '-';
        return;
      }

      // Attendance
      let att = 'Có mặt';
      if (detail.attendance === 'absent_excused') att = 'Vắng (CP)';
      else if (detail.attendance === 'absent_unexcused') att = 'Vắng (KP)';
      else if (detail.attendance === 'late') att = 'Đi muộn';
      else if (detail.attendance === 'not_joined') att = 'Chưa học';
      sessionCols[`${prefix}_att`] = att;

      // HW
      if (sess.has_homework !== false) {
        if (detail.hwStatus === 'exempt' || detail.hwStatus === 'excused_exempt') sessionCols[`${prefix}_hw`] = 'Miễn';
        else if (detail.hwStatus === 'not_joined') sessionCols[`${prefix}_hw`] = '-';
        else if (typeof detail.hwScore === 'number') sessionCols[`${prefix}_hw`] = detail.hwScore;
        else sessionCols[`${prefix}_hw`] = 0;
      }

      // Test
      if (sess.has_test !== false) {
        if (detail.testStatus === 'exempt') sessionCols[`${prefix}_test`] = 'Miễn';
        else if (detail.testStatus === 'pending_makeup') sessionCols[`${prefix}_test`] = 'Chờ bù';
        else if (detail.testStatus === 'not_joined') sessionCols[`${prefix}_test`] = '-';
        else if (typeof detail.testScore === 'number') sessionCols[`${prefix}_test`] = detail.testScore;
        else sessionCols[`${prefix}_test`] = 0;
      }

      // Comment
      if (options.includeComments) {
        sessionCols[`${prefix}_cmt`] = detail.comment || '-';
      }
    });

    // Classification
    let rank = 'Chưa xếp loại';
    if (breakdown.weightedAverage !== null) {
      const avg = breakdown.weightedAverage;
      if (avg >= 8.5) rank = 'Giỏi (Xuất sắc)';
      else if (avg >= 7.0) rank = 'Khá';
      else if (avg >= 5.0) rank = 'Trung bình';
      else rank = 'Cần phụ đạo thêm';
    }

    return {
      stt: idx + 1,
      fullName: st.full_name,
      parentPhone: st.parent_phone || '-',
      sessionColumns: sessionCols,
      attendanceSummary: breakdown.presentCount + breakdown.lateCount,
      avgHomework: breakdown.hwAverage !== null ? breakdown.hwAverage.toFixed(1) : '-',
      avgTest: breakdown.testAverage !== null ? breakdown.testAverage.toFixed(1) : '-',
      weightedAverage: breakdown.weightedAverage !== null ? breakdown.weightedAverage.toFixed(1) : '-',
      classification: rank,
    };
  });

  return { headers, rows };
}

// ============================================================================
// 4. PROGRAMMATIC TEST SUITE RUNNER
// ============================================================================

export function runReportModuleTests(): { success: boolean; report: string } {
  const logLines: string[] = [];
  logLines.push('===============================================================');
  logLines.push('🚀 RUNNING BATCH REPORT GENERATOR UNIT & SCHEMA VERIFICATION 🚀');
  logLines.push('===============================================================');

  let passedTests = 0;
  let failedTests = 0;

  const test = (testName: string, testFn: () => void) => {
    try {
      testFn();
      passedTests++;
      logLines.push(`  ✅ [PASS] ${testName}`);
    } catch (err: any) {
      failedTests++;
      logLines.push(`  ❌ [FAIL] ${testName}: ${err?.message || err}`);
    }
  };

  // Test 1: Fetch & Association
  test('Data Fetching & Schema Association for Dummy Class', () => {
    const fetched = fetchAndFormatBatchReportData(
      DUMMY_CLASS,
      DUMMY_STUDENTS,
      DUMMY_SESSIONS,
      DUMMY_STUDENT_SESSIONS,
      DUMMY_CLASS_STUDENTS,
      DUMMY_KNOWLEDGE_TAGS,
      DUMMY_WARNINGS
    );

    if (fetched.sortedStudents.length !== 4) {
      throw new Error(`Expected 4 students, got ${fetched.sortedStudents.length}`);
    }
    if (fetched.sortedSessions.length !== 2) {
      throw new Error(`Expected 2 sessions, got ${fetched.sortedSessions.length}`);
    }
    if (fetched.studentSessions.length !== 7) {
      throw new Error(`Expected 7 student sessions, got ${fetched.studentSessions.length}`);
    }
    if (fetched.classStats.totalStudents !== 4) {
      throw new Error('Incorrect class size calculation');
    }
    if (fetched.classStats.avgHomeworkScore === null || isNaN(fetched.classStats.avgHomeworkScore)) {
      throw new Error('Average homework score calculation returned invalid NaN or null');
    }
  });

  // Test 2: Vietnamese Sorting Order
  test('Vietnamese Student Name Sorting Verification', () => {
    const sorted = sortStudentsByName(DUMMY_STUDENTS);
    // Expected order by First Name: An Bình (Bình) -> Bảo Châu (Châu) -> Đăng Khoa (Khoa) -> Hoàng Yến (Yến)
    if (sorted[0].full_name !== 'Nguyễn An Bình') {
      throw new Error(`Expected first student to be Nguyễn An Bình, got ${sorted[0].full_name}`);
    }
    if (sorted[sorted.length - 1].full_name !== 'Lê Hoàng Yến') {
      throw new Error(`Expected last student to be Lê Hoàng Yến, got ${sorted[sorted.length - 1].full_name}`);
    }
  });

  // Test 3: Schema Validation Gatekeeper
  test('Schema Validation Gatekeeper & NaN Safety Assertion', () => {
    const fetched = fetchAndFormatBatchReportData(
      DUMMY_CLASS,
      DUMMY_STUDENTS,
      DUMMY_SESSIONS,
      DUMMY_STUDENT_SESSIONS,
      DUMMY_CLASS_STUDENTS,
      DUMMY_KNOWLEDGE_TAGS,
      DUMMY_WARNINGS
    );

    const validation = validateBatchReportSchema(fetched);
    if (!validation.isValid) {
      throw new Error(`Validation failed with errors: ${validation.errors.join(', ')}`);
    }
    if (validation.assertionsFailed > 0) {
      throw new Error(`${validation.assertionsFailed} schema assertions failed`);
    }
  });

  // Test 4: Single Session Report Slips Formatting
  test('Single Session PDF Report Slips Data Formatting', () => {
    const fetched = fetchAndFormatBatchReportData(
      DUMMY_CLASS,
      DUMMY_STUDENTS,
      DUMMY_SESSIONS,
      DUMMY_STUDENT_SESSIONS,
      DUMMY_CLASS_STUDENTS,
      DUMMY_KNOWLEDGE_TAGS,
      DUMMY_WARNINGS
    );

    const slipsSess1 = formatSingleSessionReportSlips(fetched, 'sess_001');
    if (slipsSess1.length !== 4) {
      throw new Error(`Expected 4 student slips for session 1, got ${slipsSess1.length}`);
    }

    // Student 1 (Top student): 9.0 HW, 8.5 Test
    const s1 = slipsSess1.find((s) => s.studentId === 'st_001');
    if (!s1 || s1.homeworkScoreFormatted !== '9.0/10' || s1.testScoreFormatted !== '8.5/10') {
      throw new Error(`Student 1 slip scores formatted incorrectly: ${JSON.stringify(s1)}`);
    }

    // Student 4 (Not joined yet in Sess 1)
    const s4 = slipsSess1.find((s) => s.studentId === 'st_004');
    if (!s4 || s4.attendanceStatus !== 'Chưa nhập học') {
      throw new Error(`Student 4 lifecycle before-join status incorrect: ${s4?.attendanceStatus}`);
    }
  });

  // Test 5: Excel Matrix Multi-Session Dataset Formatting
  test('Gradebook Excel Matrix Exporter Schema & Calculations', () => {
    const fetched = fetchAndFormatBatchReportData(
      DUMMY_CLASS,
      DUMMY_STUDENTS,
      DUMMY_SESSIONS,
      DUMMY_STUDENT_SESSIONS,
      DUMMY_CLASS_STUDENTS,
      DUMMY_KNOWLEDGE_TAGS,
      DUMMY_WARNINGS
    );

    const { headers, rows } = formatExcelMatrixDataset(fetched, {
      exportScope: 'full_cycle',
      includeComments: true,
      includeParentPhone: true,
    });

    if (!headers.includes('STT') || !headers.includes('Họ và tên') || !headers.includes('TB Tổng Hợp Chu Kỳ')) {
      throw new Error('Excel headers missing critical columns');
    }

    if (rows.length !== 4) {
      throw new Error(`Expected 4 rows in Excel export, got ${rows.length}`);
    }

    // Check student 1 weighted average: HW avg = 9.25 (30%), Test avg = 8.75 (70%) => 9.25*0.3 + 8.75*0.7 = 2.775 + 6.125 = 8.9
    const row1 = rows.find((r) => r.fullName === 'Nguyễn An Bình');
    if (!row1 || row1.weightedAverage !== '8.9' || row1.classification !== 'Giỏi (Xuất sắc)') {
      throw new Error(`Student 1 calculation mismatch: got weightedAvg=${row1?.weightedAverage}, rank=${row1?.classification}`);
    }
  });

  // Test 6: Anomaly & Corrupt Data Rejection
  test('Rejection of Corrupt/Corrupted Schema with NaN', () => {
    const corruptData: BatchReportFetchedData = {
      targetClass: { ...DUMMY_CLASS, grade_level: 5 as any }, // Invalid grade level
      sortedStudents: [],
      sortedSessions: [],
      studentSessions: [],
      classStudents: [],
      knowledgeTags: [],
      warnings: [],
      classStats: {
        totalStudents: 0,
        activeStudentsCount: 0,
        avgHomeworkScore: NaN, // Dangerous NaN
        avgTestScore: NaN,
        attendanceRate: 150, // Invalid rate > 100%
      },
    };

    const result = validateBatchReportSchema(corruptData);
    if (result.isValid) {
      throw new Error('Corrupt data passed validation when it should have failed');
    }
    if (result.errors.length === 0) {
      throw new Error('Expected validation errors for corrupt dataset, but error list is empty');
    }
  });

  logLines.push('---------------------------------------------------------------');
  logLines.push(`Summary: ${passedTests} passed, ${failedTests} failed out of ${passedTests + failedTests} tests.`);
  logLines.push('===============================================================');

  const reportText = logLines.join('\n');
  return {
    success: failedTests === 0,
    report: reportText,
  };
}

// Automatically execute and log results when run via tsx/cli
if (typeof process !== 'undefined' && process.argv && process.argv[1]?.includes('testReportModule')) {
  const result = runReportModuleTests();
  console.log(result.report);
  if (!result.success) {
    process.exit(1);
  }
}
