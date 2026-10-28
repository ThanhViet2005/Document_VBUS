-- =====================================================================
-- UniPlan 7 – Mời vào nhóm phải được người được mời ĐỒNG Ý.
--   * Chủ nhóm tìm bạn theo tên (gợi ý tối đa 3 tài khoản, không phân biệt dấu) hoặc email đầy đủ → gửi lời mời.
--   * Người được mời thấy lời mời (chuông Thông báo + trang Nhóm) → Đồng ý thì mới vào nhóm, Từ chối thì thôi.
--   * Chủ nhóm KHÔNG còn tự thêm thẳng thành viên (bỏ policy insert trên group_members).
-- Cần chạy sau 20261024000006_course_lecturer.sql. Chạy lại nhiều lần an toàn.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Bảng lời mời. Mỗi (nhóm, người) chỉ 1 dòng: mời lại sau khi bị từ chối = đặt lại 'pending'.
--    Đồng ý → thêm vào group_members và xóa lời mời. Chỉ ghi qua RPC bên dưới.
-- ---------------------------------------------------------------------
create table if not exists public.group_invitations (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.groups (id) on delete cascade,
  invitee_id   uuid not null references public.users (id) on delete cascade,
  inviter_id   uuid not null references public.users (id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending', 'declined')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  unique (group_id, invitee_id)
);
create index if not exists group_invitations_invitee_idx on public.group_invitations (invitee_id) where status = 'pending';

alter table public.group_invitations enable row level security;

drop policy if exists "group_invitations: người được mời và chủ nhóm xem" on public.group_invitations;
create policy "group_invitations: người được mời và chủ nhóm xem" on public.group_invitations
  for select to authenticated
  using (invitee_id = (select auth.uid()) or public.is_group_owner(group_id));

-- Chủ nhóm thu hồi lời mời / người được mời xóa lời mời đã từ chối
drop policy if exists "group_invitations: chủ nhóm thu hồi" on public.group_invitations;
create policy "group_invitations: chủ nhóm thu hồi" on public.group_invitations
  for delete to authenticated
  using (invitee_id = (select auth.uid()) or public.is_group_owner(group_id));

drop policy if exists "group_invitations: chặn tài khoản bị khóa" on public.group_invitations;
create policy "group_invitations: chặn tài khoản bị khóa" on public.group_invitations
  as restrictive for all to authenticated
  using (not (select public.is_locked_user())) with check (not (select public.is_locked_user()));

revoke all on public.group_invitations from anon, authenticated;
grant select, delete on public.group_invitations to authenticated;

-- Chủ nhóm không còn thêm thẳng người khác vào nhóm (phải qua lời mời + đồng ý).
-- Chủ nhóm vẫn tự là thành viên nhờ trigger handle_new_group (SECURITY DEFINER).
drop policy if exists "group_members: chủ nhóm thêm thành viên" on public.group_members;
revoke insert on public.group_members from authenticated;

-- ---------------------------------------------------------------------
-- 2. Tìm bạn để mời: bỏ dấu tiếng Việt để "viet" khớp "Việt"
-- ---------------------------------------------------------------------
create or replace function public.unaccent_vi(p text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  -- Dịch cả chữ hoa có dấu (lower() không đổi được chữ có dấu khi database dùng locale C)
  select lower(translate(
    coalesce(p, ''),
    'àáảãạăằắẳẵặâầấẩẫậÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬèéẻẽẹêềếểễệÈÉẺẼẸÊỀẾỂỄỆìíỉĩịÌÍỈĨỊòóỏõọôồốổỗộơờớởỡợÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢùúủũụưừứửữựÙÚỦŨỤƯỪỨỬỮỰỳýỷỹỵỲÝỶỸỴđĐ',
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaeeeeeeeeeeeeeeeeeeeeeeiiiiiiiiiioooooooooooooooooooooooooooooooooouuuuuuuuuuuuuuuuuuuuuuyyyyyyyyyydd'
  ));
$$;

/**
 * Gợi ý tối đa 3 tài khoản cho chủ nhóm mời:
 *   - gõ email đầy đủ → chỉ khớp đúng email đó (không cho dò email theo tiền tố);
 *   - gõ tên → mọi từ gõ vào đều phải có trong họ tên (không phân biệt dấu / hoa thường).
 * Ưu tiên: trùng hẳn tên → tên bắt đầu bằng chữ gõ → có từ bắt đầu bằng chữ gõ → còn lại; rồi tên ngắn hơn.
 * Bỏ qua chính mình, người đã trong nhóm, tài khoản bị khóa. Chỉ trả thông tin tối thiểu + email đã che.
 */
create or replace function public.search_invitable_users(p_group_id uuid, p_query text)
returns table (user_id uuid, full_name text, avatar_url text, email_hint text, invited boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q      text := btrim(regexp_replace(coalesce(p_query, ''), '\s+', ' ', 'g'));
  v_norm   text := public.unaccent_vi(v_q);
  v_tokens text[];
begin
  if not public.is_group_owner(p_group_id) then
    raise exception 'Chỉ chủ nhóm mới được mời thành viên' using errcode = '42501';
  end if;
  if char_length(v_q) < 2 or char_length(v_q) > 100 then
    return;
  end if;
  v_tokens := string_to_array(v_norm, ' ');

  return query
  select u.id, u.full_name, u.avatar_url,
         -- "vi***@fpt.edu.vn": đủ để phân biệt 2 người trùng tên, không lộ email
         left(split_part(u.email, '@', 1), 2) || '***@' || split_part(u.email, '@', 2),
         exists (select 1 from public.group_invitations i where i.group_id = p_group_id and i.invitee_id = u.id and i.status = 'pending')
  from public.users u
  where u.id <> auth.uid()
    and not u.is_locked
    and not exists (select 1 from public.group_members m where m.group_id = p_group_id and m.user_id = u.id)
    and case
          when position('@' in v_q) > 0 then lower(u.email) = lower(v_q)
          else (select bool_and(position(t in public.unaccent_vi(u.full_name)) > 0) from unnest(v_tokens) t)
        end
  order by
    case
      when position('@' in v_q) > 0 then 0
      when public.unaccent_vi(u.full_name) = v_norm then 0
      when public.unaccent_vi(u.full_name) like v_norm || '%' then 1
      when ' ' || public.unaccent_vi(u.full_name) like '% ' || v_tokens[1] || '%' then 2
      else 3
    end,
    char_length(u.full_name),
    u.full_name
  limit 3;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Gửi lời mời (chủ nhóm). Trả thông tin tối thiểu của người được mời.
-- ---------------------------------------------------------------------
create or replace function public.invite_to_group(p_group_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user public.users%rowtype;
begin
  if not public.is_group_owner(p_group_id) then
    raise exception 'Chỉ chủ nhóm mới được mời thành viên' using errcode = '42501';
  end if;
  select * into v_user from public.users where id = p_user_id and not is_locked;
  if not found or p_user_id = auth.uid() then
    raise exception 'Không tìm thấy tài khoản này' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.group_members where group_id = p_group_id and user_id = p_user_id) then
    raise exception '% đã ở trong nhóm', v_user.full_name using errcode = '23505';
  end if;
  -- Chống spam: 1 nhóm tối đa 30 lời mời đang chờ
  if (select count(*) from public.group_invitations where group_id = p_group_id and status = 'pending' and invitee_id <> p_user_id) >= 30 then
    raise exception 'Nhóm đang có quá nhiều lời mời chờ trả lời' using errcode = '54000';
  end if;

  insert into public.group_invitations (group_id, invitee_id, inviter_id)
  values (p_group_id, p_user_id, auth.uid())
  on conflict (group_id, invitee_id) do update
    set status = 'pending', inviter_id = excluded.inviter_id, created_at = now(), responded_at = null;

  return jsonb_build_object('user_id', v_user.id, 'full_name', v_user.full_name, 'avatar_url', v_user.avatar_url);
end;
$$;

-- Bản cũ (mời bằng email) giữ tên để app đang chạy không lỗi, nhưng giờ chỉ GỬI LỜI MỜI, không thêm thẳng.
-- Trả null (không raise) khi email chưa đăng ký để việc dò email vẫn bị đếm rate limit.
create or replace function public.add_group_member(p_group_id uuid, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.is_group_owner(p_group_id) then
    raise exception 'Chỉ chủ nhóm mới được thêm thành viên' using errcode = '42501';
  end if;
  select id into v_id from public.users where lower(email) = lower(trim(p_email)) and not is_locked;
  if v_id is null or v_id = auth.uid() or exists (select 1 from public.group_members where group_id = p_group_id and user_id = v_id) then
    return null;
  end if;
  return public.invite_to_group(p_group_id, v_id);
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Người được mời: xem lời mời đang chờ (kèm tên nhóm / môn / người mời – bình thường chưa đọc được vì chưa là thành viên)
-- ---------------------------------------------------------------------
create or replace function public.my_group_invitations()
returns table (id uuid, group_id uuid, group_name text, course_code text, course_name text, inviter_name text, inviter_avatar text, member_count integer, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, g.id, g.name, c.code, c.name, u.full_name, u.avatar_url,
         (select count(*)::integer from public.group_members m where m.group_id = g.id),
         i.created_at
  from public.group_invitations i
  join public.groups g on g.id = i.group_id
  left join public.courses c on c.id = g.course_id
  left join public.users u on u.id = i.inviter_id
  where i.invitee_id = auth.uid() and i.status = 'pending' and not public.is_locked_user()
  order by i.created_at desc;
$$;

-- Chủ nhóm: lời mời đã gửi của 1 nhóm (đang chờ / bị từ chối) kèm tên người được mời
create or replace function public.group_sent_invitations(p_group_id uuid)
returns table (id uuid, user_id uuid, full_name text, avatar_url text, status text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, u.id, u.full_name, u.avatar_url, i.status, i.created_at
  from public.group_invitations i
  join public.users u on u.id = i.invitee_id
  where i.group_id = p_group_id and public.is_group_owner(p_group_id)
  order by i.created_at desc;
$$;

-- Đồng ý → vào nhóm; Từ chối → đánh dấu 'declined' (chủ nhóm thấy, có thể mời lại)
create or replace function public.respond_group_invitation(p_invitation_id uuid, p_accept boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.group_invitations%rowtype;
begin
  if auth.uid() is null or public.is_locked_user() then
    raise exception 'Không thể trả lời lời mời' using errcode = '42501';
  end if;
  select * into v_inv from public.group_invitations
  where id = p_invitation_id and invitee_id = auth.uid() and status = 'pending'
  for update;
  if not found then
    raise exception 'Lời mời không còn hiệu lực' using errcode = 'P0002';
  end if;

  if p_accept then
    insert into public.group_members (group_id, user_id, role)
    values (v_inv.group_id, v_inv.invitee_id, 'member')
    on conflict (group_id, user_id) do nothing;
    delete from public.group_invitations where id = v_inv.id;
  else
    update public.group_invitations set status = 'declined', responded_at = now() where id = v_inv.id;
  end if;
  return v_inv.group_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Bản có giới hạn tần suất (client chỉ gọi bản này)
-- ---------------------------------------------------------------------
create or replace function public.search_invitable_users_limited(p_group_id uuid, p_query text)
returns table (user_id uuid, full_name text, avatar_url text, email_hint text, invited boolean)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.rate_limit_rpc('search_invitable_users', 40);
  return query select * from public.search_invitable_users(p_group_id, p_query);
end;
$$;

create or replace function public.invite_to_group_limited(p_group_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.rate_limit_rpc('invite_to_group', 20);
  return public.invite_to_group(p_group_id, p_user_id);
end;
$$;

-- ---------------------------------------------------------------------
-- 6. Quyền gọi hàm
-- ---------------------------------------------------------------------
revoke execute on function public.unaccent_vi(text)                            from public, anon;
revoke execute on function public.search_invitable_users(uuid, text)           from public, anon, authenticated;
revoke execute on function public.invite_to_group(uuid, uuid)                  from public, anon, authenticated;
revoke execute on function public.add_group_member(uuid, text)                 from public, anon, authenticated;
revoke execute on function public.my_group_invitations()                       from public, anon;
revoke execute on function public.group_sent_invitations(uuid)                 from public, anon;
revoke execute on function public.respond_group_invitation(uuid, boolean)      from public, anon;
revoke execute on function public.search_invitable_users_limited(uuid, text)   from public, anon;
revoke execute on function public.invite_to_group_limited(uuid, uuid)          from public, anon;

grant execute on function public.unaccent_vi(text)                             to authenticated;
grant execute on function public.my_group_invitations()                        to authenticated;
grant execute on function public.group_sent_invitations(uuid)                  to authenticated;
grant execute on function public.respond_group_invitation(uuid, boolean)       to authenticated;
grant execute on function public.search_invitable_users_limited(uuid, text)    to authenticated;
grant execute on function public.invite_to_group_limited(uuid, uuid)           to authenticated;

-- ---------------------------------------------------------------------
-- 7. Realtime: người được mời thấy lời mời ngay, chủ nhóm thấy khi bị từ chối
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'group_invitations') then
    alter publication supabase_realtime add table public.group_invitations;
  end if;
end;
$$;

notify pgrst, 'reload schema';
