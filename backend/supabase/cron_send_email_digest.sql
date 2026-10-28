-- =====================================================================
-- Lịch gửi email tổng hợp lúc 7:00 sáng giờ Việt Nam (= 00:00 UTC) bằng pg_cron + pg_net: việc hạn hôm nay + việc quá hạn.
-- Chạy trong SQL Editor SAU KHI đã:
--   * chạy migration 20261028000010_notify_schedule.sql,
--   * deploy Edge Function send-email-digest (--no-verify-jwt) và đặt secrets BREVO_API_KEY, EMAIL_FROM, APP_URL.
-- Chạy lại nhiều lần an toàn (cùng tên job → pg_cron cập nhật job cũ).
--
-- Mã xác thực lấy từ bảng public.cron_token (database tự sinh) → KHÔNG cần chép CRON_SECRET vào Vault.
-- =====================================================================

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'uniplan-send-email-digest',
  '0 0 * * *',
  $$
  select net.http_post(
    url := 'https://vstmnuivhqtgdghxmnxb.supabase.co/functions/v1/send-email-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select token from public.cron_token where id = 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

-- Kiểm tra lịch sử chạy:
--   select * from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'uniplan-send-email-digest')
--   order by start_time desc limit 10;
-- Phản hồi của function (200 + {"due":..,"sent":..} là đúng; 401 = sai mã):
--   select status_code, content, created from net._http_response order by created desc limit 5;
-- Số email đã gửi hôm nay:
--   select count(*) from public.email_log where digest_date = (now() at time zone 'Asia/Ho_Chi_Minh')::date;
-- Tạm dừng / xóa:
--   select cron.unschedule('uniplan-send-email-digest');
