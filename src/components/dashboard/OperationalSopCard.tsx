import React, { useState, useEffect, useMemo } from 'react';
import { ClassItem, Session, Student, Warning } from '../../types';
import { TabKey } from '../Sidebar';
import {
  CheckCircle2,
  Circle,
  Clock,
  CalendarRange,
  Keyboard,
  Send,
  ShieldAlert,
  UserSquare2,
  BrainCircuit,
  HeartHandshake,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  ArrowRight,
  Sparkles,
} from 'lucide-react';

interface OperationalSopCardProps {
  classes: ClassItem[];
  students: Student[];
  warnings: Warning[];
  sessions: Session[];
  onNavigateTab: (tab: TabKey) => void;
}

interface SopStepItem {
  id: string;
  stepNumber: number;
  title: string;
  durationBadge: string;
  description: string;
  metricBadge: string;
  metricTone: 'emerald' | 'amber' | 'rose' | 'sky';
  actionLabel: string;
  targetTab: TabKey;
  icon: React.ElementType;
}

const STORAGE_KEY_PREFIX = 'smart_edu_sop_checklist_';

export const OperationalSopCard: React.FC<OperationalSopCardProps> = ({
  classes,
  students,
  warnings,
  sessions,
  onNavigateTab,
}) => {
  const [activeMode, setActiveMode] = useState<'post_session' | 'post_cycle'>('post_session');
  const [isCollapsed, setIsCollapsed] = useState(false);

  const todayKey = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const storageKey = `${STORAGE_KEY_PREFIX}${todayKey}`;

  const [completedStepIds, setCompletedStepIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(completedStepIds));
    } catch {
      // Ignore storage error
    }
  }, [completedStepIds, storageKey]);

  const toggleStepDone = (stepId: string) => {
    setCompletedStepIds((prev) =>
      prev.includes(stepId) ? prev.filter((id) => id !== stepId) : [...prev, stepId]
    );
  };

  const handleResetChecklist = () => {
    setCompletedStepIds([]);
  };

  // Real-time operational numbers
  const activeClassesCount = useMemo(
    () => classes.filter((c) => c.status === 'active').length,
    [classes]
  );

  const activeStudentsCount = useMemo(
    () => students.filter((s) => s.status !== 'stopped').length,
    [students]
  );

  const todaySessionsCount = useMemo(
    () => sessions.filter((s) => s.session_date === todayKey).length,
    [sessions, todayKey]
  );

  const unresolvedWarnings = useMemo(
    () => warnings.filter((w) => !w.resolved && (w.priority === 'P1' || w.priority === 'P2')),
    [warnings]
  );
  const p1Count = useMemo(
    () => unresolvedWarnings.filter((w) => w.priority === 'P1').length,
    [unresolvedWarnings]
  );
  const p2Count = useMemo(
    () => unresolvedWarnings.filter((w) => w.priority === 'P2').length,
    [unresolvedWarnings]
  );

  const contactedTodayCount = useMemo(
    () =>
      students.filter(
        (s) =>
          s.status !== 'stopped' &&
          s.crm_last_contacted_at &&
          s.crm_last_contacted_at.slice(0, 10) === todayKey
      ).length,
    [students, todayKey]
  );

  const crmDueOrAtRiskCount = useMemo(
    () =>
      students.filter((s) => {
        if (s.status === 'stopped') return false;
        if (s.crm_status === 'at_risk') return true;
        if (s.crm_next_followup_date && s.crm_next_followup_date <= todayKey) return true;
        return false;
      }).length,
    [students, todayKey]
  );

  // Nhịp 1: Quy trình 5 Phút Sau Mỗi Buổi Học
  const postSessionSteps: SopStepItem[] = useMemo(
    () => [
      {
        id: 'daily_step_1_grade_entry',
        stepNumber: 1,
        title: 'Điểm danh & Nhập điểm buổi học (Chuẩn 70% KT + 30% BTVN)',
        durationBadge: '3 phút',
        description:
          'Chọn lớp vừa dạy -> Tạo buổi học & chọn Chuyên đề Kiểm tra -> Nhập điểm BTVN (30%) và Kiểm tra (70%). Học sinh không nộp BTVN hoặc vắng không phép tự động tính 0đ; học sinh mới/có phép nhớ tick Miễn hoặc Vắng có phép.',
        metricBadge:
          todaySessionsCount > 0
            ? `Hôm nay đã nhập: ${todaySessionsCount} buổi`
            : `${activeClassesCount} lớp đang hoạt động`,
        metricTone: todaySessionsCount > 0 ? 'emerald' : 'sky',
        actionLabel: 'Mở Bảng Nhập Điểm Thần Tốc',
        targetTab: 'grade-entry',
        icon: Keyboard,
      },
      {
        id: 'daily_step_2_post_session_zalo',
        stepNumber: 2,
        title: 'Gửi Bản Tin Nhóm Lớp & Nhắn Zalo Riêng Sau Buổi Học',
        durationBadge: '1.5 phút',
        description:
          'Ngay khi bấm "Lưu Toàn Bộ Bảng Điểm", dùng cửa sổ Trợ Lý CSKH Sau Buổi Học vừa bật lên để: (1) Copy Bản tin tổng kết gửi nhóm Zalo lớp, (2) Copy Zalo nhắc riêng các em vắng/thiếu BTVN/điểm < 6.5đ, (3) Khen ngợi học sinh >= 8.5đ.',
        metricBadge: 'Tự động lưu Nhật ký CRM khi Copy Zalo',
        metricTone: 'emerald',
        actionLabel: 'Vào Quản Lý Lớp & Nhập Điểm',
        targetTab: 'classes',
        icon: Send,
      },
      {
        id: 'daily_step_3_crm_verify',
        stepNumber: 3,
        title: 'Kiểm tra nhanh Nhật ký CRM & Phản hồi Phụ huynh trong ngày',
        durationBadge: '30 giây',
        description:
          'Mọi tin nhắn Zalo vừa gửi ở Bước 2 đã tự động ghi vào Nhật ký CRM của từng học sinh. Kiểm tra và ghi chú lại phản hồi của Phụ huynh (nếu Phụ huynh nhắn lại xin nghỉ phép hoặc nhờ kèm thêm).',
        metricBadge: `Đã CSKH hôm nay: ${contactedTodayCount} Phụ huynh`,
        metricTone: contactedTodayCount > 0 ? 'emerald' : 'amber',
        actionLabel: 'Xem Nhật Ký CRM Hôm Nay',
        targetTab: 'crm',
        icon: HeartHandshake,
      },
    ],
    [todaySessionsCount, activeClassesCount, contactedTodayCount]
  );

  // Nhịp 2: Quy trình 15 Phút Sau Từng Chu Kỳ (2-4 Buổi Học)
  const postCycleSteps: SopStepItem[] = useMemo(
    () => [
      {
        id: 'cycle_step_1_warnings',
        stepNumber: 1,
        title: 'Quét Cảnh Báo Học Tập (Cửa Sổ 2 Buổi Gần Nhất) & Khóa Mốc Giải Quyết',
        durationBadge: '4 phút',
        description:
          'Xử lý dứt điểm các Thẻ Cảnh Báo Hợp Nhất (Đỏ P1: Điểm KT < 5.0đ hoặc vắng/bỏ BTVN 2 buổi liên tiếp; Cam P2: Điểm tổng hợp < 6.5đ). Bấm "Copy Zalo Cảnh Báo" gửi Phụ huynh rồi bấm "Đã xử lý" để khóa mốc 2 buổi cũ lại.',
        metricBadge:
          unresolvedWarnings.length > 0
            ? `${unresolvedWarnings.length} cảnh báo chờ xử lý (${p1Count} P1, ${p2Count} P2)`
            : '0 cảnh báo tồn đọng (Đã xử lý sạch)',
        metricTone: p1Count > 0 ? 'rose' : p2Count > 0 ? 'amber' : 'emerald',
        actionLabel: 'Mở Trung Tâm Cảnh Báo 2 Buổi',
        targetTab: 'warnings',
        icon: ShieldAlert,
      },
      {
        id: 'cycle_step_2_performance_card',
        stepNumber: 2,
        title: 'Xuất Ảnh Phiếu Phong Độ PNG & Copy Zalo Phong Độ Gửi Phụ Huynh',
        durationBadge: '5 phút',
        description:
          'Vào Hồ Sơ Học Sinh -> Mở Ngăn kéo Hồ Sơ Phong Độ -> Bấm bộ đôi "Copy Zalo Phong Độ" kèm "Xuất Ảnh Phiếu Phong Độ PNG (Retina 2x không cắt chữ)" gửi thẳng qua Zalo cho Phụ huynh để báo cáo xu hướng 2 buổi & điểm 70/30.',
        metricBadge: `${activeStudentsCount} hồ sơ phong độ học sinh`,
        metricTone: 'sky',
        actionLabel: 'Mở Hồ Sơ Phong Độ Học Sinh',
        targetTab: 'students',
        icon: UserSquare2,
      },
      {
        id: 'cycle_step_3_knowledge_docx',
        stepNumber: 3,
        title: 'Gom Nhóm Lỗ Hổng Chuyên Đề (< 7.0đ) & Xuất Phiếu Bù Hổng Word (.DOCX)',
        durationBadge: '4 phút',
        description:
          'Vào Bản Đồ Kiến Thức & AI (đo 100% Điểm Kiểm Tra) -> Mở tab "Gom Nhóm Lỗ Hổng Theo Lớp" để xếp lịch phụ đạo nhóm, xuất "Phiếu Bài Tập Bù Hổng (.DOCX Cambria Math)" và "Ảnh Phiếu Bản Đồ PNG" gửi Phụ huynh.',
        metricBadge: 'Chuẩn 100% Điểm KT & Word MathType',
        metricTone: 'emerald',
        actionLabel: 'Mở Bản Đồ Kiến Thức & AI',
        targetTab: 'knowledge-map',
        icon: BrainCircuit,
      },
      {
        id: 'cycle_step_4_crm_retention',
        stepNumber: 4,
        title: 'Chăm Sóc Nhóm Nguy Cơ Nghỉ Học & Đến Hạn Follow-up Trong CRM',
        durationBadge: '2 phút',
        description:
          'Rà soát những học sinh đang ở trạng thái "Nguy cơ nghỉ học (Đỏ)" hoặc đến lịch hẹn chăm sóc lại hôm nay để gọi điện/nhắn tin hỏi thăm sự tiến bộ của con và chuyển trạng thái sang "Phụ huynh hài lòng (Xanh)".',
        metricBadge:
          crmDueOrAtRiskCount > 0
            ? `${crmDueOrAtRiskCount} HS cần ưu tiên chăm sóc ngay`
            : '100% Phụ huynh trong ngưỡng an toàn',
        metricTone: crmDueOrAtRiskCount > 0 ? 'rose' : 'emerald',
        actionLabel: 'Mở Bảng CRM Chăm Sóc',
        targetTab: 'crm',
        icon: HeartHandshake,
      },
    ],
    [unresolvedWarnings.length, p1Count, p2Count, activeStudentsCount, crmDueOrAtRiskCount]
  );

  const currentSteps = activeMode === 'post_session' ? postSessionSteps : postCycleSteps;
  const completedInCurrentMode = currentSteps.filter((s) =>
    completedStepIds.includes(s.id)
  ).length;
  const progressPercent = Math.round((completedInCurrentMode / currentSteps.length) * 100);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-emerald-200/90 dark:border-emerald-900/70 shadow-sm overflow-hidden">
      {/* Top Bar */}
      <div className="p-4 sm:p-5 bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 text-white flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Sparkles className="w-5 h-5 text-emerald-300" />
            <h3 className="text-sm sm:text-base font-black tracking-tight text-white">
              Sổ Tay Checklist Vận Hành Chuẩn (SOP): Giáo Viên Kiêm Chăm Sóc Khách Hàng
            </h3>
            <span className="px-2.5 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-400/30 text-emerald-200 text-[11px] font-extrabold">
              Hoàn thành: {completedInCurrentMode}/{currentSteps.length} bước ({progressPercent}%)
            </span>
          </div>
          <p className="text-xs text-emerald-100/85 font-medium">
            Bấm trực tiếp vào từng bước bên dưới để thực hiện đúng quy trình khép kín: Nhập điểm ➔ Báo cáo Zalo/Ảnh PNG ➔ Bù lỗ hổng .DOCX ➔ Lưu Nhật ký CRM.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {/* Mode Switcher */}
          <div className="flex items-center p-1 bg-white/10 border border-white/15 rounded-xl">
            <button
              onClick={() => {
                setActiveMode('post_session');
                setIsCollapsed(false);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeMode === 'post_session'
                  ? 'bg-white text-emerald-950 shadow-xs font-extrabold'
                  : 'text-white/80 hover:text-white'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Sau Mỗi Buổi Học (5 Phút)</span>
            </button>

            <button
              onClick={() => {
                setActiveMode('post_cycle');
                setIsCollapsed(false);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeMode === 'post_cycle'
                  ? 'bg-white text-emerald-950 shadow-xs font-extrabold'
                  : 'text-white/80 hover:text-white'
              }`}
            >
              <CalendarRange className="w-3.5 h-3.5" />
              <span>Sau Chu Kỳ 2–4 Buổi (15 Phút)</span>
            </button>
          </div>

          <button
            onClick={handleResetChecklist}
            title="Làm mới đánh dấu Checklist hôm nay"
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white/90 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <button
            onClick={() => setIsCollapsed((prev) => !prev)}
            className="px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center gap-1 transition-colors"
          >
            {isCollapsed ? (
              <>
                <span>Mở rộng</span>
                <ChevronDown className="w-4 h-4" />
              </>
            ) : (
              <>
                <span>Thu gọn</span>
                <ChevronUp className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800">
        <div
          className="h-full bg-emerald-500 transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Checklist Body */}
      {!isCollapsed && (
        <div className="p-4 sm:p-5 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {currentSteps.map((step) => {
              const Icon = step.icon;
              const isDone = completedStepIds.includes(step.id);

              const badgeClass =
                step.metricTone === 'rose'
                  ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                  : step.metricTone === 'amber'
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                  : step.metricTone === 'sky'
                  ? 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300 border-sky-200 dark:border-sky-800'
                  : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';

              return (
                <div
                  key={step.id}
                  className={`p-4 rounded-xl border transition-all flex flex-col justify-between gap-3 ${
                    isDone
                      ? 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/60'
                      : 'bg-slate-50/70 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700/80 hover:border-emerald-300 dark:hover:border-emerald-700'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => toggleStepDone(step.id)}
                        className="flex items-start gap-2.5 text-left group"
                      >
                        {isDone ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                        ) : (
                          <Circle className="w-5 h-5 text-slate-400 group-hover:text-emerald-600 shrink-0 mt-0.5" />
                        )}
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="px-2 py-0.5 rounded bg-slate-900 dark:bg-slate-700 text-white text-[10px] font-extrabold">
                              BƯỚC {step.stepNumber}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px] font-bold">
                              ⏱ {step.durationBadge}
                            </span>
                          </div>
                          <h4
                            className={`text-xs sm:text-sm font-extrabold mt-1 leading-snug ${
                              isDone
                                ? 'line-through text-slate-500 dark:text-slate-400'
                                : 'text-slate-900 dark:text-slate-100'
                            }`}
                          >
                            {step.title}
                          </h4>
                        </div>
                      </button>

                      <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700 text-emerald-600 shrink-0">
                        <Icon className="w-4 h-4" />
                      </div>
                    </div>

                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed pl-7">
                      {step.description}
                    </p>
                  </div>

                  <div className="pt-2.5 border-t border-slate-200/70 dark:border-slate-700/70 pl-7 flex items-center justify-between gap-2 flex-wrap">
                    <span
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${badgeClass}`}
                    >
                      {step.metricBadge}
                    </span>

                    <button
                      type="button"
                      onClick={() => onNavigateTab(step.targetTab)}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs"
                    >
                      <span>{step.actionLabel}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
