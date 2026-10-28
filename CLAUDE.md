# UniPlan (UNIFLAT) – hướng dẫn cho AI

App quản lý học tập cho sinh viên ĐH FPT (mặc định cơ sở Đà Nẵng): deadline, thời khóa biểu, lịch thi, môn học,
bài nhóm, kế hoạch tự học, nhắc deadline (Web Push), trợ lý AI agent, quản trị tài khoản. Giao diện và chú thích code viết **tiếng Việt**.

- Tổng quan, cấu trúc, lệnh, backend, bảo mật: **[README.md](README.md)**. Triển khai: [DEPLOY.md](DEPLOY.md).
- Quyết định quan trọng và lý do (đọc trước khi sửa tính năng đã có): **[docs/SESSION_LOG.md](docs/SESSION_LOG.md)**.
- Làm giao diện: **[docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md)** (token, `surface-card` / `lift` / `stagger` / `text-data`, component dùng chung).

## Cấu trúc ngắn

- `frontend/` – React 19 + Vite + TypeScript + Tailwind v4 (cấu hình trong `src/index.css`, không có tailwind.config). Deploy Vercel.
  `src/pages/*Page.tsx` tải lười trong `App.tsx`; `src/lib/` logic thuần; `src/services/` gọi API; `src/store/` AppData + Auth.
  Chế độ **demo** khi chưa cấu hình Supabase: dữ liệu từ `src/data/mock.ts`.
- `backend/supabase/migrations/` – **11 file** chạy theo thứ tự: `20261024000001_core`, `…02_accounts_admin`, `…03_rate_limit_sharing`,
  `…04_reminders` (gom từ 20 file cũ ngày 24/10/2026), `…05_course_custom_color`, `…06_course_lecturer`, `…07_group_invitations`, `20261025000008_email_digest`, `…09_block3`, `20261028000010_notify_schedule`, `…11_sync_user_email`. `functions/`: `ai-chat`, `admin-users`, `send-reminders`, `send-email-digest`, `_shared/`.
- `backend/tests/` – `rls.test.mjs` + `webpush.test.mjs` (PGlite, hiện **52 test** đều qua), `webpush.test.mjs`, `schema-diff.mjs`, `supabase-stub.sql`.

## Quy ước bắt buộc

- **Kiểm tra sau mỗi thay đổi**: `cd frontend && npx tsc -p tsconfig.app.json --noEmit` và `npx vite build`;
  Edge Function: `cd backend && npx --yes deno check --node-modules-dir=auto supabase/functions/<tên>/index.ts`;
  database: `cd backend && npm test`.
- **Database**: không sửa migration đã chạy – tạo file mới `YYYYMMDDHHMMSS_<tên>.sql`, chạy lại nhiều lần an toàn
  (`if not exists`, `drop ... if exists`, `create or replace`, `do $$ … exception when duplicate_object`), kết thúc bằng
  `notify pgrst, 'reload schema';` nếu đổi cấu trúc bảng. Thêm test vào `rls.test.mjs`. Hàm mới đọc cột `auth.users` → thêm cột vào
  `tests/supabase-stub.sql`. Gom / viết lại migration → so bằng `node tests/schema-diff.mjs <cũ> <mới>` (thêm `--twice-b`, `--a-then-b`).
  Người dùng chạy migration bằng SQL Editor của Supabase (không dùng CLI db push). Thêm migration → cập nhật DEPLOY.md Bước 9 và README.md.
- **Bảo mật**: mọi bảng bật RLS; hàm `SECURITY DEFINER` + `set search_path = ''`; quyền sửa `public.users` cấp **theo cột**
  (`full_name, student_code, campus, avatar_url`), quyền ĐỌC cũng theo cột (không có `locked_at`, `locked_reason`) → **không `select('*')`
  trên `users`**, dùng `USER_COLUMNS` (`services/api.ts`); thêm cột mới vào `users` thì cấp quyền đọc cột đó nếu cần.
  `push_subscriptions` chỉ ghi qua RPC (endpoint phải là dịch vụ push, `is_push_endpoint`). Dữ liệu người dùng gửi lên (metadata đăng ký,
  ô chữ tự do) luôn kiểm tra / giới hạn độ dài ở database. Lỗ hổng mới → thêm test "Bảo mật – …" mô phỏng tấn công. Thao tác quản trị chỉ qua Edge Function `admin-users` (service role). Key bí mật
  (Groq, VAPID private, CRON_SECRET, BREVO_API_KEY) chỉ ở `backend/supabase/functions/.env` → `supabase secrets set`; **không đọc / in nội dung file `.env`**.
- **Màu**: `brand-*` (cam) và `slate-*` bị **đảo ở giao diện tối** (`.dark` trong `index.css`). Thành phần phải giữ màu cố định
  ở cả sáng / tối (thanh điều hướng cam, logo, minh họa đăng nhập, hành tinh) dùng mã hex `#f97316`, `#c2410c`…
- **Nút / tab có chữ trắng** dùng `bg-cta` / `hover:bg-cta-hover`. Người dùng chọn giữ cam sáng #f97316 / #ea580c (đã thử cam đậm #c2410c
  để đạt WCAG AA rồi đổi lại) → không tự đổi sang cam đậm. Chữ tối thiểu `text-[11px]`, chữ cần đọc ≥ `text-xs` (= 13px).
  Mã số / số điện thoại / giờ: `text-data`, không dùng `font-mono`.
- **Màu môn học**: luôn dùng `courseColor(course)` / `courseHex(course)` (`lib/labels.ts`), không dùng `COURSE_COLOR[course.colorCode]`
  trực tiếp – môn có thể có màu tự chọn `colorHex` (class tạo lúc chạy, tự hợp giao diện sáng / tối).
- **Màu trạng thái**: Chưa bắt đầu = cam, Đang làm = xanh dương, Hoàn thành = xanh lá → dùng `STATUS_TONE` / `progressTone()` (`lib/labels.ts`)
  cho nút trạng thái, thanh tiến độ, nhãn. Nút hành động trên thẻ của 1 môn (Chi tiết, Xem nhiệm vụ) = nền màu môn (`courseColor().bar`) + chữ trắng.
  Tick đủ subtask → nhiệm vụ tự "Hoàn thành" (`progressFromSubtasks(..., autoComplete = true)` trong `toggleSubtask`).
- **Xác nhận thao tác**: dùng `useConfirm()` (`components/ui/ConfirmDialog.tsx`), không dùng `window.confirm`. Nút chỉ có biểu tượng: vùng bấm ≥ 44px.
- **Thanh điều hướng thu gọn**: dùng biến thể `nav-compact:` (định nghĩa trong `index.css`), không dùng `md:max-xl:`.
- **Placeholder**: dạng `Nhập [tên trường]`, không dùng ví dụ cụ thể (DE180001, PRO192...). Ô tìm kiếm thì giữ dạng "Tìm theo...".
- **Hiệu năng**: không thêm thư viện nặng cho thứ vẽ được bằng CSS / SVG (đã bỏ recharts). Phần không cần ngay → `lazy()` (xem AiChat trong
  `AppLayout`). Không thêm script đồng bộ vào `<head>` của `index.html`.
- Chỉnh sửa hàng loạt bằng Python: đọc / ghi giữ nguyên CRLF / LF; dùng chuỗi `r'''...'''` khi nội dung có `\u` / `\x` để không sinh
  ký tự điều khiển thật trong file. Heredoc bash hay lỗi với tiếng Việt dài → ghi script ra thư mục scratchpad rồi chạy.
- Chụp màn hình kiểm tra giao diện: `puppeteer-core` + Edge (`C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`), giả lập
  viewport bằng `setViewport` (Edge headless không hẹp được dưới ~496px). Bản demo: build với `VITE_SUPABASE_URL=""`.
- Người dùng tự deploy (`npx supabase functions deploy <tên>`) và chạy migration; AI không tự chạy lệnh làm thay đổi máy chủ thật
  trừ khi được yêu cầu rõ (lệnh chỉ đọc như `functions list`, `secrets list` thì được).

## Dịch vụ ngoài

- Supabase project ref: `vstmnuivhqtgdghxmnxb` (đã `supabase link` trong `backend/`).
- AI: **Groq**, model mặc định `qwen/qwen3.8-27b`. Gói miễn phí giới hạn ~7.000 token vào và 1.000 token ra mỗi phút
  → `max_tokens` ≤ 800, prompt trong `ai-chat/knowledge.ts` phải ngắn.
- Email tổng hợp mỗi sáng: **Brevo** (API HTTP, miễn phí 300 email/ngày), Edge Function `send-email-digest`, cron 7:00 VN (`cron_send_email_digest.sql`).
- Lịch chạy pg_cron xác thực bằng bảng `public.cron_token` (database tự sinh, `_shared/cron.ts`), không dùng Vault. Kiểm tra cron / phản hồi bằng
  `npx supabase db query --linked "<SELECT…>"` (chỉ đọc) – `cron.job`, `cron.job_run_details`, `net._http_response`.
- Đăng nhập: mọi email hợp lệ + Google OAuth (cần bật provider Google trong Supabase, xem DEPLOY.md Bước 11b).
