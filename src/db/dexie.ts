import Dexie, { Table } from 'dexie';
import {
  SchoolYear,
  ClassItem,
  Student,
  ClassStudent,
  Session,
  StudentSession,
  KnowledgeTag,
  KnowledgeResult,
  Warning,
  AIDiagnosis,
  AuditLog,
  Settings,
} from '../types';

import { pushDocToFirestore, pushDocsBatchToFirestore, broadcastLocalMutation } from '../services/syncService';

export let isRemoteSyncing = false;
export function setRemoteSyncing(val: boolean) {
  isRemoteSyncing = val;
}

export async function pushBatchDocsToFirestore(tableName: string, items: any[]) {
  if (isRemoteSyncing) return;
  try {
    items.forEach(item => {
      if (item?.id) broadcastLocalMutation(tableName, 'put', item.id);
    });
    await pushDocsBatchToFirestore(tableName as any, items);
  } catch (err) {
    console.warn(`[Sync] Failed to batch push ${tableName}:`, err);
  }
}

export async function pushSingleDocToFirestore(tableName: string, docId: string | number, data: any, isDelete = false) {
  if (isRemoteSyncing) return;
  try {
    broadcastLocalMutation(tableName, isDelete ? 'delete' : 'put', docId);
    await pushDocToFirestore(tableName as any, String(docId), data, isDelete);
  } catch (err) {
    console.warn(`[Sync] Failed to push ${tableName}/${docId}:`, err);
  }
}

export class SmartEduDatabase extends Dexie {
  school_years!: Table<SchoolYear, string>;
  classes!: Table<ClassItem, string>;
  students!: Table<Student, string>;
  class_students!: Table<ClassStudent, string>;
  sessions!: Table<Session, string>;
  student_sessions!: Table<StudentSession, string>;
  knowledge_tags!: Table<KnowledgeTag, string>;
  knowledge_results!: Table<KnowledgeResult, string>;
  warnings!: Table<Warning, string>;
  ai_diagnoses!: Table<AIDiagnosis, string>;
  audit_logs!: Table<AuditLog, string>;
  settings!: Table<Settings, string>;

  constructor() {
    super('SmartEduMathDatabase');
    this.version(1).stores({
      school_years: 'id, is_active',
      classes: 'id, school_year_id, grade_level, status',
      students: 'id, status, full_name, parent_phone',
      class_students: 'id, class_id, student_id',
      sessions: 'id, class_id, session_date, knowledge_tag_id',
      student_sessions: 'id, student_id, session_id, attendance',
      knowledge_tags: 'id, grade_level, category',
      knowledge_results: 'id, student_id, knowledge_tag_id',
      warnings: 'id, student_id, class_id, priority, resolved',
      ai_diagnoses: 'id, student_id',
      audit_logs: 'id, user_role, timestamp',
      settings: 'id',
    });

    this.tables.forEach(table => {
      const tableName = table.name;
      table.hook('creating', function (primKey, obj, trans) {
        if (!primKey) {
          const uuid = crypto.randomUUID();
          obj.id = uuid;
          primKey = uuid;
        }
        if (!isRemoteSyncing) {
          pushSingleDocToFirestore(tableName, String(primKey || obj.id), obj, false);
        }
        return primKey;
      });

      table.hook('updating', function (mods, primKey, obj, trans) {
        if (!isRemoteSyncing) {
          const updatedObj = { ...obj, ...mods, updated_at: new Date().toISOString() };
          pushSingleDocToFirestore(tableName, String(primKey), updatedObj, false);
        }
      });

      table.hook('deleting', function (primKey, obj, trans) {
        if (!isRemoteSyncing) {
          pushSingleDocToFirestore(tableName, String(primKey), null, true);
        }
      });
    });
  }
}

export const db = new SmartEduDatabase();

export async function recordDeletionTombstone(id: string, tableName: string, studentId?: string) {
  // Offline-first: Tombstones no longer required
}

export async function deleteStudent(studentId: string | number) {
  const sidStr = String(studentId);
  const sidNum = Number(studentId);
  const isNum = !isNaN(sidNum);

  await db.transaction('rw', [db.students, db.class_students, db.student_sessions, db.warnings, db.knowledge_results, db.ai_diagnoses], async () => {
    await db.students.delete(sidStr);
    if (isNum) await db.students.delete(sidNum as any);

    const deleteFromTable = async (table: any) => {
      await table.where('student_id').equals(sidStr).delete();
      if (isNum) await table.where('student_id').equals(sidNum).delete();
    };

    await deleteFromTable(db.class_students);
    await deleteFromTable(db.student_sessions);
    await deleteFromTable(db.warnings);
    await deleteFromTable(db.knowledge_results);
    await deleteFromTable(db.ai_diagnoses);
  });
}

export async function cleanDuplicateStudentSessions() {
  try {
    const allStudSessions = await db.student_sessions.toArray();
    const groups = new Map<string, StudentSession[]>();

    allStudSessions.forEach((ss) => {
      const key = `${String(ss.student_id)}_${String(ss.session_id)}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(ss);
    });

    const idsToDelete: (string | number)[] = [];

    groups.forEach((records) => {
      if (records.length > 1) {
        records.sort((a, b) => {
          const timeA = a.updated_at ? new Date(a.updated_at).getTime() : 0;
          const timeB = b.updated_at ? new Date(b.updated_at).getTime() : 0;
          return timeB - timeA;
        });
        for (let i = 1; i < records.length; i++) {
          if (records[i].id !== undefined) {
            idsToDelete.push(records[i].id!);
          }
        }
      }
    });

    if (idsToDelete.length > 0) {
      console.log(`[Clean Data] Deleting ${idsToDelete.length} duplicate student_session records...`);
      await db.student_sessions.bulkDelete(idsToDelete as any);
    }
  } catch (err) {
    console.warn('[Clean Data] Error cleaning duplicate student sessions:', err);
  }
}

export async function initializeDefaultSystemData() {
  setRemoteSyncing(true);
  try {
    const yearsCount = await db.school_years.count();
    const settingsCount = await db.settings.count();
    const now = new Date().toISOString();

    if (yearsCount === 0) {
      await db.school_years.add({
        name: '2025-2026',
        is_active: true,
        created_at: now,
        updated_at: now,
      });
    }

    if (settingsCount === 0) {
      const baseConfig = {
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

      await db.settings.add({
        warning_rule_config: baseConfig,
        class_profile_configs: {
          standard: { ...baseConfig },
          specialized: { ...baseConfig, minTestScore: 7.0, minHomeworkScore: 7.0 },
          remedial: { ...baseConfig, minTestScore: 4.0, minHomeworkScore: 4.0 }
        },
        pronoun_config: {
          teacher_title: 'Thầy/Cô',
          teacher_name: 'Giáo viên',
          student_pronoun: 'Học sinh',
        },
        theme: 'light',
        updated_at: now,
      });
    }

    // Always run deduplication on init to maintain clean database state
    await cleanDuplicateStudentSessions();
  } finally {
    setRemoteSyncing(false);
  }
}

export async function seedDemoData() {
  setRemoteSyncing(true);
  try {
    // Clear ONLY existing demo data to prevent duplicates, while preserving previous and user-created data.
    const deleteDemoRecords = async (table: any) => {
      const demoItems = await table.filter((item: any) => item.is_demo === true).toArray();
      const keysToDelete = demoItems.map((i: any) => i.id).filter(Boolean);
      if (keysToDelete.length > 0) {
        await table.bulkDelete(keysToDelete);
      }
    };

    await deleteDemoRecords(db.school_years);
    await deleteDemoRecords(db.classes);
    await deleteDemoRecords(db.students);
    await deleteDemoRecords(db.class_students);
    await deleteDemoRecords(db.sessions);
    await deleteDemoRecords(db.student_sessions);
    await deleteDemoRecords(db.warnings);
    await deleteDemoRecords(db.ai_diagnoses);
    await deleteDemoRecords(db.audit_logs);
    await deleteDemoRecords(db.knowledge_results);
    await deleteDemoRecords(db.knowledge_tags);

  const now = new Date().toISOString();

  // 1. School Year
  const syId = await db.school_years.add({
    name: '2025-2026',
    is_active: true,
    is_demo: true,
    created_at: now,
    updated_at: now,
  });

  // 2. Knowledge Tags (Math THCS Grade 6-9)
  const tagIds = await db.knowledge_tags.bulkAdd(
    [
      { grade_level: 9, category: 'Algebra', tag_name: 'Căn thức bậc hai & Rút gọn biểu thức', is_demo: true, created_at: now },
      { grade_level: 9, category: 'Algebra', tag_name: 'Hệ phương trình bậc nhất 2 ẩn', is_demo: true, created_at: now },
      { grade_level: 9, category: 'Algebra', tag_name: 'Phương trình bậc hai & Định lý Vi-ét', is_demo: true, created_at: now },
      { grade_level: 9, category: 'Algebra', tag_name: 'Bất đẳng thức & Cực trị đại số', is_demo: true, created_at: now },
      { grade_level: 9, category: 'Geometry', tag_name: 'Hệ thức lượng trong tam giác vuông', is_demo: true, created_at: now },
      { grade_level: 9, category: 'Geometry', tag_name: 'Đường tròn & Góc với đường tròn', is_demo: true, created_at: now },
      { grade_level: 9, category: 'Geometry', tag_name: 'Tứ giác nội tiếp & Chứng minh đồng quy', is_demo: true, created_at: now },
      { grade_level: 8, category: 'Algebra', tag_name: 'Hằng đẳng thức đáng nhớ & Phân tích đa thức', is_demo: true, created_at: now },
      { grade_level: 8, category: 'Geometry', tag_name: 'Tam giác đồng dạng & Định lý Talét', is_demo: true, created_at: now },
      { grade_level: 7, category: 'Algebra', tag_name: 'Số hữu tỉ & Tỉ lệ thức', is_demo: true, created_at: now },
      { grade_level: 6, category: 'Algebra', tag_name: 'Số nguyên & Phân số', is_demo: true, created_at: now },
    ],
    { allKeys: true }
  );

  // 3. Classes
  const class1Id = await db.classes.add({
    school_year_id: syId,
    class_name: '9A1 - Chuyên Ôn Thi Vào 10 (Chất lượng cao)',
    grade_level: 9,
    target_description: 'Mục tiêu: 100% Thi Lớp 10 Chuyên/Công lập Top 1 đạt 8.5+ điểm Toán',
    schedule: 'Thứ 3 (18h00 - 20h00) & Chủ Nhật (14h00 - 16h30)',
    assistant_name: 'Cô Lê Thị Thảo',
    assistant_phone: '0988 123 456',
    status: 'active',
    is_demo: true,
    created_at: now,
    updated_at: now,
  });

  const class2Id = await db.classes.add({
    school_year_id: syId,
    class_name: '9B2 - Luyện Đề & Lấy Lại Căn Bản',
    grade_level: 9,
    target_description: 'Mục tiêu: Đạt 7.0+ Toán Thi Vào 10 THPT Công lập',
    schedule: 'Thứ 5 (18h00 - 20h00) & Thứ 7 (16h00 - 18h00)',
    assistant_name: 'Thầy Phạm Hoàng Minh',
    assistant_phone: '0977 654 321',
    status: 'active',
    is_demo: true,
    created_at: now,
    updated_at: now,
  });

  const class3Id = await db.classes.add({
    school_year_id: syId,
    class_name: '8A2 - Hình học Tứ giác & Đồng dạng',
    grade_level: 8,
    target_description: 'Mục tiêu: Nắm chắc Hình học Lớp 8 & Chuẩn bị sớm cho Khối 9',
    schedule: 'Thứ 4 (17h30 - 19h30)',
    assistant_name: 'Cô Lê Thị Thảo',
    assistant_phone: '0988 123 456',
    status: 'active',
    is_demo: true,
    created_at: now,
    updated_at: now,
  });

  const class4ArchivedId = await db.classes.add({
    school_year_id: syId,
    class_name: '8A1 - Niên khóa 2024 (Đã hoàn thành)',
    grade_level: 8,
    target_description: 'Đã hoàn thành chương trình Lớp 8 năm học trước',
    schedule: 'Thứ 2 - Thứ 6',
    assistant_name: 'Thầy Phạm Hoàng Minh',
    assistant_phone: '0977 654 321',
    status: 'archived',
    is_demo: true,
    created_at: now,
    updated_at: now,
  });

  // 4. Students
  const sampleStudentsData = [
    { name: 'Nguyễn Minh Anh', gender: 'Nữ' as const, parent: 'Nguyễn Văn Hùng', phone: '0903 111 222', status: 'studying' as const, note: 'Học sinh giỏi, mục tiêu chuyên Toán Ams' },
    { name: 'Trần Gia Bảo', gender: 'Nam' as const, parent: 'Trần Thị Mai', phone: '0903 222 333', status: 'studying' as const, note: 'Tính toán còn cẩu thả phần Căn thức' },
    { name: 'Lê Hoàng Nam', gender: 'Nam' as const, parent: 'Lê Văn Tuấn', phone: '0903 333 444', status: 'studying' as const, note: 'Yếu phần vẽ hình Tứ giác nội tiếp' },
    { name: 'Phạm Phương Thảo', gender: 'Nữ' as const, parent: 'Phạm Xuân Bách', phone: '0903 444 555', status: 'studying' as const, note: 'Chăm chỉ, làm BTVN đầy đủ' },
    { name: 'Hoàng Đức Mạnh', gender: 'Nam' as const, parent: 'Hoàng Văn Vinh', phone: '0903 555 666', status: 'studying' as const, note: 'Cần chú ý nghỉ học không phép 2 buổi' },
    { name: 'Đỗ Thị Khánh Linh', gender: 'Nữ' as const, parent: 'Đỗ Tiến Dũng', phone: '0903 666 777', status: 'studying' as const, note: 'Tiến bộ vượt bậc sau 4 tuần phụ đạo' },
    { name: 'Vũ Quốc Huy', gender: 'Nam' as const, parent: 'Vũ Văn Khang', phone: '0903 777 888', status: 'studying' as const, note: 'Thường xuyên nộp BTVN muộn' },
    { name: 'Bùi Anh Khoa', gender: 'Nam' as const, parent: 'Bùi Thị Hà', phone: '0903 888 999', status: 'paused' as const, leave_reason: 'Trùng lịch học tuyển chọn TDTT', note: 'Xin tạm nghỉ tháng 7' },
    { name: 'Ngô Thanh Hà', gender: 'Nữ' as const, parent: 'Ngô Văn Thành', phone: '0903 999 000', status: 'studying' as const, note: 'Nắm chắc lý thuyết Vi-ét' },
    { name: 'Nguyễn Đức Anh', gender: 'Nam' as const, parent: 'Nguyễn Thị Tuyết', phone: '0912 000 111', status: 'studying' as const, note: 'Cần kiểm tra bài cũ thường xuyên' },
  ];

  const studentIds: string[] = [];
  for (const s of sampleStudentsData) {
    const id = await db.students.add({
      full_name: s.name,
      gender: s.gender,
      parent_name: s.parent,
      parent_phone: s.phone,
      status: s.status,
      leave_reason: s.leave_reason || '',
      note: s.note,
      is_demo: true,
      created_at: now,
      updated_at: now,
    });
    studentIds.push(id);

    // Assign to Class 1 (9A1)
    await db.class_students.add({
      class_id: class1Id,
      student_id: id,
      join_date: '2025-06-01',
      is_demo: true,
      created_at: now,
    });
  }

  // 5. Create Sessions for Class 1 (Tuần 1 - Tuần 9)
  const sessionDates = [
    '2025-06-03', '2025-06-10', '2025-06-17', '2025-06-24',
    '2025-07-01', '2025-07-08', '2025-07-15', '2025-07-22', '2025-07-29'
  ];

  const sessionTitles = [
    'Buổi 1: Căn thức bậc hai & Rút gọn biểu thức chứa căn',
    'Buổi 2: Phương trình & Bất phương trình chứa căn',
    'Buổi 3: Hệ thức lượng trong tam giác vuông & Tỉ số lượng giác',
    'Buổi 4: Hệ phương trình bậc nhất 2 ẩn (Phương pháp thế & Cộng)',
    'Buổi 5: Giải bài toán bằng cách lập hệ phương trình',
    'Buổi 6: Phương trình bậc hai & Định lý Vi-ét nâng cao',
    'Buổi 7: Sự tương giao giữa Parabol & Đường thẳng',
    'Buổi 8: Tứ giác nội tiếp & Chứng minh 3 điểm thẳng hàng',
    'Buổi 9: Ôn tập tổng hợp & Luyện đề khảo sát Học kỳ 1'
  ];

  const sessionIds: string[] = [];
  for (let i = 0; i < sessionDates.length; i++) {
    const sid = await db.sessions.add({
      class_id: class1Id,
      session_date: sessionDates[i],
      lesson_title: sessionTitles[i],
      chapter: i < 2 ? 'Chương 1: Đại số Căn thức' : (i === 2 ? 'Chương 1: Hình học Tam giác vuông' : (i < 7 ? 'Chương 2: Đại số Hệ PT & Vi-ét' : 'Chương 2: Hình học Đường tròn')),
      knowledge_tag_id: tagIds[i % tagIds.length],
      homework_description: `Làm Bài tập 1 đến 5 trang ${20 + i} trong Phiếu BTVN Tuần ${i+1}`,
      is_demo: true,
      created_at: now,
      updated_at: now,
    });
    sessionIds.push(sid);
  }

  // 6. Student Session Scores & Attendance History for Scenarios Testing
  for (let sIdx = 0; sIdx < studentIds.length; sIdx++) {
    const stId = studentIds[sIdx];

    for (let sessIdx = 0; sessIdx < sessionIds.length; sessIdx++) {
      const sessId = sessionIds[sessIdx];

      // Session 9 is intentionally incomplete for testing 4-session range completeness validation
      if (sessIdx === 8 && (sIdx === 2 || sIdx === 4 || sIdx === 6)) {
        continue; // Leave Session 9 record missing/unentered for these students
      }

      let hw = 8.5;
      let test = 8.0;
      let attendance: 'present' | 'absent_excused' | 'absent_unexcused' | 'late' = 'present';
      let homework_submitted = true;
      let late_submit = false;
      let comments: string[] = [];

      // Scenario 1: Student 0 (Nguyễn Minh Anh) -> Praise (Tuyên dương xuất sắc & Chuyên cần 100%)
      if (sIdx === 0) {
        hw = 9.5;
        test = 9.5;
        comments.push('Nắm chắc lý thuyết và lập luận rất chặt chẽ');
      }

      // Scenario 2: Student 1 (Trần Gia Bảo) -> 🔴 P1 Thiếu BTVN 3 buổi liên tiếp (Buổi 6, 7, 8)
      else if (sIdx === 1) {
        if (sessIdx >= 5 && sessIdx <= 7) {
          homework_submitted = false;
          hw = 0;
          comments.push('Chưa nộp bài tập về nhà');
        } else {
          hw = 7.0;
        }
        test = 7.5;
      }

      // Scenario 3: Student 2 (Lê Hoàng Nam) -> 🔴 P1 Bài kiểm tra < 5đ trong 2 buổi liên tiếp (Buổi 7, 8)
      else if (sIdx === 2) {
        hw = 6.0;
        if (sessIdx === 6) {
          test = 4.0;
          comments.push('Tính toán cẩu thả phần biến đổi Căn thức');
        } else if (sessIdx === 7) {
          test = 4.5;
          comments.push('Vẽ hình thiếu nét, chưa chứng minh được Tứ giác nội tiếp');
        } else {
          test = 6.5;
        }
      }

      // Scenario 4: Student 3 (Phạm Phương Thảo) -> 🟠 P2 Nhắc nhở đi muộn tái diễn (Buổi 6, 7, 8)
      else if (sIdx === 3) {
        hw = 8.5;
        test = 8.0;
        if (sessIdx >= 5 && sessIdx <= 7) {
          attendance = 'late';
          comments.push('Đi muộn 15 phút đầu giờ');
        }
      }

      // Scenario 5: Student 4 (Hoàng Đức Mạnh) -> 🔴 P1 Vắng không phép 2 buổi liền (Buổi 7, 8)
      else if (sIdx === 4) {
        if (sessIdx === 6 || sessIdx === 7) {
          attendance = 'absent_unexcused';
          homework_submitted = false;
          hw = 0;
          test = 0;
          comments.push('Vắng mặt không lý do');
        } else {
          hw = 6.0;
          test = 5.5;
        }
      }

      // Scenario 6: Student 5 (Đỗ Thị Khánh Linh) -> 🟢 Praise Tiến bộ vượt bậc
      else if (sIdx === 5) {
        if (sessIdx <= 3) {
          hw = 6.0;
          test = 5.5;
        } else {
          hw = 9.5;
          test = 9.5;
          comments.push('Tiến bộ vượt bậc sau khi được phụ đạo riêng');
        }
      }

      // Scenario 7: Student 6 (Vũ Quốc Huy) -> 🟠 P2 Lệch phong độ (BTVN 9.0đ nhưng Kiểm tra 4.5đ)
      else if (sIdx === 6) {
        hw = 9.0;
        if (sessIdx >= 6) {
          test = 4.5;
          comments.push('Làm BTVN ở nhà điểm cao nhưng làm bài viết lớp bị tâm lý');
        } else {
          test = 7.0;
        }
      }

      // Scenario 8: Student 7 (Bùi Anh Khoa) -> Status paused (Tạm nghỉ)
      else if (sIdx === 7) {
        attendance = 'absent_excused';
        homework_submitted = false;
        hw = 0;
        test = 0;
        comments.push('Tạm nghỉ học theo đơn của PH');
      }

      // Scenario 9: Student 8 (Ngô Thanh Hà) -> 🟠 P2 Điểm kiểm tra buổi mới nhất chưa đạt (4.5đ)
      else if (sIdx === 8) {
        hw = 8.0;
        if (sessIdx === 7) {
          test = 4.5;
          comments.push('Chưa thuộc công thức Định lý Vi-ét');
        } else {
          test = 7.5;
        }
      }

      // Scenario 10: Student 9 (Nguyễn Đức Anh) -> Học sinh bình thường
      else {
        hw = 7.5;
        test = 7.0;
        comments.push('Thái độ học tập ngoan, tiếp thu bài tốt');
      }

      await db.student_sessions.add({
        student_id: stId,
        session_id: sessId,
        attendance: attendance,
        homework_score: Number(hw.toFixed(1)),
        test_score: Number(test.toFixed(1)),
        homework_submitted: homework_submitted,
        late_submit: late_submit,
        makeup_test: false,
        exempt: sIdx === 7, // Student 7 exempt because paused
        quick_preset_comments: comments,
        custom_comment: comments.join(', '),
        is_demo: true,
        updated_at: now,
      });
    }
  }

  // 7. Seed Warnings
  await db.warnings.bulkAdd([
    {
      student_id: studentIds[4],
      class_id: class1Id,
      priority: 'P1',
      warning_type: 'Vắng không phép 2 buổi liền',
      reason: 'Vắng không phép liên tiếp Buổi 7 (15/07) và Buổi 8 (22/07). Chưa nộp BTVN.',
      resolved: false,
      is_demo: true,
      created_at: now,
      updated_at: now,
    },
    {
      student_id: studentIds[2],
      class_id: class1Id,
      priority: 'P1',
      warning_type: 'Bài kiểm tra < 5 điểm (2 buổi)',
      reason: 'Đạt 4.0 điểm Buổi 7 và 4.5 điểm Buổi 8. Hổng kiến thức Tứ giác nội tiếp.',
      resolved: false,
      is_demo: true,
      created_at: now,
      updated_at: now,
    },
    {
      student_id: studentIds[6],
      class_id: class1Id,
      priority: 'P2',
      warning_type: 'Lệch phong độ (BTVN 8.0 nhưng Kiểm tra 5.5)',
      reason: 'Điểm làm ở nhà cao nhưng điểm kiểm tra viết trên lớp bị sụt giảm > 2 điểm.',
      resolved: false,
      is_demo: true,
      created_at: now,
      updated_at: now,
    },
    {
      student_id: studentIds[1],
      class_id: class1Id,
      priority: 'P2',
      warning_type: 'Hay sai cẩu thả dấu âm/dương',
      reason: 'Phát hiện sai sót lặp lại 3 lần liên tiếp ở phần biến đổi Căn thức.',
      resolved: true,
      resolved_action: 'Đã cho làm bài tập phụ đạo gỡ điểm & gọi nhắc nhở Phụ huynh',
      is_demo: true,
      created_at: now,
      updated_at: now,
    },
  ]);

  // 8. Seed Audit Log
  await db.audit_logs.bulkAdd([
    {
      user_role: 'Teacher',
      action_type: 'Khởi tạo lớp',
      description: 'Tạo thành công Lớp 9A1 - Chuyên Ôn Thi Vào 10',
      is_demo: true,
      timestamp: now,
    },
    {
      user_role: 'TA',
      action_type: 'Nhập điểm',
      description: 'Cập nhật hoàn tất điểm Buổi 8 cho 10 học sinh',
      is_demo: true,
      timestamp: now,
    },
  ]);

  // 9. Seed Settings (We don't overwrite settings is_demo as settings should persist user keys etc, but we ensure it exists)
  const settingsCount = await db.settings.count();
  if (settingsCount === 0) {
    const baseConfig = {
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

    await db.settings.add({
      warning_rule_config: baseConfig,
      class_profile_configs: {
        standard: { ...baseConfig },
        specialized: { ...baseConfig, minTestScore: 7.0, minHomeworkScore: 7.0 },
        remedial: { ...baseConfig, minTestScore: 4.0, minHomeworkScore: 4.0 }
      },
      pronoun_config: {
        teacher_title: 'Thầy/Cô',
        teacher_name: 'Giáo viên',
        student_pronoun: 'Học sinh',
      },
      theme: 'light',
      updated_at: now,
    });
  }

    localStorage.setItem('seed_demo_data_done', 'true');
  } finally {
    setRemoteSyncing(false);
  }
}

export async function deleteOnlyDemoTestData() {
  setRemoteSyncing(true);
  try {
    // 1. Define demo matching criteria
  const demoClassNames = [
    '9A1 - Chuyên Ôn Thi Vào 10 (Chất lượng cao)',
    '9B2 - Luyện Đề & Lấy Lại Căn Bản',
    '8A2 - Hình học Tứ giác & Đồng dạng',
    '8A1 - Niên khóa 2024 (Đã hoàn thành)',
    '9B2 - Đại trà & Chống liệt Toán 10',
    '8A2 - Bứt phá điểm số Hình học',
    '8B1 - Luyện đề nâng cao'
  ];

  const demoStudentNames = [
    'Nguyễn Minh Anh',
    'Trần Gia Bảo',
    'Lê Hoàng Nam',
    'Phạm Phương Thảo',
    'Hoàng Đức Mạnh',
    'Đỗ Thị Khánh Linh',
    'Vũ Quốc Huy',
    'Bùi Anh Khoa',
    'Ngô Thanh Hà',
    'Nguyễn Đức Anh'
  ];

  const demoTagNames = [
    'Căn thức bậc hai & Rút gọn biểu thức',
    'Hệ phương trình bậc nhất 2 ẩn',
    'Phương trình bậc hai & Định lý Vi-ét',
    'Bất đẳng thức & Cực trị đại số',
    'Hệ thức lượng trong tam giác vuông',
    'Đường tròn & Góc với đường tròn',
    'Tứ giác nội tiếp & Chứng minh đồng quy',
    'Hằng đẳng thức đáng nhớ & Phân tích đa thức',
    'Tam giác đồng dạng & Định lý Talét',
    'Số hữu tỉ & Tỉ lệ thức',
    'Số nguyên & Phân số'
  ];

  // 2. Fetch all demo class IDs
  const demoClassIds = new Set<string>();
  const demoClasses: any[] = [];
  await db.classes.each((item) => {
    if (
      item.is_demo === true ||
      demoClassNames.includes(item.class_name) ||
      demoClassNames.some(name => item.class_name.includes(name.split(' - ')[0]))
    ) {
      if (item.id) {
        demoClassIds.add(item.id);
        demoClasses.push(item);
      }
    }
  });

  // 3. Fetch all demo student IDs
  const demoStudentIds = new Set<string>();
  const demoStudents: any[] = [];
  await db.students.each((item) => {
    if (
      item.is_demo === true ||
      demoStudentNames.includes(item.full_name)
    ) {
      if (item.id) {
        demoStudentIds.add(item.id);
        demoStudents.push(item);
      }
    }
  });

  // 4. Fetch all demo knowledge tag IDs
  const demoTagIds = new Set<string>();
  const demoTags: any[] = [];
  await db.knowledge_tags.each((item) => {
    if (
      item.is_demo === true ||
      demoTagNames.includes(item.tag_name)
    ) {
      if (item.id) {
        demoTagIds.add(item.id);
        demoTags.push(item);
      }
    }
  });

  // 5. Fetch all sessions belonging to demo classes
  const demoSessionIds = new Set<string>();
  const demoSessions: any[] = [];
  await db.sessions.each((item) => {
    if (
      item.is_demo === true ||
      (item.class_id && demoClassIds.has(item.class_id))
    ) {
      if (item.id) {
        demoSessionIds.add(item.id);
        demoSessions.push(item);
      }
    }
  });

  // 6. Gather all associated records for cascading deletions
  const demoClassStudents: any[] = [];
  await db.class_students.each((item) => {
    if (
      item.is_demo === true ||
      (item.class_id && demoClassIds.has(item.class_id)) ||
      (item.student_id && demoStudentIds.has(item.student_id))
    ) {
      demoClassStudents.push(item);
    }
  });

  const demoStudentSessions: any[] = [];
  await db.student_sessions.each((item) => {
    if (
      item.is_demo === true ||
      (item.student_id && demoStudentIds.has(item.student_id)) ||
      (item.session_id && demoSessionIds.has(item.session_id))
    ) {
      demoStudentSessions.push(item);
    }
  });

  const demoWarnings: any[] = [];
  await db.warnings.each((item) => {
    if (
      item.is_demo === true ||
      (item.student_id && demoStudentIds.has(item.student_id)) ||
      (item.class_id && demoClassIds.has(item.class_id))
    ) {
      demoWarnings.push(item);
    }
  });

  const demoAiDiagnoses: any[] = [];
  await db.ai_diagnoses.each((item) => {
    if (
      item.is_demo === true ||
      (item.student_id && demoStudentIds.has(item.student_id))
    ) {
      demoAiDiagnoses.push(item);
    }
  });

  const demoKnowledgeResults: any[] = [];
  await db.knowledge_results.each((item) => {
    if (
      item.is_demo === true ||
      (item.student_id && demoStudentIds.has(item.student_id)) ||
      (item.knowledge_tag_id && demoTagIds.has(item.knowledge_tag_id))
    ) {
      demoKnowledgeResults.push(item);
    }
  });

  const demoAuditLogs: any[] = [];
  await db.audit_logs.each((item) => {
    if (
      item.is_demo === true ||
      (item.description && (
        item.description.includes('9A1') ||
        item.description.includes('9B2') ||
        item.description.includes('8A2') ||
        item.description.includes('8B1') ||
        item.description.includes('cảnh báo tự động') ||
        item.description.includes('dữ liệu mẫu')
      ))
    ) {
      demoAuditLogs.push(item);
    }
  });

  const demoSchoolYears: any[] = [];
  await db.school_years.each((item) => {
    if (item.is_demo === true) {
      demoSchoolYears.push(item);
    }
  });

  // 7. Perform Dexie transactions synchronously (WITHOUT dynamic imports/non-DB network awaits inside)
  await db.transaction('rw', [
    db.school_years,
    db.classes,
    db.students,
    db.class_students,
    db.sessions,
    db.student_sessions,
    db.warnings,
    db.ai_diagnoses,
    db.audit_logs,
    db.knowledge_results,
    db.knowledge_tags
  ], async () => {
    if (demoClasses.length > 0) await db.classes.bulkDelete(demoClasses.map(x => x.id));
    if (demoStudents.length > 0) await db.students.bulkDelete(demoStudents.map(x => x.id));
    if (demoClassStudents.length > 0) await db.class_students.bulkDelete(demoClassStudents.map(x => x.id));
    if (demoSessions.length > 0) await db.sessions.bulkDelete(demoSessions.map(x => x.id));
    if (demoStudentSessions.length > 0) await db.student_sessions.bulkDelete(demoStudentSessions.map(x => x.id));
    if (demoWarnings.length > 0) await db.warnings.bulkDelete(demoWarnings.map(x => x.id));
    if (demoAiDiagnoses.length > 0) await db.ai_diagnoses.bulkDelete(demoAiDiagnoses.map(x => x.id));
    if (demoKnowledgeResults.length > 0) await db.knowledge_results.bulkDelete(demoKnowledgeResults.map(x => x.id));
    if (demoTags.length > 0) await db.knowledge_tags.bulkDelete(demoTags.map(x => x.id));
    if (demoAuditLogs.length > 0) await db.audit_logs.bulkDelete(demoAuditLogs.map(x => x.id));
    if (demoSchoolYears.length > 0) await db.school_years.bulkDelete(demoSchoolYears.map(x => x.id));
  });
  } finally {
    setRemoteSyncing(false);
  }
}

export async function clearAllDataToBlankSlate() {
  setRemoteSyncing(true);
  try {
    await db.transaction('rw', [
      db.classes,
      db.students,
      db.class_students,
      db.sessions,
      db.student_sessions,
      db.warnings,
      db.ai_diagnoses,
      db.audit_logs,
      db.knowledge_results
    ], async () => {
      await db.classes.clear();
      await db.students.clear();
      await db.class_students.clear();
      await db.sessions.clear();
      await db.student_sessions.clear();
      await db.warnings.clear();
      await db.ai_diagnoses.clear();
      await db.audit_logs.clear();
      await db.knowledge_results.clear();
    });

    // Ensure demo data seed is marked completed
    localStorage.setItem('seed_demo_data_done', 'true');
  } finally {
    setRemoteSyncing(false);
  }
}

