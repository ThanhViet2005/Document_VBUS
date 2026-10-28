-- =====================================================================
-- UniPlan 2/4 – Tài khoản & quản trị
--   * Đăng ký: tạo hồ sơ public.users, nhận MỌI email hợp lệ (chặn ngay tại auth.users, không tin trình duyệt).
--   * Hồ sơ: người dùng chỉ sửa 4 cột (họ tên, MSSV, cơ sở, ảnh đại diện), dữ liệu được kiểm tra trong database.
--   * Ảnh đại diện: bucket Storage "avatars" (xem công khai, chỉ ghi vào thư mục <uid>/ của mình, ≤ 2 MB, PNG/JPEG/WebP).
--   * Quản trị: nhật ký thao tác admin, số điện thoại (bảng riêng), danh sách người dùng cho trang Quản trị.
--     Admin chỉ quản lý TÀI KHOẢN (không chỉnh cấu hình máy chủ); mọi thao tác ghi đi qua Edge Function admin-users.
--
-- Tạo admin đầu tiên (SQL Editor, thay email):
--   update public.users set role = 'admin' where email = 'ban@fpt.edu.vn';
-- Cần chạy sau 20261024000001_core.sql. Chạy lại nhiều lần an toàn.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Dọn đối tượng của bộ migration cũ (đã thay thế). Không ảnh hưởng dữ liệu.
-- ---------------------------------------------------------------------
drop trigger if exists enforce_fpt_email on auth.users;
drop function if exists public.enforce_fpt_email();
drop function if exists public.set_system_setting(text, text);
drop function if exists public.list_system_settings();
drop function if exists public.is_app_admin();
drop table if exists public.system_settings;
drop table if exists public.app_admins;

-- ---------------------------------------------------------------------
-- 1. Đăng ký: tạo hồ sơ + kiểm tra email
-- ---------------------------------------------------------------------
-- Metadata đăng ký do NGƯỜI DÙNG tự gửi (gọi thẳng API Auth được), nên làm sạch trước khi lưu:
--   * MSSV hợp lệ (ký tự tiếng Anh, 1–14 ký tự) thì lưu; không thì bỏ qua để không làm hỏng việc đăng ký.
--   * Họ tên: bỏ ký tự điều khiển, gộp khoảng trắng, tối đa 100 ký tự.
--   * Ảnh đại diện: chỉ nhận ảnh của Google (đăng nhập bằng Google). Link khác bị bỏ: ảnh trỏ ra máy chủ lạ sẽ lộ IP
--     của bạn cùng nhóm mỗi khi họ xem danh sách thành viên.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'student_code', '')), '');
  v_name text := left(nullif(regexp_replace(trim(regexp_replace(coalesce(new.raw_user_meta_data ->> 'full_name', ''), '[[:cntrl:]]', '', 'g')), '\s+', ' ', 'g'), ''), 100);
  v_avatar text := new.raw_user_meta_data ->> 'avatar_url';
begin
  insert into public.users (id, email, full_name, student_code, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(v_name, left(split_part(new.email, '@', 1), 100)),
    case when v_code ~ '^[ -~]{1,14}$' then v_code end,
    case when char_length(v_avatar) <= 1000 and v_avatar ~ '^https://[a-z0-9-]+\.googleusercontent\.com/[^\s"<>]*$' then v_avatar end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Email hợp lệ (Gmail, Outlook, email trường...): phần trước @ gồm chữ, số và . _ % + - ;
-- tên miền gồm các nhãn chữ / số / gạch ngang ngăn bởi dấu chấm, đuôi ≥ 2 chữ cái. Khớp EMAIL_REGEX ở frontend.
create or replace function public.is_allowed_email(p_email text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    char_length(trim(p_email)) <= 254
    and lower(trim(p_email)) ~ '^[a-z0-9._%+-]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$',
    false
  );
$$;

-- SECURITY DEFINER: Supabase Auth ghi auth.users bằng role supabase_auth_admin (không có quyền gọi is_allowed_email)
create or replace function public.enforce_valid_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.email is not distinct from old.email then
    return new;
  end if;
  if not public.is_allowed_email(new.email) then
    raise exception 'Email không hợp lệ' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_valid_email on auth.users;
create trigger enforce_valid_email
  before insert or update of email on auth.users
  for each row execute function public.enforce_valid_email();

-- ---------------------------------------------------------------------
-- 2. Hồ sơ: quyền sửa theo cột + kiểm tra dữ liệu
-- ---------------------------------------------------------------------
-- Không có email / role / is_locked: không tự đổi email thành email người khác, không tự nâng quyền / mở khóa
revoke update on public.users from authenticated, anon;
grant update (full_name, student_code, campus, avatar_url) on public.users to authenticated;

create or replace function public.validate_user_profile()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Chuẩn hóa
  new.full_name := regexp_replace(trim(coalesce(new.full_name, '')), '\s+', ' ', 'g');
  new.student_code := nullif(trim(coalesce(new.student_code, '')), '');
  new.campus := trim(coalesce(new.campus, ''));
  new.avatar_url := nullif(trim(coalesce(new.avatar_url, '')), '');

  if new.full_name is distinct from old.full_name
     -- Chặn chữ số / ký hiệu thay vì liệt kê chữ cái: [[:alpha:]] không nhận chữ tiếng Việt khi database dùng locale C
     and (char_length(new.full_name) not between 2 and 100 or new.full_name ~ '[0-9<>{}()@#$%^&*_+=|/:;"!?.,~]') then
    raise exception 'Họ và tên từ 2 đến 100 ký tự, chỉ gồm chữ cái' using errcode = '22023';
  end if;

  -- MSSV: ký tự tiếng Anh (ASCII in được), 1–14 ký tự, giữ nguyên hoa / thường. Chỉ kiểm tra khi MSSV đổi.
  if new.student_code is distinct from old.student_code
     and new.student_code is not null
     and new.student_code !~ '^[ -~]{1,14}$' then
    raise exception 'Mã số sinh viên chỉ gồm ký tự tiếng Anh (chữ không dấu, số, ký hiệu), tối đa 14 ký tự' using errcode = '22023';
  end if;

  if new.campus is distinct from old.campus and new.campus not in (
    'FPT University Hà Nội', 'FPT University Hồ Chí Minh', 'FPT University Đà Nẵng',
    'FPT University Cần Thơ', 'FPT University Quy Nhơn'
  ) then
    raise exception 'Cơ sở không hợp lệ' using errcode = '22023';
  end if;

  -- Ảnh chỉ được trỏ vào thư mục của CHÍNH MÌNH trong bucket avatars (không cho link ngoài theo dõi IP bạn cùng nhóm)
  if new.avatar_url is distinct from old.avatar_url and new.avatar_url is not null
     and new.avatar_url !~ ('^https?://[^/]+/storage/v1/object/public/avatars/' || new.id::text || '/[A-Za-z0-9._-]+$') then
    raise exception 'Ảnh đại diện phải được tải lên từ UniPlan' using errcode = '22023';
  end if;

  return new;
end;
$$;

drop trigger if exists users_validate_profile on public.users;
create trigger users_validate_profile
  before update on public.users
  for each row execute function public.validate_user_profile();

-- Lý do khóa: chỉ chính chủ xem (cột locked_reason không cấp quyền đọc cho authenticated, xem file 1/4)
create or replace function public.my_lock_info()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('is_locked', coalesce(u.is_locked, false), 'locked_at', u.locked_at, 'locked_reason', u.locked_reason)
  from (select 1) x
  left join public.users u on u.id = auth.uid();
$$;

-- ---------------------------------------------------------------------
-- 3. Storage: bucket avatars
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Ảnh hiển thị qua URL public (không cần policy SELECT). Policy SELECT này chỉ để liệt kê / ghi đè file của chính mình.
drop policy if exists "avatars: xem file trong thư mục của mình" on storage.objects;
create policy "avatars: xem file trong thư mục của mình" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "avatars: tải lên vào thư mục của mình" on storage.objects;
create policy "avatars: tải lên vào thư mục của mình" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "avatars: ghi đè file của mình" on storage.objects;
create policy "avatars: ghi đè file của mình" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "avatars: xóa file của mình" on storage.objects;
create policy "avatars: xóa file của mình" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------------------------------------------------------------------
-- 4. Nhật ký thao tác của admin (ghi bằng service role trong Edge Function; admin chỉ đọc)
-- ---------------------------------------------------------------------
create table if not exists public.admin_audit_log (
  id         bigint generated always as identity primary key,
  admin_id   uuid references public.users (id) on delete set null,
  target_id  uuid references public.users (id) on delete set null,
  action     text not null check (action in ('create', 'update', 'lock', 'unlock', 'reset_password', 'change_role')),
  details    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists admin_audit_log_created_idx on public.admin_audit_log (created_at desc);
create index if not exists admin_audit_log_target_idx on public.admin_audit_log (target_id);

alter table public.admin_audit_log enable row level security;
revoke all on public.admin_audit_log from anon, authenticated;
grant select on public.admin_audit_log to authenticated;

drop policy if exists "admin_audit_log: admin xem" on public.admin_audit_log;
create policy "admin_audit_log: admin xem" on public.admin_audit_log
  for select to authenticated
  using ((select public.is_admin()));

-- ---------------------------------------------------------------------
-- 5. Số điện thoại: BẢNG RIÊNG (policy của users cho bạn cùng nhóm đọc mọi cột, để ở đó sẽ lộ số cho cả nhóm).
--    Chỉ chủ tài khoản và admin đọc; ghi qua Edge Function admin-users. 8–14 chữ số, cho phép + đầu số.
-- ---------------------------------------------------------------------
create table if not exists public.user_private (
  user_id    uuid primary key references public.users (id) on delete cascade,
  phone      text,
  updated_at timestamptz not null default now()
);
alter table public.user_private drop constraint if exists user_private_phone_format;
alter table public.user_private add constraint user_private_phone_format check (phone is null or phone ~ '^[+]?[0-9]{8,14}$');

alter table public.user_private enable row level security;
revoke all on public.user_private from anon, authenticated;
grant select on public.user_private to authenticated;

drop policy if exists "user_private: xem của mình" on public.user_private;
create policy "user_private: xem của mình" on public.user_private
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "user_private: admin xem tất cả" on public.user_private;
create policy "user_private: admin xem tất cả" on public.user_private
  for select to authenticated
  using ((select public.is_admin()));

drop policy if exists "user_private: chặn tài khoản bị khóa" on public.user_private;
create policy "user_private: chặn tài khoản bị khóa" on public.user_private
  as restrictive for all to authenticated
  using (not (select public.is_locked_user())) with check (not (select public.is_locked_user()));

-- ---------------------------------------------------------------------
-- 6. Danh sách người dùng cho trang Quản trị: MỘT truy vấn trả về trang người dùng (kèm số điện thoại, lần đăng nhập
--    gần nhất từ auth.users), tổng số theo bộ lọc, số liệu thống kê và (tùy chọn) 50 dòng nhật ký mới nhất.
--    Thay cho ~26 lời gọi API riêng lẻ trước đây (getUserById từng người, đếm từng loại...).
--    Chỉ service_role gọi được (Edge Function admin-users đã kiểm tra người gọi là admin).
-- ---------------------------------------------------------------------
create index if not exists users_created_idx on public.users (created_at desc);

create or replace function public.admin_list_users(
  p_query text default '',
  p_role text default null,
  p_status text default null,
  p_page integer default 0,
  p_page_size integer default 20,
  p_with_audit boolean default false
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with params as (
    select nullif(trim(coalesce(p_query, '')), '') as q,
           nullif(regexp_replace(coalesce(p_query, ''), '[^0-9]', '', 'g'), '') as digits,
           greatest(0, least(coalesce(p_page, 0), 500)) as page,
           greatest(1, least(coalesce(p_page_size, 20), 100)) as size
  ),
  filtered as (
    select u.*, pv.phone
    from public.users u
    left join public.user_private pv on pv.user_id = u.id
    cross join params p
    where (p_role is null or u.role = p_role)
      and (p_status is null or (p_status = 'locked') = u.is_locked)
      and (
        p.q is null
        or u.email ilike '%' || p.q || '%'
        or u.full_name ilike '%' || p.q || '%'
        or u.student_code ilike '%' || p.q || '%'
        or (length(p.digits) >= 3 and pv.phone like '%' || p.digits || '%')
      )
  ),
  page_rows as (
    select f.*, a.last_sign_in_at
    from filtered f
    left join auth.users a on a.id = f.id
    order by f.created_at desc
    offset (select page * size from params)
    limit (select size from params)
  )
  select jsonb_build_object(
    'users', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'email', r.email, 'fullName', r.full_name, 'studentCode', coalesce(r.student_code, ''),
        'phone', coalesce(r.phone, ''), 'campus', r.campus, 'avatarUrl', r.avatar_url, 'role', r.role,
        'isLocked', r.is_locked, 'lockedAt', r.locked_at, 'lockedReason', r.locked_reason,
        'createdAt', r.created_at, 'lastSignInAt', r.last_sign_in_at
      ) order by r.created_at desc)
      from page_rows r
    ), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'pageSize', (select size from params),
    'stats', (
      select jsonb_build_object(
        'total', count(*),
        'admins', count(*) filter (where role = 'admin'),
        'locked', count(*) filter (where is_locked),
        'newThisWeek', count(*) filter (where created_at >= now() - interval '7 days')
      )
      from public.users
    ),
    'audit', case when p_with_audit then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id, 'action', l.action, 'details', l.details, 'created_at', l.created_at,
        'admin', case when ad.id is null then null else jsonb_build_object('email', ad.email, 'full_name', ad.full_name) end,
        'target', case when tg.id is null then null else jsonb_build_object('email', tg.email, 'full_name', tg.full_name) end
      ) order by l.created_at desc)
      from (select * from public.admin_audit_log order by created_at desc limit 50) l
      left join public.users ad on ad.id = l.admin_id
      left join public.users tg on tg.id = l.target_id
    ), '[]'::jsonb) end
  );
$$;

-- ---------------------------------------------------------------------
-- 7. Quyền gọi hàm
-- ---------------------------------------------------------------------
revoke execute on function public.handle_new_user()          from public, anon, authenticated;
revoke execute on function public.enforce_valid_email()      from public, anon, authenticated;
revoke execute on function public.validate_user_profile()    from public, anon, authenticated;
revoke execute on function public.is_allowed_email(text)     from public, anon;
revoke execute on function public.my_lock_info()             from public, anon;
grant execute on function public.my_lock_info()              to authenticated;
grant execute on function public.is_allowed_email(text)      to authenticated;
revoke execute on function public.admin_list_users(text, text, text, integer, integer, boolean) from public, anon, authenticated;
grant execute on function public.admin_list_users(text, text, text, integer, integer, boolean) to service_role;

notify pgrst, 'reload schema';
