import { relations } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

// 1. Users Table (Linked with Firebase Auth UID)
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  role: text('role').default('teacher').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// 2. School Years Table
export const schoolYears = pgTable('school_years', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  updatedAt: text('updated_at').notNull(),
  payload: jsonb('payload').notNull(),
});

// 3. Classes Table
export const classes = pgTable('classes', {
  id: text('id').primaryKey(),
  schoolYearId: text('school_year_id').notNull(),
  className: text('class_name').notNull(),
  gradeLevel: integer('grade_level').notNull(),
  status: text('status').default('active').notNull(),
  updatedAt: text('updated_at').notNull(),
  payload: jsonb('payload').notNull(),
});

// 4. Students Table
export const students = pgTable('students', {
  id: text('id').primaryKey(),
  fullName: text('full_name').notNull(),
  parentPhone: text('parent_phone').default('').notNull(),
  status: text('status').default('studying').notNull(),
  updatedAt: text('updated_at').notNull(),
  payload: jsonb('payload').notNull(),
});

// 5. Class Students (Enrollment Join Table: cs_${class_id}_${student_id})
export const classStudents = pgTable('class_students', {
  id: text('id').primaryKey(),
  classId: text('class_id').notNull(),
  studentId: text('student_id').notNull(),
  joinDate: text('join_date').default('').notNull(),
  leaveDate: text('leave_date'),
  updatedAt: text('updated_at').notNull(),
  payload: jsonb('payload').notNull(),
});

// 6. Sessions Table
export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  classId: text('class_id').notNull(),
  sessionDate: text('session_date').notNull(),
  lessonTitle: text('lesson_title').notNull(),
  updatedAt: text('updated_at').notNull(),
  payload: jsonb('payload').notNull(),
});

// 7. Student Sessions (Grades & Attendance: ss_${session_id}_${student_id})
export const studentSessions = pgTable('student_sessions', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  studentId: text('student_id').notNull(),
  attendance: text('attendance').default('present').notNull(),
  homeworkScore: doublePrecision('homework_score'),
  testScore: doublePrecision('test_score'),
  updatedAt: text('updated_at').notNull(),
  payload: jsonb('payload').notNull(),
});

// 8. Knowledge Tags Table
export const knowledgeTags = pgTable('knowledge_tags', {
  id: text('id').primaryKey(),
  gradeLevel: integer('grade_level').notNull(),
  category: text('category').notNull(),
  tagName: text('tag_name').notNull(),
  updatedAt: text('updated_at').notNull(),
  payload: jsonb('payload').notNull(),
});

// 9. Knowledge Results Table (kr_${student_id}_${knowledge_tag_id})
export const knowledgeResults = pgTable('knowledge_results', {
  id: text('id').primaryKey(),
  studentId: text('student_id').notNull(),
  knowledgeTagId: text('knowledge_tag_id').notNull(),
  updatedAt: text('updated_at').notNull(),
  payload: jsonb('payload').notNull(),
});

// 10. Warnings Table
export const warnings = pgTable('warnings', {
  id: text('id').primaryKey(),
  studentId: text('student_id').notNull(),
  classId: text('class_id').notNull(),
  priority: text('priority').notNull(),
  resolved: boolean('resolved').default(false).notNull(),
  updatedAt: text('updated_at').notNull(),
  payload: jsonb('payload').notNull(),
});

// 11. AI Diagnoses Table
export const aiDiagnoses = pgTable('ai_diagnoses', {
  id: text('id').primaryKey(),
  studentId: text('student_id').notNull(),
  updatedAt: text('updated_at').notNull(),
  payload: jsonb('payload').notNull(),
});

// 12. Audit Logs Table
export const auditLogs = pgTable('audit_logs', {
  id: text('id').primaryKey(),
  actionType: text('action_type').notNull(),
  timestamp: text('timestamp').notNull(),
  updatedAt: text('updated_at').notNull(),
  payload: jsonb('payload').notNull(),
});

// 13. Settings Table (system_settings)
export const settings = pgTable('settings', {
  id: text('id').primaryKey(),
  updatedAt: text('updated_at').notNull(),
  payload: jsonb('payload').notNull(),
});

// 14. Deleted Records (Tombstones for Multi-Device Deletion Reconciliation)
export const deletedRecords = pgTable('deleted_records', {
  id: text('id').primaryKey(),
  tableName: text('table_name').notNull(),
  recordId: text('record_id').notNull(),
  deletedAt: text('deleted_at').notNull(),
});

// Relations
export const classesRelations = relations(classes, ({ many }) => ({
  enrollments: many(classStudents),
  sessions: many(sessions),
}));

export const studentsRelations = relations(students, ({ many }) => ({
  enrollments: many(classStudents),
  sessionGrades: many(studentSessions),
}));

export const classStudentsRelations = relations(classStudents, ({ one }) => ({
  classItem: one(classes, {
    fields: [classStudents.classId],
    references: [classes.id],
  }),
  student: one(students, {
    fields: [classStudents.studentId],
    references: [students.id],
  }),
}));

export const sessionsRelations = relations(sessions, ({ one, many }) => ({
  classItem: one(classes, {
    fields: [sessions.classId],
    references: [classes.id],
  }),
  studentGrades: many(studentSessions),
}));

export const studentSessionsRelations = relations(studentSessions, ({ one }) => ({
  session: one(sessions, {
    fields: [studentSessions.sessionId],
    references: [sessions.id],
  }),
  student: one(students, {
    fields: [studentSessions.studentId],
    references: [students.id],
  }),
}));
