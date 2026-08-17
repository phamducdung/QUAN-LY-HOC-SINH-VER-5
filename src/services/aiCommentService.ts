import { Session, Student, StudentSession } from '../types';

export interface GeneratedAIComment {
  student_id: string | number;
  student_name: string;
  ai_comment: string;
  key_gap?: string;
  performance_summary?: string;
}

export interface GenerateCommentsParams {
  sessionInfo: {
    className: string;
    gradeLevel: number | string;
    lessonTitle: string;
    testKnowledgeTag?: string;
    homeworkDescription?: string;
  };
  studentsData: Array<{
    student_id: string | number;
    student_name: string;
    attendance: string;
    homework_submitted?: boolean;
    homework_score?: number;
    exempt_homework?: boolean;
    late_submit?: boolean;
    test_score?: number;
    exempt_test?: boolean;
    makeup_test?: boolean;
    existing_comment?: string;
  }>;
  userApiKey?: string;
}

/**
 * Gọi Server-side API /api/ai/generate-comments để sinh nhận xét cá nhân hóa bằng Gemini 3.7 Flash
 */
export async function generateAICommentsForSession(
  params: GenerateCommentsParams
): Promise<{ success: boolean; comments: GeneratedAIComment[]; error?: string }> {
  try {
    const response = await fetch('/api/ai/generate-comments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Không thể tạo nhận xét bằng AI.');
    }

    return {
      success: true,
      comments: data.comments || [],
    };
  } catch (error: any) {
    console.error('Error generating AI comments:', error);
    return {
      success: false,
      comments: [],
      error: error.message || 'Lỗi kết nối máy chủ khi tạo nhận xét AI.',
    };
  }
}

/**
 * Tạo nhận xét cho 1 học sinh duy nhất
 */
export async function generateSingleAIComment(
  session: Session,
  className: string,
  gradeLevel: number | string,
  student: Student,
  studentSession: StudentSession,
  userApiKey?: string
): Promise<{ success: boolean; comment?: string; error?: string }> {
  const params: GenerateCommentsParams = {
    sessionInfo: {
      className,
      gradeLevel,
      lessonTitle: session.lesson_title,
      testKnowledgeTag: session.test_knowledge_tag,
      homeworkDescription: session.homework_description,
    },
    studentsData: [
      {
        student_id: student.id!,
        student_name: student.full_name,
        attendance: studentSession.attendance,
        homework_submitted: studentSession.homework_submitted,
        homework_score: studentSession.homework_score,
        exempt_homework: studentSession.exempt || studentSession.exempt_homework,
        late_submit: studentSession.late_submit,
        test_score: studentSession.test_score,
        exempt_test: studentSession.exempt || studentSession.exempt_test,
        makeup_test: studentSession.makeup_test,
        existing_comment: studentSession.custom_comment,
      },
    ],
    userApiKey,
  };

  const res = await generateAICommentsForSession(params);
  if (res.success && res.comments.length > 0) {
    return {
      success: true,
      comment: res.comments[0].ai_comment,
    };
  }
  return {
    success: false,
    error: res.error || 'Không nhận được phản hồi từ AI.',
  };
}
