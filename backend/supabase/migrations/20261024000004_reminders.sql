-- =====================================================================
-- UniPlan 4/4 – Nhắc deadline bằng Web Push (kể cả khi đã đóng app)
--   * register_push_subscription(): lưu đăng ký push của thiết bị cho người đang đăng nhập. Cùng 1 trình duyệt (endpoint)
--     chỉ thuộc 1 tài khoản: máy dùng chung đổi tài khoản thì đăng ký cũ chuyển sang tài khoản mới. Tối đa 10 thiết bị / người.
--   * reminder_prefs: người dùng tự chọn mốc nhắc (Cài đặt → Thông báo). 6 mốc: trước hạn 3 ngày ('3d'), 1 ngày ('24h'),
--     3 giờ ('3h'), 1 giờ ('1h'), 15 phút ('15m') và lúc đến hạn ('due'). Chưa chọn = mặc định 3d, 24h, 1h, due.
--   * due_reminders(): danh sách cần nhắc, chỉ service_role gọi (Edge Function send-reminders chạy theo cron 5 phút,
--     xem backend/supabase/cron_send_reminders.sql). Với mỗi người nhận lấy MỐC GẦN NHẤT trong các mốc họ bật mà thời gian
--     còn lại đã lọt vào; không gửi bù mốc đã qua; mốc "đến hạn" gửi trong 15 phút sau giờ hạn.
--   * reminder_log: mỗi mốc của mỗi deadline chỉ nhắc 1 lần / người.
-- Cần chạy sau 20261024000003_rate_limit_sharing.sql. Chạy lại nhiều lần an toàn.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Nhật ký đã nhắc (chỉ service_role)
-- ---------------------------------------------------------------------
create table if not exists public.reminder_log (
  deadline_id uuid not null references public.deadlines (id) on delete cascade,
  user_id     uuid not null references public.users (id) on delete cascade,
  kind        text not null,
  sent_at     timestamptz not null default now(),
  primary key (deadline_id, user_id, kind)
);
alter table public.reminder_log drop constraint if exists reminder_log_kind_check;
alter table public.reminder_log add constraint reminder_log_kind_check check (kind in ('3d', '24h', '3h', '1h', '15m', 'due'));

alter table public.reminder_log enable row level security; -- không có policy: chỉ service_role
revoke all on public.reminder_log from anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Mốc nhắc người dùng chọn
-- ---------------------------------------------------------------------
create table if not exists public.reminder_prefs (
  user_id    uuid primary key references public.users (id) on delete cascade,
  kinds      text[] not null default array['3d', '24h', '1h', 'due']::text[],
  updated_at timestamptz not null default now(),
  constraint reminder_prefs_kinds_check check (kinds <@ array['3d', '24h', '3h', '1h', '15m', 'due']::text[])
);

alter table public.reminder_prefs enable row level security;
revoke all on public.reminder_prefs from anon, authenticated;
grant select, insert, update on public.reminder_prefs to authenticated;

drop policy if exists "reminder_prefs: xem của mình" on public.reminder_prefs;
create policy "reminder_prefs: xem của mình" on public.reminder_prefs
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "reminder_prefs: thêm của mình" on public.reminder_prefs;
create policy "reminder_prefs: thêm của mình" on public.reminder_prefs
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "reminder_prefs: sửa của mình" on public.reminder_prefs;
create policy "reminder_prefs: sửa của mình" on public.reminder_prefs
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "reminder_prefs: chặn tài khoản bị khóa" on public.reminder_prefs;
create policy "reminder_prefs: chặn tài khoản bị khóa" on public.reminder_prefs
  as restrictive for all to authenticated
  using (not (select public.is_locked_user())) with check (not (select public.is_locked_user()));

-- ---------------------------------------------------------------------
-- 3. Đăng ký thiết bị nhận push
--    Endpoint CHỈ được là dịch vụ push của trình duyệt (Chrome / Edge / Firefox / Safari). Edge Function send-reminders gửi
--    request tới endpoint này, nên nhận địa chỉ tùy ý = cho người dùng điều khiển máy chủ gửi request đi đâu (SSRF).
-- ---------------------------------------------------------------------
create or replace function public.is_push_endpoint(p_endpoint text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    char_length(p_endpoint) <= 2000
    and p_endpoint ~ '^https://(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/[^\s]*$',
    false
  );
$$;

create or replace function public.validate_push_subscription()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not public.is_push_endpoint(new.endpoint) then
    raise exception 'Endpoint push không hợp lệ' using errcode = '22023';
  end if;
  if new.p256dh !~ '^[A-Za-z0-9_-]{80,100}={0,2}$' or new.auth !~ '^[A-Za-z0-9_-]{16,32}={0,2}$' then
    raise exception 'Khóa push không hợp lệ' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists push_subscriptions_validate on public.push_subscriptions;
create trigger push_subscriptions_validate
  before insert or update of endpoint, p256dh, auth on public.push_subscriptions
  for each row execute function public.validate_push_subscription();

create or replace function public.register_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Cần đăng nhập' using errcode = '42501';
  end if;
  if not public.is_push_endpoint(p_endpoint) then
    raise exception 'Endpoint push không hợp lệ' using errcode = '22023';
  end if;
  if p_p256dh !~ '^[A-Za-z0-9_-]{80,100}={0,2}$' or p_auth !~ '^[A-Za-z0-9_-]{16,32}={0,2}$' then
    raise exception 'Khóa push không hợp lệ' using errcode = '22023';
  end if;

  delete from public.push_subscriptions where endpoint = p_endpoint and user_id <> v_uid;

  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (v_uid, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent;

  -- Tối đa 10 thiết bị / người: bỏ các đăng ký cũ nhất
  delete from public.push_subscriptions
  where user_id = v_uid
    and id not in (
      select id from public.push_subscriptions where user_id = v_uid order by created_at desc limit 10
    );
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Danh sách cần nhắc
-- ---------------------------------------------------------------------
create or replace function public.due_reminders(p_now timestamptz default now())
returns table (user_id uuid, deadline_id uuid, kind text, title text, course_code text, due_date timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  with milestones (kind, lead) as (
    values ('3d', interval '3 days'), ('24h', interval '24 hours'), ('3h', interval '3 hours'),
           ('1h', interval '1 hour'), ('15m', interval '15 minutes'), ('due', interval '0')
  ),
  targets as (
    select d.id, d.title, d.due_date, d.group_id, d.user_id as owner_id, c.code as course_code
    from public.deadlines d
    left join public.courses c on c.id = d.course_id
    where d.status <> 'done'
      and d.due_date > p_now - interval '15 minutes'
      and d.due_date <= p_now + interval '3 days'
  ),
  recipients as (
    select t.id, t.title, t.due_date, t.course_code, t.owner_id as uid
    from targets t where t.group_id is null
    union all
    select t.id, t.title, t.due_date, t.course_code, gm.user_id
    from targets t join public.group_members gm on gm.group_id = t.group_id
  ),
  -- Mốc gần nhất (lead nhỏ nhất) trong các mốc người nhận đã bật mà thời gian còn lại đã lọt vào
  chosen as (
    select distinct on (r.id, r.uid) r.id, r.uid, r.title, r.due_date, r.course_code, m.kind
    from recipients r
    left join public.reminder_prefs p on p.user_id = r.uid
    join milestones m
      on m.kind = any (coalesce(p.kinds, array['3d', '24h', '1h', 'due']::text[]))
     and r.due_date - p_now <= m.lead
     -- "đến hạn" chỉ khi đã tới giờ hạn; các mốc khác chỉ khi chưa tới hạn
     and (m.kind = 'due') = (r.due_date <= p_now)
    order by r.id, r.uid, m.lead
  )
  select ch.uid, ch.id, ch.kind, ch.title, ch.course_code, ch.due_date
  from chosen ch
  where exists (select 1 from public.push_subscriptions s where s.user_id = ch.uid)
    and not exists (
      select 1 from public.reminder_log l
      where l.deadline_id = ch.id and l.user_id = ch.uid and l.kind = ch.kind
    )
  order by ch.due_date
  limit 1000;
$$;

-- ---------------------------------------------------------------------
-- 5. Quyền gọi hàm
-- ---------------------------------------------------------------------
revoke execute on function public.validate_push_subscription() from public, anon, authenticated;
revoke execute on function public.is_push_endpoint(text) from public, anon;
grant execute on function public.is_push_endpoint(text) to authenticated;
revoke execute on function public.register_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.register_push_subscription(text, text, text, text) to authenticated;
revoke execute on function public.due_reminders(timestamptz) from public, anon, authenticated;
grant execute on function public.due_reminders(timestamptz) to service_role;

notify pgrst, 'reload schema';
