import { db, pushBatchDocsToFirestore, pushSingleDocToFirestore } from '../db/dexie';
import {
  AuditLog,
  GradeChangeDiff,
  SessionGradeSnapshot,
  Student,
  StudentSession,
  UserRole,
} from '../types';

export function getFieldLabel(field: string): string {
  switch (field) {
    case 'test_score':
      return 'Điểm Kiểm tra';
    case 'homework_score':
      return 'Điểm BTVN';
    case 'attendance':
      return 'Điểm danh';
    case 'custom_comment':
      return 'Nhận xét';
    case 'makeup_test':
      return 'Thi bù';
    case 'exempt':
      return 'Miễn học';
    case 'exempt_test':
      return 'Miễn bài KT';
    case 'exempt_homework':
      return 'Miễn BTVN';
    case 'homework_submitted':
      return 'Nộp BTVN';
    case 'late_submit':
      return 'Nộp muộn';
    default:
      return field;
  }
}

export function formatFieldValue(field: string, value: any): string {
  if (value === undefined || value === null || value === '') {
    return '(Trống)';
  }

  if (field === 'attendance') {
    switch (value) {
      case 'present':
        return 'Có mặt';
      case 'absent_excused':
        return 'Vắng (CP)';
      case 'absent_unexcused':
        return 'Vắng (KP)';
      case 'late':
        return 'Đi muộn';
      default:
        return String(value);
    }
  }

  if (field === 'test_score' || field === 'homework_score') {
    const num = Number(value);
    return isNaN(num) ? String(value) : `${num}đ`;
  }

  if (typeof value === 'boolean') {
    return value ? 'Bật / Có' : 'Tắt / Không';
  }

  if (typeof value === 'string') {
    if (value.length > 50) {
      return value.substring(0, 47) + '...';
    }
    return value;
  }

  return String(value);
}

/**
 * Computes list of Before/After changes between previous and new student sessions.
 */
export function computeGradeDiffs(
  prevMap: Record<string, StudentSession>,
  newMap: Record<string, StudentSession>,
  students: Student[]
): GradeChangeDiff[] {
  const diffs: GradeChangeDiff[] = [];
  const studentLookup = new Map<string, string>();
  students.forEach((st) => {
    if (st.id) {
      studentLookup.set(String(st.id), st.full_name);
    }
  });

  const fieldsToCheck: Array<keyof StudentSession> = [
    'test_score',
    'homework_score',
    'attendance',
    'custom_comment',
    'makeup_test',
    'exempt',
    'exempt_test',
    'exempt_homework',
    'homework_submitted',
    'late_submit',
  ];

  const allStudentIds = Array.from(
    new Set([...Object.keys(prevMap), ...Object.keys(newMap)])
  );

  for (const stId of allStudentIds) {
    const prev = prevMap[stId];
    const curr = newMap[stId];
    const studentName = studentLookup.get(stId) || `Học sinh #${stId}`;

    if (!prev && curr) {
      // Entirely new record created
      fieldsToCheck.forEach((f) => {
        const val = curr[f];
        if (val !== undefined && val !== null && val !== '') {
          diffs.push({
            student_id: stId,
            student_name: studentName,
            field: f,
            field_label: getFieldLabel(f),
            old_value: undefined,
            new_value: val,
            old_display: '(Mới tạo)',
            new_display: formatFieldValue(f, val),
          });
        }
      });
      continue;
    }

    if (prev && curr) {
      fieldsToCheck.forEach((f) => {
        const oldVal = prev[f];
        const newVal = curr[f];

        // Normalize comparisons
        const oldNorm = oldVal === undefined || oldVal === null ? '' : oldVal;
        const newNorm = newVal === undefined || newVal === null ? '' : newVal;

        if (oldNorm !== newNorm) {
          diffs.push({
            student_id: stId,
            student_name: studentName,
            field: f,
            field_label: getFieldLabel(f),
            old_value: oldVal,
            new_value: newVal,
            old_display: formatFieldValue(f, oldVal),
            new_display: formatFieldValue(f, newVal),
          });
        }
      });
    }
  }

  return diffs;
}

/**
 * Logs a detailed grade modification entry with Diff list and Rollback Snapshot
 */
export async function logDetailedGradeAudit({
  userRole = 'Teacher',
  sessionId,
  classId,
  className,
  sessionTitle,
  diffs,
  snapshotRecords,
}: {
  userRole?: UserRole;
  sessionId: string | number;
  classId?: string | number;
  className?: string;
  sessionTitle?: string;
  diffs: GradeChangeDiff[];
  snapshotRecords: StudentSession[];
}): Promise<AuditLog | null> {
  try {
    if (diffs.length === 0) return null;

    const studentCount = new Set(diffs.map((d) => String(d.student_id))).size;
    const desc = `Sửa điểm buổi học "${sessionTitle || sessionId}" (Lớp ${className || classId}): Có ${diffs.length} thay đổi của ${studentCount} học sinh`;

    const snapshot: SessionGradeSnapshot = {
      session_id: sessionId,
      class_id: classId,
      lesson_title: sessionTitle,
      records: JSON.parse(JSON.stringify(snapshotRecords)),
    };

    const newLog: AuditLog = {
      id: `audit_grade_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      user_role: userRole,
      action_type: 'Sửa điểm bảng điểm',
      description: desc,
      session_id: sessionId,
      class_id: classId,
      class_name: className,
      diffs,
      snapshot,
      timestamp: new Date().toISOString(),
    };

    await db.audit_logs.add(newLog);
    return newLog;
  } catch (err) {
    console.error('Lỗi khi ghi chi tiết nhật ký sửa điểm:', err);
    return null;
  }
}

/**
 * Rollbacks a full session gradebook to the snapshot saved in the audit log.
 */
export async function rollbackSessionSnapshot(
  logId: string,
  userRole: UserRole = 'Teacher'
): Promise<{ success: boolean; message: string; restoredCount: number }> {
  try {
    const log = await db.audit_logs.get(logId);
    if (!log || !log.snapshot || !Array.isArray(log.snapshot.records)) {
      return {
        success: false,
        message: 'Không tìm thấy dữ liệu Snapshot của phiên lưu này để khôi phục.',
        restoredCount: 0,
      };
    }

    const { session_id, class_id, lesson_title, records } = log.snapshot;
    if (records.length === 0) {
      return {
        success: false,
        message: 'Bản lưu snapshot không có bản ghi điểm học sinh nào.',
        restoredCount: 0,
      };
    }

    // Capture current state before rollback so the rollback can be tracked/undone
    const currentSessions = await db.student_sessions
      .where('session_id')
      .equals(session_id as any)
      .toArray();

    // Prepare restored records with current timestamps
    const now = new Date().toISOString();
    const restoredRecords = records.map((r) => ({
      ...r,
      updated_at: now,
    }));

    // Bulk put into local IndexedDB
    await db.student_sessions.bulkPut(restoredRecords);

    // Multi-device Firestore sync
    await pushBatchDocsToFirestore('student_sessions', restoredRecords);

    // Log the rollback operation itself into audit trail
    const rollbackLog: AuditLog = {
      id: `audit_rollback_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      user_role: userRole,
      action_type: 'Khôi phục bảng điểm',
      description: `Khôi phục toàn bộ bảng điểm buổi học "${lesson_title || session_id}" về bản snapshot ${new Date(log.timestamp).toLocaleString('vi-VN')} (${records.length} học sinh)`,
      session_id,
      class_id,
      is_rollback: true,
      rollback_of_log_id: logId,
      snapshot: {
        session_id,
        class_id,
        lesson_title,
        records: currentSessions,
      },
      timestamp: now,
    };

    await db.audit_logs.add(rollbackLog);

    return {
      success: true,
      message: `Đã khôi phục thành công bảng điểm của ${restoredRecords.length} học sinh về mốc ${new Date(log.timestamp).toLocaleTimeString('vi-VN')}!`,
      restoredCount: restoredRecords.length,
    };
  } catch (err: any) {
    console.error('Lỗi khi khôi phục bảng điểm:', err);
    return {
      success: false,
      message: `Lỗi khôi phục: ${err.message || 'Không xác định'}`,
      restoredCount: 0,
    };
  }
}

/**
 * Rollback a single student's field back to its old value from a specific audit log
 */
export async function rollbackSingleDiff(
  logId: string,
  studentId: string | number,
  field: string,
  userRole: UserRole = 'Teacher'
): Promise<{ success: boolean; message: string }> {
  try {
    const log = await db.audit_logs.get(logId);
    if (!log || !log.diffs) {
      return { success: false, message: 'Không tìm thấy nhật ký biến động tương ứng.' };
    }

    const targetDiff = log.diffs.find(
      (d) => String(d.student_id) === String(studentId) && d.field === field
    );

    if (!targetDiff) {
      return { success: false, message: 'Không tìm thấy trường điểm cần hoàn tác trong nhật ký.' };
    }

    if (!log.session_id) {
      return { success: false, message: 'Thiếu thông tin buổi học trong bản ghi log.' };
    }

    // Find student_session record
    const sessRecords = await db.student_sessions
      .where('session_id')
      .equals(log.session_id as any)
      .toArray();

    const existing = sessRecords.find((r) => String(r.student_id) === String(studentId));
    if (!existing || !existing.id) {
      return { success: false, message: 'Không tìm thấy bản ghi điểm của học sinh này trong CSDL.' };
    }

    const updated = {
      ...existing,
      [field]: targetDiff.old_value,
      updated_at: new Date().toISOString(),
    };

    await db.student_sessions.put(updated);
    await pushSingleDocToFirestore('student_sessions', existing.id, updated, false);

    // Add log
    await db.audit_logs.add({
      user_role: userRole,
      action_type: 'Hoàn tác điểm học sinh',
      description: `Hoàn tác ${targetDiff.field_label} của học sinh "${targetDiff.student_name}" về giá trị cũ: ${targetDiff.old_display}`,
      session_id: log.session_id,
      class_id: log.class_id,
      student_id: studentId,
      student_name: targetDiff.student_name,
      timestamp: new Date().toISOString(),
    });

    return {
      success: true,
      message: `Đã hoàn tác ${targetDiff.field_label} của học sinh ${targetDiff.student_name} về ${targetDiff.old_display}!`,
    };
  } catch (err: any) {
    console.error('Lỗi khi hoàn tác 1 điểm:', err);
    return { success: false, message: `Lỗi: ${err.message || 'Không xác định'}` };
  }
}
