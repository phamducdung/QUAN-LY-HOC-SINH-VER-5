import { db } from '../db/dexie';
import { KnowledgeTag, Session, StudentSession } from '../types';

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
  trendDelta: number; // e.g. +1.2 or -0.8
  status: 'mastered' | 'proficient' | 'developing' | 'critical_gap' | 'untested';
  history: TopicDetailHistory[];
}

/**
 * Tính điểm buổi học chuẩn xác theo quy chuẩn:
 * - Có cả Test và BTVN: 60% Test + 40% BTVN
 * - Chỉ có Test: 100% Test
 * - Chỉ có BTVN: 100% BTVN
 */
export function computeSessionEffectiveScore(
  ss: StudentSession,
  sess?: Session
): number | null {
  const isHwExempt = ss.exempt || ss.exempt_homework;
  const isTestExempt = ss.exempt || ss.exempt_test;
  const hasTest =
    sess?.has_test !== false &&
    !isTestExempt &&
    typeof ss.test_score === 'number' &&
    ss.test_score >= 0;
  const hasHw =
    sess?.has_homework !== false &&
    !isHwExempt &&
    typeof ss.homework_score === 'number' &&
    ss.homework_score >= 0;

  if (!hasTest && !hasHw) return null;

  if (hasTest && hasHw) {
    return ss.test_score! * 0.6 + ss.homework_score! * 0.4;
  }
  if (hasTest) return ss.test_score!;
  if (hasHw) return ss.homework_score!;
  return null;
}

/**
 * Thuật toán Tính Điểm Thông Thạo Có Trọng Số Lũy Thừa Thời Gian (Recency Time-Decay Mastery Formula):
 * - Các buổi học được sắp xếp theo trình tự thời gian (từ cũ nhất đến mới nhất).
 * - Buổi học mới nhất phản ánh chân thực năng lực hiện tại của học sinh và được gán trọng số cao hơn (từ 1.0 tăng dần đến 1.8).
 * - Đồng thời tính toán độ dốc quỹ đạo phát triển (Trend Trajectory) để chẩn đoán học sinh đang tiến bộ (↗) hay sa sút (↘).
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

  if (n === 1) {
    return {
      masteryScore: Number(sorted[0].score.toFixed(1)),
      trend: 'stable',
      trendDelta: 0,
    };
  }

  // Gán trọng số tăng dần: w_i = 1 + 0.8 * (i / (n - 1))  => từ 1.0 đến 1.8
  let weightedSum = 0;
  let totalWeights = 0;

  sorted.forEach((item, idx) => {
    const weight = 1 + 0.8 * (idx / (n - 1));
    weightedSum += item.score * weight;
    totalWeights += weight;
  });

  const masteryScore = Number((weightedSum / totalWeights).toFixed(1));

  // Tính xu hướng: So sánh nửa sau (gần đây) với nửa trước (quá khứ)
  const mid = Math.floor(n / 2);
  const olderItems = sorted.slice(0, Math.max(1, mid));
  const recentItems = sorted.slice(Math.max(1, mid));

  const olderAvg = olderItems.reduce((acc, x) => acc + x.score, 0) / olderItems.length;
  const recentAvg = recentItems.reduce((acc, x) => acc + x.score, 0) / recentItems.length;
  const delta = Number((recentAvg - olderAvg).toFixed(1));

  let trend: 'improving' | 'declining' | 'stable' = 'stable';
  if (delta >= 0.5) trend = 'improving';
  else if (delta <= -0.5) trend = 'declining';

  return { masteryScore, trend, trendDelta: delta };
}

/**
 * Phân loại trạng thái làm chủ chuyên đề
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
 * Hàm tập trung recalculateKnowledgeMastery:
 * Tự động quét lại toàn bộ lịch sử các buổi học thuộc Chuyên đề (knowledgeTagId)
 * của Học sinh (studentId) và tính lại điểm tích lũy chuyên đề (KnowledgeResult) chuẩn xác 100%
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

  // Tìm tất cả các buổi học thuộc chuyên đề này
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
      !(ss.exempt || (ss.exempt_homework && ss.exempt_test)) &&
      matchedSessionIds.includes(String(ss.session_id)) &&
      (ss.attendance === 'present' || ss.attendance === 'late')
  );

  if (relevantStudentSessions.length === 0) {
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

  // Thu thập điểm các buổi học có ngày tháng
  const sessionScoreItems: Array<{ score: number; date: string; sessionData: any }> = [];

  relevantStudentSessions.forEach((ss) => {
    const sess = sessionMap.get(String(ss.session_id));
    const score = computeSessionEffectiveScore(ss, sess);
    if (score !== null) {
      sessionScoreItems.push({
        score,
        date: sess?.session_date || '2026-01-01',
        sessionData: sess,
      });
    }
  });

  if (sessionScoreItems.length === 0) return 0;

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
 * Tự động tổng hợp & cập nhật điểm tích lũy theo Chuyên đề môn Toán (KnowledgeResult)
 * dựa trên tất cả các buổi học và điểm của toàn bộ học sinh trong lớp theo thuật toán lũy thừa thời gian.
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

  // Gom nhóm điểm theo (student_id, knowledge_tag_id) với chi tiết ngày tháng
  const studentTagScores: Record<string, Record<string, Array<{ score: number; date: string; sessionData: any }>>> = {};

  studentSessions.forEach((ss) => {
    if (ss.exempt || (ss.exempt_homework && ss.exempt_test)) return;
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

    const score = computeSessionEffectiveScore(ss, sess);
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
  
  // Pre-fetch all existing knowledge_results
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
  }

  return dexiePayloads.length;
}

/**
 * Trích xuất toàn bộ dữ liệu phân tích Radar đa chiều cho một Học sinh hoặc Trung bình Lớp:
 * Trả về danh sách chi tiết các chuyên đề, điểm làm chủ (có trọng số thời gian), điểm TB lớp,
 * số lượng bài đã thi, xu hướng biến động và lịch sử từng buổi học.
 * Đảm bảo đồng bộ 100% với danh mục Phân phối chương trình.
 */
export async function getComprehensiveRadarAnalytics(
  studentId?: string | number | 'class_avg',
  gradeLevel: number | 'all' = 9,
  category: 'all' | 'Algebra' | 'Geometry' = 'all',
  classId?: string | number,
  customTags?: KnowledgeTag[]
): Promise<TopicMasteryAnalysis[]> {
  // Lấy danh sách tags từ prop hoặc Dexie
  let allTags: KnowledgeTag[] = [];
  if (customTags && customTags.length > 0) {
    allTags = [...customTags];
  } else {
    allTags = await db.knowledge_tags.toArray();
  }

  // Lọc theo Khối Lớp và Phân loại
  if (gradeLevel !== 'all') {
    allTags = allTags.filter((t) => Number(t.grade_level) === Number(gradeLevel));
  }
  if (category !== 'all') {
    allTags = allTags.filter((t) => t.category === category);
  }

  if (allTags.length === 0) return [];

  // Sắp xếp thứ tự chuyên đề chuẩn mực đồng bộ tuyệt đối với bảng Phân phối chương trình:
  // 1. Khối lớp giảm dần (9 -> 8 -> 7 -> 6)
  // 2. Đại số trước, Hình học sau
  // 3. Tên chuyên đề
  allTags.sort((a, b) => {
    if (b.grade_level !== a.grade_level) return b.grade_level - a.grade_level;
    if (a.category !== b.category) return a.category === 'Algebra' ? -1 : 1;
    return a.tag_name.localeCompare(b.tag_name, 'vi');
  });

  // Lấy toàn bộ sessions & student_sessions
  let allSessions = await db.sessions.toArray();
  if (classId) {
    allSessions = allSessions.filter((s) => String(s.class_id) === String(classId));
  }
  const allStudentSessions = await db.student_sessions.toArray();
  const sessionMap = new Map(allSessions.map((s) => [String(s.id), s]));

  const targetStudentId = studentId && studentId !== 'class_avg' ? String(studentId) : null;
  const studentSessionsList = targetStudentId
    ? allStudentSessions.filter((ss) => String(ss.student_id) === targetStudentId)
    : [];

  return allTags.map((tag) => {
    const tagId = String(tag.id || '');
    const cleanTagName = tag.tag_name.toLowerCase().trim();

    // Tìm sessions liên kết với tag này một cách toàn diện
    const matchingSessions = allSessions.filter((s) => {
      if (tagId && String(s.knowledge_tag_id) === tagId) return true;
      const lessonTitle = (s.lesson_title || '').toLowerCase();
      const testTag = (s.test_knowledge_tag || '').toLowerCase();

      if (lessonTitle && (lessonTitle.includes(cleanTagName) || cleanTagName.includes(lessonTitle))) {
        return true;
      }
      if (testTag && testTag !== 'same' && (testTag.includes(cleanTagName) || cleanTagName.includes(testTag))) {
        return true;
      }

      // Keyword-based fallback matching cho các chuyên đề trọng điểm
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
    });
    const matchingSessionIds = matchingSessions.map((s) => String(s.id));

    // Lịch sử chi tiết của học sinh được chọn
    const history: TopicDetailHistory[] = [];
    const studentScoreItems: Array<{ score: number; date: string; sessionData: any }> = [];

    if (targetStudentId && matchingSessionIds.length > 0) {
      const relevantStudentSessions = studentSessionsList.filter(
        (ss) =>
          !(ss.exempt || (ss.exempt_homework && ss.exempt_test)) &&
          matchingSessionIds.includes(String(ss.session_id)) &&
          (ss.attendance === 'present' || ss.attendance === 'late')
      );

      // Sắp xếp theo ngày
      relevantStudentSessions.sort((a, b) => {
        const dateA = sessionMap.get(String(a.session_id))?.session_date || '';
        const dateB = sessionMap.get(String(b.session_id))?.session_date || '';
        return dateA.localeCompare(dateB);
      });

      const totalItems = relevantStudentSessions.length;

      relevantStudentSessions.forEach((ss, idx) => {
        const sess = sessionMap.get(String(ss.session_id));
        const effectiveScore = computeSessionEffectiveScore(ss, sess);
        if (effectiveScore !== null) {
          const weight = totalItems > 1 ? 1 + 0.8 * (idx / (totalItems - 1)) : 1.0;
          studentScoreItems.push({
            score: effectiveScore,
            date: sess?.session_date || '',
            sessionData: sess,
          });

          history.push({
            sessionId: String(ss.session_id),
            sessionDate: sess?.session_date || 'Chưa rõ',
            lessonTitle: sess?.lesson_title || `Buổi học #${ss.session_id}`,
            homeworkScore: typeof ss.homework_score === 'number' ? ss.homework_score : undefined,
            testScore: typeof ss.test_score === 'number' ? ss.test_score : undefined,
            effectiveScore: Number(effectiveScore.toFixed(1)),
            weight: Number(weight.toFixed(2)),
            attendance: ss.attendance === 'late' ? 'Muộn' : 'Có mặt',
          });
        }
      });
    }

    // Tính điểm học sinh (hoặc trung bình nếu là class_avg)
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

    // Tính điểm trung bình toàn lớp cho chuyên đề này (Class Average)
    let classAvg = 0;
    if (matchingSessionIds.length > 0) {
      const classSessionsList = allStudentSessions.filter(
        (ss) =>
          !(ss.exempt || (ss.exempt_homework && ss.exempt_test)) &&
          matchingSessionIds.includes(String(ss.session_id)) &&
          (ss.attendance === 'present' || ss.attendance === 'late')
      );

      const classScoreList: number[] = [];
      classSessionsList.forEach((ss) => {
        const sess = sessionMap.get(String(ss.session_id));
        const score = computeSessionEffectiveScore(ss, sess);
        if (score !== null) classScoreList.push(score);
      });

      if (classScoreList.length > 0) {
        classAvg = Number(
          (classScoreList.reduce((acc, val) => acc + val, 0) / classScoreList.length).toFixed(1)
        );
      }
    }

    // Nếu chọn xem chế độ Trung bình lớp: studentScore chính là classAvg
    if (studentId === 'class_avg') {
      studentScore = classAvg;
      trend = 'stable';
      trendDelta = 0;
    }

    // Tên hiển thị trên trục Radar: Cắt ngắn gọn đẹp, ưu tiên hiển thị từ khóa chính
    let shortSubject = tag.tag_name;
    if (shortSubject.length > 22) {
      shortSubject = shortSubject.substring(0, 20) + '...';
    }

    const status = classifyMasteryStatus(studentScore, studentScoreItems.length);

    return {
      tagId,
      subject: shortSubject,
      fullTagName: tag.tag_name,
      category: tag.category,
      gradeLevel: tag.grade_level,
      studentScore,
      classAvg: classAvg > 0 ? classAvg : studentScore > 0 ? studentScore : 7.0,
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
