-- =====================================================================
-- UniPlan 11 – Đổi email đăng nhập (auth.users.email) thì hồ sơ public.users.email đổi theo.
--   Trước đây hồ sơ chỉ lấy email lúc đăng ký → đổi email đăng nhập (Supabase Auth / SQL) mà app vẫn hiện email cũ,
--   danh sách quản trị / mời nhóm / email tổng hợp vẫn dùng email cũ.
-- Cần chạy sau 20261028000010_notify_schedule.sql. Chạy lại nhiều lần an toàn.
-- =====================================================================

create or replace function public.sync_user_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.users set email = new.email, updated_at = now()
  where id = new.id and email is distinct from new.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (new.email is distinct from old.email)
  execute function public.sync_user_email();

revoke execute on function public.sync_user_email() from public, anon, authenticated;

-- Đồng bộ một lần cho tài khoản đã đổi email trước khi có trigger này
update public.users u set email = a.email, updated_at = now()
from auth.users a
where a.id = u.id and u.email is distinct from a.email;
