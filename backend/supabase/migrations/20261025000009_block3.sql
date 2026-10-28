-- =====================================================================
-- UniPlan 9 – Thêm Block 3 cho môn học (courses.block_name) và buổi học (schedules.block_period).
-- Cần chạy sau 20261025000008_email_digest.sql. Chạy lại nhiều lần an toàn.
-- =====================================================================

alter type public.block_name add value if not exists 'Block 3';

notify pgrst, 'reload schema';
