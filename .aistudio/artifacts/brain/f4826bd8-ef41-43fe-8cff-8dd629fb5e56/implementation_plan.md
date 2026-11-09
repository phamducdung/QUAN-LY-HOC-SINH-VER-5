# Kế Hoạch Chuyển Đổi Cơ Sở Dữ Liệu Sang SQL (PostgreSQL) — Không Giới Hạn Lượt Đọc/Ghi

## 1. Mục Tiêu Nâng Cấp
Chuyển đổi tầng lưu trữ đám mây từ **Firebase Firestore (giới hạn 20.000 lượt ghi/ngày)** sang **Cơ sở dữ liệu quan hệ PostgreSQL (Cloud SQL + Drizzle ORM)** kết hợp **IndexedDB (Dexie.js)** tại trình duyệt:
- **Không giới hạn số lượt đọc/ghi mỗi ngày**: Cơ sở dữ liệu SQL tính theo dung lượng lưu trữ thay vì đếm từng dòng điểm số (`student_sessions`), giúp Thầy/Cô thoải mái nhập điểm cho hàng chục lớp, hàng nghìn buổi học mà không bao giờ gặp lỗi `Quota limit exceeded`.
- **Chuẩn quan hệ khóa ngoại (Foreign Keys) chặt chẽ**: Đảm bảo liên kết giữa Lớp học (`classes`) – Học sinh (`students`) – Phân lớp (`class_students`) – Buổi học (`sessions`) – Điểm số (`student_sessions`) không bao giờ bị lệch hoặc mất liên kết khi triển khai lại.
- **Tối ưu hóa bảng Nhật ký thao tác (`audit_logs`)**: Chỉ lưu các bản chụp khôi phục điểm (Snapshot) gần nhất để giữ cơ sở dữ liệu luôn nhẹ và tốc độ đồng bộ tức thì.

---

## 2. Kiến Trúc Cơ Sở Dữ Liệu SQL (PostgreSQL + Drizzle ORM)

### 2.1. Sơ đồ bảng quan hệ (`src/db/schema.ts`)
Thiết kế 12 bảng chuẩn hóa trên PostgreSQL đồng bộ 1-1 với cấu trúc ứng dụng:
1. **`users`**: Lưu tài khoản Giáo viên & Trợ giảng (`uid`, `email`, `role`, `created_at`).
2. **`school_years`**: Năm học (`id` khóa chuẩn `sy_...`, `name`, `is_active`).
3. **`classes`**: Lớp học (`id`, `school_year_id`, `class_name`, `class_type`, `grade_level`, `target_description`, `schedule`, `assistant_name`, `assistant_phone`, `status`).
4. **`students`**: Hồ sơ học sinh (`id`, `full_name`, `gender`, `parent_name`, `parent_phone`, `status`, `leave_reason`, `note`).
5. **`class_students`**: Bảng nối Phân lớp học sinh (`id` khóa chuẩn `cs_${class_id}_${student_id}`, `class_id`, `student_id`, `join_date`, `leave_date`).
6. **`sessions`**: Buổi dạy học (`id`, `class_id`, `session_date`, `lesson_title`, `knowledge_tag_id`, `test_max_score`).
7. **`student_sessions`**: Điểm danh & Điểm số từng buổi (`id` khóa chuẩn `ss_${session_id}_${student_id}`, `session_id`, `student_id`, `attendance`, `homework_score`, `test_score`, `custom_comment`, các cờ miễn/nộp muộn).
8. **`knowledge_tags`** & **`knowledge_results`**: Chuyên đề Toán THCS & Độ thành thạo (`kr_${student_id}_${knowledge_tag_id}`).
9. **`warnings`** & **`ai_diagnoses`**: Cảnh báo học tập P1/P2/P3 & Kết quả chẩn đoán AI.
10. **`audit_logs`** & **`deleted_records`**: Nhật ký thao tác (tự động giữ 100 bản ghi mới nhất có kèm Snapshot hoàn tác điểm) và bảng đối soát xóa (Tombstone).

---

## 3. Lộ Trình Triển Khai Kỹ Thuật

### Bước 1: Khởi tạo PostgreSQL (Cloud SQL) & Xác thực
- Kiểm tra điều kiện & cấp phát thực thể **Cloud SQL for PostgreSQL** qua công cụ tích hợp của hệ thống.
- Cấu hình kết nối `pg.Pool` (`src/db/index.ts`) và `src/db/drizzle.config.ts` với Drizzle ORM.

### Bước 2: Xây dựng API Đồng bộ Hàng loạt (`server.ts`)
- Tạo các cổng API RESTful tốc độ cao trên Express server:
  - `GET /api/sql-sync/pull`: Kéo toàn bộ dữ liệu mới nhất và danh sách xóa (`deleted_records`) từ PostgreSQL về trình duyệt trong **1 yêu cầu HTTP duy nhất**.
  - `POST /api/sql-sync/push`: Nhận toàn bộ thay đổi từ Hàng đợi Outbox và thực hiện lệnh `INSERT ... ON CONFLICT DO UPDATE (Upsert)` theo lô (Batch Transaction) vào PostgreSQL chỉ trong vài chục mili-giây.

### Bước 3: Di trú tự động 100% dữ liệu hiện có sang SQL
- Ngay lần đầu tiên kết nối SQL, hệ thống tự động đọc toàn bộ dữ liệu Lớp học, Học sinh, Phân lớp (`class_students`), Điểm số (`student_sessions`) đang có trên máy và trên Firebase cũ để **đổ tự động sang PostgreSQL** mà Thầy/Cô không phải nhập lại bất kỳ dữ liệu nào.
- Chạy bộ đối soát `recoverMissingClassEnrollments()` để khôi phục đầy đủ danh sách học sinh trong từng lớp.
