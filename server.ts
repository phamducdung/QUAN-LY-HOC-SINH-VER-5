import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", app: "Smart Edu Manager - Toán THCS" });
  });

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

      const response = await ai.models.generateContent({
        model: "gemini-3.7-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          temperature: 0.3,
        }
      });

      const jsonText = response.text || "{}";
      let parsedData;
      try {
        parsedData = JSON.parse(jsonText);
      } catch (err) {
        console.error("JSON parse error from Gemini:", err);
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

  // AI Diagnostic endpoint using Gemini 3.6 Flash
  app.post("/api/ai-diagnose", async (req, res) => {
    try {
      const { studentName, gradeLevel, targetScore, recentSessions, knowledgeScores, userApiKey } = req.body;

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
Hãy chẩn đoán tình hình học tập và phân tích lỗ hổng kiến thức của học sinh sau:

THÔNG TIN HỌC SINH:
- Họ và tên: ${studentName || "Học sinh"}
- Khối lớp: Lớp ${gradeLevel || 9}
- Mục tiêu điểm số: ${targetScore || "Thi vào 10 đạt 8.0+"}

DỮ LIỆU BÀI HỌC VÀ ĐIỂM SỐ GẦN ĐÂY:
${JSON.stringify(recentSessions || [], null, 2)}

ĐIỂM NẮM BẮT CHUYÊN ĐỀ (0-10):
${JSON.stringify(knowledgeScores || [], null, 2)}

Nhiệm vụ: Trả về kết quả phân tích theo cấu trúc JSON nguyên bản (JSON object ONLY, không chứa markdown formatting \`\`\`json):
{
  "knowledge_gap": "Phân tích cụ thể lỗ hổng kiến thức Toán (Đại số, Hình học) cần khắc phục gấp",
  "learning_trend": "Đánh giá xu hướng phong độ (Tiến bộ, Sa sút, Thất thường, Ổn định) và thái độ làm BTVN",
  "actionable_advice": "3 hành động cụ thể dành cho Giáo viên / Trợ giảng để phụ đạo cấp tốc cho học sinh",
  "parent_summary": "Đoạn tóm tắt lịch sự, tinh tế, giàu động viên gửi cho Phụ huynh qua Zalo/SĐT (viết bằng giọng Thầy/Cô giáo)"
}
`;

      const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          temperature: 0.3,
        }
      });

      const jsonText = response.text || "{}";
      let diagnosisData;
      try {
        diagnosisData = JSON.parse(jsonText);
      } catch (err) {
        diagnosisData = {
          knowledge_gap: "Học sinh cần rèn luyện thêm kỹ năng biến đổi Đại số và kỹ năng vẽ hình chứng minh Tứ giác nội tiếp.",
          learning_trend: "Phong độ có dấu hiệu biến động ở các bài kiểm tra áp lực thời gian.",
          actionable_advice: "1. Cho làm lại 5 câu bài tập Căn thức. 2. Kiểm tra trực tiếp công thức Hình học trước buổi học. 3. Nhắc nhở nộp BTVN đúng hạn.",
          parent_summary: "Kính gửi Phụ huynh, con nắm khá tốt kiến thức lý thuyết cơ bản. Thầy Cô sẽ tăng cường hỗ trợ con bài tập vận dụng để con tự tin đạt mục tiêu đề ra."
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

  // AI Cycle Report Analyzer endpoint using Gemini 3.6 Flash
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

      const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          temperature: 0.4,
        }
      });

      const jsonText = response.text || "{}";
      let reportData;
      try {
        reportData = JSON.parse(jsonText);
      } catch (err) {
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
