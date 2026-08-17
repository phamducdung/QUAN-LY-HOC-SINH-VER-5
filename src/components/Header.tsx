import React from 'react';
import { useAuth } from '../context/AuthContext';
import { UserRole } from '../types';
import {
  GraduationCap,
  UserCheck,
  ShieldAlert,
  Sun,
  Moon,
  Search,
  BookOpen,
  HardDrive,
  LogOut,
  ShieldCheck,
  Lock
} from 'lucide-react';

interface HeaderProps {
  p1WarningCount: number;
  onOpenWarningCenter: () => void;
  onOpenCloudSyncModal: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  p1WarningCount,
  onOpenWarningCenter,
  onOpenCloudSyncModal,
  theme,
  onToggleTheme,
  searchQuery,
  onSearchChange,
}) => {
  const { user, logout, canDelete } = useAuth();

  return (
    <header id="app-header" className="sticky top-0 z-30 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 lg:px-6 py-2.5 transition-colors">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Left: Branding */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-start">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold shadow-md shadow-emerald-600/20">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-800 dark:text-slate-100 leading-snug">
                Smart Edu Manager
              </h1>
              <p className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                Toán THCS (Lớp 6 - 9)
              </p>
            </div>
          </div>

          {/* Mobile User Role Badge */}
          <div className="md:hidden flex items-center gap-1">
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                canDelete
                  ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30'
                  : 'bg-indigo-500/10 text-indigo-600 border-indigo-500/30'
              }`}
            >
              {canDelete ? 'Giáo Viên' : 'Trợ Giảng'}
            </span>
          </div>
        </div>

        {/* Center: Search Bar */}
        <div className="relative w-full md:max-w-xs">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 pointer-events-none" />
          <input
            id="global-search-input"
            type="text"
            placeholder="Tìm tên học sinh, lớp, SĐT..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 focus:border-emerald-600 dark:focus:border-emerald-400 focus:bg-white dark:focus:bg-slate-900 transition-all outline-none"
          />
        </div>

        {/* Right: User Profile, Role Badge, Storage, Theme & Logout */}
        <div className="flex items-center gap-2 w-full md:w-auto justify-end flex-wrap">
          {/* Storage Inspection Trigger */}
          <button
            onClick={onOpenCloudSyncModal}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all cursor-pointer shadow-2xs"
            title="Đồng bộ Đám mây Firestore / Storage Local"
          >
            <HardDrive className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="hidden sm:inline font-medium text-slate-800 dark:text-slate-100">Sync Engine</span>
          </button>

          {/* P1 Warning Alert Badge */}
          <button
            id="p1-warning-badge-btn"
            onClick={onOpenWarningCenter}
            className={`relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              p1WarningCount > 0
                ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 border border-rose-200 dark:border-rose-800 animate-pulse'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            <ShieldAlert className={`w-3.5 h-3.5 ${p1WarningCount > 0 ? 'text-rose-600 dark:text-rose-400' : ''}`} />
            <span>P1: {p1WarningCount}</span>
          </button>

          {/* Active Role Status Badge */}
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            {canDelete ? (
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span className="font-medium">Giáo Viên</span>
              </span>
            ) : (
              <span className="flex items-center gap-1 text-indigo-600 dark:text-indigo-400">
                <UserCheck className="w-3.5 h-3.5" />
                <span className="font-medium">Trợ Giảng</span>
              </span>
            )}
          </div>

          {/* User Profile Avatar & Name */}
          {user && (
            <div className="flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-700">
              {user.photoURL ? (
                <img src={user.photoURL} alt={user.displayName} className="w-7 h-7 rounded-full object-cover border border-slate-300 dark:border-slate-600" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs flex items-center justify-center">
                  {user.displayName.charAt(0)}
                </div>
              )}
              <div className="hidden xl:block text-left">
                <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 leading-none">
                  {user.displayName}
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1">
                  {canDelete ? (
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium">GV • Toàn quyền</span>
                  ) : (
                    <span className="text-indigo-600 dark:text-indigo-400 font-medium">TG • Khóa Xóa</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Theme Toggle Button */}
          <button
            id="theme-toggle-btn"
            onClick={onToggleTheme}
            className="p-1.5 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 bg-slate-100 dark:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            title="Đổi giao diện Sáng / Tối"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* Logout Button */}
          <button
            onClick={logout}
            className="p-1.5 text-rose-500 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl transition-colors cursor-pointer"
            title="Đăng xuất khỏi hệ thống"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
