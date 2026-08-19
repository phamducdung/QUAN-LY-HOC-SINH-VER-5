import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  CommentTemplate,
  CommentCategory,
} from '../../types';
import {
  COMMENT_CATEGORIES,
  searchCommentTemplates,
  saveCustomCommentTemplate,
  deleteCustomCommentTemplate,
} from '../../utils/mathCommentBank';
import {
  Sparkles,
  Search,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Trophy,
  Edit3,
  BookOpen,
  HeartHandshake,
  UserCheck,
  X,
  Zap,
  CornerDownLeft,
  ChevronRight,
} from 'lucide-react';

interface CommentExpansionPopupProps {
  isOpen: boolean;
  searchQuery: string;
  onSelectTemplate: (template: CommentTemplate) => void;
  onClose: () => void;
  mode?: 'inline_autocomplete' | 'full_modal';
}

const CategoryIcon: React.FC<{ category: CommentCategory; className?: string }> = ({
  category,
  className = 'w-4 h-4',
}) => {
  switch (category) {
    case 'btvn_tot':
      return <CheckCircle2 className={`${className} text-emerald-500`} />;
    case 'btvn_thieu':
      return <AlertCircle className={`${className} text-amber-500`} />;
    case 'kt_gioi':
      return <Trophy className={`${className} text-purple-500`} />;
    case 'trinh_bay':
      return <Edit3 className={`${className} text-rose-500`} />;
    case 'lo_hong':
      return <BookOpen className={`${className} text-sky-500`} />;
    case 'dong_vien':
      return <HeartHandshake className={`${className} text-indigo-500`} />;
    case 'custom':
    default:
      return <UserCheck className={`${className} text-slate-500`} />;
  }
};

export const CommentExpansionPopup: React.FC<CommentExpansionPopupProps> = ({
  isOpen,
  searchQuery,
  onSelectTemplate,
  onClose,
  mode = 'inline_autocomplete',
}) => {
  const [selectedCategory, setSelectedCategory] = useState<CommentCategory | 'all'>('all');
  const [localSearch, setLocalSearch] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [isAddCustomOpen, setIsAddCustomOpen] = useState(false);
  const [newShortcut, setNewShortcut] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newFullText, setNewFullText] = useState('');

  const listRef = useRef<HTMLDivElement>(null);

  // Synchronize search query from props if in inline autocomplete mode
  useEffect(() => {
    if (mode === 'inline_autocomplete') {
      setLocalSearch(searchQuery);
    }
  }, [searchQuery, mode]);

  const queryToUse = mode === 'inline_autocomplete' ? searchQuery : localSearch;

  // Filter templates
  const filteredTemplates = useMemo(() => {
    const cat = selectedCategory === 'all' ? undefined : selectedCategory;
    return searchCommentTemplates(queryToUse, cat);
  }, [queryToUse, selectedCategory]);

  // Reset active index on list changes
  useEffect(() => {
    setActiveIndex(0);
  }, [filteredTemplates.length]);

  // Scroll active item into view
  useEffect(() => {
    if (listRef.current) {
      const activeEl = listRef.current.querySelector(`[data-index="${activeIndex}"]`) as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [activeIndex]);

  // Keyboard navigation for inline mode
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((prev) => (prev < filteredTemplates.length - 1 ? prev + 1 : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((prev) => (prev > 0 ? prev - 1 : filteredTemplates.length - 1));
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        if (filteredTemplates[activeIndex]) {
          e.preventDefault();
          onSelectTemplate(filteredTemplates[activeIndex]);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, activeIndex, filteredTemplates, onSelectTemplate, onClose]);

  if (!isOpen) return null;

  const handleSaveCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newShortcut.trim() || !newFullText.trim()) return;

    const created = saveCustomCommentTemplate({
      shortcut: newShortcut.trim(),
      label: newLabel.trim() || newShortcut.trim(),
      fullText: newFullText.trim(),
      category: 'custom',
    });

    setNewShortcut('');
    setNewLabel('');
    setNewFullText('');
    setIsAddCustomOpen(false);
    onSelectTemplate(created);
  };

  const handleDeleteCustom = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    deleteCustomCommentTemplate(id);
  };

  // INLINE AUTOCOMPLETE DROPDOWN (Pops up directly when typing /)
  if (mode === 'inline_autocomplete') {
    return (
      <div
        className="absolute left-0 top-full mt-1.5 w-96 max-w-[90vw] bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 z-50 overflow-hidden text-xs animate-in fade-in-50 zoom-in-95 duration-100"
        onMouseDown={(e) => e.preventDefault()} // prevent blur
      >
        {/* Header bar */}
        <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200/70 dark:border-slate-800 flex items-center justify-between text-slate-700 dark:text-slate-300">
          <div className="flex items-center gap-1.5 font-bold">
            <Zap className="w-3.5 h-3.5 text-amber-500" />
            <span>Gợi ý phím tắt nhận xét Toán</span>
            {searchQuery && (
              <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-num text-[10px]">
                {searchQuery}
              </span>
            )}
          </div>
          <div className="text-[10px] text-slate-400 font-medium">
            <kbd className="px-1 py-0.5 bg-slate-200 dark:bg-slate-700 rounded text-[9px]">↑↓</kbd> chọn •{' '}
            <kbd className="px-1 py-0.5 bg-slate-200 dark:bg-slate-700 rounded text-[9px]">Enter</kbd> chèn
          </div>
        </div>

        {/* Template items list */}
        <div ref={listRef} className="max-h-60 overflow-y-auto p-1.5 space-y-1">
          {filteredTemplates.length === 0 ? (
            <div className="p-4 text-center text-slate-400 text-xs">
              Không tìm thấy phím tắt phù hợp với <b>{searchQuery}</b>
            </div>
          ) : (
            filteredTemplates.map((tpl, idx) => (
              <div
                key={tpl.id}
                data-index={idx}
                onClick={() => onSelectTemplate(tpl)}
                className={`p-2 rounded-lg cursor-pointer transition-colors flex items-start gap-2.5 ${
                  idx === activeIndex
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-700'
                    : 'hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent'
                }`}
              >
                <div className="shrink-0 mt-0.5">
                  <CategoryIcon category={tpl.category} className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="font-extrabold text-slate-900 dark:text-slate-100 truncate">
                      {tpl.label}
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[9.5px] font-black bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 font-mono shrink-0 border border-indigo-200 dark:border-indigo-800">
                      {tpl.shortcut}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 mt-0.5 leading-relaxed">
                    {tpl.fullText}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  // FULL MODAL / DRAWER (Opened when clicking 💡 icon)
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in-50 zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/40 dark:to-purple-950/40 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
              <Zap className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <span>Ngân Hàng Mẫu &amp; Phím Tắt Nhận Xét Toán THCS</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                  {filteredTemplates.length} Mẫu
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Nhấp vào câu mẫu để chèn ngay hoặc gõ phím tắt <code className="text-indigo-600 dark:text-indigo-400 font-bold font-mono">/mã_tắt</code> tại ô nhận xét
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-white/80 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search & Category Tabs */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 space-y-3 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={localSearch}
                onChange={(e) => setLocalSearch(e.target.value)}
                placeholder="Tìm kiếm mẫu nhận xét theo từ khóa, chuyên đề hoặc mã tắt..."
                className="w-full pl-9 pr-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-slate-100"
              />
            </div>

            <button
              onClick={() => setIsAddCustomOpen(!isAddCustomOpen)}
              className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tạo Mẫu Riêng</span>
            </button>
          </div>

          {/* Category Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-all whitespace-nowrap text-xs ${
                selectedCategory === 'all'
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 font-bold'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-100'
              }`}
            >
              Tất cả
            </button>
            {COMMENT_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all whitespace-nowrap text-xs flex items-center gap-1.5 ${
                  selectedCategory === cat.id
                    ? 'bg-indigo-600 text-white font-bold shadow-xs'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                }`}
              >
                <CategoryIcon category={cat.id} className="w-3.5 h-3.5" />
                <span>{cat.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Custom Template Creation Form */}
        {isAddCustomOpen && (
          <form onSubmit={handleSaveCustom} className="p-4 bg-indigo-50/70 dark:bg-indigo-950/40 border-b border-indigo-200 dark:border-indigo-800 space-y-2.5 text-xs animate-in fade-in duration-150">
            <div className="font-bold text-indigo-900 dark:text-indigo-200 flex items-center justify-between">
              <span>Thêm Mẫu Nhận Xét &amp; Phím Tắt Tùy Biến Của Giáo Viên</span>
              <button type="button" onClick={() => setIsAddCustomOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-0.5">
                  Mã phím tắt (bắt đầu bằng /)
                </label>
                <input
                  type="text"
                  required
                  placeholder="/vd_can_than"
                  value={newShortcut}
                  onChange={(e) => setNewShortcut(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-0.5">
                  Tên gợi nhớ ngắn gọn
                </label>
                <input
                  type="text"
                  placeholder="Khen làm bài cẩn thận"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs"
                />
              </div>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 block mb-0.5">
                Nội dung câu nhận xét sư phạm đầy đủ
              </label>
              <textarea
                rows={2}
                required
                placeholder="Nhập nội dung câu nhận xét hoàn chỉnh sẽ được bung ra khi gõ phím tắt..."
                value={newFullText}
                onChange={(e) => setNewFullText(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsAddCustomOpen(false)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold"
              >
                Hủy
              </button>
              <button
                type="submit"
                className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs"
              >
                Lưu &amp; Chèn Vào Ô
              </button>
            </div>
          </form>
        )}

        {/* Templates Grid List */}
        <div className="p-4 overflow-y-auto max-h-96 space-y-2">
          {filteredTemplates.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              Không tìm thấy câu nhận xét nào. Bạn có thể nhấn <b>"Tạo Mẫu Riêng"</b> để thêm mới.
            </div>
          ) : (
            filteredTemplates.map((tpl) => (
              <div
                key={tpl.id}
                onClick={() => onSelectTemplate(tpl)}
                className="p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 hover:border-indigo-500 dark:hover:border-indigo-500 bg-white dark:bg-slate-900 hover:bg-indigo-50/30 dark:hover:bg-indigo-950/20 transition-all cursor-pointer group flex items-start justify-between gap-3 text-xs"
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  <div className="shrink-0 mt-0.5">
                    <CategoryIcon category={tpl.category} className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                        {tpl.label}
                      </span>
                      <span className="px-1.5 py-0.2 rounded text-[10px] font-black bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 font-mono border border-indigo-200 dark:border-indigo-800">
                        {tpl.shortcut}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                      {tpl.fullText}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {tpl.isCustom && (
                    <button
                      onClick={(e) => handleDeleteCustom(e, tpl.id)}
                      className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors"
                      title="Xóa mẫu tự tạo này"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => onSelectTemplate(tpl)}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 group-hover:bg-indigo-600 group-hover:text-white font-bold text-[11px] transition-all flex items-center gap-1"
                  >
                    <span>Chèn</span>
                    <CornerDownLeft className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer info */}
        <div className="px-5 py-2.5 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500">
          <div>
            Mẹo: Gõ trực tiếp <code className="font-mono font-bold text-indigo-600 dark:text-indigo-400">/au</code> rồi nhấn <b>Cách (Space)</b> để tự động bung câu.
          </div>
          <button
            onClick={onClose}
            className="font-bold text-slate-700 dark:text-slate-300 hover:underline"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
