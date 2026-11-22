import {
  Student,
  ClassItem,
  Session,
  StudentSession,
  Warning,
  KnowledgeTag,
  KnowledgeResult,
  CRMCustomerStatus,
  CRMMessageTemplate,
  CRMTemplateCategory,
  PronounConfig,
} from '../types';

export interface CRMClassificationCriterion {
  status: CRMCustomerStatus;
  label: string;
  shortBadge: string;
  followUpCadenceDays: number;
  followUpCadenceText: string;
  academicCriteria: string[];
  parentInteractionCriteria: string[];
  recommendedAction: string;
  presetReasons: string[];
}

export const CRM_CLASSIFICATION_CRITERIA: Record<CRMCustomerStatus, CRMClassificationCriterion> = {
  satisfied: {
    status: 'satisfied',
    label: 'Hài lòng & Ổn định',
    shortBadge: 'Hài lòng',
    followUpCadenceDays: 14,
    followUpCadenceText: 'Định kỳ 14 ngày/lần (hoặc sau 4 buổi)',
    academicCriteria: [
      'Điểm trung bình Kiểm tra đạt từ 7.0 điểm trở lên, phong độ ổn định hoặc tiến bộ.',
      'Tỷ lệ hoàn thành BTVN đạt từ 85% trở lên, không thiếu bài tập liên tiếp.',
      'Chuyên cần nghiêm túc (0 buổi nghỉ không phép, không có Cảnh báo Đỏ P1).',
    ],
    parentInteractionCriteria: [
      'Phụ huynh hài lòng, phản hồi tích cực và nắm rõ lộ trình học tập của con.',
      'Được cập nhật báo cáo học tập định kỳ đều đặn (cách lần liên hệ gần nhất ≤ 14 ngày).',
    ],
    recommendedAction:
      'Gửi báo cáo định kỳ sau mỗi chu kỳ 4 buổi học; gửi thư khen ngợi ngay khi con đạt điểm ≥ 8.5 hoặc tiến bộ rõ rệt.',
    presetReasons: [
      'Phụ huynh hài lòng, con đi học và làm BTVN đầy đủ',
      'Điểm kiểm tra tốt (≥ 7.5), có tiến bộ rõ rệt',
      'Phụ huynh tin tưởng phương pháp giảng dạy của lớp',
      'Đã trao đổi định kỳ, Phụ huynh yên tâm về kết quả của con',
    ],
  },
  attention: {
    status: 'attention',
    label: 'Cần chú ý',
    shortBadge: 'Cần chú ý',
    followUpCadenceDays: 7,
    followUpCadenceText: 'Theo dõi sát 7 ngày/lần',
    academicCriteria: [
      'Đang có Cảnh báo Vàng nội bộ (P2) hoặc Điểm TB Kiểm tra ở mức 5.0 – dưới 7.0 điểm.',
      'Quên nộp hoặc nộp muộn BTVN 1 – 2 buổi gần đây, hoặc điểm BTVN lệch so với điểm thi.',
      'Nghỉ học có phép từ 2 buổi hoặc đi muộn nhiều lần cần nhắc nhở.',
    ],
    parentInteractionCriteria: [
      'Phụ huynh bận ít phản hồi tin nhắn hoặc có thắc mắc về khối lượng bài tập / lịch học.',
      'Đã 14 – 21 ngày chưa gửi báo cáo cập nhật tình hình học tập của con cho Phụ huynh.',
    ],
    recommendedAction:
      'Gửi Báo cáo học tập 1-Click ngay trong tuần, thông báo biện pháp kèm bổ trợ / giao phiếu bài tập gỡ điểm và hẹn lịch kiểm tra lại sau 7 ngày.',
    presetReasons: [
      'Con thiếu BTVN 1-2 buổi gần đây, cần Phụ huynh phối hợp đôn đốc',
      'Điểm kiểm tra chững lại (5.0 - 6.8đ), cần rèn thêm kỹ năng trình bày',
      'Con nghỉ có phép, cần gửi bài giảng & kèm bù kiến thức',
      'Phụ huynh muốn cập nhật sát hơn tình hình làm bài trên lớp',
      'Quá 14 ngày chưa gửi báo cáo định kỳ cho Phụ huynh',
    ],
  },
  at_risk: {
    status: 'at_risk',
    label: 'Nguy cơ nghỉ học',
    shortBadge: 'Nguy cơ nghỉ học',
    followUpCadenceDays: 3,
    followUpCadenceText: 'Chăm sóc khẩn 3 – 5 ngày/lần',
    academicCriteria: [
      'Đang có Cảnh báo Đỏ khẩn cấp (P1) hoặc Điểm Kiểm tra < 5.0 trong 2 buổi liên tiếp.',
      'Vắng không phép ≥ 2 buổi hoặc thiếu BTVN ≥ 3 buổi liên tiếp dẫn tới hổng kiến thức gốc.',
      'Điểm số tụt giảm mạnh (≥ 2.0 điểm so với trung bình) khiến học sinh tâm lý chán nản.',
    ],
    parentInteractionCriteria: [
      'Phụ huynh phản ánh con kêu bài khó, áp lực, hoặc vướng lịch học thêm môn khác.',
      'Học sinh đang ở trạng thái Tạm dừng hoặc quá 21 ngày chưa liên hệ được Phụ huynh.',
    ],
    recommendedAction:
      'Giáo viên chính trực tiếp gọi điện / nhắn Zalo trao đổi sâu với Phụ huynh trong 24h, thống nhất lịch phụ đạo 1-1 bù lỗ hổng kiến thức và hẹn chăm sóc lại sau 3 – 5 ngày.',
    presetReasons: [
      'Con bị hổng kiến thức cơ bản (Điểm KT < 5.0), dễ tâm lý nản học',
      'Vắng học / thiếu BTVN nhiều buổi liên tiếp (Cảnh báo P1)',
      'Phụ huynh phản ánh con thấy chương trình khó hoặc áp lực thời gian',
      'Vướng lịch học thêm trên trường, Phụ huynh đang cân nhắc đổi lịch',
      'Học sinh đang tạm nghỉ, cần giữ kết nối để đón con quay lại lớp',
    ],
  },
};

export interface StudentSessionEnriched {
  session: Session;
  record: StudentSession;
  classAvgHw: number | null;
  classAvgTest: number | null;
}

export interface StudentParentReportData {
  student: Student;
  primaryClass?: ClassItem;
  allEnrolledClasses: ClassItem[];
  periodLabel: string;
  dateRangeText: string;
  totalSessionsInPeriod: number;
  presentCount: number;
  lateCount: number;
  excusedCount: number;
  unexcusedCount: number;
  attendanceRate: number;
  absentOrLateDetails: string[];
  // Homework metrics
  hwSessionCount: number;
  hwSubmittedCount: number;
  hwCompletionRate: number;
  studentHwAvg: number | null;
  classHwAvg: number | null;
  missingHwTitles: string[];
  // Test metrics
  testSessionCount: number;
  studentTestAvg: number | null;
  classTestAvg: number | null;
  latestTestScore: number | null;
  highestTestScore: number | null;
  scoreTrendText: 'Tiến bộ rõ rệt' | 'Giữ phong độ ổn định' | 'Đang có dấu hiệu giảm, cần lưu ý';
  // Knowledge Mastery
  strongTopics: Array<{ name: string; score: number }>;
  weakTopics: Array<{ name: string; score: number }>;
  // Qualitative observations
  teacherComments: Array<{ date: string; lesson: string; comment: string; remedial?: string }>;
  remedialActionsSummary: string[];
  activeWarnings: Warning[];
  sessionRows: StudentSessionEnriched[];
  // Suggested CRM classification based on criteria
  suggestedStatus: CRMCustomerStatus;
  suggestedReasons: string[];
  daysSinceLastContact: number | null;
}

export const DEFAULT_CRM_MESSAGE_TEMPLATES: CRMMessageTemplate[] = [
  {
    id: 'tpl_periodic_report',
    category: 'periodic_report',
    title: '1. Báo cáo học tập định kỳ chuẩn (Đầy đủ số liệu)',
    description: 'Tổng hợp chính xác chuyên cần, điểm BTVN, điểm Kiểm tra so với mặt bằng lớp và nhận xét từng buổi.',
    body: `Dạ {danh_xung_gv} {ten_gv} xin phép gửi Gia đình báo cáo tình hình học tập môn Toán của {danh_xung_hs} {ten_hs} ({ten_lop} - {chu_ky}):

1. Chuyên cần & Ý thức học tập:
- Tỷ lệ tham gia: {ty_le_chuyen_can}% ({so_buoi_co_mat}/{tong_so_buoi} buổi).
- Ghi nhận chi tiết: {chi_tiet_vang_muon}

2. Kết quả Bài tập về nhà (BTVN):
- Tỷ lệ hoàn thành BTVN: {ty_le_nop_btvn}% ({so_btvn_da_nop}/{tong_so_btvn} bài).
- Điểm TB BTVN của {danh_xung_hs}: {diem_tb_btvn}/10 (Điểm TB chung của lớp: {diem_tb_btvn_lop}/10).

3. Kết quả Kiểm tra & Đánh giá năng lực:
- Điểm TB Kiểm tra của {danh_xung_hs}: {diem_tb_kt}/10 (Điểm TB chung của lớp: {diem_tb_kt_lop}/10).
- Xu hướng học lực: {xu_huong_diem}.
- Chuyên đề nắm vững: {chuyen_de_vung}.
- Chuyên đề cần rèn luyện thêm: {chuyen_de_can_ren}.

4. Nhận xét & Định hướng của {danh_xung_gv}:
{nhan_xet_chi_tiet}
- Giải pháp đồng hành: {giai_phap_de_xuat}

Gia đình xem qua báo cáo, nếu có điểm nào cần trao đổi thêm về việc học của {danh_xung_hs}, Phụ huynh nhắn lại giúp {danh_xung_gv} nhé ạ!`,
  },
  {
    id: 'tpl_praise_progress',
    category: 'praise_progress',
    title: '2. Thư khen ngợi tiến bộ & Tuyên dương kết quả tốt',
    description: 'Dành cho học sinh nhóm Hài lòng / Đạt điểm cao hoặc có bước tiến bộ vượt bậc.',
    body: `Dạ {danh_xung_gv} {ten_gv} xin gửi lời chúc mừng và tuyên dương {danh_xung_hs} {ten_hs} ({ten_lop}) tới Gia đình ạ!

Trong {chu_ky} vừa qua, {danh_xung_hs} đã thể hiện tinh thần học tập rất đáng khen ngợi:
- Chuyên cần: Đạt {ty_le_chuyen_can}% ({so_buoi_co_mat}/{tong_so_buoi} buổi), hoàn thành {ty_le_nop_btvn}% BTVN.
- Điểm Kiểm tra trung bình đạt: {diem_tb_kt}/10 (Mặt bằng lớp: {diem_tb_kt_lop}/10) - {xu_huong_diem}.
- Các mảng kiến thức {danh_xung_hs} nắm rất chắc: {chuyen_de_vung}.
- Ghi nhận trên lớp: {nhan_xet_chi_tiet}

Nhờ Gia đình gửi lời khen ngợi để khích lệ tinh thần giúp {danh_xung_hs} tiếp tục giữ vững phong độ trong các chuyên đề nâng cao sắp tới nhé ạ!`,
  },
  {
    id: 'tpl_homework_attendance',
    category: 'homework_attendance',
    title: '3. Phối hợp nhắc nhở Chuyên cần & Bài tập về nhà',
    description: 'Dành cho học sinh nhóm Cần chú ý do quên BTVN hoặc đi muộn/vắng học.',
    body: `Dạ {danh_xung_gv} {ten_gv} xin phép thông tin nhanh tới Gia đình về tình hình chuyên cần và làm BTVN của {danh_xung_hs} {ten_hs} ({ten_lop}) trong {chu_ky}:

- Tham gia buổi học: {so_buoi_co_mat}/{tong_so_buoi} buổi ({chi_tiet_vang_muon}).
- Hoàn thành BTVN: {so_btvn_da_nop}/{tong_so_btvn} bài (Điểm TB BTVN: {diem_tb_btvn}/10).
- Các bài tập cần bổ sung: {danh_sach_thieu_btvn}.

Do môn Toán THCS có tính hệ thống cao, việc làm đầy đủ BTVN giúp {danh_xung_hs} nhớ công thức và không bị lúng túng khi làm bài kiểm tra (hiện điểm TB Kiểm tra của {danh_xung_hs} là {diem_tb_kt}/10).

{danh_xung_gv} đã {giai_phap_de_xuat}. Nhờ Gia đình nhắc nhở {danh_xung_hs} dành khoảng 30-45 phút mỗi tối hoàn thành bài tập trước khi đến lớp cùng {danh_xung_gv} nhé ạ!`,
  },
  {
    id: 'tpl_knowledge_remedial',
    category: 'knowledge_remedial',
    title: '4. Kế hoạch phụ đạo bù lỗ hổng kiến thức chuyên đề',
    description: 'Báo cáo rõ chuyên đề Toán con đang bị mất gốc và kế hoạch kèm bổ trợ của Giáo viên.',
    body: `Dạ {danh_xung_gv} {ten_gv} xin phép trao đổi kỹ hơn với Gia đình về kết quả kiểm tra và các chuyên đề Toán của {danh_xung_hs} {ten_hs} ({ten_lop}) qua {chu_ky}:

- Điểm TB Kiểm tra hiện tại: {diem_tb_kt}/10 (Điểm TB lớp: {diem_tb_kt_lop}/10).
- Điểm TB BTVN: {diem_tb_btvn}/10 (Tỷ lệ nộp bài: {ty_le_nop_btvn}%).
- Qua chấm chữa bài chi tiết, {danh_xung_gv} nhận thấy {danh_xung_hs} đã nắm được: {chuyen_de_vung}.
- Tuy nhiên, {danh_xung_hs} đang còn hổng kiến thức ở chuyên đề: {chuyen_de_can_ren}.
- Nhận xét chuyên môn: {nhan_xet_chi_tiet}

Kế hoạch hỗ trợ của {danh_xung_gv} trong tuần này:
- {giai_phap_de_xuat}
Nhờ Gia đình động viên {danh_xung_hs} đi học đúng giờ và ôn lại các dạng bài {danh_xung_gv} đã chữa kỹ trong vở để cải thiện điểm số trong kỳ kiểm tra tới ạ!`,
  },
  {
    id: 'tpl_retention_care',
    category: 'retention_care',
    title: '5. Thăm hỏi đặc biệt & Đồng hành tháo gỡ khó khăn (Chống nghỉ học)',
    description: 'Dành cho học sinh nhóm Nguy cơ nghỉ học, bị áp lực điểm số hoặc cần tháo gỡ tâm lý.',
    body: `Dạ chào Gia đình em {ten_hs} ạ, {danh_xung_gv} {ten_gv} xin phép nhắn tin hỏi thăm tình hình học tập của {danh_xung_hs} tại lớp {ten_lop} trong {chu_ky} vừa qua:

Qua theo dõi sát sao trên lớp (Chuyên cần {so_buoi_co_mat}/{tong_so_buoi} buổi, Điểm TB Kiểm tra {diem_tb_kt}/10), {danh_xung_gv} nhận thấy thời gian gần đây {danh_xung_hs} có phần gặp khó khăn ở phần: {chuyen_de_can_ren} ({nhan_xet_chi_tiet}).

Để {danh_xung_hs} không bị tâm lý áp lực hay chán nản khi gặp bài khó, {danh_xung_gv} và Trợ giảng đã chủ động xây dựng phương án hỗ trợ riêng cho {danh_xung_hs}:
1. {giai_phap_de_xuat}
2. Chia nhỏ lượng bài tập về nhà vừa sức để {danh_xung_hs} lấy lại sự tự tin và gốc kiến thức từng bước.

Gia đình cho {danh_xung_gv} hỏi thêm ở nhà {danh_xung_hs} có chia sẻ khó khăn gì về bài vở hay thời gian biểu không ạ? {danh_xung_gv} rất mong được lắng nghe để điều chỉnh phương pháp hỗ trợ {danh_xung_hs} tốt nhất ạ!`,
  },
];

export function calculateDaysSince(isoOrDate?: string): number | null {
  if (!isoOrDate) return null;
  const parsed = new Date(isoOrDate).getTime();
  if (Number.isNaN(parsed)) return null;
  const diffMs = Date.now() - parsed;
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

export function getFollowUpUrgency(
  nextFollowupDate?: string,
  daysSinceLastContact?: number | null,
  status: CRMCustomerStatus = 'satisfied'
): {
  level: 'overdue' | 'due_today' | 'upcoming' | 'stale_contact' | 'on_track';
  label: string;
  daysDelta?: number;
} {
  const todayStr = new Date().toISOString().slice(0, 10);

  if (nextFollowupDate) {
    if (nextFollowupDate < todayStr) {
      const diff = Math.max(
        1,
        Math.floor(
          (new Date(todayStr).getTime() - new Date(nextFollowupDate).getTime()) /
            (1000 * 60 * 60 * 24)
        )
      );
      return {
        level: 'overdue',
        label: `Quá hạn hẹn ${diff} ngày (${nextFollowupDate})`,
        daysDelta: diff,
      };
    }
    if (nextFollowupDate === todayStr) {
      return {
        level: 'due_today',
        label: 'Đến lịch hẹn CSKH hôm nay',
        daysDelta: 0,
      };
    }
    const diff = Math.ceil(
      (new Date(nextFollowupDate).getTime() - new Date(todayStr).getTime()) /
        (1000 * 60 * 60 * 24)
    );
    if (diff <= 7) {
      return {
        level: 'upcoming',
        label: `Hẹn sau ${diff} ngày (${nextFollowupDate})`,
        daysDelta: diff,
      };
    }
  }

  const maxRecommendedDays = CRM_CLASSIFICATION_CRITERIA[status].followUpCadenceDays;
  if (daysSinceLastContact === null || daysSinceLastContact === undefined) {
    return {
      level: 'stale_contact',
      label: 'Chưa có nhật ký CSKH',
    };
  }

  if (daysSinceLastContact > maxRecommendedDays) {
    return {
      level: 'stale_contact',
      label: `${daysSinceLastContact} ngày chưa liên hệ (Khuyến nghị ≤ ${maxRecommendedDays} ngày)`,
      daysDelta: daysSinceLastContact,
    };
  }

  return {
    level: 'on_track',
    label: nextFollowupDate
      ? `Hẹn: ${nextFollowupDate}`
      : `Đã chăm sóc ${daysSinceLastContact === 0 ? 'hôm nay' : `${daysSinceLastContact} ngày trước`}`,
  };
}

/**
 * Evaluates a student's real academic & interaction data against the 3-tier
 * Customer Classification Criteria to provide transparent reasoning and smart recommendations.
 */
export function evaluateStudentCRMSuggestion(params: {
  student: Student;
  activeWarnings: Warning[];
  studentTestAvg: number | null;
  studentHwAvg: number | null;
  hwCompletionRate: number;
  unexcusedCount: number;
  excusedCount: number;
  daysSinceLastContact: number | null;
}): {
  suggestedStatus: CRMCustomerStatus;
  suggestedReasons: string[];
} {
  const {
    student,
    activeWarnings,
    studentTestAvg,
    hwCompletionRate,
    unexcusedCount,
    excusedCount,
    daysSinceLastContact,
  } = params;

  const p1Warnings = activeWarnings.filter((w) => !w.resolved && w.priority === 'P1');
  const p2Warnings = activeWarnings.filter((w) => !w.resolved && w.priority === 'P2');

  const atRiskReasons: string[] = [];
  const attentionReasons: string[] = [];

  if (student.status === 'paused') {
    atRiskReasons.push('Học sinh đang ở trạng thái Tạm dừng học');
  }
  if (p1Warnings.length > 0) {
    atRiskReasons.push(
      `Có ${p1Warnings.length} Cảnh báo Đỏ P1 (${p1Warnings[0].warning_type})`
    );
  }
  if (studentTestAvg !== null && studentTestAvg < 5.0) {
    atRiskReasons.push(`Điểm TB Kiểm tra thấp (${studentTestAvg.toFixed(1)}/10 < 5.0)`);
  }
  if (unexcusedCount >= 2) {
    atRiskReasons.push(`Vắng không phép ${unexcusedCount} buổi`);
  }
  if (daysSinceLastContact !== null && daysSinceLastContact > 21) {
    atRiskReasons.push(`Đã ${daysSinceLastContact} ngày chưa liên hệ Phụ huynh (> 21 ngày)`);
  }

  if (atRiskReasons.length > 0) {
    return {
      suggestedStatus: 'at_risk',
      suggestedReasons: atRiskReasons,
    };
  }

  if (p2Warnings.length > 0) {
    attentionReasons.push(
      `Có ${p2Warnings.length} Cảnh báo P2 (${p2Warnings[0].warning_type})`
    );
  }
  if (studentTestAvg !== null && studentTestAvg >= 5.0 && studentTestAvg < 7.0) {
    attentionReasons.push(`Điểm TB Kiểm tra cần cải thiện (${studentTestAvg.toFixed(1)}/10)`);
  }
  if (hwCompletionRate < 85) {
    attentionReasons.push(`Tỷ lệ nộp BTVN đạt ${hwCompletionRate}% (< 85%)`);
  }
  if (unexcusedCount === 1 || excusedCount >= 2) {
    attentionReasons.push(
      unexcusedCount === 1
        ? 'Có 1 buổi vắng không phép'
        : `Nghỉ có phép ${excusedCount} buổi (cần gửi bài bù)`
    );
  }
  if (daysSinceLastContact === null || daysSinceLastContact > 14) {
    attentionReasons.push(
      daysSinceLastContact === null
        ? 'Chưa có lịch sử báo cáo Phụ huynh'
        : `Đã ${daysSinceLastContact} ngày chưa cập nhật báo cáo (> 14 ngày)`
    );
  }

  if (attentionReasons.length > 0) {
    return {
      suggestedStatus: 'attention',
      suggestedReasons: attentionReasons,
    };
  }

  const satisfiedReasons: string[] = [];
  if (studentTestAvg !== null && studentTestAvg >= 7.0) {
    satisfiedReasons.push(`Điểm TB Kiểm tra tốt (${studentTestAvg.toFixed(1)}/10)`);
  }
  if (hwCompletionRate >= 85) {
    satisfiedReasons.push(`Hoàn thành ${hwCompletionRate}% BTVN`);
  }
  if (satisfiedReasons.length === 0) {
    satisfiedReasons.push('Chuyên cần ổn định, không có cảnh báo học tập');
  }

  return {
    suggestedStatus: 'satisfied',
    suggestedReasons: satisfiedReasons,
  };
}

/**
 * Compiles 100% deterministic, accurate academic report data for a student
 * across a chosen session cycle ('1' | '4' | '8' | 'all').
 */
export function compileAccurateStudentParentReport(params: {
  student: Student;
  classes: ClassItem[];
  enrolledClassIds: string[];
  selectedClassId?: string;
  cycleLimit: 1 | 4 | 8 | 'all';
  allSessions: Session[];
  allStudentSessions: StudentSession[];
  allWarnings: Warning[];
  allKnowledgeTags: KnowledgeTag[];
  allKnowledgeResults: KnowledgeResult[];
}): StudentParentReportData {
  const {
    student,
    classes,
    enrolledClassIds,
    selectedClassId,
    cycleLimit,
    allSessions,
    allStudentSessions,
    allWarnings,
    allKnowledgeTags,
    allKnowledgeResults,
  } = params;

  const studentIdStr = String(student.id);
  const allEnrolledClasses = classes.filter((c) =>
    enrolledClassIds.includes(String(c.id))
  );
  const primaryClass =
    (selectedClassId && selectedClassId !== 'all'
      ? classes.find((c) => String(c.id) === String(selectedClassId))
      : undefined) ||
    allEnrolledClasses[0] ||
    classes[0];

  const targetClassIds =
    selectedClassId && selectedClassId !== 'all'
      ? new Set([String(selectedClassId)])
      : enrolledClassIds.length > 0
      ? new Set(enrolledClassIds.map(String))
      : primaryClass?.id
      ? new Set([String(primaryClass.id)])
      : new Set<string>();

  // Filter sessions belonging to the student's class(es), sorted ascending by date
  const classSessionsSorted = allSessions
    .filter((s) => targetClassIds.has(String(s.class_id)))
    .sort((a, b) => a.session_date.localeCompare(b.session_date));

  // Index student_sessions by session_id
  const recordsBySession = new Map<string, StudentSession[]>();
  const studentRecordBySession = new Map<string, StudentSession>();

  for (const ss of allStudentSessions) {
    const sid = String(ss.session_id);
    if (!recordsBySession.has(sid)) {
      recordsBySession.set(sid, []);
    }
    recordsBySession.get(sid)!.push(ss);
    if (String(ss.student_id) === studentIdStr) {
      studentRecordBySession.set(sid, ss);
    }
  }

  // Filter sessions where this student has a record (or sessions in their enrolled class)
  const relevantSessions = classSessionsSorted.filter((s) =>
    studentRecordBySession.has(String(s.id))
  );
  const baseSessions =
    relevantSessions.length > 0 ? relevantSessions : classSessionsSorted;

  const slicedSessions =
    cycleLimit === 'all' ? baseSessions : baseSessions.slice(-cycleLimit);

  const periodLabel =
    cycleLimit === 1
      ? 'Buổi học gần nhất'
      : cycleLimit === 4
      ? `Chu kỳ ${slicedSessions.length} buổi gần nhất`
      : cycleLimit === 8
      ? `Chu kỳ ${slicedSessions.length} buổi (2 tháng)`
      : `Toàn khóa (${slicedSessions.length} buổi)`;

  const dateRangeText =
    slicedSessions.length > 0
      ? `${slicedSessions[0].session_date} đến ${
          slicedSessions[slicedSessions.length - 1].session_date
        }`
      : 'Chưa có buổi học';

  let presentCount = 0;
  let lateCount = 0;
  let excusedCount = 0;
  let unexcusedCount = 0;
  const absentOrLateDetails: string[] = [];

  let hwSessionCount = 0;
  let hwSubmittedCount = 0;
  const studentHwScores: number[] = [];
  const classHwAverages: number[] = [];
  const missingHwTitles: string[] = [];

  let testSessionCount = 0;
  const studentTestScores: number[] = [];
  const classTestAverages: number[] = [];

  const teacherComments: Array<{
    date: string;
    lesson: string;
    comment: string;
    remedial?: string;
  }> = [];
  const remedialSet = new Set<string>();
  const sessionRows: StudentSessionEnriched[] = [];

  for (const sess of slicedSessions) {
    const sessId = String(sess.id);
    const rec = studentRecordBySession.get(sessId);
    const classRecs = recordsBySession.get(sessId) || [];

    // Compute class HW avg for this session
    const validClassHw = classRecs.filter(
      (r) =>
        sess.has_homework !== false &&
        !r.exempt &&
        !r.exempt_homework &&
        typeof r.homework_score === 'number' &&
        r.homework_score > 0
    );
    const classAvgHw =
      validClassHw.length > 0
        ? Number(
            (
              validClassHw.reduce((sum, r) => sum + Number(r.homework_score || 0), 0) /
              validClassHw.length
            ).toFixed(1)
          )
        : null;

    // Compute class Test avg for this session
    const validClassTest = classRecs.filter(
      (r) =>
        sess.has_test !== false &&
        !r.exempt &&
        !r.exempt_test &&
        typeof r.test_score === 'number' &&
        r.test_score > 0
    );
    const classAvgTest =
      validClassTest.length > 0
        ? Number(
            (
              validClassTest.reduce((sum, r) => sum + Number(r.test_score || 0), 0) /
              validClassTest.length
            ).toFixed(1)
          )
        : null;

    if (!rec) continue;

    sessionRows.push({
      session: sess,
      record: rec,
      classAvgHw,
      classAvgTest,
    });

    // Attendance
    if (rec.attendance === 'present') {
      presentCount++;
    } else if (rec.attendance === 'late') {
      presentCount++;
      lateCount++;
      absentOrLateDetails.push(`Đi muộn ngày ${sess.session_date} (${sess.lesson_title})`);
    } else if (rec.attendance === 'absent_excused') {
      excusedCount++;
      absentOrLateDetails.push(`Nghỉ có phép ngày ${sess.session_date} (${sess.lesson_title})`);
    } else if (rec.attendance === 'absent_unexcused') {
      unexcusedCount++;
      absentOrLateDetails.push(
        `Vắng không phép ngày ${sess.session_date} (${sess.lesson_title})`
      );
    }

    // Homework
    if (sess.has_homework !== false && !rec.exempt && !rec.exempt_homework) {
      hwSessionCount++;
      if (rec.homework_submitted || Number(rec.homework_score || 0) > 0) {
        hwSubmittedCount++;
        if (typeof rec.homework_score === 'number' && rec.homework_score > 0) {
          studentHwScores.push(Number(rec.homework_score));
          if (classAvgHw !== null) classHwAverages.push(classAvgHw);
        }
      } else if (
        rec.attendance !== 'absent_excused' &&
        rec.attendance !== 'absent_unexcused'
      ) {
        missingHwTitles.push(`${sess.session_date} (${sess.lesson_title})`);
      }
    }

    // Test
    if (
      sess.has_test !== false &&
      !rec.exempt &&
      !rec.exempt_test &&
      typeof rec.test_score === 'number' &&
      rec.test_score > 0
    ) {
      testSessionCount++;
      studentTestScores.push(Number(rec.test_score));
      if (classAvgTest !== null) classTestAverages.push(classAvgTest);
    }

    // Comments & Remedial Actions
    const combinedPresets = Array.isArray(rec.quick_preset_comments)
      ? rec.quick_preset_comments.filter(Boolean)
      : [];
    const customText = (rec.custom_comment || '').trim();
    const fullComment = [...combinedPresets, customText].filter(Boolean).join('. ');
    const remedials = Array.isArray(rec.remedial_actions)
      ? rec.remedial_actions.filter(Boolean)
      : [];
    remedials.forEach((rm) => remedialSet.add(rm));

    if (fullComment || remedials.length > 0) {
      teacherComments.push({
        date: sess.session_date,
        lesson: sess.lesson_title,
        comment: fullComment || 'Đã theo dõi trên lớp',
        remedial: remedials.length > 0 ? remedials.join(', ') : undefined,
      });
    }
  }

  const totalSessionsInPeriod = sessionRows.length;
  const attendanceRate =
    totalSessionsInPeriod > 0
      ? Math.round((presentCount / totalSessionsInPeriod) * 100)
      : 100;

  const hwCompletionRate =
    hwSessionCount > 0 ? Math.round((hwSubmittedCount / hwSessionCount) * 100) : 100;

  const studentHwAvg =
    studentHwScores.length > 0
      ? Number(
          (
            studentHwScores.reduce((a, b) => a + b, 0) / studentHwScores.length
          ).toFixed(1)
        )
      : null;

  const classHwAvg =
    classHwAverages.length > 0
      ? Number(
          (
            classHwAverages.reduce((a, b) => a + b, 0) / classHwAverages.length
          ).toFixed(1)
        )
      : null;

  const studentTestAvg =
    studentTestScores.length > 0
      ? Number(
          (
            studentTestScores.reduce((a, b) => a + b, 0) / studentTestScores.length
          ).toFixed(1)
        )
      : null;

  const classTestAvg =
    classTestAverages.length > 0
      ? Number(
          (
            classTestAverages.reduce((a, b) => a + b, 0) / classTestAverages.length
          ).toFixed(1)
        )
      : null;

  const latestTestScore =
    studentTestScores.length > 0
      ? studentTestScores[studentTestScores.length - 1]
      : null;

  const highestTestScore =
    studentTestScores.length > 0 ? Math.max(...studentTestScores) : null;

  let scoreTrendText:
    | 'Tiến bộ rõ rệt'
    | 'Giữ phong độ ổn định'
    | 'Đang có dấu hiệu giảm, cần lưu ý' = 'Giữ phong độ ổn định';

  if (studentTestScores.length >= 2) {
    const firstHalf = studentTestScores.slice(
      0,
      Math.floor(studentTestScores.length / 2)
    );
    const secondHalf = studentTestScores.slice(
      Math.floor(studentTestScores.length / 2)
    );
    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    if (secondAvg - firstAvg >= 0.6) {
      scoreTrendText = 'Tiến bộ rõ rệt';
    } else if (firstAvg - secondAvg >= 0.6) {
      scoreTrendText = 'Đang có dấu hiệu giảm, cần lưu ý';
    }
  }

  // Knowledge tags & mastery for this student
  const tagMap = new Map<string, KnowledgeTag>();
  allKnowledgeTags.forEach((t) => {
    if (t.id) tagMap.set(String(t.id), t);
  });

  const studentKRs = allKnowledgeResults.filter(
    (kr) => String(kr.student_id) === studentIdStr
  );

  const strongTopics: Array<{ name: string; score: number }> = [];
  const weakTopics: Array<{ name: string; score: number }> = [];

  for (const kr of studentKRs) {
    const tag = tagMap.get(String(kr.knowledge_tag_id));
    if (!tag) continue;
    const score = Number(kr.mastery_score || 0);
    if (score >= 7.5) {
      strongTopics.push({ name: tag.tag_name, score });
    } else if (score > 0 && score < 6.5) {
      weakTopics.push({ name: tag.tag_name, score });
    }
  }

  // Also check test_knowledge_tag from low/high test sessions if knowledge_results are sparse
  for (const row of sessionRows) {
    const topicName = row.session.test_knowledge_tag || row.session.chapter;
    if (!topicName) continue;
    if (row.record.test_score >= 8.0 && strongTopics.length < 4) {
      if (!strongTopics.some((t) => t.name === topicName)) {
        strongTopics.push({ name: topicName, score: row.record.test_score });
      }
    } else if (
      row.record.test_score > 0 &&
      row.record.test_score < 6.5 &&
      weakTopics.length < 4
    ) {
      if (!weakTopics.some((t) => t.name === topicName)) {
        weakTopics.push({ name: topicName, score: row.record.test_score });
      }
    }
  }

  const activeWarnings = allWarnings.filter(
    (w) => String(w.student_id) === studentIdStr && !w.resolved
  );

  const daysSinceLastContact = calculateDaysSince(
    student.crm_last_contacted_at ||
      student.crm_interactions?.[0]?.created_at
  );

  const { suggestedStatus, suggestedReasons } = evaluateStudentCRMSuggestion({
    student,
    activeWarnings,
    studentTestAvg,
    studentHwAvg,
    hwCompletionRate,
    unexcusedCount,
    excusedCount,
    daysSinceLastContact,
  });

  return {
    student,
    primaryClass,
    allEnrolledClasses,
    periodLabel,
    dateRangeText,
    totalSessionsInPeriod,
    presentCount,
    lateCount,
    excusedCount,
    unexcusedCount,
    attendanceRate,
    absentOrLateDetails,
    hwSessionCount,
    hwSubmittedCount,
    hwCompletionRate,
    studentHwAvg,
    classHwAvg,
    missingHwTitles,
    testSessionCount,
    studentTestAvg,
    classTestAvg,
    latestTestScore,
    highestTestScore,
    scoreTrendText,
    strongTopics,
    weakTopics,
    teacherComments,
    remedialActionsSummary: Array.from(remedialSet),
    activeWarnings,
    sessionRows,
    suggestedStatus,
    suggestedReasons,
    daysSinceLastContact,
  };
}

/**
 * Renders a personalized Zalo/SMS message from a template and the student's compiled report.
 */
export function renderCRMTemplate(
  templateBody: string,
  report: StudentParentReportData,
  pronounConfig?: PronounConfig
): string {
  const teacherTitle = pronounConfig?.teacher_title || 'Thầy';
  const teacherName = pronounConfig?.teacher_name || 'Giáo viên Toán';
  const studentPronoun = (pronounConfig?.student_pronoun || 'con').toLowerCase();

  const absentOrLateStr =
    report.absentOrLateDetails.length > 0
      ? report.absentOrLateDetails.join('; ')
      : 'Đi học đầy đủ, đúng giờ 100% các buổi';

  const strongStr =
    report.strongTopics.length > 0
      ? report.strongTopics.map((t) => `${t.name} (${t.score}đ)`).join(', ')
      : 'Các dạng bài cơ bản trên lớp';

  const weakStr =
    report.weakTopics.length > 0
      ? report.weakTopics.map((t) => `${t.name} (${t.score}đ)`).join(', ')
      : 'Cần rèn thêm tốc độ tính toán và trình bày tự luận cẩn thận';

  const recentComments = report.teacherComments.slice(-3);
  const commentsStr =
    recentComments.length > 0
      ? recentComments
          .map((c) => `- Ngày ${c.date} (${c.lesson}): ${c.comment}`)
          .join('\n')
      : `- Trên lớp ${studentPronoun} chú ý nghe giảng và ghi chép bài đầy đủ.`;

  const remedialStr =
    report.remedialActionsSummary.length > 0
      ? report.remedialActionsSummary.join('; ')
      : report.weakTopics.length > 0
      ? `Giao phiếu bài tập củng cố riêng phần ${report.weakTopics[0].name} và kèm chữa chi tiết trên lớp`
      : `Tiếp tục luyện các bài toán nâng cao lấy điểm 8.5 - 9+ trong đề thi`;

  const missingHwStr =
    report.missingHwTitles.length > 0
      ? report.missingHwTitles.join('; ')
      : 'Đã nộp đủ các bài tập được giao';

  const replacements: Record<string, string> = {
    '{danh_xung_gv}': teacherTitle,
    '{ten_gv}': teacherName,
    '{danh_xung_hs}': studentPronoun,
    '{ten_hs}': report.student.full_name,
    '{ten_ph}': report.student.parent_name || `Phụ huynh ${studentPronoun} ${report.student.full_name}`,
    '{ten_lop}': report.primaryClass?.class_name || 'Lớp Toán THCS',
    '{chu_ky}': `${report.periodLabel} (${report.dateRangeText})`,
    '{ty_le_chuyen_can}': String(report.attendanceRate),
    '{so_buoi_co_mat}': String(report.presentCount),
    '{tong_so_buoi}': String(report.totalSessionsInPeriod),
    '{chi_tiet_vang_muon}': absentOrLateStr,
    '{ty_le_nop_btvn}': String(report.hwCompletionRate),
    '{so_btvn_da_nop}': String(report.hwSubmittedCount),
    '{tong_so_btvn}': String(report.hwSessionCount),
    '{diem_tb_btvn}': report.studentHwAvg !== null ? String(report.studentHwAvg) : 'Chưa chấm điểm',
    '{diem_tb_btvn_lop}': report.classHwAvg !== null ? String(report.classHwAvg) : '7.5',
    '{danh_sach_thieu_btvn}': missingHwStr,
    '{diem_tb_kt}': report.studentTestAvg !== null ? String(report.studentTestAvg) : 'Chưa có bài KT',
    '{diem_tb_kt_lop}': report.classTestAvg !== null ? String(report.classTestAvg) : '7.2',
    '{xu_huong_diem}': report.scoreTrendText,
    '{chuyen_de_vung}': strongStr,
    '{chuyen_de_can_ren}': weakStr,
    '{nhan_xet_chi_tiet}': commentsStr,
    '{giai_phap_de_xuat}': remedialStr,
  };

  let output = templateBody;
  for (const [token, val] of Object.entries(replacements)) {
    output = output.split(token).join(val);
  }
  return output;
}

/**
 * Compiles a 1-Click Class Zalo Group Announcement (either for a specific session
 * or for the latest 4-session cycle of the class).
 */
export function compileClassGroupZaloAnnouncement(params: {
  cls: ClassItem;
  mode: 'single_session' | 'cycle_4';
  targetSessionId?: string;
  classSessions: Session[];
  activeClassStudents: Student[];
  allStudentSessions: StudentSession[];
  pronounConfig?: PronounConfig;
}): {
  title: string;
  announcementText: string;
  presentCount: number;
  totalCount: number;
  avgHw: string;
  avgTest: string;
  topTestStudents: Array<{ name: string; score: number }>;
  topHwStudents: Array<{ name: string; score: number }>;
} {
  const {
    cls,
    mode,
    targetSessionId,
    classSessions,
    activeClassStudents,
    allStudentSessions,
    pronounConfig,
  } = params;

  const teacherTitle = pronounConfig?.teacher_title || 'Thầy';
  const teacherName = pronounConfig?.teacher_name || 'Giáo viên Toán';
  const studentPronoun = (pronounConfig?.student_pronoun || 'các con').toLowerCase();

  const sortedSessions = [...classSessions].sort((a, b) =>
    b.session_date.localeCompare(a.session_date)
  );

  const studentMap = new Map<string, Student>();
  activeClassStudents.forEach((s) => {
    if (s.id) studentMap.set(String(s.id), s);
  });

  if (sortedSessions.length === 0) {
    return {
      title: `Thông báo Nhóm Zalo Lớp ${cls.class_name}`,
      announcementText: `Kính gửi Quý Phụ huynh lớp ${cls.class_name},\n${teacherTitle} ${teacherName} xin thông báo lịch học cố định của lớp: ${cls.schedule}.\nMong Quý Phụ huynh nhắc nhở ${studentPronoun} đi học đúng giờ và chuẩn bị đầy đủ sách vở ạ!`,
      presentCount: activeClassStudents.length,
      totalCount: activeClassStudents.length,
      avgHw: 'Chưa chấm',
      avgTest: 'Chưa KT',
      topTestStudents: [],
      topHwStudents: [],
    };
  }

  if (mode === 'single_session') {
    const sess =
      (targetSessionId
        ? sortedSessions.find((s) => String(s.id) === String(targetSessionId))
        : undefined) || sortedSessions[0];

    const sessId = String(sess.id);
    const rawRecs = allStudentSessions.filter(
      (ss) =>
        String(ss.session_id) === sessId &&
        (studentMap.size === 0 || studentMap.has(String(ss.student_id)))
    );

    const recByStudent = new Map<string, StudentSession>();
    rawRecs.forEach((r) => recByStudent.set(String(r.student_id), r));
    const recs = Array.from(recByStudent.values());

    const presentCount = recs.filter(
      (r) => !r.attendance || r.attendance === 'present' || r.attendance === 'late'
    ).length;
    const totalCount =
      studentMap.size > 0 ? studentMap.size : Math.max(presentCount, recs.length);

    const validHw = recs.filter(
      (r) =>
        !r.exempt &&
        !r.exempt_homework &&
        typeof r.homework_score === 'number' &&
        r.homework_score > 0
    );
    const avgHw =
      validHw.length > 0
        ? (
            validHw.reduce((sum, r) => sum + Number(r.homework_score || 0), 0) /
            validHw.length
          ).toFixed(1)
        : 'Chưa chấm';

    const validTests = recs.filter(
      (r) =>
        !r.exempt &&
        !r.exempt_test &&
        typeof r.test_score === 'number' &&
        r.test_score > 0
    );
    const avgTest =
      validTests.length > 0
        ? (
            validTests.reduce((sum, r) => sum + Number(r.test_score || 0), 0) /
            validTests.length
          ).toFixed(1)
        : 'Không có KT';

    const topTestStudents = validTests
      .map((r) => ({
        name: studentMap.get(String(r.student_id))?.full_name || 'Học sinh',
        score: Number(r.test_score),
      }))
      .filter((item) => item.score >= 8.0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);

    const topHwStudents = validHw
      .map((r) => ({
        name: studentMap.get(String(r.student_id))?.full_name || 'Học sinh',
        score: Number(r.homework_score),
      }))
      .filter((item) => item.score >= 8.5)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);

    const praiseTestLine =
      topTestStudents.length > 0
        ? `- Tuyên dương điểm Kiểm tra xuất sắc (≥ 8.0đ): ${topTestStudents
            .map((s) => `${s.name} (${s.score}đ)`)
            .join(', ')}.`
        : '- Các con đã hoàn thành bài luyện tập trên lớp và được chữa chi tiết từng dạng toán.';

    const praiseHwLine =
      topHwStudents.length > 0
        ? `- Tuyên dương hoàn thành BTVN rất tốt (≥ 8.5đ): ${topHwStudents
            .map((s) => `${s.name} (${s.score}đ)`)
            .join(', ')}.`
        : '- Đa số các con có ý thức chuẩn bị BTVN trước khi đến lớp.';

    const hwDesc =
      sess.homework_description?.trim() ||
      `Hoàn thành phiếu bài tập tự luyện phần "${sess.lesson_title}" và xem lại các ví dụ mẫu đã chữa trong vở.`;

    const announcementText = `THÔNG BÁO TỔNG KẾT BUỔI HỌC LỚP ${cls.class_name.toUpperCase()} (${sess.session_date})

Kính gửi Quý Phụ huynh lớp ${cls.class_name},
${teacherTitle} ${teacherName} và Trợ giảng (${cls.assistant_name || 'Trợ giảng lớp'}) xin gửi tới Gia đình tổng kết tình hình buổi học ngày ${sess.session_date}:

1. Nội dung bài giảng & Chuyên đề:
- Bài học: ${sess.lesson_title}
- Chuyên đề: ${sess.chapter || 'Toán THCS trọng tâm'}

2. Tình hình lớp học & Kết quả chung:
- Sĩ số tham gia: ${presentCount}/${totalCount} học sinh (${
      totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 100
    }%).
- Điểm trung bình BTVN của lớp: ${avgHw}${avgHw !== 'Chưa chấm' ? '/10' : ''}
- Điểm trung bình Kiểm tra của lớp: ${avgTest}${avgTest !== 'Không có KT' ? '/10' : ''}

3. Bảng Vinh Danh & Ghi Nhận Tích Cực:
${praiseTestLine}
${praiseHwLine}

4. Bài tập về nhà & Dặn dò buổi tới:
- Nhiệm vụ BTVN: ${hwDesc}
- Lịch học của lớp: ${cls.schedule}

Nhờ Quý Phụ huynh nhắc nhở các con hoàn thành đầy đủ BTVN trước buổi học tới. Với những con cần lưu ý riêng hoặc cần kèm bổ trợ, ${teacherTitle} sẽ nhắn tin trao đổi trực tiếp tới Zalo cá nhân của Phụ huynh ạ. Trân trọng cảm ơn Quý Phụ huynh!`;

    return {
      title: `Tổng kết buổi học ${sess.session_date} - ${sess.lesson_title}`,
      announcementText,
      presentCount,
      totalCount,
      avgHw,
      avgTest,
      topTestStudents,
      topHwStudents,
    };
  }

  // Mode: 'cycle_4' (Latest 4 sessions summary)
  const cycleSessions = sortedSessions.slice(0, 4).reverse();
  const cycleSessionIds = new Set(cycleSessions.map((s) => String(s.id)));
  const dateRange =
    cycleSessions.length > 0
      ? `${cycleSessions[0].session_date} đến ${
          cycleSessions[cycleSessions.length - 1].session_date
        }`
      : '';

  const topicsList = Array.from(
    new Set(cycleSessions.map((s) => s.lesson_title).filter(Boolean))
  );

  const cycleRecs = allStudentSessions.filter(
    (ss) =>
      cycleSessionIds.has(String(ss.session_id)) &&
      (studentMap.size === 0 || studentMap.has(String(ss.student_id)))
  );

  const presentRecs = cycleRecs.filter(
    (r) => !r.attendance || r.attendance === 'present' || r.attendance === 'late'
  );
  const attendancePct =
    cycleRecs.length > 0
      ? Math.round((presentRecs.length / cycleRecs.length) * 100)
      : 100;

  const validHw = cycleRecs.filter(
    (r) =>
      !r.exempt &&
      !r.exempt_homework &&
      typeof r.homework_score === 'number' &&
      r.homework_score > 0
  );
  const avgHw =
    validHw.length > 0
      ? (
          validHw.reduce((sum, r) => sum + Number(r.homework_score || 0), 0) /
          validHw.length
        ).toFixed(1)
      : 'Chưa chấm';

  const validTests = cycleRecs.filter(
    (r) =>
      !r.exempt &&
      !r.exempt_test &&
      typeof r.test_score === 'number' &&
      r.test_score > 0
  );
  const avgTest =
    validTests.length > 0
      ? (
          validTests.reduce((sum, r) => sum + Number(r.test_score || 0), 0) /
          validTests.length
        ).toFixed(1)
      : 'Chưa KT';

  // Compute per-student averages across the 4 sessions
  const studentTestScoresMap = new Map<string, number[]>();
  const studentHwScoresMap = new Map<string, number[]>();
  for (const r of cycleRecs) {
    const sid = String(r.student_id);
    if (typeof r.test_score === 'number' && r.test_score > 0) {
      if (!studentTestScoresMap.has(sid)) studentTestScoresMap.set(sid, []);
      studentTestScoresMap.get(sid)!.push(Number(r.test_score));
    }
    if (typeof r.homework_score === 'number' && r.homework_score > 0) {
      if (!studentHwScoresMap.has(sid)) studentHwScoresMap.set(sid, []);
      studentHwScoresMap.get(sid)!.push(Number(r.homework_score));
    }
  }

  const topTestStudents: Array<{ name: string; score: number }> = [];
  for (const [sid, scores] of studentTestScoresMap.entries()) {
    const avg = Number(
      (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)
    );
    if (avg >= 7.8) {
      topTestStudents.push({
        name: studentMap.get(sid)?.full_name || 'Học sinh',
        score: avg,
      });
    }
  }
  topTestStudents.sort((a, b) => b.score - a.score);

  const topHwStudents: Array<{ name: string; score: number }> = [];
  for (const [sid, scores] of studentHwScoresMap.entries()) {
    const avg = Number(
      (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)
    );
    if (avg >= 8.2) {
      topHwStudents.push({
        name: studentMap.get(sid)?.full_name || 'Học sinh',
        score: avg,
      });
    }
  }
  topHwStudents.sort((a, b) => b.score - a.score);

  const announcementText = `BÁO CÁO TỔNG KẾT CHU KỲ ${cycleSessions.length} BUỔI HỌC - LỚP ${cls.class_name.toUpperCase()} (${dateRange})

Kính gửi Quý Phụ huynh lớp ${cls.class_name},
${teacherTitle} ${teacherName} xin gửi tới Quý Phụ huynh báo cáo tổng hợp tình hình học tập của cả lớp trong chu kỳ ${cycleSessions.length} buổi vừa qua (${dateRange}):

1. Các bài học & Chuyên đề đã hoàn thành:
${topicsList.map((t, i) => `- Buổi ${i + 1}: ${t}`).join('\n')}

2. Chỉ số chất lượng toàn lớp:
- Tỷ lệ chuyên cần chung của lớp: ${attendancePct}%
- Điểm TB BTVN toàn lớp: ${avgHw}${avgHw !== 'Chưa chấm' ? '/10' : ''}
- Điểm TB Kiểm tra toàn lớp: ${avgTest}${avgTest !== 'Chưa KT' ? '/10' : ''}

3. Vinh danh Học sinh Phong độ Xuất sắc & Chuyên cần:
- Top điểm Kiểm tra TB cao nhất lớp: ${
    topTestStudents.slice(0, 8).map((s) => `${s.name} (${s.score}đ)`).join(', ') ||
    'Các con đang duy trì điểm số đồng đều'
  }.
- Top hoàn thành BTVN xuất sắc: ${
    topHwStudents.slice(0, 8).map((s) => `${s.name} (${s.score}đ)`).join(', ') ||
    'Đa số các con nộp bài đầy đủ'
  }.

${teacherTitle} đã tổng hợp phiếu báo cáo chi tiết riêng của từng con để gửi tới Zalo cá nhân của Quý Phụ huynh. Trân trọng cảm ơn sự đồng hành của Gia đình!`;

  return {
    title: `Tổng kết chu kỳ ${cycleSessions.length} buổi (${dateRange})`,
    announcementText,
    presentCount: activeClassStudents.length,
    totalCount: activeClassStudents.length,
    avgHw,
    avgTest,
    topTestStudents: topTestStudents.slice(0, 8),
    topHwStudents: topHwStudents.slice(0, 8),
  };
}

/**
 * Generates an accurate, personalized Zalo message for an individual student
 * right after grading a specific session (for either Reminder/Coordination or Praise).
 */
export function compileSingleSessionStudentZaloMessage(params: {
  student: Student;
  cls: ClassItem;
  session: Session;
  rec: Partial<StudentSession>;
  prevSession?: Session | null;
  prevRec?: Partial<StudentSession> | null;
  classAvgHw?: number;
  classAvgTest?: number;
  mode: 'reminder' | 'praise';
  pronounConfig?: PronounConfig;
}): {
  issueBadges: string[];
  messageText: string;
  suggestedCrmStatus: CRMCustomerStatus;
} {
  const {
    student,
    cls,
    session,
    rec,
    prevSession,
    prevRec,
    classAvgHw,
    classAvgTest,
    mode,
    pronounConfig,
  } = params;

  const teacherTitle = pronounConfig?.teacher_title || 'Thầy';
  const teacherName = pronounConfig?.teacher_name || 'Giáo viên Toán';
  const studentPronoun = (pronounConfig?.student_pronoun || 'con').toLowerCase();

  const issueBadges: string[] = [];
  const att = rec.attendance || 'present';
  const isHwExempt = !!(rec.exempt || rec.exempt_homework);
  const isTestExempt = !!(rec.exempt || rec.exempt_test);

  if (att === 'absent_unexcused') issueBadges.push('Vắng không phép');
  else if (att === 'absent_excused') issueBadges.push('Nghỉ có phép');
  else if (att === 'late') issueBadges.push('Đi muộn');

  if (session.has_homework !== false && !isHwExempt && !att.startsWith('absent')) {
    if (rec.homework_submitted === false) issueBadges.push('Chưa làm BTVN');
    else if (rec.late_submit) issueBadges.push('Nộp muộn BTVN');
    else if (typeof rec.homework_score === 'number' && rec.homework_score < 5) {
      issueBadges.push(`BTVN thấp (${rec.homework_score}đ)`);
    }
  }

  if (session.has_test !== false && !isTestExempt && !att.startsWith('absent')) {
    if (typeof rec.test_score === 'number' && rec.test_score < 5) {
      issueBadges.push(`Điểm KT thấp (${rec.test_score}đ)`);
    }
  }

  if (
    prevSession &&
    prevRec &&
    !prevRec.exempt &&
    !prevRec.exempt_test &&
    typeof prevRec.test_score === 'number' &&
    prevRec.test_score < 5
  ) {
    issueBadges.push(`Trả bài KT buổi trước (${prevRec.test_score}đ)`);
  }

  if (mode === 'praise') {
    if (typeof rec.test_score === 'number' && rec.test_score >= 8.0) {
      issueBadges.push(`KT Xuất sắc (${rec.test_score}đ)`);
    }
    if (typeof rec.homework_score === 'number' && rec.homework_score >= 8.5) {
      issueBadges.push(`BTVN Xuất sắc (${rec.homework_score}đ)`);
    }
    if (
      typeof rec.test_score === 'number' &&
      typeof prevRec?.test_score === 'number' &&
      rec.test_score - prevRec.test_score >= 1.0
    ) {
      issueBadges.push(
        `Tiến bộ +${(rec.test_score - prevRec.test_score).toFixed(1)}đ so với buổi trước`
      );
    }
  }

  // Attendance text
  const attLine =
    att === 'absent_unexcused'
      ? 'Vắng học KHÔNG PHÉP'
      : att === 'absent_excused'
      ? 'Nghỉ học có phép'
      : att === 'late'
      ? 'Có mặt (Đi học muộn)'
      : 'Có mặt đúng giờ, học tập nghiêm túc';

  // Homework text
  let hwLine = 'Không giao BTVN';
  if (session.has_homework !== false) {
    if (att.startsWith('absent')) {
      hwLine = 'Chưa nộp do vắng mặt buổi học hôm nay';
    } else if (isHwExempt) {
      hwLine = 'Được miễn BTVN buổi này';
    } else if (rec.homework_submitted === false) {
      hwLine = 'Chưa hoàn thành BTVN trước khi đến lớp';
    } else if (rec.late_submit) {
      hwLine =
        typeof rec.homework_score === 'number'
          ? `Nộp muộn BTVN (Điểm: ${rec.homework_score}/10)`
          : 'Nộp muộn BTVN';
    } else if (typeof rec.homework_score === 'number') {
      hwLine = `Đạt ${rec.homework_score}/10 điểm${
        classAvgHw && classAvgHw > 0 ? ` (TB lớp: ${classAvgHw}/10)` : ''
      }`;
    } else {
      hwLine = 'Đã kiểm tra vở BTVN';
    }
  }

  // Test score text
  let testLine = '';
  if (session.has_test !== false && !isTestExempt) {
    if (att.startsWith('absent')) {
      testLine = `- Bài kiểm tra trên lớp: Cần sắp xếp làm bài kiểm tra bù.`;
    } else if (typeof rec.test_score === 'number') {
      const deltaStr =
        typeof prevRec?.test_score === 'number'
          ? rec.test_score > prevRec.test_score
            ? ` - Tăng +${(rec.test_score - prevRec.test_score).toFixed(1)}đ so với buổi trước (${prevRec.test_score}đ)`
            : rec.test_score < prevRec.test_score
            ? ` - Giảm ${(prevRec.test_score - rec.test_score).toFixed(1)}đ so với buổi trước (${prevRec.test_score}đ)`
            : ''
          : '';
      testLine = `- Điểm Kiểm tra buổi hôm nay: Đạt ${rec.test_score}/10 điểm${
        classAvgTest && classAvgTest > 0 ? ` (TB lớp: ${classAvgTest}/10)` : ''
      }${deltaStr}.`;
    } else if (typeof prevRec?.test_score === 'number' && prevSession) {
      testLine = `- Trả điểm Bài kiểm tra buổi trước (${prevSession.session_date}): Đạt ${prevRec.test_score}/10 điểm (Bài KT hôm nay đang chờ chấm).`;
    }
  }

  const rawComment = (
    rec.custom_comment ||
    (Array.isArray(rec.quick_preset_comments)
      ? rec.quick_preset_comments.join('; ')
      : '')
  ).trim();

  const commentLine =
    rawComment ||
    (mode === 'praise'
      ? `Trên lớp ${studentPronoun} nắm vững kiến thức trọng tâm, trình bày bài cẩn thận và có ý thức học tập rất tốt.`
      : `Cần ôn kỹ lại các ví dụ mẫu đã chữa trên lớp và hoàn thành đầy đủ bài tập tự luyện.`);

  const hwNextDesc =
    session.homework_description?.trim() ||
    `Hoàn thành phiếu bài tập chuyên đề "${session.lesson_title}".`;

  if (mode === 'praise') {
    const messageText = `Dạ ${teacherTitle} ${teacherName} xin gửi lời khen ngợi và chúc mừng kết quả buổi học hôm nay (${session.session_date}) của ${studentPronoun} ${student.full_name} (Lớp ${cls.class_name}) tới Gia đình ạ!

1. Nội dung buổi học: ${session.lesson_title}
2. Kết quả học tập xuất sắc trong buổi học:
- Chuyên cần: ${attLine}.
- Bài tập về nhà: ${hwLine}.
${testLine ? `${testLine}\n` : ''}- Nhận xét của ${teacherTitle}: ${commentLine}

3. Nhiệm vụ BTVN cho buổi tới:
- ${hwNextDesc}

Nhờ Gia đình gửi lời khen để khích lệ tinh thần giúp ${studentPronoun} tiếp tục phát huy phong độ rất tốt này trong các buổi học tiếp theo nhé ạ!`;

    return {
      issueBadges: issueBadges.length > 0 ? issueBadges : ['Hoàn thành tốt'],
      messageText,
      suggestedCrmStatus: 'satisfied',
    };
  }

  // Mode: 'reminder'
  const isAtRisk =
    att === 'absent_unexcused' ||
    (typeof rec.test_score === 'number' && rec.test_score < 4.5);

  const actionGuidance = att.startsWith('absent')
    ? `Do hôm nay ${studentPronoun} vắng mặt ở chuyên đề "${session.lesson_title}", ${teacherTitle} đã lưu lại phiếu bài tập và đề kiểm tra. Nhờ Gia đình nhắc ${studentPronoun} chép bài đầy đủ và báo lại ${teacherTitle} khung giờ để xếp lịch học bù/kèm lại kiến thức trước buổi học tới ạ.`
    : `Nhờ Gia đình phối hợp nhắc nhở ${studentPronoun} xem lại các lỗi sai ${teacherTitle} đã chữa kỹ trong vở và dành khoảng 30-45 phút hoàn thành đầy đủ nhiệm vụ BTVN (${hwNextDesc}) trước khi đến lớp buổi sau nhé ạ!`;

  const messageText = `Dạ ${teacherTitle} ${teacherName} xin phép thông tin nhanh tới Gia đình tình hình buổi học môn Toán hôm nay (${session.session_date}) của ${studentPronoun} ${student.full_name} (Lớp ${cls.class_name}):

1. Chuyên đề bài học: ${session.lesson_title}
2. Ghi nhận tình hình của ${studentPronoun} trong buổi học:
- Điểm danh: ${attLine}.
- Bài tập về nhà: ${hwLine}.
${testLine ? `${testLine}\n` : ''}- Nhận xét chi tiết của ${teacherTitle}: ${commentLine}

3. Phương án phối hợp & BTVN buổi tới:
- ${actionGuidance}

Gia đình xem qua nếu cần trao đổi thêm hoặc hẹn lịch kèm bổ trợ cho ${studentPronoun}, Phụ huynh nhắn lại giúp ${teacherTitle} nhé ạ!`;

  return {
    issueBadges: issueBadges.length > 0 ? issueBadges : ['Cần lưu ý'],
    messageText,
    suggestedCrmStatus: isAtRisk ? 'at_risk' : 'attention',
  };
}


