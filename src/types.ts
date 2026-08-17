export type GradeLevel = 6 | 7 | 8 | 9;

export type StudentStatus = 'studying' | 'paused' | 'stopped';

export type ClassStatus = 'active' | 'archived';

export type ClassType = 'specialized' | 'standard' | 'remedial';

export type AttendanceStatus = 'present' | 'absent_excused' | 'absent_unexcused' | 'late';

export type PriorityLevel = 'P1' | 'P2' | 'P3' | 'Praise';

export type UserRole = 'teacher' | 'assistant' | 'Teacher' | 'TA';

export interface AuthUser {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
  role: UserRole;
  isDemo?: boolean;
}

export interface SchoolYear {
  id?: string;
  name: string; // e.g., "2025-2026"
  is_active: boolean;
  is_demo?: boolean;
  created_at: string;
  updated_at: string;
}

export interface ClassItem {
  id?: string;
  school_year_id: string;
  class_name: string; // e.g., "9A1 - Chuyên Ôn Thi Vào 10"
  class_type?: ClassType; // specialized, standard, remedial
  grade_level: GradeLevel;
  target_description: string; // e.g., "Mục tiêu: Thi Lớp 10 Công lập 8.5+"
  schedule: string; // e.g., "Thứ 3 (18h-20h), Chủ Nhật (14h-16h)"
  assistant_name: string;
  assistant_phone: string;
  status: ClassStatus;
  is_demo?: boolean;
  created_at: string;
  updated_at: string;
}

export interface Student {
  id?: string;
  full_name: string;
  gender: 'Nam' | 'Nữ';
  birthday?: string;
  phone?: string;
  parent_name: string;
  parent_phone: string;
  address?: string;
  note?: string;
  status: StudentStatus;
  leave_reason?: string;
  is_demo?: boolean;
  created_at: string;
  updated_at: string;
}

export interface ClassStudent {
  id?: string;
  class_id: string;
  student_id: string;
  join_date: string;
  leave_date?: string;
  is_demo?: boolean;
  created_at: string;
}

export interface Session {
  id?: string;
  class_id: string;
  session_date: string; // YYYY-MM-DD
  lesson_title: string; // e.g., "Buổi 8: Bất đẳng thức Bunhiacopxki & Tứ giác nội tiếp"
  chapter: string; // e.g., "Chương 2: Hình học Đường tròn"
  knowledge_tag_id?: string;
  homework_description: string;
  has_homework?: boolean; // Indicates if this session has a homework assignment
  has_test?: boolean; // Indicates if this session has a test
  is_demo?: boolean;
  created_at: string;
  updated_at: string;
  test_knowledge_tag?: string; // e.g., "Đại số 9 - Căn thức bậc hai & Rút gọn" hoặc trùng với bài học
}

export interface StudentSession {
  id?: string;
  student_id: string;
  session_id: string;
  attendance: AttendanceStatus;
  homework_score: number; // 0-10
  test_score: number; // 0-10
  homework_submitted: boolean;
  late_submit: boolean;
  makeup_test: boolean;
  exempt: boolean;
  exempt_homework?: boolean;
  exempt_test?: boolean;
  quick_preset_comments: string[];
  custom_comment: string;
  remedial_actions?: string[]; // e.g., ["Đã giao phiếu bài tập gỡ điểm", "Đã kèm riêng 15 phút"]
  is_demo?: boolean;
  updated_at: string;
}

export interface KnowledgeTag {
  id?: string;
  grade_level: GradeLevel;
  category: 'Algebra' | 'Geometry';
  tag_name: string; // e.g. "Căn thức bậc hai", "Hệ thức lượng", "Đường tròn", "Tứ giác nội tiếp"
  reference_link?: string; // Link to reference material or video
  is_demo?: boolean;
  created_at: string;
}

export interface KnowledgeResult {
  id?: string;
  student_id: string;
  knowledge_tag_id: string;
  mastery_score: number; // 0-10
  is_demo?: boolean;
  last_updated: string;
}

export interface Warning {
  id?: string;
  student_id: string;
  class_id: string;
  priority: PriorityLevel; // P1 (Khẩn cấp), P2 (Nội bộ)
  warning_type: string; // e.g., "Vắng không phép 2 buổi", "Điểm kiểm tra < 5", "Lệch BTVN & Bài thi"
  reason: string;
  resolved: boolean;
  resolved_action?: string; // e.g., "Đã gọi Phụ huynh", "Đã phụ đạo bù", "Đã cho làm lại bài"
  is_demo?: boolean;
  created_at: string;
  updated_at: string;
}

export interface AIDiagnosisData {
  knowledge_gap: string;
  learning_trend: string;
  actionable_advice: string;
  parent_summary: string;
}

export interface AIDiagnosis {
  id?: string;
  student_id: string;
  diagnosis_json: AIDiagnosisData;
  is_demo?: boolean;
  created_at: string;
}

export interface AuditLog {
  id?: string;
  user_role: UserRole;
  action_type: string;
  description: string;
  is_demo?: boolean;
  timestamp: string;
}

export interface WarningRuleConfig {
  minTestScore: number; // e.g., 5.0 or 6.0
  consecutiveLowTests: number; // e.g., 2 consecutive sessions
  maxAbsences: number; // e.g., 2 absences
  minHomeworkScore: number; // e.g., 5.0
  consecutiveLowHomework: number; // e.g., 3 consecutive missing/low homeworks
  scoreDropThreshold: number; // e.g., 2.0 drop compared to average
  // Praise Thresholds (🟢 Tuyên dương)
  excellentTestScore: number; // e.g., 9.0 (mức tuyên dương điểm xuất sắc)
  progressIncreaseThreshold: number; // e.g., 1.5 điểm tiến bộ
  enablePraiseAttendanceHw: boolean; // Tuyên dương 100% chuyên cần & BTVN
}

export interface StudentStats {
  studentId: string;
  totalSessions: number;
  presentCount: number;
  lateCount: number;
  excusedCount: number;
  unexcusedCount: number;
  hwAverage: number;
  testAverage: number;
  weightedAverage: number;
  consecutiveLowTestCount: number;
  consecutiveLowHwCount: number;
  unsubmittedHwCount: number;
  scoreTrend: 'Improving' | 'Stable' | 'Declining';
  latestTestScore?: number;
  latestHwScore?: number;
}

export interface DetectedWarning {
  type: 'test_score' | 'homework' | 'attendance' | 'performance_gap' | 'praise_score' | 'praise_progress' | 'praise_diligence';
  priority: PriorityLevel; // 'P1' | 'P2' | 'Praise'
  badgeColor: 'red' | 'amber' | 'yellow' | 'emerald';
  title: string;
  reason: string;
}

export interface WarningThresholds {
  unexcused_absent_count: number; // default 2
  failed_test_count: number; // test < 5 in 2 consecutive sessions
  missing_homework_count: number; // default 3
  score_drop_threshold: number; // default 2
}

export interface PronounConfig {
  teacher_title: string; // "Thầy" | "Cô"
  teacher_name: string; // "Nguyễn Văn Toán"
  student_pronoun: string; // "Con" | "Em"
}

export interface Settings {
  id?: string;
  gemini_api_key?: string;
  warning_rule_config: WarningRuleConfig; // Fallback / Standard
  class_profile_configs?: {
    standard: WarningRuleConfig;
    specialized: WarningRuleConfig;
    remedial: WarningRuleConfig;
  };
  pronoun_config: PronounConfig;
  theme: 'light' | 'dark';
  updated_at: string;
}
