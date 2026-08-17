import { db } from '../db/dexie';
import { UserRole } from '../types';

export async function logAudit(
  userRole: UserRole = 'Teacher',
  actionType: string = 'Hành động',
  description: string = ''
) {
  try {
    await db.audit_logs.add({
      user_role: userRole,
      action_type: actionType,
      description: description,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Lỗi khi ghi nhật ký Audit Log:', err);
  }
}
