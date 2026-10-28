-- =====================================================================
-- UniPlan 5 – Màu môn học tự chọn
--   color_hex: màu người dùng chọn trong bảng màu (dạng #rrggbb, chữ thường). NULL = dùng màu gợi ý color_code.
--   color_code vẫn giữ (màu gợi ý gần nhất) để link chia sẻ / dữ liệu cũ hiển thị được.
-- Cần chạy sau 20261024000004_reminders.sql. Chạy lại nhiều lần an toàn.
-- =====================================================================

alter table public.courses add column if not exists color_hex text;

alter table public.courses drop constraint if exists courses_color_hex_format;
alter table public.courses add constraint courses_color_hex_format check (color_hex is null or color_hex ~ '^#[0-9a-f]{6}$');

notify pgrst, 'reload schema';
