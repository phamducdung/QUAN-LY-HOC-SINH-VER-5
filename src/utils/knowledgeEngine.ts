import { db } from '../db/dexie';

/**
 * Hàm tập trung recalculateKnowledgeMastery:
 * Tự động quét lại toàn bộ lịch sử các buổi học thuộc Chuyên đề (knowledgeTagId)
 * của Học sinh (studentId) và tính lại điểm tích lũy chuyên đề (KnowledgeResult) chuẩn xác 100%
 * dù có sửa điểm quá khứ.
 */
export async function recalculateKnowledgeMastery(
  studentId: string | number,
  knowledgeTagId: string | number
): Promise<number | null> {
  const targetStudentId = String(studentId);
  const targetTagId = String(knowledgeTagId);

  // Lấy thông tin tag
  const tag = await db.knowledge_tags.get(targetTagId);
  const allSessions = await db.sessions.toArray();

  // Tìm tất cả các buổi học thuộc chuyên đề này (bằng ID, tên bài học hoặc chủ đề bài kiểm tra)
  const matchedSessions = allSessions.filter(
    (s) =>
      String(s.knowledge_tag_id) === targetTagId ||
      (tag && s.lesson_title && s.lesson_title.toLowerCase().includes(tag.tag_name.toLowerCase())) ||
      (tag && s.test_knowledge_tag && s.test_knowledge_tag !== 'same' && s.test_knowledge_tag.toLowerCase().includes(tag.tag_name.toLowerCase()))
  );

  if (matchedSessions.length === 0) return null;

  const matchedSessionIds = matchedSessions.map((s) => String(s.id));
  const sessionMap = new Map(matchedSessions.map((s) => [String(s.id), s]));

  // Lấy tất cả student_sessions của học sinh này trong các buổi học thuộc tag
  const allStudentSessions = await db.student_sessions
    .where('student_id')
    .equals(targetStudentId)
    .toArray();

  const relevantStudentSessions = allStudentSessions.filter(
    (ss) =>
      !(ss.exempt || ss.exempt_test) &&
      matchedSessionIds.includes(String(ss.session_id)) &&
      (ss.attendance === 'present' || ss.attendance === 'late')
  );

  if (relevantStudentSessions.length === 0) {
    // Nếu học sinh không còn buổi học nào hợp lệ cho chuyên đề này, cập nhật bản ghi thành 0 nếu có
    const existing = await db.knowledge_results
      .where({ student_id: targetStudentId, knowledge_tag_id: targetTagId })
      .first();

    if (existing && existing.id) {
      const now = new Date().toISOString();
      const payload = {
        ...existing,
        mastery_score: 0,
        last_updated: now,
      };
      await db.knowledge_results.put(payload);
    }
    return 0;
  }

  // Tính trung bình điểm tích lũy chuyên đề
  let totalScore = 0;
  let count = 0;
  relevantStudentSessions.forEach((ss) => {
    const sess = sessionMap.get(String(ss.session_id));
    const isHwExempt = ss.exempt || ss.exempt_homework;
    const isTestExempt = ss.exempt || ss.exempt_test;
    const hasTest = sess?.has_test !== false && !isTestExempt && typeof ss.test_score === 'number';
    const hasHw = sess?.has_homework !== false && !isHwExempt && typeof ss.homework_score === 'number';

    if (!hasTest && !hasHw) return;

    let score = 0;
    if (hasTest && hasHw) {
      score = ss.test_score * 0.6 + ss.homework_score * 0.4;
    } else if (hasTest) {
      score = ss.test_score;
    } else if (hasHw) {
      score = ss.homework_score;
    }
    totalScore += score;
    count++;
  });

  if (count === 0) return 0;
  const avgMasteryScore = Number((totalScore / count).toFixed(1));
  const now = new Date().toISOString();

  const existing = await db.knowledge_results
    .where({ student_id: targetStudentId, knowledge_tag_id: targetTagId })
    .first();

  const recordId = existing?.id || `kr_${targetStudentId}_${targetTagId}`;
  const payload = {
    id: recordId,
    student_id: targetStudentId,
    knowledge_tag_id: targetTagId,
    mastery_score: avgMasteryScore,
    last_updated: now,
  };

  await db.knowledge_results.put(payload);

  return avgMasteryScore;
}

/**
 * Tự động tổng hợp & cập nhật điểm tích lũy theo Chuyên đề môn Toán (KnowledgeResult)
 * dựa trên tất cả các buổi học và điểm của toàn bộ học sinh trong lớp.
 */
export async function recalculateKnowledgeResultsForClass(classId: string | number): Promise<number> {
  const targetClassId = String(classId);
  const classSessions = await db.sessions.where('class_id').equals(targetClassId).toArray();
  if (classSessions.length === 0) return 0;

  const allTags = await db.knowledge_tags.toArray();
  const sessionIds = classSessions.map((s) => s.id!).filter(Boolean);
  const sessionMap = new Map(classSessions.map((s) => [String(s.id), s]));

  // Lấy tất cả điểm của các học sinh thuộc các buổi học trong lớp này
  const studentSessions = await db.student_sessions
    .where('session_id')
    .anyOf(sessionIds)
    .toArray();

  if (studentSessions.length === 0) return 0;

  // Gom nhóm điểm theo (student_id, knowledge_tag_id)
  const studentTagScores: Record<string, Record<string, number[]>> = {};

  studentSessions.forEach((ss) => {
    if (ss.exempt || ss.exempt_test) return;
    if (ss.attendance !== 'present' && ss.attendance !== 'late') return;
    const sess = sessionMap.get(String(ss.session_id));
    if (!sess) return;

    // Tìm tag_id phù hợp từ session
    let tagId = sess.knowledge_tag_id ? String(sess.knowledge_tag_id) : undefined;
    if (!tagId && sess.test_knowledge_tag && sess.test_knowledge_tag !== 'same') {
      const matched = allTags.find((t) =>
        sess.test_knowledge_tag!.toLowerCase().includes(t.tag_name.toLowerCase()) ||
        t.tag_name.toLowerCase().includes(sess.test_knowledge_tag!.toLowerCase())
      );
      if (matched && matched.id) {
        tagId = String(matched.id);
      }
    }
    if (!tagId && sess.lesson_title) {
      const matched = allTags.find((t) =>
        sess.lesson_title.toLowerCase().includes(t.tag_name.toLowerCase())
      );
      if (matched && matched.id) {
        tagId = String(matched.id);
      }
    }

    if (!tagId) return;

    // Tính điểm của buổi học này cho chuyên đề
    const isHwExempt = ss.exempt || ss.exempt_homework;
    const isTestExempt = ss.exempt || ss.exempt_test;
    const hasTest = sess.has_test !== false && !isTestExempt && typeof ss.test_score === 'number';
    const hasHw = sess.has_homework !== false && !isHwExempt && typeof ss.homework_score === 'number';

    if (!hasTest && !hasHw) return;

    let score = 0;
    if (hasTest && hasHw) {
      score = ss.test_score * 0.6 + ss.homework_score * 0.4;
    } else if (hasTest) {
      score = ss.test_score;
    } else if (hasHw) {
      score = ss.homework_score;
    }

    const studentKey = String(ss.student_id);
    if (!studentTagScores[studentKey]) {
      studentTagScores[studentKey] = {};
    }
    if (!studentTagScores[studentKey][tagId]) {
      studentTagScores[studentKey][tagId] = [];
    }
    studentTagScores[studentKey][tagId].push(score);
  });

  const now = new Date().toISOString();
  
  // Pre-fetch all existing knowledge_results in 1 query
  const existingResults = await db.knowledge_results.toArray();
  const existingMap = new Map(existingResults.map((kr) => [`${kr.student_id}_${kr.knowledge_tag_id}`, kr.id]));

  const dexiePayloads: any[] = [];

  for (const [studentId, tagsMap] of Object.entries(studentTagScores)) {
    for (const [tagId, scores] of Object.entries(tagsMap)) {
      if (scores.length === 0) continue;
      const avgScore = Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1));

      const existingId = existingMap.get(`${studentId}_${tagId}`);
      const recordId = existingId || `kr_${studentId}_${tagId}`;
      const payload = {
        id: recordId,
        student_id: studentId,
        knowledge_tag_id: tagId,
        mastery_score: avgScore,
        last_updated: now,
      };

      dexiePayloads.push(payload);
    }
  }

  if (dexiePayloads.length > 0) {
    await db.knowledge_results.bulkPut(dexiePayloads);
  }

  return dexiePayloads.length;
}
