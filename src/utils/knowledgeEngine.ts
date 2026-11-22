import { db, pushBatchDocsToFirestore } from '../db/dexie';
import { KnowledgeTag, Session, Student, StudentSession } from '../types';

export interface TopicDetailHistory {
  sessionId: string;
  sessionDate: string;
  lessonTitle: string;
  homeworkScore?: number;
  testScore?: number;
  effectiveScore: number;
  weight: number;
  attendance: string;
}

export interface TopicMasteryAnalysis {
  tagId: string;
  subject: string;
  fullTagName: string;
  category: 'Algebra' | 'Geometry';
  gradeLevel: number;
  studentScore: number;
  classAvg: number;
  fullMark: number;
  sessionCount: number;
  hasRealData: boolean;
  trend: 'improving' | 'declining' | 'stable' | 'insufficient_data';
  trendDelta: number; // Chênh lệch giữa 2 bài kiểm tra gần nhất của chuyên đề
  status: 'mastered' | 'proficient' | 'developing' | 'critical_gap' | 'untested';
  history: TopicDetailHistory[];
}

export interface StudentTopicGapItem {
  studentId: string;
  studentName: string;
  className: string;
  parentName?: string;
  parentPhone?: string;
  testAvgScore: number;
  testCount: number;
  trend: 'improving' | 'declining' | 'stable' | 'insufficient_data';
  trendDelta: number;
  status: 'developing' | 'critical_gap';
}

export interface ClassTopicGapGroup {
  tagId: string;
  tagName: string;
  category: 'Algebra' | 'Geometry';
  gradeLevel: number;
  classAvg: number;
  totalTestedStudents: number;
  gapStudents: StudentTopicGapItem[];
}

/**
 * Chuẩn hóa Kaizen Bản Đồ Kiến Thức Chuyên Đề:
 * - Chỉ tính 100% Điểm Kiểm Tra (test_score) để đo lường chính xác năng lực thực chiến của học sinh ở từng chuyên đề.
 * - Nếu buổi học không tổ chức kiểm tra (has_test === false), hoặc học sinh được miễn kiểm tra (exempt / exempt_test),
 *   hoặc học sinh vắng có phép (absent_excused) -> trả về null (không tính vào mẫu số bài kiểm tra).
 * - Nếu buổi học có bài kiểm tra mà học sinh vắng không phép (absent_unexcused) -> tính 0đ.
 * - Nếu học sinh có điểm test_score hợp lệ (>= 0) -> lấy 100% test_score.
 * - Nếu buổi học xác nhận có kiểm tra (has_test === true) mà học sinh bỏ trống điểm kiểm tra (không được miễn) -> tính 0đ.
 */
export function computeSessionEffectiveScore(
  ss: StudentSession,
  sess?: Session,
  sessionHasAnyTestScore: boolean = false
): number | null {
  const isTestExempt = Boolean(ss.exempt || ss.exempt_test);
  if (isTestExempt) return null;
  if (sess?.has_test === false) return null;
  if (ss.attendance === 'absent_excused') return null;

  const hasValidTestScore =
    typeof ss.test_score === 'number' && !Number.isNaN(ss.test_score) && ss.test_score >= 0;

  // Nếu học sinh có điểm kiểm tra hợp lệ -> lấy 100% Điểm Kiểm Tra
  if (hasValidTestScore) {
    return Number(ss.test_score!.toFixed(2));
  }

  // Nếu buổi học đó thực sự có tổ chức kiểm tra (sess.has_test === true hoặc có học sinh khác trong buổi có điểm KT)
  const sessionActuallyHadTest = sess?.has_test === true || sessionHasAnyTestScore;
  if (!sessionActuallyHadTest) {
    return null;
  }

  // Học sinh vắng không phép hoặc có mặt nhưng bỏ bài kiểm tra trong buổi có kiểm tra -> 0đ
  if (
    ss.attendance === 'absent_unexcused' ||
    ss.attendance === 'present' ||
    ss.attendance === 'late'
  ) {
    return 0;
  }

  return null;
}

/**
 * Thuật toán Tính Điểm Làm Chủ Chuyên Đề (100% Điểm Kiểm Tra Thực Tế) & Xu Hướng 2 Bài Kiểm Tra Gần Nhất:
 * - Bỏ hệ số nhân lũy thừa thời gian ngầm (Time-Decay 1.0 -> 1.8) để Điểm Chuyên Đề khớp 100% với trung bình cộng các bài kiểm tra thực tế của học sinh.
 * - Xu hướng (trend & trendDelta) được tính trực tiếp từ 2 bài kiểm tra gần nhất của chuyên đề đó, đồng bộ với Cửa sổ 2 Buổi của hệ thống.
 */
export function calculateWeightedMasteryWithTrend(
  items: Array<{ score: number; date: string; sessionData: any }>
): {
  masteryScore: number;
  trend: 'improving' | 'declining' | 'stable' | 'insufficient_data';
  trendDelta: number;
} {
  if (items.length === 0) {
    return { masteryScore: 0, trend: 'insufficient_data', trendDelta: 0 };
  }

  // Sắp xếp theo ngày tăng dần (cũ nhất -> mới nhất)
  const sorted = [...items].sort((a, b) => (a.date > b.date ? 1 : -1));
  const n = sorted.length;

  const sumScores = sorted.reduce((acc, item) => acc + item.score, 0);
  const masteryScore = Number((sumScores / n).toFixed(1));

  if (n === 1) {
    return {
      masteryScore,
      trend: 'stable',
      trendDelta: 0,
    };
  }

  // Xu hướng 2 bài kiểm tra gần nhất của chuyên đề
  const prevScore = sorted[n - 2].score;
  const latestScore = sorted[n - 1].score;
  const delta = Number((latestScore - prevScore).toFixed(1));

  let trend: 'improving' | 'declining' | 'stable' = 'stable';
  if (delta >= 0.5) trend = 'improving';
  else if (delta <= -0.5) trend = 'declining';

  return { masteryScore, trend, trendDelta: delta };
}

/**
 * Phân loại trạng thái làm chủ chuyên đề (theo chuẩn 100% Điểm Kiểm Tra)
 */
export function classifyMasteryStatus(
  score: number,
  sessionCount: number
): 'mastered' | 'proficient' | 'developing' | 'critical_gap' | 'untested' {
  if (sessionCount === 0) return 'untested';
  if (score >= 8.5) return 'mastered';
  if (score >= 7.0) return 'proficient';
  if (score >= 5.5) return 'developing';
  return 'critical_gap';
}

/**
 * Kiểm tra một buổi học (Session) có thuộc Chuyên đề (KnowledgeTag) hay không
 */
export function isSessionMatchingTag(s: Session, tag: KnowledgeTag): boolean {
  const tagId = String(tag.id || '');
  const cleanTagName = (tag.tag_name || '').toLowerCase().trim();
  if (!cleanTagName) return false;

  if (tagId && String(s.knowledge_tag_id) === tagId) return true;
  const lessonTitle = (s.lesson_title || '').toLowerCase();
  const testTag = (s.test_knowledge_tag || '').toLowerCase();

  if (lessonTitle && (lessonTitle.includes(cleanTagName) || cleanTagName.includes(lessonTitle))) {
    return true;
  }
  if (testTag && testTag !== 'same' && (testTag.includes(cleanTagName) || cleanTagName.includes(testTag))) {
    return true;
  }

  // Keyword-based fallback matching cho các chuyên đề Toán THCS trọng điểm
  if (cleanTagName.includes('căn thức') && (lessonTitle.includes('căn thức') || testTag.includes('căn thức'))) return true;
  if (cleanTagName.includes('vi-ét') && (lessonTitle.includes('vi-ét') || lessonTitle.includes('viet') || testTag.includes('vi-ét'))) return true;
  if (cleanTagName.includes('hệ phương trình') && (lessonTitle.includes('hệ phương trình') || lessonTitle.includes('hpt') || testTag.includes('hệ phương trình'))) return true;
  if (cleanTagName.includes('tứ giác nội tiếp') && (lessonTitle.includes('tứ giác nội tiếp') || testTag.includes('tứ giác nội tiếp'))) return true;
  if (cleanTagName.includes('hệ thức lượng') && (lessonTitle.includes('hệ thức lượng') || testTag.includes('hệ thức lượng'))) return true;
  if (cleanTagName.includes('đường tròn') && (lessonTitle.includes('đường tròn') || testTag.includes('đường tròn'))) return true;
  if (cleanTagName.includes('parabol') && (lessonTitle.includes('parabol') || testTag.includes('parabol'))) return true;
  if (cleanTagName.includes('hằng đẳng thức') && (lessonTitle.includes('hằng đẳng thức') || testTag.includes('hằng đẳng thức'))) return true;
  if (cleanTagName.includes('talét') && (lessonTitle.includes('talét') || lessonTitle.includes('talet') || testTag.includes('talét'))) return true;
  if (cleanTagName.includes('đồng dạng') && (lessonTitle.includes('đồng dạng') || testTag.includes('đồng dạng'))) return true;

  return false;
}

/**
 * Hàm tập trung recalculateKnowledgeMastery:
 * Tự động quét lại toàn bộ lịch sử các bài kiểm tra thuộc Chuyên đề (knowledgeTagId)
 * của Học sinh (studentId) và tính lại điểm tích lũy chuyên đề (100% Điểm Kiểm Tra).
 */
export async function recalculateKnowledgeMastery(
  studentId: string | number,
  knowledgeTagId: string | number
): Promise<number | null> {
  const targetStudentId = String(studentId);
  const targetTagId = String(knowledgeTagId);

  const tag = await db.knowledge_tags.get(targetTagId);
  if (!tag) return null;

  const allSessions = await db.sessions.toArray();
  const matchedSessions = allSessions.filter((s) => isSessionMatchingTag(s, tag));
  if (matchedSessions.length === 0) return null;

  const matchedSessionIds = matchedSessions.map((s) => String(s.id));
  const sessionMap = new Map(matchedSessions.map((s) => [String(s.id), s]));

  const allStudentSessions = await db.student_sessions.toArray();
  const sessionHasTestMap = new Map<string, boolean>();
  allStudentSessions.forEach((row) => {
    const sid = String(row.session_id);
    if (typeof row.test_score === 'number' && row.test_score >= 0) {
      sessionHasTestMap.set(sid, true);
    }
  });

  const relevantStudentSessions = allStudentSessions.filter(
    (ss) =>
      String(ss.student_id) === targetStudentId &&
      matchedSessionIds.includes(String(ss.session_id))
  );

  const sessionScoreItems: Array<{ score: number; date: string; sessionData: any }> = [];

  relevantStudentSessions.forEach((ss) => {
    const sid = String(ss.session_id);
    const sess = sessionMap.get(sid);
    const score = computeSessionEffectiveScore(ss, sess, Boolean(sessionHasTestMap.get(sid)));
    if (score !== null) {
      sessionScoreItems.push({
        score,
        date: sess?.session_date || '2026-01-01',
        sessionData: sess,
      });
    }
  });

  if (sessionScoreItems.length === 0) return null;

  const { masteryScore } = calculateWeightedMasteryWithTrend(sessionScoreItems);
  const now = new Date().toISOString();

  const existing = await db.knowledge_results
    .where({ student_id: targetStudentId, knowledge_tag_id: targetTagId })
    .first();

  const recordId = existing?.id || `kr_${targetStudentId}_${targetTagId}`;
  const payload = {
    id: recordId,
    student_id: targetStudentId,
    knowledge_tag_id: targetTagId,
    mastery_score: masteryScore,
    last_updated: now,
  };

  await db.knowledge_results.put(payload);
  return masteryScore;
}

/**
 * Tự động tổng hợp & cập nhật điểm tích lũy Chuyên đề môn Toán (100% Điểm Kiểm Tra)
 * cho toàn bộ học sinh trong một lớp học.
 */
export async function recalculateKnowledgeResultsForClass(classId: string | number): Promise<number> {
  const targetClassId = String(classId);
  const allSess = await db.sessions.toArray();
  const classSessions = allSess.filter((s) => String(s.class_id) === targetClassId);
  if (classSessions.length === 0) return 0;

  const allTags = await db.knowledge_tags.toArray();
  const sessionIdSet = new Set(classSessions.map((s) => String(s.id)).filter(Boolean));
  const sessionMap = new Map(classSessions.map((s) => [String(s.id), s]));

  const allStudSess = await db.student_sessions.toArray();
  const studentSessions = allStudSess.filter((ss) =>
    sessionIdSet.has(String(ss.session_id))
  );

  if (studentSessions.length === 0) return 0;

  const sessionHasTestMap = new Map<string, boolean>();
  studentSessions.forEach((row) => {
    const sid = String(row.session_id);
    if (typeof row.test_score === 'number' && row.test_score >= 0) {
      sessionHasTestMap.set(sid, true);
    }
  });

  const studentTagScores: Record<string, Record<string, Array<{ score: number; date: string; sessionData: any }>>> = {};

  studentSessions.forEach((ss) => {
    const sid = String(ss.session_id);
    const sess = sessionMap.get(sid);
    if (!sess) return;

    const matchedTag = allTags.find((t) => isSessionMatchingTag(sess, t));
    const tagId = sess.knowledge_tag_id
      ? String(sess.knowledge_tag_id)
      : matchedTag?.id
      ? String(matchedTag.id)
      : undefined;

    if (!tagId) return;

    const score = computeSessionEffectiveScore(ss, sess, Boolean(sessionHasTestMap.get(sid)));
    if (score === null) return;

    const studentKey = String(ss.student_id);
    if (!studentTagScores[studentKey]) {
      studentTagScores[studentKey] = {};
    }
    if (!studentTagScores[studentKey][tagId]) {
      studentTagScores[studentKey][tagId] = [];
    }
    studentTagScores[studentKey][tagId].push({
      score,
      date: sess.session_date || '2026-01-01',
      sessionData: sess,
    });
  });

  const now = new Date().toISOString();
  const existingResults = await db.knowledge_results.toArray();
  const existingMap = new Map(existingResults.map((kr) => [`${kr.student_id}_${kr.knowledge_tag_id}`, kr.id]));

  const dexiePayloads: any[] = [];

  for (const [studentId, tagsMap] of Object.entries(studentTagScores)) {
    for (const [tagId, items] of Object.entries(tagsMap)) {
      if (items.length === 0) continue;
      const { masteryScore } = calculateWeightedMasteryWithTrend(items);

      const existingId = existingMap.get(`${studentId}_${tagId}`);
      const recordId = existingId || `kr_${studentId}_${tagId}`;
      const payload = {
        id: recordId,
        student_id: studentId,
        knowledge_tag_id: tagId,
        mastery_score: masteryScore,
        last_updated: now,
      };

      dexiePayloads.push(payload);
    }
  }

  if (dexiePayloads.length > 0) {
    await db.knowledge_results.bulkPut(dexiePayloads);
    await pushBatchDocsToFirestore('knowledge_results', dexiePayloads);
  }

  return dexiePayloads.length;
}

/**
 * Trích xuất toàn bộ dữ liệu phân tích Radar đa chiều cho một Học sinh hoặc Trung bình Lớp
 * theo chuẩn 100% Điểm Kiểm Tra (Test Score) + Xu hướng 2 Bài Kiểm Tra Gần Nhất.
 */
export async function getComprehensiveRadarAnalytics(
  studentId?: string | number | 'class_avg',
  gradeLevel: number | 'all' = 9,
  category: 'all' | 'Algebra' | 'Geometry' = 'all',
  classId?: string | number,
  customTags?: KnowledgeTag[]
): Promise<TopicMasteryAnalysis[]> {
  let allTags: KnowledgeTag[] = [];
  if (customTags && customTags.length > 0) {
    allTags = [...customTags];
  } else {
    allTags = await db.knowledge_tags.toArray();
  }

  if (gradeLevel !== 'all') {
    allTags = allTags.filter((t) => Number(t.grade_level) === Number(gradeLevel));
  }
  if (category !== 'all') {
    allTags = allTags.filter((t) => t.category === category);
  }

  if (allTags.length === 0) return [];

  allTags.sort((a, b) => {
    if (b.grade_level !== a.grade_level) return b.grade_level - a.grade_level;
    if (a.category !== b.category) return a.category === 'Algebra' ? -1 : 1;
    return a.tag_name.localeCompare(b.tag_name, 'vi');
  });

  let allSessions = await db.sessions.toArray();
  if (classId && classId !== 'all') {
    allSessions = allSessions.filter((s) => String(s.class_id) === String(classId));
  }
  const allStudentSessions = await db.student_sessions.toArray();
  const sessionMap = new Map(allSessions.map((s) => [String(s.id), s]));

  // Xác định buổi học nào thực sự có điểm kiểm tra
  const sessionHasTestMap = new Map<string, boolean>();
  allStudentSessions.forEach((row) => {
    const sid = String(row.session_id);
    if (typeof row.test_score === 'number' && row.test_score >= 0) {
      sessionHasTestMap.set(sid, true);
    }
  });

  const targetStudentId = studentId && studentId !== 'class_avg' ? String(studentId) : null;
  const studentSessionsList = targetStudentId
    ? allStudentSessions.filter((ss) => String(ss.student_id) === targetStudentId)
    : [];

  return allTags.map((tag) => {
    const tagId = String(tag.id || '');
    const matchingSessions = allSessions.filter((s) => isSessionMatchingTag(s, tag));
    const matchingSessionIds = matchingSessions.map((s) => String(s.id));

    const history: TopicDetailHistory[] = [];
    const studentScoreItems: Array<{ score: number; date: string; sessionData: any }> = [];

    if (targetStudentId && matchingSessionIds.length > 0) {
      const relevantStudentSessions = studentSessionsList.filter((ss) =>
        matchingSessionIds.includes(String(ss.session_id))
      );

      relevantStudentSessions.sort((a, b) => {
        const dateA = sessionMap.get(String(a.session_id))?.session_date || '';
        const dateB = sessionMap.get(String(b.session_id))?.session_date || '';
        return dateA.localeCompare(dateB);
      });

      relevantStudentSessions.forEach((ss) => {
        const sid = String(ss.session_id);
        const sess = sessionMap.get(sid);
        const effectiveScore = computeSessionEffectiveScore(
          ss,
          sess,
          Boolean(sessionHasTestMap.get(sid))
        );

        if (effectiveScore !== null) {
          studentScoreItems.push({
            score: effectiveScore,
            date: sess?.session_date || '',
            sessionData: sess,
          });

          const attLabel =
            ss.attendance === 'absent_unexcused'
              ? 'Vắng K.Phép (0đ)'
              : ss.attendance === 'late'
              ? 'Đi muộn'
              : 'Có mặt';

          history.push({
            sessionId: sid,
            sessionDate: sess?.session_date || 'Chưa rõ',
            lessonTitle: sess?.lesson_title || `Buổi học #${ss.session_id}`,
            homeworkScore: typeof ss.homework_score === 'number' ? ss.homework_score : undefined,
            testScore: typeof ss.test_score === 'number' ? ss.test_score : effectiveScore,
            effectiveScore: Number(effectiveScore.toFixed(1)),
            weight: 1.0, // 100% Điểm Kiểm Tra thực tế, không nhân hệ số ảo
            attendance: attLabel,
          });
        }
      });
    }

    let studentScore = 0;
    let trend: 'improving' | 'declining' | 'stable' | 'insufficient_data' = 'insufficient_data';
    let trendDelta = 0;
    const hasRealData = studentScoreItems.length > 0;

    if (studentScoreItems.length > 0) {
      const computed = calculateWeightedMasteryWithTrend(studentScoreItems);
      studentScore = computed.masteryScore;
      trend = computed.trend;
      trendDelta = computed.trendDelta;
    }

    // Điểm trung bình Kiểm tra toàn lớp của chuyên đề này
    let classAvg = 0;
    if (matchingSessionIds.length > 0) {
      const classSessionsList = allStudentSessions.filter((ss) =>
        matchingSessionIds.includes(String(ss.session_id))
      );

      const classScoreList: number[] = [];
      classSessionsList.forEach((ss) => {
        const sid = String(ss.session_id);
        const sess = sessionMap.get(sid);
        const score = computeSessionEffectiveScore(
          ss,
          sess,
          Boolean(sessionHasTestMap.get(sid))
        );
        if (score !== null) classScoreList.push(score);
      });

      if (classScoreList.length > 0) {
        classAvg = Number(
          (classScoreList.reduce((acc, val) => acc + val, 0) / classScoreList.length).toFixed(1)
        );
      }
    }

    if (studentId === 'class_avg') {
      studentScore = classAvg;
      trend = 'stable';
      trendDelta = 0;
    }

    let shortSubject = tag.tag_name;
    if (shortSubject.length > 24) {
      shortSubject = shortSubject.substring(0, 22) + '...';
    }

    const status = classifyMasteryStatus(studentScore, studentScoreItems.length);

    return {
      tagId,
      subject: shortSubject,
      fullTagName: tag.tag_name,
      category: tag.category,
      gradeLevel: tag.grade_level,
      studentScore,
      classAvg: classAvg > 0 ? classAvg : studentScore > 0 ? studentScore : 7.5,
      fullMark: 10,
      sessionCount: studentScoreItems.length,
      hasRealData,
      trend,
      trendDelta,
      status,
      history,
    };
  });
}

/**
 * Liên thông Quản lý Lớp & CSKH:
 * Tự động quét và gom nhóm danh sách Học sinh đang cùng hổng từng Chuyên đề (< 7.0đ tính theo 100% Điểm Kiểm Tra)
 * để Giáo viên tổ chức phụ đạo nhóm, gửi Zalo lộ trình hàng loạt hoặc xuất Phiếu Bài Tập Bù Lỗ Hổng (.DOCX).
 */
export async function getClassTopicGapGrouping(
  students: Student[],
  gradeLevel: number | 'all' = 9,
  category: 'all' | 'Algebra' | 'Geometry' = 'all',
  classId: string | 'all' = 'all',
  customTags?: KnowledgeTag[]
): Promise<ClassTopicGapGroup[]> {
  let allTags: KnowledgeTag[] =
    customTags && customTags.length > 0 ? [...customTags] : await db.knowledge_tags.toArray();

  if (gradeLevel !== 'all') {
    allTags = allTags.filter((t) => Number(t.grade_level) === Number(gradeLevel));
  }
  if (category !== 'all') {
    allTags = allTags.filter((t) => t.category === category);
  }
  if (allTags.length === 0) return [];

  const [allClasses, allClassStudents, allSessions, allStudentSessions] = await Promise.all([
    db.classes.toArray(),
    db.class_students.toArray(),
    db.sessions.toArray(),
    db.student_sessions.toArray(),
  ]);

  const classMap = new Map(allClasses.map((c) => [String(c.id), c]));
  const studentClassMap = new Map<string, { classId: string; className: string }>();
  allClassStudents.forEach((cs) => {
    const c = classMap.get(String(cs.class_id));
    if (c) {
      studentClassMap.set(String(cs.student_id), {
        classId: String(c.id),
        className: c.class_name,
      });
    }
  });

  // Lọc danh sách học sinh theo Lớp (nếu có chọn lớp cụ thể)
  const targetStudents = students.filter((st) => {
    if (st.status === 'stopped') return false;
    if (classId === 'all') return true;
    const sc = studentClassMap.get(String(st.id));
    return sc?.classId === String(classId);
  });

  if (targetStudents.length === 0) return [];

  const filteredSessions =
    classId !== 'all'
      ? allSessions.filter((s) => String(s.class_id) === String(classId))
      : allSessions;
  const sessionMap = new Map(filteredSessions.map((s) => [String(s.id), s]));

  const sessionHasTestMap = new Map<string, boolean>();
  allStudentSessions.forEach((row) => {
    const sid = String(row.session_id);
    if (typeof row.test_score === 'number' && row.test_score >= 0) {
      sessionHasTestMap.set(sid, true);
    }
  });

  const groups: ClassTopicGapGroup[] = [];

  for (const tag of allTags) {
    const matchingSessions = filteredSessions.filter((s) => isSessionMatchingTag(s, tag));
    if (matchingSessions.length === 0) continue;

    const matchingSessionIds = new Set(matchingSessions.map((s) => String(s.id)));
    const gapStudents: StudentTopicGapItem[] = [];
    const allStudentAvgsInTopic: number[] = [];

    for (const st of targetStudents) {
      const sid = String(st.id);
      const stRows = allStudentSessions.filter(
        (ss) => String(ss.student_id) === sid && matchingSessionIds.has(String(ss.session_id))
      );

      if (stRows.length === 0) continue;

      const scoreItems: Array<{ score: number; date: string; sessionData: any }> = [];
      stRows.forEach((ss) => {
        const sessId = String(ss.session_id);
        const sess = sessionMap.get(sessId);
        const eff = computeSessionEffectiveScore(
          ss,
          sess,
          Boolean(sessionHasTestMap.get(sessId))
        );
        if (eff !== null) {
          scoreItems.push({
            score: eff,
            date: sess?.session_date || '2026-01-01',
            sessionData: sess,
          });
        }
      });

      if (scoreItems.length === 0) continue;

      const { masteryScore, trend, trendDelta } = calculateWeightedMasteryWithTrend(scoreItems);
      allStudentAvgsInTopic.push(masteryScore);

      if (masteryScore < 7.0) {
        const scInfo = studentClassMap.get(sid);
        gapStudents.push({
          studentId: sid,
          studentName: st.full_name,
          className: scInfo?.className || 'Chưa xếp lớp',
          parentName: st.parent_name,
          parentPhone: st.parent_phone,
          testAvgScore: masteryScore,
          testCount: scoreItems.length,
          trend,
          trendDelta,
          status: masteryScore < 5.5 ? 'critical_gap' : 'developing',
        });
      }
    }

    if (gapStudents.length > 0) {
      gapStudents.sort((a, b) => a.testAvgScore - b.testAvgScore);
      const classAvg =
        allStudentAvgsInTopic.length > 0
          ? Number(
              (
                allStudentAvgsInTopic.reduce((acc, v) => acc + v, 0) /
                allStudentAvgsInTopic.length
              ).toFixed(1)
            )
          : 0;

      groups.push({
        tagId: String(tag.id),
        tagName: tag.tag_name,
        category: tag.category,
        gradeLevel: tag.grade_level,
        classAvg,
        totalTestedStudents: allStudentAvgsInTopic.length,
        gapStudents,
      });
    }
  }

  // Ưu tiên chuyên đề có nhiều học sinh đang hổng nhất lên đầu
  groups.sort((a, b) => {
    if (b.gapStudents.length !== a.gapStudents.length) {
      return b.gapStudents.length - a.gapStudents.length;
    }
    return a.classAvg - b.classAvg;
  });

  return groups;
}
