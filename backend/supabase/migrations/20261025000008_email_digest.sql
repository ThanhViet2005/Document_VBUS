-- =====================================================================
-- UniPlan 8 – Email tổng hợp nhiệm vụ mỗi sáng (gửi qua Brevo, Edge Function send-email-digest).
--   * email_prefs: người dùng TỰ BẬT trong Cài đặt (mặc định tắt). unsubscribe_token dùng cho link "Hủy nhận" trong email.
--   * due_email_digest(): mỗi người 1 dòng gồm việc QUÁ HẠN + đến hạn HÔM NAY + NGÀY MAI (theo giờ Việt Nam),
--     chỉ service_role gọi. Cron chạy 7:00 sáng (xem backend/supabase/cron_send_email_digest.sql).
--   * email_log: mỗi người tối đa 1 email / ngày.
-- Cần chạy sau 20261024000007_group_invitations.sql. Chạy lại nhiều lần an toàn.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Lựa chọn nhận email
-- ---------------------------------------------------------------------
create table if not exists public.email_prefs (
  user_id           uuid primary key references public.users (id) on delete cascade,
  enabled           boolean not null default false,
  unsubscribe_token uuid not null default gen_random_uuid() unique,
  updated_at        timestamptz not null default now()
);

alter table public.email_prefs enable row level security;
revoke all on public.email_prefs from anon, authenticated;
-- Chỉ ĐỌC lựa chọn của mình; ghi qua set_email_digest() (không tự đặt / đổi unsubscribe_token)
grant select (user_id, enabled, updated_at) on public.email_prefs to authenticated;

drop policy if exists "email_prefs: xem của mình" on public.email_prefs;
create policy "email_prefs: xem của mình" on public.email_prefs
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "email_prefs: chặn tài khoản bị khóa" on public.email_prefs;
create policy "email_prefs: chặn tài khoản bị khóa" on public.email_prefs
  as restrictive for all to authenticated
  using (not (select public.is_locked_user())) with check (not (select public.is_locked_user()));

create or replace function public.set_email_digest(p_enabled boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or public.is_locked_user() then
    raise exception 'Không thể đổi cài đặt email' using errcode = '42501';
  end if;
  perform public.rate_limit_rpc('set_email_digest', 20);
  insert into public.email_prefs (user_id, enabled)
  values (auth.uid(), coalesce(p_enabled, false))
  on conflict (user_id) do update set enabled = excluded.enabled, updated_at = now();
  return coalesce(p_enabled, false);
end;
$$;

-- Link "Hủy nhận" trong email: không cần đăng nhập, chỉ cần mã bí mật (uuid ngẫu nhiên) của người nhận
create or replace function public.unsubscribe_email_digest(p_token uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with u as (
    update public.email_prefs set enabled = false, updated_at = now()
    where unsubscribe_token = p_token
    returning 1
  )
  select exists (select 1 from u);
$$;

-- ---------------------------------------------------------------------
-- 2. Nhật ký đã gửi (chỉ service_role): 1 email / người / ngày
-- ---------------------------------------------------------------------
create table if not exists public.email_log (
  user_id     uuid not null references public.users (id) on delete cascade,
  digest_date date not null,
  sent_at     timestamptz not null default now(),
  primary key (user_id, digest_date)
);
alter table public.email_log enable row level security; -- không có policy: chỉ service_role
revoke all on public.email_log from anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Danh sách cần gửi
--    p_only_user: gửi thử cho 1 người (bỏ qua công tắc bật / nhật ký, trả cả khi không có việc nào).
-- ---------------------------------------------------------------------
create or replace function public.due_email_digest(p_now timestamptz default now(), p_only_user uuid default null)
returns table (
  user_id uuid, email text, full_name text, unsubscribe_token uuid,
  overdue_count integer, today_count integer, tomorrow_count integer, items jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with bounds as (
    -- Đầu ngày hôm nay / ngày mai / ngày kia theo giờ Việt Nam
    select (p_now at time zone 'Asia/Ho_Chi_Minh')::date as today,
           ((p_now at time zone 'Asia/Ho_Chi_Minh')::date + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh' as tomorrow_start,
           ((p_now at time zone 'Asia/Ho_Chi_Minh')::date + 2)::timestamp at time zone 'Asia/Ho_Chi_Minh' as after_start
  ),
  open_tasks as (
    select d.id, d.title, d.due_date, d.group_id, d.user_id as owner_id, c.code as course_code,
           case
             when d.due_date < p_now then 'overdue'
             when d.due_date < b.tomorrow_start then 'today'
             else 'tomorrow'
           end as bucket
    from public.deadlines d
    cross join bounds b
    left join public.courses c on c.id = d.course_id
    where d.status <> 'done'
      -- Quá hạn quá 30 ngày thì thôi nhắc (tránh email dài mãi vì việc đã bỏ)
      and d.due_date >= p_now - interval '30 days'
      and d.due_date < b.after_start
  ),
  recipients as (
    select t.*, t.owner_id as uid from open_tasks t where t.group_id is null
    union all
    select t.*, gm.user_id from open_tasks t join public.group_members gm on gm.group_id = t.group_id
  ),
  people as (
    select u.id, u.email, u.full_name, coalesce(p.unsubscribe_token, '00000000-0000-0000-0000-000000000000'::uuid) as token
    from public.users u
    left join public.email_prefs p on p.user_id = u.id
    where not u.is_locked
      and (
        (p_only_user is not null and u.id = p_only_user)
        or (
          p_only_user is null
          and p.enabled
          and not exists (select 1 from public.email_log l, bounds b where l.user_id = u.id and l.digest_date = b.today)
        )
      )
  )
  select pe.id, pe.email, pe.full_name, pe.token,
         count(r.id) filter (where r.bucket = 'overdue')::integer,
         count(r.id) filter (where r.bucket = 'today')::integer,
         count(r.id) filter (where r.bucket = 'tomorrow')::integer,
         coalesce(
           (select jsonb_agg(jsonb_build_object('id', x.id, 'title', x.title, 'course_code', x.course_code, 'due_date', x.due_date, 'bucket', x.bucket)
                             order by x.bucket <> 'overdue', x.due_date)
            from (select * from recipients r2 where r2.uid = pe.id
                  order by r2.bucket <> 'overdue', r2.due_date limit 15) x),
           '[]'::jsonb)
  from people pe
  left join recipients r on r.uid = pe.id
  group by pe.id, pe.email, pe.full_name, pe.token
  having p_only_user is not null or count(r.id) > 0
  order by count(r.id) filter (where r.bucket = 'overdue') desc, pe.id
  -- Gói miễn phí Brevo: 300 email / ngày
  limit 300;
$$;

-- ---------------------------------------------------------------------
-- 4. Quyền gọi hàm
-- ---------------------------------------------------------------------
revoke execute on function public.set_email_digest(boolean)                 from public, anon;
grant execute on function public.set_email_digest(boolean)                  to authenticated;
revoke execute on function public.unsubscribe_email_digest(uuid)            from public, anon, authenticated;
grant execute on function public.unsubscribe_email_digest(uuid)             to service_role;
revoke execute on function public.due_email_digest(timestamptz, uuid)       from public, anon, authenticated;
grant execute on function public.due_email_digest(timestamptz, uuid)        to service_role;

notify pgrst, 'reload schema';
