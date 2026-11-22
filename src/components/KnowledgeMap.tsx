import React, { useState, useEffect, useMemo, useRef } from 'react';
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
import {
  KnowledgeTag,
  Student,
  AIDiagnosisData,
  GradeLevel,
  ClassItem,
  CRMInteractionLog,
  CRMCustomerStatus,
} from '../types';
import { db } from '../db/dexie';
import { sortStudentsByName } from '../utils/sortUtils';
import { logAudit } from '../utils/auditLogger';
import {
  getComprehensiveRadarAnalytics,
  getClassTopicGapGrouping,
  TopicMasteryAnalysis,
  ClassTopicGapGroup,
} from '../utils/knowledgeEngine';
import {
  generateZaloKnowledgeMapMessage,
  exportKnowledgeMapReportCardPNG,
} from '../utils/knowledgeReportCardGenerator';
import { exportRemedialWorksheetDocx } from '../utils/docxRemedialGenerator';
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
  Download,
  FileText,
  Upload,
  Users,
  Eye,
  Paperclip,
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
  const [activeSubTab, setActiveSubTab] = useState<'radar' | 'class_gaps' | 'curriculum'>('radar');
  const [selectedClassId, setSelectedClassId] = useState<string>('all');
  const [selectedStudentId, setSelectedStudentId] = useState<string | number | undefined>(
    students[0]?.id
  );
  const [selectedGrade, setSelectedGrade] = useState<GradeLevel | 'all'>(9);
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'Algebra' | 'Geometry'>('all');
  const [onlyShowTestedOnRadar, setOnlyShowTestedOnRadar] = useState<boolean>(true);
  const [searchTagQuery, setSearchTagQuery] = useState('');

  // Danh sách lớp học và ánh xạ học sinh -> lớp học
  const [classesList, setClassesList] = useState<ClassItem[]>([]);
  const [studentClassMap, setStudentClassMap] = useState<
    Record<
      string,
      {
        classId: string;
        className: string;
        gradeLevel?: number;
        teacherName?: string;
        targetGoal?: string;
      }
    >
  >({});

  // Computed Radar Data state (100% Điểm Kiểm Tra)
  const [radarData, setRadarData] = useState<TopicMasteryAnalysis[]>([]);
  const [isLoadingScores, setIsLoadingScores] = useState(false);

  // Gom nhóm học sinh cùng hổng 1 chuyên đề theo lớp (< 7.0đ)
  const [classGapGroups, setClassGapGroups] = useState<ClassTopicGapGroup[]>([]);
  const [isLoadingClassGaps, setIsLoadingClassGaps] = useState(false);

  // Drilldown Topic Detail Modal
  const [selectedTopicDetail, setSelectedTopicDetail] = useState<TopicMasteryAnalysis | null>(null);

  // Multimodal Input states (Text + Image PNG/JPG/WebP + PDF application/pdf)
  const [teacherNotesInput, setTeacherNotesInput] = useState('');
  const [attachmentFile, setAttachmentFile] = useState<{
    name: string;
    mimeType: string;
    base64: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // AI Diagnostic & Export states
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isDocxGenerating, setIsDocxGenerating] = useState(false);
  const [generatingGroupTagId, setGeneratingGroupTagId] = useState<string | null>(null);
  const [isExportingPng, setIsExportingPng] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<AIDiagnosisData | null>(null);
  const [copiedParentSummary, setCopiedParentSummary] = useState(false);
  const [copiedQuickZalo, setCopiedQuickZalo] = useState(false);
  const [copiedGroupStudentId, setCopiedGroupStudentId] = useState<string | null>(null);
  const [crmToastMessage, setCrmToastMessage] = useState<string | null>(null);

  // Curriculum Management Modal states
  const [isAddTagOpen, setIsAddTagOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<KnowledgeTag | null>(null);
  const [tagNameInput, setTagNameInput] = useState('');
  const [tagGradeInput, setTagGradeInput] = useState<GradeLevel>(9);
  const [tagCategoryInput, setTagCategoryInput] = useState<'Algebra' | 'Geometry'>('Algebra');
  const [tagReferenceLinkInput, setTagReferenceLinkInput] = useState('');
  const [curriculumMsg, setCurriculumMsg] = useState<string | null>(null);

  // Tải thông tin Lớp học & Học sinh
  useEffect(() => {
    async function loadStudentClassInfo() {
      try {
        const [classStudents, classes] = await Promise.all([
          db.class_students.toArray(),
          db.classes.toArray(),
        ]);
        setClassesList(classes);
        const classDict = new Map(classes.map((c) => [String(c.id), c]));

        const mapping: Record<
          string,
          {
            classId: string;
            className: string;
            gradeLevel?: number;
            teacherName?: string;
            targetGoal?: string;
          }
        > = {};
        classStudents.forEach((cs) => {
          const c = classDict.get(String(cs.class_id));
          if (c) {
            mapping[String(cs.student_id)] = {
              classId: String(c.id),
              className: c.class_name,
              gradeLevel: c.grade_level,
              teacherName: c.assistant_name,
              targetGoal: c.target_description,
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

  // Lọc danh sách học sinh theo Lớp đang chọn
  const filteredStudentsByClass = useMemo(() => {
    const active = students.filter((s) => s.status !== 'stopped');
    const list =
      selectedClassId === 'all'
        ? active
        : active.filter(
            (s) => studentClassMap[String(s.id)]?.classId === String(selectedClassId)
          );
    return sortStudentsByName(list.length > 0 ? list : active);
  }, [students, selectedClassId, studentClassMap]);

  const selectedStudent = useMemo(
    () =>
      students.find((s) => String(s.id) === String(selectedStudentId)) ||
      filteredStudentsByClass[0],
    [students, selectedStudentId, filteredStudentsByClass]
  );

  // Tự động chọn học sinh đầu tiên khi đổi Lớp
  const handleSelectClass = (newClassId: string) => {
    setSelectedClassId(newClassId);
    if (newClassId !== 'all') {
      const cls = classesList.find((c) => String(c.id) === String(newClassId));
      if (cls?.grade_level && [6, 7, 8, 9].includes(cls.grade_level)) {
        setSelectedGrade(cls.grade_level as GradeLevel);
      }
      const firstStudentInClass = sortStudentsByName(
        students.filter(
          (s) =>
            s.status !== 'stopped' &&
            studentClassMap[String(s.id)]?.classId === String(newClassId)
        )
      )[0];
      if (firstStudentInClass?.id) {
        setSelectedStudentId(firstStudentInClass.id);
      }
    }
  };

  // Tự động đồng bộ khối lớp khi chọn học sinh
  const handleSelectStudent = (studentIdStr: string) => {
    setSelectedStudentId(studentIdStr);
    const info = studentClassMap[studentIdStr];
    if (info && info.gradeLevel && [6, 7, 8, 9].includes(info.gradeLevel)) {
      setSelectedGrade(info.gradeLevel as GradeLevel);
    }
  };

  // Tính điểm Bản Đồ Kiến Thức Chuyên Đề (Chuẩn 100% Điểm Kiểm Tra)
  useEffect(() => {
    const calculateCumulativeScores = async () => {
      setIsLoadingScores(true);
      try {
        const analytics = await getComprehensiveRadarAnalytics(
          selectedStudent?.id,
          selectedGrade,
          selectedCategory,
          selectedClassId === 'all' ? undefined : selectedClassId,
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
  }, [knowledgeTags, selectedStudent?.id, selectedGrade, selectedCategory, selectedClassId]);

  // Tính danh sách Gom Nhóm Học Sinh Cùng Hổng Chuyên Đề (< 7.0đ)
  useEffect(() => {
    const loadClassGaps = async () => {
      setIsLoadingClassGaps(true);
      try {
        const groups = await getClassTopicGapGrouping(
          students,
          selectedGrade,
          selectedCategory,
          selectedClassId,
          knowledgeTags
        );
        setClassGapGroups(groups);
      } catch (err) {
        console.error('[KnowledgeMap] Error loading class topic gap groups:', err);
      } finally {
        setIsLoadingClassGaps(false);
      }
    };
    loadClassGaps();
  }, [students, knowledgeTags, selectedGrade, selectedCategory, selectedClassId]);

  // Chỉ số KPI chuẩn 100% Điểm Kiểm Tra
  const testedTopics = useMemo(
    () => radarData.filter((r) => r.sessionCount > 0),
    [radarData]
  );
  const masteredTopics = useMemo(
    () => testedTopics.filter((r) => r.studentScore >= 8.5),
    [testedTopics]
  );
  const proficientTopics = useMemo(
    () => testedTopics.filter((r) => r.studentScore >= 7.0 && r.studentScore < 8.5),
    [testedTopics]
  );
  const criticalGapTopics = useMemo(
    () => testedTopics.filter((r) => r.studentScore < 7.0),
    [testedTopics]
  );
  const improvingTopics = useMemo(
    () => testedTopics.filter((r) => r.trend === 'improving'),
    [testedTopics]
  );

  // Dữ liệu hiển thị trên Biểu đồ Radar: Mặc định chỉ vẽ chuyên đề đã kiểm tra (sessionCount > 0) để không bị méo về 0đ
  const radarChartDisplayData = useMemo(() => {
    if (onlyShowTestedOnRadar && testedTopics.length > 0) {
      return testedTopics;
    }
    return radarData;
  }, [onlyShowTestedOnRadar, testedTopics, radarData]);

  // Ghi nhận tự động vào Nhật ký CRM (crm_interactions) của Học sinh mỗi khi gửi Zalo / Xuất Ảnh PNG / Xuất File Word .DOCX
  const recordCrmInteractionForStudent = async (
    targetStudent: Student,
    actionSummary: string,
    hasGap: boolean
  ) => {
    if (!targetStudent?.id) return;
    try {
      const nowIso = new Date().toISOString();
      const studentInDb = await db.students.get(targetStudent.id);
      const baseStudent = studentInDb || targetStudent;
      const existingLogs: CRMInteractionLog[] = Array.isArray(baseStudent.crm_interactions)
        ? baseStudent.crm_interactions
        : [];

      const nextStatus: CRMCustomerStatus =
        baseStudent.crm_status === 'at_risk'
          ? 'attention'
          : hasGap && (!baseStudent.crm_status || baseStudent.crm_status === 'satisfied')
          ? 'attention'
          : baseStudent.crm_status || 'satisfied';

      const newLog: CRMInteractionLog = {
        id: `crm_km_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        created_at: nowIso,
        channel: 'zalo',
        template_category: 'knowledge_remedial',
        summary: `[Bản Đồ Kiến Thức & AI] ${actionSummary}`,
        status_snapshot: nextStatus,
        created_by:
          studentClassMap[String(targetStudent.id)]?.teacherName || 'Giáo viên phụ trách',
      };

      await db.students.update(targetStudent.id, {
        crm_interactions: [newLog, ...existingLogs],
        crm_last_contacted_at: nowIso,
        crm_status: nextStatus,
      });

      setCrmToastMessage(
        `Đã tự động lưu vào Nhật ký CRM của ${targetStudent.full_name}: "${actionSummary}"`
      );
      setTimeout(() => setCrmToastMessage(null), 4000);
    } catch (err) {
      console.warn('Error logging CRM interaction from KnowledgeMap:', err);
    }
  };

  // Xử lý đính kèm File Đa Phương Thức (Ảnh PNG/JPG/WebP hoặc PDF application/pdf)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = [
      'image/png',
      'image/jpeg',
      'image/webp',
      'application/pdf',
    ];
    if (!allowedTypes.includes(file.type)) {
      setAiError('Chỉ hỗ trợ định dạng Ảnh (PNG, JPG, WebP) hoặc File PDF (application/pdf).');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64Str = String(reader.result || '');
      setAttachmentFile({
        name: file.name,
        mimeType: file.type,
        base64: base64Str,
      });
      setAiError(null);
    };
    reader.readAsDataURL(file);
  };

  // Filtered knowledge tags for curriculum management table
  const filteredCurriculumTags = useMemo(() => {
    return knowledgeTags
      .filter((t) => {
        if (selectedGrade !== 'all' && Number(t.grade_level) !== Number(selectedGrade))
          return false;
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

  // Chạy Chẩn Đoán AI Đa Phương Thức (Văn bản + Điểm KT Chuyên đề + Ảnh/PDF đính kèm)
  const handleRunAiDiagnose = async () => {
    if (!selectedStudent) return;

    setIsAiLoading(true);
    setAiError(null);

    try {
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

      const stInfo = studentClassMap[String(selectedStudent.id)];

      const res = await fetch('/api/ai-diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentName: selectedStudent.full_name,
          gradeLevel: selectedGrade === 'all' ? stInfo?.gradeLevel || 9 : selectedGrade,
          targetScore: stInfo?.targetGoal || 'Thi Vào 10 Đạt 8.5+',
          recentSessions: recentSessionsData,
          knowledgeScores: (testedTopics.length > 0 ? testedTopics : radarData).map((r) => ({
            chuyen_de: r.fullTagName,
            diem_kiem_tra_100: r.studentScore,
            so_bai_kiem_tra: r.sessionCount,
            xu_huong_2_bai_gan_nhat: r.trend,
            chenh_lech_2_bai: r.trendDelta,
          })),
          teacherNotes: teacherNotesInput.trim() || undefined,
          attachmentBase64: attachmentFile?.base64,
          attachmentMimeType: attachmentFile?.mimeType,
          userApiKey: userApiKey,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Lỗi hệ thống khi gọi Gemini AI');
      }

      setAiResult(data.diagnosis);

      await db.ai_diagnoses.add({
        student_id: String(selectedStudent.id!),
        diagnosis_json: data.diagnosis,
        created_at: new Date().toISOString(),
      });

      await logAudit(
        currentRole as any,
        'Chẩn đoán AI Đa phương thức',
        `Chạy chẩn đoán Bản đồ Kiến thức (100% Điểm KT) cho học sinh ${selectedStudent.full_name}`
      );
    } catch (err: any) {
      setAiError(err.message || 'Lỗi không xác định khi tạo chẩn đoán AI');
    } finally {
      setIsAiLoading(false);
    }
  };

  // 1-Click Copy Zalo Lộ Trình Khắc Phục Chuyên Đề & Lưu Nhật Ký CRM
  const handleCopyQuickZaloMessage = async () => {
    if (!selectedStudent) return;
    const stInfo = studentClassMap[String(selectedStudent.id)];

    const text = generateZaloKnowledgeMapMessage({
      student: selectedStudent,
      className: stInfo?.className || 'Lớp Toán THCS',
      gradeLevel: selectedGrade,
      teacherName: stInfo?.teacherName,
      targetGoal: stInfo?.targetGoal,
      topics: radarData,
      aiDiagnosis: aiResult,
    });

    await navigator.clipboard.writeText(text);
    setCopiedQuickZalo(true);
    setTimeout(() => setCopiedQuickZalo(false), 2500);

    await recordCrmInteractionForStudent(
      selectedStudent,
      `Đã copy & gửi Báo cáo Zalo Lộ trình Bản đồ Chuyên đề (100% Điểm KT - ${criticalGapTopics.length} chuyên đề cần bù hổng).`,
      criticalGapTopics.length > 0
    );
  };

  // Copy đoạn tóm tắt AI gửi Phụ huynh & Lưu CRM
  const handleCopyParentSummary = async () => {
    if (!aiResult?.parent_summary || !selectedStudent) return;
    await navigator.clipboard.writeText(aiResult.parent_summary);
    setCopiedParentSummary(true);
    setTimeout(() => setCopiedParentSummary(false), 2500);

    await recordCrmInteractionForStudent(
      selectedStudent,
      `Đã gửi Nhận xét Chẩn đoán AI Bản đồ Chuyên đề qua Zalo cho Phụ huynh.`,
      criticalGapTopics.length > 0
    );
  };

  // Xuất Ảnh PNG Phiếu Bản Đồ Năng Lực & Lộ Trình Chuyên Đề (Retina 2x, 0% dấu '...') & Lưu CRM
  const handleExportKnowledgeMapPng = async () => {
    if (!selectedStudent) return;
    setIsExportingPng(true);
    try {
      const stInfo = studentClassMap[String(selectedStudent.id)];
      await exportKnowledgeMapReportCardPNG({
        student: selectedStudent,
        className: stInfo?.className || 'Lớp Toán THCS',
        gradeLevel: selectedGrade,
        teacherName: stInfo?.teacherName,
        targetGoal: stInfo?.targetGoal,
        topics: radarData,
        aiDiagnosis: aiResult,
      });

      await recordCrmInteractionForStudent(
        selectedStudent,
        `Đã xuất Ảnh PNG Phiếu Bản Đồ Năng Lực Chuyên Đề (100% Điểm KT, không cắt chữ) gửi Phụ huynh.`,
        criticalGapTopics.length > 0
      );
    } catch (err) {
      console.error('Export Knowledge Map PNG error:', err);
    } finally {
      setIsExportingPng(false);
    }
  };

  // AI Sinh Phiếu Bài Tập Bù Lỗ Hổng Cá Nhân Hóa Xuất File Word (.DOCX chuẩn Cambria Math $...$)
  const handleGenerateRemedialDocx = async (options?: {
    customStudentNames?: string[];
    customWeakTopics?: string[];
    customClassName?: string;
    groupTagId?: string;
  }) => {
    const targetNames =
      options?.customStudentNames && options.customStudentNames.length > 0
        ? options.customStudentNames
        : selectedStudent
        ? [selectedStudent.full_name]
        : ['Học sinh'];

    const weakTopicNames =
      options?.customWeakTopics && options.customWeakTopics.length > 0
        ? options.customWeakTopics
        : criticalGapTopics.length > 0
        ? criticalGapTopics.map((t) => `${t.fullTagName} (${t.studentScore}đ)`)
        : testedTopics.length > 0
        ? testedTopics.slice(0, 2).map((t) => t.fullTagName)
        : ['Chuyên đề Trọng tâm Toán THCS'];

    const stInfo = selectedStudent ? studentClassMap[String(selectedStudent.id)] : undefined;
    const targetClassName =
      options?.customClassName || stInfo?.className || 'Lớp Toán THCS';

    if (options?.groupTagId) {
      setGeneratingGroupTagId(options.groupTagId);
    } else {
      setIsDocxGenerating(true);
    }
    setAiError(null);

    try {
      const res = await fetch('/api/ai-remedial-worksheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentNames: targetNames,
          className: targetClassName,
          gradeLevel: selectedGrade === 'all' ? stInfo?.gradeLevel || 9 : selectedGrade,
          teacherName: stInfo?.teacherName || 'Thầy/Cô phụ trách',
          weakTopics: weakTopicNames,
          teacherPrompt: teacherNotesInput.trim() || undefined,
          attachmentBase64: attachmentFile?.base64,
          attachmentMimeType: attachmentFile?.mimeType,
          userApiKey: userApiKey,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Không thể tạo Phiếu bài tập bù lỗ hổng AI.');
      }

      const ws = data.worksheet;
      await exportRemedialWorksheetDocx({
        worksheetTitle:
          ws.worksheetTitle || 'PHIẾU BÀI TẬP BÙ LỖ HỔNG & BỨT PHÁ ĐIỂM KIỂM TRA',
        targetTopicNames: weakTopicNames,
        className: targetClassName,
        gradeLevel: selectedGrade === 'all' ? stInfo?.gradeLevel || 9 : selectedGrade,
        studentNames: targetNames,
        teacherName: stInfo?.teacherName,
        durationMinutes: 45,
        diagnosisSummary:
          ws.diagnosisSummary ||
          `Bù lỗ hổng kiến thức và rèn kỹ năng trình bày bài kiểm tra chuyên đề: ${weakTopicNames.join(', ')}.`,
        theorySummary: Array.isArray(ws.theorySummary) ? ws.theorySummary : [],
        exercises: Array.isArray(ws.exercises) ? ws.exercises : [],
        parentNote:
          ws.parentNote ||
          'Gia đình nhắc con hoàn thành đầy đủ các bài tập trong phiếu trước buổi học tới để Thầy/Cô chấm chữa trực tiếp.',
      });

      if (!options?.groupTagId && selectedStudent) {
        await recordCrmInteractionForStudent(
          selectedStudent,
          `Đã tạo & xuất File Word (.DOCX Cambria Math) Phiếu Bài Tập Bù Lỗ Hổng cho chuyên đề: ${weakTopicNames.join(', ')}.`,
          true
        );
      } else if (options?.groupTagId) {
        setCrmToastMessage(
          `Đã xuất File Word (.DOCX Cambria Math) Phiếu Bài Tập Bù Lỗ Hổng cho nhóm ${targetNames.length} học sinh!`
        );
        setTimeout(() => setCrmToastMessage(null), 4000);
      }

      await logAudit(
        currentRole as any,
        'Xuất Phiếu Bù Lỗ Hổng .DOCX',
        `Xuất file Word (.docx Cambria Math) bù lỗ hổng chuyên đề [${weakTopicNames.join(', ')}] cho: ${targetNames.join(', ')}`
      );
    } catch (err: any) {
      setAiError(err.message || 'Lỗi khi xuất Phiếu bài tập bù lỗ hổng .DOCX');
    } finally {
      setIsDocxGenerating(false);
      setGeneratingGroupTagId(null);
    }
  };

  // Copy Zalo nhanh cho 1 học sinh trực tiếp từ bảng Gom Nhóm Học Sinh Cùng Hổng Chuyên Đề
  const handleCopyGroupStudentZalo = async (
    group: ClassTopicGapGroup,
    gapSt: ClassTopicGapGroup['gapStudents'][0]
  ) => {
    const fullStudent = students.find((s) => String(s.id) === String(gapSt.studentId));
    if (!fullStudent) return;

    const stInfo = studentClassMap[String(fullStudent.id)];
    const teacherTitle = stInfo?.teacherName ? `Thầy/Cô ${stInfo.teacherName}` : 'Thầy/Cô';
    const parentTitle = fullStudent.parent_name
      ? `Anh/Chị ${fullStudent.parent_name}`
      : 'Quý Phụ huynh';

    const msg = [
      `📌 [THÔNG BÁO LỘ TRÌNH BÙ LỖ HỔNG CHUYÊN ĐỀ TOÁN - ${fullStudent.full_name.toUpperCase()}]`,
      `Kính gửi ${parentTitle} (Phụ huynh em ${fullStudent.full_name} - Lớp ${gapSt.className}),`,
      `Qua tổng hợp kết quả 100% Điểm Kiểm Tra trên Bản đồ Kiến thức, ${teacherTitle} nhận thấy ở chuyên đề "${group.tagName}", điểm kiểm tra trung bình của con hiện đạt ${gapSt.testAvgScore}/10đ (qua ${gapSt.testCount} bài kiểm tra, chuẩn yêu cầu >= 7.0đ).`,
      ``,
      `💡 Lộ trình khắc phục của lớp:`,
      `• ${teacherTitle} đã xếp con vào nhóm ưu tiên củng cố chuyên đề "${group.tagName}" và gửi kèm Phiếu bài tập bù lỗ hổng cá nhân hóa (5 bài tự luận phân bậc).`,
      `• Nhờ gia đình nhắc con hoàn thành phiếu bài tập này để ${teacherTitle} chấm chữa trực tiếp và giúp con lấy lại điểm số trong 2 buổi tới. Trân trọng cảm ơn gia đình!`,
    ].join('\n');

    await navigator.clipboard.writeText(msg);
    setCopiedGroupStudentId(`${group.tagId}_${gapSt.studentId}`);
    setTimeout(() => setCopiedGroupStudentId(null), 2500);

    await recordCrmInteractionForStudent(
      fullStudent,
      `Đã gửi Zalo thông báo lộ trình phụ đạo nhóm chuyên đề "${group.tagName}" (Điểm KT hiện tại: ${gapSt.testAvgScore}đ).`,
      true
    );
  };

  // Modal Handlers cho Phân phối chương trình
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
      setCurriculumMsg(
        'Đã cập nhật danh mục chuyên đề thành công! Bản đồ Kiến thức đã tự động đồng bộ.'
      );
      setTimeout(() => setCurriculumMsg(null), 3000);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteTag = async (tag: KnowledgeTag) => {
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
              <span className="text-slate-400 block text-[10px]">
                Điểm Kiểm Tra (100%):
              </span>
              <span className="font-bold text-emerald-400 text-sm">
                {data.studentScore}{' '}
                <span className="text-[10px] text-slate-400 font-normal">/ 10đ</span>
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">TB Kiểm Tra Lớp:</span>
              <span className="font-bold text-sky-400 text-sm">
                {data.classAvg}{' '}
                <span className="text-[10px] text-slate-400 font-normal">/ 10đ</span>
              </span>
            </div>
          </div>

          <div className="text-[10px] text-slate-300 pt-1 border-t border-slate-800 flex items-center justify-between">
            <span>
              Số bài kiểm tra: <strong>{data.sessionCount} bài</strong>
            </span>
            {data.trend === 'improving' && (
              <span className="text-emerald-400 font-bold flex items-center gap-0.5">
                <TrendingUp className="w-3 h-3" /> 2 bài gần nhất (+{data.trendDelta}đ)
              </span>
            )}
            {data.trend === 'declining' && (
              <span className="text-rose-400 font-bold flex items-center gap-0.5">
                <TrendingDown className="w-3 h-3" /> 2 bài gần nhất ({data.trendDelta}đ)
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
      <div className="bg-gradient-to-r from-emerald-900 via-teal-800 to-cyan-900 rounded-3xl p-6 text-white shadow-xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Compass className="w-6 h-6 text-emerald-300" />
            <h2 className="text-xl font-black tracking-tight text-white">
              Bản Đồ Năng Lực Chuyên Đề &amp; Trợ Lý AI Bù Lỗ Hổng (100% Điểm Kiểm Tra)
            </h2>
            <span className="px-2.5 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 text-[11px] font-extrabold">
              Chuẩn 100% Điểm Kiểm Tra Thực Chiến
            </span>
          </div>
          <p className="text-xs text-emerald-100/90 font-medium">
            Đo lường chính xác mức độ làm chủ từng chuyên đề qua 100% Điểm Kiểm Tra • Gom nhóm học sinh cùng hổng chuyên đề • Xuất Ảnh Phiếu Bản Đồ PNG không cắt chữ &amp; Phiếu Bài Tập Bù Hổng Word (.DOCX Cambria Math) tự động lưu CRM.
          </p>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center p-1 bg-white/10 backdrop-blur-md border border-white/20 rounded-xl shrink-0 flex-wrap gap-1">
          <button
            onClick={() => setActiveSubTab('radar')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeSubTab === 'radar'
                ? 'bg-white text-emerald-900 shadow-md font-extrabold'
                : 'text-white/80 hover:text-white'
            }`}
          >
            <BrainCircuit className="w-4 h-4" />
            <span>Bản Đồ Học Sinh &amp; AI</span>
          </button>
          <button
            onClick={() => setActiveSubTab('class_gaps')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeSubTab === 'class_gaps'
                ? 'bg-white text-emerald-900 shadow-md font-extrabold'
                : 'text-white/80 hover:text-white'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Gom Nhóm Lỗ Hổng Theo Lớp ({classGapGroups.length})</span>
          </button>
          <button
            onClick={() => setActiveSubTab('curriculum')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
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

      {/* CRM Auto-Sync Notification Toast */}
      {crmToastMessage && (
        <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/70 text-emerald-900 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700 rounded-xl text-xs font-bold flex items-center justify-between gap-2 shadow-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{crmToastMessage}</span>
          </div>
          <button
            onClick={() => setCrmToastMessage(null)}
            className="text-emerald-700 hover:text-emerald-900"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {curriculumMsg && (
        <div className="p-3.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{curriculumMsg}</span>
        </div>
      )}

      {/* Global Synchronized Filters (Class + Student + Grade + Category) */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
        {/* Class Selector */}
        <div>
          <label className="block text-[10px] font-extrabold uppercase text-slate-400 mb-1 flex items-center gap-1">
            <Users className="w-3 h-3 text-teal-600" />
            <span>Lọc Theo Lớp Học:</span>
          </label>
          <select
            value={selectedClassId}
            onChange={(e) => handleSelectClass(e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 rounded-xl p-2.5 font-bold text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 outline-none"
          >
            <option value="all">Tất Cả Lớp Học ({classesList.length} lớp)</option>
            {classesList.map((cls) => (
              <option key={cls.id} value={String(cls.id)}>
                🏫 {cls.class_name} (Khối {cls.grade_level})
              </option>
            ))}
          </select>
        </div>

        {/* Student Selector */}
        <div>
          <label className="block text-[10px] font-extrabold uppercase text-slate-400 mb-1 flex items-center gap-1">
            <User className="w-3 h-3 text-emerald-500" />
            <span>Chọn Học Sinh Phân Tích:</span>
          </label>
          <select
            value={selectedStudent?.id || ''}
            onChange={(e) => handleSelectStudent(e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 rounded-xl p-2.5 font-bold text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 outline-none"
          >
            {filteredStudentsByClass.map((st, idx) => {
              const info = studentClassMap[String(st.id)];
              const classLabel = info?.className ? ` - ${info.className}` : '';
              return (
                <option key={st.id ? `${st.id}-${idx}` : idx} value={st.id}>
                  👤 {st.full_name}
                  {classLabel}
                </option>
              );
            })}
          </select>
        </div>

        {/* Grade Level Selector */}
        <div>
          <label className="block text-[10px] font-extrabold uppercase text-slate-400 mb-1 flex items-center gap-1">
            <Filter className="w-3 h-3 text-sky-500" />
            <span>Khối Lớp Chương Trình:</span>
          </label>
          <select
            value={selectedGrade}
            onChange={(e) =>
              setSelectedGrade(
                e.target.value === 'all' ? 'all' : (Number(e.target.value) as GradeLevel)
              )
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

      {/* SUB-TAB 1: RADAR CHART, CSKH EXPORT & MULTIMODAL AI REMEDIAL WORKSHEET */}
      {activeSubTab === 'radar' && (
        <div className="space-y-6">
          {/* Thanh Công Cụ CSKH & Xuất Học Liệu Cá Nhân Hóa 1-Click */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-emerald-200 dark:border-emerald-900/70 shadow-sm flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-extrabold text-slate-900 dark:text-slate-100">
                  Hồ Sơ Chuyên Đề: {selectedStudent?.full_name}
                </span>
                <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px] font-bold">
                  {studentClassMap[String(selectedStudent?.id)]?.className || 'Chưa xếp lớp'}
                </span>
                {selectedStudent?.crm_last_contacted_at && (
                  <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 text-[10px] font-bold">
                    CSKH gần nhất:{' '}
                    {new Date(selectedStudent.crm_last_contacted_at).toLocaleDateString('vi-VN')}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500">
                Mọi thao tác gửi Zalo Lộ trình, Xuất Ảnh Phiếu Bản Đồ PNG hoặc Xuất Phiếu Bài Tập Bù Hổng (.DOCX) đều tự động ghi nhận vào Nhật ký CRM của học sinh.
              </p>
            </div>

            <div className="flex items-center flex-wrap gap-2">
              <button
                onClick={handleCopyQuickZaloMessage}
                disabled={!selectedStudent}
                className="px-3.5 py-2 bg-sky-50 hover:bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200 border border-sky-200 dark:border-sky-800 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
              >
                {copiedQuickZalo ? (
                  <Check className="w-4 h-4 text-emerald-600" />
                ) : (
                  <Send className="w-4 h-4 text-sky-600" />
                )}
                <span>
                  {copiedQuickZalo
                    ? 'Đã Copy Zalo & Lưu CRM!'
                    : 'Copy Zalo Lộ Trình (Lưu CRM)'}
                </span>
              </button>

              <button
                onClick={handleExportKnowledgeMapPng}
                disabled={isExportingPng || !selectedStudent}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-60"
              >
                {isExportingPng ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                <span>Xuất Ảnh Phiếu Bản Đồ PNG (Không cắt chữ)</span>
              </button>

              <button
                onClick={() => handleGenerateRemedialDocx()}
                disabled={isDocxGenerating || !selectedStudent}
                className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-60"
              >
                {isDocxGenerating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <FileText className="w-4 h-4" />
                )}
                <span>
                  {isDocxGenerating
                    ? 'Đang soạn File Word...'
                    : 'AI Xuất Phiếu Bù Hổng (.DOCX Cambria Math)'}
                </span>
              </button>
            </div>
          </div>

          {/* 4 KPI Summary Cards (100% Điểm Kiểm Tra Chuyên Đề) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Mastered */}
            <div className="bg-emerald-50/70 dark:bg-emerald-950/30 p-4 rounded-2xl border border-emerald-200/80 dark:border-emerald-800/60 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300 block">
                  🟢 Vững Vàng (KT ≥ 8.5đ)
                </span>
                <span className="text-xl font-extrabold text-emerald-700 dark:text-emerald-300 mt-1 block">
                  {masteredTopics.length}{' '}
                  <span className="text-xs font-normal text-emerald-600 dark:text-emerald-400">
                    / {testedTopics.length} CĐ đã KT
                  </span>
                </span>
              </div>
              <Award className="w-8 h-8 text-emerald-500/40" />
            </div>

            {/* Proficient */}
            <div className="bg-sky-50/70 dark:bg-sky-950/30 p-4 rounded-2xl border border-sky-200/80 dark:border-sky-800/60 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-sky-800 dark:text-sky-300 block">
                  🔵 Khá - Ổn Định (KT 7.0 - 8.4đ)
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
                  🔴 Lỗ Hổng Cần Bù (KT &lt; 7.0đ)
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
                  📈 Tiến Bộ 2 Bài KT Gần Nhất
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

          {/* Grid: Radar Chart + Multimodal AI Diagnostic & Worksheet Box */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Radar Chart */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 flex-wrap gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <BrainCircuit className="w-4 h-4 text-emerald-600" />
                    <span>Biểu Đồ Radar 100% Điểm Kiểm Tra Chuyên Đề</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Học sinh:{' '}
                    <strong className="text-emerald-600 font-bold">
                      {selectedStudent?.full_name}
                    </strong>{' '}
                    vs Chuẩn Trung Bình Kiểm Tra Lớp
                  </p>
                </div>

                <button
                  onClick={() => setOnlyShowTestedOnRadar((prev) => !prev)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all flex items-center gap-1 ${
                    onlyShowTestedOnRadar
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800'
                      : 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                  }`}
                  title="Ẩn các chuyên đề chưa kiểm tra để đồ thị Radar không bị kéo méo về 0đ"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>
                    {onlyShowTestedOnRadar
                      ? `Chỉ vẽ CĐ đã KT (${testedTopics.length})`
                      : `Đang vẽ tất cả (${radarData.length})`}
                  </span>
                </button>
              </div>

              {isLoadingScores ? (
                <div className="h-80 flex items-center justify-center text-xs text-slate-400 gap-2">
                  <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
                  <span>Đang tổng hợp 100% Điểm Kiểm Tra từng chuyên đề...</span>
                </div>
              ) : radarChartDisplayData.length === 0 ? (
                <div className="h-80 flex flex-col items-center justify-center text-xs text-slate-400 p-6 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
                  <BookOpen className="w-8 h-8 text-slate-300 dark:text-slate-600" />
                  <p className="max-w-xs leading-relaxed text-slate-500">
                    Chưa có chuyên đề môn Toán nào phù hợp với bộ lọc hiện tại. Giáo viên có thể thêm chuyên đề mới hoặc bật xem cả các chuyên đề chưa kiểm tra.
                  </p>
                  <div className="flex items-center gap-2">
                    {onlyShowTestedOnRadar && radarData.length > 0 && (
                      <button
                        onClick={() => setOnlyShowTestedOnRadar(false)}
                        className="px-3.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg font-bold text-xs transition-all"
                      >
                        Hiện tất cả {radarData.length} chuyên đề
                      </button>
                    )}
                    <button
                      onClick={handleOpenAddTag}
                      className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Thêm Chuyên Đề Mới</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart
                      cx="50%"
                      cy="50%"
                      outerRadius="75%"
                      data={radarChartDisplayData}
                    >
                      <PolarGrid stroke="#e2e8f0" />
                      <PolarAngleAxis
                        dataKey="subject"
                        tick={{ fontSize: 10, fill: '#475569', fontWeight: 600 }}
                      />
                      <PolarRadiusAxis angle={30} domain={[0, 10]} stroke="#cbd5e1" />
                      <Radar
                        name={`${selectedStudent?.full_name || 'Học sinh'} (100% Điểm KT)`}
                        dataKey="studentScore"
                        stroke="#10b981"
                        fill="#10b981"
                        fillOpacity={0.45}
                        strokeWidth={2}
                      />
                      <Radar
                        name="Trung Bình Kiểm Tra Lớp"
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

              {/* Danh sách chuyên đề chi tiết (hiển thị 100% tên đầy đủ, không cắt chữ) */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/80 space-y-2 max-h-56 overflow-y-auto">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                    Bảng điểm Kiểm tra từng chuyên đề (Nhấn để xem lịch sử bài KT):
                  </span>
                  <span className="text-[10px] text-slate-500 font-semibold">
                    Đã KT: {testedTopics.length}/{radarData.length} chuyên đề
                  </span>
                </div>
                {radarData.map((item, idx) => (
                  <div
                    key={idx}
                    onClick={() => setSelectedTopicDetail(item)}
                    className="flex items-center justify-between gap-2 text-xs p-2 rounded-lg hover:bg-white dark:hover:bg-slate-700/60 border border-transparent hover:border-slate-200 dark:hover:border-slate-600 cursor-pointer transition-all"
                  >
                    <div className="flex items-start gap-2 min-w-0 flex-1">
                      <span
                        className={`w-2.5 h-2.5 rounded-full shrink-0 mt-1 ${
                          item.sessionCount === 0
                            ? 'bg-slate-300 dark:bg-slate-600'
                            : item.studentScore >= 8.5
                            ? 'bg-emerald-500'
                            : item.studentScore >= 7.0
                            ? 'bg-sky-500'
                            : 'bg-rose-500'
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <span className="text-slate-800 dark:text-slate-200 font-semibold block leading-snug break-words">
                          {item.fullTagName}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {item.category === 'Algebra' ? 'Đại số' : 'Hình học'} • Khối{' '}
                          {item.gradeLevel} • {item.sessionCount} bài kiểm tra
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {item.sessionCount > 0 && item.trend === 'improving' && (
                        <span
                          className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-0.5"
                          title="Tiến bộ ở 2 bài kiểm tra gần nhất"
                        >
                          <TrendingUp className="w-3 h-3" />+{item.trendDelta}
                        </span>
                      )}
                      {item.sessionCount > 0 && item.trend === 'declining' && (
                        <span
                          className="text-[10px] text-rose-600 dark:text-rose-400 font-bold flex items-center gap-0.5"
                          title="Sa sút ở 2 bài kiểm tra gần nhất"
                        >
                          <TrendingDown className="w-3 h-3" />
                          {item.trendDelta}
                        </span>
                      )}

                      <span
                        className={`font-mono font-bold px-2 py-0.5 rounded text-[11px] ${
                          item.sessionCount === 0
                            ? 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                            : item.studentScore >= 8.5
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : item.studentScore >= 7.0
                            ? 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300'
                            : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                        }`}
                      >
                        {item.sessionCount === 0 ? 'Chưa KT' : `${item.studentScore} / 10đ`}
                      </span>

                      <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Multimodal AI Diagnose & .DOCX Cambria Math Remedial Worksheet Box */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between space-y-4">
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-amber-500" />
                      <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        Trợ Lý AI Đa Phương Thức &amp; Tạo Phiếu Bù Hổng (.DOCX)
                      </h3>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Kết hợp Điểm Kiểm Tra Chuyên Đề với Văn bản / Ảnh chụp bài làm sai / File PDF đề kiểm tra để chẩn đoán và xuất File Word chuẩn Cambria Math ($...$).
                    </p>
                  </div>
                </div>

                {/* tóm tắt các chuyên đề đang hổng (< 7.0đ) cần bù ngay */}
                <div className="p-3.5 rounded-xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200/80 dark:border-rose-900/60 space-y-1.5">
                  <span className="text-xs font-extrabold text-rose-800 dark:text-rose-300 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>
                      Chuyên đề đang hổng (&lt; 7.0đ qua bài kiểm tra) của{' '}
                      {selectedStudent?.full_name}:
                    </span>
                  </span>
                  {criticalGapTopics.length === 0 ? (
                    <p className="text-xs text-emerald-700 dark:text-emerald-300 font-semibold">
                      ✓ Học sinh không có chuyên đề nào dưới 7.0đ. Có thể dùng AI để tạo Phiếu bài tập nâng cao bứt phá 8.5+!
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {criticalGapTopics.map((gap) => (
                        <span
                          key={gap.tagId}
                          className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-[11px] font-bold"
                        >
                          {gap.fullTagName}: {gap.studentScore}đ ({gap.sessionCount} bài KT)
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Đầu vào Đa phương thức (Multimodal Input: Text + Image PNG/JPG/WebP + PDF) */}
                <div className="space-y-3 bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                      1. Ghi chú lỗi sai thực tế / Yêu cầu biên soạn phiếu bài tập (Văn bản thô):
                    </label>
                    <textarea
                      rows={2}
                      value={teacherNotesInput}
                      onChange={(e) => setTeacherNotesInput(e.target.value)}
                      placeholder="VD: Con hay quên điều kiện căn thức có nghĩa và sai dấu khi giải hệ phương trình. Hãy tạo 5 bài tự luận rèn kỹ năng này..."
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-medium text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                      2. Đính kèm Ảnh bài kiểm tra làm sai (PNG, JPG, WebP) hoặc File Đề PDF (Tùy chọn):
                    </label>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,application/pdf"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-3 py-2 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                      >
                        <Upload className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Chọn Ảnh Bài Làm / File PDF Đề Kiểm Tra</span>
                      </button>

                      {attachmentFile && (
                        <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-lg text-xs font-bold text-emerald-800 dark:text-emerald-300">
                          <Paperclip className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate max-w-[180px]">{attachmentFile.name}</span>
                          <button
                            type="button"
                            onClick={() => {
                              setAttachmentFile(null);
                              if (fileInputRef.current) fileInputRef.current.value = '';
                            }}
                            className="text-rose-600 hover:text-rose-800 ml-1"
                            title="Gỡ tệp đính kèm"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {aiError && (
                <div className="p-3 bg-rose-50 text-rose-800 border border-rose-200 rounded-xl text-xs font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{aiError}</span>
                </div>
              )}

              {/* 2 Nút Hành Động AI Chính */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2">
                <button
                  onClick={handleRunAiDiagnose}
                  disabled={isAiLoading || !selectedStudent}
                  className="py-3 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {isAiLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Đang chẩn đoán AI...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-amber-300" />
                      <span>Chẩn Đoán AI &amp; Lộ Trình Zalo</span>
                    </>
                  )}
                </button>

                <button
                  onClick={() => handleGenerateRemedialDocx()}
                  disabled={isDocxGenerating || !selectedStudent}
                  className="py-3 px-4 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {isDocxGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Đang xuất Word (.DOCX)...</span>
                    </>
                  ) : (
                    <>
                      <FileText className="w-4 h-4 text-sky-200" />
                      <span>Xuất Phiếu Bù Hổng (.DOCX MathType)</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Structured AI Results */}
          {aiResult && (
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-emerald-200 dark:border-emerald-800 shadow-md space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 flex-wrap gap-2">
                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                  <Sparkles className="w-5 h-5 text-amber-500" />
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Kết Quả Chẩn Đoán Lỗ Hổng Chuyên Đề: {selectedStudent?.full_name}
                  </h3>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopyParentSummary}
                    className="px-3 py-1.5 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:bg-sky-950 dark:text-sky-300 rounded-xl text-xs font-bold transition-all border border-sky-200 dark:border-sky-800 flex items-center gap-1"
                  >
                    {copiedParentSummary ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {copiedParentSummary
                        ? 'Đã copy Zalo & Lưu CRM!'
                        : 'Copy Lời Nhắn Zalo (Lưu CRM)'}
                    </span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                {/* Knowledge Gap */}
                <div className="p-4 bg-rose-50/60 dark:bg-rose-950/30 rounded-xl border border-rose-200 dark:border-rose-900/60">
                  <h4 className="font-bold text-rose-700 dark:text-rose-300 mb-1 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" />
                    <span>Lỗ Hổng Kiến Thức Qua Bài Kiểm Tra</span>
                  </h4>
                  <p className="text-slate-700 dark:text-slate-200 font-medium leading-relaxed">
                    {aiResult.knowledge_gap}
                  </p>
                </div>

                {/* Learning Trend */}
                <div className="p-4 bg-sky-50/60 dark:bg-sky-950/30 rounded-xl border border-sky-200 dark:border-sky-900/60">
                  <h4 className="font-bold text-sky-700 dark:text-sky-300 mb-1 flex items-center gap-1.5">
                    <BrainCircuit className="w-4 h-4" />
                    <span>Xu Hướng Phong Độ 2 Bài Kiểm Tra Gần Nhất</span>
                  </h4>
                  <p className="text-slate-700 dark:text-slate-200 font-medium leading-relaxed">
                    {aiResult.learning_trend}
                  </p>
                </div>

                {/* Actionable Advice */}
                <div className="p-4 bg-emerald-50/60 dark:bg-emerald-950/30 rounded-xl border border-emerald-200 dark:border-emerald-900/60">
                  <h4 className="font-bold text-emerald-700 dark:text-emerald-300 mb-1 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Lộ Trình Phụ Đạo &amp; Bài Tập Bù Hổng</span>
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
                    &ldquo;{aiResult.parent_summary}&rdquo;
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 2: GOM NHÓM HỌC SINH CÙNG HỔNG 1 CHUYÊN ĐỀ THEO LỚP (< 7.0Đ) */}
      {activeSubTab === 'class_gaps' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Users className="w-5 h-5 text-rose-600" />
                <span>
                  Bản Đồ Lỗ Hổng Theo Lớp &amp; Gom Nhóm Học Sinh Cùng Hổng Chuyên Đề (Điểm KT &lt; 7.0đ)
                </span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Tự động gom nhóm các học sinh đang yếu cùng một chuyên đề để Giáo viên xếp lịch phụ đạo nhóm, gửi Zalo lộ trình cho từng Phụ huynh (tự động lưu CRM) hoặc xuất chung 1 Phiếu Bài Tập Bù Hổng (.DOCX Cambria Math) cho cả nhóm.
              </p>
            </div>

            <span className="px-3 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-xs font-extrabold shrink-0">
              Phát hiện {classGapGroups.length} chuyên đề có học sinh dưới 7.0đ
            </span>
          </div>

          {isLoadingClassGaps ? (
            <div className="py-12 flex items-center justify-center text-xs text-slate-400 gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
              <span>Đang quét điểm kiểm tra và gom nhóm lỗ hổng chuyên đề của lớp...</span>
            </div>
          ) : classGapGroups.length === 0 ? (
            <div className="p-10 text-center bg-emerald-50/50 dark:bg-emerald-950/20 rounded-2xl border border-emerald-200 dark:border-emerald-900 space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
              <h4 className="text-sm font-bold text-emerald-900 dark:text-emerald-200">
                Tuyệt vời! Không có chuyên đề nào có học sinh dưới 7.0đ trong bộ lọc hiện tại
              </h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Tất cả học sinh đã kiểm tra trong lớp/khối này đều đạt từ 7.0đ trở lên ở các chuyên đề đã học.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {classGapGroups.map((group) => (
                <div
                  key={group.tagId}
                  className="p-5 rounded-2xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/80 space-y-4"
                >
                  <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 border-b border-slate-200/70 dark:border-slate-700 pb-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2.5 py-0.5 rounded-md bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 text-[11px] font-extrabold">
                          {group.gapStudents.length} học sinh cần phụ đạo (&lt; 7.0đ)
                        </span>
                        <span className="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-[10px] font-bold">
                          {group.category === 'Algebra' ? 'Đại số' : 'Hình học'} • Khối{' '}
                          {group.gradeLevel}
                        </span>
                        <span className="text-xs text-slate-500 font-semibold">
                          TB Kiểm tra cả lớp: <strong>{group.classAvg}đ</strong> (
                          {group.totalTestedStudents} HS đã KT)
                        </span>
                      </div>
                      <h4 className="text-sm font-black text-slate-900 dark:text-slate-100">
                        Chuyên đề: {group.tagName}
                      </h4>
                    </div>

                    <button
                      onClick={() =>
                        handleGenerateRemedialDocx({
                          customStudentNames: group.gapStudents.map((s) => s.studentName),
                          customWeakTopics: [group.tagName],
                          customClassName: group.gapStudents[0]?.className || 'Nhóm Phụ Đạo',
                          groupTagId: group.tagId,
                        })
                      }
                      disabled={generatingGroupTagId === group.tagId}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm shrink-0 disabled:opacity-60"
                    >
                      {generatingGroupTagId === group.tagId ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <FileText className="w-4 h-4" />
                      )}
                      <span>
                        {generatingGroupTagId === group.tagId
                          ? 'Đang tạo File Word...'
                          : `Xuất Phiếu Bù Hổng (.DOCX) Cho Nhóm ${group.gapStudents.length} HS`}
                      </span>
                    </button>
                  </div>

                  {/* Danh sách học sinh đang hổng chuyên đề này */}
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {group.gapStudents.map((st) => {
                      const copyKey = `${group.tagId}_${st.studentId}`;
                      const isCopied = copiedGroupStudentId === copyKey;
                      return (
                        <div
                          key={st.studentId}
                          className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col justify-between gap-3 shadow-xs"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <span className="font-bold text-slate-900 dark:text-slate-100 text-xs block">
                                {st.studentName}
                              </span>
                              <span className="text-[11px] text-slate-500">
                                Lớp: {st.className} • Đã làm {st.testCount} bài KT
                              </span>
                            </div>
                            <span
                              className={`px-2 py-0.5 rounded-lg font-mono font-extrabold text-xs ${
                                st.testAvgScore < 5.5
                                  ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                                  : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                              }`}
                            >
                              {st.testAvgScore}đ
                            </span>
                          </div>

                          <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                            <button
                              onClick={() => {
                                handleSelectStudent(st.studentId);
                                setActiveSubTab('radar');
                              }}
                              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1"
                            >
                              <BrainCircuit className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Xem Bản Đồ HS</span>
                            </button>

                            <button
                              onClick={() => handleCopyGroupStudentZalo(group, st)}
                              className="px-2.5 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300 border border-sky-200 dark:border-sky-800 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1"
                            >
                              {isCopied ? (
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <Send className="w-3.5 h-3.5" />
                              )}
                              <span>
                                {isCopied ? 'Đã copy & Lưu CRM' : 'Zalo Phụ Đạo (Lưu CRM)'}
                              </span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 3: CURRICULUM MANAGEMENT (QUẢN LÝ PHÂN PHỐI CHƯƠNG TRÌNH) */}
      {activeSubTab === 'curriculum' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-emerald-600" />
                <span>Quản Lý Phân Phối Chương Trình Môn Toán THCS</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Chuyên đề do giáo viên tự nhập, sửa hoặc xóa. Mọi chuyên đề được tạo sẽ đồng bộ tức thì sang Biểu đồ Radar và Bảng Gom Nhóm Lỗ Hổng.
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
                    <td
                      colSpan={5}
                      className="p-8 text-center text-slate-400 dark:text-slate-500"
                    >
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
                          <span className="text-slate-400 dark:text-slate-500 italic text-[11px]">
                            -
                          </span>
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

      {/* TOPIC DETAIL DRILLDOWN MODAL (100% ĐIỂM KIỂM TRA) */}
      {selectedTopicDetail && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-2xl w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-start justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-[10px] font-bold rounded-md">
                  {selectedTopicDetail.category === 'Algebra' ? 'Đại số' : 'Hình học'} • Lớp{' '}
                  {selectedTopicDetail.gradeLevel}
                </span>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mt-1">
                  Chuyên Đề: {selectedTopicDetail.fullTagName}
                </h3>
                <p className="text-xs text-slate-500">
                  Lịch sử 100% Điểm Kiểm Tra thực tế của{' '}
                  <strong className="text-emerald-600">{selectedStudent?.full_name}</strong>
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
                <span className="text-[10px] text-slate-500 font-bold block uppercase">
                  Điểm TB Kiểm Tra (100%)
                </span>
                <span className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5 block">
                  {selectedTopicDetail.studentScore} / 10đ
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 font-bold block uppercase">
                  Chuẩn TB Kiểm Tra Lớp
                </span>
                <span className="text-lg font-extrabold text-sky-600 dark:text-sky-400 mt-0.5 block">
                  {selectedTopicDetail.classAvg} / 10đ
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 font-bold block uppercase">
                  Số Bài Đã Kiểm Tra
                </span>
                <span className="text-lg font-extrabold text-slate-800 dark:text-slate-200 mt-0.5 block">
                  {selectedTopicDetail.sessionCount} bài KT
                </span>
              </div>
            </div>

            {/* History Table */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-slate-400" />
                <span>Chi tiết các bài kiểm tra đóng góp vào điểm chuyên đề:</span>
              </h4>

              {selectedTopicDetail.history.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                  Chưa ghi nhận bài kiểm tra nào của học sinh trong chuyên đề này.
                </div>
              ) : (
                <div className="max-h-60 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 text-[10px] font-bold uppercase border-b border-slate-200 dark:border-slate-700">
                        <th className="p-2.5">Ngày</th>
                        <th className="p-2.5">Buổi học / Đề kiểm tra</th>
                        <th className="p-2.5 text-center">Chuyên Cần</th>
                        <th className="p-2.5 text-center">BTVN (Tham khảo)</th>
                        <th className="p-2.5 text-center">Điểm Kiểm Tra (100%)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {selectedTopicDetail.history.map((h, hIdx) => (
                        <tr
                          key={hIdx}
                          className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30"
                        >
                          <td className="p-2.5 text-slate-500 font-mono text-[11px]">
                            {h.sessionDate}
                          </td>
                          <td className="p-2.5 font-medium text-slate-800 dark:text-slate-200">
                            {h.lessonTitle}
                          </td>
                          <td className="p-2.5 text-center text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                            {h.attendance}
                          </td>
                          <td className="p-2.5 text-center font-mono text-slate-500">
                            {h.homeworkScore !== undefined ? `${h.homeworkScore}đ` : '-'}
                          </td>
                          <td className="p-2.5 text-center font-extrabold font-mono text-emerald-600 dark:text-emerald-400">
                            {h.effectiveScore}đ
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => {
                  const topicName = selectedTopicDetail.fullTagName;
                  setSelectedTopicDetail(null);
                  handleGenerateRemedialDocx({
                    customWeakTopics: [topicName],
                  });
                }}
                className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Xuất Phiếu Bài Tập Bù Hổng (.DOCX) Chuyên Đề Này</span>
              </button>

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
