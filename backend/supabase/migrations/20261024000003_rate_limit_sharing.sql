-- =====================================================================
-- UniPlan 3/4 – Chống spam (rate limit), chia sẻ deadline, mời thành viên nhóm
--
-- Rate limit: client ghi dữ liệu trực tiếp qua PostgREST nên giới hạn đặt ngay trong database (trigger), không đường nào
-- vòng qua được. Ghi dữ liệu: đếm theo user, cửa sổ 60 giây. RPC công khai get_shared_deadline: đếm theo IP.
-- Edge Functions (AI, quản trị): gọi check_rate_limit() bằng JWT người dùng. Vượt giới hạn → SQLSTATE PT429 → HTTP 429.
-- Ngữ cảnh không có người dùng (SQL Editor, seed, service_role) không bị giới hạn.
--
-- Chia sẻ deadline: người nhận chỉ đọc qua RPC (đúng các trường cần để sao chép, không lộ dữ liệu khác của người gửi).
-- Cần chạy sau 20261024000002_accounts_admin.sql. Chạy lại nhiều lần an toàn.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Bộ đếm
-- ---------------------------------------------------------------------
create table if not exists public.rate_limits (
  bucket       text not null,
  subject      text not null, -- user id hoặc 'ip:<địa chỉ>'
  window_start timestamptz not null,
  hits         integer not null default 0,
  primary key (bucket, subject, window_start)
);

alter table public.rate_limits enable row level security; -- không có policy: client không đụng tới được
revoke all on public.rate_limits from anon, authenticated;

create index if not exists rate_limits_window_idx on public.rate_limits (window_start);

-- IP của request do PostgREST đưa vào request.headers
create or replace function public.request_ip()
returns text
language sql
stable
set search_path = ''
as $$
  select nullif(trim(coalesce(
    nullif(current_setting('request.headers', true), '')::json ->> 'cf-connecting-ip',
    split_part(nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for', ',', 1)
  )), '');
$$;

-- Hàm nội bộ: tăng bộ đếm, ném PT429 khi vượt giới hạn. Không cấp quyền cho client.
create or replace function public.consume_rate_limit(p_bucket text, p_subject text, p_max integer, p_window_seconds integer default 60)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits integer;
begin
  if p_subject is null then
    return;
  end if;

  insert into public.rate_limits as r (bucket, subject, window_start, hits)
  values (p_bucket, p_subject, v_window, 1)
  on conflict (bucket, subject, window_start) do update set hits = r.hits + 1
  returning hits into v_hits;

  if v_hits > p_max then
    raise exception 'Bạn thao tác quá nhanh (tối đa % lần / % giây). Vui lòng thử lại sau ít phút.', p_max, p_window_seconds
      using errcode = 'PT429', hint = 'rate_limited';
  end if;

  -- Dọn dẹp ngẫu nhiên các cửa sổ cũ (~1% số lần gọi)
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '1 hour';
  end if;
end;
$$;

-- Cho Edge Functions / client: chỉ đếm cho chính người đang đăng nhập
create or replace function public.check_rate_limit(p_bucket text, p_max integer, p_window_seconds integer default 60)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Cần đăng nhập' using errcode = '42501';
  end if;
  if p_bucket !~ '^[a-z_]{1,32}$' or p_max < 1 or p_window_seconds not between 1 and 3600 then
    raise exception 'Tham số rate limit không hợp lệ' using errcode = '22023';
  end if;
  perform public.consume_rate_limit('fn:' || p_bucket, auth.uid()::text, p_max, p_window_seconds);
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Giới hạn ghi dữ liệu (tham số trigger = số lần tối đa mỗi phút).
--    Chỉ đếm câu lệnh trực tiếp của người dùng (pg_trigger_depth() = 1); thao tác dây chuyền (ON DELETE CASCADE / SET NULL,
--    trigger thêm chủ nhóm...) chạy ở depth > 1 nên không bị tính: xóa 1 môn có nhiều deadline không bị chặn oan.
-- ---------------------------------------------------------------------
create or replace function public.enforce_write_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and pg_trigger_depth() <= 1 then
    perform public.consume_rate_limit('write:' || tg_table_name, auth.uid()::text, tg_argv[0]::integer, 60);
  end if;
  return coalesce(new, old);
end;
$$;

do $$
declare
  r record;
begin
  -- bảng, sự kiện, số lần / phút
  for r in
    select * from (values
      ('deadlines',          'insert or update or delete', '60'),
      ('subtasks',           'insert or update or delete', '200'),
      ('courses',            'insert or update or delete', '60'),
      ('schedules',          'insert or update or delete', '60'),
      ('exams',              'insert or update or delete', '60'),
      ('groups',             'insert or update or delete', '20'),
      ('group_members',      'insert or delete',           '30'),
      ('assignments',        'insert or update or delete', '60'),
      ('share_links',        'insert or delete',           '20'),
      ('study_sessions',     'insert or update or delete', '60'),
      ('push_subscriptions', 'insert',                     '20'),
      ('users',              'update',                     '20')
    ) as v (tbl, events, max_per_min)
  loop
    execute format('drop trigger if exists %I on public.%I', r.tbl || '_rate_limit', r.tbl);
    execute format('create trigger %I before %s on public.%I for each row execute function public.enforce_write_rate_limit(%L)',
                   r.tbl || '_rate_limit', r.events, r.tbl, r.max_per_min);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Chia sẻ deadline
-- ---------------------------------------------------------------------
-- Xem trước deadline được chia sẻ: CHỈ trả về các trường cần để sao chép. Giới hạn theo IP (anon) hoặc theo user.
create or replace function public.get_shared_deadline(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  perform public.consume_rate_limit(
    'rpc:get_shared_deadline',
    coalesce(auth.uid()::text, 'ip:' || public.request_ip()),
    60, 60
  );

  select jsonb_build_object(
    'title',      d.title,
    'task_type',  d.task_type,
    'due_date',   d.due_date,
    'priority',   d.priority,
    'notes',      case when l.include_notes then d.notes end,
    'expires_at', l.expires_at,
    'course',     case when c.id is null then null else jsonb_build_object(
                    'code', c.code, 'name', c.name, 'color_code', c.color_code, 'block_name', c.block_name) end,
    'subtasks',   coalesce((
                    select jsonb_agg(jsonb_build_object('title', s.title) order by s.position, s.created_at)
                    from public.subtasks s where s.deadline_id = d.id
                  ), '[]'::jsonb)
  )
  into v_result
  from public.share_links l
  join public.deadlines d on d.id = l.deadline_id
  left join public.courses c on c.id = d.course_id
  where l.code = p_code
    and (l.expires_at is null or l.expires_at > now())
    and (l.max_uses is null or l.use_count < l.max_uses);

  return v_result;
end;
$$;

-- Sao chép deadline được chia sẻ vào lịch cá nhân của người đang đăng nhập.
-- Tự tạo môn học tương ứng (theo mã môn) nếu người nhận chưa có. Trả về id deadline mới.
create or replace function public.copy_shared_deadline(p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_link public.share_links%rowtype;
  v_src public.deadlines%rowtype;
  v_src_course public.courses%rowtype;
  v_course_id uuid;
  v_new_id uuid;
begin
  if v_uid is null then
    raise exception 'Cần đăng nhập để sao chép deadline' using errcode = '42501';
  end if;

  select * into v_link from public.share_links
  where code = p_code
    and (expires_at is null or expires_at > now())
    and (max_uses is null or use_count < max_uses)
  for update;

  if not found then
    raise exception 'Link chia sẻ không tồn tại hoặc đã hết hạn' using errcode = 'P0002';
  end if;

  select * into v_src from public.deadlines where id = v_link.deadline_id;

  if v_src.course_id is not null then
    select * into v_src_course from public.courses where id = v_src.course_id;

    select id into v_course_id from public.courses
    where user_id = v_uid and code = v_src_course.code
    order by created_at desc
    limit 1;

    if v_course_id is null then
      insert into public.courses (user_id, code, name, color_code, block_name, semester)
      values (v_uid, v_src_course.code, v_src_course.name, v_src_course.color_code, v_src_course.block_name, v_src_course.semester)
      returning id into v_course_id;
    end if;
  end if;

  insert into public.deadlines (user_id, course_id, title, task_type, due_date, priority, notes)
  values (
    v_uid, v_course_id, v_src.title, v_src.task_type, v_src.due_date, v_src.priority,
    case when v_link.include_notes then v_src.notes end
  )
  returning id into v_new_id;

  insert into public.subtasks (deadline_id, title, position)
  select v_new_id, s.title, s.position from public.subtasks s where s.deadline_id = v_src.id;

  update public.share_links set use_count = use_count + 1 where id = v_link.id;

  return v_new_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Mời thành viên nhóm bằng email. RLS không cho xem hồ sơ người lạ nên tra cứu email trong hàm SECURITY DEFINER,
--    chỉ trả thông tin tối thiểu của người vừa được thêm (null nếu email chưa đăng ký).
-- ---------------------------------------------------------------------
create or replace function public.add_group_member(p_group_id uuid, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user public.users%rowtype;
begin
  if not public.is_group_owner(p_group_id) then
    raise exception 'Chỉ chủ nhóm mới được thêm thành viên' using errcode = '42501';
  end if;

  select * into v_user from public.users where lower(email) = lower(trim(p_email));
  if not found then
    -- Trả null thay vì raise: raise sẽ rollback cả bộ đếm rate limit (cho phép dò email không giới hạn)
    return null;
  end if;

  insert into public.group_members (group_id, user_id, role)
  values (p_group_id, v_user.id, 'member')
  on conflict (group_id, user_id) do nothing;

  return jsonb_build_object(
    'user_id', v_user.id,
    'full_name', v_user.full_name,
    'email', v_user.email,
    'avatar_url', v_user.avatar_url
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Bản có giới hạn của các RPC trên (client chỉ được gọi bản này).
--    Nếu RPC bên trong raise lỗi thì bộ đếm cũng bị rollback; vì vậy add_group_member trả null (không raise) khi
--    không tìm thấy email để việc dò email vẫn bị đếm.
-- ---------------------------------------------------------------------
create or replace function public.rate_limit_rpc(p_name text, p_max integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.consume_rate_limit('rpc:' || p_name, coalesce(auth.uid()::text, 'ip:' || public.request_ip()), p_max, 60);
end;
$$;

create or replace function public.copy_shared_deadline_limited(p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.rate_limit_rpc('copy_shared_deadline', 10);
  return public.copy_shared_deadline(p_code);
end;
$$;

create or replace function public.add_group_member_limited(p_group_id uuid, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.rate_limit_rpc('add_group_member', 20);
  return public.add_group_member(p_group_id, p_email);
end;
$$;

-- ---------------------------------------------------------------------
-- 6. Quyền gọi hàm
-- ---------------------------------------------------------------------
revoke execute on function public.request_ip()                                    from public, anon, authenticated;
revoke execute on function public.consume_rate_limit(text, text, integer, integer) from public, anon, authenticated;
revoke execute on function public.enforce_write_rate_limit()                      from public, anon, authenticated;
revoke execute on function public.rate_limit_rpc(text, integer)                   from public, anon, authenticated;
revoke execute on function public.copy_shared_deadline(text)                      from public, anon, authenticated;
revoke execute on function public.add_group_member(uuid, text)                    from public, anon, authenticated;
revoke execute on function public.check_rate_limit(text, integer, integer)        from public, anon;
revoke execute on function public.copy_shared_deadline_limited(text)              from public, anon;
revoke execute on function public.add_group_member_limited(uuid, text)            from public, anon;
revoke execute on function public.get_shared_deadline(text)                       from public;

grant execute on function public.check_rate_limit(text, integer, integer)         to authenticated;
grant execute on function public.copy_shared_deadline_limited(text)               to authenticated;
grant execute on function public.add_group_member_limited(uuid, text)             to authenticated;
grant execute on function public.get_shared_deadline(text)                        to anon, authenticated;
