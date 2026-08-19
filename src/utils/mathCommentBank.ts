import { CommentCategory, CommentTemplate } from '../types';

export interface CategoryMeta {
  id: CommentCategory;
  name: string;
  badgeColor: string;
  iconName: string;
}

export const COMMENT_CATEGORIES: CategoryMeta[] = [
  {
    id: 'btvn_tot',
    name: 'BTVN Hoàn thành tốt',
    badgeColor: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700',
    iconName: 'CheckCircle2',
  },
  {
    id: 'btvn_thieu',
    name: 'BTVN Thiếu / Chưa làm',
    badgeColor: 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border-amber-300 dark:border-amber-700',
    iconName: 'AlertCircle',
  },
  {
    id: 'kt_gioi',
    name: 'Điểm KT Giỏi & Bứt phá',
    badgeColor: 'bg-purple-100 text-purple-800 dark:bg-purple-950/80 dark:text-purple-300 border-purple-300 dark:border-purple-700',
    iconName: 'Trophy',
  },
  {
    id: 'trinh_bay',
    name: 'Lỗi Tính toán & Trình bày',
    badgeColor: 'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 border-rose-300 dark:border-rose-700',
    iconName: 'Edit3',
  },
  {
    id: 'lo_hong',
    name: 'Lỗ hổng Chuyên đề Toán',
    badgeColor: 'bg-sky-100 text-sky-800 dark:bg-sky-950/80 dark:text-sky-300 border-sky-300 dark:border-sky-700',
    iconName: 'BookOpen',
  },
  {
    id: 'dong_vien',
    name: 'Động viên & Mời phụ đạo',
    badgeColor: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/80 dark:text-indigo-300 border-indigo-300 dark:border-indigo-700',
    iconName: 'HeartHandshake',
  },
  {
    id: 'custom',
    name: 'Mẫu tự tạo của GV',
    badgeColor: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700',
    iconName: 'UserCheck',
  },
];

export const BUILTIN_MATH_COMMENT_TEMPLATES: CommentTemplate[] = [
  // 1. BTVN Hoàn thành tốt
  {
    id: 'tpl_btvn_1',
    shortcut: '/btvn_tot',
    label: 'BTVN làm đầy đủ, đúng phương pháp',
    fullText: 'Hoàn thành bài tập về nhà đầy đủ, bài làm sạch đẹp và đúng phương pháp.',
    category: 'btvn_tot',
  },
  {
    id: 'tpl_btvn_2',
    shortcut: '/btvn_xuat_sac',
    label: 'BTVN xuất sắc, làm cả câu nâng cao',
    fullText: 'BTVN chuẩn bị rất chu đáo, làm trọn vẹn các bài cơ bản và giải tốt câu nâng cao phân loại.',
    category: 'btvn_tot',
  },
  {
    id: 'tpl_btvn_3',
    shortcut: '/ve_hinh_dep',
    label: 'Hình vẽ chuẩn xác, ký hiệu rõ ràng',
    fullText: 'Bài tập hình học vẽ hình chuẩn xác bằng thước kẻ, ký hiệu góc và cạnh bằng nhau rất rõ ràng.',
    category: 'btvn_tot',
  },
  {
    id: 'tpl_btvn_4',
    shortcut: '/sach_dep',
    label: 'Vở ghi & bài làm rất sạch đẹp',
    fullText: 'Ý thức tự học tại nhà rất tốt, vở ghi chép và bài tập trình bày khoa học, sạch đẹp.',
    category: 'btvn_tot',
  },

  // 2. BTVN Thiếu / Chưa làm
  {
    id: 'tpl_thieu_1',
    shortcut: '/btvn_thieu',
    label: 'Chưa làm đủ BTVN',
    fullText: 'Chưa hoàn thành đủ số lượng bài tập về nhà giao, cần bổ sung bài còn thiếu trước buổi tới.',
    category: 'btvn_thieu',
  },
  {
    id: 'tpl_thieu_2',
    shortcut: '/chua_lam',
    label: 'Chưa làm BTVN (quên vở/chưa làm)',
    fullText: 'Chưa làm bài tập về nhà. Thầy/Cô đã nhắc nhở và yêu cầu hoàn thành bù trong tuần.',
    category: 'btvn_thieu',
  },
  {
    id: 'tpl_thieu_3',
    shortcut: '/thieu_hinh',
    label: 'Bỏ qua phần bài tập hình học',
    fullText: 'Đã làm phần Đại số nhưng bỏ qua bài tập Hình học, cần chú ý làm đều cả hai phân môn.',
    category: 'btvn_thieu',
  },
  {
    id: 'tpl_thieu_4',
    shortcut: '/nop_muon',
    label: 'Nộp BTVN muộn so với quy định',
    fullText: 'Nộp bài tập về nhà muộn, cần chú ý sắp xếp thời gian làm bài sớm hơn.',
    category: 'btvn_thieu',
  },

  // 3. Điểm KT Giỏi & Bứt phá
  {
    id: 'tpl_kt_1',
    shortcut: '/kt_gioi',
    label: 'Bài KT xuất sắc, tư duy logic',
    fullText: 'Bài kiểm tra đạt kết quả xuất sắc, tư duy lập luận logic và nắm rất vững chuyên đề.',
    category: 'kt_gioi',
  },
  {
    id: 'tpl_kt_2',
    shortcut: '/but_pha',
    label: 'Tiến bộ vượt bậc so với buổi trước',
    fullText: 'Có sự tiến bộ vượt bậc so với các buổi kiểm tra trước, kỹ năng làm bài tự tin và chắc chắn hơn nhiều.',
    category: 'kt_gioi',
  },
  {
    id: 'tpl_kt_3',
    shortcut: '/sang_tao',
    label: 'Cách giải sáng tạo, ngắn gọn',
    fullText: 'Tư duy toán học nhạy bén, có lời giải sáng tạo, ngắn gọn và mạch lạc.',
    category: 'kt_gioi',
  },
  {
    id: 'tpl_kt_4',
    shortcut: '/diem_tuyet_doi',
    label: 'Điểm 10 tuyệt đối, làm trọn vẹn',
    fullText: 'Làm trọn vẹn 100% đề kiểm tra, không mắc bất kỳ lỗi trình bày nào, rất đáng khen ngợi!',
    category: 'kt_gioi',
  },

  // 4. Lỗi Tính toán & Trình bày
  {
    id: 'tpl_tb_1',
    shortcut: '/au',
    label: 'Tính toán còn ẩu, nhầm dấu biến đổi',
    fullText: 'Có ý thức làm bài nhưng tính toán còn ẩu, hay nhầm dấu ở các bước biến đổi cơ bản.',
    category: 'trinh_bay',
  },
  {
    id: 'tpl_tb_2',
    shortcut: '/nham_dau',
    label: 'Nhầm dấu khi chuyển vế / phá ngoặc',
    fullText: 'Nắm được hướng giải nhưng hay mất điểm do nhầm dấu khi phá ngoặc và chuyển vế.',
    category: 'trinh_bay',
  },
  {
    id: 'tpl_tb_3',
    shortcut: '/thieu_dk',
    label: 'Quên đặt điều kiện xác định / thử lại',
    fullText: 'Thường quên tìm điều kiện xác định (ĐKXĐ) hoặc quên đối chiếu nghiệm sau khi giải xong phương trình.',
    category: 'trinh_bay',
  },
  {
    id: 'tpl_tb_4',
    shortcut: '/trinh_bay_tat',
    label: 'Trình bày vắn tắt, thiếu lập luận hình',
    fullText: 'Trình bày còn vắn tắt, làm tắt các bước quan trọng. Cần ghi rõ các định lý và căn cứ hình học.',
    category: 'trinh_bay',
  },
  {
    id: 'tpl_tb_5',
    shortcut: '/thieu_ket_luan',
    label: 'Thiếu câu kết luận nghiệm / kết luận bài',
    fullText: 'Làm bài đúng nhưng thường quên ghi câu kết luận cuối bài, dễ bị trừ điểm trình bày.',
    category: 'trinh_bay',
  },

  // 5. Lỗ hổng Chuyên đề Toán
  {
    id: 'tpl_lh_1',
    shortcut: '/yeu_hinh',
    label: 'Yếu phần chứng minh Hình học',
    fullText: 'Còn lúng túng khi vẽ thêm đường phụ và chứng minh hình học, cần tăng cường làm bài tập chứng minh.',
    category: 'lo_hong',
  },
  {
    id: 'tpl_lh_2',
    shortcut: '/yeu_rut_gon',
    label: 'Yếu phần Rút gọn biểu thức chứa căn',
    fullText: 'Chuyên đề rút gọn biểu thức chứa căn và giải phương trình chưa chắc, cần ôn lại quy tắc trục căn thức.',
    category: 'lo_hong',
  },
  {
    id: 'tpl_lh_3',
    shortcut: '/yeu_toan_thuc_te',
    label: 'Khó khăn khi giải bài toán thực tế',
    fullText: 'Kỹ năng đọc hiểu và mô hình hóa bài toán thực tế thành phương trình/hệ phương trình còn yếu.',
    category: 'lo_hong',
  },
  {
    id: 'tpl_lh_4',
    shortcut: '/yeu_he_thuc_luong',
    label: 'Chưa thuộc kỹ hệ thức lượng / tỉ số lượng giác',
    fullText: 'Cần ôn tập kỹ lại các công thức hệ thức lượng và tỉ số lượng giác trong tam giác vuông.',
    category: 'lo_hong',
  },
  {
    id: 'tpl_lh_5',
    shortcut: '/yeu_viet',
    label: 'Chưa vững hệ thức Vi-ét và PT bậc 2',
    fullText: 'Chưa vận dụng thành thạo định lý Vi-ét để biến đổi các biểu thức đối xứng giữa hai nghiệm.',
    category: 'lo_hong',
  },

  // 6. Động viên & Mời phụ đạo
  {
    id: 'tpl_dv_1',
    shortcut: '/phu_dao',
    label: 'Mời phụ đạo 1:1 trước giờ học',
    fullText: 'Đề nghị phụ huynh nhắc con đến sớm 30 phút trước giờ học buổi tới để Thầy/Cô và Trợ giảng phụ đạo củng cố kiến thức.',
    category: 'dong_vien',
  },
  {
    id: 'tpl_dv_2',
    shortcut: '/dong_vien',
    label: 'Động viên cố gắng, con có tiềm năng',
    fullText: 'Con có tư duy toán tốt và tiếp thu nhanh, nếu rèn thêm tính cẩn thận chắc chắn sẽ đạt điểm 8+.',
    category: 'dong_vien',
  },
  {
    id: 'tpl_dv_3',
    shortcut: '/tap_trung',
    label: 'Nhắc nhở tập trung hơn trong giờ',
    fullText: 'Trong giờ học còn đôi lúc mất tập trung, cần chú ý lắng nghe giáo viên giảng bài và chủ động hỏi khi chưa hiểu.',
    category: 'dong_vien',
  },
  {
    id: 'tpl_dv_4',
    shortcut: '/chuc_mung',
    label: 'Khen ngợi nỗ lực & sự tiến bộ',
    fullText: 'Thầy/Cô rất vui mừng trước sự cố gắng và tiến bộ rõ rệt của con trong các tuần học gần đây!',
    category: 'dong_vien',
  },
];

const LOCAL_STORAGE_CUSTOM_KEY = 'smartedu_custom_comment_templates_v1';

/**
 * Get all custom templates stored in localStorage
 */
export function getCustomTemplates(): CommentTemplate[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_CUSTOM_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn('[CommentBank] Failed to load custom templates:', err);
    return [];
  }
}

/**
 * Get merged list of built-in and user-custom templates
 */
export function getAllCommentTemplates(): CommentTemplate[] {
  const custom = getCustomTemplates();
  return [...BUILTIN_MATH_COMMENT_TEMPLATES, ...custom];
}

/**
 * Save or update a custom template
 */
export function saveCustomCommentTemplate(template: Omit<CommentTemplate, 'id' | 'isCustom'> & { id?: string }): CommentTemplate {
  const custom = getCustomTemplates();
  const id = template.id || `custom_tpl_${Date.now()}`;
  const newTpl: CommentTemplate = {
    ...template,
    id,
    shortcut: template.shortcut.startsWith('/') ? template.shortcut : `/${template.shortcut}`,
    category: 'custom',
    isCustom: true,
  };

  const existingIdx = custom.findIndex((t) => t.id === id);
  if (existingIdx >= 0) {
    custom[existingIdx] = newTpl;
  } else {
    custom.push(newTpl);
  }

  localStorage.setItem(LOCAL_STORAGE_CUSTOM_KEY, JSON.stringify(custom));
  return newTpl;
}

/**
 * Delete a custom template
 */
export function deleteCustomCommentTemplate(templateId: string): void {
  const custom = getCustomTemplates().filter((t) => t.id !== templateId);
  localStorage.setItem(LOCAL_STORAGE_CUSTOM_KEY, JSON.stringify(custom));
}

/**
 * Find exact shortcut match (e.g. "/au" -> template)
 */
export function findTemplateByExactShortcut(shortcut: string): CommentTemplate | undefined {
  const normalized = shortcut.trim().toLowerCase();
  const all = getAllCommentTemplates();
  return all.find((t) => t.shortcut.toLowerCase() === normalized);
}

/**
 * Search templates by query or category
 */
export function searchCommentTemplates(query: string = '', category?: CommentCategory): CommentTemplate[] {
  let all = getAllCommentTemplates();
  if (category) {
    all = all.filter((t) => t.category === category);
  }

  const cleanQuery = query.trim().toLowerCase().replace(/^\//, '');
  if (!cleanQuery) return all;

  return all.filter((t) => {
    const cleanShortcut = t.shortcut.toLowerCase().replace(/^\//, '');
    const cleanLabel = t.label.toLowerCase();
    const cleanText = t.fullText.toLowerCase();

    return (
      cleanShortcut.includes(cleanQuery) ||
      cleanLabel.includes(cleanQuery) ||
      cleanText.includes(cleanQuery)
    );
  });
}

/**
 * Try to expand shortcut inside a text string.
 * Example: "BTVN: /btvn_tot" -> "BTVN: Hoàn thành bài tập về nhà đầy đủ..."
 */
export function expandShortcutInText(text: string): { newText: string; expanded: boolean; shortcutFound?: string } {
  // Regex to match a trailing shortcut word like "/au" or "/btvn_tot"
  const match = text.match(/(^|\s)(\/[a-zA-Z0-9_À-ỹ]+)$/);
  if (!match) {
    return { newText: text, expanded: false };
  }

  const shortcutWord = match[2];
  const tpl = findTemplateByExactShortcut(shortcutWord);
  if (!tpl) {
    return { newText: text, expanded: false };
  }

  const prefix = text.slice(0, text.length - shortcutWord.length);
  const newText = prefix + tpl.fullText;

  return {
    newText,
    expanded: true,
    shortcutFound: shortcutWord,
  };
}
