import React, { useState, useEffect, useRef } from 'react';
import { Settings, WarningRuleConfig, UserRole } from '../types';
import { db } from '../db/dexie';
import {
  getSafetySnapshots,
  restoreSafetySnapshot,
  removeSafetySnapshot,
  exportFullDatabaseBackupJson,
  importFullDatabaseBackupJson,
  runComprehensiveDatabaseQA,
  SafetySnapshotItem,
  DatabaseQAReport,
} from '../utils/dbSafetyAndQA';
import {
  Settings as SettingsIcon,
  Key,
  Sliders,
  UserCheck,
  Save,
  CheckCircle2,
  Moon,
  Sun,
  Lock,
  AlertCircle,
  Trash2,
  Database,
  Download,
  Upload,
  RotateCcw,
  ShieldCheck,
  Activity,
  RefreshCw,
} from 'lucide-react';

interface SettingsModalProps {
  apiKey: string;
  onSaveApiKey: (key: string) => void;
  theme: 'light' | 'dark';
  currentRole?: UserRole;
  onToggleTheme: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  apiKey,
  onSaveApiKey,
  theme,
  currentRole = 'Teacher',
  onToggleTheme,
}) => {
  const isAdmin = currentRole === 'Teacher';
  const [inputApiKey, setInputApiKey] = useState(apiKey);
  const [teacherTitle, setTeacherTitle] = useState('Thầy');
  const [teacherName, setTeacherName] = useState('Nguyễn Văn Toán');
  const [studentPronoun, setStudentPronoun] = useState('Con');

  const [selectedProfile, setSelectedProfile] = useState<'standard' | 'specialized' | 'remedial'>('standard');
  const [profileConfigs, setProfileConfigs] = useState({
    standard: { maxAbsences: 2, consecutiveLowTests: 2, consecutiveLowHomework: 3, scoreDropThreshold: 2.0, minTestScore: 5.0, minHomeworkScore: 5.0, excellentTestScore: 9.0, progressIncreaseThreshold: 1.5, enablePraiseAttendanceHw: true },
    specialized: { maxAbsences: 2, consecutiveLowTests: 2, consecutiveLowHomework: 3, scoreDropThreshold: 2.0, minTestScore: 7.0, minHomeworkScore: 7.0, excellentTestScore: 9.5, progressIncreaseThreshold: 1.5, enablePraiseAttendanceHw: true },
    remedial: { maxAbsences: 2, consecutiveLowTests: 2, consecutiveLowHomework: 3, scoreDropThreshold: 2.0, minTestScore: 4.0, minHomeworkScore: 4.0, excellentTestScore: 8.5, progressIncreaseThreshold: 1.5, enablePraiseAttendanceHw: true }
  });

  const [saveSuccess, setSaveSuccess] = useState(false);

  // Backup, Safety Vault & QA States
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [safetySnapshots, setSafetySnapshots] = useState<SafetySnapshotItem[]>(() =>
    getSafetySnapshots()
  );
  const [isExportingJson, setIsExportingJson] = useState(false);
  const [isImportingJson, setIsImportingJson] = useState(false);
  const [restoringSnapId, setRestoringSnapId] = useState<string | null>(null);
  const [vaultBanner, setVaultBanner] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const [isRunningQA, setIsRunningQA] = useState(false);
  const [qaReport, setQaReport] = useState<DatabaseQAReport | null>(null);

  useEffect(() => {
    const refreshVault = () => {
      setSafetySnapshots(getSafetySnapshots());
    };
    window.addEventListener('smart_edu_safety_vault_updated', refreshVault);
    return () => {
      window.removeEventListener('smart_edu_safety_vault_updated', refreshVault);
    };
  }, []);

  useEffect(() => {
    db.settings.toArray().then((sList) => {
      if (sList.length > 0) {
        const s = sList[0];
        if (s.gemini_api_key) setInputApiKey(s.gemini_api_key);
        if (s.pronoun_config) {
          setTeacherTitle(s.pronoun_config.teacher_title);
          setTeacherName(s.pronoun_config.teacher_name);
          setStudentPronoun(s.pronoun_config.student_pronoun);
        }

        const newProfiles = { ...profileConfigs };
        const defaultBase = (s.warning_rule_config || {
          maxAbsences: 2,
          consecutiveLowTests: 2,
          consecutiveLowHomework: 3,
          scoreDropThreshold: 2.0,
          minTestScore: 5.0,
          minHomeworkScore: 5.0,
          excellentTestScore: 9.0,
          progressIncreaseThreshold: 1.5,
          enablePraiseAttendanceHw: true,
        }) as WarningRuleConfig;

        if (s.class_profile_configs) {
          if (s.class_profile_configs.standard) {
            newProfiles.standard = {
              maxAbsences: s.class_profile_configs.standard.maxAbsences,
              consecutiveLowTests: s.class_profile_configs.standard.consecutiveLowTests,
              consecutiveLowHomework: s.class_profile_configs.standard.consecutiveLowHomework,
              scoreDropThreshold: s.class_profile_configs.standard.scoreDropThreshold,
              minTestScore: s.class_profile_configs.standard.minTestScore ?? 5.0,
              minHomeworkScore: s.class_profile_configs.standard.minHomeworkScore ?? 5.0,
              excellentTestScore: s.class_profile_configs.standard.excellentTestScore ?? 9.0,
              progressIncreaseThreshold:
                s.class_profile_configs.standard.progressIncreaseThreshold ?? 1.5,
              enablePraiseAttendanceHw:
                s.class_profile_configs.standard.enablePraiseAttendanceHw ?? true,
            };
          }
          if (s.class_profile_configs.specialized) {
            newProfiles.specialized = {
              maxAbsences: s.class_profile_configs.specialized.maxAbsences,
              consecutiveLowTests: s.class_profile_configs.specialized.consecutiveLowTests,
              consecutiveLowHomework: s.class_profile_configs.specialized.consecutiveLowHomework,
              scoreDropThreshold: s.class_profile_configs.specialized.scoreDropThreshold,
              minTestScore: s.class_profile_configs.specialized.minTestScore ?? 7.0,
              minHomeworkScore: s.class_profile_configs.specialized.minHomeworkScore ?? 7.0,
              excellentTestScore: s.class_profile_configs.specialized.excellentTestScore ?? 9.5,
              progressIncreaseThreshold:
                s.class_profile_configs.specialized.progressIncreaseThreshold ?? 1.5,
              enablePraiseAttendanceHw:
                s.class_profile_configs.specialized.enablePraiseAttendanceHw ?? true,
            };
          }
          if (s.class_profile_configs.remedial) {
            newProfiles.remedial = {
              maxAbsences: s.class_profile_configs.remedial.maxAbsences,
              consecutiveLowTests: s.class_profile_configs.remedial.consecutiveLowTests,
              consecutiveLowHomework: s.class_profile_configs.remedial.consecutiveLowHomework,
              scoreDropThreshold: s.class_profile_configs.remedial.scoreDropThreshold,
              minTestScore: s.class_profile_configs.remedial.minTestScore ?? 4.0,
              minHomeworkScore: s.class_profile_configs.remedial.minHomeworkScore ?? 4.0,
              excellentTestScore: s.class_profile_configs.remedial.excellentTestScore ?? 8.5,
              progressIncreaseThreshold:
                s.class_profile_configs.remedial.progressIncreaseThreshold ?? 1.5,
              enablePraiseAttendanceHw:
                s.class_profile_configs.remedial.enablePraiseAttendanceHw ?? true,
            };
          }
        } else {
          newProfiles.standard = {
            maxAbsences: defaultBase.maxAbsences,
            consecutiveLowTests: defaultBase.consecutiveLowTests,
            consecutiveLowHomework: defaultBase.consecutiveLowHomework,
            scoreDropThreshold: defaultBase.scoreDropThreshold,
            minTestScore: defaultBase.minTestScore ?? 5.0,
            minHomeworkScore: defaultBase.minHomeworkScore ?? 5.0,
            excellentTestScore: defaultBase.excellentTestScore ?? 9.0,
            progressIncreaseThreshold: defaultBase.progressIncreaseThreshold ?? 1.5,
            enablePraiseAttendanceHw: defaultBase.enablePraiseAttendanceHw ?? true,
          };
          newProfiles.specialized = {
            ...newProfiles.standard,
            minTestScore: 7.0,
            minHomeworkScore: 7.0,
            excellentTestScore: 9.5,
          };
          newProfiles.remedial = {
            ...newProfiles.standard,
            minTestScore: 4.0,
            minHomeworkScore: 4.0,
            excellentTestScore: 8.5,
          };
        }
        setProfileConfigs(newProfiles);
      }
    });
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    onSaveApiKey(inputApiKey);

    const sList = await db.settings.toArray();
    const now = new Date().toISOString();

    let currentWarningConfig =
      sList.length > 0 && sList[0].warning_rule_config
        ? sList[0].warning_rule_config
        : {
            minTestScore: 5.0,
            consecutiveLowTests: 2,
            maxAbsences: 2,
            minHomeworkScore: 5.0,
            consecutiveLowHomework: 3,
            scoreDropThreshold: 2.0,
            excellentTestScore: 9.0,
            progressIncreaseThreshold: 1.5,
            enablePraiseAttendanceHw: true,
          };

    currentWarningConfig = {
      ...currentWarningConfig,
      ...profileConfigs.standard,
    };

    const fullProfileConfigs = {
      standard: { ...currentWarningConfig, ...profileConfigs.standard },
      specialized: { ...currentWarningConfig, ...profileConfigs.specialized },
      remedial: { ...currentWarningConfig, ...profileConfigs.remedial },
    };

    const newSetting: Settings = {
      gemini_api_key: inputApiKey,
      warning_rule_config: currentWarningConfig,
      class_profile_configs: fullProfileConfigs,
      pronoun_config: {
        teacher_title: teacherTitle,
        teacher_name: teacherName,
        student_pronoun: studentPronoun,
      },
      theme: theme,
      updated_at: now,
    };

    await db.settings.put({
      ...newSetting,
      id: 'system_settings',
    });

    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const handleExportBackup = async () => {
    try {
      setIsExportingJson(true);
      const res = await exportFullDatabaseBackupJson();
      setVaultBanner({
        type: 'success',
        text: `Đã xuất thành công file sao lưu "${res.filename}" với ${res.totalRecords.toLocaleString()} bản ghi từ 12 bảng CSDL!`,
      });
      setTimeout(() => setVaultBanner(null), 7000);
    } catch (e) {
      setVaultBanner({
        type: 'error',
        text: 'Lỗi khi tạo file sao lưu JSON. Vui lòng thử lại.',
      });
    } finally {
      setIsExportingJson(false);
    }
  };

  const handleImportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setIsImportingJson(true);
      const text = await file.text();
      const res = await importFullDatabaseBackupJson(text);
      if (res.ok) {
        setVaultBanner({
          type: 'success',
          text: `Khôi phục thành công ${res.restoredRecords.toLocaleString()} bản ghi trên ${res.tablesRestored} bảng và đã đồng bộ lên Supabase!`,
        });
      } else {
        setVaultBanner({
          type: 'error',
          text: res.error || 'Không thể khôi phục từ file JSON này.',
        });
      }
      setTimeout(() => setVaultBanner(null), 8000);
    } finally {
      setIsImportingJson(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRestoreSnapshot = async (snap: SafetySnapshotItem) => {
    try {
      setRestoringSnapId(snap.id);
      const res = await restoreSafetySnapshot(snap.id);
      if (res.ok) {
        setSafetySnapshots(getSafetySnapshots());
        setVaultBanner({
          type: 'success',
          text: `Đã hoàn tác & khôi phục thành công "${res.label}" (${res.restoredCount} bản ghi liên đới) lên cả Máy và Supabase!`,
        });
        setTimeout(() => setVaultBanner(null), 7000);
      }
    } finally {
      setRestoringSnapId(null);
    }
  };

  const handleRunQA = async () => {
    try {
      setIsRunningQA(true);
      const report = await runComprehensiveDatabaseQA();
      setQaReport(report);
      setSafetySnapshots(getSafetySnapshots());
    } finally {
      setIsRunningQA(false);
    }
  };

  return (
    <div id="settings-view" className="space-y-6">
      {vaultBanner && (
        <div
          className={`p-4 rounded-xl border flex items-start justify-between gap-3 ${
            vaultBanner.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/60 text-emerald-900 dark:text-emerald-100'
              : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/60 text-rose-900 dark:text-rose-100'
          }`}
        >
          <div className="flex items-center gap-2.5 text-xs font-semibold">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>{vaultBanner.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setVaultBanner(null)}
            className="text-xs font-bold opacity-70 hover:opacity-100 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <SettingsIcon className="w-5 h-5 text-emerald-600" />
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Cài Đặt Cấu Hình, Sao Lưu & Kiểm Thử Cơ Sở Dữ Liệu
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Quản lý Gemini API Key, ngưỡng cảnh báo P1/P2, sao lưu JSON 12 bảng và kiểm thử toàn vẹn Supabase.
          </p>
        </div>

        <button
          onClick={onToggleTheme}
          className="px-3.5 py-2 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2 border border-slate-200 dark:border-slate-700 cursor-pointer shrink-0"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
          <span>Giao diện: {theme === 'dark' ? 'Tối (Dark)' : 'Sáng (Light)'}</span>
        </button>
      </div>

      {!isAdmin && (
        <div className="p-4 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-800 dark:text-amber-300 font-medium flex items-center gap-2">
          <AlertCircle className="w-5 h-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>
            Bạn đang xem với quyền <strong>Trợ giảng (Assistant)</strong>. Chỉ Admin (Giáo viên chính) mới được phép thay đổi cài đặt hệ thống.
          </span>
        </div>
      )}

      {saveSuccess && (
        <div className="p-3 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>Lưu cấu hình hệ thống thành công!</span>
        </div>
      )}

      {/* SECTION 1: 12-TABLE DATABASE QA & SELF-HEALING SUITE */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-emerald-600" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Kiểm Thử Chẩn Đoán & Tự Động Sửa Lỗi CSDL (6 Kịch Bản QA · 12 Bảng)
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Kiểm tra khóa định danh tất định, toàn vẹn khóa ngoại, đối soát Local ↔ Supabase, chống xung đột luồng và khóa chống xóa hàng loạt.
            </p>
          </div>

          <button
            type="button"
            onClick={handleRunQA}
            disabled={isRunningQA}
            className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-4 h-4 ${isRunningQA ? 'animate-spin' : ''}`} />
            <span>{isRunningQA ? 'Đang kiểm thử 12 bảng...' : 'Chạy Kiểm Thử Toàn Diện 12 Bảng'}</span>
          </button>
        </div>

        {qaReport && (
          <div className="space-y-4 pt-2 border-t border-slate-200 dark:border-slate-800">
            {/* Summary Row */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                <span className="text-[11px] text-slate-500 block">Trạng thái CSDL</span>
                <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 mt-0.5 block">
                  {qaReport.overallStatus === 'healthy'
                    ? 'Đạt chuẩn 100% (6/6 Kịch bản)'
                    : `Đã tự động vá ${qaReport.totalAutoFixed} điểm lệch`}
                </span>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                <span className="text-[11px] text-slate-500 block">Tổng bản ghi Trình duyệt</span>
                <span className="text-sm font-bold text-slate-900 dark:text-slate-100 font-mono tabular-nums mt-0.5 block">
                  {qaReport.totalLocalRecords.toLocaleString()} bản ghi
                </span>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                <span className="text-[11px] text-slate-500 block">Tổng bản ghi Supabase Cloud</span>
                <span className="text-sm font-bold text-emerald-700 dark:text-emerald-300 font-mono tabular-nums mt-0.5 block">
                  {qaReport.totalSupabaseRecords.toLocaleString()} bản ghi
                </span>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                <span className="text-[11px] text-slate-500 block">Thời gian thực thi</span>
                <span className="text-sm font-bold text-slate-900 dark:text-slate-100 font-mono tabular-nums mt-0.5 block">
                  {qaReport.totalDurationMs} ms · {new Date(qaReport.executedAt).toLocaleTimeString('vi-VN')}
                </span>
              </div>
            </div>

            {/* 6 Scenarios Breakdown */}
            <div className="space-y-2">
              {qaReport.scenarios.map((sc) => (
                <div
                  key={sc.id}
                  className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 flex flex-col gap-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-slate-100">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span className="font-mono text-emerald-700 dark:text-emerald-400">
                        {sc.code}
                      </span>
                      <span>·</span>
                      <span>{sc.title}</span>
                    </div>
                    <span className="text-[11px] font-mono tabular-nums text-slate-500 shrink-0">
                      {sc.status === 'passed' ? 'ĐẠT CHUẨN' : 'ĐÃ TỰ ĐỘNG SỬA'} · {sc.durationMs} ms
                    </span>
                  </div>
                  <p className="text-xs text-slate-700 dark:text-slate-300 pl-6">{sc.summary}</p>
                  <div className="pl-6 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
                    {sc.details.map((d, idx) => (
                      <span key={idx}>• {d}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* 12-Table Comparison Matrix */}
            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">
                    <th className="py-2.5 px-3 font-bold">Bảng Dữ Liệu (12 Bảng)</th>
                    <th className="py-2.5 px-3 font-bold text-right">Máy tính (IndexedDB)</th>
                    <th className="py-2.5 px-3 font-bold text-right">Đám mây (Supabase)</th>
                    <th className="py-2.5 px-3 font-bold text-right">Đã sửa khóa / Mồ côi</th>
                    <th className="py-2.5 px-3 font-bold text-right">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {qaReport.tableMatrix.map((row) => (
                    <tr
                      key={row.tableName}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/30"
                    >
                      <td className="py-2 px-3 font-medium text-slate-800 dark:text-slate-200">
                        {row.label}
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100">
                        {row.localCount.toLocaleString()}
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums font-bold text-emerald-700 dark:text-emerald-400">
                        {row.supabaseCount.toLocaleString()}
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-500">
                        {row.canonicalIssuesFixed + row.orphansRemoved}
                      </td>
                      <td className="py-2 px-3 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                        {row.inSync ? 'Đồng bộ 100%' : 'Đã cân bằng'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 2: JSON FULL BACKUP & PRE-DELETE SAFETY SNAPSHOT VAULT */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Sao Lưu Toàn Hệ Thống (.JSON) & Kho Khôi Phục Tự Động Trước Khi Xóa
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Các tính năng xóa trắng nguy hiểm đã được khóa vĩnh viễn. Hệ thống tự động lưu bản sao dự phòng trước mọi thao tác xóa Lớp học, Học sinh hoặc Buổi học.
            </p>
          </div>

          <div className="flex items-center flex-wrap gap-2 shrink-0">
            <button
              type="button"
              onClick={handleExportBackup}
              disabled={isExportingJson}
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isExportingJson ? 'Đang đóng gói...' : 'Tải Bản Sao Lưu (.JSON)'}</span>
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleImportFileChange}
              className="hidden"
            />
            <button
              type="button"
              disabled={!isAdmin || isImportingJson}
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{isImportingJson ? 'Đang nạp...' : 'Khôi Phục Từ File .JSON'}</span>
            </button>
          </div>
        </div>

        {/* Pre-Delete Safety Snapshots List */}
        <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-emerald-600" />
              <span>Danh sách Bản Sao Lưu Tự Động Trước Khi Xóa ({safetySnapshots.length})</span>
            </span>
            <span className="text-[11px] text-slate-500">
              Tự động kích hoạt khi xóa Lớp học · Học sinh · Buổi học
            </span>
          </div>

          {safetySnapshots.length === 0 ? (
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 text-xs text-slate-500">
              Chưa có thao tác xóa nào phát sinh. Bất kỳ khi nào Thầy/Cô xóa một Lớp học, Học sinh hoặc Buổi học, gói dữ liệu gốc sẽ tự động xuất hiện tại đây để có thể khôi phục 1-Click.
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {safetySnapshots.map((snap) => (
                <div
                  key={snap.id}
                  className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div>
                    <div className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      <span>{snap.label}</span>
                      <span className="text-[11px] font-normal text-slate-500 font-mono tabular-nums">
                        · {snap.recordCount} bản ghi liên đới
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 font-mono tabular-nums mt-0.5">
                      Sao lưu lúc: {new Date(snap.createdAt).toLocaleString('vi-VN')}
                      {snap.restoredAt
                        ? ` · Đã khôi phục lúc ${new Date(snap.restoredAt).toLocaleTimeString('vi-VN')}`
                        : ''}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={restoringSnapId === snap.id}
                      onClick={() => handleRestoreSnapshot(snap)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>
                        {restoringSnapId === snap.id ? 'Đang khôi phục...' : 'Khôi phục 1-Click'}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        removeSafetySnapshot(snap.id);
                        setSafetySnapshots(getSafetySnapshots());
                      }}
                      title="Gỡ bản ghi sao lưu này"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* SECTION 3: SYSTEM CONFIGURATION FORM */}
      <form onSubmit={handleSaveSettings} className="space-y-6">
        {/* Gemini API Key */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Cấu Hình Gemini API Key (AI Diagnostic)
            </h3>
          </div>

          <p className="text-xs text-slate-500">
            API Key dùng để kích hoạt tính năng chẩn đoán học tập thông minh và viết tóm tắt Zalo Phụ huynh.
          </p>

          <input
            type="password"
            value={inputApiKey}
            onChange={(e) => setInputApiKey(e.target.value)}
            placeholder="Nhập Gemini API Key của bạn..."
            className="w-full text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 rounded-xl outline-none focus:border-emerald-500"
          />
        </div>

        {/* Warning Thresholds */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-emerald-600" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Ngưỡng Cảnh Báo (Warning Engine)
              </h3>
            </div>

            <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setSelectedProfile('standard')}
                className={`px-3 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                  selectedProfile === 'standard'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500'
                }`}
              >
                Tiêu chuẩn
              </button>
              <button
                type="button"
                onClick={() => setSelectedProfile('specialized')}
                className={`px-3 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                  selectedProfile === 'specialized'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500'
                }`}
              >
                Lớp Chuyên
              </button>
              <button
                type="button"
                onClick={() => setSelectedProfile('remedial')}
                className={`px-3 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                  selectedProfile === 'remedial'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500'
                }`}
              >
                Phụ đạo
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Ngưỡng Vắng Không Phép (Số buổi)
              </label>
              <input
                type="number"
                min="1"
                max="5"
                value={profileConfigs[selectedProfile].maxAbsences}
                onChange={(e) =>
                  setProfileConfigs((prev) => ({
                    ...prev,
                    [selectedProfile]: {
                      ...prev[selectedProfile],
                      maxAbsences: Number(e.target.value),
                    },
                  }))
                }
                className="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2.5 rounded-xl outline-none focus:border-emerald-500 font-mono tabular-nums"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Ngưỡng Điểm Bài Kiểm Tra (&lt; Đ)
              </label>
              <input
                type="number"
                min="0"
                max="10"
                step="0.5"
                value={profileConfigs[selectedProfile].minTestScore}
                onChange={(e) =>
                  setProfileConfigs((prev) => ({
                    ...prev,
                    [selectedProfile]: {
                      ...prev[selectedProfile],
                      minTestScore: Number(e.target.value),
                    },
                  }))
                }
                className="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2.5 rounded-xl outline-none focus:border-emerald-500 font-mono tabular-nums"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Ngưỡng Điểm BTVN (&lt; Đ)
              </label>
              <input
                type="number"
                min="0"
                max="10"
                step="0.5"
                value={profileConfigs[selectedProfile].minHomeworkScore}
                onChange={(e) =>
                  setProfileConfigs((prev) => ({
                    ...prev,
                    [selectedProfile]: {
                      ...prev[selectedProfile],
                      minHomeworkScore: Number(e.target.value),
                    },
                  }))
                }
                className="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2.5 rounded-xl outline-none focus:border-emerald-500 font-mono tabular-nums"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Chuỗi Bài Kiểm Tra Điểm Yếu (Số buổi)
              </label>
              <input
                type="number"
                min="1"
                max="5"
                value={profileConfigs[selectedProfile].consecutiveLowTests}
                onChange={(e) =>
                  setProfileConfigs((prev) => ({
                    ...prev,
                    [selectedProfile]: {
                      ...prev[selectedProfile],
                      consecutiveLowTests: Number(e.target.value),
                    },
                  }))
                }
                className="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2.5 rounded-xl outline-none focus:border-emerald-500 font-mono tabular-nums"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Ngưỡng Thiếu BTVN (Số buổi)
              </label>
              <input
                type="number"
                min="1"
                max="10"
                value={profileConfigs[selectedProfile].consecutiveLowHomework}
                onChange={(e) =>
                  setProfileConfigs((prev) => ({
                    ...prev,
                    [selectedProfile]: {
                      ...prev[selectedProfile],
                      consecutiveLowHomework: Number(e.target.value),
                    },
                  }))
                }
                className="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2.5 rounded-xl outline-none focus:border-emerald-500 font-mono tabular-nums"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Ngưỡng Sụt Giảm Điểm P2 (Đ)
              </label>
              <input
                type="number"
                min="0.5"
                max="5.0"
                step="0.5"
                value={profileConfigs[selectedProfile].scoreDropThreshold}
                onChange={(e) =>
                  setProfileConfigs((prev) => ({
                    ...prev,
                    [selectedProfile]: {
                      ...prev[selectedProfile],
                      scoreDropThreshold: Number(e.target.value),
                    },
                  }))
                }
                className="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2.5 rounded-xl outline-none focus:border-emerald-500 font-mono tabular-nums"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Ngưỡng Tuyên Dương Bài Thi (≥ Đ)
              </label>
              <input
                type="number"
                min="7.0"
                max="10.0"
                step="0.5"
                value={profileConfigs[selectedProfile].excellentTestScore ?? 9.0}
                onChange={(e) =>
                  setProfileConfigs((prev) => ({
                    ...prev,
                    [selectedProfile]: {
                      ...prev[selectedProfile],
                      excellentTestScore: Number(e.target.value),
                    },
                  }))
                }
                className="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2.5 rounded-xl outline-none focus:border-emerald-500 font-mono tabular-nums"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Ngưỡng Tiến Bộ Bứt Phá (≥ +Đ)
              </label>
              <input
                type="number"
                min="0.5"
                max="4.0"
                step="0.5"
                value={profileConfigs[selectedProfile].progressIncreaseThreshold ?? 1.5}
                onChange={(e) =>
                  setProfileConfigs((prev) => ({
                    ...prev,
                    [selectedProfile]: {
                      ...prev[selectedProfile],
                      progressIncreaseThreshold: Number(e.target.value),
                    },
                  }))
                }
                className="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2.5 rounded-xl outline-none focus:border-emerald-500 font-mono tabular-nums"
              />
            </div>
          </div>
        </div>

        {/* Pronoun & Title Settings */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Xưng Hô & Tên Giáo Viên Cho Báo Cáo
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Xưng Hô Giáo Viên
              </label>
              <select
                value={teacherTitle}
                onChange={(e) => setTeacherTitle(e.target.value)}
                className="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2.5 rounded-xl outline-none"
              >
                <option value="Thầy">Thầy</option>
                <option value="Cô">Cô</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Họ và Tên Giáo Viên Chính
              </label>
              <input
                type="text"
                value={teacherName}
                onChange={(e) => setTeacherName(e.target.value)}
                className="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2.5 rounded-xl outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Gọi Học Sinh Trong Báo Cáo
              </label>
              <select
                value={studentPronoun}
                onChange={(e) => setStudentPronoun(e.target.value)}
                className="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2.5 rounded-xl outline-none"
              >
                <option value="Con">Con (Ví dụ: "Con Nguyễn Minh Anh")</option>
                <option value="Em">Em (Ví dụ: "Em Nguyễn Minh Anh")</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={!isAdmin}
            className={`px-6 py-3 rounded-xl font-bold text-xs flex items-center gap-2 cursor-pointer ${
              isAdmin
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : 'bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-500 cursor-not-allowed'
            }`}
          >
            {isAdmin ? <Save className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
            <span>{isAdmin ? 'Lưu Tất Cả Cài Đặt' : 'Bị Khóa (Quyền Trợ Giảng)'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};

