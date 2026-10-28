# Hướng dẫn chạy & deploy UniPlan (từng bước)

Làm **lần lượt từ trên xuống**. Mỗi bước gồm: **Làm gì**, **Bạn sẽ thấy gì** (để biết đã đúng chưa) và đôi khi **Tại sao**.
Các lệnh chạy được trong PowerShell, Command Prompt hoặc Git Bash trên Windows.

---

## Phần 0: Hiểu bức tranh tổng thể (đọc 1 phút)

```
  Người dùng bấm link
         │
         ▼
┌──────────────────────┐     gọi API (anon key + RLS)     ┌───────────────────────────────┐
│  VERCEL               │ ───────────────────────────────▶ │  SUPABASE                      │
│  thư mục frontend/    │                                  │  thư mục backend/              │
│  (giao diện React)    │ ◀─────────────────────────────── │  Database + Đăng nhập +        │
│  https://xxx.vercel.app│        dữ liệu của chính bạn    │  Edge Functions (AI, nhắc nhở) │
└──────────────────────┘                                  └───────────────────────────────┘
```

- **Vercel** chỉ chứa giao diện. Ai bấm link cũng tải được giao diện về.
- **Supabase** chứa dữ liệu và tài khoản. RLS đảm bảo mỗi người chỉ đọc được dữ liệu của mình.
- Chưa nối Supabase thì giao diện tự chạy **chế độ demo** (dữ liệu mẫu, không lưu).

Thứ tự làm: **chạy thử ở máy → đưa giao diện lên Vercel (có link) → tạo Supabase → nối hai bên → kiểm tra.**
Ta deploy Vercel trước vì cần biết **địa chỉ link** để khai báo cho Supabase ở Phần 3.

---

## Phần 1: Chạy thử trên máy của bạn

### Bước 1. Kiểm tra Node.js

```bash
node -v
```

**Bạn sẽ thấy:** `v20.x.x` trở lên. Nếu báo *không nhận lệnh* hoặc số nhỏ hơn 20: tải bản **LTS** tại https://nodejs.org, cài xong
**đóng và mở lại** cửa sổ terminal.

### Bước 2. Chạy giao diện

```bash
cd D:\THANHVIET\WORK\SOFTWARE_ENGINEER\UNIFLAT\frontend
npm install
npm run dev
```

**Bạn sẽ thấy:** `Local: http://localhost:5173/`. Mở địa chỉ đó trên trình duyệt → Dashboard với dữ liệu mẫu (chế độ demo).
Bấm `Ctrl + C` trong terminal để tắt.

> `npm install` chỉ cần chạy lần đầu (hoặc khi `package.json` thay đổi). Lần sau chỉ cần `npm run dev`.

### Bước 3. (Nên làm) Kiểm tra bản production và backend

```bash
npm run build          # Bạn sẽ thấy: "✓ built in ..." và "PWA ... files generated"
```

Nếu bước này lỗi thì Vercel cũng sẽ lỗi, nên sửa ở máy trước. Kiểm tra backend (không cần tài khoản Supabase):

```bash
cd ..\backend
npm install
npm test               # Bạn sẽ thấy: "pass 36" và "fail 0"
```

---

## Phần 2: Đưa giao diện lên Vercel (có link demo)

### Bước 4. Tạo tài khoản Vercel

Vào https://vercel.com → **Sign Up** → chọn **Continue with GitHub** (hoặc Email). Chọn gói **Hobby** (miễn phí).

### Bước 5. Đăng nhập Vercel từ terminal

```bash
cd D:\THANHVIET\WORK\SOFTWARE_ENGINEER\UNIFLAT\frontend
npx vercel login
```

- Lần đầu sẽ hỏi `Need to install the following packages: vercel ... Ok to proceed?` → gõ `y`, Enter.
- Trình duyệt tự mở trang xác nhận → bấm **Confirm / Authorize**.

**Bạn sẽ thấy:** `Congratulations! You are now logged in.`

### Bước 6. Tạo project trên Vercel

**Quan trọng:** phải đang đứng trong thư mục `frontend` (như Bước 5).

```bash
npx vercel link
```

Trả lời các câu hỏi (dùng phím mũi tên + Enter):

| Vercel hỏi | Trả lời |
| --- | --- |
| Set up “…\frontend”? | **Yes** |
| Which scope should contain your project? | Chọn tài khoản của bạn |
| Link to existing project? | **No** |
| What’s your project’s name? | `uniplan` (hoặc tên khác, chỉ chữ thường và dấu `-`) |
| In which directory is your code located? | `./` (Enter luôn) |
| Want to modify these settings? | **No** (Vercel tự nhận Vite; `vercel.json` đã có sẵn cấu hình) |

**Bạn sẽ thấy:** `✅ Linked to <tài-khoản>/uniplan`. Một thư mục ẩn `.vercel` được tạo (đã nằm trong `.gitignore`).

### Bước 7. Deploy lần đầu

```bash
npx vercel deploy --prod
```

**Bạn sẽ thấy** (sau 1–2 phút):

```
✅  Production: https://uniplan-xxxx.vercel.app
```

🎉 **Đây là link của bạn.** Mở thử → thấy Dashboard demo. **Chép link này lại**, Phần 3 sẽ cần.

> **Link nào gửi cho người khác?** Vào https://vercel.com → project `uniplan` → mục **Domains** để xem domain chính thức (dạng
> `uniplan-xxxx.vercel.app`). Chỉ gửi domain đó. Những link dài có chuỗi ngẫu nhiên là bản *preview*: người ngoài mở sẽ bị đòi
> đăng nhập Vercel.
>
> Muốn tên đẹp hơn: Settings → **Domains** → Edit → đổi thành vd `uniplan-fpt.vercel.app` (nếu chưa ai dùng).
> Đổi tên thì nhớ dùng tên **mới** ở Phần 3.

Đến đây bạn đã có **link demo**: ai bấm cũng dùng thử được, nhưng dữ liệu chưa lưu. Các phần sau biến nó thành bản thật.

---

## Phần 3: Tạo backend trên Supabase

### Bước 8. Tạo project Supabase

1. Vào https://supabase.com → **Start your project** → đăng nhập bằng GitHub.
2. **New project**:
   - **Name:** `uniplan`
   - **Database Password:** bấm *Generate a password* → **lưu lại** ở nơi an toàn
   - **Region:** **Southeast Asia (Singapore)** (gần Việt Nam nên nhanh nhất)
3. **Create new project** → chờ khoảng 2 phút.

**Bạn sẽ thấy:** trang tổng quan của project. Địa chỉ trình duyệt có dạng
`https://supabase.com/dashboard/project/abcdxyz...`; đoạn `abcdxyz...` là **project-ref**.

### Bước 9. Tạo bảng và bảo mật (chạy 11 file migration)

**Tại sao:** 4 file này tạo bảng, bật bảo mật RLS, kiểm tra email, chống spam, nhắc deadline... Phải chạy **đúng thứ tự**, vì file sau
dùng bảng của file trước.

1. Menu trái → **SQL Editor** → **New query**.
2. Trong VS Code, mở `backend/supabase/migrations/20261024000001_core.sql` → `Ctrl + A`, `Ctrl + C`.
3. Dán vào SQL Editor → bấm **Run** (hoặc `Ctrl + Enter`).
   **Bạn sẽ thấy:** `Success. No rows returned`.
4. Xoá nội dung ô soạn thảo, lặp lại cho các file còn lại **theo đúng thứ tự**:

   ```
   ☐ 20261024000001_core.sql                Bảng học tập, nhóm, deadline, RLS
   ☐ 20261024000002_accounts_admin.sql      Đăng ký, hồ sơ, ảnh đại diện, quản trị tài khoản
   ☐ 20261024000003_rate_limit_sharing.sql  Chống spam, chia sẻ deadline, mời thành viên
   ☐ 20261024000004_reminders.sql           Nhắc deadline (Web Push), mốc nhắc tự chọn
   ☐ 20261024000005_course_custom_color.sql Màu môn học tự chọn (bảng màu)
   ☐ 20261024000006_course_lecturer.sql     Tên giảng viên của môn học
   ☐ 20261024000007_group_invitations.sql   Mời vào nhóm: gợi ý theo tên, phải đồng ý mới vào nhóm
   ☐ 20261025000008_email_digest.sql        Email tổng hợp nhiệm vụ mỗi sáng (Brevo)
   ☐ 20261025000009_block3.sql              Thêm Block 3 cho môn học và thời khóa biểu
   ☐ 20261028000010_notify_schedule.sql     Nhắc Chrome trước 1 ngày + 1 giờ, email hôm nay + quá hạn, mã cho lịch chạy
   ☐ 20261028000011_sync_user_email.sql     Đổi email đăng nhập thì hồ sơ đổi theo
   ```

5. Kiểm tra: menu trái → **Table Editor**. **Bạn sẽ thấy** các bảng `users`, `courses`, `deadlines`, `groups`, `study_sessions`...

> Nếu một file báo lỗi: **dừng lại**, đừng chạy file sau. Chụp màn hình thông báo lỗi để xử lý.
> Supabase có thể hiện cảnh báo *"potential issue / destructive operation"*: bấm **Run this query** để xác nhận là được.
> Cả 11 file chạy lại nhiều lần vẫn an toàn (không mất dữ liệu).

### Bước 10. Khai báo địa chỉ web cho phần đăng nhập

**Tại sao:** khi người dùng bấm link trong email xác nhận, Supabase cần biết trả họ về trang nào. Mặc định Supabase trả về
`localhost`, nên người khác sẽ không vào được.

Menu trái → **Authentication** → **URL Configuration**:

1. **Site URL:** dán link ở Bước 7, vd `https://uniplan-xxxx.vercel.app` → **Save**.
2. **Redirect URLs** → **Add URL**, thêm lần lượt 2 dòng:
   ```
   https://uniplan-xxxx.vercel.app/**
   http://localhost:5173/**
   ```

### Bước 11. Chọn cách xác nhận email

Menu trái → **Authentication** → **Sign In / Providers** → **Email**:

- **Demo cho lớp hoặc hội đồng** (nhiều người đăng ký cùng lúc): **tắt "Confirm email"** → Save.
  *Tại sao:* gói miễn phí chỉ gửi được vài email mỗi giờ, người đăng ký sau sẽ không nhận được mail. App nhận mọi email hợp lệ;
  email sai định dạng bị chặn ngay trong database (`20261024000002_accounts_admin.sql`).
- **Chạy thật lâu dài:** bật Confirm email và cấu hình SMTP riêng (Authentication → Emails → SMTP Settings, dùng Resend hoặc Brevo
  miễn phí).

### Bước 11b. (Tuỳ chọn, nên làm) Đăng nhập nhanh bằng Google

App nhận **mọi email** (Gmail, email trường...). Nút **"Tiếp tục với Google"** ở trang Đăng nhập / Đăng ký cần 2 bước cấu hình;
chưa làm thì bấm nút sẽ báo *"Đăng nhập bằng Google chưa được bật trên máy chủ"*, đăng nhập bằng email + mật khẩu vẫn chạy bình thường.

**1. Tạo OAuth Client trên Google Cloud** (https://console.cloud.google.com):

1. Tạo project (hoặc chọn project có sẵn) → **APIs & Services** → **OAuth consent screen**: User type **External**, điền tên app
   `UniPlan`, email hỗ trợ → Save. Mục **Audience** → **Publish app** (để mọi Gmail đăng nhập được, không chỉ tài khoản test).
2. **Credentials** → **Create credentials** → **OAuth client ID** → loại **Web application**:
   - **Authorized JavaScript origins:** `https://uniplan-xxxx.vercel.app` và `http://localhost:5173`
   - **Authorized redirect URIs:** `https://<project-ref>.supabase.co/auth/v1/callback`
     (vd `https://vstmnuivhqtgdghxmnxb.supabase.co/auth/v1/callback`)
3. Bấm **Create** → chép **Client ID** và **Client secret** (secret là **bí mật**, không dán vào frontend / GitHub).

**2. Bật Google trong Supabase:** menu trái → **Authentication** → **Sign In / Providers** → **Google** → bật **Enable** →
dán Client ID + Client secret → **Save**.

**Bạn sẽ thấy:** bấm "Tiếp tục với Google" → chọn tài khoản Gmail → quay lại UniPlan đã đăng nhập, họ tên và ảnh đại diện lấy từ Google.
Người đã đăng ký bằng email + mật khẩu mà dùng Google cùng địa chỉ thì Supabase tự gộp vào **cùng 1 tài khoản** (dữ liệu giữ nguyên).

### Bước 12. Lấy 2 giá trị để nối với giao diện

Bấm nút **Connect** ở đầu trang (hoặc **Project Settings → API Keys**). Chép lại:

| Tên | Trông như thế nào |
| --- | --- |
| **Project URL** | `https://abcdxyz....supabase.co`, **chỉ phần gốc**: không có `/rest/v1/`, không có dấu cách ở đầu |
| **anon / publishable key** | `eyJhbGciOi...` (rất dài) hoặc `sb_publishable_...` |

⚠️ **KHÔNG** chép `service_role` hay `sb_secret_...`: đó là chìa khoá vạn năng, bỏ qua mọi RLS. Nếu bạn lỡ dán nhầm, app sẽ báo lỗi
và từ chối.

---

## Phần 4: Nối giao diện với Supabase

### Bước 13. Đặt biến môi trường trên Vercel

Vào https://vercel.com → project **uniplan** → **Settings** → **Environment Variables**. Thêm 2 biến (mỗi biến: điền Key, Value,
tích cả **Production** và **Preview**, rồi **Save**):

| Key | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | Project URL ở Bước 12 |
| `VITE_SUPABASE_ANON_KEY` | anon/publishable key ở Bước 12 |

### Bước 14. Deploy lại

**Tại sao:** biến `VITE_*` được gắn vào code **lúc build**. Thêm biến xong mà không build lại thì app vẫn là bản demo cũ.

```bash
cd D:\THANHVIET\WORK\SOFTWARE_ENGINEER\UNIFLAT\frontend
npx vercel deploy --prod
```

(Hoặc trên web: **Deployments** → bản mới nhất → nút **⋯** → **Redeploy**.)

### Bước 15. Đăng ký tài khoản đầu tiên

Mở link (nên dùng **tab ẩn danh** để tránh bản cũ trong bộ nhớ đệm).

**Bạn sẽ thấy:** trang **Đăng nhập** (không còn là Dashboard demo). Bấm **Đăng ký** → nhập email bất kỳ (hoặc bấm **Tiếp tục với Google**) → vào được
Dashboard trống.

### Bước 16. (Tuỳ chọn) Dữ liệu mẫu để trình diễn

**Tạo tài khoản quản trị (admin) đầu tiên:** đăng ký tài khoản đó trên app trước, rồi chạy trong SQL Editor (thay email):

```sql
update public.users set role = 'admin' where email = 'ban@fpt.edu.vn';
```

Đăng nhập lại → thanh điều hướng có thêm mục **Quản trị** để thêm / sửa / phân quyền / khóa tài khoản khác.
Admin không chỉnh được cấu hình máy chủ: key và cấu hình vẫn chỉ nằm ở biến môi trường (Bước 13, 18).

Muốn một tài khoản có sẵn môn học, lịch, deadline để trình diễn: đăng ký tài khoản đó trước, mở `backend/supabase/seed_demo.sql`,
sửa dòng `v_email` thành email của tài khoản, dán vào SQL Editor → Run.

---

## Phần 5: Kiểm tra trước khi gửi link cho mọi người

- [ ] Mở link ở tab ẩn danh → thấy trang Đăng nhập
- [ ] Gõ thẳng `https://.../tasks` → nhấn F5 → không bị lỗi 404
- [ ] Đăng ký bằng `abc@gmail.com` → hiện lỗi đỏ, không gửi được
- [ ] Đăng ký bằng email (Gmail / email trường) → vào được Dashboard
- [ ] Bấm **Tiếp tục với Google** → chọn Gmail → vào được Dashboard (nếu đã làm Bước 11b)
- [ ] Tạo 1 deadline → F5 → vẫn còn
- [ ] Đăng nhập **tài khoản khác** → **không** thấy deadline của tài khoản đầu (RLS hoạt động)
- [ ] Bấm **Gửi cho bạn** trên 1 deadline → mở link đó ở tab ẩn danh → chỉ thấy đúng deadline đó
- [ ] Mở link trên điện thoại → menu trình duyệt có **Cài đặt ứng dụng** / **Thêm vào Màn hình chính**
- [ ] Cài đặt → **Chụp ảnh** → trình duyệt hỏi quyền camera → chụp → **Dùng ảnh này** → ảnh đại diện đổi ngay
      (camera chỉ hoạt động qua HTTPS, link Vercel đã có sẵn HTTPS; header `Permissions-Policy: camera=(self)` đã cấu hình trong `vercel.json`)

Tất cả đạt → gửi link production cho mọi người. ✅

---

## Phần 6 (tuỳ chọn): AI Chat bằng Groq và nhắc deadline khi đóng app

Không làm phần này thì app vẫn chạy đủ. AI Chat vẫn hiểu câu đơn giản như *"nộp lab 3 PRF192 thứ 6 23h59"*,
và nhắc nhở vẫn hiện khi đang mở app.

### Bước 17. Nối Supabase CLI với project

```bash
cd D:\THANHVIET\WORK\SOFTWARE_ENGINEER\UNIFLAT\backend
npx supabase login                                  # trình duyệt mở → Authorize
npx supabase link --project-ref <project-ref>       # project-ref ở Bước 8; hỏi mật khẩu → mật khẩu database ở Bước 8
```

### Bước 18. Điền file bí mật cho Edge Functions

File `backend/supabase/functions/.env` **đã được tạo sẵn**, trong đó đã có `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` và
`CRON_SECRET` sinh ngẫu nhiên. Bạn chỉ cần mở bằng VS Code, **bỏ dấu `#` đầu dòng** và điền:

- `ALLOWED_ORIGINS=https://uniplan-xxxx.vercel.app,http://localhost:5173` (nên điền)
- `GROQ_API_KEY=gsk_...` (nếu dùng AI Chat)
- `VAPID_SUBJECT=mailto:ban@fpt.edu.vn`

> Làm lại trên máy khác, hoặc lỡ xoá file: `copy supabase\functions\.env.example supabase\functions\.env`, rồi chạy
> `npm run vapid:generate` để tạo khoá mới. Nếu tạo khoá mới thì phải cập nhật `VITE_VAPID_PUBLIC_KEY` ở Bước 20, và người dùng
> phải bật lại thông báo.

Nội dung đầy đủ trông như sau:

```
GROQ_API_KEY=gsk_...
ALLOWED_ORIGINS=https://uniplan-xxxx.vercel.app,http://localhost:5173
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:ban@fpt.edu.vn
CRON_SECRET=...
```

| Biến | Lấy ở đâu |
| --- | --- |
| `GROQ_API_KEY` | Key Groq tại https://console.groq.com/keys (miễn phí, dạng `gsk_...`). Bỏ trống nếu không dùng AI |
| `ALLOWED_ORIGINS` | Domain Vercel ở Bước 7, **không** có dấu `/` ở cuối |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Chép từ lệnh `vapid:generate` (khoá PRIVATE là **bí mật**) |
| `CRON_SECRET` | Tự gõ 1 chuỗi ngẫu nhiên dài, vd 40 ký tự chữ và số |

Không viết ghi chú `# ...` trên cùng dòng với giá trị: phần ghi chú sẽ bị coi là một phần của giá trị.
File này **không** được đưa lên GitHub (đã có trong `.gitignore`).

### Bước 19. Đưa bí mật và function lên Supabase

```bash
npx supabase secrets set --env-file supabase/functions/.env
npx supabase functions deploy ai-chat
npx supabase functions deploy admin-users
npx supabase functions deploy send-reminders --no-verify-jwt
```

**Bạn sẽ thấy:** `Deployed Functions ... ai-chat`, v.v. Kiểm tra ở menu trái → **Edge Functions**: có 3 function (`ai-chat`, `admin-users`, `send-reminders`); thêm `send-email-digest` nếu làm Bước 23.

### Bước 20. Báo khoá công khai cho giao diện

Vercel → Settings → Environment Variables → thêm `VITE_VAPID_PUBLIC_KEY` = giá trị `VAPID_PUBLIC_KEY` trong file ở Bước 18
(giá trị này cũng đã có sẵn trong `frontend/.env` cho lúc chạy ở máy) → làm lại **Bước 14**.

### Bước 21. Hẹn giờ gửi nhắc nhở mỗi 5 phút

1. Mở `backend/supabase/cron_send_reminders.sql` → dán vào SQL Editor → **Run** (tự bật `pg_cron`, `pg_net`).
   Không cần sửa gì: mã xác thực lấy từ bảng `cron_token` do migration 010 tự sinh, **không** cần chép `CRON_SECRET` vào Vault.
2. Kiểm tra sau ~5 phút: `select status_code, content from net._http_response order by created desc limit 3;`
   → `200` và `{"due":…,"sent":…}` là đúng. `401` = chưa chạy migration 010 hoặc chưa deploy lại `send-reminders`.

### Bước 22. Thử

Trên app: **Cài đặt → Thông báo nhắc deadline** → **Bật** → trình duyệt hỏi quyền → **Cho phép** → bấm **Gửi thông báo thử**.

**Bạn sẽ thấy:** một thông báo hệ điều hành *"UniPlan…"*. Tạo deadline hạn trong vòng 1 giờ, đóng app, đợi tối đa 5 phút
→ thông báo nhắc nhở hiện ra.

> iPhone/iPad: mở link bằng **Safari** → nút Chia sẻ → **Thêm vào Màn hình chính** → mở UniPlan **từ icon đó** rồi mới bật thông báo.

### Bước 23. (Tuỳ chọn) Email tổng hợp nhiệm vụ mỗi sáng qua Brevo (miễn phí 300 email/ngày)

Người dùng tự bật ở **Cài đặt → Email tổng hợp mỗi sáng**. 7:00 sáng mỗi ngày, ai có việc
nhận 1 email gồm việc **hạn hôm nay** và việc **quá hạn** (ngày không có việc thì không gửi). Cần làm xong Bước 17–21 trước.

1. Tạo tài khoản miễn phí tại https://www.brevo.com (không cần thẻ).
2. Brevo → **Senders, Domains & Dedicated IPs** → **Senders** → **Add a sender** → nhập email gửi (vd một Gmail riêng cho UniPlan)
   → mở hộp thư đó, bấm link xác minh.
3. Brevo → **SMTP & API** → **API Keys** → **Generate a new API key** → chép key (dạng `xkeysib-...`, là **bí mật**).
4. Mở `backend/supabase/functions/.env`, thêm (bỏ `#` nếu có):
   ```
   BREVO_API_KEY=xkeysib-...
   EMAIL_FROM=email-đã-xác-minh-ở-bước-2
   EMAIL_FROM_NAME=UniPlan
   APP_URL=https://uniplan-xxxx.vercel.app
   ```
5. Đưa lên Supabase:
   ```bash
   npx supabase secrets set --env-file supabase/functions/.env
   npx supabase functions deploy send-email-digest --no-verify-jwt
   ```
6. Mở `backend/supabase/cron_send_email_digest.sql` → dán vào SQL Editor → **Run** (không cần sửa gì, chạy lại vẫn an toàn).
7. Thử: app → **Cài đặt → Email tổng hợp mỗi sáng** → **Gửi email thử**.

**Bạn sẽ thấy:** email *"UniPlan: ..."* trong hộp thư đăng nhập (lần đầu có thể nằm ở **Thư rác** / **Quảng cáo**: bấm "Không phải thư rác").

> Gửi từ địa chỉ Gmail qua Brevo dễ bị xếp vào thư rác. Khi có nhiều người dùng, nên mua 1 tên miền rẻ, thêm vào Brevo
> (**Domains** → xác thực DKIM / DMARC theo hướng dẫn) rồi đổi `EMAIL_FROM` sang địa chỉ thuộc tên miền đó.
> Gói miễn phí tối đa 300 email/ngày: quá số đó thì người có nhiều việc quá hạn được gửi trước.

---

## Phần 7: Lỗi thường gặp

| Hiện tượng | Nguyên nhân | Cách sửa |
| --- | --- | --- |
| `npx vercel link` / deploy báo không thấy `package.json` | Chạy lệnh ngoài thư mục `frontend` | `cd ...\UNIFLAT\frontend` rồi chạy lại |
| F5 ở trang con bị 404 | Project Vercel không lấy `frontend` làm gốc | Settings → General → **Root Directory** = `frontend` (nếu deploy qua GitHub) → Redeploy |
| Đã thêm biến mà app vẫn là demo | Chưa build lại | Làm lại Bước 14 (bỏ chọn *Use existing Build Cache* nếu Redeploy trên web) |
| Người khác bấm link thì thấy trang đăng nhập **Vercel** | Gửi nhầm link preview | Gửi domain production (Bước 7) |
| Link trong email xác nhận mở ra `localhost` | Chưa làm Bước 10 | Làm Bước 10 |
| Đăng ký không nhận được email / báo *"thao tác quá nhanh"* | Giới hạn email của gói miễn phí | Bước 11: tắt Confirm email hoặc thêm SMTP |
| *"Email không hợp lệ"* | Email sai định dạng (thiếu @, có khoảng trắng, tên miền sai) | Nhập lại đúng email |
| *"Đăng nhập bằng Google chưa được bật trên máy chủ"* | Chưa làm Bước 11b | Bật Google provider trong Supabase |
| Google báo *redirect_uri_mismatch* | Redirect URI trên Google Cloud chưa đúng | Dùng đúng `https://<project-ref>.supabase.co/auth/v1/callback` |
| AI Chat báo lỗi kết nối hoặc CORS | `ALLOWED_ORIGINS` thiếu đúng domain Vercel | Sửa `.env` (Bước 18) → chạy lại lệnh `secrets set` ở Bước 19 |
| Sau khoảng 1 tuần không ai dùng, app không kết nối được | Gói miễn phí Supabase tự **tạm dừng** project | Supabase Dashboard → project → **Restore** |
| Deploy bản mới mà máy vẫn hiện bản cũ | Service Worker (PWA) còn giữ bản cũ | Đóng **hết** tab UniPlan rồi mở lại |

## Phần 8: Cập nhật về sau

- Sửa giao diện → `cd frontend` → `npx vercel deploy --prod`. Link giữ nguyên.
- Sửa database → tạo **file migration mới** (đánh số tiếp theo, vd `20261101000005_...sql`, viết sao cho chạy lại an toàn)
  → chạy trong SQL Editor. **Không** sửa file migration đã chạy.
- **Database tạo bằng bộ migration cũ** (20 file `20261016000001_schema.sql` … `20261023000020_reminder_prefs.sql`, đã gom lại ngày
  24/10/2026): chỉ cần chạy lại 4 file ở Bước 9 theo thứ tự. Các file tự bổ sung phần còn thiếu, dọn đối tượng cũ, **không mất dữ liệu**;
  kết quả giống hệt cài mới (đã kiểm chứng bằng `node tests/schema-diff.mjs`).
- Sửa Edge Function → `npx supabase functions deploy <tên-function>`.
- Muốn mỗi lần `git push` là Vercel tự deploy: đưa code lên GitHub → Vercel → **Add New → Project** → Import repo → đặt
  **Root Directory = `frontend`** → thêm lại các biến ở Bước 13 và 20.

---

## Phần 9: Tạm ngưng hệ thống (màn hình bảo trì) và khôi phục

Thay toàn bộ giao diện bằng **1 màn hình tạm ngưng** lịch sự (*"Hệ thống đang tạm ngưng. Vui lòng liên hệ bộ phận kỹ thuật để gia hạn dịch vụ."*),
kể cả trên máy đã lưu app cũ trong bộ nhớ đệm hoặc đã cài app (PWA). Khôi phục bằng **Rollback** trên Vercel, không sửa code.

> Điều kiện: bản đang chạy phải là bản có tự kiểm tra cập nhật (từ 25/10/2026, `src/lib/pwa.ts`). Bản cũ hơn → deploy bản thường
> mới nhất trước 1 lần, để tab đang mở sẵn trên máy người dùng cũng tự chuyển sang màn hình tạm ngưng.

### Tạm ngưng

1. (Tùy chọn) Vercel → project → **Settings → Environment Variables** → thêm (cho Production):
   - `VITE_MAINTENANCE_CONTACT` = email và / hoặc số điện thoại liên hệ, cách nhau bởi dấu phẩy (vd `kythuat@abc.com, 0905123456`)
   - `VITE_MAINTENANCE_TITLE`, `VITE_MAINTENANCE_MESSAGE` nếu muốn đổi câu mặc định
2. Deploy bản bảo trì:
   ```bash
   cd frontend
   npm run deploy:maintenance
   ```
3. **Bạn sẽ thấy:** mọi đường dẫn của web chỉ hiện màn hình tạm ngưng.
   - Người đang mở app: tự chuyển sang màn hình tạm ngưng khi quay lại tab (hoặc chậm nhất ~15 phút), **không cần F5**.
   - Máy đã lưu app cũ / app đã cài: lần mở tới tự tải lại 1 lần rồi hiện màn hình tạm ngưng. Mất mạng cũng chỉ thấy màn hình này.
   - Bộ nhớ đệm của bản cũ trên máy người dùng bị xóa.

> Màn hình tạm ngưng chỉ khóa **giao diện web**. Supabase (database, Edge Function, lịch nhắc / email) vẫn chạy.
> Muốn dừng cả nhắc deadline và email trong thời gian tạm ngưng: SQL Editor →
> `select cron.unschedule('uniplan-send-reminders'); select cron.unschedule('uniplan-send-email-digest');`
> (khôi phục: chạy lại 2 file `cron_send_*.sql`).

### Khôi phục (sau khi được gia hạn)

1. Vercel → project → **Deployments** → chọn bản Production **ngay trước** bản bảo trì (bản thường) → nút **⋯** → **Instant Rollback**
   (hoặc **Promote to Production**) → xác nhận.
2. **Bạn sẽ thấy:** web hoạt động lại ngay. Người đang mở màn hình tạm ngưng bấm **Thử lại** (hoặc quay lại tab) là vào app; dữ liệu còn nguyên.

> Sau khi Rollback, Vercel có thể **tạm dừng tự gắn tên miền** cho các lần deploy Production tiếp theo. Lần deploy bản mới sau đó
> mà link chưa đổi: Deployments → bản mới nhất → **⋯ → Promote to Production**.
> Cách khác không cần Rollback: `npm run deploy` để deploy lại bản thường.

Thử trên máy trước (không đụng web thật): `npm run build:maintenance` rồi `npm run preview` → mở http://localhost:4173.

