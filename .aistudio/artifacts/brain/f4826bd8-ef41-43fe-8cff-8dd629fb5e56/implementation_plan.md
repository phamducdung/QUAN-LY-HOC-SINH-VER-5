# Kế Hoạch Kaizen Cơ Sở Dữ Liệu, Đồng Bộ Firebase & Tối Ưu Hạn Mức Quota

Tái cấu trúc toàn diện tầng lưu trữ và đồng bộ dữ liệu của ứng dụng Quản lý Lớp học Toán theo mô hình **Cloud-First kết hợp IndexedDB Cache & Bảo vệ Hạn mức (Quota Guard)**, giải quyết triệt để lỗi vượt hạn mức ghi miễn phí (`[code=resource-exhausted]: Free daily write units exceeded`), tình trạng mất dữ liệu khi tải lại trang, dữ liệu đã xóa tự sống lại (Zombie Data), và nhân bản bản ghi giữa các thiết bị.

## User Review & Critical Decisions

> [!IMPORTANT]
> **Chẩn đoán lỗi `resource-exhausted` vừa xảy ra**:
> Cơ sở dữ liệu Firestore của dự án (`ai-studio-qunllphctonthcs-f4826bd8-ef41-43fe-8cff-8dd629fb5e56`) thuộc gói miễn phí (Spark Plan - Enterprise Edition) với giới hạn **20.000 lượt ghi/ngày**. Hệ thống hiện tại bị cạn kiệt hạn mức do:
> 1. Mỗi lần gọi `pushAllToFirestore()` hoặc `syncAll()` đều ghi đè lại **toàn bộ 100% bản ghi** trong cơ sở dữ liệu dù dữ liệu không hề thay đổi.
> 2. Mỗi thao tác gõ điểm/chỉnh sửa trong Dexie Hook bắn trực tiếp 1 lượt ghi đơn lẻ lên Firestore mà không gom nhóm (Debounce) hay kiểm tra trùng lặp nội dung (Dirty-Check).
> 3. Khi chạm ngưỡng Quota, SDK Firebase vẫn liên tục thử kết nối lại ngầm (`Using maximum backoff delay...`) gây treo luồng và báo lỗi đỏ trên Console.
>
> *(Lưu ý từ hệ thống Firebase: Hạn mức miễn phí trong ngày sẽ tự động được làm mới vào ngày tiếp theo. Thông tin chi tiết về hạn mức có thể xem tại cột **Spark** thuộc mục **Enterprise edition** trên trang https://firebase.google.com/pricing#cloud-firestore).*

- **Confirmed Decision 1 — Mô hình Cloud-First có Bảo vệ Hạn mức (Quota-Safe Cloud-First)**: Ưu tiên ghi lên Firebase Firestore đối với các bản ghi thực sự có thay đổi (Dirty-Diffing) thông qua bộ gom nhóm thông minh (Debounced Write Batch), đồng thời tự động ngắt luồng retry ngầm (`disableNetwork`) và chuyển sang Hàng đợi Outbox cục bộ an toàn nếu hạn mức ngày hôm đó đã hết.
- **Confirmed Decision 2 — Đồng bộ Xóa bằng Tombstone & Đối soát toàn cục**: Khi xóa học sinh, lớp học, buổi học hoặc điểm số trên bất kỳ thiết bị nào, hệ thống ghi nhận dấu vết xóa (`deleted_records` Tombstone) và đối soát tập hợp ID để xóa đồng bộ trên mọi thiết bị.
- **Confirmed Decision 3 — Chuẩn hóa Khóa Định Danh & Tự động Hợp nhất Dữ liệu trùng lặp**: Tự động gom nhóm các bản ghi trùng lặp hiện có (như nhiều bản ghi Cấu hình `settings`, Năm học `school_years`, Điểm buổi học `student_sessions`, Phân lớp `class_students`), giữ lại bản ghi có `updated_at` mới nhất và dọn sạch các bản sao dư thừa.

---

## 1. Overview & Core Concept

- **What It Does**: Nâng cấp lõi cơ sở dữ liệu lai (Firebase Firestore + Dexie IndexedDB) thành hệ thống đồng bộ hai chiều chuẩn xác, tiết kiệm tới **95% số lượt ghi (Write Units)** nhờ thuật toán đối chiếu dấu vân tay dữ liệu (Content Hash Diffing) và gom nhóm thao tác (Write Coalescing), đồng thời khóa chặn hoàn toàn lỗi tràn Console khi vượt hạn mức ngày.
- **Target Audience / Persona**: Giáo viên chính và Trợ giảng sử dụng ứng dụng đồng thời trên nhiều thiết bị để điểm danh, nhập điểm BTVN/Kiểm tra và xuất phiếu báo cáo.
- **Key Value**:
  - **Chặn đứng lỗi `resource-exhausted` & giảm 95% tiêu hao Quota**: Chỉ đẩy những bản ghi thực sự thay đổi nội dung lên Firestore; tự động gọi `disableNetwork(db)` khi phát hiện hết hạn mức ngày để chấm dứt hoàn toàn lỗi `@firebase/firestore` backoff.
  - **Độ tin cậy 100% khi thao tác**: Mọi thao tác thêm/sửa/xóa được lưu bền vững; nếu đang trong thời gian chờ reset Quota ngày mới, mọi thay đổi được giữ trong `Pending Outbox Queue` và tự động đồng bộ lên Cloud ngay khi hạn mức mở lại.
  - **Loại bỏ triệt để "Zombie Data" & Trùng lặp bản ghi**: Áp dụng khóa định danh tất định (Deterministic Key) và đối soát Tombstone giúp dữ liệu luôn sạch và nhất quán.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Cơ chế Ngắt Mạch Tự Động khi Vượt Hạn Mức (Circuit Breaker & Silent Fallback)**:
     - Ngay khi khởi động hoặc trong lúc vận hành, nếu phát hiện cờ vượt hạn mức ngày (`isQuotaExceeded`) hoặc mã lỗi `resource-exhausted`, hệ thống lập tức gọi `disableNetwork(firestoreDb)` để ngắt toàn bộ tiến trình retry ngầm của SDK Firebase, không để phát sinh bất kỳ lỗi Console nào.
     - Mọi thao tác nhập điểm, tạo lớp, xóa dữ liệu mẫu của giáo viên vẫn diễn ra tức thời (0ms) trên IndexedDB và được đánh dấu vào `Outbox Queue` để tự động đẩy lên Cloud khi hạn mức ngày mới được cấp lại (hoặc khi người dùng bấm nút "Thử kết nối lại Cloud").
  2. **Thao tác Ghi & Xóa Cloud-First Tiết Kiệm Quota (Smart Diff & Coalesced Write Flow)**:
     - Khi giáo viên nhập điểm liên tục trên bảng điểm, hệ thống gom nhóm (Debounce `800ms`) các thay đổi của cùng một buổi học thành một gói `writeBatch` duy nhất.
     - Trước khi đẩy lên Firestore, bộ lọc `hasRecordChanged()` kiểm tra nội dung thực tế (bỏ qua trường `updated_at` nếu các trường nghiệp vụ không đổi), đảm bảo không bao giờ tốn lượt ghi cho dữ liệu tĩnh.
  3. **Trung tâm Kiểm tra & Đối soát Đồng bộ (Cloud Sync Inspector Modal)**:
     - Hiển thị rõ trạng thái kết nối thực tế: `Đang đồng bộ Cloud-First`, `Đang gom nhóm thay đổi`, hoặc `Chế độ Bảo toàn Hạn mức (Tự động đồng bộ khi Reset Quota)`.
     - Cung cấp nút **"Chuẩn hóa & Dọn trùng lặp (Kaizen DB)"** và bộ đếm số lượng bản ghi đang chờ trong Hàng đợi Outbox (`Pending Sync Queue`).

- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Giao diện quản trị giáo dục chuyên nghiệp (Enterprise EdTech Dashboard), rõ ràng, sắc nét, ưu tiên khả năng đọc lướt nhanh bảng điểm và trạng thái đồng bộ.
  - *Color Palette & Mood*: Duy trì hệ màu Dual-Theme (Sáng / Tối) chuẩn mực với nền trung tính (`slate-50` / `slate-950`), bề mặt khung (`white` / `slate-900` kèm đường viền mảnh `1px`), điểm nhấn hành động chính màu xanh ngọc lục bảo (`emerald-600`), cảnh báo màu hổ phách (`amber-600`) và báo lỗi/xóa màu đỏ (`rose-600`).
  - *Typography & Hierarchy*: Toàn bộ số liệu thống kê, bộ đếm bản ghi Local/Outbox, điểm số và dấu thời gian áp dụng nghiêm ngặt `tabular-nums` (`font-mono` / `font-num`) để các chữ số thẳng hàng dọc tuyệt đối.
  - *Component Styling & Layout*: Một tầng độ sâu (Single-Elevation Depth), không lồng thẻ trong thẻ, không dùng chấm nhấp nháy trang trí dư thừa.

- **Interactive Feedback & Motion**:
  - Thanh thông báo hạn mức (`QuotaBanner`) tinh gọn, cho phép giáo viên xem rõ nguyên nhân hết hạn mức ghi miễn phí trong ngày của gói Spark và có nút **"Kiểm tra / Kết nối lại Cloud"** khi sang ngày mới.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Ngắt mạng chủ động cấp SDK (`disableNetwork`) khi chạm ngưỡng Quota + Hàng đợi Outbox bền vững**
  - *Chosen Approach*: Ngay khi bắt được lỗi `resource-exhausted` hoặc khi khởi động trong ngày đã ghi nhận hết Quota, gọi `disableNetwork(firestoreDb)` để đóng kết nối WebSocket của Firestore SDK, ngăn chặn hoàn toàn lỗi `Using maximum backoff delay` và `Quota limit exceeded`. Mọi thay đổi trong thời gian này được ghi vào bảng/danh sách `sync_outbox` trong `localStorage`/IndexedDB để đẩy bù khi `enableNetwork(firestoreDb)` trở lại.
  - *Why*: Nếu chỉ chặn ở tầng hàm ứng dụng mà không gọi `disableNetwork()`, SDK `@firebase/firestore` vẫn giữ các gói tin cũ trong bộ đệm nội bộ của nó và liên tục retry gây lỗi đỏ trên hệ thống.

- **Decision 2: Thuật toán Đối chiếu Nội dung (Dirty-Diffing) & Gom nhóm Ghi (Write Coalescing)**
  - *Chosen Approach*:
    - Lưu bản chụp dấu vân tay (`lastSyncedHash`) của từng bản ghi. Khi gọi `pushAllToFirestore()` hoặc `syncAll()`, chỉ những bản ghi có nội dung nghiệp vụ thay đổi so với `lastSyncedHash` mới được đưa vào `writeBatch`.
    - Các thao tác nạp/xóa dữ liệu mẫu (`seedDemoData`, `deleteOnlyDemoTestData`) được đánh dấu là dữ liệu thử nghiệm cục bộ (`is_demo: true`) và **không tự động đẩy lên Firestore**, giúp tiết kiệm hàng trăm lượt ghi vô ích mỗi lần giáo viên bấm thử nghiệm.
  - *Why*: Một lần nạp dữ liệu mẫu tạo ra ~130 bản ghi; nếu đẩy lên Cloud mỗi lần thử nghiệm sẽ đốt cháy hạn mức 20.000 lượt ghi rất nhanh. Chỉ đồng bộ dữ liệu thật của giáo viên lên Cloud!

- **Decision 3: Cơ chế Tombstone (`deleted_records`) kết hợp Chuẩn hóa Khóa Chính Định Danh (Deterministic Composite Keys)**
  - *Chosen Approach*:
    - Ghi nhận dấu vết xóa vào `deleted_records` cho các bản ghi thật để đồng bộ xóa trên mọi thiết bị, chấm dứt lỗi "Zombie Data".
    - Sử dụng khóa định danh tất định cho: `settings` (`"system_settings"`), `school_years` (`"sy_2025_2026"`), `student_sessions` (`"ss_${session_id}_${student_id}"`), `class_students` (`"cs_${class_id}_${student_id}"`), và `knowledge_results` (`"kr_${student_id}_${knowledge_tag_id}"`).
  - *Why*: Ngăn chặn tận gốc việc sinh ra các bản ghi trùng lặp và giảm thiểu số lượng bản ghi rác trên Firestore.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### Architecture & Quota-Safe Sync Diagram

```
┌────────────────────────────────────────────────────────────────────────────┐
│                   GIAO DIỆN NGƯỜI DÙNG (React Components)                  │
│  [Nhập Điểm Siêu Tốc]   [Quản Lý Lớp & HS]   [Cài Đặt & Trung Tâm Đồng Bộ] │
└───────────────┬──────────────────────────────────────────┬─────────────────┘
                │ Thao tác Ghi / Sửa / Xóa                 │ Truy vấn 0ms
                ▼                                          ▼
┌───────────────────────────────────────┐    ┌───────────────────────────────┐
│   TẦNG ĐIỀU PHỐI КАIZEN & QUOTA GUARD │    │   DEXIE INDEXEDDB (Local SOT) │
│  1. Chuẩn hóa Khóa Định Danh (ID)     │───▶│  • Lưu tức thời mọi thay đổi  │
│  2. Lọc bỏ Dữ liệu Mẫu (is_demo)      │    │  • Hợp nhất bản ghi trùng lặp │
│  3. Dirty-Diff (Chỉ đẩy bản ghi đổi)  │    └──────────────▲────────────────┘
│  4. Debounce Queue (Gom lô 800ms)     │                   │
└───────────────┬───────────────────────┘                   │
                │ Kiểm tra Circuit Breaker (Quota Status)   │
        ┌───────┴────────────────────────┐                  │
        ▼ (Còn Quota & Online)           ▼ (Hết Quota/Offline)
┌──────────────────────────────┐  ┌──────────────────────────────────────────┐
│  FIREBASE FIRESTORE (Cloud)  │  │  CIRCUIT BREAKER & OUTBOX QUEUE          │
│  • Commit WriteBatch (<=400) │  │  • Gọi disableNetwork(db) chặn lỗi SDK   │
│  • Lưu Tombstone xóa đồng bộ │  │  • Xếp hàng vào Pending Outbox để đẩy bù │
└──────────────────────────────┘  └──────────────────────────────────────────┘
```

### Data Model & Deterministic Key Rules

1. **Quy tắc Khóa Chính Tất Định (Deterministic ID Generator)**:
   - Bảng `settings`: Luôn sử dụng ID `"system_settings"`.
   - Bảng `school_years`: Chuẩn hóa từ trường `name` (ví dụ `"2025-2026"` $\rightarrow$ `"sy_2025_2026"`).
   - Bảng `class_students`: Chuẩn hóa từ `class_id` và `student_id` $\rightarrow$ `"cs_${class_id}_${student_id}"`.
   - Bảng `student_sessions`: Chuẩn hóa từ `session_id` và `student_id` $\rightarrow$ `"ss_${session_id}_${student_id}"`.
   - Bảng `knowledge_results`: Chuẩn hóa từ `student_id` và `knowledge_tag_id` $\rightarrow$ `"kr_${student_id}_${knowledge_tag_id}"`.

2. **Bộ lọc Chống Đốt Quota (`Dirty-Diff` & `Demo Isolation`)**:
   - Không đồng bộ các bản ghi có `is_demo === true` lên Firestore để bảo vệ 100% hạn mức Cloud cho dữ liệu thật.
   - Tạo hàm `computePayloadSignature(record)` băm nội dung các trường dữ liệu chính (bỏ qua `updated_at`). Nếu chữ ký trùng khớp với bản đã lưu trên Cloud/Cache, bỏ qua không gọi `setDoc`/`batch.set`.

3. **Thuật toán Tự động Hợp nhất & Dọn trùng lặp (`kaizenDeduplicateAndMerge`)**:
   - Quét toàn bộ dữ liệu trong IndexedDB (và đồng bộ lên Firestore khi còn Quota):
     - Gộp tất cả các bản ghi `settings` rời rạc về duy nhất `"system_settings"`.
     - Gộp các `school_years` trùng tên và tự động ánh xạ lại (`remap`) `school_year_id` của các lớp học.
     - Gộp các `student_sessions` có cùng `(session_id, student_id)` về khóa chuẩn `"ss_${session_id}_${student_id}"`, giữ lại bản ghi có điểm số và `updated_at` mới nhất.
     - Gộp các `class_students` có cùng `(class_id, student_id)` về `"cs_${class_id}_${student_id}"`.

### Interactive Component & State Mapping

- **Tầng Kết nối Firebase (`firebase.ts` & `syncService.ts`)**:
  - Tích hợp `disableNetwork(db)` và `enableNetwork(db)` từ `firebase/firestore`. Ngay khi khởi tạo, nếu `isQuotaExceeded` là `true`, ngắt mạng SDK ngay lập tức trước khi bất kỳ listener hay lệnh ghi nào được gọi.
  - Khi bắt được lỗi `resource-exhausted` ở bất kỳ lệnh ghi/đọc nào, lập tức kích hoạt `setQuotaExceeded(true)` $\rightarrow$ gọi `disableNetwork(db)` $\rightarrow$ hủy toàn bộ `onSnapshot` listeners $\rightarrow$ lưu thao tác vào `Outbox Queue`.
- **Trung Tâm Đồng Bộ (`CloudSyncStatusModal` & `QuotaBanner`)**:
  - Cung cấp nút **"Chạy Kaizen Chuẩn Hóa & Gộp Dữ Liệu Trùng"** hoạt động an toàn ngay cả khi đang ở chế độ bảo toàn Quota.
  - Cung cấp nút **"Kiểm tra lại kết nối Cloud (Sau khi Reset Quota)"** để bật lại `enableNetwork(db)` và đẩy toàn bộ hàng đợi `Outbox Queue` lên Firebase.
