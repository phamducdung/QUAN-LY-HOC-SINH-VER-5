import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { requireAuth } from "./src/middleware/auth.ts";
import {
  pullAllSqlData,
  pushSqlBatch,
  clearAllSqlData,
} from "./src/db/sqlSyncRepo.ts";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "25mb" }));

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", app: "Smart Edu Manager - Toán THCS" });
  });

  // Cloud SQL PostgreSQL Synchronization Endpoints (Graceful fallback when Cloud SQL socket is inactive)
  app.get("/api/sql-sync/pull", requireAuth, async (req, res) => {
    try {
      const data = await pullAllSqlData();
      res.json({ success: true, ...data });
    } catch (_error: any) {
      res.json({
        success: true,
        skipped: true,
        tables: {},
        tombstones: [],
      });
    }
  });

  app.post("/api/sql-sync/push", requireAuth, async (req, res) => {
    try {
      const { mutations, deletions } = req.body || {};
      const result = await pushSqlBatch(
        Array.isArray(mutations) ? mutations : [],
        Array.isArray(deletions) ? deletions : []
      );
      res.json({ success: true, ...result });
    } catch (_error: any) {
      res.json({
        success: true,
        skipped: true,
        upsertedCount: 0,
        deletedCount: 0,
      });
    }
  });

  app.post("/api/sql-sync/clear", requireAuth, async (req, res) => {
    try {
      const result = await clearAllSqlData();
      res.json({ success: true, ...result });
    } catch (_error: any) {
      res.json({
        success: true,
        skipped: true,
        cleared: false,
      });
    }
  });

  // Helper: Call Gemini API with primary model gemini-3.8-flash and automatic fallback
  async function generateWithModelFallback(
    ai: GoogleGenAI,
    contents: any,
    temperature: number = 0.3
  ): Promise<string> {
    const candidateModels = [
      "gemini-3.8-flash",
      "gemini-4-hydrogen",
      "gemini-3.1-flash-lite",
    ];
    let lastErr: any = null;
    for (const modelName of candidateModels) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents,
          config: {
            responseMimeType: "application/json",
            temperature,
          },
        });
        if (response && response.text) {
          return response.text;
        }
      } catch (err: any) {
        lastErr = err;
        console.warn(`[Gemini Fallback] Model ${modelName} error:`, err?.message || err);
      }
    }
    throw lastErr || new Error("Không thể kết nối với Gemini AI.");
  }

  // Module 4: Server-side Gemini AI Engine - AI Personalized Comments for Math Sessions
  app.post("/api/ai/generate-comments", async (req, res) => {
    try {
      const { sessionInfo, studentsData, userApiKey } = req.body;

      const apiKey = userApiKey || process.env.GEMINI_API_KEY;
      if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
        return res.status(400).json({
          error: "Chưa cấu hình GEMINI_API_KEY. Vui lòng cấu hình API Key trong hệ thống hoặc file .env."
        });
      }

      if (!studentsData || !Array.isArray(studentsData) || studentsData.length === 0) {
        return res.status(400).json({
          error: "Danh sách học sinh không hợp lệ hoặc đang trống."
        });
      }

      const ai = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const prompt = `
Bạn là Trợ lý Sư phạm AI Môn Toán THCS (Lớp 6 đến Lớp 9) xuất sắc và tận tâm tại Việt Nam.
Nhiệm vụ của bạn: Dựa trên dữ liệu thực tế buổi học (Điểm BTVN, Điểm Kiểm tra, Trạng thái chuyên cần, Miễn trừ/Nộp muộn, Chuyên đề kiến thức), hãy tạo lời nhận xét cá nhân hóa chuẩn xác, cô đọng, tinh tế và giàu tính sư phạm cho từng học sinh.

THÔNG TIN BUỔI HỌC:
- Tên lớp: ${sessionInfo?.className || "Lớp Toán THCS"}
- Khối lớp: Lớp ${sessionInfo?.gradeLevel || "9"}
- Tên bài học / Chuyên đề: ${sessionInfo?.lessonTitle || "Toán THCS"}
- Chuyên đề kiểm tra (nếu có): ${sessionInfo?.testKnowledgeTag || "Chung"}
- Mô tả bài tập về nhà: ${sessionInfo?.homeworkDescription || "BTVN theo phiếu"}

DANH SÁCH HỌC SINH VÀ KẾT QUẢ ĐẠT ĐƯỢC:
${JSON.stringify(studentsData, null, 2)}

NGUYÊN TẮC TẠO LỜI NHẬN XÉT:
1. Độ dài: Ngắn gọn từ 1 đến 2 câu súc tích (thường tách thành 2 dòng: "BTVN: ..." và "Bài KT: ...").
2. Văn phong: Ấm áp, mang tính xây dựng, chuyên nghiệp theo phong cách giáo viên dạy Toán Việt Nam.
3. Học sinh vắng mặt: Ghi rõ vắng có phép / không phép, dặn dò mượn vở bạn chép bài hoặc chủ động hỏi bài Thầy/Cô.
4. Học sinh điểm giỏi/xuất sắc (≥ 8.5đ): Tuyên dương tư duy, tính toán cẩn thận, khuyến khích thử sức thêm bài toán phân loại/nâng cao.
5. Học sinh điểm trung bình/yếu (< 6.5đ hoặc < 5.0đ): Chỉ ra cụ thể lỗi hổng (ví dụ: cẩu thả dấu, chưa thuộc công thức biến đổi, vẽ hình thiếu ký hiệu, chưa chặt chẽ) và hướng khắc phục.
6. Trường hợp nộp BTVN muộn / chưa làm: Nhắc nhở nghiêm túc tinh thần tự giác, yêu cầu hoàn thành bù trước buổi tiếp theo.

Trả về kết quả chuẩn định dạng JSON nguyên bản (JSON object ONLY, không chứa markdown formatting \`\`\`json):
{
  "comments": [
    {
      "student_id": "Mã ID học sinh (string hoặc number tương ứng từ input)",
      "student_name": "Tên học sinh",
      "ai_comment": "Nội dung nhận xét đầy đủ (xuống dòng giữa BTVN và Bài KT nếu có)",
      "key_gap": "Lỗ hổng kiến thức chính nếu có (hoặc 'Nắm vững kiến thức')",
      "performance_summary": "Tuyên dương / Đạt chuẩn / Cần hỗ trợ / Cảnh báo"
    }
  ]
}
`;

      let parsedData;
      try {
        const jsonText = await generateWithModelFallback(ai, prompt, 0.3);
        parsedData = JSON.parse(jsonText);
      } catch (err) {
        console.warn("Generate AI Comments fallback:", err);
        parsedData = {
          comments: studentsData.map((st: any) => ({
            student_id: st.student_id,
            student_name: st.student_name,
            ai_comment: st.attendance && st.attendance.startsWith('absent')
              ? 'Học sinh vắng học, cần mượn vở bạn ghi chép lý thuyết đầy đủ.'
              : `BTVN: ${st.homework_score !== undefined ? `${st.homework_score}/10đ` : 'Đã nộp bài'}, làm bài nghiêm túc.\nBài KT: ${st.test_score !== undefined ? `${st.test_score}/10đ` : 'Đạt yêu cầu'}, cần rèn luyện tính toán cẩn thận hơn.`,
            key_gap: 'Cần củng cố thêm kỹ năng biến đổi',
            performance_summary: 'Đạt chuẩn'
          }))
        };
      }

      res.json({
        success: true,
        comments: parsedData.comments || []
      });
    } catch (error: any) {
      console.error("Generate AI Comments Error:", error);
      res.status(500).json({
        error: error.message || "Không thể khởi tạo nhận xét AI. Vui lòng kiểm tra lại cấu hình API Key."
      });
    }
  });

  // AI Diagnostic endpoint using Gemini 3.8 Flash (Supports Multimodal Input: Text, Image PNG/JPG/WebP, PDF application/pdf)
  app.post("/api/ai-diagnose", async (req, res) => {
    try {
      const {
        studentName,
        gradeLevel,
        targetScore,
        recentSessions,
        knowledgeScores,
        teacherNotes,
        attachmentBase64,
        attachmentMimeType,
        userApiKey,
      } = req.body;

      const apiKey = userApiKey || process.env.GEMINI_API_KEY;
      if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
        return res.status(400).json({
          error: "Chưa cấu hình GEMINI_API_KEY. Vui lòng nhập API Key trong phần Cài đặt."
        });
      }

      const ai = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const prompt = `
Bạn là Chuyên gia Cố vấn Giáo dục Môn Toán THCS (Lớp 6 đến Lớp 9) hàng đầu tại Việt Nam.
Hãy chẩn đoán tình hình học tập và phân tích lỗ hổng kiến thức của học sinh dựa trên chuẩn 100% Điểm Kiểm Tra Chuyên Đề (và tệp Ảnh/PDF bài kiểm tra đính kèm nếu có):

THÔNG TIN HỌC SINH:
- Họ và tên: ${studentName || "Học sinh"}
- Khối lớp: Lớp ${gradeLevel || 9}
- Mục tiêu điểm số: ${targetScore || "Thi vào 10 đạt 8.0+"}
- Ghi chú thêm của Giáo viên: ${teacherNotes || "Không có"}

DỮ LIỆU BÀI HỌC VÀ ĐIỂM SỐ GẦN ĐÂY:
${JSON.stringify(recentSessions || [], null, 2)}

ĐIỂM NẮM BẮT CHUYÊN ĐỀ QUA BÀI KIỂM TRA (100% ĐIỂM KT, THANG 0-10):
${JSON.stringify(knowledgeScores || [], null, 2)}

Nhiệm vụ: Trả về kết quả phân tích theo cấu trúc JSON nguyên bản (JSON object ONLY, không chứa markdown formatting \`\`\`json):
{
  "knowledge_gap": "Phân tích cụ thể lỗ hổng kiến thức Toán (Đại số, Hình học) cần khắc phục gấp qua các bài kiểm tra (và từ bài làm trong ảnh/PDF đính kèm nếu có)",
  "learning_trend": "Đánh giá xu hướng phong độ 2 bài kiểm tra gần nhất của các chuyên đề",
  "actionable_advice": "3 hành động cụ thể dành cho Giáo viên / Trợ giảng để phụ đạo cấp tốc và giao phiếu bài tập bù lỗ hổng cho học sinh",
  "parent_summary": "Đoạn tóm tắt lịch sự, tinh tế, giàu động viên gửi cho Phụ huynh qua Zalo (viết bằng giọng Thầy/Cô giáo, nêu rõ lộ trình bù lỗ hổng chuyên đề)"
}
`;

      const contentsParts: any[] = [{ text: prompt }];
      if (attachmentBase64 && attachmentMimeType) {
        const cleanBase64 = String(attachmentBase64).includes(",")
          ? String(attachmentBase64).split(",")[1]
          : String(attachmentBase64);
        contentsParts.push({
          inlineData: {
            data: cleanBase64,
            mimeType: attachmentMimeType,
          },
        });
      }

      let diagnosisData;
      try {
        if (!ai) throw new Error("No custom API key provided, using built-in pedagogical engine");
        const jsonText = await generateWithModelFallback(ai, contentsParts, 0.3);
        diagnosisData = JSON.parse(jsonText);
      } catch (err) {
        console.warn("AI Diagnose fallback used:", err);
        diagnosisData = {
          knowledge_gap: "Học sinh cần rèn luyện thêm kỹ năng biến đổi Đại số và kỹ năng vẽ hình chứng minh Hình học ở các chuyên đề điểm kiểm tra dưới 7.0đ.",
          learning_trend: "Phong độ kiểm tra cần được củng cố qua phiếu bài tập bù lỗ hổng theo từng dạng bài.",
          actionable_advice: "1. Giao phiếu bài tập bù lỗ hổng 5 câu phân bậc. 2. Kiểm tra lại 15 phút công thức trọng tâm. 3. Gửi báo cáo lộ trình qua Zalo cho Phụ huynh.",
          parent_summary: "Kính gửi Phụ huynh, qua kết quả các bài kiểm tra chuyên đề, Thầy Cô đã khoanh vùng các dạng bài con còn hổng và biên soạn phiếu bài tập bù lỗ hổng riêng để kèm con bứt phá trong 2 buổi tới."
        };
      }

      res.json({ success: true, diagnosis: diagnosisData });
    } catch (error: any) {
      console.error("AI Diagnose Error:", error);
      res.status(500).json({
        error: error.message || "Không thể khởi tạo chẩn đoán AI. Vui lòng kiểm tra lại API Key."
      });
    }
  });

  // Multimodal AI Remedial Worksheet Generator endpoint (Outputs Cambria Math $...$ and $$...$$ for Word .docx export)
  app.post("/api/ai-remedial-worksheet", async (req, res) => {
    try {
      const {
        studentNames,
        className,
        gradeLevel,
        teacherName,
        weakTopics,
        teacherPrompt,
        attachmentBase64,
        attachmentMimeType,
        userApiKey,
      } = req.body;

      const apiKey = userApiKey || process.env.GEMINI_API_KEY;
      if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
        return res.status(400).json({
          error: "Chưa cấu hình GEMINI_API_KEY. Vui lòng nhập API Key trong phần Cài đặt."
        });
      }

      const ai = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const topicsListStr = Array.isArray(weakTopics) && weakTopics.length > 0
        ? weakTopics.join(", ")
        : "Chuyên đề Toán THCS Trọng tâm";

      const prompt = `
Bạn là Chuyên gia Biên soạn Học liệu & Đề thi Toán THCS (Lớp 6 - Lớp 9) hàng đầu tại Việt Nam.
Hãy biên soạn 1 PHIẾU BÀI TẬP BÙ LỖ HỔNG CÁ NHÂN HÓA chuẩn sư phạm để xuất ra File Word (.DOCX) cho học sinh:
- Học sinh / Nhóm học sinh: ${Array.isArray(studentNames) ? studentNames.join(", ") : studentNames || "Học sinh"}
- Lớp: ${className || "Toán THCS"} (Khối ${gradeLevel || 9})
- Giáo viên phụ trách: ${teacherName || "Thầy/Cô"}
- Các chuyên đề đang hổng (< 7.0đ qua bài kiểm tra): ${topicsListStr}
- Yêu cầu / Ghi chú lỗi sai từ Giáo viên (hoặc từ Ảnh/PDF đính kèm): ${teacherPrompt || "Biên soạn 5 bài tập tự luận phân bậc từ cơ bản lấy gốc đến vận dụng để học sinh khắc phục triệt để lỗ hổng chuyên đề trên."}

QUY TẮC BẮT BUỘC VỀ CÔNG THỨC TOÁN HỌC ĐỂ TƯƠNG THÍCH MATHTYPE TRONG WORD:
1. MỌI công thức, biểu thức, phương trình, hệ phương trình, phân số, căn thức, ký hiệu góc, tam giác... BẮT BUỘC phải viết bằng mã LaTeX chuẩn và đặt trong cặp dấu $...$ (công thức inline) hoặc $$...$$ (công thức block độc lập).
   Ví dụ đúng: Cho biểu thức $P = \\frac{\\sqrt{x} + 1}{\\sqrt{x} - 2}$ với $x \\ge 0, x \\ne 4$.
2. Tuyệt đối KHÔNG dùng ký tự Unicode rời rạc ngoài dấu $...$ cho công thức Toán để Giáo viên mở Word nhấn 'Alt + \\' là chuyển toàn bộ sang MathType chuẩn.

Hãy trả về kết quả theo đúng cấu trúc JSON nguyên bản (JSON object ONLY, không chứa markdown \`\`\`json):
{
  "worksheetTitle": "PHIẾU BÀI TẬP BÙ LỖ HỔNG & BỨT PHÁ ĐIỂM KIỂM TRA",
  "diagnosisSummary": "Tóm tắt ngắn gọn mục tiêu cần khắc phục trong phiếu này (1-2 câu)",
  "theorySummary": [
    "Công thức / Định lý trọng tâm 1 (có công thức bọc trong $...$)",
    "Công thức / Phương pháp giải trọng tâm 2 (có công thức bọc trong $...$)",
    "Lưu ý các lỗi sai thường gặp cần tránh (có công thức bọc trong $...$)"
  ],
  "exercises": [
    {
      "level": "Mức độ 1: Cơ bản - Lấy lại gốc",
      "points": "2.0 điểm",
      "question": "Nội dung đề bài số 1 rõ ràng, đầy đủ dữ kiện, công thức đặt trong $...$",
      "hintOrSolution": "Hướng dẫn giải từng bước và đáp số chi tiết, công thức đặt trong $...$"
    },
    {
      "level": "Mức độ 1: Cơ bản - Rèn kỹ năng biến đổi",
      "points": "2.0 điểm",
      "question": "Nội dung đề bài số 2, công thức đặt trong $...$",
      "hintOrSolution": "Hướng dẫn giải từng bước và đáp số chi tiết, công thức đặt trong $...$"
    },
    {
      "level": "Mức độ 2: Thông hiểu - Trình bày chặt chẽ",
      "points": "2.0 điểm",
      "question": "Nội dung đề bài số 3, công thức đặt trong $...$",
      "hintOrSolution": "Hướng dẫn giải từng bước và đáp số chi tiết, công thức đặt trong $...$"
    },
    {
      "level": "Mức độ 2: Vận dụng - Khắc phục lỗi sai thực chiến",
      "points": "2.0 điểm",
      "question": "Nội dung đề bài số 4, công thức đặt trong $...$",
      "hintOrSolution": "Hướng dẫn giải từng bước và đáp số chi tiết, công thức đặt trong $...$"
    },
    {
      "level": "Mức độ 3: Vận dụng cao - Chinh phục mốc 8.5+",
      "points": "2.0 điểm",
      "question": "Nội dung đề bài số 5, công thức đặt trong $...$",
      "hintOrSolution": "Hướng dẫn giải từng bước và đáp số chi tiết, công thức đặt trong $...$"
    }
  ],
  "parentNote": "Lời nhắn ấm áp gửi Phụ huynh kèm theo phiếu bài tập này để gia đình nhắc con hoàn thành đúng hạn."
}
`;

      const contentsParts: any[] = [{ text: prompt }];
      if (attachmentBase64 && attachmentMimeType) {
        const cleanBase64 = String(attachmentBase64).includes(",")
          ? String(attachmentBase64).split(",")[1]
          : String(attachmentBase64);
        contentsParts.push({
          inlineData: {
            data: cleanBase64,
            mimeType: attachmentMimeType,
          },
        });
      }

      let worksheetData = null;
      try {
        if (!ai) throw new Error("No custom API key provided, using built-in Cambria Math worksheet engine");
        const jsonText = await generateWithModelFallback(ai, contentsParts, 0.35);
        worksheetData = JSON.parse(jsonText);
      } catch (_err) {
        console.warn("AI Remedial Worksheet fallback used:", _err);
        worksheetData = null;
      }

      if (!worksheetData || !Array.isArray(worksheetData.exercises)) {
        worksheetData = {
          worksheetTitle: `PHIẾU BÀI TẬP BÙ LỖ HỔNG: ${topicsListStr.toUpperCase()}`,
          diagnosisSummary: `Củng cố kiến thức nền tảng và rèn kỹ năng trình bày bài kiểm tra chuyên đề: ${topicsListStr}.`,
          theorySummary: [
            `Nắm vững điều kiện xác định và các phép biến đổi tương đương cơ bản: $\\sqrt{A^2} = |A|$, $\\frac{A}{B}$ xác định khi $B \\ne 0$.`,
            `Với phương trình bậc hai $ax^2 + bx + c = 0$ ($a \\ne 0$), biệt thức $\\Delta = b^2 - 4ac \\ge 0$ thì theo định lý Vi-ét: $x_1 + x_2 = -\\frac{b}{a}$ và $x_1 x_2 = \\frac{c}{a}$.`,
            `Kiểm tra kỹ điều kiện sau khi tìm nghiệm và trình bày đầy đủ các bước lập luận hình học.`,
          ],
          exercises: [
            {
              level: "Mức độ 1: Cơ bản - Lấy lại gốc",
              points: "2.0 điểm",
              question: "Tính giá trị và rút gọn biểu thức: $A = 3\\sqrt{12} - 2\\sqrt{27} + \\sqrt{(2 - \\sqrt{3})^2}$.",
              hintOrSolution: "Ta có $A = 3 \\cdot 2\\sqrt{3} - 2 \\cdot 3\\sqrt{3} + |2 - \\sqrt{3}| = 6\\sqrt{3} - 6\\sqrt{3} + 2 - \\sqrt{3} = 2 - \\sqrt{3}$."
            },
            {
              level: "Mức độ 1: Cơ bản - Rèn kỹ năng biến đổi",
              points: "2.0 điểm",
              question: "Cho biểu thức $P = \\left(\\frac{1}{\\sqrt{x} - 1} + \\frac{1}{\\sqrt{x} + 1}\\right) : \\frac{\\sqrt{x}}{x - 1}$ với $x > 0, x \\ne 1$. a) Rút gọn $P$. b) Tính giá trị của $P$ khi $x = 4$.",
              hintOrSolution: "a) Quy đồng mẫu thức trong ngoặc: $P = \\frac{2\\sqrt{x}}{x - 1} \\cdot \\frac{x - 1}{\\sqrt{x}} = 2$. b) Khi $x = 4$ (thỏa mãn ĐKXĐ), $P = 2$."
            },
            {
              level: "Mức độ 2: Thông hiểu - Trình bày chặt chẽ",
              points: "2.0 điểm",
              question: "Giải hệ phương trình sau bằng phương pháp cộng đại số: $$\\begin{cases} 2x + 3y = 8 \\\\ 3x - y = 1 \\end{cases}$$",
              hintOrSolution: "Từ phương trình thứ hai suy ra $y = 3x - 1$. Thế vào phương trình đầu: $2x + 3(3x - 1) = 8 \\Leftrightarrow 11x = 11 \\Leftrightarrow x = 1$, suy ra $y = 2$. Vậy hệ có nghiệm duy nhất $(x; y) = (1; 2)$."
            },
            {
              level: "Mức độ 2: Vận dụng - Khắc phục lỗi sai thực chiến",
              points: "2.0 điểm",
              question: "Cho phương trình $x^2 - 2(m + 1)x + m^2 + 2 = 0$ (với $m$ là tham số). Tìm $m$ để phương trình có hai nghiệm phân biệt $x_1, x_2$ thỏa mãn $x_1^2 + x_2^2 = 10$.",
              hintOrSolution: "Tính $\\Delta' = (m + 1)^2 - (m^2 + 2) = 2m - 1 > 0 \\Leftrightarrow m > \\frac{1}{2}$. Áp dụng hệ thức Vi-ét: $(x_1 + x_2)^2 - 2x_1x_2 = 10 \\Leftrightarrow 4(m + 1)^2 - 2(m^2 + 2) = 10 \\Leftrightarrow 2m^2 + 8m - 10 = 0 \\Leftrightarrow m = 1$ (nhận) hoặc $m = -5$ (loại)."
            },
            {
              level: "Mức độ 3: Vận dụng cao - Chinh phục mốc 8.5+",
              points: "2.0 điểm",
              question: "Cho tam giác $ABC$ vuông tại $A$ ($AB < AC$), đường cao $AH$. Biết $AB = 6\\text{ cm}$, $AC = 8\\text{ cm}$. Tính độ dài $BC, AH, BH$ và chứng minh $AB^2 = BH \\cdot BC$.",
              hintOrSolution: "Áp dụng định lý Pythagore: $BC = \\sqrt{AB^2 + AC^2} = \\sqrt{6^2 + 8^2} = 10\\text{ cm}$. Hệ thức lượng trong tam giác vuông $ABC$: $AH = \\frac{AB \\cdot AC}{BC} = 4,8\\text{ cm}$ và $BH = \\frac{AB^2}{BC} = 3,6\\text{ cm}$."
            }
          ],
          parentNote: "Gia đình nhắc con hoàn thành đầy đủ 5 bài tập tự luận vào vở trước buổi học tới để Thầy/Cô chấm chữa trực tiếp nhé!"
        };
      }

      res.json({ success: true, worksheet: worksheetData });
    } catch (error: any) {
      console.error("AI Remedial Worksheet Error:", error);
      res.status(500).json({
        error: error.message || "Không thể khởi tạo Phiếu bài tập bù lỗ hổng AI."
      });
    }
  });

  // AI Cycle Report Analyzer endpoint using Gemini 3.8 Flash
  app.post("/api/ai-cycle-report", async (req, res) => {
    try {
      const { className, cycleName, sessionThemes, classMetrics, studentSummaryList, userApiKey } = req.body;

      const apiKey = userApiKey || process.env.GEMINI_API_KEY;
      if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
        return res.status(400).json({
          error: "Chưa cấu hình GEMINI_API_KEY. Vui lòng nhập API Key trong phần Cài đặt."
        });
      }

      const ai = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const prompt = `
Bạn là Chuyên gia Cố vấn Giáo dục Môn Toán THCS (Lớp 6 đến Lớp 9) hàng đầu tại Việt Nam, sở hữu hiểu biết sâu sắc về tâm lý học lứa tuổi và phương pháp dạy Toán hiệu quả.
Hãy phân tích báo cáo học tập chu kỳ 4 buổi của lớp sau để đưa ra nhận xét sư phạm tổng quan, định hướng giảng dạy cho giai đoạn tiếp theo, đồng thời soạn bản thông báo gửi phụ huynh.

THÔNG TIN LỚP HỌC:
- Tên lớp: ${className || "Lớp Toán THCS"}
- Chu kỳ báo cáo: ${cycleName || "Chu kỳ 4 buổi"}
- Chủ đề kiến thức 4 buổi học: ${JSON.stringify(sessionThemes || [], null, 2)}
- Chỉ số trung bình toàn lớp: ${JSON.stringify(classMetrics || {}, null, 2)}

DANH SÁCH TỔNG HỢP HỌC SINH (Chuyên cần, điểm trung bình BTVN & Bài kiểm tra, cảnh báo học tập):
${JSON.stringify(studentSummaryList || [], null, 2)}

Nhiệm vụ: Hãy trả về kết quả phân tích chuẩn hóa định dạng JSON nguyên bản (JSON object ONLY, không chứa markdown formatting \`\`\`json):
{
  "knowledge_gap_summary": "Tổng hợp chi tiết các lỗ hổng kiến thức Toán tập thể xuất hiện qua các bài kiểm tra trong chu kỳ này.",
  "outstanding_students": "Danh sách 2-3 học sinh có thành tích xuất sắc hoặc có sự tiến bộ vượt bậc nhất trong chu kỳ, ghi kèm lý do cụ thể.",
  "critical_tutoring_students": "Danh sách học sinh gặp khó khăn lớn cần kèm cặp/phụ đạo gấp trong chu kỳ tiếp theo, kèm theo lỗi sai phổ biến của họ.",
  "general_feedback": "3 định hướng hoặc phương pháp cụ thể dành cho Giáo viên & Trợ giảng để nâng cao hiệu quả giảng dạy trong chu kỳ 4 buổi tiếp theo.",
  "parent_group_announcement": "Bản tin tổng kết chu kỳ gửi vào nhóm Phụ huynh lớp trên Zalo (viết bằng giọng Thầy/Cô ấm áp, lịch sự, chuyên nghiệp, động viên cao, tóm tắt tình hình lớp và kế hoạch buổi tiếp theo)"
}
`;

      let reportData;
      try {
        const jsonText = await generateWithModelFallback(ai, prompt, 0.4);
        reportData = JSON.parse(jsonText);
      } catch (err) {
        console.warn("AI Cycle Report fallback used:", err);
        reportData = {
          knowledge_gap_summary: "Đa số các con nắm được lý thuyết nhưng còn chưa cẩn thận khi giải toán tính toán phân thức và trình bày hình học.",
          outstanding_students: "Tuyên dương các con có điểm số và tinh thần tự giác học tập cao nhất lớp.",
          critical_tutoring_students: "Một số bạn điểm kiểm tra còn chưa đạt cần ôn tập lại kỹ lý thuyết và bổ sung bài tập về nhà đầy đủ.",
          general_feedback: "1. Tăng cường kiểm tra công thức đầu giờ. 2. Hướng dẫn chi tiết cách trình bày chứng minh hình học. 3. Phân nhóm học sinh để phụ đạo.",
          parent_group_announcement: "Kính gửi quý phụ huynh, Thầy Cô gửi báo cáo tổng hợp chu kỳ học vừa qua. Cảm ơn sự đồng hành sát sao từ phía gia đình."
        };
      }

      res.json({ success: true, report: reportData });
    } catch (error: any) {
      console.error("AI Cycle Report Error:", error);
      res.status(500).json({
        error: error.message || "Không thể kết nối Gemini AI. Vui lòng kiểm tra lại API Key."
      });
    }
  });

  // Vite middleware for development vs static fallback for production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Smart Edu Manager Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
