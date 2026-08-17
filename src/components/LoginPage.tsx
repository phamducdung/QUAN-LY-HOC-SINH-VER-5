import React, { useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import {
  ShieldCheck,
  UserCheck,
  Lock,
  Mail,
  Eye,
  EyeOff,
  GraduationCap,
  ArrowRight,
  AlertCircle,
  Loader2,
  CheckCircle2,
  XCircle,
  Zap
} from 'lucide-react';

export const LoginPage: React.FC = () => {
  const { loginWithEmail } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleFillTeacher = () => {
    setEmail('giaovien@tct.com');
    setPassword('123456789');
    setErrorMsg(null);
  };

  const handleFillAssistant = () => {
    setEmail('trogiang@tct.com');
    setPassword('123456789');
    setErrorMsg(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg(null);

    try {
      await loginWithEmail(email, password);
    } catch (err: any) {
      console.error('Login error:', err);
      setErrorMsg(err.message || 'Đăng nhập thất bại. Vui lòng kiểm tra lại thông tin.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-center items-center p-4 sm:p-6 relative overflow-hidden">
      {/* Background Decorative Blurs */}
      <div className="absolute -top-32 -left-32 w-96 h-96 bg-emerald-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-xl w-full z-10 space-y-6">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 bg-slate-800/80 border border-slate-700 px-4 py-1.5 rounded-full text-emerald-400 text-sm font-medium shadow-xs">
            <GraduationCap className="w-4 h-4 text-emerald-400" />
            <span>SmartEdu Manager • Hệ Thống Quản Lý Trung Tâm</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            Đăng Nhập Tài Khoản
          </h1>
          <p className="text-slate-400 text-xs sm:text-sm max-w-md mx-auto">
            Xác thực tài khoản qua Firebase Auth với phân quyền RBAC linh hoạt.
          </p>
        </div>

        {/* Form Container Card */}
        <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-6 sm:p-8 shadow-2xl backdrop-blur-md space-y-6">
          
          {/* Quick Auto-fill Shortcut Buttons */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>Nút điền nhanh mẫu (Auto-fill):</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleFillTeacher}
                className="py-2 px-3 bg-emerald-950/60 hover:bg-emerald-900/80 border border-emerald-500/40 hover:border-emerald-500 text-emerald-300 text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer group"
              >
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span className="truncate">Điền tài khoản Giáo Viên</span>
              </button>

              <button
                type="button"
                onClick={handleFillAssistant}
                className="py-2 px-3 bg-indigo-950/60 hover:bg-indigo-900/80 border border-indigo-500/40 hover:border-indigo-500 text-indigo-300 text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer group"
              >
                <UserCheck className="w-4 h-4 text-indigo-400" />
                <span className="truncate">Điền tài khoản Trợ Giảng</span>
              </button>
            </div>
          </div>

          {/* Divider */}
          <div className="relative flex items-center py-1">
            <div className="grow border-t border-slate-700/80" />
            <span className="shrink mx-3 text-slate-500 text-[11px] font-medium uppercase tracking-wider">
              hoặc nhập thủ công
            </span>
            <div className="grow border-t border-slate-700/80" />
          </div>

          {/* Error Message Alert */}
          {errorMsg && (
            <div className="bg-rose-950/90 border border-rose-800 text-rose-200 px-4 py-3 rounded-xl flex items-center gap-3 text-xs leading-relaxed animate-shake">
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Email Password Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300 flex items-center justify-between">
                <span>Email tài khoản</span>
                <span className="text-[10px] text-slate-400">VD: giaovien@tct.com</span>
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  required
                  placeholder="Nhập địa chỉ email..."
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-900/90 border border-slate-700 focus:border-emerald-500 text-white text-sm rounded-xl pl-10 pr-4 py-2.5 transition-colors outline-none"
                />
              </div>
            </div>

            {/* Password Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300 flex items-center justify-between">
                <span>Mật khẩu</span>
                <span className="text-[10px] text-slate-400">VD: 123456789</span>
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="Nhập mật khẩu..."
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-900/90 border border-slate-700 focus:border-emerald-500 text-white text-sm rounded-xl pl-10 pr-10 py-2.5 transition-colors outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-1 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm rounded-xl transition-all shadow-lg shadow-emerald-950/50 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 mt-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Đang xác thực Firebase Auth...</span>
                </>
              ) : (
                <>
                  <span>Đăng Nhập Firebase Auth</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Role Specs Reference Box */}
          <div className="pt-4 border-t border-slate-700/60 space-y-2 text-xs text-slate-400">
            <div className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
              Phân quyền theo tài khoản thực tế:
            </div>
            <div className="grid sm:grid-cols-2 gap-2 text-[11px]">
              <div className="p-2.5 bg-slate-900/60 rounded-xl border border-slate-700/60 space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-emerald-400">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>giaovien@tct.com</span>
                </div>
                <div className="text-slate-300 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                  <span>Toàn quyền (Có quyền Xóa)</span>
                </div>
              </div>

              <div className="p-2.5 bg-slate-900/60 rounded-xl border border-slate-700/60 space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-indigo-400">
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>trogiang@tct.com</span>
                </div>
                <div className="text-slate-300 flex items-center gap-1">
                  <XCircle className="w-3 h-3 text-rose-400 shrink-0" />
                  <span>Toàn tính năng (Bị khóa Xóa)</span>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Footer info */}
        <div className="text-center text-slate-500 text-xs">
          SmartEdu Manager v2.5 • Phân quyền RBAC qua Firebase Email/Password Auth
        </div>
      </div>
    </div>
  );
};
