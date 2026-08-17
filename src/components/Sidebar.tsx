import React from 'react';
import {
  LayoutDashboard,
  Users,
  Keyboard,
  ShieldAlert,
  BrainCircuit,
  UserSquare2,
  FileSpreadsheet,
  Settings,
} from 'lucide-react';

export type TabKey =
  | 'dashboard'
  | 'classes'
  | 'grade-entry'
  | 'warnings'
  | 'knowledge-map'
  | 'students'
  | 'audit-reports'
  | 'settings';

interface SidebarProps {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  p1Count: number;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, onTabChange, p1Count }) => {
  const navItems = [
    {
      key: 'dashboard' as TabKey,
      label: 'Tổng quan Dashboard',
      icon: LayoutDashboard,
    },
    {
      key: 'classes' as TabKey,
      label: 'Quản lý Lớp học',
      icon: Users,
    },
    {
      key: 'grade-entry' as TabKey,
      label: 'Nhập điểm Thần tốc',
      icon: Keyboard,
      badge: 'Bàn phím 100%',
    },
    {
      key: 'warnings' as TabKey,
      label: 'Cảnh báo Học tập',
      icon: ShieldAlert,
      count: p1Count,
    },
    {
      key: 'knowledge-map' as TabKey,
      label: 'Bản đồ Kiến thức & AI',
      icon: BrainCircuit,
      badge: 'Gemini AI',
    },
    {
      key: 'students' as TabKey,
      label: 'Hồ sơ Học sinh',
      icon: UserSquare2,
    },
    {
      key: 'audit-reports' as TabKey,
      label: 'Báo cáo & Export',
      icon: FileSpreadsheet,
    },
    {
      key: 'settings' as TabKey,
      label: 'Cài đặt Hệ thống',
      icon: Settings,
    },
  ];

  return (
    <aside id="main-sidebar" className="w-full lg:w-64 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 p-4 flex flex-col justify-between shrink-0 border-r border-slate-200 dark:border-slate-800 transition-colors">
      <div>
        <div className="px-3 py-2 mb-3">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Menu Điều Hành
          </span>
        </div>

        <nav className="space-y-1.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.key;
            return (
              <button
                key={item.key}
                id={`nav-${item.key}`}
                onClick={() => onTabChange(item.key)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  isActive
                    ? 'bg-emerald-600 text-white font-bold shadow-md shadow-emerald-600/25 ring-1 ring-emerald-500'
                    : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-50 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-500 dark:text-slate-400'}`} />
                  <span className="tracking-tight">{item.label}</span>
                </div>

                {item.count !== undefined && item.count > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-600 text-white shadow-xs">
                    {item.count}
                  </span>
                )}

                {item.badge && !item.count && (
                  <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold border ${
                    isActive 
                      ? 'bg-emerald-700/60 text-emerald-100 border-emerald-400/40' 
                      : 'bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300 border-emerald-500/30'
                  }`}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-800/80 px-3">
        <div className="flex items-center gap-3 bg-slate-100 dark:bg-slate-800/60 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700/50">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-xs">
            THCS
          </div>
          <div className="overflow-hidden">
            <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">Trung tâm Toán TCT</p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">Cơ sở dữ liệu IndexedDB (Offline)</p>
          </div>
        </div>
      </div>
    </aside>
  );
};
