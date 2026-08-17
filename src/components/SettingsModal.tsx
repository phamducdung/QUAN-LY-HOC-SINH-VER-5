import React, { useState, useEffect } from 'react';
import { Settings, WarningRuleConfig } from '../types';
import { db, clearAllDataToBlankSlate, seedDemoData, deleteOnlyDemoTestData } from '../db/dexie';
import { clearFirestoreDatabase } from '../services/syncService';
import { UserRole } from '../types';
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
  HardDrive,
  Database,
  Sparkles,
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
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [demoMessage, setDemoMessage] = useState<string | null>(null);

  useEffect(() => {
    const msg = localStorage.getItem('demo_action_message');
    if (msg) {
      setDemoMessage(msg);
      localStorage.removeItem('demo_action_message');
      const timer = setTimeout(() => {
        setDemoMessage(null);
      }, 15000);
      return () => clearTimeout(timer);
    }
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
        
        // Restore profile configs if present
        const newProfiles = { ...profileConfigs };
        const defaultBase = s.warning_rule_config || {
          maxAbsences: 2,
          consecutiveLowTests: 2,
          consecutiveLowHomework: 3,
          scoreDropThreshold: 2.0,
          minTestScore: 5.0,
          minHomeworkScore: 5.0,
          excellentTestScore: 9.0,
          progressIncreaseThreshold: 1.5,
          enablePraiseAttendanceHw: true,
        } as WarningRuleConfig;

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
               progressIncreaseThreshold: s.class_profile_configs.standard.progressIncreaseThreshold ?? 1.5,
               enablePraiseAttendanceHw: s.class_profile_configs.standard.enablePraiseAttendanceHw ?? true,
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
               progressIncreaseThreshold: s.class_profile_configs.specialized.progressIncreaseThreshold ?? 1.5,
               enablePraiseAttendanceHw: s.class_profile_configs.specialized.enablePraiseAttendanceHw ?? true,
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
               progressIncreaseThreshold: s.class_profile_configs.remedial.progressIncreaseThreshold ?? 1.5,
               enablePraiseAttendanceHw: s.class_profile_configs.remedial.enablePraiseAttendanceHw ?? true,
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
          newProfiles.specialized = { ...newProfiles.standard, minTestScore: 7.0, minHomeworkScore: 7.0, excellentTestScore: 9.5 };
          newProfiles.remedial = { ...newProfiles.standard, minTestScore: 4.0, minHomeworkScore: 4.0, excellentTestScore: 8.5 };
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

    let currentWarningConfig = sList.length > 0 && sList[0].warning_rule_config 
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
      
    // Update the base config with standard profile values
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

    const settingId = sList.length > 0 ? sList[0].id : undefined;
    if (settingId) {
      await db.settings.update(settingId, newSetting);
    } else {
      await db.settings.add(newSetting);
    }

    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  return (
    <div id="settings-view" className="space-y-6">
      {demoMessage === 'seed_success' && (
        <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 p-4 rounded-2xl flex items-start gap-3 shadow-sm animate-fadeIn">
          <div className="p-1.5 bg-emerald-500 rounded-lg text-white shrink-0">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div className="flex-1">
            <h4 className="text-xs font-bold text-emerald-900 dark:text-emerald-100">
              Nạp dữ liệu mẫu thử nghiệm thành công!
            </h4>
            <p className="text-[11px] text-emerald-800 dark:text-emerald-300 mt-0.5 leading-relaxed">
              Hệ thống đã tự động bổ sung các lớp học mẫu (<strong>9A1, 9B2, 8A2</strong>), phân phối chương trình môn Toán, danh sách học sinh mẫu cùng các nhận xét và cảnh báo mẫu tương ứng. <span className="underline decoration-dotted font-semibold">Bảo toàn dữ liệu:</span> Toàn bộ các dữ liệu thật do thầy cô tự nhập trước đó đều được <strong>giữ nguyên vẹn 100%</strong>.
            </p>
          </div>
          <button onClick={() => setDemoMessage(null)} className="text-emerald-500 hover:text-emerald-700 dark:hover:text-emerald-300 ml-auto text-xs font-bold shrink-0 p-1">✕</button>
        </div>
      )}

      {demoMessage === 'delete_success' && (
        <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/50 p-4 rounded-2xl flex items-start gap-3 shadow-sm animate-fadeIn">
          <div className="p-1.5 bg-rose-500 rounded-lg text-white shrink-0">
            <Trash2 className="w-4 h-4" />
          </div>
          <div className="flex-1">
            <h4 className="text-xs font-bold text-rose-900 dark:text-rose-100">
              Đã xóa dữ liệu thử nghiệm thành công!
            </h4>
            <p className="text-[11px] text-rose-800 dark:text-rose-300 mt-0.5 leading-relaxed">
              Đã gỡ bỏ sạch sẽ toàn bộ các lớp học mẫu (9A1, 9B2, 8A2), danh sách học sinh mẫu, điểm số mẫu và các cảnh báo học tập tương ứng. <span className="underline decoration-dotted font-semibold">An tâm tuyệt đối:</span> Tất cả dữ liệu thực tế do thầy cô tự tạo trước đó đều được <strong>bảo toàn nguyên vẹn 100%</strong> và không bị ảnh hưởng.
            </p>
          </div>
          <button onClick={() => setDemoMessage(null)} className="text-rose-500 hover:text-rose-700 dark:hover:text-rose-300 ml-auto text-xs font-bold shrink-0 p-1">✕</button>
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <SettingsIcon className="w-5 h-5 text-emerald-600" />
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Cài Đặt Cấu Hình Hệ Thống
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Quản lý Gemini API Key, ngưỡng cảnh báo tự động P1/P2 và danh xưng Thầy/Cô.
          </p>
        </div>

        <button
          onClick={onToggleTheme}
          className="px-3.5 py-2 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2 border border-slate-200 dark:border-slate-700 cursor-pointer"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
          <span>Giao diện: {theme === 'dark' ? 'Tối (Dark)' : 'Sáng (Light)'}</span>
        </button>
      </div>

      {!isAdmin && (
        <div className="p-4 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-800 dark:text-amber-300 font-medium flex items-center gap-2">
          <AlertCircle className="w-5 h-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>Bạn đang xem với quyền <strong>Trợ giảng (Assistant)</strong>. Chỉ Admin (Giáo viên chính) mới được phép thay đổi cài đặt hệ thống.</span>
        </div>
      )}

      {saveSuccess && (
        <div className="p-3 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold flex items-center gap-2 animate-bounce">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>Lưu cấu hình hệ thống thành công!</span>
        </div>
      )}

      <form onSubmit={handleSaveSettings} className="space-y-6">
        {/* Gemini API Key */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Cấu Hình Gemini API Key (AI Diagnostic)
            </h3>
          </div>

          <p className="text-xs text-slate-500">
            API Key dùng để kích hoạt tính năng Gemini 1.5 Flash chẩn đoán học tập thông minh và viết tóm tắt Zalo Phụ huynh.
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
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
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
                className={`px-3 py-1 text-[11px] font-bold rounded-lg transition-all ${
                  selectedProfile === 'standard' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500'
                }`}
              >
                Tiêu chuẩn
              </button>
              <button
                type="button"
                onClick={() => setSelectedProfile('specialized')}
                className={`px-3 py-1 text-[11px] font-bold rounded-lg transition-all ${
                  selectedProfile === 'specialized' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500'
                }`}
              >
                Lớp Chuyên
              </button>
              <button
                type="button"
                onClick={() => setSelectedProfile('remedial')}
                className={`px-3 py-1 text-[11px] font-bold rounded-lg transition-all ${
                  selectedProfile === 'remedial' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500'
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
                onChange={(e) => setProfileConfigs(prev => ({
                  ...prev,
                  [selectedProfile]: { ...prev[selectedProfile], maxAbsences: Number(e.target.value) }
                }))}
                className="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2.5 rounded-xl outline-none focus:border-emerald-500"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Kích hoạt Cảnh báo P1 khi đạt ngưỡng.
              </p>
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
                onChange={(e) => setProfileConfigs(prev => ({
                  ...prev,
                  [selectedProfile]: { ...prev[selectedProfile], minTestScore: Number(e.target.value) }
                }))}
                className="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2.5 rounded-xl outline-none focus:border-emerald-500"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Bài thi dưới ngưỡng này được coi là kém.
              </p>
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
                onChange={(e) => setProfileConfigs(prev => ({
                  ...prev,
                  [selectedProfile]: { ...prev[selectedProfile], minHomeworkScore: Number(e.target.value) }
                }))}
                className="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2.5 rounded-xl outline-none focus:border-emerald-500"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Điểm BTVN dưới ngưỡng này được coi là kém.
              </p>
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
                onChange={(e) => setProfileConfigs(prev => ({
                  ...prev,
                  [selectedProfile]: { ...prev[selectedProfile], consecutiveLowTests: Number(e.target.value) }
                }))}
                className="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2.5 rounded-xl outline-none focus:border-emerald-500"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Kích hoạt Cảnh báo P1 khi điểm thấp liên tiếp.
              </p>
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
                onChange={(e) => setProfileConfigs(prev => ({
                  ...prev,
                  [selectedProfile]: { ...prev[selectedProfile], consecutiveLowHomework: Number(e.target.value) }
                }))}
                className="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2.5 rounded-xl outline-none focus:border-emerald-500"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Kích hoạt Cảnh báo P1 khi thiếu bài liên tiếp.
              </p>
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
                onChange={(e) => setProfileConfigs(prev => ({
                  ...prev,
                  [selectedProfile]: { ...prev[selectedProfile], scoreDropThreshold: Number(e.target.value) }
                }))}
                className="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2.5 rounded-xl outline-none focus:border-emerald-500"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Cảnh báo P2 nếu điểm giảm sâu so với TB.
              </p>
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
                onChange={(e) => setProfileConfigs(prev => ({
                  ...prev,
                  [selectedProfile]: { ...prev[selectedProfile], excellentTestScore: Number(e.target.value) }
                }))}
                className="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2.5 rounded-xl outline-none focus:border-emerald-500"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Vinh danh học sinh đạt bài thi xuất sắc.
              </p>
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
                onChange={(e) => setProfileConfigs(prev => ({
                  ...prev,
                  [selectedProfile]: { ...prev[selectedProfile], progressIncreaseThreshold: Number(e.target.value) }
                }))}
                className="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2.5 rounded-xl outline-none focus:border-emerald-500"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Vinh danh khi điểm tăng vượt bậc so với đầu kỳ.
              </p>
            </div>
          </div>

          {/* Rule engine criteria breakdown */}
          <div className="mt-4 p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700/80 space-y-2 text-xs">
            <h4 className="font-bold text-slate-800 dark:text-slate-200 text-xs flex items-center gap-1.5">
              <span>📋 Quy chế Kích hoạt Tự động (Module 2 Rules Engine):</span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] text-slate-600 dark:text-slate-300">
              <div className="p-2 rounded-lg bg-rose-50/80 dark:bg-rose-950/30 border border-rose-200/80 dark:border-rose-900/60">
                <span className="font-black text-rose-700 dark:text-rose-300">🔴 Cấp P1 (Khẩn cấp):</span>
                <ul className="list-disc list-inside mt-0.5 space-y-0.5 text-[10.5px]">
                  <li>Điểm KT kém liên tiếp ≥ {profileConfigs[selectedProfile].consecutiveLowTests} buổi</li>
                  <li>Điểm TB tích lũy &lt; {profileConfigs[selectedProfile].minTestScore}đ (qua ≥ 2 buổi)</li>
                  <li>Thiếu/Kém BTVN liên tiếp ≥ {profileConfigs[selectedProfile].consecutiveLowHomework} buổi</li>
                  <li>Vắng không phép ≥ {profileConfigs[selectedProfile].maxAbsences} buổi</li>
                </ul>
              </div>

              <div className="p-2 rounded-lg bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/60">
                <span className="font-black text-amber-700 dark:text-amber-300">🟠 Cấp P2 (Theo dõi / Nhắc nhở):</span>
                <ul className="list-disc list-inside mt-0.5 space-y-0.5 text-[10.5px]">
                  <li>1 buổi điểm kiểm tra yếu đơn lẻ (&lt; {profileConfigs[selectedProfile].minTestScore}đ)</li>
                  <li>Phong độ sa sút giảm ≥ {profileConfigs[selectedProfile].scoreDropThreshold}đ</li>
                  <li>Lệch phong độ: BTVN ≥ 8.5đ nhưng kiểm tra &lt; 6.0đ</li>
                  <li>Chưa nộp BTVN rải rác ≥ 2 buổi | Đi muộn ≥ 3 buổi | Nghỉ học ≥ 3 buổi</li>
                </ul>
              </div>

              <div className="p-2 rounded-lg bg-yellow-50/80 dark:bg-yellow-950/30 border border-yellow-200/80 dark:border-yellow-900/60">
                <span className="font-black text-yellow-800 dark:text-yellow-300">🟡 Cấp P3 (Cảnh báo sớm):</span>
                <ul className="list-disc list-inside mt-0.5 space-y-0.5 text-[10.5px]">
                  <li>Vắng không phép 1 buổi đơn lẻ (lưu ý sớm)</li>
                  <li>Đi muộn 2 buổi (sắp chạm ngưỡng P2)</li>
                  <li>Chưa nộp BTVN 1 buổi đơn lẻ</li>
                  <li>Điểm KT hoặc BTVN buổi gần nhất mấp mé chuẩn tối thiểu</li>
                </ul>
              </div>

              <div className="p-2 rounded-lg bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-900/60">
                <span className="font-black text-emerald-700 dark:text-emerald-300">🟢 Tuyên Dương Vinh Danh:</span>
                <ul className="list-disc list-inside mt-0.5 space-y-0.5 text-[10.5px]">
                  <li>Bài kiểm tra trực tiếp đạt ≥ {profileConfigs[selectedProfile].excellentTestScore ?? 9.0}đ</li>
                  <li>Điểm TB tích lũy xuất sắc ≥ 8.5đ</li>
                  <li>Tiến bộ bứt phá tăng ≥ +{profileConfigs[selectedProfile].progressIncreaseThreshold ?? 1.5}đ</li>
                  <li>Chuyên cần 100% &amp; hoàn thành 100% BTVN (TB ≥ 8.0đ)</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Pronoun & Title Settings */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
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

        {/* Local Storage Info */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <div className="flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Lưu Trữ Dữ Liệu Cục Bộ (IndexedDB Offline)
            </h3>
          </div>

          <p className="text-xs text-slate-500 leading-relaxed">
            Ứng dụng hoạt động hoàn toàn ở chế độ <strong>Cục bộ Offline-First</strong>. Toàn bộ dữ liệu điểm số, lớp học, học sinh được lưu trữ bảo mật 100% trên trình duyệt của thiết bị này và không kết nối máy chủ Firebase bên ngoài.
          </p>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={!isAdmin}
            className={`px-6 py-3 rounded-xl font-bold text-xs shadow-md flex items-center gap-2 cursor-pointer ${
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

      {/* Seed Demo Data Section */}
      <div className="bg-emerald-50 dark:bg-emerald-950/20 p-5 rounded-2xl border border-emerald-200 dark:border-emerald-900/50 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <Database className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          <h3 className="text-sm font-bold text-emerald-900 dark:text-emerald-100">
            Dữ Liệu Thử Nghiệm (Demo Data)
          </h3>
        </div>

        <p className="text-xs text-emerald-700 dark:text-emerald-300">
          Nếu thầy cô đang thử nghiệm ứng dụng và muốn trải nghiệm đầy đủ các tính năng nhanh chóng, thầy cô có thể nhấn nút để nạp tự động danh sách lớp học mẫu (9A1, 9B2, 8A2), học sinh mẫu, phân phối chương trình môn Toán, điểm số kiểm tra, và các cảnh báo học tập tương ứng.
          <br />
          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Ưu điểm:</span> Hệ thống nạp dữ liệu thông minh sẽ <strong>giữ nguyên vẹn tất cả dữ liệu thật do thầy cô tự tạo</strong> trước đó, chỉ ghi đè dữ liệu mẫu cũ.
        </p>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={!isAdmin}
            onClick={async () => {
              if (window.confirm("Thầy cô có chắc chắn muốn nạp dữ liệu mẫu? Hệ thống sẽ cập nhật dữ liệu mẫu thử nghiệm. Các dữ liệu do thầy cô tự tạo trước đó sẽ được GIỮ NGUYÊN HOÀN TOÀN.")) {
                try {
                  localStorage.setItem('demo_action_message', 'seed_success');
                  await seedDemoData();
                  window.location.reload();
                } catch (err) {
                  console.error("Failed to seed demo data:", err);
                  localStorage.removeItem('demo_action_message');
                  alert("Đã xảy ra lỗi khi nạp dữ liệu mẫu.");
                }
              }
            }}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm transition-colors disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Nạp Dữ Liệu Mẫu
          </button>

          <button
            type="button"
            disabled={!isAdmin}
            onClick={async () => {
              if (window.confirm("Thầy cô có chắc chắn muốn xóa toàn bộ dữ liệu mẫu thử nghiệm? Toàn bộ các dữ liệu thật do thầy cô tự tạo trước đó sẽ được GIỮ LẠI NGUYÊN VẸN, không bị ảnh hưởng.")) {
                try {
                  localStorage.setItem('demo_action_message', 'delete_success');
                  await deleteOnlyDemoTestData();
                  window.location.reload();
                } catch (err) {
                  console.error("Failed to delete demo data:", err);
                  localStorage.removeItem('demo_action_message');
                  alert("Đã xảy ra lỗi khi xóa dữ liệu thử nghiệm.");
                }
              }
            }}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 font-bold text-xs rounded-xl shadow-sm transition-colors disabled:opacity-50 flex items-center gap-1.5 border border-slate-300 dark:border-slate-700 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
            Xóa Dữ Liệu Thử Nghiệm
          </button>
        </div>
      </div>

      {/* Reset Database to Blank Slate */}
      <div className="bg-rose-50 dark:bg-rose-950/20 p-5 rounded-2xl border border-rose-200 dark:border-rose-900/50 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <Trash2 className="w-5 h-5 text-rose-600 dark:text-rose-400" />
          <h3 className="text-sm font-bold text-rose-900 dark:text-rose-100">
            Khởi Tạo Hệ Thống Sạch (Chuyển đổi sang App Trắng)
          </h3>
        </div>

        <p className="text-xs text-rose-700 dark:text-rose-300">
          Hành động này sẽ xóa vĩnh viễn toàn bộ dữ liệu chạy thử mẫu hiện tại bao gồm: <strong>Lớp học, danh sách học sinh, lịch sử các buổi học, điểm danh, điểm số, nhận xét và cảnh báo</strong>. 
          Hệ thống sẽ giữ lại danh mục chuyên đề kiến thức Toán THCS (Đại số, Hình học) để thầy cô có thể bắt đầu sử dụng ngay mà không cần cấu hình lại từ đầu.
        </p>

        {!showResetConfirm ? (
          <button
            type="button"
            disabled={!isAdmin}
            onClick={() => setShowResetConfirm(true)}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-sm transition-colors disabled:opacity-50 cursor-pointer"
          >
            Chuyển đổi sang App Trắng
          </button>
        ) : (
          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-rose-200 dark:border-rose-900 shadow-inner space-y-3">
            <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
              Xác nhận hành động xóa: Nhập chính xác từ <span className="text-rose-600 font-extrabold">"XÓA"</span> vào ô dưới đây để xác nhận:
            </p>
            
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                placeholder="XÓA"
                value={resetConfirmText}
                onChange={(e) => setResetConfirmText(e.target.value)}
                className="px-3 py-2 text-xs border border-rose-300 dark:border-rose-800 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-none focus:ring-1 focus:ring-rose-500 max-w-[120px]"
              />
              
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={resetConfirmText !== 'XÓA' || isResetting}
                  onClick={async () => {
                    setIsResetting(true);
                    try {
                      await clearFirestoreDatabase();
                      await clearAllDataToBlankSlate();
                      window.location.reload();
                    } catch (err) {
                      console.error('Failed to reset db:', err);
                      setIsResetting(false);
                    }
                  }}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-sm transition-colors disabled:opacity-30 flex items-center gap-1 cursor-pointer"
                >
                  {isResetting ? 'Đang thực hiện...' : 'Xác Nhận Xóa Hết'}
                </button>
                
                <button
                  type="button"
                  onClick={() => {
                    setShowResetConfirm(false);
                    setResetConfirmText('');
                  }}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200 font-bold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  Hủy
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
