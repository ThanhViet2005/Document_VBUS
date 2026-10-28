# Quyết định & lịch sử phát triển UniPlan

Các quyết định quan trọng, lý do và chỗ trong code. Đọc kèm [CLAUDE.md](../CLAUDE.md) và [README.md](../README.md).
Người dùng: lập trình viên Việt Nam, giao tiếp tiếng Việt, thường gửi ảnh mẫu (giao diện tối, nhấn cam) và yêu cầu "làm giống hình";
thích giải thích ngắn bằng bảng / gạch đầu dòng, kèm lệnh cụ thể cần chạy. Tự deploy và chạy migration.

## Giao diện

| Khu vực | File chính | Quyết định |
|---|---|---|
| Phong cách | `index.css`, `docs/DESIGN_SYSTEM.md` | "Năng động & Phiêu lưu": cam FPT chính + xanh dương / xanh lá (bộ ba logo FPT), chủ đề hành trình (banner "Hành trình học kỳ") |
| Màu nút | `bg-cta` (#f97316) | Người dùng **từ chối** cam đậm #c2410c dù đạt WCAG AA → giữ cam sáng. `slate-400` sáng = #64708a |
| Chữ | `--text-xs` = 13px, `text-data` | MSSV / SĐT / giờ không dùng `font-mono` (Consolas mảnh trên Windows) |
| Nền bầu trời | `components/ui/SkyBackdrop.tsx`, `lib/sky.ts` | Sáng: mặt trời + 6 loại hành tinh; tối: trăng khuyết + mỗi hành tinh thành sao 4 cánh. Đăng nhập `hero`, trang app `ambient` (40%, tắt được ở Cài đặt). Hành tinh bên trái tính từ `--nav-w` |
| Thanh điều hướng | `Sidebar.tsx`, `lib/navCollapse.ts` | Cam cố định; thu gọn còn icon + nhãn ngắn; **tự thu gọn khi bấm vào nội dung** (≥ 1280px, sự kiện `click` để không mất cú bấm); thẻ "Chặng hôm nay" (`SidebarJourney.tsx`) lấp khoảng trống |
| Điện thoại | `BottomNav.tsx`, `MoreSheet.tsx` | Tổng quan / Nhiệm vụ / Lịch / Nhóm / Thêm; "Thêm" chỉ chứa mục còn lại |
| Ô số liệu | `components/ui/StatTile.tsx` | Dùng chung Tổng quan + Kế hoạch học; bấm được (`to`) |
| Lịch | `CalendarPage.tsx`, `WeekTimetable.tsx`, `lib/schedule.ts` | 0–24h, 8 giờ / màn hình, 7 ngày; kéo thả (thẻ bóng, listener trên `window`), chạm mép đổi tuần; dời lịch "chỉ buổi này / các tuần sau / tất cả" (`planMove`, `occursOn`) |
| Nhiệm vụ | `TasksPage.tsx`, `TaskBoardCard.tsx` | `?task=<id>` → tự đổi tab, cuộn tới, viền cam "Nhiệm vụ bạn đang xem" (thông báo, trợ lý AI, Tổng quan, Kế hoạch dẫn tới đây) |
| Kế hoạch học | `PlanPage.tsx` | Mỗi ngày 1 hàng (cả T7, CN); gợi ý có ô ngày; phân bổ có thanh "đã học / đã lên lịch" |
| Modal | `ui/Modal.tsx`, `ui/ConfirmDialog.tsx` | Focus ô nhập đầu, giữ Tab trong modal, trả focus, ngăn xếp modal; `useConfirm()` thay `window.confirm` |
| Trợ lý AI | `components/ai/AiChat.tsx` | Popup trượt; ô nhập tự cao (≤ 8 dòng); chờ trả lời = 3 chấm "đang soạn tin"; thẻ đề xuất màu theo loại (`KIND_TONE`) |

## Danh mục môn FPT (24/10)

- `frontend/src/data/fptCourses.ts`: mã + tên tiếng Anh (+ tiếng Việt nếu có), chép từ bảng người dùng gửi (19 môn). Thêm môn = thêm 1 dòng.
- `lib/courseCatalog.ts`: tìm không dấu theo mã / tên; `COURSE_CODE_RE` cho phép `_` và `-` (vd `BF_GRA_ELE`), dùng chung form + AI.
- `components/courses/CatalogPicker.tsx` trong `CourseForm`: chọn → điền mã + tên (vẫn sửa được), đổi tên Anh / Việt, nhãn "Đã có".

## Màu môn tự chọn (24/10)

- `courses.color_hex` (migration 005, `#rrggbb` chữ thường); `color_code` vẫn lưu màu gợi ý gần nhất (`nearestCourseColor`) cho link chia sẻ.
- `lib/labels.ts`: `courseColor()` trả `{ bar, soft, text }` như cũ; màu tự chọn → class `cc-<hex>-*` tạo 1 lần trong `<style id="course-colors">`,
  nền / chữ pha bằng `color-mix` với `--color-surface` / `--color-slate-900` nên đúng ở cả sáng / tối. `courseHex()` cho SVG.
- `components/courses/ColorPicker.tsx`: 8 màu gợi ý + ô cầu vồng mở bảng màu (36 màu, "Màu bất kỳ" = bộ chọn màu hệ điều hành, nhập mã màu),
  xem trước nhãn môn. API chỉ gửi `color_hex` khi có thay đổi (DB chưa chạy migration 005 vẫn lưu được).

## Thẻ không nhảy chỗ khi thao tác (24/10)

- `TasksPage`: thẻ vừa tick / đổi trạng thái được giữ đúng vị trí (`touched` + `orderRef`), kể cả khi thành "Hoàn thành" ở tab "Đang mở";
  đổi tab / bộ lọc / từ khóa mới lọc + sắp xếp lại. Tick bước cuối → toast "Đã hoàn thành …".
- `useAutoCollapseNav` không thu gọn khi bấm vào nút / ô tick / ô nhập / tab / liên kết (trước đây cú tick đầu tiên làm thanh co lại → cả lưới trượt ngang).

## Thông báo khi đóng web không chạy – nguyên nhân & sửa (28/10)

- Chẩn đoán bằng `supabase db query --linked` (chỉ đọc): job email chạy mỗi ngày nhưng function trả **401** vì Vault KHÔNG có
  `uniplan_cron_secret` (header `x-cron-secret` rỗng); job `uniplan-send-reminders` **không tồn tại** → Chrome chỉ nhắc khi đang mở web.
- Sửa: bảng `public.cron_token` (migration 010, mã ngẫu nhiên do database sinh, chỉ service_role đọc). Cron gửi mã này,
  `_shared/cron.ts` `isCronCall()` so với bảng (vẫn nhận `CRON_SECRET`). Không còn bước chép secret vào Vault bằng tay.
- Theo yêu cầu: Chrome mặc định nhắc **trước 1 ngày + trước 1 giờ** (`DEFAULT_REMINDER_KINDS`, default `reminder_prefs`, `due_reminders`);
  email 7:00 chỉ **hạn hôm nay + quá hạn**. Người đã tự chọn mốc vẫn giữ lựa chọn.

## Màn hình tạm ngưng / bảo trì (25/10)

- `npm run deploy:maintenance` = `vercel deploy --prod --build-env VITE_MAINTENANCE=1`. vite.config.ts (plugin `transformIndexHtml`
  **order 'pre'**, nếu không Vite vẫn đóng gói cả app) đổi điểm vào `src/main.tsx` → `src/maintenance.tsx` (chỉ `MaintenancePage`, không Supabase).
- Ghi đè cache: bản bảo trì vẫn build cùng Service Worker → SW mới (skipWaiting + clientsClaim + cleanupOutdatedCaches) thay cache cũ,
  `registerType: 'autoUpdate'` tự tải lại trang. `pwa.ts` gọi `registration.update()` mỗi 15 phút + khi quay lại tab → tab mở sẵn cũng chuyển.
- Khôi phục = Instant Rollback trên Vercel (SW bản thường quay lại, trang tự tải lại). Đã kiểm chứng: bản thường → bảo trì → offline → rollback.
- Nội dung: `VITE_MAINTENANCE_TITLE / _MESSAGE / _CONTACT` (đọc lúc build). Chỉ khóa giao diện; Supabase vẫn chạy.

## Học kỳ chọn sẵn + Block 3 (25/10)

- Học kỳ trong form môn: chọn kỳ (Spring T1–5 / Summer T5–9 / Fall T9–12) + năm, vẫn lưu chữ `"Fall 2026"` như cũ (`lib/semester.ts`).
  Môn mới mặc định kỳ đang học; học kỳ cũ gõ tự do được giữ làm 1 lựa chọn riêng.
- 3 Block: enum `block_name` thêm `'Block 3'` (migration 009). Danh sách Block dùng chung `BLOCKS` trong `lib/labels.ts`; AI tool cũng nhận Block 3.

## Email tổng hợp mỗi sáng – Brevo (25/10)

- Chọn **Brevo** (300 email/ngày miễn phí, chỉ cần xác minh 1 email gửi, không bắt buộc tên miền). Resend cần tên miền mới gửi được cho người khác;
  Gmail SMTP: Edge Function không mở được cổng 25 / 587 và dễ bị Google khóa tài khoản.
- `due_email_digest()` gom việc quá hạn (≤ 30 ngày) + hạn hôm nay + ngày mai theo giờ VN, cả deadline nhóm; tối đa 15 việc / email, 300 người / lần.
  Chỉ ghi `email_log` khi Brevo nhận → mỗi người 1 email / ngày. Mặc định **tắt**, người dùng tự bật trong Cài đặt.
- Hủy nhận: link `/unsubscribe?t=<mã>` (phải bấm nút xác nhận, vì trình quét thư rác hay tự mở link) + header `List-Unsubscribe` một chạm (RFC 8058)
  gọi thẳng Edge Function. Không trả trang HTML từ Edge Function (Supabase đổi `text/html` thành `text/plain`).
- `unsubscribe_token` không đọc được từ client (quyền đọc theo cột), chỉ đổi lựa chọn qua `set_email_digest()`.

## Mời vào nhóm cần đồng ý (24/10)

- Chủ nhóm gõ tên (không cần dấu) hoặc email đầy đủ → gợi ý tối đa 3 tài khoản (`search_invitable_users_limited`) → "Mời".
  Người được mời thấy lời mời ở chuông Thông báo + đầu trang Nhóm → Đồng ý mới vào nhóm; Từ chối thì chủ nhóm thấy "Đã từ chối", mời lại được.
- Bỏ policy insert của chủ nhóm trên `group_members`: thêm thẳng = vào nhóm không cần đồng ý. Test dùng helper `join(owner, g, uid)`.
- Bỏ dấu bằng `unaccent_vi()` (translate cả chữ hoa: `lower()` không đổi chữ có dấu khi database dùng locale C) – không cần extension `unaccent`.
- Gợi ý chỉ trả email đã che; gõ email thì phải đúng hẳn mới khớp, để không dò được danh sách email. `add_group_member` (bản cũ) giờ chỉ gửi lời mời.
- UI: `components/groups/InviteMembers.tsx` (ô tìm + gợi ý + lời mời đã gửi), `InvitationList.tsx` (Đồng ý / Từ chối, dùng ở trang Nhóm và chuông).

## AI agent (Groq) – `backend/supabase/functions/ai-chat/`

- Vòng lặp agent tối đa 3 lượt, tool calling; máy chủ kiểm tra từng lệnh gọi công cụ (`tools.ts`) và báo OK / LỖI cho mô hình tự sửa;
  lượt cuối `tool_choice: 'none'`; 429 ngắn thì chờ rồi thử lại 1 lần; bỏ `<think>`.
- Công cụ chỉ tạo **đề xuất** (deadline, môn, lịch học, buổi tự học), người dùng bấm "Thêm". `knowledge.ts` = system prompt ngắn.
- Frontend: `lib/aiAgent.ts` (ngữ cảnh gửi kèm, kiểm tra lại đề xuất, thứ tự lưu môn → lịch → deadline → buổi tự học).
  Lịch sử chat lưu `localStorage` theo tài khoản (tối đa 30), xóa khi đăng xuất. `DraftState.savedId` để "Xem nhiệm vụ" mở đúng thẻ.
- Sự cố đã gặp: `llama-3.3-70b-versatile` bị gỡ → `qwen/qwen3.8-27b`; `max_tokens` > giới hạn phút bị từ chối (≤ 800);
  `reasoning_effort: 'none'` làm Qwen không gọi công cụ.

## Tài khoản & quản trị

- Đăng nhập: **mọi email hợp lệ** (trigger `enforce_valid_email` trên `auth.users`) + Google OAuth (`prompt: 'select_account'`).
- Admin chỉ quản lý TÀI KHOẢN (admin chỉnh cấu hình máy chủ cũ đã bị gỡ vì rủi ro). Khóa = ban Supabase Auth + policy RESTRICTIVE +
  xóa Web Push; không tự khóa / tự hạ quyền; luôn còn ≥ 1 admin. `LockedScreen.tsx` khi bị khóa.
- Số điện thoại ở **bảng riêng** `user_private` (bạn cùng nhóm đọc được mọi cột của `users`). 8–14 chữ số, cho phép `+`.
- MSSV tự do, chỉ ký tự tiếng Anh, tối đa 14 (`toEnglishCode` trong `lib/profile.ts` đổi chữ có dấu về không dấu khi gõ).
- **Trang Quản trị nhanh** (24/10): `admin_list_users()` (SQL, chỉ service_role) trả trang người dùng + SĐT + lần đăng nhập gần nhất
  + tổng + thống kê + nhật ký trong 1 truy vấn (trước ~26 lời gọi API). Edge Function kiểm tra rate limit và quyền song song.
  Frontend: bộ nhớ đệm trong RAM (không lưu xuống ổ vì có PII), tải trước khi rê chuột / chạm vào mục "Quản trị".

## Nhắc deadline

- 6 mốc người dùng chọn (Cài đặt → Thông báo): 3 ngày, 1 ngày, 3 giờ, 1 giờ, 15 phút, đúng giờ hạn; mặc định 3d / 24h / 1h / due.
  Mỗi deadline chỉ nhận **mốc gần nhất** trong các mốc đã bật; không nhắc bù; mỗi mốc 1 lần (`reminder_log`).
- Máy chủ: `due_reminders()` + `functions/send-reminders` (cron 5 phút) → nhắc cả khi đã đóng app. Trong app: `lib/reminders.ts`
  (`computeReminders` khớp logic SQL), `lib/reminderPrefs.ts` (localStorage + bảng `reminder_prefs`), cùng tag với Web Push.
- Kiểm tra máy chủ thật (23/10, chỉ đọc): đã deploy `send-reminders`, có VAPID + CRON_SECRET; **chưa có VAPID_SUBJECT** (mặc định);
  không kiểm được pg_cron bằng CLI → người dùng tự kiểm bằng SQL (README.md mục Edge Functions).

## Tối ưu hệ thống (24/10/2026)

- **Migration**: 20 file → 4 file theo chức năng, chạy lại an toàn, tự nâng cấp DB cũ. Đã kiểm chứng bằng `tests/schema-diff.mjs`:
  cài mới = cũ (chỉ khác: thêm `admin_list_users`, index `users_created_idx`, 2 dòng chú thích); chạy 2 lần = 1 lần; cũ + mới = mới.
  Bản sao 20 file cũ: trong file sao lưu `UNIFLAT_backup_2026-10-23.tgz` (cạnh thư mục dự án).
- **Frontend**: bỏ `recharts` (~370 KB, thay bằng biểu đồ CSS `WeeklyProgressChart.tsx`); tải lười trợ lý AI (sau khi trình duyệt rảnh) và
  trang Đăng nhập. JS lúc mở app ~309 → ~182 KB gzip; precache PWA 1.347 → 1.036 KiB.
- **Bỏ Docker** (người dùng deploy Vercel): xóa `docker-compose.yml`, `Dockerfile`, `docker/`, `.env.example` gốc và `/config.js`
  (script đồng bộ trong `<head>`, SW lấy NetworkFirst → chặn vẽ trang ở mỗi lần mở app). Cấu hình chỉ còn `VITE_*`.
- **Tài liệu**: gộp README frontend / backend vào `README.md`; nhật ký này rút gọn theo chủ đề.

## Rà soát bảo mật (24/10/2026)

Mỗi lỗ hổng có test mô phỏng tấn công trong `tests/rls.test.mjs` (nhóm "Bảo mật – …") – các test này đã THẤT BẠI trên schema cũ.

| Mức | Lỗ hổng | Sửa |
|---|---|---|
| Cao | **SSRF**: người dùng ghi thẳng `push_subscriptions` (bỏ qua RPC) với endpoint tùy ý → `send-reminders` gửi request tới đó | Chỉ còn quyền đọc / xóa; ghi qua `register_push_subscription`; trigger + `is_push_endpoint()` chỉ nhận dịch vụ push của trình duyệt; Edge Function kiểm tra lại (`isPushEndpoint`) |
| Trung bình | Bạn cùng nhóm đọc được `locked_reason` / `locked_at` (ghi chú của admin) | Quyền SELECT theo cột trên `users`; chính chủ xem qua `my_lock_info()`. Frontend không dùng `select('*')` cho `users` (`USER_COLUMNS`) |
| Trung bình | Metadata đăng ký do người dùng tự gửi: `avatar_url` trỏ máy chủ lạ (lộ IP bạn cùng nhóm), họ tên dài vô hạn | `handle_new_user` chỉ nhận ảnh `*.googleusercontent.com`, họ tên ≤ 100 ký tự, bỏ ký tự điều khiển |
| Trung bình | CSP cho kết nối / ảnh tới mọi domain HTTPS (XSS thì gửi dữ liệu đi đâu cũng được) | `connect-src` / `img-src` chỉ Supabase + ảnh Google; thêm `upgrade-insecure-requests`, COOP |
| Thấp | Chủ nhóm sửa `course_id` sang môn người khác → thành viên đọc trộm môn | Policy sửa nhóm kiểm tra môn như lúc tạo |
| Thấp | Thành viên đổi `created_by` của phần việc → xóa được việc người khác | Trigger cấm đổi `created_by` |
| Thấp | Tự đặt link chia sẻ vô thời hạn / số lượt đã dùng âm | Policy: `use_count = 0`, hạn ≤ 30 ngày, `max_uses` ≤ 10000 |
| Thấp | Ô chữ tự do không giới hạn (nhồi dữ liệu) | Ràng buộc độ dài `NOT VALID` + `maxLength` ở form |

Không có lỗi: XSS (không dùng `innerHTML`, `RichText` không render HTML), open redirect (đường dẫn quay lại chỉ nhận nội bộ; SW chỉ mở URL cùng
origin), quyền admin (không tự khóa / tự hạ quyền, luôn ≥ 1 admin), cron secret so sánh thời gian hằng, `npm audit` 0 lỗ hổng.
Còn lại phía người dùng: đặt secret `ALLOWED_ORIGINS` (đang trống → CORS `*`), bật "Leaked password protection" trong Supabase Auth.

## Sự cố đã gặp (để không lặp lại)

- Edge Function `.env` chỉ là file local: phải `secrets set` + `functions deploy` thì máy chủ mới có.
- VS Code báo `Cannot find name 'Deno'`: `.vscode/settings.json` (`deno.enablePaths`) + cài extension Deno.
- Tailwind v4: `translate-*` / `rotate-*` / `scale-*` dùng thuộc tính CSS riêng (`translate`, `rotate`, `scale`); hiệu ứng tự viết dùng
  cùng thuộc tính đó hoặc `transform` cho đúng.
- Hoạt ảnh `opacity` với fill `both` / `forwards` giữ stacking context → modal bên trong bị kẹt dưới thanh tiêu đề. Chuyển trang dùng
  `animate-page-in` (fill `backwards`).
- `scrollbar-gutter: stable` tạo dải trống ở mép phải trang đăng nhập → đã bỏ.
- Git Bash đổi đường dẫn `/calendar` trong biến môi trường → `MSYS_NO_PATHCONV=1`.

## Việc người dùng cần tự làm (chưa xác nhận)

1. Chạy (lại) 4 file migration trong SQL Editor (an toàn cho DB đang chạy; có `admin_list_users` + các bản vá bảo mật 24/10).
2. Deploy lại: `npx supabase functions deploy admin-users`, `send-reminders --no-verify-jwt` (trong `backend/`).
2b. Đặt secret `ALLOWED_ORIGINS=https://<domain-vercel>,http://localhost:5173` → `secrets set` (đang trống: mọi website gọi được API).
3. Build + deploy frontend lên Vercel.
4. Kiểm tra lịch pg_cron (README.md); thiếu thì làm DEPLOY.md Bước 21. Thêm `VAPID_SUBJECT` vào secrets (nên).
5. Bật Google provider (Google Cloud OAuth Client + Supabase) nếu chưa.
