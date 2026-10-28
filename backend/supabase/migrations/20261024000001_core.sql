-- =====================================================================
-- UniPlan 1/4 – Lõi dữ liệu học tập
--   Kiểu dữ liệu, bảng (hồ sơ, môn, thời khóa biểu, kỳ thi, nhóm, deadline, subtask, phần việc nhóm, link chia sẻ,
--   thiết bị Web Push, buổi tự học), index, hàm kiểm tra quyền, trigger, Row Level Security, Realtime.
--
-- Nguyên tắc bảo mật:
--   * Bật RLS cho MỌI bảng trong schema public; anon không truy cập trực tiếp bảng nào.
--   * Deadline cá nhân: chỉ chủ sở hữu. Deadline nhóm: thành viên nhóm.
--   * Tài khoản bị admin khóa: policy RESTRICTIVE chặn mọi dữ liệu (kể cả token cũ chưa hết hạn).
--   * Hàm SECURITY DEFINER luôn có set search_path = ''.
--
-- Chạy 4 file theo thứ tự tên (SQL Editor của Supabase). Mỗi file chạy lại nhiều lần an toàn và tự nâng cấp
-- database tạo bằng bộ migration cũ (20261016000001 … 20261023000020).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Kiểu dữ liệu + hàm tiện ích
-- ---------------------------------------------------------------------
do $$
begin
  create type public.task_type as enum ('assignment', 'lab', 'practical', 'revision', 'group_project');
exception when duplicate_object then null;
end $$;
do $$
begin
  create type public.priority_level as enum ('low', 'medium', 'high');
exception when duplicate_object then null;
end $$;
do $$
begin
  create type public.task_status as enum ('todo', 'in_progress', 'done');
exception when duplicate_object then null;
end $$;
do $$
begin
  create type public.exam_type as enum ('PE', 'FE');
exception when duplicate_object then null;
end $$;
do $$
begin
  create type public.block_name as enum ('Block 1', 'Block 2');
exception when duplicate_object then null;
end $$;
do $$
begin
  create type public.course_color as enum ('red', 'blue', 'purple', 'orange', 'green', 'teal', 'pink', 'amber');
exception when duplicate_object then null;
end $$;
do $$
begin
  create type public.group_role as enum ('owner', 'member');
exception when duplicate_object then null;
end $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Mã chia sẻ ngắn (8 ký tự, không dễ đoán, bỏ các ký tự dễ nhầm 0/O, 1/l/I)
create or replace function public.generate_share_code(len integer default 8)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  bytes bytea := decode(md5(gen_random_uuid()::text || clock_timestamp()::text), 'hex');
  result text := '';
begin
  for i in 0 .. len - 1 loop
    result := result || substr(alphabet, (get_byte(bytes, i) % length(alphabet)) + 1, 1);
  end loop;
  return result;
end;
$$;

-- ---------------------------------------------------------------------
-- 1. Bảng
-- ---------------------------------------------------------------------

-- Hồ sơ người dùng, 1-1 với auth.users (tạo tự động bằng trigger ở file 2/4).
-- role / is_locked: chỉ Edge Function admin-users (service role) đổi được; người dùng chỉ sửa 4 cột hồ sơ (file 2/4).
create table if not exists public.users (
  id            uuid primary key references auth.users (id) on delete cascade,
  email         text not null unique,
  full_name     text not null default '',
  student_code  text,
  campus        text not null default 'FPT University Đà Nẵng',
  avatar_url    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  role          text not null default 'user',
  is_locked     boolean not null default false,
  locked_at     timestamptz,
  locked_reason text
);
-- Nâng cấp từ bộ migration cũ: cột thêm sau
alter table public.users add column if not exists role text not null default 'user';
alter table public.users add column if not exists is_locked boolean not null default false;
alter table public.users add column if not exists locked_at timestamptz;
alter table public.users add column if not exists locked_reason text;
-- MSSV viết tự do 1–14 ký tự (giao diện / trigger chỉ nhận ký tự tiếng Anh, xem validate_user_profile)
alter table public.users drop constraint if exists users_student_code_format;
alter table public.users add constraint users_student_code_format
  check (student_code is null or (char_length(student_code) between 1 and 14 and student_code !~ '[[:cntrl:]]'));
alter table public.users drop constraint if exists users_role_check;
alter table public.users add constraint users_role_check check (role in ('user', 'admin'));
alter table public.users drop constraint if exists users_locked_reason_length;
alter table public.users add constraint users_locked_reason_length check (locked_reason is null or char_length(locked_reason) <= 300);

create table if not exists public.courses (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references public.users (id) on delete cascade,
  code       text not null check (char_length(code) between 2 and 20),
  name       text not null check (char_length(name) between 1 and 200),
  color_code public.course_color not null default 'orange',
  block_name public.block_name not null default 'Block 1',
  semester   text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Cho phép khóa ngoại kép (course_id, user_id) để đảm bảo lịch/kỳ thi chỉ gắn với môn của chính mình
  unique (id, user_id),
  unique nulls not distinct (user_id, semester, code)
);

-- Thời khóa biểu lặp theo tuần.
--   end_date   = ngày học buổi cuối (NULL = lặp mãi), start_date = ngày học buổi đầu (NULL = từ trước tới nay).
--   skip_dates = các ngày bỏ buổi (đã dời đi chỗ khác). Buổi học bù / dời 1 lần = 1 dòng có start_date = end_date.
create table if not exists public.schedules (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references public.users (id) on delete cascade,
  course_id    uuid not null,
  day_of_week  smallint not null check (day_of_week between 1 and 7), -- 1 = Thứ 2 ... 7 = Chủ nhật
  room         text,
  lecturer     text,
  start_time   time not null,
  end_time     time not null,
  block_period public.block_name not null default 'Block 1',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  end_date     date,
  start_date   date,
  skip_dates   date[] not null default '{}',
  check (end_time > start_time),
  foreign key (course_id, user_id) references public.courses (id, user_id) on delete cascade
);
alter table public.schedules add column if not exists end_date date;
alter table public.schedules add column if not exists start_date date;
alter table public.schedules add column if not exists skip_dates date[] not null default '{}';
alter table public.schedules drop constraint if exists schedules_date_range_check;
alter table public.schedules add constraint schedules_date_range_check
  check (start_date is null or end_date is null or start_date <= end_date);
alter table public.schedules drop constraint if exists schedules_skip_dates_check;
alter table public.schedules add constraint schedules_skip_dates_check check (cardinality(skip_dates) <= 200);

create table if not exists public.exams (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references public.users (id) on delete cascade,
  course_id         uuid not null,
  exam_type         public.exam_type not null,
  exam_date         timestamptz not null,
  duration_minutes  smallint check (duration_minutes between 1 and 600),
  room              text,
  exam_format       text, -- Hình thức thi: Trên máy, Tự luận, Trắc nghiệm...
  weight_percentage numeric(5, 2) check (weight_percentage between 0 and 100),
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  foreign key (course_id, user_id) references public.courses (id, user_id) on delete cascade
);

create table if not exists public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 120),
  description text,
  course_id   uuid references public.courses (id) on delete set null,
  owner_id    uuid not null default auth.uid() references public.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id  uuid not null references public.groups (id) on delete cascade,
  user_id   uuid not null references public.users (id) on delete cascade,
  role      public.group_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists public.deadlines (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references public.users (id) on delete cascade, -- người tạo / chủ sở hữu
  course_id        uuid references public.courses (id) on delete set null,
  group_id         uuid references public.groups (id) on delete cascade,
  title            text not null check (char_length(title) between 1 and 200),
  task_type        public.task_type not null default 'assignment',
  due_date         timestamptz not null,
  priority         public.priority_level not null default 'medium',
  status           public.task_status not null default 'todo',
  progress_percent smallint not null default 0 check (progress_percent between 0 and 100),
  notes            text,
  is_group         boolean generated always as (group_id is not null) stored,
  completed_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.subtasks (
  id           uuid primary key default gen_random_uuid(),
  deadline_id  uuid not null references public.deadlines (id) on delete cascade,
  title        text not null check (char_length(title) between 1 and 200),
  is_completed boolean not null default false,
  position     integer not null default 0,
  created_at   timestamptz not null default now()
);

-- Phần việc trong bài nhóm, giao cho từng thành viên
create table if not exists public.assignments (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups (id) on delete cascade,
  deadline_id uuid not null references public.deadlines (id) on delete cascade,
  assignee_id uuid references public.users (id) on delete set null,
  title       text not null check (char_length(title) between 1 and 200),
  status      public.task_status not null default 'todo',
  due_date    timestamptz,
  created_by  uuid not null default auth.uid() references public.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.share_links (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique default public.generate_share_code() check (code ~ '^[A-Za-z0-9]{6,16}$'),
  deadline_id   uuid not null references public.deadlines (id) on delete cascade,
  created_by    uuid not null default auth.uid() references public.users (id) on delete cascade,
  include_notes boolean not null default false,
  expires_at    timestamptz default (now() + interval '30 days'),
  max_uses      integer check (max_uses > 0),
  use_count     integer not null default 0,
  created_at    timestamptz not null default now()
);

-- Đăng ký Web Push của từng thiết bị (ghi qua register_push_subscription, file 4/4)
create table if not exists public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references public.users (id) on delete cascade,
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);
alter table public.push_subscriptions add column if not exists last_used_at timestamptz;

-- Kế hoạch học: buổi tự học (hoàn toàn cá nhân). Gắn với 1 môn và 1 deadline HOẶC 1 kỳ thi.
create table if not exists public.study_sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.users (id) on delete cascade,
  course_id   uuid references public.courses (id) on delete set null,
  deadline_id uuid references public.deadlines (id) on delete set null,
  exam_id     uuid references public.exams (id) on delete set null,
  title       text not null check (char_length(title) between 1 and 200),
  start_at    timestamptz not null,
  end_at      timestamptz not null,
  is_done     boolean not null default false,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (end_at > start_at),
  check (end_at - start_at <= interval '12 hours'),
  check (deadline_id is null or exam_id is null)
);

-- Giới hạn độ dài các ô chữ tự do (chống nhồi dữ liệu làm phình database / treo giao diện của bạn cùng nhóm).
-- NOT VALID: chỉ kiểm tra dữ liệu ghi MỚI, dữ liệu cũ (nếu có) không làm hỏng migration.
do $$
declare
  c record;
begin
  for c in
    select * from (values
      ('users',          'users_full_name_length',      'char_length(full_name) <= 200'),
      ('courses',        'courses_semester_length',     'char_length(semester) <= 50'),
      ('schedules',      'schedules_text_length',       'char_length(room) <= 100 and char_length(lecturer) <= 200'),
      ('exams',          'exams_text_length',           'char_length(room) <= 100 and char_length(exam_format) <= 200 and char_length(notes) <= 2000'),
      ('groups',         'groups_description_length',   'char_length(description) <= 2000'),
      ('deadlines',      'deadlines_notes_length',      'char_length(notes) <= 5000'),
      ('study_sessions', 'study_sessions_notes_length', 'char_length(notes) <= 2000')
    ) as v (tbl, name, expr)
  loop
    execute format('alter table public.%I drop constraint if exists %I', c.tbl, c.name);
    execute format('alter table public.%I add constraint %I check (%s) not valid', c.tbl, c.name, c.expr);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Index (theo các truy vấn / policy nóng nhất)
-- ---------------------------------------------------------------------
create index if not exists courses_user_idx            on public.courses (user_id);
create index if not exists courses_user_code_idx       on public.courses (user_id, code);           -- copy_shared_deadline tìm môn theo mã
create index if not exists schedules_user_day_idx      on public.schedules (user_id, day_of_week);
create index if not exists schedules_course_idx        on public.schedules (course_id);
create index if not exists exams_user_date_idx         on public.exams (user_id, exam_date);
create index if not exists exams_course_idx            on public.exams (course_id);
create index if not exists deadlines_user_due_idx      on public.deadlines (user_id, due_date);
create index if not exists deadlines_course_idx        on public.deadlines (course_id);
-- RLS deadlines: nhánh cá nhân / nhánh nhóm + sắp xếp theo hạn
create index if not exists deadlines_personal_due_idx  on public.deadlines (user_id, due_date) where group_id is null;
create index if not exists deadlines_group_due_idx     on public.deadlines (group_id, due_date) where group_id is not null;
drop index if exists public.deadlines_group_idx;
create index if not exists deadlines_user_status_due_idx on public.deadlines (user_id, status, due_date);
create index if not exists deadlines_course_group_idx  on public.deadlines (course_id) where group_id is not null; -- can_view_course
create index if not exists deadlines_open_due_idx      on public.deadlines (due_date) where status <> 'done';      -- nhắc deadline
create index if not exists subtasks_deadline_idx       on public.subtasks (deadline_id, position);
create index if not exists group_members_user_idx      on public.group_members (user_id);
create index if not exists groups_course_idx           on public.groups (course_id);
create index if not exists groups_owner_idx            on public.groups (owner_id);
create index if not exists assignments_group_idx       on public.assignments (group_id);
create index if not exists assignments_deadline_idx    on public.assignments (deadline_id);
create index if not exists assignments_assignee_idx    on public.assignments (assignee_id) where assignee_id is not null;
create index if not exists share_links_deadline_idx    on public.share_links (deadline_id);
create index if not exists share_links_creator_idx     on public.share_links (created_by);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);
create index if not exists study_sessions_user_start_idx on public.study_sessions (user_id, start_at);
create index if not exists study_sessions_deadline_idx on public.study_sessions (deadline_id) where deadline_id is not null;
create index if not exists study_sessions_exam_idx     on public.study_sessions (exam_id) where exam_id is not null;
create index if not exists users_email_lower_idx       on public.users (lower(email));                -- mời thành viên theo email
create index if not exists users_role_idx              on public.users (role) where role = 'admin';

-- ---------------------------------------------------------------------
-- 3. Hàm hỗ trợ RLS (SECURITY DEFINER để tránh đệ quy policy)
-- ---------------------------------------------------------------------
create or replace function public.is_group_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_group_owner(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.groups
    where id = p_group_id and owner_id = auth.uid()
  );
$$;

create or replace function public.can_access_deadline(p_deadline_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.deadlines d
    where d.id = p_deadline_id
      and (
        (d.group_id is null and d.user_id = auth.uid())
        or (d.group_id is not null and public.is_group_member(d.group_id))
      )
  );
$$;

-- Môn học được xem nếu là của mình, hoặc gắn với nhóm / deadline nhóm mà mình là thành viên
create or replace function public.can_view_course(p_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.courses c where c.id = p_course_id and c.user_id = auth.uid())
      or exists (
        select 1 from public.groups g
        where g.course_id = p_course_id and public.is_group_member(g.id)
      )
      or exists (
        select 1 from public.deadlines d
        where d.course_id = p_course_id and d.group_id is not null and public.is_group_member(d.group_id)
      );
$$;

-- Deadline chỉ được gắn với môn của mình, hoặc môn của nhóm (với deadline nhóm)
create or replace function public.deadline_course_allowed(p_course_id uuid, p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_course_id is null
      or exists (select 1 from public.courses c where c.id = p_course_id and c.user_id = auth.uid())
      or (
        p_group_id is not null
        and exists (select 1 from public.groups g where g.id = p_group_id and g.course_id = p_course_id)
      );
$$;

-- Hai người có chung ít nhất một nhóm (để hiển thị tên người được giao việc)
create or replace function public.shares_group_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members me
    join public.group_members other on other.group_id = me.group_id
    where me.user_id = auth.uid() and other.user_id = p_user_id
  );
$$;

-- Buổi tự học chỉ được gắn với môn / deadline / kỳ thi mà mình có quyền xem
create or replace function public.study_session_links_allowed(p_course_id uuid, p_deadline_id uuid, p_exam_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (p_course_id is null or public.can_view_course(p_course_id))
     and (p_deadline_id is null or public.can_access_deadline(p_deadline_id))
     and (p_exam_id is null or exists (select 1 from public.exams e where e.id = p_exam_id and e.user_id = auth.uid()));
$$;

-- Admin đang hoạt động / tài khoản đang bị khóa (đọc users mà không vướng RLS)
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.users where id = auth.uid() and role = 'admin' and not is_locked);
$$;

create or replace function public.is_locked_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select is_locked from public.users where id = auth.uid()), false);
$$;

-- ---------------------------------------------------------------------
-- 4. Trigger
-- ---------------------------------------------------------------------

-- Chủ nhóm tự động là thành viên với vai trò owner
create or replace function public.handle_new_group()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.group_members (group_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (group_id, user_id) do update set role = 'owner';
  return new;
end;
$$;

drop trigger if exists on_group_created on public.groups;
create trigger on_group_created
  after insert on public.groups
  for each row execute function public.handle_new_group();

-- Đồng bộ trạng thái và % tiến độ; không cho đổi chủ sở hữu / nhóm của deadline
create or replace function public.normalize_deadline()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.user_id <> old.user_id or new.group_id is distinct from old.group_id then
      raise exception 'Không được thay đổi chủ sở hữu hoặc nhóm của deadline' using errcode = '42501';
    end if;
  end if;

  if new.status = 'done' then
    new.progress_percent := 100;
    new.completed_at := coalesce(new.completed_at, now());
  else
    new.completed_at := null;
    if new.progress_percent = 100 then
      new.progress_percent := 99;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists deadlines_normalize on public.deadlines;
create trigger deadlines_normalize
  before insert or update on public.deadlines
  for each row execute function public.normalize_deadline();

-- Phần việc phải thuộc deadline của đúng nhóm, người được giao phải là thành viên nhóm
create or replace function public.validate_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Không đổi người tạo: quyền xóa dựa vào created_by, đổi được thì thành viên xóa được việc của người khác
  if tg_op = 'UPDATE' and new.created_by is distinct from old.created_by then
    raise exception 'Không được thay đổi người tạo phần việc' using errcode = '42501';
  end if;
  if not exists (select 1 from public.deadlines where id = new.deadline_id and group_id = new.group_id) then
    raise exception 'Deadline không thuộc nhóm này' using errcode = '23514';
  end if;
  if new.assignee_id is not null and not exists (
    select 1 from public.group_members where group_id = new.group_id and user_id = new.assignee_id
  ) then
    raise exception 'Người được giao việc không phải thành viên nhóm' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists assignments_validate on public.assignments;
create trigger assignments_validate
  before insert or update on public.assignments
  for each row execute function public.validate_assignment();

-- updated_at tự cập nhật
do $$
declare
  t text;
begin
  foreach t in array array['users', 'courses', 'schedules', 'exams', 'groups', 'deadlines', 'assignments', 'study_sessions'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_updated_at', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_updated_at', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Row Level Security
-- ---------------------------------------------------------------------
alter table public.users              enable row level security;
alter table public.courses            enable row level security;
alter table public.schedules          enable row level security;
alter table public.exams              enable row level security;
alter table public.groups             enable row level security;
alter table public.group_members      enable row level security;
alter table public.deadlines          enable row level security;
alter table public.subtasks           enable row level security;
alter table public.assignments        enable row level security;
alter table public.share_links        enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.study_sessions     enable row level security;

-- users
drop policy if exists "users: xem bản thân và bạn cùng nhóm" on public.users;
create policy "users: xem bản thân và bạn cùng nhóm" on public.users
  for select to authenticated
  using (id = (select auth.uid()) or public.shares_group_with(id));

drop policy if exists "users: sửa hồ sơ của mình" on public.users;
create policy "users: sửa hồ sơ của mình" on public.users
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Admin xem được toàn bộ hồ sơ (chỉ ĐỌC; ghi qua Edge Function admin-users)
drop policy if exists "users: admin xem tất cả" on public.users;
create policy "users: admin xem tất cả" on public.users
  for select to authenticated
  using ((select public.is_admin()));

-- courses
drop policy if exists "courses: xem môn của mình hoặc môn của nhóm" on public.courses;
create policy "courses: xem môn của mình hoặc môn của nhóm" on public.courses
  for select to authenticated
  using (user_id = (select auth.uid()) or public.can_view_course(id));

drop policy if exists "courses: thêm môn của mình" on public.courses;
create policy "courses: thêm môn của mình" on public.courses
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "courses: sửa môn của mình" on public.courses;
create policy "courses: sửa môn của mình" on public.courses
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "courses: xóa môn của mình" on public.courses;
create policy "courses: xóa môn của mình" on public.courses
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- schedules / exams / push_subscriptions: hoàn toàn cá nhân
drop policy if exists "schedules: chỉ chủ sở hữu" on public.schedules;
create policy "schedules: chỉ chủ sở hữu" on public.schedules
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "exams: chỉ chủ sở hữu" on public.exams;
create policy "exams: chỉ chủ sở hữu" on public.exams
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "push_subscriptions: chỉ chủ sở hữu" on public.push_subscriptions;
create policy "push_subscriptions: chỉ chủ sở hữu" on public.push_subscriptions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- groups
drop policy if exists "groups: thành viên xem nhóm" on public.groups;
create policy "groups: thành viên xem nhóm" on public.groups
  for select to authenticated
  using (owner_id = (select auth.uid()) or public.is_group_member(id));

drop policy if exists "groups: tạo nhóm" on public.groups;
create policy "groups: tạo nhóm" on public.groups
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and (course_id is null or exists (select 1 from public.courses c where c.id = course_id and c.user_id = (select auth.uid())))
  );

drop policy if exists "groups: chủ nhóm sửa" on public.groups;
-- Kiểm tra môn cả khi sửa: không thì chủ nhóm gắn nhóm vào môn của người khác để thành viên đọc trộm môn đó (can_view_course)
create policy "groups: chủ nhóm sửa" on public.groups
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and (course_id is null or exists (select 1 from public.courses c where c.id = course_id and c.user_id = (select auth.uid())))
  );

drop policy if exists "groups: chủ nhóm xóa" on public.groups;
create policy "groups: chủ nhóm xóa" on public.groups
  for delete to authenticated
  using (owner_id = (select auth.uid()));

-- group_members
drop policy if exists "group_members: thành viên xem danh sách" on public.group_members;
create policy "group_members: thành viên xem danh sách" on public.group_members
  for select to authenticated
  using (public.is_group_member(group_id));

drop policy if exists "group_members: chủ nhóm thêm thành viên" on public.group_members;
create policy "group_members: chủ nhóm thêm thành viên" on public.group_members
  for insert to authenticated
  with check (public.is_group_owner(group_id) and role = 'member');

drop policy if exists "group_members: rời nhóm hoặc chủ nhóm xóa" on public.group_members;
create policy "group_members: rời nhóm hoặc chủ nhóm xóa" on public.group_members
  for delete to authenticated
  using (
    (user_id = (select auth.uid()) and role <> 'owner')
    or (public.is_group_owner(group_id) and user_id <> (select auth.uid()))
  );

-- deadlines
drop policy if exists "deadlines: cá nhân - chủ sở hữu; nhóm - thành viên" on public.deadlines;
create policy "deadlines: cá nhân - chủ sở hữu; nhóm - thành viên" on public.deadlines
  for select to authenticated
  using (
    case when group_id is null then user_id = (select auth.uid())
         else public.is_group_member(group_id) end
  );

drop policy if exists "deadlines: tạo" on public.deadlines;
create policy "deadlines: tạo" on public.deadlines
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (group_id is null or public.is_group_member(group_id))
    and public.deadline_course_allowed(course_id, group_id)
  );

drop policy if exists "deadlines: sửa" on public.deadlines;
create policy "deadlines: sửa" on public.deadlines
  for update to authenticated
  using (
    case when group_id is null then user_id = (select auth.uid())
         else public.is_group_member(group_id) end
  )
  with check (
    case when group_id is null then user_id = (select auth.uid())
         else public.is_group_member(group_id) end
    and public.deadline_course_allowed(course_id, group_id)
  );

drop policy if exists "deadlines: xóa - người tạo hoặc chủ nhóm" on public.deadlines;
create policy "deadlines: xóa - người tạo hoặc chủ nhóm" on public.deadlines
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    or (group_id is not null and public.is_group_owner(group_id))
  );

-- subtasks: theo quyền của deadline cha
drop policy if exists "subtasks: theo quyền deadline" on public.subtasks;
create policy "subtasks: theo quyền deadline" on public.subtasks
  for all to authenticated
  using (public.can_access_deadline(deadline_id))
  with check (public.can_access_deadline(deadline_id));

-- assignments
drop policy if exists "assignments: thành viên xem" on public.assignments;
create policy "assignments: thành viên xem" on public.assignments
  for select to authenticated
  using (public.is_group_member(group_id));

drop policy if exists "assignments: thành viên tạo" on public.assignments;
create policy "assignments: thành viên tạo" on public.assignments
  for insert to authenticated
  with check (public.is_group_member(group_id) and created_by = (select auth.uid()));

drop policy if exists "assignments: thành viên cập nhật" on public.assignments;
create policy "assignments: thành viên cập nhật" on public.assignments
  for update to authenticated
  using (public.is_group_member(group_id))
  with check (public.is_group_member(group_id));

drop policy if exists "assignments: người tạo hoặc chủ nhóm xóa" on public.assignments;
create policy "assignments: người tạo hoặc chủ nhóm xóa" on public.assignments
  for delete to authenticated
  using (created_by = (select auth.uid()) or public.is_group_owner(group_id));

-- share_links: chỉ người tạo thấy link của mình. Người nhận đọc qua RPC (file 3/4).
drop policy if exists "share_links: người tạo xem" on public.share_links;
create policy "share_links: người tạo xem" on public.share_links
  for select to authenticated
  using (created_by = (select auth.uid()));

drop policy if exists "share_links: tạo link cho deadline mình truy cập được" on public.share_links;
create policy "share_links: tạo link cho deadline mình truy cập được" on public.share_links
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and public.can_access_deadline(deadline_id)
    -- Không tự đặt link vô thời hạn / hạn quá 30 ngày / số lượt đã dùng (vượt giới hạn max_uses)
    and use_count = 0
    and expires_at is not null
    and expires_at <= now() + interval '30 days 5 minutes'
    and (max_uses is null or max_uses <= 10000)
  );

drop policy if exists "share_links: người tạo xóa" on public.share_links;
create policy "share_links: người tạo xóa" on public.share_links
  for delete to authenticated
  using (created_by = (select auth.uid()));

-- study_sessions
drop policy if exists "study_sessions: chỉ chủ sở hữu xem" on public.study_sessions;
create policy "study_sessions: chỉ chủ sở hữu xem" on public.study_sessions
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "study_sessions: chủ sở hữu tạo" on public.study_sessions;
create policy "study_sessions: chủ sở hữu tạo" on public.study_sessions
  for insert to authenticated
  with check (user_id = (select auth.uid()) and public.study_session_links_allowed(course_id, deadline_id, exam_id));

drop policy if exists "study_sessions: chủ sở hữu sửa" on public.study_sessions;
create policy "study_sessions: chủ sở hữu sửa" on public.study_sessions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.study_session_links_allowed(course_id, deadline_id, exam_id));

drop policy if exists "study_sessions: chủ sở hữu xóa" on public.study_sessions;
create policy "study_sessions: chủ sở hữu xóa" on public.study_sessions
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Tài khoản bị khóa: chặn mọi truy cập dữ liệu (RESTRICTIVE kết hợp AND với các policy trên).
-- Riêng bảng users vẫn cho đọc hồ sơ của chính mình để app hiện màn hình "tài khoản đã bị khóa".
do $$
declare
  t text;
begin
  foreach t in array array[
    'courses', 'schedules', 'exams', 'groups', 'group_members', 'deadlines', 'subtasks',
    'assignments', 'share_links', 'push_subscriptions', 'study_sessions'
  ] loop
    execute format('drop policy if exists "%s: chặn tài khoản bị khóa" on public.%I', t, t);
    execute format(
      'create policy "%s: chặn tài khoản bị khóa" on public.%I as restrictive for all to authenticated
         using (not (select public.is_locked_user())) with check (not (select public.is_locked_user()))',
      t, t);
  end loop;
end;
$$;

drop policy if exists "users: tài khoản bị khóa chỉ xem chính mình" on public.users;
create policy "users: tài khoản bị khóa chỉ xem chính mình" on public.users
  as restrictive for select to authenticated
  using (not (select public.is_locked_user()) or id = (select auth.uid()));

drop policy if exists "users: tài khoản bị khóa không sửa hồ sơ" on public.users;
create policy "users: tài khoản bị khóa không sửa hồ sơ" on public.users
  as restrictive for update to authenticated
  using (not (select public.is_locked_user()));

-- ---------------------------------------------------------------------
-- 6. Phân quyền (defense in depth)
-- ---------------------------------------------------------------------
-- anon không truy cập trực tiếp bảng nào; authenticated đi qua RLS.
revoke all on
  public.users, public.courses, public.schedules, public.exams, public.groups, public.group_members, public.deadlines,
  public.subtasks, public.assignments, public.share_links, public.push_subscriptions, public.study_sessions
  from anon;
grant select, insert, update, delete on
  public.courses, public.schedules, public.exams, public.groups, public.group_members, public.deadlines,
  public.subtasks, public.assignments, public.share_links, public.study_sessions
  to authenticated;

-- users: ĐỌC theo cột. Bạn cùng nhóm đọc được hồ sơ của nhau (RLS), nên không cho đọc locked_at / locked_reason
-- (ghi chú riêng của admin); chính chủ xem lý do khóa qua RPC my_lock_info() (file 2/4).
-- Chỉ sửa được 4 cột hồ sơ (đặt ở file 2/4), không sửa email / role / is_locked. Không xóa / thêm trực tiếp.
revoke all on public.users from authenticated;
grant select (id, email, full_name, student_code, campus, avatar_url, created_at, updated_at, role, is_locked)
  on public.users to authenticated;

-- push_subscriptions: chỉ xem / xóa thiết bị của mình. Ghi qua register_push_subscription() (kiểm tra endpoint, file 4/4):
-- ghi thẳng được thì có thể đặt endpoint là địa chỉ bất kỳ và máy chủ gửi nhắc nhở sẽ gửi request tới đó (SSRF).
revoke all on public.push_subscriptions from authenticated;
grant select, delete on public.push_subscriptions to authenticated;

-- Hàm: thu hồi quyền mặc định, chỉ cấp những gì cần
revoke execute on function public.set_updated_at()                     from public, anon, authenticated;
revoke execute on function public.handle_new_group()                   from public, anon, authenticated;
revoke execute on function public.normalize_deadline()                 from public, anon, authenticated;
revoke execute on function public.validate_assignment()                from public, anon, authenticated;
revoke execute on function public.generate_share_code(integer)         from public, anon;
revoke execute on function public.is_group_member(uuid)                from public, anon;
revoke execute on function public.is_group_owner(uuid)                 from public, anon;
revoke execute on function public.can_access_deadline(uuid)            from public, anon;
revoke execute on function public.can_view_course(uuid)                from public, anon;
revoke execute on function public.deadline_course_allowed(uuid, uuid)  from public, anon;
revoke execute on function public.shares_group_with(uuid)              from public, anon;
revoke execute on function public.study_session_links_allowed(uuid, uuid, uuid) from public, anon;
revoke execute on function public.is_admin()                           from public, anon;
revoke execute on function public.is_locked_user()                     from public, anon;
grant execute on function public.generate_share_code(integer)          to authenticated;
grant execute on function public.is_group_member(uuid)                 to authenticated;
grant execute on function public.is_group_owner(uuid)                  to authenticated;
grant execute on function public.can_access_deadline(uuid)             to authenticated;
grant execute on function public.can_view_course(uuid)                 to authenticated;
grant execute on function public.deadline_course_allowed(uuid, uuid)   to authenticated;
grant execute on function public.shares_group_with(uuid)               to authenticated;
grant execute on function public.study_session_links_allowed(uuid, uuid, uuid) to authenticated;
grant execute on function public.is_admin()                            to authenticated;
grant execute on function public.is_locked_user()                      to authenticated;

-- ---------------------------------------------------------------------
-- 7. Realtime: thay đổi deadline / subtask / phần việc / thành viên nhóm được đẩy tới app
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['deadlines', 'subtasks', 'assignments', 'group_members'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end;
$$;

notify pgrst, 'reload schema';
