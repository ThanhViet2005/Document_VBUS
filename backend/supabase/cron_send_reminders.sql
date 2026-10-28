-- =====================================================================
-- Lịch nhắc deadline Web Push (Chrome / Edge / điện thoại) mỗi 5 phút bằng pg_cron + pg_net. Chạy trong SQL Editor
-- SAU KHI đã chạy migration 20261028000010_notify_schedule.sql và deploy Edge Function send-reminders (--no-verify-jwt).
-- Chạy lại nhiều lần an toàn (cùng tên job → pg_cron cập nhật job cũ).
--
-- Mã xác thực lấy từ bảng public.cron_token (database tự sinh) → KHÔNG cần chép CRON_SECRET vào Vault.
-- Cần bật extension: Dashboard → Database → Extensions → "pg_cron" và "pg_net".
-- =====================================================================

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'uniplan-send-reminders',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://vstmnuivhqtgdghxmnxb.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select token from public.cron_token where id = 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

-- Kiểm tra (sau ~5 phút): status_code 200 và content dạng {"due":..,"sent":..}
--   select status_code, content, created from net._http_response order by created desc limit 5;
-- Lịch sử chạy:
--   select * from cron.job_run_details order by start_time desc limit 20;
-- Tạm dừng / xóa:
--   select cron.unschedule('uniplan-send-reminders');
