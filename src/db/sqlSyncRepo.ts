import { eq, inArray, desc } from 'drizzle-orm';
import { db } from './index.ts';
import {
  schoolYears,
  classes,
  students,
  classStudents,
  sessions,
  studentSessions,
  knowledgeTags,
  knowledgeResults,
  warnings,
  aiDiagnoses,
  auditLogs,
  settings,
  deletedRecords,
} from './schema.ts';

export const SQL_TABLE_NAMES = [
  'school_years',
  'classes',
  'students',
  'class_students',
  'sessions',
  'student_sessions',
  'knowledge_tags',
  'knowledge_results',
  'warnings',
  'ai_diagnoses',
  'audit_logs',
  'settings',
] as const;

export type SqlTableName = (typeof SQL_TABLE_NAMES)[number];

const TABLE_MAP: Record<SqlTableName, any> = {
  school_years: schoolYears,
  classes: classes,
  students: students,
  class_students: classStudents,
  sessions: sessions,
  student_sessions: studentSessions,
  knowledge_tags: knowledgeTags,
  knowledge_results: knowledgeResults,
  warnings: warnings,
  ai_diagnoses: aiDiagnoses,
  audit_logs: auditLogs,
  settings: settings,
};

function buildRowForTable(tableName: SqlTableName, docId: string, rawData: any) {
  const now = new Date().toISOString();
  const updatedAt = String(rawData?.updated_at || rawData?.last_updated || now);
  const payload = {
    ...rawData,
    id: docId,
    updated_at: updatedAt,
  };

  switch (tableName) {
    case 'school_years':
      return {
        id: docId,
        name: String(rawData?.name || ''),
        isActive: Boolean(rawData?.is_active ?? true),
        updatedAt,
        payload,
      };
    case 'classes':
      return {
        id: docId,
        schoolYearId: String(rawData?.school_year_id || ''),
        className: String(rawData?.class_name || ''),
        gradeLevel: Number(rawData?.grade_level || 9),
        status: String(rawData?.status || 'active'),
        updatedAt,
        payload,
      };
    case 'students':
      return {
        id: docId,
        fullName: String(rawData?.full_name || ''),
        parentPhone: String(rawData?.parent_phone || ''),
        status: String(rawData?.status || 'studying'),
        updatedAt,
        payload,
      };
    case 'class_students':
      return {
        id: docId,
        classId: String(rawData?.class_id || ''),
        studentId: String(rawData?.student_id || ''),
        joinDate: String(rawData?.join_date || ''),
        leaveDate: rawData?.leave_date ? String(rawData.leave_date) : null,
        updatedAt,
        payload,
      };
    case 'sessions':
      return {
        id: docId,
        classId: String(rawData?.class_id || ''),
        sessionDate: String(rawData?.session_date || ''),
        lessonTitle: String(rawData?.lesson_title || ''),
        updatedAt,
        payload,
      };
    case 'student_sessions':
      return {
        id: docId,
        sessionId: String(rawData?.session_id || ''),
        studentId: String(rawData?.student_id || ''),
        attendance: String(rawData?.attendance || 'present'),
        homeworkScore:
          typeof rawData?.homework_score === 'number' && !Number.isNaN(rawData.homework_score)
            ? rawData.homework_score
            : null,
        testScore:
          typeof rawData?.test_score === 'number' && !Number.isNaN(rawData.test_score)
            ? rawData.test_score
            : null,
        updatedAt,
        payload,
      };
    case 'knowledge_tags':
      return {
        id: docId,
        gradeLevel: Number(rawData?.grade_level || 9),
        category: String(rawData?.category || 'Algebra'),
        tagName: String(rawData?.tag_name || ''),
        updatedAt,
        payload,
      };
    case 'knowledge_results':
      return {
        id: docId,
        studentId: String(rawData?.student_id || ''),
        knowledgeTagId: String(rawData?.knowledge_tag_id || ''),
        updatedAt,
        payload,
      };
    case 'warnings':
      return {
        id: docId,
        studentId: String(rawData?.student_id || ''),
        classId: String(rawData?.class_id || ''),
        priority: String(rawData?.priority || 'Medium'),
        resolved: Boolean(rawData?.resolved ?? false),
        updatedAt,
        payload,
      };
    case 'ai_diagnoses':
      return {
        id: docId,
        studentId: String(rawData?.student_id || ''),
        updatedAt,
        payload,
      };
    case 'audit_logs':
      return {
        id: docId,
        actionType: String(rawData?.action_type || ''),
        timestamp: String(rawData?.timestamp || updatedAt),
        updatedAt,
        payload,
      };
    case 'settings':
      return {
        id: docId,
        updatedAt,
        payload,
      };
  }
}

async function upsertSingleRow(tableName: SqlTableName, row: any) {
  try {
    switch (tableName) {
      case 'school_years':
        await db
          .insert(schoolYears)
          .values(row)
          .onConflictDoUpdate({
            target: schoolYears.id,
            set: {
              name: row.name,
              isActive: row.isActive,
              updatedAt: row.updatedAt,
              payload: row.payload,
            },
          });
        break;
      case 'classes':
        await db
          .insert(classes)
          .values(row)
          .onConflictDoUpdate({
            target: classes.id,
            set: {
              schoolYearId: row.schoolYearId,
              className: row.className,
              gradeLevel: row.gradeLevel,
              status: row.status,
              updatedAt: row.updatedAt,
              payload: row.payload,
            },
          });
        break;
      case 'students':
        await db
          .insert(students)
          .values(row)
          .onConflictDoUpdate({
            target: students.id,
            set: {
              fullName: row.fullName,
              parentPhone: row.parentPhone,
              status: row.status,
              updatedAt: row.updatedAt,
              payload: row.payload,
            },
          });
        break;
      case 'class_students':
        await db
          .insert(classStudents)
          .values(row)
          .onConflictDoUpdate({
            target: classStudents.id,
            set: {
              classId: row.classId,
              studentId: row.studentId,
              joinDate: row.joinDate,
              leaveDate: row.leaveDate,
              updatedAt: row.updatedAt,
              payload: row.payload,
            },
          });
        break;
      case 'sessions':
        await db
          .insert(sessions)
          .values(row)
          .onConflictDoUpdate({
            target: sessions.id,
            set: {
              classId: row.classId,
              sessionDate: row.sessionDate,
              lessonTitle: row.lessonTitle,
              updatedAt: row.updatedAt,
              payload: row.payload,
            },
          });
        break;
      case 'student_sessions':
        await db
          .insert(studentSessions)
          .values(row)
          .onConflictDoUpdate({
            target: studentSessions.id,
            set: {
              sessionId: row.sessionId,
              studentId: row.studentId,
              attendance: row.attendance,
              homeworkScore: row.homeworkScore,
              testScore: row.testScore,
              updatedAt: row.updatedAt,
              payload: row.payload,
            },
          });
        break;
      case 'knowledge_tags':
        await db
          .insert(knowledgeTags)
          .values(row)
          .onConflictDoUpdate({
            target: knowledgeTags.id,
            set: {
              gradeLevel: row.gradeLevel,
              category: row.category,
              tagName: row.tagName,
              updatedAt: row.updatedAt,
              payload: row.payload,
            },
          });
        break;
      case 'knowledge_results':
        await db
          .insert(knowledgeResults)
          .values(row)
          .onConflictDoUpdate({
            target: knowledgeResults.id,
            set: {
              studentId: row.studentId,
              knowledgeTagId: row.knowledgeTagId,
              updatedAt: row.updatedAt,
              payload: row.payload,
            },
          });
        break;
      case 'warnings':
        await db
          .insert(warnings)
          .values(row)
          .onConflictDoUpdate({
            target: warnings.id,
            set: {
              studentId: row.studentId,
              classId: row.classId,
              priority: row.priority,
              resolved: row.resolved,
              updatedAt: row.updatedAt,
              payload: row.payload,
            },
          });
        break;
      case 'ai_diagnoses':
        await db
          .insert(aiDiagnoses)
          .values(row)
          .onConflictDoUpdate({
            target: aiDiagnoses.id,
            set: {
              studentId: row.studentId,
              updatedAt: row.updatedAt,
              payload: row.payload,
            },
          });
        break;
      case 'audit_logs':
        await db
          .insert(auditLogs)
          .values(row)
          .onConflictDoUpdate({
            target: auditLogs.id,
            set: {
              actionType: row.actionType,
              timestamp: row.timestamp,
              updatedAt: row.updatedAt,
              payload: row.payload,
            },
          });
        break;
      case 'settings':
        await db
          .insert(settings)
          .values(row)
          .onConflictDoUpdate({
            target: settings.id,
            set: {
              updatedAt: row.updatedAt,
              payload: row.payload,
            },
          });
        break;
    }
  } catch (error) {
    throw new Error(`Failed to upsert row ${row?.id} in table ${tableName}`, { cause: error });
  }
}

export async function pullAllSqlData() {
  try {
    const [
      syRows,
      clsRows,
      stuRows,
      csRows,
      sessRows,
      ssRows,
      ktRows,
      krRows,
      warnRows,
      aiRows,
      logRows,
      setRows,
      tombRows,
    ] = await Promise.all([
      db.select().from(schoolYears),
      db.select().from(classes),
      db.select().from(students),
      db.select().from(classStudents),
      db.select().from(sessions),
      db.select().from(studentSessions),
      db.select().from(knowledgeTags),
      db.select().from(knowledgeResults),
      db.select().from(warnings),
      db.select().from(aiDiagnoses),
      db.select().from(auditLogs).orderBy(desc(auditLogs.timestamp)).limit(100),
      db.select().from(settings),
      db.select().from(deletedRecords),
    ]);

    const unpack = (rows: any[]) =>
      rows.map((r) => ({
        ...(typeof r.payload === 'object' && r.payload !== null ? r.payload : {}),
        id: r.id,
        updated_at: r.updatedAt,
      }));

    return {
      tables: {
        school_years: unpack(syRows),
        classes: unpack(clsRows),
        students: unpack(stuRows),
        class_students: unpack(csRows),
        sessions: unpack(sessRows),
        student_sessions: unpack(ssRows),
        knowledge_tags: unpack(ktRows),
        knowledge_results: unpack(krRows),
        warnings: unpack(warnRows),
        ai_diagnoses: unpack(aiRows),
        audit_logs: unpack(logRows),
        settings: unpack(setRows),
      },
      tombstones: tombRows.map((t) => ({
        id: t.id,
        table_name: t.tableName,
        record_id: t.recordId,
        deleted_at: t.deletedAt,
      })),
    };
  } catch (error) {
    throw new Error('Failed to pull data from Cloud SQL PostgreSQL', { cause: error });
  }
}

export interface SqlMutationInput {
  tableName: SqlTableName;
  docId: string;
  data: any;
}

export interface SqlDeletionInput {
  tableName: SqlTableName;
  docId: string;
  deletedAt: string;
}

export async function pushSqlBatch(
  mutations: SqlMutationInput[] = [],
  deletions: SqlDeletionInput[] = []
) {
  try {
    let upsertedCount = 0;
    let deletedCount = 0;
    let touchedAuditLogs = false;

    for (const m of mutations) {
      if (!m?.tableName || !m?.docId || !m?.data) continue;
      if (!SQL_TABLE_NAMES.includes(m.tableName)) continue;
      if (m.data.is_demo === true) continue;

      const row = buildRowForTable(m.tableName, String(m.docId), m.data);
      await upsertSingleRow(m.tableName, row);

      // Remove any previous tombstone for this record
      const tombId = `${m.tableName}_${String(m.docId)}`;
      await db.delete(deletedRecords).where(eq(deletedRecords.id, tombId));

      if (m.tableName === 'audit_logs') {
        touchedAuditLogs = true;
      }
      upsertedCount++;
    }

    for (const d of deletions) {
      if (!d?.tableName || !d?.docId) continue;
      if (!SQL_TABLE_NAMES.includes(d.tableName)) continue;

      const targetTable = TABLE_MAP[d.tableName];
      const recId = String(d.docId);
      const tombId = `${d.tableName}_${recId}`;
      const deletedAt = d.deletedAt || new Date().toISOString();

      await db.delete(targetTable).where(eq(targetTable.id, recId));
      await db
        .insert(deletedRecords)
        .values({
          id: tombId,
          tableName: d.tableName,
          recordId: recId,
          deletedAt,
        })
        .onConflictDoUpdate({
          target: deletedRecords.id,
          set: {
            tableName: d.tableName,
            recordId: recId,
            deletedAt,
          },
        });
      deletedCount++;
    }

    // Retain only the newest 100 audit_logs in Cloud SQL as agreed in the plan
    if (touchedAuditLogs) {
      const allLogs = await db
        .select({ id: auditLogs.id, timestamp: auditLogs.timestamp })
        .from(auditLogs)
        .orderBy(desc(auditLogs.timestamp));

      if (allLogs.length > 100) {
        const excessIds = allLogs.slice(100).map((l) => l.id);
        if (excessIds.length > 0) {
          await db.delete(auditLogs).where(inArray(auditLogs.id, excessIds));
        }
      }
    }

    return { upsertedCount, deletedCount };
  } catch (error) {
    throw new Error('Failed to push batch to Cloud SQL PostgreSQL', { cause: error });
  }
}

export async function clearAllSqlData() {
  try {
    const tablesToClear: SqlTableName[] = [
      'school_years',
      'classes',
      'students',
      'class_students',
      'sessions',
      'student_sessions',
      'knowledge_results',
      'warnings',
      'ai_diagnoses',
      'audit_logs',
    ];
    const now = new Date().toISOString();

    for (const tName of tablesToClear) {
      const table = TABLE_MAP[tName];
      const existing = await db.select({ id: table.id }).from(table);
      for (const row of existing) {
        const tombId = `${tName}_${row.id}`;
        await db
          .insert(deletedRecords)
          .values({
            id: tombId,
            tableName: tName,
            recordId: String(row.id),
            deletedAt: now,
          })
          .onConflictDoUpdate({
            target: deletedRecords.id,
            set: { deletedAt: now },
          });
      }
      await db.delete(table);
    }

    return { cleared: true };
  } catch (error) {
    throw new Error('Failed to clear Cloud SQL data', { cause: error });
  }
}
