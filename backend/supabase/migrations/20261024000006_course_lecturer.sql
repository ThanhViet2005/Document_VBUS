-- =====================================================================
-- UniPlan 6 – Giảng viên của môn học (nhập ở form Thêm / Sửa môn).
--   NULL = chưa nhập → thẻ môn lấy giảng viên từ thời khóa biểu (schedules.lecturer) như trước.
-- Cần chạy sau 20261024000005_course_custom_color.sql. Chạy lại nhiều lần an toàn.
-- =====================================================================

alter table public.courses add column if not exists lecturer text;

alter table public.courses drop constraint if exists courses_lecturer_length;
alter table public.courses add constraint courses_lecturer_length check (char_length(lecturer) <= 200) not valid;

notify pgrst, 'reload schema';
