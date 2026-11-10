# Kế Hoạch Chia Nhỏ Kiểm Tra & Khắc Phục Triệt Để Từng Tính Năng (6 Module)

## 1. Chẩn Đoán Nguyên Nhân Gốc Rễ Gây Treo Đơ Toàn Hệ Thống

Qua việc rà soát trực tiếp mã nguồn của từng tính năng và đối chiếu với hiện tượng Thầy/Cô gặp phải trên cả **AI Studio** và **Vercel (`quan-ly-hoc-sinh-ver-5.vercel.app`)**, có **4 nguyên nhân kỹ thuật trực tiếp** làm đơ luồng xử lý chính (Main Thread) của trình duyệt:

1. **Bão đồng bộ ngược từ bộ nhớ đệm IndexedDB cũ trên trình duyệt (`syncService.ts`)**:
   - Trình duyệt của Thầy/Cô vẫn đang lưu khoảng **2.500 bản ghi cũ/trùng lặp** trong IndexedDB (`SmartEduMathDatabase`) và `localStorage` (`smart_edu_sync_outbox_v2`, `smart_edu_tombstones_v2`).
   - Khi hàm `pullAllFromSupabase()` chạy, đoạn mã `existingList.forEach` phát hiện hàng nghìn bản ghi cũ dưới máy không khớp với dữ liệu chuẩn trên Supabase và gọi `enqueueSyncOperation()` lặp lại hàng nghìn lần.
   - Mỗi lần gọi `enqueueSyncOperation()` lại ghi đồng bộ `localStorage.setItem` (`persistOutbox()`) và phát sự kiện cập nhật React (`updateSyncStatus()`) ngay trong vòng lặp, đồng thời kích hoạt ngược kênh `postgres_changes` của Supabase, làm **treo cứng toàn bộ trình duyệt (`Page Unresponsive`)** và khiến việc bấm chuyển menu bên trái không phản hồi.
2. **Xung đột chạy kép lúc khởi động (`dexie.ts` & `syncService.ts`)**:
   - Khi mở ứng dụng, `initializeDefaultSystemData()` gọi `cleanDuplicateStudentSessions()` (`kaizenDeduplicateAndMerge()`) cùng lúc với `initRealtimeSync()` gọi `pullAllFromSupabase()`, gây khóa chéo (deadlock/race condition) các bảng IndexedDB khi Thầy/Cô thao tác.
3. **Lỗi tham chiếu mảng mới liên tục `useLiveQuery(...) || []` ở các tab menu**:
   - Trong `Dashboard.tsx`, `ClassManagement.tsx`, `StudentRoster.tsx`, `GradebookView.tsx` và `SessionHistoryModal.tsx`, cú pháp `useLiveQuery(...) || []` tạo ra một mảng `[]` mới ở mỗi chu kỳ render khi IndexedDB đang bận, ép các hook `useMemo` tính toán lại liên tục khi bấm chuyển tab.
4. **Lệch kiểu dữ liệu ID (`string` vs `number`) và bất đồng bộ khi Thêm/Sửa/Xóa ở Quản lý Lớp, Học sinh & Nhập điểm**:
   - Một số truy vấn `.where('class_id').equals(...)` hoặc `.find(c => c.id === selectedClassId)` so sánh tuyệt đối mà không ép kiểu `String(...)`, khiến việc chọn lớp/buổi học hoặc xóa/sửa dữ liệu bị trượt ID hoặc không cập nhật tức thì lên Supabase.

---

## 2. Phương Án Kiểm Tra & Khắc Phục Chia Nhỏ Theo 6 Module

### Module 1: Khởi Tạo Hệ Thống, Dọn Sạch Cache Cũ & Đồng Bộ Supabase (`src/services/syncService.ts`, `src/db/dexie.ts`)
- **Cơ chế Tự động Làm sạch Cache một lần (`SMART_EDU_SUPABASE_SYNC_VERSION = 'v5_supabase_clean_reset'`)**:
  - Ngay khi khởi động ứng dụng trên trình duyệt (cả AI Studio và Vercel), nếu phát hiện trình duyệt chưa chạy cờ `v5_supabase_clean_reset`, hệ thống tự động xóa sạch `outboxMap`, `tombstoneMap`, `syncedSignatures` cũ trong `localStorage`/`sessionStorage` và làm sạch các bảng cục bộ trong IndexedDB trước khi tải 100% bộ dữ liệu chuẩn từ Supabase về.
- **Loại bỏ nghẽn `persistOutbox()` và `updateSyncStatus()` trong vòng lặp**:
  - Chuyển `persistOutbox()` và `persistTombstones()` sang cơ chế gom nhóm (debounce), tuyệt đối không gọi `localStorage.setItem` hàng nghìn lần trong vòng lặp.
  - Khi Supabase đã có dữ liệu chuẩn (`totalRemoteRecords > 0`), chặn việc tự động đẩy ngược các bản ghi rác/cũ không chuẩn từ máy lên lại Supabase; đồng thời kiểm tra và dọn sạch lại các bản ghi rác nếu trình duyệt cũ vừa đẩy nhầm lên Supabase.
- **Tắt chạy kép `cleanDuplicateStudentSessions()` trong `initializeDefaultSystemData()`**:
  - Để luồng khởi tạo diễn ra tuần tự, nhẹ nhàng, không khóa IndexedDB.

### Module 2: Menu Điều Hành & Tổng Quan Dashboard (`src/App.tsx`, `src/components/Dashboard.tsx`)
- Thay thế toàn bộ `useLiveQuery(...) || []` trong `Dashboard.tsx` bằng hằng số tham chiếu tĩnh `EMPTY_ARRAY`.
- Đảm bảo khi bấm chuyển giữa 7 mục trên thanh Menu bên trái, giao diện phản hồi tức thì (<16ms), không bị khựng hay tính toán lại toàn bộ cây dữ liệu.

### Module 3: Quản Lý Lớp Học (`src/components/ClassManagement.tsx`)
- Thay thế toàn bộ 5 câu lệnh `useLiveQuery(...) || []` (dòng 50–54) bằng tham chiếu tĩnh `EMPTY_ARRAY`.
- Chuẩn hóa các thao tác **Thêm lớp mới**, **Sửa thông tin lớp**, **Lưu trữ/Khôi phục lớp**, **Lên lớp (Promote)** và **Xóa lớp**:
  - Ép kiểu `String(id)` đồng nhất cho mọi truy vấn `class_id`.
  - Đảm bảo khi Thêm/Sửa/Xóa lớp, dữ liệu được cập nhật ngay vào IndexedDB và đẩy đồng bộ tức thì lên Supabase (`flushSyncOutbox()`).

### Module 4: Hồ Sơ & Danh Sách Học Sinh (`src/components/StudentRoster.tsx`)
- Thay thế `useLiveQuery(...) || []` (dòng 67–68) bằng tham chiếu tĩnh `EMPTY_ARRAY`.
- Chuẩn hóa thao tác **Thêm học sinh mới & Ghi danh lớp**, **Sửa thông tin & Chuyển lớp**, **Xóa học sinh (`deleteStudent`)**:
  - Sử dụng khóa chính chuẩn `String(studentId)` và `cs_${classId}_${studentId}`.
  - Khi xóa hoặc chuyển lớp học sinh, ghi nhận đúng `deleted_records` trên Supabase để không bao giờ bị phục hồi ngược.

### Module 5: Nhập Điểm Tốc Độ Cao & Bảng Điểm Tổng Hợp (`src/components/UltraFastGradeEntry.tsx`, `src/components/GradebookView.tsx`)
- Chuẩn hóa toàn bộ phép tìm kiếm Lớp và Buổi học sang so sánh chuỗi an toàn: `String(c.id) === String(selectedClassId)` và `String(s.id) === String(selectedSessionId)`.
- Tối ưu hóa `useEffect` đồng bộ bảng điểm học sinh khi đổi Lớp hoặc đổi Buổi học:
  - Ngắt triệt để việc tạo object mới không cần thiết gây re-render liên hoàn.
  - Chuẩn hóa các chức năng **Thêm buổi học**, **Sửa buổi học**, **Xóa buổi học** và **Lưu Điểm** để hoạt động mượt mà, không giật lag hay treo tab.
- Sửa `useLiveQuery(...) || []` trong `GradebookView.tsx` và `SessionHistoryModal.tsx`.

### Module 6: Cảnh Báo Học Tập, Bản Đồ Kiến Thức AI & Báo Cáo/Cài Đặt (`src/components/WarningCenter.tsx`, `src/components/KnowledgeMap.tsx`, `src/components/AuditAndReports.tsx`)
- Chuẩn hóa truy vấn theo `String(reportClassId)` trong `WarningCenter.tsx` (tránh lỗi không tải được Chu kỳ báo cáo 4 buổi khi `class_id` lệch kiểu dữ liệu).
- Kiểm tra và đảm bảo tính năng Quét cảnh báo học tập (`runWarningScanForClass`), tính điểm thông thạo chuyên đề (`recalculateKnowledgeResultsForClass`), và Xuất Excel/PDF hoạt động trơn tru trên bộ dữ liệu chuẩn của Supabase.

---

## 3. Kiểm Chứng Toàn Diện Sau Khi Khắc Phục
1. Kiểm tra lại dữ liệu trực tiếp trên Supabase (đảm bảo giữ nguyên vẹn 9 lớp học thật, danh sách học sinh, các buổi học và điểm số chuẩn xác, không có bản ghi rác).
2. Biên dịch và kiểm tra lỗi mã nguồn bằng `compile_applet` và `lint_applet` đạt 0 lỗi.
3. Khởi động lại máy chủ để Thầy/Cô trải nghiệm trực tiếp trên AI Studio và đẩy bản cập nhật lên Vercel.
