-- =====================================================================
-- UniPlan 10 – Lịch thông báo mới:
--   * Email 7:00 sáng: chỉ việc QUÁ HẠN + đến hạn HÔM NAY (bỏ "ngày mai").
--   * Web Push (Chrome) mặc định nhắc TRƯỚC 1 NGÀY và TRƯỚC 1 GIỜ (trước đây: 3 ngày, 1 ngày, 1 giờ, đúng giờ hạn).
--     Người đã tự chọn mốc trong Cài đặt vẫn giữ lựa chọn của mình.
-- Cần chạy sau 20261025000009_block3.sql. Chạy lại nhiều lần an toàn.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Mốc nhắc mặc định: 1 ngày + 1 giờ
-- ---------------------------------------------------------------------
alter table public.reminder_prefs alter column kinds set default array['24h', '1h']::text[];

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
      on m.kind = any (coalesce(p.kinds, array['24h', '1h']::text[]))
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
-- 2. Email 7:00: quá hạn (≤ 30 ngày) + đến hạn hôm nay theo giờ Việt Nam. tomorrow_count giữ cột cho Edge Function, luôn = 0.
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
    select (p_now at time zone 'Asia/Ho_Chi_Minh')::date as today,
           ((p_now at time zone 'Asia/Ho_Chi_Minh')::date + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh' as tomorrow_start
  ),
  open_tasks as (
    select d.id, d.title, d.due_date, d.group_id, d.user_id as owner_id, c.code as course_code,
           case when d.due_date < p_now then 'overdue' else 'today' end as bucket
    from public.deadlines d
    cross join bounds b
    left join public.courses c on c.id = d.course_id
    where d.status <> 'done'
      -- Quá hạn quá 30 ngày thì thôi nhắc (tránh email dài mãi vì việc đã bỏ)
      and d.due_date >= p_now - interval '30 days'
      and d.due_date < b.tomorrow_start
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
         0,
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
-- 3. Mã cho lịch chạy (pg_cron → Edge Function), sinh ngẫu nhiên NGAY TRONG database:
--    cron đọc mã này gửi kèm header x-cron-secret, Edge Function (service role) so với cùng bảng.
--    Không cần chép CRON_SECRET vào Vault bằng tay (dễ quên → function trả 401, không gửi gì).
--    Chỉ postgres / service_role đọc được; người dùng và anon không thấy.
-- ---------------------------------------------------------------------
create table if not exists public.cron_token (
  id    smallint primary key default 1 check (id = 1),
  token text not null default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
);
insert into public.cron_token (id) values (1) on conflict (id) do nothing;
alter table public.cron_token enable row level security; -- không có policy: chỉ service_role
revoke all on public.cron_token from anon, authenticated;

revoke execute on function public.due_reminders(timestamptz)          from public, anon, authenticated;
grant execute on function public.due_reminders(timestamptz)           to service_role;
revoke execute on function public.due_email_digest(timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.due_email_digest(timestamptz, uuid)  to service_role;

notify pgrst, 'reload schema';
