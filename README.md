# UniPlan

Web App (PWA) quản lý học tập cho sinh viên Đại học FPT (mặc định cơ sở Đà Nẵng): deadline & subtask, thời khóa biểu theo Block,
lịch thi PE / FE, môn học, bài nhóm & chia việc, kế hoạch tự học, nhắc deadline bằng Web Push (cả khi đã đóng app), trợ lý AI agent,
quản trị tài khoản. Giao diện sáng / tối, chạy tốt trên điện thoại, iPad, laptop và màn hình lớn.

| Tài liệu | Dành cho |
| --- | --- |
| **README.md** (file này) | Lập trình viên: cấu trúc, chạy ở máy, lệnh, cấu hình, backend, bảo mật |
| [DEPLOY.md](DEPLOY.md) | Triển khai từng bước lên Vercel + Supabase (cho người không chuyên) |
| [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) | Làm giao diện: màu, token, component dùng chung, mẫu code |
| [docs/SESSION_LOG.md](docs/SESSION_LOG.md) | Các quyết định quan trọng và lý do |
| [CLAUDE.md](CLAUDE.md) | Quy ước cho AI lập trình (Claude Code tự đọc) |

## Cấu trúc

```
UNIFLAT/
├── frontend/                React 19 + Vite + TypeScript + Tailwind v4 (PWA) → deploy Vercel
│   ├── src/pages/           Các trang (tải lười theo trang)
│   ├── src/components/      Theo khu vực: layout, ui, dashboard, calendar, tasks, plan, ai, auth, settings
│   ├── src/lib/             Logic thuần (ngày giờ, deadline, nhắc nhở, kế hoạch học, AI agent...)
│   ├── src/services/        Gọi API: api.ts (Supabase), admin.ts, ai.ts
│   ├── src/store/           AppData (dữ liệu + realtime), Auth (đăng nhập email / Google)
│   ├── src/data/mock.ts     Dữ liệu chế độ demo
│   ├── src/sw.ts            Service Worker: offline, Web Push
│   └── vercel.json          SPA fallback, cache, header bảo mật (CSP, HSTS...)
├── backend/                 Supabase
│   ├── supabase/migrations/ 11 file SQL, chạy theo thứ tự tên (xem bên dưới)
│   ├── supabase/functions/  Edge Functions (Deno): ai-chat, admin-users, send-reminders, _shared
│   ├── supabase/cron_send_reminders.sql  Lịch gọi send-reminders mỗi 5 phút (chạy tay 1 lần)
│   ├── supabase/seed_demo.sql            Dữ liệu trình diễn cho 1 tài khoản (tùy chọn)
│   ├── scripts/generate-vapid-keys.mjs   Tạo khóa VAPID cho Web Push
│   └── tests/               Test database (PGlite), Web Push, so sánh schema
├── DEPLOY.md · CLAUDE.md · docs/
```

## Chạy ở máy

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

Chưa cấu hình Supabase → **chế độ demo** (dữ liệu mẫu trong bộ nhớ, tải lại trang là về ban đầu).

| Lệnh (trong `frontend/`) | Làm gì |
| --- | --- |
| `npm run dev` | Chạy dev (không có Service Worker) |
| `npm run build` | Kiểm tra kiểu + build ra `dist/` |
| `npm run preview` | Thử bản production (có Service Worker) |
| `npm run deploy` | `vercel deploy --prod` (lần đầu: `npm run vercel:link`) |

| Lệnh (trong `backend/`) | Làm gì |
| --- | --- |
| `npm test` | 52 test: database (RLS, quyền, rate limit, nhắc deadline, quản trị, mô phỏng tấn công) + Web Push |
| `npm run vapid:generate` | Tạo cặp khóa VAPID |
| `node tests/schema-diff.mjs <thư mục A> <thư mục B>` | So sánh schema 2 bộ migration (dùng khi gom / viết lại migration) |
| `npx --yes deno check --node-modules-dir=auto supabase/functions/<tên>/index.ts` | Kiểm tra kiểu Edge Function |

## Cấu hình (chỉ lập trình viên)

Không ai (kể cả admin) nhập hay thấy key trên giao diện.

| Cấu hình | Đặt ở đâu | Ghi chú |
| --- | --- | --- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_VAPID_PUBLIC_KEY` | Vercel → Environment Variables, hoặc `frontend/.env` (mẫu: `frontend/.env.example`) | Giá trị **công khai**, dữ liệu được RLS bảo vệ. App từ chối `service_role` / `sb_secret_` key |
| `GROQ_API_KEY`, `GROQ_MODEL`, `ALLOWED_ORIGINS`, `VAPID_PRIVATE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT`, `CRON_SECRET` | `backend/supabase/functions/.env` (mẫu: `.env.example`) → `npx supabase secrets set --env-file supabase/functions/.env` | **Bí mật**, chỉ Edge Functions đọc được |

## Backend (Supabase)

### Migration

| File | Nội dung |
| --- | --- |
| `20261024000001_core.sql` | Kiểu dữ liệu, bảng học tập (môn, thời khóa biểu, kỳ thi, nhóm, deadline, subtask, phần việc, link chia sẻ, thiết bị push, buổi tự học), index, hàm kiểm tra quyền, trigger, RLS, khóa tài khoản, Realtime |
| `20261024000002_accounts_admin.sql` | Đăng ký (mọi email hợp lệ), hồ sơ (sửa theo cột + kiểm tra dữ liệu), bucket ảnh đại diện, nhật ký quản trị, số điện thoại (bảng riêng), `admin_list_users` |
| `20261024000003_rate_limit_sharing.sql` | Chống spam (giới hạn theo user / IP), chia sẻ deadline `/s/:code`, mời thành viên nhóm |
| `20261024000004_reminders.sql` | Web Push: đăng ký thiết bị, mốc nhắc tự chọn, `due_reminders()`, nhật ký đã nhắc |
| `20261024000005_course_custom_color.sql` | Màu môn học tự chọn (`courses.color_hex`, dạng `#rrggbb`) |
| `20261024000006_course_lecturer.sql` | Tên giảng viên của môn (`courses.lecturer`, tối đa 200 ký tự; trống thì lấy theo thời khóa biểu) |
| `20261024000007_group_invitations.sql` | Lời mời vào nhóm (`group_invitations`): gợi ý ≤ 3 tài khoản theo tên không dấu, người được mời đồng ý mới vào nhóm |
| `20261025000008_email_digest.sql` | Email tổng hợp mỗi sáng: `email_prefs` (tự bật, mặc định tắt), `email_log` (1 email/ngày), `due_email_digest()` (chỉ service_role) |
| `20261025000009_block3.sql` | Thêm giá trị `Block 3` vào enum `block_name` (môn học + buổi học) |
| `20261028000010_notify_schedule.sql` | Mốc nhắc mặc định 1 ngày + 1 giờ; email chỉ hôm nay + quá hạn; bảng `cron_token` (mã cho pg_cron, chỉ service_role đọc) |
| `20261028000011_sync_user_email.sql` | Trigger `auth.users.email` → `public.users.email` khi đổi email đăng nhập |

Chạy lần lượt trong **SQL Editor** của Supabase (DEPLOY.md Bước 9). Mỗi file chạy lại nhiều lần an toàn và tự nâng cấp database tạo bằng
bộ 20 file cũ (đã gom ngày 24/10/2026). Đổi cấu trúc về sau: **thêm file mới**, không sửa file đã chạy, kết thúc bằng `notify pgrst, 'reload schema';`.

Tạo admin đầu tiên: `update public.users set role = 'admin' where email = '...';` trong SQL Editor.

### Edge Functions

| Function | Ai gọi | Giới hạn | Việc |
| --- | --- | --- | --- |
| `ai-chat` | Người dùng đã đăng nhập | 20 lần / phút | AI agent trên Groq (tool calling): đề xuất deadline, môn, lịch học, buổi tự học; người dùng duyệt mới lưu |
| `admin-users` | Admin | 60 lần / phút | Danh sách (1 truy vấn SQL), tạo, sửa, đổi vai trò, đặt mật khẩu, khóa / mở khóa, nhật ký |
| `send-reminders` | Cron (`x-cron-secret`) hoặc người dùng (gửi thử) | Gửi thử 3 lần / phút | Nhắc deadline theo mốc người dùng chọn, cả khi đã đóng app |

```bash
cd backend
npx supabase functions deploy ai-chat
npx supabase functions deploy admin-users
npx supabase functions deploy send-reminders --no-verify-jwt
```

**Nhắc khi đã đóng app** cần đủ 4 thứ: khóa VAPID (secrets + `VITE_VAPID_PUBLIC_KEY`), function `send-reminders`, lịch pg_cron 5 phút
(`cron_send_reminders.sql`), và người dùng bật **Cài đặt → Thông báo nhắc deadline** trên thiết bị (iPhone: phải "Thêm vào Màn hình chính").
Kiểm tra lịch: `select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;`

### Bảo mật

- **RLS bật trên mọi bảng** (test tự kiểm tra); `anon` không truy cập trực tiếp bảng nào.
- Deadline cá nhân: chỉ chủ sở hữu; deadline nhóm: chỉ thành viên, chỉ người tạo / chủ nhóm được xóa; trigger chặn đổi chủ / nhóm.
- Lịch học, kỳ thi, kế hoạch học: hoàn toàn cá nhân; khóa ngoại kép `(course_id, user_id)`.
- Hồ sơ: người dùng chỉ sửa được `full_name, student_code, campus, avatar_url` (quyền theo cột); `role` / `is_locked` chỉ Edge Function đổi.
- Khóa tài khoản = cấm đăng nhập (Supabase Auth) + policy RESTRICTIVE chặn mọi dữ liệu kể cả token cũ + xóa đăng ký Web Push.
- Link chia sẻ chỉ trả đúng các trường cần sao chép, hết hạn sau 30 ngày.
- Vào nhóm chỉ qua lời mời + người được mời đồng ý (`respond_group_invitation`); không ai, kể cả chủ nhóm, ghi thẳng `group_members`.
  Gợi ý tìm bạn chỉ trả tên, ảnh, email đã che (`vi***@fpt.edu.vn`); email phải gõ đủ mới khớp (không dò theo tiền tố); có rate limit.
- Hàm `SECURITY DEFINER` luôn `set search_path = ''`; quyền `EXECUTE` chỉ cấp đúng hàm cần thiết.
- Rate limit đặt **trong database** (trigger), vượt giới hạn → HTTP 429. Thao tác dây chuyền không bị tính (`pg_trigger_depth()`).
- Bảng `users` cấp quyền ĐỌC theo cột (bạn cùng nhóm không thấy lý do khóa; chính chủ xem qua `my_lock_info()`) → frontend không dùng `select('*')` cho `users`.
- Thiết bị push chỉ đăng ký qua RPC; endpoint chỉ nhận dịch vụ push của trình duyệt (chống SSRF), Edge Function kiểm tra lại trước khi gửi.
- Metadata đăng ký được làm sạch (ảnh đại diện chỉ nhận ảnh Google, họ tên ≤ 100 ký tự); ô chữ tự do có giới hạn độ dài.
- CSP chỉ cho kết nối / tải ảnh từ Supabase và ảnh Google. Đặt `ALLOWED_ORIGINS` để Edge Functions chỉ nhận request từ domain của bạn.

### Hiệu năng

- Frontend chỉ gọi HTTP (PostgREST / Realtime) nên không cần connection pooler; Realtime đăng ký có filter theo người dùng / nhóm.
- Index bám theo truy vấn và RLS nóng nhất (deadline theo người / nhóm / hạn / trạng thái, nhóm theo chủ, môn theo mã...).
- Trang Quản trị: 1 lời gọi SQL `admin_list_users` (thay ~26 lời gọi), có bộ nhớ đệm và tải trước khi rê chuột vào menu.
- Khi mở app chỉ tải ~180 KB JS (gzip). Các trang, trợ lý AI và trang đăng nhập được tải lười. Biểu đồ vẽ bằng CSS (không dùng thư viện).
