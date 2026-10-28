-- =====================================================================
-- Dữ liệu demo cho 1 tài khoản đã đăng ký.
-- Cách dùng: đăng ký tài khoản trên app trước, sửa v_email bên dưới,
-- rồi chạy file này trong Supabase SQL Editor. Chạy lại sẽ xóa demo cũ của tài khoản đó.
-- =====================================================================
do $$
declare
  v_email text := 'vietnt@fpt.edu.vn'; -- <== đổi thành email của bạn
  v_uid uuid;
  c_pro uuid; c_mkt uuid; c_mad uuid; c_wed uuid; c_swe uuid; c_enw uuid;
  v_group uuid;
  v_lab4 uuid;
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  select id into v_uid from public.users where email = v_email;
  if v_uid is null then
    raise exception 'Không tìm thấy tài khoản %. Hãy đăng ký trên app trước.', v_email;
  end if;

  -- Xóa demo cũ: chỉ đụng tới các môn học kỳ 'Fall 2026' của tài khoản này
  -- (nhóm & deadline nhóm, deadline cá nhân của các môn đó; lịch/kỳ thi xóa theo cascade)
  delete from public.groups g
  using public.courses c
  where g.course_id = c.id and c.user_id = v_uid and c.semester = 'Fall 2026';
  delete from public.deadlines d
  using public.courses c
  where d.course_id = c.id and d.user_id = v_uid and c.user_id = v_uid and c.semester = 'Fall 2026';
  delete from public.courses where user_id = v_uid and semester = 'Fall 2026';

  insert into public.courses (user_id, code, name, color_code, block_name, semester) values
    (v_uid, 'PRO192',  'Lập trình hướng đối tượng với Java', 'red',    'Block 1', 'Fall 2026') returning id into c_pro;
  insert into public.courses (user_id, code, name, color_code, block_name, semester) values
    (v_uid, 'MKT202',  'Nguyên lý Marketing',                'blue',   'Block 1', 'Fall 2026') returning id into c_mkt;
  insert into public.courses (user_id, code, name, color_code, block_name, semester) values
    (v_uid, 'MAD101',  'Toán rời rạc',                       'purple', 'Block 1', 'Fall 2026') returning id into c_mad;
  insert into public.courses (user_id, code, name, color_code, block_name, semester) values
    (v_uid, 'WED201c', 'Thiết kế Web',                       'orange', 'Block 2', 'Fall 2026') returning id into c_wed;
  insert into public.courses (user_id, code, name, color_code, block_name, semester) values
    (v_uid, 'SWE201c', 'Nhập môn Kỹ thuật phần mềm',         'green',  'Block 2', 'Fall 2026') returning id into c_swe;
  insert into public.courses (user_id, code, name, color_code, block_name, semester) values
    (v_uid, 'ENW492c', 'Viết học thuật',                     'teal',   'Block 2', 'Fall 2026') returning id into c_enw;

  insert into public.schedules (user_id, course_id, day_of_week, room, lecturer, start_time, end_time, block_period) values
    (v_uid, c_pro, 1, 'DE-201',  'ThS. Trần Văn An',   '07:00', '09:15', 'Block 1'),
    (v_uid, c_mkt, 1, 'DE-305',  'ThS. Lê Thị Bình',   '09:30', '11:45', 'Block 1'),
    (v_uid, c_mad, 2, 'AL-L104', 'TS. Phạm Văn Cường', '12:30', '14:45', 'Block 1'),
    (v_uid, c_pro, 3, 'DE-201',  'ThS. Trần Văn An',   '07:00', '09:15', 'Block 1'),
    (v_uid, c_mkt, 4, 'DE-305',  'ThS. Lê Thị Bình',   '09:30', '11:45', 'Block 1'),
    (v_uid, c_mad, 5, 'AL-L104', 'TS. Phạm Văn Cường', '12:30', '14:45', 'Block 1'),
    (v_uid, c_pro, 5, 'DE-LAB2', 'ThS. Trần Văn An',   '15:00', '17:15', 'Block 1'),
    (v_uid, c_mkt, 6, 'DE-305',  'ThS. Lê Thị Bình',   '07:00', '09:15', 'Block 1'),
    (v_uid, c_wed, 2, 'DE-LAB1', 'ThS. Võ Minh Đức',   '07:00', '09:15', 'Block 2'),
    (v_uid, c_swe, 4, 'DE-402',  'TS. Ngô Thị Hà',     '12:30', '14:45', 'Block 2');

  insert into public.exams (user_id, course_id, exam_type, exam_date, duration_minutes, room, exam_format, weight_percentage) values
    (v_uid, c_pro, 'PE', (v_today + 12) + time '07:30', 90,  'DE-LAB2', 'Thực hành trên máy', 30),
    (v_uid, c_pro, 'FE', (v_today + 19) + time '09:30', 60,  'DE-201',  'Trắc nghiệm trên máy', 40),
    (v_uid, c_mkt, 'FE', (v_today + 21) + time '13:00', 60,  'DE-305',  'Trắc nghiệm trên máy', 40),
    (v_uid, c_mad, 'FE', (v_today + 23) + time '07:30', 60,  'AL-L104', 'Trắc nghiệm trên máy', 50);

  -- Hạn nộp tính theo giờ Việt Nam, tương đối với hôm nay
  insert into public.deadlines (user_id, course_id, title, task_type, due_date, priority, status, progress_percent) values
    (v_uid, c_mkt, 'Phân tích SWOT thương hiệu Highlands', 'assignment', ((v_today)     + time '17:00') at time zone 'Asia/Ho_Chi_Minh', 'medium', 'todo',        0),
    (v_uid, c_mad, 'Bài tập chương 5 - Đồ thị',            'assignment', ((v_today + 2) + time '23:59') at time zone 'Asia/Ho_Chi_Minh', 'medium', 'todo',        0),
    (v_uid, c_pro, 'Ôn tập PE - Collections',              'revision',   ((v_today + 6) + time '23:59') at time zone 'Asia/Ho_Chi_Minh', 'low',    'todo',        0),
    (v_uid, c_mkt, 'Quiz chương 3 - Hành vi khách hàng',   'assignment', ((v_today - 4) + time '23:59') at time zone 'Asia/Ho_Chi_Minh', 'medium', 'todo',        0),
    (v_uid, c_mad, 'Practical: Quan hệ & Hàm',             'practical',  ((v_today - 1) + time '23:59') at time zone 'Asia/Ho_Chi_Minh', 'high',   'in_progress', 50),
    (v_uid, c_pro, 'Lab 3 - Encapsulation',                'lab',        ((v_today - 3) + time '23:59') at time zone 'Asia/Ho_Chi_Minh', 'medium', 'done',        100),
    (v_uid, c_mad, 'Bài tập chương 4 - Quy nạp',           'assignment', ((v_today - 2) + time '23:59') at time zone 'Asia/Ho_Chi_Minh', 'low',    'done',        100),
    (v_uid, c_mkt, 'Đọc case study Vinamilk',              'revision',   ((v_today - 1) + time '23:59') at time zone 'Asia/Ho_Chi_Minh', 'low',    'done',        100),
    (v_uid, c_wed, 'Wireframe Landing page',               'assignment', ((v_today + 1) + time '23:59') at time zone 'Asia/Ho_Chi_Minh', 'medium', 'done',        100),
    (v_uid, c_enw, 'Essay outline',                        'assignment', ((v_today - 5) + time '23:59') at time zone 'Asia/Ho_Chi_Minh', 'medium', 'done',        100);

  insert into public.deadlines (user_id, course_id, title, task_type, due_date, priority, status, progress_percent)
  values (v_uid, c_pro, 'Lab 4 - Inheritance & Polymorphism', 'lab', ((v_today) + time '23:59') at time zone 'Asia/Ho_Chi_Minh', 'high', 'in_progress', 60)
  returning id into v_lab4;

  insert into public.subtasks (deadline_id, title, is_completed, position) values
    (v_lab4, 'Đọc đề', true, 0),
    (v_lab4, 'Code class Animal', true, 1),
    (v_lab4, 'Viết unit test', false, 2);

  -- Bài nhóm
  insert into public.groups (name, description, course_id, owner_id)
  values ('MKT202 - Nhóm 4', 'Bài tập lớn Marketing Plan', c_mkt, v_uid)
  returning id into v_group;

  insert into public.deadlines (user_id, course_id, group_id, title, task_type, due_date, priority, status, progress_percent) values
    (v_uid, c_mkt, v_group, 'Marketing Plan - Nhóm 4', 'group_project', ((v_today + 4) + time '23:59') at time zone 'Asia/Ho_Chi_Minh', 'high', 'in_progress', 35);

  insert into public.groups (name, course_id, owner_id)
  values ('SWE201c - Team Sprint', c_swe, v_uid)
  returning id into v_group;

  insert into public.deadlines (user_id, course_id, group_id, title, task_type, due_date, priority, status, progress_percent) values
    (v_uid, c_swe, v_group, 'Viết User Story Sprint 1', 'group_project', ((v_today + 3) + time '23:59') at time zone 'Asia/Ho_Chi_Minh', 'high', 'todo', 10);

  raise notice 'Đã tạo dữ liệu demo cho %', v_email;
end;
$$;
