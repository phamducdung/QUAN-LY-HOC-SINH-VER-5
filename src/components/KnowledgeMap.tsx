import React, { useState, useEffect, useMemo } from 'react';
import {
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Tooltip,
  Legend,
} from 'recharts';
import { KnowledgeTag, Student, AIDiagnosisData, GradeLevel } from '../types';
import { db } from '../db/dexie';
import { sortStudentsByName } from '../utils/sortUtils';
import { logAudit } from '../utils/auditLogger';
import {
  getComprehensiveRadarAnalytics,
  TopicMasteryAnalysis,
} from '../utils/knowledgeEngine';
import {
  BrainCircuit,
  Sparkles,
  BookOpen,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Send,
  Plus,
  Edit2,
  Trash2,
  Filter,
  Copy,
  Check,
  ListOrdered,
  X,
  Compass,
  Award,
  User,
  ExternalLink,
  TrendingUp,
  TrendingDown,
  Minus,
  History,
  ChevronRight,
  Search,
} from 'lucide-react';

interface KnowledgeMapProps {
  students: Student[];
  knowledgeTags: KnowledgeTag[];
  userApiKey?: string;
  currentRole?: string;
}

export const KnowledgeMap: React.FC<KnowledgeMapProps> = ({
  students,
  knowledgeTags,
  userApiKey,
  currentRole = 'Teacher',
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'radar' | 'curriculum'>('radar');
  const [selectedStudentId, setSelectedStudentId] = useState<string | number | undefined>(
    students[0]?.id
  );
  const [selectedGrade, setSelectedGrade] = useState<GradeLevel | 'all'>(9);
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'Algebra' | 'Geometry'>('all');
  const [searchTagQuery, setSearchTagQuery] = useState('');

  // Map student info with their class & grade level
  const [studentClassMap, setStudentClassMap] = useState<Record<string, { className: string; gradeLevel?: number }>>({});

  // Computed Radar Data state
  const [radarData, setRadarData] = useState<TopicMasteryAnalysis[]>([]);
  const [isLoadingScores, setIsLoadingScores] = useState(false);

  // Drilldown Topic Detail Modal
  const [selectedTopicDetail, setSelectedTopicDetail] = useState<TopicMasteryAnalysis | null>(null);

  // AI Diagnostic states
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<AIDiagnosisData | null>(null);
  const [copiedParentSummary, setCopiedParentSummary] = useState(false);
  const [copiedQuickZalo, setCopiedQuickZalo] = useState(false);

  // Curriculum Management Modal states
  const [isAddTagOpen, setIsAddTagOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<KnowledgeTag | null>(null);
  const [tagNameInput, setTagNameInput] = useState('');
  const [tagGradeInput, setTagGradeInput] = useState<GradeLevel>(9);
  const [tagCategoryInput, setTagCategoryInput] = useState<'Algebra' | 'Geometry'>('Algebra');
  const [tagReferenceLinkInput, setTagReferenceLinkInput] = useState('');
  const [curriculumMsg, setCurriculumMsg] = useState<string | null>(null);

  const sortedStudents = sortStudentsByName(students);
  const selectedStudent = students.find((s) => String(s.id) === String(selectedStudentId));

  // Load student-class mapping to display accurate Grade and Class Name in student selector
  useEffect(() => {
    async function loadStudentClassInfo() {
      try {
        const classStudents = await db.class_students.toArray();
        const classes = await db.classes.toArray();
        const classDict = new Map(classes.map((c) => [String(c.id), c]));

        const mapping: Record<string, { className: string; gradeLevel?: number }> = {};
        classStudents.forEach((cs) => {
          const c = classDict.get(String(cs.class_id));
          if (c) {
            mapping[String(cs.student_id)] = {
              className: c.class_name,
              gradeLevel: c.grade_level,
            };
          }
        });
        setStudentClassMap(mapping);
      } catch (err) {
        console.warn('Error loading student class info:', err);
      }
    }
    loadStudentClassInfo();
  }, [students]);

  // Auto-switch selectedGrade when selecting a student if their class grade is known
  const handleSelectStudent = (studentIdStr: string) => {
    setSelectedStudentId(studentIdStr);
    const info = studentClassMap[studentIdStr];
    if (info && info.gradeLevel && [6, 7, 8, 9].includes(info.gradeLevel)) {
      setSelectedGrade(info.gradeLevel as GradeLevel);
    }
  };

  // Calculate dynamic cumulative average scores per KnowledgeTag directly synchronized with knowledgeTags prop
  useEffect(() => {
    const calculateCumulativeScores = async () => {
      setIsLoadingScores(true);

      try {
        const analytics = await getComprehensiveRadarAnalytics(
          selectedStudentId,
          selectedGrade,
          selectedCategory,
          undefined,
          knowledgeTags
        );
        setRadarData(analytics);
      } catch (err) {
        console.error('[KnowledgeMap] Error calculating analytics:', err);
      } finally {
        setIsLoadingScores(false);
      }
    };

    calculateCumulativeScores();
  }, [knowledgeTags, selectedStudentId, selectedGrade, selectedCategory]);

  // Derived KPI metrics
  const masteredTopics = radarData.filter((r) => r.status === 'mastered');
  const proficientTopics = radarData.filter((r) => r.status === 'proficient');
  const criticalGapTopics = radarData.filter((r) => r.status === 'critical_gap' || r.status === 'developing');
  const improvingTopics = radarData.filter((r) => r.trend === 'improving');

  // Filtered knowledge tags for curriculum management table
  const filteredCurriculumTags = useMemo(() => {
    return knowledgeTags
      .filter((t) => {
        if (selectedGrade !== 'all' && Number(t.grade_level) !== Number(selectedGrade)) return false;
        if (selectedCategory !== 'all' && t.category !== selectedCategory) return false;
        if (searchTagQuery.trim()) {
          const q = searchTagQuery.toLowerCase().trim();
          return t.tag_name.toLowerCase().includes(q);
        }
        return true;
      })
      .sort((a, b) => {
        if (b.grade_level !== a.grade_level) return b.grade_level - a.grade_level;
        if (a.category !== b.category) return a.category === 'Algebra' ? -1 : 1;
        return a.tag_name.localeCompare(b.tag_name, 'vi');
      });
  }, [knowledgeTags, selectedGrade, selectedCategory, searchTagQuery]);

  // Run AI Diagnosis via Gemini API
  const handleRunAiDiagnose = async () => {
    if (!selectedStudent) return;

    setIsAiLoading(true);
    setAiError(null);

    try {
      // Get recent student sessions from Dexie
      const sessions = await db.student_sessions
        .where('student_id')
        .equals(String(selectedStudent.id!))
        .toArray();

      const recentSessionsData = sessions.slice(-5).map((s) => ({
        homework_score: s.homework_score,
        test_score: s.test_score,
        attendance: s.attendance,
        comments: s.custom_comment,
      }));

      const res = await fetch('/api/ai-diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentName: selectedStudent.full_name,
          gradeLevel: selectedGrade === 'all' ? 9 : selectedGrade,
          targetScore: 'Thi Vào 10 Đạt 8.5+',
          recentSessions: recentSessionsData,
          knowledgeScores: radarData.map((r) => ({
            chuyen_de: r.fullTagName,
            diem_tich_luy: r.studentScore,
            so_bai_kiem_tra: r.sessionCount,
            xu_huong: r.trend,
          })),
          userApiKey: userApiKey,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Lỗi hệ thống khi gọi Gemini AI');
      }

      setAiResult(data.diagnosis);

      // Save AI diagnosis to IndexedDB
      await db.ai_diagnoses.add({
        student_id: String(selectedStudent.id!),
        diagnosis_json: data.diagnosis,
        created_at: new Date().toISOString(),
      });

      await logAudit(
        currentRole as any,
        'Chẩn đoán AI',
        `Chạy chẩn đoán lỗ hổng kiến thức Radar cho học sinh ${selectedStudent.full_name}`
      );
    } catch (err: any) {
      setAiError(err.message || 'Lỗi không xác định khi tạo chẩn đoán AI');
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleCopyParentSummary = () => {
    if (!aiResult?.parent_summary) return;
    navigator.clipboard.writeText(aiResult.parent_summary);
    setCopiedParentSummary(true);
    setTimeout(() => setCopiedParentSummary(false), 2500);
  };

  // Quick 1-Click Zalo Message Generator based on Radar Engine
  const handleCopyQuickZaloMessage = () => {
    if (!selectedStudent) return;

    const strongList = masteredTopics.map((t) => t.fullTagName).join(', ') || 'Đang củng cố kiến thức';
    const weakList = criticalGapTopics.map((t) => `${t.fullTagName} (${t.studentScore}đ)`).join(', ') || 'Không có lỗ hổng nghiêm trọng';
    const avgScore = radarData.length > 0
      ? (radarData.reduce((acc, r) => acc + r.studentScore, 0) / radarData.length).toFixed(1)
      : '0.0';

    const text = `Kính gửi Phụ huynh em ${selectedStudent.full_name},\n\n` +
      `Thầy/Cô gửi phụ huynh bảng chẩn đoán năng lực Toán chuyên đề mới nhất của con:\n` +
      `🔹 Điểm làm chủ kiến thức trung bình: ${avgScore}/10đ\n` +
      `🟢 Chuyên đề con nắm rất vững: ${strongList}\n` +
      `🔴 Chuyên đề trọng tâm cần tập trung phụ đạo: ${weakList}\n\n` +
      `Thầy/Cô và trung tâm sẽ có kế hoạch tăng cường bài tập và củng cố kiến thức để con bứt phá điểm số trong các buổi học tới. Trân trọng!`;

    navigator.clipboard.writeText(text);
    setCopiedQuickZalo(true);
    setTimeout(() => setCopiedQuickZalo(false), 2500);
  };

  // Modal Handlers
  const handleOpenAddTag = () => {
    setEditingTag(null);
    setTagNameInput('');
    setTagGradeInput(selectedGrade === 'all' ? 9 : selectedGrade);
    setTagCategoryInput(selectedCategory === 'all' ? 'Algebra' : selectedCategory);
    setTagReferenceLinkInput('');
    setIsAddTagOpen(true);
  };

  const handleOpenEditTag = (tag: KnowledgeTag) => {
    setEditingTag(tag);
    setTagNameInput(tag.tag_name);
    setTagGradeInput(tag.grade_level);
    setTagCategoryInput(tag.category);
    setTagReferenceLinkInput(tag.reference_link || '');
    setIsAddTagOpen(true);
  };

  const handleSaveTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tagNameInput.trim()) return;

    try {
      if (editingTag) {
        await db.knowledge_tags.update(editingTag.id!, {
          tag_name: tagNameInput.trim(),
          grade_level: tagGradeInput,
          category: tagCategoryInput,
          reference_link: tagReferenceLinkInput.trim() || undefined,
        });

        await logAudit(
          currentRole as any,
          'Cập nhật chuyên đề',
          `Cập nhật chuyên đề: ${tagNameInput.trim()}`
        );
      } else {
        const newId = `tag_${Date.now()}`;
        await db.knowledge_tags.add({
          id: newId,
          tag_name: tagNameInput.trim(),
          grade_level: tagGradeInput,
          category: tagCategoryInput,
          reference_link: tagReferenceLinkInput.trim() || undefined,
          created_at: new Date().toISOString(),
        });

        await logAudit(
          currentRole as any,
          'Thêm chuyên đề',
          `Thêm chuyên đề mới: ${tagNameInput.trim()}`
        );
      }

      setIsAddTagOpen(false);
      setCurriculumMsg('Đã cập nhật danh mục chuyên đề thành công! Biểu đồ Radar đã tự động đồng bộ.');
      setTimeout(() => setCurriculumMsg(null), 3000);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteTag = async (tag: KnowledgeTag) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa chuyên đề "${tag.tag_name}"?`)) return;

    try {
      await db.knowledge_tags.delete(tag.id!);
      await logAudit(
        currentRole as any,
        'Xóa chuyên đề',
        `Xóa chuyên đề: ${tag.tag_name}`
      );
      setCurriculumMsg(`Đã xóa chuyên đề "${tag.tag_name}" và đồng bộ lại biểu đồ`);
      setTimeout(() => setCurriculumMsg(null), 3000);
    } catch (err) {
      console.error(err);
    }
  };

  // Custom Radar Tooltip component
  const CustomRadarTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data: TopicMasteryAnalysis = payload[0].payload;
      return (
        <div className="bg-slate-900/95 text-white p-3.5 rounded-xl shadow-xl text-xs border border-slate-700/80 backdrop-blur-md max-w-xs space-y-2">
          <div className="border-b border-slate-700 pb-1.5 flex items-center justify-between gap-2">
            <span className="font-extrabold text-emerald-400 text-xs">
              {data.fullTagName}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-bold shrink-0">
              {data.category === 'Algebra' ? 'Đại số' : 'Hình học'} • Khối {data.gradeLevel}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px] pt-0.5">
            <div>
              <span className="text-slate-400 block text-[10px]">Học sinh làm chủ:</span>
              <span className="font-bold text-emerald-400 text-sm">
                {data.studentScore} <span className="text-[10px] text-slate-400 font-normal">/ 10đ</span>
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">TB Toàn lớp:</span>
              <span className="font-bold text-sky-400 text-sm">
                {data.classAvg} <span className="text-[10px] text-slate-400 font-normal">/ 10đ</span>
              </span>
            </div>
          </div>

          <div className="text-[10px] text-slate-300 pt-1 border-t border-slate-800 flex items-center justify-between">
            <span>Số bài đã thi: <strong>{data.sessionCount} buổi</strong></span>
            {data.trend === 'improving' && (
              <span className="text-emerald-400 font-bold flex items-center gap-0.5">
                <TrendingUp className="w-3 h-3" /> Đang tiến bộ (+{data.trendDelta})
              </span>
            )}
            {data.trend === 'declining' && (
              <span className="text-rose-400 font-bold flex items-center gap-0.5">
                <TrendingDown className="w-3 h-3" /> Sa sút ({data.trendDelta})
              </span>
            )}
            {data.trend === 'stable' && (
              <span className="text-slate-400 font-bold flex items-center gap-0.5">
                <Minus className="w-3 h-3" /> Ổn định
              </span>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div id="knowledge-map-view" className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-emerald-800 via-teal-800 to-cyan-900 rounded-3xl p-6 text-white shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Compass className="w-6 h-6 text-emerald-300" />
            <h2 className="text-xl font-black tracking-tight text-white">
              Bản Đồ Năng Lực &amp; Phân Phối Chương Trình Toán THCS
            </h2>
          </div>
          <p className="text-xs text-emerald-100/90 font-medium">
            Đồng bộ 100% giữa Danh mục Phân phối chương trình và Biểu đồ Radar trực quan hóa lỗ hổng kiến thức.
          </p>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center p-1 bg-white/10 backdrop-blur-md border border-white/20 rounded-xl shrink-0">
          <button
            onClick={() => setActiveSubTab('radar')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeSubTab === 'radar'
                ? 'bg-white text-emerald-900 shadow-md font-extrabold'
                : 'text-white/80 hover:text-white'
            }`}
          >
            <BrainCircuit className="w-4 h-4" />
            <span>Bản Đồ Radar &amp; AI ({radarData.length} chuyên đề)</span>
          </button>
          <button
            onClick={() => setActiveSubTab('curriculum')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeSubTab === 'curriculum'
                ? 'bg-white text-emerald-900 shadow-md font-extrabold'
                : 'text-white/80 hover:text-white'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>Phân Phối Chương Trình ({knowledgeTags.length})</span>
          </button>
        </div>
      </div>

      {curriculumMsg && (
        <div className="p-3.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{curriculumMsg}</span>
        </div>
      )}

      {/* Global Synchronized Filters */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        {/* Student Selector */}
        <div>
          <label className="block text-[10px] font-extrabold uppercase text-slate-400 mb-1 flex items-center gap-1">
            <User className="w-3 h-3 text-emerald-500" />
            <span>Chọn Học Sinh Phân Tích:</span>
          </label>
          <select
            value={selectedStudentId}
            onChange={(e) => handleSelectStudent(e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 rounded-xl p-2.5 font-bold text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 outline-none"
          >
            {sortedStudents.map((st, idx) => {
              const info = studentClassMap[String(st.id)];
              const classLabel = info?.className ? ` - ${info.className}` : '';
              return (
                <option key={st.id ? `${st.id}-${idx}` : idx} value={st.id}>
                  👤 {st.full_name}{classLabel}
                </option>
              );
            })}
          </select>
        </div>

        {/* Grade Level Selector */}
        <div>
          <label className="block text-[10px] font-extrabold uppercase text-slate-400 mb-1 flex items-center gap-1">
            <Filter className="w-3 h-3 text-sky-500" />
            <span>Khối Lớp:</span>
          </label>
          <select
            value={selectedGrade}
            onChange={(e) =>
              setSelectedGrade(e.target.value === 'all' ? 'all' : (Number(e.target.value) as GradeLevel))
            }
            className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 rounded-xl p-2.5 font-bold text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 outline-none"
          >
            <option value={9}>Khối 9 (Trọng tâm Ôn Thi Vào 10)</option>
            <option value={8}>Khối 8 (Chương trình Lớp 8)</option>
            <option value={7}>Khối 7 (Chương trình Lớp 7)</option>
            <option value={6}>Khối 6 (Chương trình Lớp 6)</option>
            <option value="all">Tất Cả Các Khối (Toàn Bộ THCS)</option>
          </select>
        </div>

        {/* Category Selector */}
        <div>
          <label className="block text-[10px] font-extrabold uppercase text-slate-400 mb-1 flex items-center gap-1">
            <BookOpen className="w-3 h-3 text-amber-500" />
            <span>Phân Loại Môn Toán:</span>
          </label>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value as any)}
            className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 rounded-xl p-2.5 font-bold text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 outline-none"
          >
            <option value="all">Toàn Diện (Đại Số + Hình Học)</option>
            <option value="Algebra">Chỉ Đại Số</option>
            <option value="Geometry">Chỉ Hình Học</option>
          </select>
        </div>
      </div>

      {/* SUB-TAB 1: RADAR CHART & AI DIAGNOSTIC */}
      {activeSubTab === 'radar' && (
        <div className="space-y-6">
          {/* 4 KPI Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Mastered */}
            <div className="bg-emerald-50/70 dark:bg-emerald-950/30 p-4 rounded-2xl border border-emerald-200/80 dark:border-emerald-800/60 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300 block">
                  🟢 Vững Vàng (≥ 8.5đ)
                </span>
                <span className="text-xl font-extrabold text-emerald-700 dark:text-emerald-300 mt-1 block">
                  {masteredTopics.length}{' '}
                  <span className="text-xs font-normal text-emerald-600 dark:text-emerald-400">
                    / {radarData.length} chuyên đề
                  </span>
                </span>
              </div>
              <Award className="w-8 h-8 text-emerald-500/40" />
            </div>

            {/* Proficient */}
            <div className="bg-sky-50/70 dark:bg-sky-950/30 p-4 rounded-2xl border border-sky-200/80 dark:border-sky-800/60 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-sky-800 dark:text-sky-300 block">
                  🔵 Khá - Ổn Định (7.0 - 8.4đ)
                </span>
                <span className="text-xl font-extrabold text-sky-700 dark:text-sky-300 mt-1 block">
                  {proficientTopics.length}{' '}
                  <span className="text-xs font-normal text-sky-600 dark:text-sky-400">
                    chuyên đề
                  </span>
                </span>
              </div>
              <CheckCircle2 className="w-8 h-8 text-sky-500/40" />
            </div>

            {/* Critical Gap */}
            <div className="bg-rose-50/70 dark:bg-rose-950/30 p-4 rounded-2xl border border-rose-200/80 dark:border-rose-900/60 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-rose-800 dark:text-rose-300 block">
                  🔴 Lỗ Hổng Cần Phụ Đạo (&lt; 7.0đ)
                </span>
                <span className="text-xl font-extrabold text-rose-700 dark:text-rose-300 mt-1 block">
                  {criticalGapTopics.length}{' '}
                  <span className="text-xs font-normal text-rose-600 dark:text-rose-400">
                    chuyên đề
                  </span>
                </span>
              </div>
              <AlertTriangle className="w-8 h-8 text-rose-500/40" />
            </div>

            {/* Improving Trend */}
            <div className="bg-amber-50/70 dark:bg-amber-950/30 p-4 rounded-2xl border border-amber-200/80 dark:border-amber-900/60 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-amber-800 dark:text-amber-300 block">
                  📈 Xu Hướng Đang Tiến Bộ (↗)
                </span>
                <span className="text-xl font-extrabold text-amber-700 dark:text-amber-300 mt-1 block">
                  {improvingTopics.length}{' '}
                  <span className="text-xs font-normal text-amber-600 dark:text-amber-400">
                    chuyên đề
                  </span>
                </span>
              </div>
              <TrendingUp className="w-8 h-8 text-amber-500/40" />
            </div>
          </div>

          {/* Grid: Radar Chart + AI Diagnose Box */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Radar Chart */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <BrainCircuit className="w-4 h-4 text-emerald-600" />
                    <span>Biểu Đồ Radar Mức Độ Thông Thạo Chuyên Đề</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Học sinh: <strong className="text-emerald-600 font-bold">{selectedStudent?.full_name}</strong> vs Chuẩn Trung Bình Lớp
                  </p>
                </div>
                <span className="text-[10px] font-extrabold px-2.5 py-1 bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 rounded-lg">
                  {radarData.length} chuyên đề
                </span>
              </div>

              {isLoadingScores ? (
                <div className="h-80 flex items-center justify-center text-xs text-slate-400 gap-2">
                  <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
                  <span>Đang tính toán điểm tích lũy chuyên đề theo lũy thừa thời gian...</span>
                </div>
              ) : radarData.length === 0 ? (
                <div className="h-80 flex flex-col items-center justify-center text-xs text-slate-400 p-6 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
                  <BookOpen className="w-8 h-8 text-slate-300 dark:text-slate-600" />
                  <p className="max-w-xs leading-relaxed text-slate-500">
                    Chưa có chuyên đề môn Toán nào phù hợp với bộ lọc hiện tại (Khối {selectedGrade === 'all' ? 'Tất cả' : selectedGrade}). Giáo viên có thể tự thêm chuyên đề mới để hệ thống đo lường.
                  </p>
                  <button
                    onClick={handleOpenAddTag}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Thêm Chuyên Đề Mới</span>
                  </button>
                </div>
              ) : (
                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="75%" data={radarData}>
                      <PolarGrid stroke="#e2e8f0" />
                      <PolarAngleAxis
                        dataKey="subject"
                        tick={{ fontSize: 10, fill: '#475569', fontWeight: 600 }}
                      />
                      <PolarRadiusAxis angle={30} domain={[0, 10]} stroke="#cbd5e1" />
                      <Radar
                        name={selectedStudent?.full_name || 'Học sinh'}
                        dataKey="studentScore"
                        stroke="#10b981"
                        fill="#10b981"
                        fillOpacity={0.45}
                        strokeWidth={2}
                      />
                      <Radar
                        name="Trung Bình Lớp"
                        dataKey="classAvg"
                        stroke="#0ea5e9"
                        fill="#0ea5e9"
                        fillOpacity={0.15}
                        strokeDasharray="3 3"
                      />
                      <Tooltip content={<CustomRadarTooltip />} />
                      <Legend />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* AI Diagnose Action Box */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-amber-500" />
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      Chẩn Đoán Năng Lực &amp; Lỗ Hổng Kiến Thức
                    </h3>
                  </div>

                  <button
                    onClick={handleCopyQuickZaloMessage}
                    className="px-2.5 py-1 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:bg-sky-950 dark:text-sky-300 rounded-lg text-[11px] font-bold transition-all border border-sky-200 dark:border-sky-800 flex items-center gap-1"
                    title="Copy tin nhắn chẩn đoán nhanh gửi Zalo phụ huynh"
                  >
                    {copiedQuickZalo ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Send className="w-3.5 h-3.5" />}
                    <span>{copiedQuickZalo ? 'Đã copy Zalo!' : 'Mẫu Zalo Nhanh'}</span>
                  </button>
                </div>

                <p className="text-xs text-slate-500 leading-relaxed">
                  Bóc tách chuyên sâu theo từng kỹ năng Toán của <strong className="text-slate-800 dark:text-slate-200">{selectedStudent?.full_name}</strong>. Nhấp vào bất kỳ chuyên đề nào bên dưới để xem chi tiết lịch sử từng bài kiểm tra.
                </p>

                {/* Score Summary List with Interactive Click to View History */}
                <div className="mt-3 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/80 space-y-2 max-h-52 overflow-y-auto">
                  <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Danh sách chuyên đề đồng bộ ({radarData.length}):
                  </span>
                  {radarData.map((item, idx) => (
                    <div
                      key={idx}
                      onClick={() => setSelectedTopicDetail(item)}
                      className="flex items-center justify-between text-xs p-1.5 rounded-lg hover:bg-white dark:hover:bg-slate-700/60 border border-transparent hover:border-slate-200 dark:hover:border-slate-600 cursor-pointer transition-all"
                    >
                      <div className="flex items-center gap-2 truncate max-w-[220px]">
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            item.studentScore >= 8.5
                              ? 'bg-emerald-500'
                              : item.studentScore >= 7.0
                              ? 'bg-sky-500'
                              : 'bg-rose-500'
                          }`}
                        />
                        <span className="text-slate-700 dark:text-slate-200 font-medium truncate">
                          {item.fullTagName}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {item.trend === 'improving' && (
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center" title="Đang tiến bộ">
                            <TrendingUp className="w-3 h-3" />
                          </span>
                        )}
                        {item.trend === 'declining' && (
                          <span className="text-[10px] text-rose-600 dark:text-rose-400 font-bold flex items-center" title="Sa sút">
                            <TrendingDown className="w-3 h-3" />
                          </span>
                        )}

                        <span
                          className={`font-mono font-bold px-2 py-0.5 rounded text-[10px] ${
                            item.studentScore >= 8.5
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : item.studentScore >= 7.0
                              ? 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300'
                              : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                          }`}
                        >
                          {item.studentScore} / 10đ
                        </span>

                        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {aiError && (
                <div className="p-3 bg-rose-50 text-rose-800 border border-rose-200 rounded-xl text-xs font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{aiError}</span>
                </div>
              )}

              <button
                onClick={handleRunAiDiagnose}
                disabled={isAiLoading || !selectedStudent}
                className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {isAiLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Đang chẩn đoán lỗ hổng kiến thức qua Gemini AI...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-amber-300" />
                    <span>Chạy Báo Cáo Chẩn Đoán AI Chuyên Sâu</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Structured AI Results */}
          {aiResult && (
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-emerald-200 dark:border-emerald-800 shadow-md space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                  <Sparkles className="w-5 h-5 text-amber-500" />
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Kết Quả Báo Cáo Chẩn Đoán AI: {selectedStudent?.full_name}
                  </h3>
                </div>

                <button
                  onClick={handleCopyParentSummary}
                  className="px-3 py-1.5 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:bg-sky-950 dark:text-sky-300 rounded-xl text-xs font-bold transition-all border border-sky-200 dark:border-sky-800 flex items-center gap-1"
                >
                  {copiedParentSummary ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedParentSummary ? 'Đã copy đoạn Zalo!' : 'Copy Tin Nhắn Zalo'}</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                {/* Knowledge Gap */}
                <div className="p-4 bg-rose-50/60 dark:bg-rose-950/30 rounded-xl border border-rose-200 dark:border-rose-900/60">
                  <h4 className="font-bold text-rose-700 dark:text-rose-300 mb-1 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" />
                    <span>Lỗ Hổng Kiến Thức Cần Khắc Phục</span>
                  </h4>
                  <p className="text-slate-700 dark:text-slate-200 font-medium leading-relaxed">
                    {aiResult.knowledge_gap}
                  </p>
                </div>

                {/* Learning Trend */}
                <div className="p-4 bg-sky-50/60 dark:bg-sky-950/30 rounded-xl border border-sky-200 dark:border-sky-900/60">
                  <h4 className="font-bold text-sky-700 dark:text-sky-300 mb-1 flex items-center gap-1.5">
                    <BrainCircuit className="w-4 h-4" />
                    <span>Đánh Giá Xu Hướng Phong Độ</span>
                  </h4>
                  <p className="text-slate-700 dark:text-slate-200 font-medium leading-relaxed">
                    {aiResult.learning_trend}
                  </p>
                </div>

                {/* Actionable Advice */}
                <div className="p-4 bg-emerald-50/60 dark:bg-emerald-950/30 rounded-xl border border-emerald-200 dark:border-emerald-900/60">
                  <h4 className="font-bold text-emerald-700 dark:text-emerald-300 mb-1 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Hành Động Phụ Đạo Dành Cho Giáo Viên / TA</span>
                  </h4>
                  <p className="text-slate-700 dark:text-slate-200 font-medium leading-relaxed">
                    {aiResult.actionable_advice}
                  </p>
                </div>

                {/* Parent Summary */}
                <div className="p-4 bg-teal-50/60 dark:bg-teal-950/30 rounded-xl border border-teal-200 dark:border-teal-900/60">
                  <h4 className="font-bold text-teal-700 dark:text-teal-300 mb-1 flex items-center gap-1.5">
                    <Send className="w-4 h-4" />
                    <span>Đoạn Tóm Tắt Tinh Tế Gửi Phụ Huynh Qua Zalo</span>
                  </h4>
                  <p className="text-slate-700 dark:text-slate-200 font-medium italic leading-relaxed">
                    "{aiResult.parent_summary}"
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 2: CURRICULUM MANAGEMENT (QUẢN LÝ PHÂN PHỐI CHƯƠNG TRÌNH) */}
      {activeSubTab === 'curriculum' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-emerald-600" />
                <span>Quản Lý Phân Phối Chương Trình Môn Toán THCS</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Chuyên đề do giáo viên tự nhập, sửa hoặc xóa. Mọi chuyên đề được tạo sẽ đồng bộ tức thì sang Biểu đồ Radar.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleOpenAddTag}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-600/20 flex items-center gap-1.5 shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>Thêm Chuyên Đề Mới</span>
              </button>
            </div>
          </div>

          {/* Search and Filter Controls */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2 flex-wrap">
              <Filter className="w-4 h-4 text-slate-400 ml-1" />
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Lọc Khối Lớp:
              </span>
              {[9, 8, 7, 6].map((g) => (
                <button
                  key={g}
                  onClick={() => setSelectedGrade(g as GradeLevel)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    selectedGrade === g
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                  }`}
                >
                  Khối {g}
                </button>
              ))}
              <button
                onClick={() => setSelectedGrade('all')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  selectedGrade === 'all'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                }`}
              >
                Tất cả các khối
              </button>
            </div>

            {/* Search Input */}
            <div className="relative w-full md:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Tìm tên chuyên đề..."
                value={searchTagQuery}
                onChange={(e) => setSearchTagQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
          </div>

          {/* Table of Tags */}
          <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 text-[11px] font-bold uppercase border-b border-slate-200 dark:border-slate-700">
                  <th className="p-3 w-20">Khối</th>
                  <th className="p-3 w-32">Phân Loại</th>
                  <th className="p-3">Tên Chuyên Đề Môn Toán</th>
                  <th className="p-3 w-32 text-center">Tài Liệu</th>
                  <th className="p-3 w-28 text-center">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {filteredCurriculumTags.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-400 dark:text-slate-500">
                      Không tìm thấy chuyên đề nào phù hợp với bộ lọc hiện tại.
                    </td>
                  </tr>
                ) : (
                  filteredCurriculumTags.map((t) => (
                    <tr
                      key={t.id}
                      className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="p-3 font-bold text-slate-900 dark:text-slate-100">
                        Lớp {t.grade_level}
                      </td>
                      <td className="p-3">
                        <span
                          className={`px-2.5 py-0.5 rounded text-[10px] font-bold ${
                            t.category === 'Algebra'
                              ? 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300'
                              : 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300'
                          }`}
                        >
                          {t.category === 'Algebra' ? 'Đại số' : 'Hình học'}
                        </span>
                      </td>
                      <td className="p-3 font-semibold text-slate-800 dark:text-slate-200">
                        {t.tag_name}
                      </td>
                      <td className="p-3 text-center">
                        {t.reference_link ? (
                          <a
                            href={t.reference_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sky-600 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300 font-semibold inline-flex items-center justify-center gap-1 text-[11px] bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/30 dark:hover:bg-sky-900/50 px-2 py-1 rounded-md transition-colors"
                            title={t.reference_link}
                          >
                            <ExternalLink className="w-3 h-3" />
                            <span>Mở link</span>
                          </a>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-500 italic text-[11px]">-</span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleOpenEditTag(t)}
                            className="p-1.5 text-slate-500 hover:text-emerald-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
                            title="Sửa tên chuyên đề"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteTag(t)}
                            className="p-1.5 text-slate-500 hover:text-rose-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
                            title="Xóa chuyên đề"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TOPIC DETAIL DRILLDOWN MODAL */}
      {selectedTopicDetail && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-2xl w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-start justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-[10px] font-bold rounded-md">
                  {selectedTopicDetail.category === 'Algebra' ? 'Đại số' : 'Hình học'} • Lớp {selectedTopicDetail.gradeLevel}
                </span>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mt-1">
                  Chuyên Đề: {selectedTopicDetail.fullTagName}
                </h3>
                <p className="text-xs text-slate-500">
                  Lịch sử điểm &amp; hệ số trọng số thời gian của <strong className="text-emerald-600">{selectedStudent?.full_name}</strong>
                </p>
              </div>
              <button
                onClick={() => setSelectedTopicDetail(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Score Overview Bar */}
            <div className="grid grid-cols-3 gap-3 text-center bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
              <div>
                <span className="text-[10px] text-slate-500 font-bold block uppercase">Điểm Làm Chủ (Time-Decay)</span>
                <span className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5 block">
                  {selectedTopicDetail.studentScore} / 10đ
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 font-bold block uppercase">Chuẩn Trung Bình Lớp</span>
                <span className="text-lg font-extrabold text-sky-600 dark:text-sky-400 mt-0.5 block">
                  {selectedTopicDetail.classAvg} / 10đ
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 font-bold block uppercase">Số Buổi Đã Làm Bài</span>
                <span className="text-lg font-extrabold text-slate-800 dark:text-slate-200 mt-0.5 block">
                  {selectedTopicDetail.sessionCount} buổi
                </span>
              </div>
            </div>

            {/* History Table */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-slate-400" />
                <span>Chi tiết các buổi học đóng góp vào điểm chuyên đề:</span>
              </h4>

              {selectedTopicDetail.history.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                  Chưa ghi nhận điểm kiểm tra hoặc BTVN nào của học sinh trong chuyên đề này.
                </div>
              ) : (
                <div className="max-h-60 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 text-[10px] font-bold uppercase border-b border-slate-200 dark:border-slate-700">
                        <th className="p-2.5">Ngày</th>
                        <th className="p-2.5">Buổi học</th>
                        <th className="p-2.5 text-center">BTVN</th>
                        <th className="p-2.5 text-center">Kiểm Tra</th>
                        <th className="p-2.5 text-center">Điểm Quy Đổi</th>
                        <th className="p-2.5 text-center">Trọng Số Recency</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {selectedTopicDetail.history.map((h, hIdx) => (
                        <tr key={hIdx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                          <td className="p-2.5 text-slate-500 font-mono text-[11px]">{h.sessionDate}</td>
                          <td className="p-2.5 font-medium text-slate-800 dark:text-slate-200">{h.lessonTitle}</td>
                          <td className="p-2.5 text-center font-bold font-mono">
                            {h.homeworkScore !== undefined ? h.homeworkScore : '-'}
                          </td>
                          <td className="p-2.5 text-center font-bold font-mono text-sky-600 dark:text-sky-400">
                            {h.testScore !== undefined ? h.testScore : '-'}
                          </td>
                          <td className="p-2.5 text-center font-extrabold font-mono text-emerald-600 dark:text-emerald-400">
                            {h.effectiveScore}
                          </td>
                          <td className="p-2.5 text-center font-mono text-[11px] text-slate-500">
                            x{h.weight}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedTopicDetail(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition-all"
              >
                Đóng Cửa Sổ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD / EDIT KNOWLEDGE TAG MODAL */}
      {isAddTagOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-emerald-600" />
                <span>{editingTag ? 'Chỉnh Sửa Chuyên Đề' : 'Thêm Chuyên Đề Môn Toán'}</span>
              </h3>
              <button
                onClick={() => setIsAddTagOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveTag} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Tên Chuyên Đề: <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Phương trình bậc hai & Định lý Vi-ét"
                  value={tagNameInput}
                  onChange={(e) => setTagNameInput(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 font-bold focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Khối Lớp:
                  </label>
                  <select
                    value={tagGradeInput}
                    onChange={(e) => setTagGradeInput(Number(e.target.value) as GradeLevel)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 font-bold focus:ring-2 focus:ring-emerald-500 outline-none"
                  >
                    <option value={9}>Lớp 9 (Ôn Thi 10)</option>
                    <option value={8}>Lớp 8</option>
                    <option value={7}>Lớp 7</option>
                    <option value={6}>Lớp 6</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Phân Loại:
                  </label>
                  <select
                    value={tagCategoryInput}
                    onChange={(e) => setTagCategoryInput(e.target.value as any)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 font-bold focus:ring-2 focus:ring-emerald-500 outline-none"
                  >
                    <option value="Algebra">Đại số</option>
                    <option value="Geometry">Hình học</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Link Tài Liệu / Bài Giảng (Tùy chọn):
                </label>
                <input
                  type="url"
                  placeholder="https://drive.google.com/..."
                  value={tagReferenceLinkInput}
                  onChange={(e) => setTagReferenceLinkInput(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddTagOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-bold transition-all"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold transition-all shadow-md shadow-emerald-600/20"
                >
                  {editingTag ? 'Lưu Thay Đổi' : 'Thêm Chuyên Đề'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
