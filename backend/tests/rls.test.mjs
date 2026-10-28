// Kiểm thử schema.sql + RLS trên Postgres chạy trong tiến trình (PGlite).
// Chạy: npm test (trong thư mục backend)
import { readFile, readdir } from 'node:fs/promises'
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'

const root = new URL('..', import.meta.url)
const db = new PGlite()

const A = '00000000-0000-0000-0000-00000000000a'
const B = '00000000-0000-0000-0000-00000000000b'
const C = '00000000-0000-0000-0000-00000000000c'

/** Chạy câu lệnh với vai trò của một người dùng đã đăng nhập (hoặc anon nếu uid = null) */
async function as(uid, sql, params = [], headers = null) {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${uid ? 'authenticated' : 'anon'}`)
    if (uid) await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: 'authenticated' })])
    if (headers) await tx.query(`select set_config('request.headers', $1, true)`, [JSON.stringify(headers)])
    return tx.query(sql, params)
  })
}

/** Chạy toàn bộ migration theo thứ tự tên file */
async function migrate(target) {
  const dir = new URL('supabase/migrations/', root)
  for (const f of (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()) {
    await target.exec(await readFile(new URL(f, dir), 'utf8'))
  }
}
const rows = async (uid, sql, params) => (await as(uid, sql, params)).rows
const one = async (uid, sql, params) => (await rows(uid, sql, params))[0]

/** Vào nhóm chỉ có 1 cách: chủ nhóm mời + người được mời đồng ý */
async function join(owner, groupId, uid) {
  await as(owner, `select invite_to_group_limited($1, $2)`, [groupId, uid])
  const inv = await one(uid, `select id from my_group_invitations() where group_id = $1`, [groupId])
  await as(uid, `select respond_group_invitation($1, true)`, [inv.id])
}

let courseA, groupCourseA, personalA, groupId, groupDeadline

before(async () => {
  await db.exec(await readFile(new URL('tests/supabase-stub.sql', root), 'utf8'))
  await migrate(db)
  await db.query(
    `insert into auth.users (id, email, raw_user_meta_data) values
       ($1, 'a@fpt.edu.vn', '{"full_name":"Sinh viên A","student_code":"de180001"}'),
       ($2, 'b@fpt.edu.vn', '{"full_name":"Sinh viên B"}'),
       ($3, 'c@fpt.edu.vn', '{"student_code":"mã sinh viên quá dài so với giới hạn"}')`,
    [A, B, C],
  )
})

test('RLS được bật trên mọi bảng public', async () => {
  const { rows: r } = await db.query(`select tablename from pg_tables where schemaname = 'public' and not rowsecurity`)
  assert.deepEqual(r, [])
})

test('Đăng ký tạo hồ sơ users; mã SV dài quá 14 ký tự bị bỏ qua thay vì làm hỏng đăng ký', async () => {
  const { rows: r } = await db.query(`select id, full_name, student_code from public.users order by email`)
  assert.equal(r.length, 3)
  assert.equal(r[0].student_code, 'de180001', 'MSSV giữ nguyên chữ hoa / thường như đã nhập')
  assert.equal(r[2].student_code, null)
  assert.equal(r[2].full_name, 'c')
})

test('Dữ liệu cá nhân: chỉ chủ sở hữu xem/sửa', async () => {
  courseA = (await one(A, `insert into courses (code, name, color_code) values ('PRO192', 'OOP Java', 'red') returning id`)).id
  await as(A, `insert into schedules (course_id, day_of_week, room, start_time, end_time) values ($1, 1, 'DE-201', '07:00', '09:15')`, [courseA])
  await as(A, `insert into exams (course_id, exam_type, exam_date, weight_percentage) values ($1, 'PE', now() + interval '20 days', 30)`, [courseA])
  personalA = (await one(A,
    `insert into deadlines (course_id, title, due_date, notes) values ($1, 'Lab 4', now() + interval '1 day', 'ghi chú riêng tư') returning id`, [courseA])).id
  await as(A, `insert into subtasks (deadline_id, title) values ($1, 'Đọc đề')`, [personalA])

  assert.equal((await rows(A, `select * from deadlines`)).length, 1)
  for (const table of ['deadlines', 'courses', 'schedules', 'exams', 'subtasks']) {
    assert.equal((await rows(B, `select * from ${table}`)).length, 0, `B không được thấy ${table} của A`)
  }
  assert.equal((await as(B, `update deadlines set title = 'hack' where id = $1`, [personalA])).affectedRows, 0)
  assert.equal((await as(B, `delete from deadlines where id = $1`, [personalA])).affectedRows, 0)
  // Không gắn được lịch học / deadline vào môn của người khác
  await assert.rejects(as(B, `insert into schedules (course_id, day_of_week, start_time, end_time) values ($1, 2, '07:00', '08:00')`, [courseA]))
  await assert.rejects(as(B, `insert into deadlines (course_id, title, due_date) values ($1, 'x', now())`, [courseA]))
  // Không tạo dữ liệu đứng tên người khác
  await assert.rejects(as(B, `insert into deadlines (user_id, title, due_date) values ($1, 'x', now())`, [A]))
})

test('Trạng thái done đồng bộ progress_percent = 100 và completed_at', async () => {
  const r = await one(A, `update deadlines set status = 'done' where id = $1 returning progress_percent, completed_at`, [personalA])
  assert.equal(r.progress_percent, 100)
  assert.ok(r.completed_at)
  const back = await one(A, `update deadlines set status = 'in_progress' where id = $1 returning progress_percent, completed_at`, [personalA])
  assert.equal(back.progress_percent, 99)
  assert.equal(back.completed_at, null)
})

test('Deadline nhóm: chỉ thành viên truy cập', async () => {
  groupCourseA = (await one(A, `insert into courses (code, name, color_code) values ('MKT202', 'Marketing', 'blue') returning id`)).id
  groupId = (await one(A, `insert into groups (name, course_id) values ('Nhóm 4', $1) returning id`, [groupCourseA])).id
  assert.equal((await one(A, `select role from group_members where group_id = $1 and user_id = $2`, [groupId, A])).role, 'owner')

  // Không ai thêm thẳng thành viên (kể cả chủ nhóm): phải mời và người được mời đồng ý
  await assert.rejects(as(B, `insert into group_members (group_id, user_id) values ($1, $2)`, [groupId, B]))
  await assert.rejects(as(A, `insert into group_members (group_id, user_id) values ($1, $2)`, [groupId, B]))
  await join(A, groupId, B)

  groupDeadline = (await one(A,
    `insert into deadlines (course_id, group_id, title, task_type, due_date) values ($1, $2, 'Marketing Plan', 'group_project', now() + interval '4 days') returning id, is_group`,
    [groupCourseA, groupId]))
  assert.equal(groupDeadline.is_group, true)
  groupDeadline = groupDeadline.id

  // B (thành viên) thấy deadline nhóm, môn của nhóm và hồ sơ A; nhưng không thấy deadline cá nhân của A
  const bDeadlines = await rows(B, `select id from deadlines`)
  assert.deepEqual(bDeadlines.map((d) => d.id), [groupDeadline])
  assert.deepEqual((await rows(B, `select code from courses`)).map((c) => c.code), ['MKT202'])
  assert.equal((await rows(B, `select id from users where id = $1`, [A])).length, 1)

  // C (không phải thành viên) không thấy gì
  assert.equal((await rows(C, `select * from deadlines`)).length, 0)
  assert.equal((await rows(C, `select * from groups`)).length, 0)
  assert.equal((await rows(C, `select id from users where id <> $1`, [C])).length, 0)

  // Thành viên cập nhật tiến độ được, nhưng không được "chiếm" deadline nhóm
  assert.equal((await as(B, `update deadlines set status = 'in_progress', progress_percent = 40 where id = $1`, [groupDeadline])).affectedRows, 1)
  await assert.rejects(as(B, `update deadlines set group_id = null where id = $1`, [groupDeadline]))
  // Thành viên thường không xóa được deadline do người khác tạo
  assert.equal((await as(B, `delete from deadlines where id = $1`, [groupDeadline])).affectedRows, 0)
  // Thành viên tạo deadline nhóm gắn với môn của nhóm được
  await as(B, `insert into deadlines (course_id, group_id, title, due_date) values ($1, $2, 'Slide thuyết trình', now() + interval '5 days')`, [groupCourseA, groupId])
  // Người ngoài không tạo được deadline trong nhóm
  await assert.rejects(as(C, `insert into deadlines (group_id, title, due_date) values ($1, 'x', now())`, [groupId]))
})

test('Phân công: người được giao phải là thành viên nhóm', async () => {
  await as(A, `insert into assignments (group_id, deadline_id, assignee_id, title) values ($1, $2, $3, 'Phân tích SWOT')`, [groupId, groupDeadline, B])
  await assert.rejects(as(A, `insert into assignments (group_id, deadline_id, assignee_id, title) values ($1, $2, $3, 'x')`, [groupId, groupDeadline, C]))
  await assert.rejects(as(A, `insert into assignments (group_id, deadline_id, title) values ($1, $2, 'x')`, [groupId, personalA]))
  assert.equal((await rows(B, `select * from assignments`)).length, 1)
  assert.equal((await rows(C, `select * from assignments`)).length, 0)
})

test('Link chia sẻ: chỉ trả về đúng cụm dữ liệu của deadline, không lộ dữ liệu người gửi', async () => {
  await as(A, `insert into subtasks (deadline_id, title, is_completed) values ($1, 'Viết test', true)`, [personalA])
  const link = await one(A, `insert into share_links (deadline_id) values ($1) returning code`, [personalA])
  assert.match(link.code, /^[A-Za-z0-9]{8}$/)

  // Không ai khác đọc được bảng share_links; anon không đọc được bảng nào
  assert.equal((await rows(C, `select * from share_links`)).length, 0)
  await assert.rejects(as(null, `select * from deadlines`))
  await assert.rejects(as(null, `select * from share_links`))
  // Không tạo link cho deadline mình không truy cập được
  await assert.rejects(as(C, `insert into share_links (deadline_id) values ($1)`, [personalA]))

  const preview = (await one(null, `select get_shared_deadline($1) as d`, [link.code])).d
  assert.deepEqual(Object.keys(preview).sort(), ['course', 'due_date', 'expires_at', 'notes', 'priority', 'subtasks', 'task_type', 'title'])
  assert.equal(preview.title, 'Lab 4')
  assert.equal(preview.notes, null, 'ghi chú không được chia sẻ khi include_notes = false')
  assert.deepEqual(preview.course, { code: 'PRO192', name: 'OOP Java', color_code: 'red', block_name: 'Block 1' })
  assert.deepEqual(preview.subtasks, [{ title: 'Đọc đề' }, { title: 'Viết test' }])
  const text = JSON.stringify(preview)
  for (const secret of [A, 'a@fpt.edu.vn', 'Sinh viên A', personalA, courseA]) {
    assert.ok(!text.includes(secret), `preview không được chứa ${secret}`)
  }
  assert.equal((await one(null, `select get_shared_deadline('KHONGCO1') as d`)).d, null)

  // anon không sao chép được; C sao chép được vào lịch của mình
  await assert.rejects(as(null, `select copy_shared_deadline_limited($1)`, [link.code]))
  const newId = (await one(C, `select copy_shared_deadline_limited($1) as id`, [link.code])).id
  const copied = await one(C, `select d.user_id, d.status, d.notes, d.group_id, c.code, c.user_id as course_owner
                               from deadlines d join courses c on c.id = d.course_id where d.id = $1`, [newId])
  assert.equal(copied.user_id, C)
  assert.equal(copied.course_owner, C)
  assert.equal(copied.code, 'PRO192')
  assert.equal(copied.status, 'todo')
  assert.equal(copied.notes, null)
  const subs = await rows(C, `select title, is_completed from subtasks where deadline_id = $1 order by position, title`, [newId])
  assert.deepEqual(subs.map((s) => s.is_completed), [false, false])
  // Bản sao độc lập: A vẫn không thấy, C vẫn không thấy bản gốc
  assert.equal((await rows(A, `select * from deadlines where id = $1`, [newId])).length, 0)
  assert.equal((await rows(C, `select * from deadlines where id = $1`, [personalA])).length, 0)
  assert.equal((await one(A, `select use_count from share_links where code = $1`, [link.code])).use_count, 1)
})

test('Link hết hạn hoặc hết lượt không dùng được', async () => {
  const expired = await one(A, `insert into share_links (deadline_id, expires_at) values ($1, now() - interval '1 minute') returning code`, [personalA])
  assert.equal((await one(null, `select get_shared_deadline($1) as d`, [expired.code])).d, null)
  await assert.rejects(as(C, `select copy_shared_deadline_limited($1)`, [expired.code]))

  const once = await one(A, `insert into share_links (deadline_id, max_uses) values ($1, 1) returning code`, [personalA])
  await as(B, `select copy_shared_deadline_limited($1)`, [once.code])
  await assert.rejects(as(C, `select copy_shared_deadline_limited($1)`, [once.code]))
})

test('seed_demo.sql chạy được và chạy lại không bị trùng', async () => {
  const uid = (await db.query(`insert into auth.users (email) values ('vietnt@fpt.edu.vn') returning id`)).rows[0].id
  // Dữ liệu thật của người dùng (không thuộc demo) phải được giữ nguyên sau khi seed
  await as(uid, `insert into deadlines (title, due_date) values ('Việc riêng không gắn môn', now())`)
  const seed = await readFile(new URL('supabase/seed_demo.sql', root), 'utf8')
  await db.exec(seed)
  await db.exec(seed)
  const { rows: r } = await db.query(
    `select (select count(*) from courses c where c.user_id = u.id)::int as courses,
            (select count(*) from deadlines d where d.user_id = u.id)::int as deadlines,
            (select count(*) from deadlines d where d.user_id = u.id and d.is_group)::int as group_deadlines,
            (select count(*) from group_members m where m.user_id = u.id)::int as memberships
     from users u where u.email = 'vietnt@fpt.edu.vn'`,
  )
  assert.deepEqual(r[0], { courses: 6, deadlines: 14, group_deadlines: 2, memberships: 2 })
})

test('Thành viên rời nhóm thì mất quyền truy cập; chủ nhóm không tự rời được', async () => {
  await assert.rejects(async () => {
    const r = await as(A, `delete from group_members where group_id = $1 and user_id = $2`, [groupId, A])
    if (r.affectedRows === 0) throw new Error('blocked')
  })
  assert.equal((await as(B, `delete from group_members where group_id = $1 and user_id = $2`, [groupId, B])).affectedRows, 1)
  assert.equal((await rows(B, `select * from deadlines where group_id = $1`, [groupId])).length, 0)
  assert.equal((await rows(B, `select * from courses where id = $1`, [groupCourseA])).length, 0)
})

// ---------------------------------------------------------------------
// Bước 6: mời thành viên bằng email
// ---------------------------------------------------------------------
test('Mời thành viên bằng email (bản cũ): chỉ GỬI LỜI MỜI, email lạ trả null, không lộ dữ liệu thừa', async () => {
  await assert.rejects(as(C, `select add_group_member_limited($1, 'b@fpt.edu.vn')`, [groupId]))
  // Bản không giới hạn không được gọi trực tiếp
  await assert.rejects(as(A, `select add_group_member($1, 'b@fpt.edu.vn')`, [groupId]))

  assert.equal((await one(A, `select add_group_member_limited($1, 'khongco@fpt.edu.vn') as m`, [groupId])).m, null)
  const m = (await one(A, `select add_group_member_limited($1, '  C@FPT.edu.vn ') as m`, [groupId])).m
  assert.deepEqual(Object.keys(m).sort(), ['avatar_url', 'full_name', 'user_id'])
  assert.equal(m.user_id, C)
  // Mời lại không lỗi, không trùng; C CHƯA vào nhóm khi chưa đồng ý
  await as(A, `select add_group_member_limited($1, 'c@fpt.edu.vn')`, [groupId])
  assert.equal((await rows(A, `select * from group_invitations where group_id = $1 and invitee_id = $2`, [groupId, C])).length, 1)
  assert.equal((await rows(A, `select * from group_members where group_id = $1 and user_id = $2`, [groupId, C])).length, 0)
  assert.equal((await rows(C, `select id from deadlines where group_id = $1`, [groupId])).length, 0)
  // C đồng ý → vào nhóm, thấy deadline nhóm
  const inv = await one(C, `select id from my_group_invitations() where group_id = $1`, [groupId])
  await as(C, `select respond_group_invitation($1, true)`, [inv.id])
  assert.equal((await rows(A, `select * from group_members where group_id = $1 and user_id = $2`, [groupId, C])).length, 1)
  assert.equal((await rows(C, `select id from deadlines where group_id = $1`, [groupId])).length, 2)
})

// ---------------------------------------------------------------------
// Không có vai trò Admin: cấu hình máy chủ chỉ nằm ở biến môi trường của lập trình viên
// ---------------------------------------------------------------------
test('Admin cũ (chỉnh cấu hình máy chủ) đã gỡ: không còn bảng system_settings / app_admins và các RPC đó', async () => {
  const { rows: tables } = await db.query(
    `select tablename from pg_tables where schemaname = 'public' and tablename in ('system_settings', 'app_admins')`,
  )
  assert.deepEqual(tables, [])
  const { rows: fns } = await db.query(
    `select proname from pg_proc where pronamespace = 'public'::regnamespace
       and proname in ('is_app_admin', 'list_system_settings', 'set_system_setting')`,
  )
  assert.deepEqual(fns, [])
  await assert.rejects(as(A, `select is_app_admin()`))
})

// ---------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------
async function newUser(email) {
  return (await db.query(`insert into auth.users (email) values ($1) returning id`, [email])).rows[0].id
}

/**
 * Rate limit dùng cửa sổ cố định theo phút. Nếu một loạt request vắt qua ranh giới phút thì bộ đếm reset giữa chừng
 * và test sẽ chập chờn (máy chậm). Còn < 30 giây trong phút hiện tại → chờ sang phút mới rồi mới chạy.
 */
async function freshWindow() {
  const { rows } = await db.query(`select extract(second from now())::float as s`)
  if (rows[0].s > 30) await new Promise((r) => setTimeout(r, (60.5 - rows[0].s) * 1000))
}

test('Rate limit ghi deadline: tối đa 60 lần/phút/user → lỗi PT429', async () => {
  const D = await newUser('d@fpt.edu.vn')
  await freshWindow()
  for (let i = 0; i < 60; i++) await as(D, `insert into deadlines (title, due_date) values ($1, now())`, [`spam ${i}`])
  await assert.rejects(as(D, `insert into deadlines (title, due_date) values ('61', now())`), (e) => e.code === 'PT429')
  // Người khác không bị ảnh hưởng
  const E = await newUser('e@fpt.edu.vn')
  await as(E, `insert into deadlines (title, due_date) values ('ok', now())`)
})

test('Rate limit không chặn oan thao tác dây chuyền (xóa môn có nhiều deadline)', async () => {
  const F = await newUser('f@fpt.edu.vn')
  await freshWindow()
  const course = (await one(F, `insert into courses (code, name) values ('PRF192', 'C') returning id`)).id
  for (let i = 0; i < 50; i++) await as(F, `insert into deadlines (course_id, title, due_date) values ($1, $2, now())`, [course, `t${i}`])
  // ON DELETE SET NULL cập nhật 50 deadline: nếu bị đếm sẽ vượt 60
  assert.equal((await as(F, `delete from courses where id = $1`, [course])).affectedRows, 1)
  assert.equal((await one(F, `select count(*)::int as n from deadlines where course_id is null`)).n, 50)
})

test('Rate limit RPC công khai theo IP', async () => {
  const ip1 = { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }
  await freshWindow()
  for (let i = 0; i < 60; i++) await as(null, `select get_shared_deadline('XXXXXXXX')`, [], ip1)
  await assert.rejects(as(null, `select get_shared_deadline('XXXXXXXX')`, [], ip1), (e) => e.code === 'PT429')
  // IP khác vẫn dùng được; cf-connecting-ip được ưu tiên
  await as(null, `select get_shared_deadline('XXXXXXXX')`, [], { 'x-forwarded-for': '198.51.100.2' })
  await as(null, `select get_shared_deadline('XXXXXXXX')`, [], { 'cf-connecting-ip': '198.51.100.3', 'x-forwarded-for': '203.0.113.7' })
})

test('check_rate_limit cho Edge Functions: chỉ đếm cho chính mình', async () => {
  const G = await newUser('g@fpt.edu.vn')
  await assert.rejects(as(null, `select check_rate_limit('ai_chat', 2, 60)`))
  await freshWindow()
  await as(G, `select check_rate_limit('ai_chat', 2, 60)`)
  await as(G, `select check_rate_limit('ai_chat', 2, 60)`)
  await assert.rejects(as(G, `select check_rate_limit('ai_chat', 2, 60)`), (e) => e.code === 'PT429')
  await assert.rejects(as(G, `select check_rate_limit('Bad-Name!', 2, 60)`))
  // Client không gọi được hàm nội bộ để làm cạn quota của người khác
  await assert.rejects(as(G, `select consume_rate_limit('fn:ai_chat', $1, 1, 60)`, [A]))
  await assert.rejects(as(G, `select * from rate_limits`))
})

test('Index hiệu năng tồn tại và chạy lại file lõi an toàn', async () => {
  await db.exec(await readFile(new URL('supabase/migrations/20261024000001_core.sql', root), 'utf8'))
  const { rows: idx } = await db.query(`select indexname from pg_indexes where schemaname = 'public'`)
  const names = idx.map((r) => r.indexname)
  for (const n of ['deadlines_personal_due_idx', 'deadlines_group_due_idx', 'deadlines_user_status_due_idx', 'groups_owner_idx', 'courses_user_code_idx']) {
    assert.ok(names.includes(n), `thiếu index ${n}`)
  }
  assert.ok(!names.includes('deadlines_group_idx'))
})

test('Toàn bộ migration chạy lại được trên database đã có (mọi file idempotent)', async () => {
  const dir = new URL('supabase/migrations/', root)
  for (const f of (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()) {
    await db.exec(await readFile(new URL(f, dir), 'utf8'))
  }
})

test('Mọi email hợp lệ đều tạo được tài khoản (Gmail, email trường...); email sai định dạng bị chặn ngay tại auth.users', async () => {
  for (const ok of ['sv.moi@fpt.edu.vn', 'GiangVien@FE.EDU.VN', ' khoangtrang@fpt.edu.vn ', 'ban.moi@gmail.com', 'a.b+uniplan@outlook.com.vn', 'x@sub.domain.io'])
    await db.query(`insert into auth.users (email) values ($1)`, [ok])
  for (const bad of ['', 'khong-co-a-cong', 'a@b', 'a@b.c', 'a b@gmail.com', 'a@gmail..com', 'a@-gmail.com', 'a@gmail.com.', '@gmail.com', 'a@@gmail.com'])
    await assert.rejects(db.query(`insert into auth.users (email) values ($1)`, [bad]), /Email không hợp lệ/, bad)
  // Gmail có hồ sơ public.users như mọi tài khoản
  assert.equal((await db.query(`select count(*)::int as n from users where email = 'ban.moi@gmail.com'`)).rows[0].n, 1)
  // Đổi email sang dạng sai bị chặn; sang Gmail hợp lệ thì được; cập nhật trường khác không ảnh hưởng
  await assert.rejects(db.query(`update auth.users set email = 'sai dinh dang' where id = $1`, [A]), /Email không hợp lệ/)
  await db.query(`update auth.users set raw_user_meta_data = '{"x":1}' where id = $1`, [A])
  assert.equal((await db.query(`select is_allowed_email('a@gmail.com') as ok`)).rows[0].ok, true)
  assert.equal((await db.query(`select is_allowed_email('a@fe.edu.vn') as ok`)).rows[0].ok, true)
  // Trigger cũ chỉ cho email FPT đã được gỡ
  assert.equal((await db.query(`select count(*)::int as n from pg_trigger where tgname = 'enforce_fpt_email'`)).rows[0].n, 0)
})

test('Đăng ký thật: Supabase Auth (role supabase_auth_admin) tạo được tài khoản email trường và Gmail (Google OAuth), email sai vẫn bị chặn', async () => {
  const asAuth = (sql, params) =>
    db.transaction(async (tx) => {
      await tx.exec('set local role supabase_auth_admin')
      return tx.query(sql, params)
    })
  const { rows } = await asAuth(`insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`, [
    'dangky.that@fpt.edu.vn',
    { full_name: 'Đăng Ký Thật' },
  ])
  const profile = (await db.query(`select full_name from users where id = $1`, [rows[0].id])).rows[0]
  assert.equal(profile.full_name, 'Đăng Ký Thật', 'handle_new_user tạo hồ sơ')
  // Google OAuth: metadata có full_name + avatar_url từ Google
  const g = await asAuth(`insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`, [
    'nguoi.dung@gmail.com',
    { full_name: 'Người Dùng Google', avatar_url: 'https://lh3.googleusercontent.com/a/abc' },
  ])
  const gp = (await db.query(`select full_name, avatar_url, role from users where id = $1`, [g.rows[0].id])).rows[0]
  assert.deepEqual(gp, { full_name: 'Người Dùng Google', avatar_url: 'https://lh3.googleusercontent.com/a/abc', role: 'user' })
  await assert.rejects(asAuth(`insert into auth.users (email) values ('khong hop le')`), /Email không hợp lệ/)
})

test('Kế hoạch học: buổi tự học hoàn toàn cá nhân, chỉ gắn được với dữ liệu mình có quyền', async () => {
  const H = await newUser('h@fpt.edu.vn')
  const hCourse = (await one(H, `insert into courses (code, name) values ('JPD113', 'Tiếng Nhật') returning id`)).id
  const hExam = (await one(H, `insert into exams (course_id, exam_type, exam_date) values ($1, 'FE', now() + interval '5 days') returning id`, [hCourse])).id
  const s = await one(H,
    `insert into study_sessions (course_id, exam_id, title, start_at, end_at) values ($1, $2, 'Ôn FE', now() + interval '1 day', now() + interval '1 day 90 minutes') returning id, user_id`,
    [hCourse, hExam])
  assert.equal(s.user_id, H)

  // Người khác không thấy / sửa / xóa được
  assert.equal((await rows(A, `select * from study_sessions`)).length, 0)
  assert.equal((await as(A, `update study_sessions set title = 'x' where id = $1`, [s.id])).affectedRows, 0)
  assert.equal((await as(A, `delete from study_sessions where id = $1`, [s.id])).affectedRows, 0)
  await assert.rejects(as(null, `select * from study_sessions`))

  // Không gắn được với môn / kỳ thi / deadline của người khác
  await assert.rejects(as(A, `insert into study_sessions (course_id, title, start_at, end_at) values ($1, 'x', now(), now() + interval '1 hour')`, [hCourse]))
  await assert.rejects(as(A, `insert into study_sessions (exam_id, title, start_at, end_at) values ($1, 'x', now(), now() + interval '1 hour')`, [hExam]))
  await assert.rejects(as(H, `insert into study_sessions (deadline_id, title, start_at, end_at) values ($1, 'x', now(), now() + interval '1 hour')`, [personalA]))
  // Gắn với deadline nhóm mình là thành viên thì được
  await as(A, `insert into study_sessions (deadline_id, title, start_at, end_at) values ($1, 'Làm slide', now(), now() + interval '1 hour')`, [groupDeadline])

  // Ràng buộc thời gian
  await assert.rejects(as(H, `insert into study_sessions (title, start_at, end_at) values ('x', now(), now() - interval '1 minute')`))
  await assert.rejects(as(H, `insert into study_sessions (title, start_at, end_at) values ('x', now(), now() + interval '13 hours')`))

  // Xóa kỳ thi → buổi học vẫn còn, bỏ liên kết
  await as(H, `delete from exams where id = $1`, [hExam])
  assert.equal((await one(H, `select exam_id from study_sessions where id = $1`, [s.id])).exam_id, null)
})

test('Web Push: đăng ký thiết bị qua RPC, máy dùng chung chuyển chủ, chỉ thấy đăng ký của mình', async () => {
  const P = await newUser('push.p@fpt.edu.vn')
  const Q = await newUser('push.q@fpt.edu.vn')
  const key = 'B' + 'A'.repeat(86) // 87 ký tự base64url như p256dh thật
  const auth = 'a'.repeat(22)
  const ep = 'https://fcm.googleapis.com/fcm/send/abc123'
  await as(P, `select register_push_subscription($1, $2, $3, 'Edge')`, [ep, key, auth])
  await as(P, `select register_push_subscription($1, $2, $3, 'Edge')`, [ep, key, auth]) // lặp lại không lỗi
  assert.equal((await rows(P, `select * from push_subscriptions`)).length, 1)
  assert.equal((await rows(Q, `select * from push_subscriptions`)).length, 0, 'không thấy của người khác')

  // Q đăng nhập trên cùng trình duyệt → đăng ký chuyển sang Q, P không còn
  await as(Q, `select register_push_subscription($1, $2, $3, null)`, [ep, key, auth])
  assert.equal((await rows(P, `select * from push_subscriptions`)).length, 0)
  assert.equal((await rows(Q, `select * from push_subscriptions`)).length, 1)

  // Dữ liệu xấu bị chặn
  await assert.rejects(as(P, `select register_push_subscription('http://evil.com/x', $1, $2)`, [key, auth]))
  await assert.rejects(as(P, `select register_push_subscription($1, 'ngắn', $2)`, [ep + '2', auth]))
  await assert.rejects(as(null, `select register_push_subscription($1, $2, $3)`, [ep + '3', key, auth]))
  // Tối đa 10 thiết bị / người
  for (let i = 0; i < 12; i++) await as(P, `select register_push_subscription($1, $2, $3)`, [`${ep}/dev${i}`, key, auth])
  assert.equal((await rows(P, `select * from push_subscriptions`)).length, 10)
  // Người dùng tự xóa đăng ký của mình (tắt thông báo)
  assert.equal((await as(P, `delete from push_subscriptions where endpoint = $1`, [`${ep}/dev11`])).affectedRows, 1)
})

test('Web Push: due_reminders chọn đúng người, đúng mốc 3 ngày / 1 ngày / 1 giờ / đến hạn, không lặp lại; chỉ service_role gọi được', async () => {
  const R = await newUser('remind.r@fpt.edu.vn')
  const T = await newUser('remind.t@fpt.edu.vn') // thành viên nhóm của R
  const N = await newUser('remind.n@fpt.edu.vn') // không bật push
  const key = 'B' + 'A'.repeat(86)
  for (const [u, i] of [[R, 1], [T, 2]]) await as(u, `select register_push_subscription($1, $2, $3)`, [`https://fcm.googleapis.com/fcm/send/test-${i}`, key, 'a'.repeat(22)])
  // Bộ mốc cũ (3 ngày / 1 ngày / 1 giờ / đến hạn) để kiểm tra logic chọn mốc; mặc định mới xem test "Mốc mặc định (migration 010)"
  for (const u of [R, T]) await as(u, `insert into reminder_prefs (user_id, kinds) values ($1, '{3d,24h,1h,due}')`, [u])

  const now = '2026-10-17T10:00:00Z'
  const mk = (uid, title, due, extra = '') =>
    one(uid, `insert into deadlines (title, due_date${extra ? ', ' + extra.split('=')[0] : ''}) values ($1, $2${extra ? ', $3' : ''}) returning id`,
      extra ? [title, due, extra.split('=')[1]] : [title, due])
  const d24 = (await mk(R, 'Còn 20 giờ', '2026-10-18T06:00:00Z')).id
  const d1 = (await mk(R, 'Còn 30 phút', '2026-10-17T10:30:00Z')).id
  const d3 = (await mk(R, 'Còn 2 ngày', '2026-10-19T10:00:00Z')).id
  await mk(R, 'Còn 4 ngày (chưa tới mốc)', '2026-10-21T10:00:00Z')
  const dDue = (await mk(R, 'Vừa đến hạn 5 phút trước', '2026-10-17T09:55:00Z')).id
  await mk(R, 'Quá hạn 1 giờ (quá lâu, không nhắc)', '2026-10-17T09:00:00Z')
  const done = (await mk(R, 'Đã xong', '2026-10-17T12:00:00Z')).id
  await as(R, `update deadlines set status = 'done' where id = $1`, [done])
  await mk(N, 'Người không bật push', '2026-10-17T12:00:00Z')
  const g = (await one(R, `insert into groups (name) values ('Nhóm nhắc') returning id`)).id
  await join(R, g, T)
  const dg = (await mk(R, 'Bài nhóm', '2026-10-18T09:00:00Z', `group_id=${g}`)).id

  // Người dùng thường không gọi được
  await assert.rejects(as(R, `select * from due_reminders()`))
  await assert.rejects(as(null, `select * from due_reminders()`))
  await assert.rejects(as(R, `select * from reminder_log`))

  const list = async () => (await db.query(`select user_id, deadline_id, kind from due_reminders($1) order by due_date, user_id`, [now])).rows
  const got = await list()
  const name = (id) => ({ [d1]: 'd1', [d24]: 'd24', [dg]: 'dg', [d3]: 'd3', [dDue]: 'dDue' })[id] ?? 'khác'
  const fmt = (r) => `${r.user_id === R ? 'R' : r.user_id === T ? 'T' : '?'}:${name(r.deadline_id)}:${r.kind}`
  assert.deepEqual(got.map(fmt).sort(), ['R:d1:1h', 'R:d24:24h', 'R:d3:3d', 'R:dDue:due', 'R:dg:24h', 'T:dg:24h'])

  // Ghi log (như Edge Function) → không trả lại nữa
  await db.query(`insert into reminder_log (deadline_id, user_id, kind) select deadline_id, user_id, kind from due_reminders($1)`, [now])
  assert.deepEqual(await list(), [])
  // 1 giờ trước hạn của d24 → đến lượt mốc 1h
  const later = (await db.query(`select user_id, deadline_id, kind from due_reminders('2026-10-18T05:30:00Z')`)).rows
  assert.deepEqual(later.filter((r) => r.deadline_id === d24).map((r) => r.kind), ['1h'])
  // Đi qua lần lượt các mốc của d3 (hạn 19/10 10:00): 1 ngày → 1 giờ → đến hạn, mỗi mốc đúng 1 lần
  for (const [at, kind] of [['2026-10-18T10:30:00Z', '24h'], ['2026-10-19T09:10:00Z', '1h'], ['2026-10-19T10:03:00Z', 'due']]) {
    const rows = (await db.query(`select deadline_id, user_id, kind from due_reminders($1)`, [at])).rows.filter((r) => r.deadline_id === d3)
    assert.deepEqual(rows.map((r) => r.kind), [kind], `mốc ${kind} lúc ${at}`)
    await db.query(`insert into reminder_log (deadline_id, user_id, kind) values ($1, $2, $3)`, [d3, R, kind])
    assert.equal((await db.query(`select count(*)::int as n from due_reminders($1) where deadline_id = $2`, [at, d3])).rows[0].n, 0)
  }
  // Quá hạn > 15 phút: không nhắc nữa; mốc lạ bị từ chối
  assert.equal((await db.query(`select count(*)::int as n from due_reminders('2026-10-19T10:20:00Z') where deadline_id = $1`, [d3])).rows[0].n, 0)
  await assert.rejects(db.query(`insert into reminder_log (deadline_id, user_id, kind) values ($1, $2, '5m')`, [d3, R]))
})

test('Mốc nhắc tự chọn (migration 020): chỉ nhắc mốc đã bật, chọn mốc gần nhất, mỗi người trong nhóm theo lựa chọn riêng', async () => {
  const U = await newUser('prefs.u@fpt.edu.vn')
  const V = await newUser('prefs.v@fpt.edu.vn') // cùng nhóm, bộ mốc cũ 3 ngày / 1 ngày / 1 giờ / đến hạn
  const W = await newUser('prefs.w@fpt.edu.vn')
  const key = 'B' + 'A'.repeat(86)
  for (const [u, i] of [[U, 11], [V, 12]]) await as(u, `select register_push_subscription($1, $2, $3)`, [`https://fcm.googleapis.com/fcm/send/test-${i}`, key, 'a'.repeat(22)])
  await as(V, `insert into reminder_prefs (user_id, kinds) values ($1, '{3d,24h,1h,due}')`, [V])

  // Chỉ chủ tài khoản đọc / ghi lựa chọn của mình; mốc lạ bị từ chối
  await as(U, `insert into reminder_prefs (user_id, kinds) values ($1, '{24h,3h,15m}')`, [U])
  await assert.rejects(as(U, `insert into reminder_prefs (user_id, kinds) values ($1, '{1h}')`, [W]))
  await assert.rejects(as(U, `update reminder_prefs set kinds = '{5m}' where user_id = $1`, [U]))
  assert.equal((await rows(W, `select * from reminder_prefs`)).length, 0)
  assert.deepEqual((await rows(U, `select kinds from reminder_prefs`))[0].kinds, ['24h', '3h', '15m'])
  await assert.rejects(as(null, `select * from reminder_prefs`))

  const g = (await one(U, `insert into groups (name) values ('Nhóm mốc') returning id`)).id
  await join(U, g, V)
  const d = (await one(U, `insert into deadlines (title, due_date, group_id) values ('Bài mốc', '2026-11-02T12:00:00Z', $1) returning id`, [g])).id
  const at = async (now) =>
    (await db.query(`select user_id, kind from due_reminders($1) where deadline_id = $2`, [now, d])).rows
      .map((r) => `${r.user_id === U ? 'U' : r.user_id === V ? 'V' : '?'}:${r.kind}`).sort()

  assert.deepEqual(await at('2026-10-31T00:00:00Z'), ['V:3d'], 'còn 2,5 ngày: U không bật mốc 3 ngày')
  assert.deepEqual(await at('2026-11-02T07:00:00Z'), ['U:24h', 'V:24h'], 'còn 5 giờ')
  assert.deepEqual(await at('2026-11-02T09:30:00Z'), ['U:3h', 'V:24h'], 'còn 2,5 giờ: U có mốc 3 giờ')
  assert.deepEqual(await at('2026-11-02T11:50:00Z'), ['U:15m', 'V:1h'], 'còn 10 phút')
  assert.deepEqual(await at('2026-11-02T12:05:00Z'), ['V:due'], 'đến hạn: U tắt mốc đến hạn')
  // Mốc 15 phút đã gửi → không lặp lại
  await db.query(`insert into reminder_log (deadline_id, user_id, kind) values ($1, $2, '15m')`, [d, U])
  assert.deepEqual(await at('2026-11-02T11:52:00Z'), ['V:1h'])
  // Tắt hết → không nhắc
  await as(U, `update reminder_prefs set kinds = '{}' where user_id = $1`, [U])
  assert.deepEqual(await at('2026-11-02T07:00:00Z'), ['V:24h'])
})

// ---------------------------------------------------------------------
// Cài đặt: hồ sơ cá nhân + ảnh đại diện (migration 011)
// ---------------------------------------------------------------------
test('Hồ sơ: chỉ sửa được họ tên / mã SV / cơ sở / ảnh của chính mình; dữ liệu được chuẩn hóa và kiểm tra', async () => {
  const P = await newUser('hoso@fpt.edu.vn')
  const Q = await newUser('nguoikhac@fpt.edu.vn')
  const avatar = `https://abc.supabase.co/storage/v1/object/public/avatars/${P}/avatar-1.webp`

  await as(P, `update users set full_name = $1, student_code = $2, campus = $3, avatar_url = $4 where id = $5`, [
    '  Nguyễn   Thị Ánh  ', ' de180123 ', 'FPT University Hà Nội', avatar, P,
  ])
  const row = await one(P, `select full_name, student_code, campus, avatar_url from users where id = $1`, [P])
  assert.deepEqual(row, { full_name: 'Nguyễn Thị Ánh', student_code: 'de180123', campus: 'FPT University Hà Nội', avatar_url: avatar })

  // Xóa mã SV (giảng viên) và ảnh
  await as(P, `update users set student_code = '', avatar_url = null where id = $1`, [P])
  assert.deepEqual(await one(P, `select student_code, avatar_url from users where id = $1`, [P]), { student_code: null, avatar_url: null })

  // Không sửa được email / id / created_at (chặn chiếm lời mời nhóm của email khác)
  await assert.rejects(as(P, `update users set email = 'chua.dang.ky@fpt.edu.vn' where id = $1`, [P]), /permission denied/)
  await assert.rejects(as(P, `update users set created_at = now() - interval '1 year' where id = $1`, [P]), /permission denied/)
  await assert.rejects(as(null, `update users set full_name = 'Anon' where id = $1`, [P]))

  // Dữ liệu sai bị database từ chối
  await assert.rejects(as(P, `update users set full_name = 'A' where id = $1`, [P]), /Họ và tên/)
  await assert.rejects(as(P, `update users set full_name = 'Hacker 123' where id = $1`, [P]), /Họ và tên/)
  await assert.rejects(as(P, `update users set full_name = '<script>' where id = $1`, [P]), /Họ và tên/)
  // MSSV viết tự do (chữ, số, ký hiệu), tối đa 14 ký tự
  for (const ok of ['ABC', 'GV-2024/05', 'Sinh vien 1', '12345678901234']) {
    await as(P, `update users set student_code = $1 where id = $2`, [ok, P])
    assert.equal((await one(P, `select student_code from users where id = $1`, [P])).student_code, ok)
  }
  await assert.rejects(as(P, `update users set student_code = '123456789012345' where id = $1`, [P]), /Mã số sinh viên/)
  // Chỉ tiếng Anh: không nhận chữ tiếng Việt có dấu
  for (const vi of ['Sinh viên', 'MÃ-01', 'đề']) {
    await assert.rejects(as(P, `update users set student_code = $1 where id = $2`, [vi, P]), /tiếng Anh/, `chấp nhận MSSV có dấu: ${vi}`)
  }
  await assert.rejects(as(P, `update users set student_code = E'AB\nCD' where id = $1`, [P]), /Mã số sinh viên|check/)
  await assert.rejects(as(P, `update users set campus = 'Trường khác' where id = $1`, [P]), /Cơ sở/)
  for (const bad of [
    'https://evil.example.com/track.png',
    `https://abc.supabase.co/storage/v1/object/public/avatars/${Q}/avatar-1.webp`,
    `https://abc.supabase.co/storage/v1/object/public/avatars/${P}/../x.webp`,
    `javascript:alert(1)`,
  ]) {
    await assert.rejects(as(P, `update users set avatar_url = $1 where id = $2`, [bad, P]), /Ảnh đại diện/, bad)
  }

  // Người khác không sửa được hồ sơ của P (RLS: 0 dòng bị ảnh hưởng)
  const r = await as(Q, `update users set full_name = 'Bị Đổi Tên' where id = $1`, [P])
  assert.equal(r.affectedRows ?? 0, 0)
  assert.equal((await one(P, `select full_name from users where id = $1`, [P])).full_name, 'Nguyễn Thị Ánh')
})

test('Ảnh đại diện (Storage): chỉ tải lên / xem danh sách / xóa trong thư mục của mình; bucket giới hạn 2 MB và loại ảnh', async () => {
  const bucket = (await db.query(`select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'avatars'`)).rows[0]
  assert.deepEqual(bucket, { public: true, file_size_limit: 2097152, allowed_mime_types: ['image/png', 'image/jpeg', 'image/webp'] })

  const P = await newUser('anh.p@fpt.edu.vn')
  const Q = await newUser('anh.q@fpt.edu.vn')
  await as(P, `insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [`${P}/avatar-1.webp`])
  await as(Q, `insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [`${Q}/avatar-1.webp`])

  // Không ghi vào thư mục người khác / thư mục gốc
  await assert.rejects(as(P, `insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [`${Q}/hack.webp`]))
  await assert.rejects(as(P, `insert into storage.objects (bucket_id, name) values ('avatars', 'hack.webp')`))
  await assert.rejects(as(null, `insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [`${P}/anon.webp`]))

  // Chỉ liệt kê được file của mình
  assert.deepEqual((await rows(P, `select name from storage.objects where bucket_id = 'avatars'`)).map((x) => x.name), [`${P}/avatar-1.webp`])

  // Không xóa / ghi đè được file của người khác
  await as(P, `delete from storage.objects where name = $1`, [`${Q}/avatar-1.webp`])
  await as(P, `update storage.objects set name = $1 where name = $2`, [`${Q}/x.webp`, `${Q}/avatar-1.webp`])
  assert.equal((await db.query(`select count(*)::int as n from storage.objects where name = $1`, [`${Q}/avatar-1.webp`])).rows[0].n, 1)
  // Không chuyển file của mình sang thư mục người khác
  await assert.rejects(as(P, `update storage.objects set name = $1 where name = $2`, [`${Q}/moved.webp`, `${P}/avatar-1.webp`]))

  // Xóa file của mình được
  await as(P, `delete from storage.objects where name = $1`, [`${P}/avatar-1.webp`])
  assert.deepEqual(await rows(P, `select name from storage.objects where bucket_id = 'avatars'`), [])
})

test('Quản trị tài khoản: người dùng không tự nâng quyền / tự mở khóa; admin đọc được mọi hồ sơ và nhật ký', async () => {
  const U = await newUser('user.u@fpt.edu.vn')
  const M = await newUser('admin.m@fpt.edu.vn')
  const outsider = await newUser('user.v@fpt.edu.vn')

  // Mặc định là user, chưa khóa
  assert.deepEqual(await one(U, `select role, is_locked from users where id = auth.uid()`), { role: 'user', is_locked: false })
  // Không tự nâng quyền / tự mở khóa (không có quyền UPDATE trên các cột này)
  await assert.rejects(as(U, `update users set role = 'admin' where id = auth.uid()`))
  await assert.rejects(as(U, `update users set is_locked = false where id = auth.uid()`))
  await assert.rejects(as(U, `update users set locked_reason = null where id = auth.uid()`))
  assert.equal((await one(U, `select is_admin() as v`)).v, false)

  // Người dùng thường không thấy hồ sơ người lạ, không đọc nhật ký quản trị
  assert.equal((await rows(U, `select id from users where id = $1`, [outsider])).length, 0)
  assert.equal((await rows(U, `select * from admin_audit_log`)).length, 0)
  await assert.rejects(as(U, `insert into admin_audit_log (action) values ('lock')`))

  // Cấp admin (chỉ làm được bằng quyền cao: SQL Editor / service role)
  await db.query(`update public.users set role = 'admin' where id = $1`, [M])
  assert.equal((await one(M, `select is_admin() as v`)).v, true)
  assert.ok((await rows(M, `select id from users`)).length >= 3, 'admin xem được mọi hồ sơ')
  // Admin cũng không ghi trực tiếp được cột quản trị qua API (phải qua Edge Function)
  await assert.rejects(as(M, `update users set is_locked = true where id = $1`, [U]))
  assert.equal((await as(M, `update users set full_name = 'Đổi Tên' where id = $1`, [U])).affectedRows, 0)
  // Nhật ký: chỉ admin đọc; ghi bằng service role
  await db.query(`insert into public.admin_audit_log (admin_id, target_id, action, details) values ($1, $2, 'lock', '{"reason":"test"}')`, [M, U])
  assert.equal((await rows(M, `select action from admin_audit_log where target_id = $1`, [U])).length, 1)
  assert.equal((await rows(U, `select * from admin_audit_log`)).length, 0)
  // Vai trò sai giá trị bị chặn
  await assert.rejects(db.query(`update public.users set role = 'superadmin' where id = $1`, [U]))
})

test('Tài khoản bị khóa: chặn ngay mọi đọc / ghi dữ liệu (kể cả token cũ), vẫn xem được hồ sơ của mình; admin bị khóa mất quyền admin', async () => {
  const L = await newUser('user.locked@fpt.edu.vn')
  const course = (await one(L, `insert into courses (code, name, color_code) values ('LCK101', 'Khóa', 'red') returning id`)).id
  await as(L, `insert into deadlines (course_id, title, due_date) values ($1, 'Việc', now() + interval '1 day')`, [course])

  await db.query(`update public.users set is_locked = true, locked_at = now(), locked_reason = 'Vi phạm' where id = $1`, [L])

  assert.equal((await one(L, `select is_locked_user() as v`)).v, true)
  for (const table of ['courses', 'deadlines', 'schedules', 'exams', 'study_sessions', 'groups']) {
    assert.equal((await rows(L, `select * from ${table}`)).length, 0, `bị khóa vẫn đọc được ${table}`)
  }
  await assert.rejects(as(L, `insert into courses (code, name, color_code) values ('X1', 'x', 'red')`))
  assert.equal((await as(L, `update users set full_name = 'Tự Sửa' where id = auth.uid()`)).affectedRows, 0)
  // Vẫn đọc được hồ sơ của mình (để app hiện thông báo bị khóa), không đọc được người khác
  assert.deepEqual(await rows(L, `select is_locked from users`), [{ is_locked: true }])
  assert.equal((await one(L, `select my_lock_info() as r`)).r.locked_reason, 'Vi phạm', 'lý do khóa xem qua RPC')

  // Mở khóa → truy cập lại bình thường, dữ liệu còn nguyên
  await db.query(`update public.users set is_locked = false, locked_at = null, locked_reason = null where id = $1`, [L])
  assert.equal((await rows(L, `select * from deadlines`)).length, 1)

  // Admin bị khóa thì is_admin() = false
  const AM = await newUser('admin.locked@fpt.edu.vn')
  await db.query(`update public.users set role = 'admin', is_locked = true where id = $1`, [AM])
  assert.equal((await one(AM, `select is_admin() as v`)).v, false)
  assert.equal((await rows(AM, `select * from admin_audit_log`)).length, 0)
})

// ---------------------------------------------------------------------
// Rà soát bảo mật (24/10): mỗi test mô phỏng 1 kiểu tấn công đã tìm thấy
// ---------------------------------------------------------------------
test('Bảo mật – SSRF: không ghi thẳng push_subscriptions, endpoint chỉ được là dịch vụ push của trình duyệt', async () => {
  const U = await newUser('ssrf.u@fpt.edu.vn')
  const key = 'B' + 'A'.repeat(86)
  const auth = 'a'.repeat(22)
  // Ghi thẳng qua API (bỏ qua kiểm tra của RPC) → bị chặn
  await assert.rejects(as(U, `insert into push_subscriptions (endpoint, p256dh, auth) values ('http://169.254.169.254/latest/meta-data', $1, $2)`, [key, auth]))
  await assert.rejects(as(U, `insert into push_subscriptions (endpoint, p256dh, auth) values ('https://fcm.googleapis.com/fcm/send/x', $1, $2)`, [key, auth]))
  // Qua RPC nhưng endpoint là máy chủ tùy ý → bị chặn
  for (const ep of ['https://evil.example/hook', 'https://fcm.googleapis.com.evil.example/x', 'https://127.0.0.1/x', 'https://attacker.com/?https://fcm.googleapis.com/']) {
    await assert.rejects(as(U, `select register_push_subscription($1, $2, $3)`, [ep, key, auth]), `phải chặn ${ep}`)
  }
  // Dịch vụ push thật → nhận
  for (const ep of [
    'https://fcm.googleapis.com/fcm/send/abc',
    'https://updates.push.services.mozilla.com/wpush/v2/abc',
    'https://web.push.apple.com/abc',
    'https://wns2-par02p.notify.windows.com/w/?token=abc',
  ]) {
    await as(U, `select register_push_subscription($1, $2, $3)`, [ep, key, auth])
  }
  const own = await rows(U, `select endpoint from push_subscriptions`)
  assert.equal(own.length, 4)
  // Không sửa được endpoint đã lưu, vẫn tự xóa được thiết bị của mình (tắt thông báo)
  await assert.rejects(as(U, `update push_subscriptions set endpoint = 'https://evil.example/x'`))
  await as(U, `delete from push_subscriptions where endpoint = 'https://web.push.apple.com/abc'`)
  assert.equal((await rows(U, `select endpoint from push_subscriptions`)).length, 3)
})

test('Bảo mật – lý do khóa tài khoản chỉ chính chủ (và admin qua máy chủ) xem được, bạn cùng nhóm không thấy', async () => {
  const X = await newUser('khoa.x@fpt.edu.vn')
  const Y = await newUser('khoa.y@fpt.edu.vn')
  const g = (await one(X, `insert into groups (name) values ('Nhóm khóa') returning id`)).id
  await join(X, g, Y)
  await db.query(`update users set is_locked = true, locked_at = now(), locked_reason = 'Gian lận bài thi' where id = $1`, [Y])
  // Bạn cùng nhóm xem được hồ sơ công khai nhưng KHÔNG đọc được lý do khóa
  assert.equal((await one(X, `select full_name from users where id = $1`, [Y])).full_name, 'khoa.y')
  await assert.rejects(as(X, `select locked_reason from users where id = $1`, [Y]))
  await assert.rejects(as(X, `select * from users where id = $1`, [Y]))
  // Chính chủ xem lý do qua RPC
  const mine = (await one(Y, `select my_lock_info() as r`)).r
  assert.equal(mine.locked_reason, 'Gian lận bài thi')
  assert.equal((await one(X, `select my_lock_info() as r`)).r.locked_reason, null)
})

test('Bảo mật – đăng ký: ảnh đại diện từ metadata chỉ nhận ảnh Google, họ tên bị cắt ≤ 100 ký tự', async () => {
  const ins = async (email, meta) => (await db.query(`insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`, [email, meta])).rows[0].id
  const t = await ins('track@gmail.com', { full_name: 'Kẻ Theo Dõi', avatar_url: 'https://attacker.example/pixel.gif' })
  const g = await ins('google@gmail.com', { full_name: 'Người Dùng Google', avatar_url: 'https://lh3.googleusercontent.com/a/ACg8ocK=s96-c' })
  const l = await ins('long@gmail.com', { full_name: 'A'.repeat(5000) + '\u0007' })
  const get = async (id) => (await db.query(`select full_name, avatar_url from users where id = $1`, [id])).rows[0]
  assert.equal((await get(t)).avatar_url, null, 'chặn ảnh theo dõi IP')
  assert.equal((await get(g)).avatar_url, 'https://lh3.googleusercontent.com/a/ACg8ocK=s96-c')
  const long = await get(l)
  assert.ok(long.full_name.length <= 100 && !/[\u0000-\u001f]/.test(long.full_name))
})

test('Bảo mật – nhóm, phần việc, link chia sẻ, độ dài dữ liệu', async () => {
  const O = await newUser('baomat.o@fpt.edu.vn') // chủ nhóm
  const M = await newUser('baomat.m@fpt.edu.vn') // thành viên
  const S = await newUser('baomat.s@fpt.edu.vn') // người ngoài
  const secretCourse = (await one(S, `insert into courses (code, name) values ('SEC101', 'Môn bí mật') returning id`)).id
  const myCourse = (await one(O, `insert into courses (code, name) values ('OWN101', 'Môn của chủ nhóm') returning id`)).id
  const g = (await one(O, `insert into groups (name) values ('Nhóm bảo mật') returning id`)).id
  await join(O, g, M)

  // Chủ nhóm không gắn nhóm vào môn của người khác (để đọc trộm môn đó); gắn môn của mình thì được
  await assert.rejects(as(O, `update groups set course_id = $1 where id = $2`, [secretCourse, g]))
  await as(O, `update groups set course_id = $1 where id = $2`, [myCourse, g])

  // Thành viên không mạo danh người tạo phần việc (để được xóa việc của người khác)
  const d = (await one(O, `insert into deadlines (title, due_date, group_id) values ('Bài nhóm', now() + interval '2 days', $1) returning id`, [g])).id
  const a = (await one(O, `insert into assignments (group_id, deadline_id, title) values ($1, $2, 'Phần của O') returning id`, [g, d])).id
  await assert.rejects(as(M, `update assignments set created_by = $1 where id = $2`, [M, a]))
  await as(M, `update assignments set status = 'in_progress' where id = $1`, [a])

  // Link chia sẻ: không tự đặt "không bao giờ hết hạn", hạn quá 30 ngày, hay số lượt dùng
  await assert.rejects(as(O, `insert into share_links (deadline_id, expires_at) values ($1, null)`, [d]))
  await assert.rejects(as(O, `insert into share_links (deadline_id, expires_at) values ($1, now() + interval '10 years')`, [d]))
  await assert.rejects(as(O, `insert into share_links (deadline_id, use_count) values ($1, -1000)`, [d]))
  await as(O, `insert into share_links (deadline_id) values ($1)`, [d])

  // Ghi chú / mô tả quá dài (chống nhồi dữ liệu)
  await assert.rejects(as(O, `insert into deadlines (title, due_date, notes) values ('Dài', now(), $1)`, ['x'.repeat(5001)]))
  await assert.rejects(as(O, `update groups set description = $1 where id = $2`, ['x'.repeat(2001), g]))
  await as(O, `insert into deadlines (title, due_date, notes) values ('Vừa', now(), $1)`, ['x'.repeat(5000)])
})

test('Màu môn tự chọn (migration 005): chỉ nhận dạng #rrggbb chữ thường, bỏ trống = dùng màu gợi ý', async () => {
  const K = await newUser('mau.k@fpt.edu.vn')
  const c = (await one(K, `insert into courses (code, name, color_code, color_hex) values ('CLR101', 'Màu', 'teal', '#0ea5e9') returning id, color_hex`)).id
  assert.equal((await one(K, `select color_hex from courses where id = $1`, [c])).color_hex, '#0ea5e9')
  for (const bad of ['#FFF', 'red', '#12345g', '#0EA5E9', 'url(javascript:1)', '#0ea5e9;background:red']) {
    await assert.rejects(as(K, `update courses set color_hex = $1 where id = $2`, [bad, c]), `phải chặn ${bad}`)
  }
  await as(K, `update courses set color_hex = null where id = $1`, [c])
  assert.equal((await one(K, `select color_hex, color_code from courses where id = $1`, [c])).color_code, 'teal')
})

test('Giảng viên của môn (migration 006): lưu / xóa được, tối đa 200 ký tự, chỉ chủ môn sửa', async () => {
  const L = await newUser('gv.l@fpt.edu.vn')
  const O = await newUser('gv.o@fpt.edu.vn')
  const c = (await one(L, `insert into courses (code, name, lecturer) values ('GV101', 'Môn có giảng viên', 'ThS. Thanh Việt') returning id`)).id
  assert.equal((await one(L, `select lecturer from courses where id = $1`, [c])).lecturer, 'ThS. Thanh Việt')
  await assert.rejects(as(L, `update courses set lecturer = $1 where id = $2`, ['x'.repeat(201), c]))
  await as(O, `update courses set lecturer = 'Kẻ lạ' where id = $1`, [c]) // RLS: không thấy môn người khác → không sửa được gì
  assert.equal((await one(L, `select lecturer from courses where id = $1`, [c])).lecturer, 'ThS. Thanh Việt')
  await as(L, `update courses set lecturer = null where id = $1`, [c])
  assert.equal((await one(L, `select lecturer from courses where id = $1`, [c])).lecturer, null)
})

test('Trang Quản trị: admin_list_users trả trang người dùng + tổng + thống kê + nhật ký trong 1 lần gọi; chỉ service_role', async () => {
  const M = await newUser('quantri.m@fpt.edu.vn')
  const N = await newUser('quantri.n@gmail.com')
  await db.query(`update users set role = 'admin', full_name = 'Quản Trị M' where id = $1`, [M])
  await db.query(`update users set is_locked = true, student_code = 'QT123' where id = $1`, [N])
  await db.query(`insert into user_private (user_id, phone) values ($1, '0353021389')`, [N])
  await db.query(`update auth.users set last_sign_in_at = '2026-10-20T08:00:00Z' where id = $1`, [N])
  await db.query(`insert into admin_audit_log (admin_id, target_id, action, details) values ($1, $2, 'lock', '{"reason":"spam"}')`, [M, N])

  // Người dùng thường / anon không gọi được (dữ liệu toàn hệ thống)
  await assert.rejects(as(M, `select admin_list_users()`))
  await assert.rejects(as(null, `select admin_list_users()`))

  const call = async (...args) => (await db.query(`select admin_list_users($1, $2, $3, $4, $5, $6) as r`, args)).rows[0].r
  const all = await call('', null, null, 0, 100, true)
  const total = (await db.query(`select count(*)::int as n from users`)).rows[0].n
  assert.equal(all.total, total)
  assert.equal(all.stats.total, total)
  assert.ok(all.stats.admins >= 1 && all.stats.locked >= 1)
  assert.ok(all.audit.some((e) => e.action === 'lock' && e.target.email === 'quantri.n@gmail.com' && e.admin.email === 'quantri.m@fpt.edu.vn'))

  // Tìm theo số điện thoại / MSSV / tên; lọc vai trò, trạng thái; có lần đăng nhập gần nhất từ auth.users
  const byPhone = await call('021389', null, null, 0, 20, false)
  assert.deepEqual(byPhone.users.map((u) => u.email), ['quantri.n@gmail.com'])
  assert.equal(byPhone.users[0].phone, '0353021389')
  assert.equal(byPhone.users[0].studentCode, 'QT123')
  assert.ok(byPhone.users[0].isLocked)
  assert.ok(byPhone.users[0].lastSignInAt.startsWith('2026-10-20'))
  assert.equal(byPhone.audit, null, 'không xin nhật ký thì không trả')
  assert.deepEqual((await call('Quản Trị', 'admin', 'active', 0, 20, false)).users.map((u) => u.email), ['quantri.m@fpt.edu.vn'])
  assert.equal((await call('quantri.n', null, 'active', 0, 20, false)).total, 0)
  // Phân trang
  const p0 = await call('', null, null, 0, 2, false)
  const p1 = await call('', null, null, 1, 2, false)
  assert.equal(p0.users.length, 2)
  assert.equal(p0.pageSize, 2)
  assert.ok(!p1.users.some((u) => p0.users.some((x) => x.id === u.id)))
})

test('Số điện thoại: bảng riêng, chỉ chủ tài khoản và admin đọc; bạn cùng nhóm không thấy; sai định dạng bị chặn', async () => {
  const U = await newUser('phone.u@fpt.edu.vn')
  const T = await newUser('phone.t@fpt.edu.vn')
  const M = await newUser('phone.admin@fpt.edu.vn')
  await db.query(`update public.users set role = 'admin' where id = $1`, [M])
  await db.query(`insert into public.user_private (user_id, phone) values ($1, '0912345678'), ($2, '0987654321')`, [U, T])

  // Chủ tài khoản đọc được số của mình, không thấy số người khác
  assert.deepEqual(await rows(U, `select phone from user_private`), [{ phone: '0912345678' }])
  // Admin đọc được tất cả
  assert.ok((await rows(M, `select phone from user_private`)).length >= 2)
  // Không ai tự ghi / sửa trực tiếp (kể cả admin: phải qua Edge Function)
  await assert.rejects(as(U, `update user_private set phone = '0900000000' where user_id = auth.uid()`))
  await assert.rejects(as(U, `insert into user_private (user_id, phone) values (auth.uid(), '0900000000')`))
  await assert.rejects(as(M, `update user_private set phone = '0900000000' where user_id = $1`, [U]))
  // Cùng nhóm vẫn không thấy số điện thoại (không nằm trong bảng users)
  const g = (await one(U, `insert into groups (name) values ('Nhóm điện thoại') returning id`)).id
  await db.query(`insert into public.group_members (group_id, user_id, role) values ($1, $2, 'member') on conflict do nothing`, [g, T])
  assert.equal((await rows(T, `select phone from user_private where user_id = $1`, [U])).length, 0)
  assert.equal((await db.query(`select count(*)::int as n from information_schema.columns where table_schema = 'public' and table_name = 'users' and column_name = 'phone'`)).rows[0].n, 0, 'bảng users không chứa số điện thoại')
  // Định dạng
  for (const bad of ['123', '1234567', '012345678901234', '+0123', 'abcdefghij', '091 234 5678']) {
    await assert.rejects(db.query(`update public.user_private set phone = $1 where user_id = $2`, [bad, U]), `chấp nhận số sai: ${bad}`)
  }
  // Hợp lệ: số trong nước, quốc tế (+), 8–14 chữ số
  for (const ok of ['0353021389', '+84353021389', '12345678', '01234567890123', '+12025550123']) {
    await db.query(`update public.user_private set phone = $1 where user_id = $2`, [ok, U])
  }
  await db.query(`update public.user_private set phone = null where user_id = $1`, [U])
  // Bị khóa thì không đọc được cả số của mình
  await db.query(`update public.users set is_locked = true where id = $1`, [T])
  assert.equal((await rows(T, `select phone from user_private`)).length, 0)
})

// ---------------------------------------------------------------------
// Lời mời vào nhóm (migration 007): gợi ý theo tên, phải đồng ý mới vào nhóm
// ---------------------------------------------------------------------
async function namedUser(email, name) {
  return (await db.query(`insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`, [email, JSON.stringify({ full_name: name })])).rows[0].id
}

test('Lời mời – gợi ý tối đa 3 tài khoản theo tên (không dấu), bỏ chính mình / thành viên / tài khoản bị khóa', async () => {
  const O = await namedUser('moi.o@fpt.edu.vn', 'Việt Chủ Nhóm')
  const P1 = await namedUser('thanhviet.p1@fpt.edu.vn', 'Nguyễn Thanh Việt')
  const P2 = await namedUser('vietanh.p2@fpt.edu.vn', 'Trần Việt Anh')
  const P3 = await namedUser('vanviet.p3@fpt.edu.vn', 'Lê Văn Việt')
  await namedUser('vietha.p4@fpt.edu.vn', 'ĐỖ VIỆT HÀ')
  const L = await namedUser('khoa.p5@fpt.edu.vn', 'Việt Bị Khóa')
  await db.query(`update users set is_locked = true where id = $1`, [L])
  const g = (await one(O, `insert into groups (name) values ('Nhóm tìm bạn') returning id`)).id
  const search = (q) => rows(O, `select * from search_invitable_users_limited($1, $2)`, [g, q])

  const viet = await search('viet')
  assert.equal(viet.length, 3, 'tối đa 3 gợi ý')
  assert.ok(viet.every((u) => u.user_id !== O && u.user_id !== L), 'không gợi ý chính mình / tài khoản bị khóa')
  // Có dấu / không dấu / chữ hoa đều khớp; nhiều từ thì từ nào cũng phải có
  assert.deepEqual((await search('THANH  việt')).map((u) => u.user_id), [P1])
  assert.deepEqual((await search('do viet')).map((u) => u.full_name), ['ĐỖ VIỆT HÀ'])
  // Tên bắt đầu bằng chữ gõ được xếp trước
  assert.equal((await search('tran'))[0].user_id, P2)
  // Email: chỉ khớp ĐÚNG email (không dò được theo tiền tố); email hiện ra đã che
  assert.deepEqual((await search('VanViet.P3@fpt.edu.vn')).map((u) => u.user_id), [P3])
  assert.equal((await search('vanviet.p3@')).length, 0)
  assert.equal((await search('Lê Văn'))[0].email_hint, 'va***@fpt.edu.vn')
  // Quá ngắn → không gợi ý
  assert.equal((await search('v')).length, 0)
  // Người không phải chủ nhóm không tìm được
  await assert.rejects(as(P1, `select * from search_invitable_users_limited($1, 'viet')`, [g]))
  // Bản không giới hạn không gọi trực tiếp được
  await assert.rejects(as(O, `select * from search_invitable_users($1, 'viet')`, [g]))

  // Đã mời → cờ invited; đã vào nhóm → không còn trong gợi ý
  await as(O, `select invite_to_group_limited($1, $2)`, [g, P1])
  assert.equal((await search('thanh viet'))[0].invited, true)
  await join(O, g, P2)
  assert.equal((await search('tran viet')).length, 0)
})

test('Lời mời – phải đồng ý mới vào nhóm; từ chối thì chủ nhóm thấy và mời lại được', async () => {
  const O = await namedUser('moi2.o@fpt.edu.vn', 'Chủ Nhóm Hai')
  const I = await namedUser('moi2.i@fpt.edu.vn', 'Người Được Mời')
  const X = await namedUser('moi2.x@fpt.edu.vn', 'Người Ngoài')
  const course = (await one(O, `insert into courses (code, name) values ('INV101', 'Môn nhóm mời') returning id`)).id
  const g = (await one(O, `insert into groups (name, course_id) values ('Nhóm cần đồng ý', $1) returning id`, [course])).id
  await as(O, `insert into deadlines (group_id, course_id, title, due_date) values ($1, $2, 'Bài nhóm', now() + interval '3 days')`, [g, course])

  // Người ngoài không mời được; chủ nhóm không mời chính mình
  await assert.rejects(as(X, `select invite_to_group_limited($1, $2)`, [g, I]))
  await assert.rejects(as(O, `select invite_to_group_limited($1, $2)`, [g, O]))
  const sent = (await one(O, `select invite_to_group_limited($1, $2) as r`, [g, I])).r
  assert.deepEqual(Object.keys(sent).sort(), ['avatar_url', 'full_name', 'user_id'])

  // Chưa đồng ý: chưa là thành viên, chưa thấy gì của nhóm; nhưng thấy lời mời kèm tên nhóm / môn / người mời
  assert.equal((await rows(I, `select id from groups where id = $1`, [g])).length, 0)
  assert.equal((await rows(I, `select id from deadlines where group_id = $1`, [g])).length, 0)
  const inv = await one(I, `select * from my_group_invitations()`)
  assert.equal(inv.group_name, 'Nhóm cần đồng ý')
  assert.equal(inv.course_code, 'INV101')
  assert.equal(inv.inviter_name, 'Chủ Nhóm Hai')
  assert.equal(inv.member_count, 1)
  assert.equal((await rows(X, `select * from my_group_invitations()`)).length, 0)

  // Từ chối → không vào nhóm; chủ nhóm thấy "declined"; người được mời không còn thấy lời mời
  await as(I, `select respond_group_invitation($1, false)`, [inv.id])
  assert.equal((await rows(I, `select id from deadlines where group_id = $1`, [g])).length, 0)
  assert.deepEqual(await rows(O, `select full_name, status from group_sent_invitations($1)`, [g]), [{ full_name: 'Người Được Mời', status: 'declined' }])
  assert.equal((await rows(I, `select * from my_group_invitations()`)).length, 0)
  await assert.rejects(as(I, `select respond_group_invitation($1, true)`, [inv.id]), 'lời mời đã từ chối không đồng ý lại được')

  // Mời lại → đồng ý → vào nhóm, thấy deadline nhóm; lời mời biến mất
  await as(O, `select invite_to_group_limited($1, $2)`, [g, I])
  const again = await one(I, `select id from my_group_invitations()`)
  assert.equal((await one(I, `select respond_group_invitation($1, true) as gid`, [again.id])).gid, g)
  assert.equal((await rows(I, `select id from deadlines where group_id = $1`, [g])).length, 1)
  assert.equal((await rows(O, `select * from group_sent_invitations($1)`, [g])).length, 0)
  // Đã trong nhóm → mời nữa báo lỗi
  await assert.rejects(as(O, `select invite_to_group_limited($1, $2)`, [g, I]))
})

test('Bảo mật – lời mời: không tự vào nhóm, không trả lời hộ, không đọc lời mời của người khác', async () => {
  const O = await namedUser('moi3.o@fpt.edu.vn', 'Chủ Nhóm Ba')
  const I = await namedUser('moi3.i@fpt.edu.vn', 'Được Mời Ba')
  const M = await namedUser('moi3.m@fpt.edu.vn', 'Thành Viên Ba')
  const X = await namedUser('moi3.x@fpt.edu.vn', 'Kẻ Lạ Ba')
  const g = (await one(O, `insert into groups (name) values ('Nhóm bảo mật mời') returning id`)).id
  await join(O, g, M)
  await as(O, `select invite_to_group_limited($1, $2)`, [g, I])
  const invId = (await one(O, `select id from group_sent_invitations($1)`, [g])).id

  // Tự chèn mình vào nhóm / tự tạo lời mời / sửa lời mời thành của mình
  await assert.rejects(as(X, `insert into group_members (group_id, user_id) values ($1, auth.uid())`, [g]))
  await assert.rejects(as(X, `insert into group_invitations (group_id, invitee_id, inviter_id) values ($1, auth.uid(), $2)`, [g, O]))
  await assert.rejects(as(X, `update group_invitations set invitee_id = auth.uid() where id = $1`, [invId]))
  // Trả lời hộ người khác
  await assert.rejects(as(X, `select respond_group_invitation($1, true)`, [invId]))
  await assert.rejects(as(O, `select respond_group_invitation($1, true)`, [invId]))
  // Người ngoài / thành viên thường không đọc được lời mời của nhóm
  assert.equal((await rows(X, `select * from group_invitations`)).length, 0)
  assert.equal((await rows(M, `select * from group_invitations where group_id = $1`, [g])).length, 0)
  assert.equal((await rows(M, `select * from group_sent_invitations($1)`, [g])).length, 0)
  // Thành viên thường không mời được
  await assert.rejects(as(M, `select invite_to_group_limited($1, $2)`, [g, X]))
  // Tài khoản bị khóa không trả lời được lời mời
  await db.query(`update users set is_locked = true where id = $1`, [I])
  await assert.rejects(as(I, `select respond_group_invitation($1, true)`, [invId]))
  assert.equal((await rows(O, `select * from group_members where group_id = $1 and user_id = $2`, [g, I])).length, 0)
  await db.query(`update users set is_locked = false where id = $1`, [I])
  // Chủ nhóm thu hồi lời mời
  assert.equal((await as(O, `delete from group_invitations where id = $1`, [invId])).affectedRows, 1)
  assert.equal((await rows(I, `select * from my_group_invitations()`)).length, 0)
})

// ---------------------------------------------------------------------
// Email tổng hợp mỗi sáng (migration 008)
// ---------------------------------------------------------------------
test('Email tổng hợp: chỉ người tự bật; quá hạn / hôm nay theo giờ VN; 1 email / ngày; gồm deadline nhóm', async () => {
  const E = await namedUser('mail.e@fpt.edu.vn', 'Người Bật Email')
  const F = await namedUser('mail.f@fpt.edu.vn', 'Người Không Bật')
  const G = await namedUser('mail.g@fpt.edu.vn', 'Bạn Cùng Nhóm')
  const L = await namedUser('mail.l@fpt.edu.vn', 'Bị Khóa')
  // 08:00 sáng 10/11 giờ VN
  const now = '2026-11-10T01:00:00Z'
  const add = (uid, title, due, extra = '') =>
    as(uid, `insert into deadlines (title, due_date${extra ? ', group_id' : ''}) values ($1, $2${extra ? ', $3' : ''}) returning id`, extra ? [title, due, extra] : [title, due])
  await add(E, 'Quá hạn hôm qua', '2026-11-09T10:00:00Z')
  await add(E, 'Quá hạn lâu rồi', '2026-10-01T10:00:00Z')
  await add(E, 'Hạn 23:59 hôm nay', '2026-11-10T16:59:00Z')
  await add(E, 'Hạn ngày mai', '2026-11-11T10:00:00Z')
  await add(E, 'Hạn ngày kia', '2026-11-11T17:30:00Z')
  const done = (await one(E, `insert into deadlines (title, due_date) values ('Đã xong', '2026-11-09T10:00:00Z') returning id`)).id
  await as(E, `update deadlines set status = 'done' where id = $1`, [done])
  await add(F, 'Việc của người không bật', '2026-11-10T10:00:00Z')
  await add(L, 'Việc của người bị khóa', '2026-11-10T10:00:00Z')
  const g = (await one(E, `insert into groups (name) values ('Nhóm email') returning id`)).id
  await join(E, g, G)
  await add(E, 'Bài nhóm hôm nay', '2026-11-10T12:00:00Z', g)

  // Mặc định tắt
  for (const u of [E, G, L]) assert.equal((await one(u, `select set_email_digest(true) as v`)).v, true)
  await db.query(`update users set is_locked = true where id = $1`, [L])
  assert.deepEqual(await rows(E, `select enabled from email_prefs`), [{ enabled: true }])

  const list = async (at = now) => (await db.query(`select * from due_email_digest($1)`, [at])).rows
  const r = await list()
  const byUser = Object.fromEntries(r.map((x) => [x.user_id, x]))
  assert.deepEqual(Object.keys(byUser).sort(), [E, G].sort(), 'chỉ người đã bật, không bị khóa, có việc')
  const e = byUser[E]
  assert.equal(e.email, 'mail.e@fpt.edu.vn')
  // Migration 010: email chỉ gồm việc quá hạn + đến hạn hôm nay (không còn "ngày mai")
  assert.deepEqual([e.overdue_count, e.today_count, e.tomorrow_count], [1, 2, 0])
  assert.deepEqual(e.items.map((i) => i.title), ['Quá hạn hôm qua', 'Bài nhóm hôm nay', 'Hạn 23:59 hôm nay'], 'quá hạn lên đầu, rồi theo giờ hạn')
  assert.deepEqual(byUser[G].items.map((i) => i.title), ['Bài nhóm hôm nay'])

  // Đã gửi hôm nay → không gửi lại; sang ngày mới thì gửi tiếp
  await db.query(`insert into email_log (user_id, digest_date) values ($1, '2026-11-10')`, [E])
  assert.deepEqual((await list()).map((x) => x.user_id), [G])
  assert.ok((await list('2026-11-11T01:00:00Z')).some((x) => x.user_id === E))

  // Tắt → không gửi; gửi thử cho 1 người thì vẫn trả (kể cả chưa bật / không có việc)
  await as(G, `select set_email_digest(false)`)
  assert.equal((await list()).length, 0)
  assert.equal((await db.query(`select * from due_email_digest($1, $2)`, [now, F])).rows[0].today_count, 1)
  const empty = await namedUser('mail.empty@fpt.edu.vn', 'Không Có Việc')
  assert.equal((await db.query(`select * from due_email_digest($1, $2)`, [now, empty])).rows[0].items.length, 0)
})

test('Bảo mật – email tổng hợp: không đọc / sửa lựa chọn của người khác, không gọi hàm của máy chủ, hủy nhận bằng mã bí mật', async () => {
  const U = await namedUser('mail2.u@fpt.edu.vn', 'Chủ Email')
  const X = await namedUser('mail2.x@fpt.edu.vn', 'Kẻ Lạ Email')
  await as(U, `select set_email_digest(true)`)
  // Không đọc được lựa chọn / mã hủy của người khác, kể cả của mình cũng không đọc mã
  assert.equal((await rows(X, `select user_id, enabled from email_prefs where user_id = $1`, [U])).length, 0)
  await assert.rejects(as(U, `select unsubscribe_token from email_prefs`))
  // Không ghi thẳng bảng
  await assert.rejects(as(X, `insert into email_prefs (user_id, enabled) values ($1, false)`, [U]))
  await assert.rejects(as(X, `update email_prefs set enabled = false where user_id = $1`, [U]))
  await assert.rejects(as(U, `update email_prefs set unsubscribe_token = gen_random_uuid()`))
  // Hàm của máy chủ: danh sách email người dùng, hủy nhận, nhật ký
  await assert.rejects(as(X, `select * from due_email_digest()`))
  await assert.rejects(as(null, `select * from due_email_digest()`))
  await assert.rejects(as(X, `select unsubscribe_email_digest(gen_random_uuid())`))
  await assert.rejects(as(null, `select unsubscribe_email_digest(gen_random_uuid())`))
  await assert.rejects(as(X, `select * from email_log`))
  await assert.rejects(as(null, `select set_email_digest(true)`))
  // Hủy nhận: sai mã → không đổi gì; đúng mã → tắt
  assert.equal((await db.query(`select unsubscribe_email_digest(gen_random_uuid()) as ok`)).rows[0].ok, false)
  const token = (await db.query(`select unsubscribe_token from email_prefs where user_id = $1`, [U])).rows[0].unsubscribe_token
  assert.equal((await db.query(`select unsubscribe_email_digest($1) as ok`, [token])).rows[0].ok, true)
  assert.deepEqual(await rows(U, `select enabled from email_prefs`), [{ enabled: false }])
  // Bị khóa không đổi được cài đặt
  await db.query(`update users set is_locked = true where id = $1`, [U])
  await assert.rejects(as(U, `select set_email_digest(true)`))
})

test('Block 3 (migration 009): môn và buổi học lưu được Block 3; giá trị lạ bị chặn', async () => {
  const U = await namedUser('block3.u@fpt.edu.vn', 'Học Block Ba')
  const c = (await one(U, `insert into courses (code, name, block_name, semester) values ('BLK301', 'Môn Block 3', 'Block 3', 'Summer 2026') returning id, block_name`))
  assert.equal(c.block_name, 'Block 3')
  const s = await one(U, `insert into schedules (course_id, day_of_week, start_time, end_time, block_period) values ($1, 2, '07:00', '09:15', 'Block 3') returning block_period`, [c.id])
  assert.equal(s.block_period, 'Block 3')
  await assert.rejects(as(U, `insert into courses (code, name, block_name) values ('BLK401', 'Môn lạ', 'Block 4')`))
  assert.deepEqual((await db.query(`select enum_range(null::public.block_name)::text[] as v`)).rows[0].v, ['Block 1', 'Block 2', 'Block 3'])
})

test('Mốc mặc định (migration 010): chưa chọn mốc → Chrome nhắc đúng 2 lần, trước 1 ngày và trước 1 giờ', async () => {
  const U = await namedUser('macdinh.u@fpt.edu.vn', 'Mốc Mặc Định')
  await as(U, `select register_push_subscription($1, $2, $3)`, ['https://fcm.googleapis.com/fcm/send/test-macdinh', 'B' + 'A'.repeat(86), 'a'.repeat(22)])
  const d = (await one(U, `insert into deadlines (title, due_date) values ('Hạn 12:00 2/12', '2026-12-02T12:00:00Z') returning id`)).id
  const at = async (now) => (await db.query(`select kind from due_reminders($1) where deadline_id = $2`, [now, d])).rows.map((r) => r.kind)
  assert.deepEqual(await at('2026-11-30T00:00:00Z'), [], 'còn 2,5 ngày: không nhắc (bỏ mốc 3 ngày)')
  assert.deepEqual(await at('2026-12-01T12:30:00Z'), ['24h'], 'còn 23,5 giờ')
  await db.query(`insert into reminder_log (deadline_id, user_id, kind) values ($1, $2, '24h')`, [d, U])
  assert.deepEqual(await at('2026-12-02T09:30:00Z'), [], 'còn 2,5 giờ: đã nhắc 1 ngày, chưa tới 1 giờ')
  assert.deepEqual(await at('2026-12-02T11:10:00Z'), ['1h'], 'còn 50 phút')
  await db.query(`insert into reminder_log (deadline_id, user_id, kind) values ($1, $2, '1h')`, [d, U])
  assert.deepEqual(await at('2026-12-02T12:05:00Z'), [], 'đến hạn: không nhắc thêm (bỏ mốc đúng giờ hạn)')
  // Cột mặc định của bảng cũng là 1 ngày + 1 giờ
  await as(U, `insert into reminder_prefs (user_id) values ($1)`, [U])
  assert.deepEqual((await rows(U, `select kinds from reminder_prefs`))[0].kinds, ['24h', '1h'])
})

test('Bảo mật – mã lịch chạy (cron_token, migration 010): database tự sinh, chỉ máy chủ đọc được', async () => {
  const U = await namedUser('crontoken.u@fpt.edu.vn', 'Người Dò Mã')
  const t = (await db.query(`select token from public.cron_token where id = 1`)).rows[0].token
  assert.match(t, /^[0-9a-f]{64}$/, 'mã ngẫu nhiên 64 ký tự hex')
  await assert.rejects(as(U, `select token from cron_token`))
  await assert.rejects(as(null, `select token from cron_token`))
  await assert.rejects(as(U, `update cron_token set token = 'x'`))
  // Chạy lại migration không đổi mã (cron đang dùng vẫn đúng)
  await migrate(db)
  assert.equal((await db.query(`select token from public.cron_token where id = 1`)).rows[0].token, t)
  assert.equal((await db.query(`select count(*)::int as n from public.cron_token`)).rows[0].n, 1)
})

test('Đổi email đăng nhập (migration 011): hồ sơ public.users đổi theo, giữ nguyên quyền admin và dữ liệu', async () => {
  const U = await namedUser('doi.email.cu@fpt.edu.vn', 'Admin Đổi Email')
  await db.query(`update public.users set role = 'admin' where id = $1`, [U])
  await as(U, `insert into courses (code, name) values ('EML101', 'Môn giữ lại')`)
  await db.query(`update auth.users set email = 'doi.email.moi@gmail.com' where id = $1`, [U])
  const u = (await db.query(`select email, role from public.users where id = $1`, [U])).rows[0]
  assert.deepEqual(u, { email: 'doi.email.moi@gmail.com', role: 'admin' })
  assert.deepEqual((await rows(U, `select code from courses where code = 'EML101'`)).map((r) => r.code), ['EML101'])
  // Email sai định dạng vẫn bị chặn ở auth.users
  await assert.rejects(db.query(`update auth.users set email = 'khong-hop-le' where id = $1`, [U]))
  // Người dùng không tự đổi email trong hồ sơ
  await assert.rejects(as(U, `update users set email = 'gia.mao@fpt.edu.vn' where id = auth.uid()`))
})

test('RLS vẫn bật trên mọi bảng sau khi chạy hết migration', async () => {
  const { rows: r } = await db.query(`select tablename from pg_tables where schemaname = 'public' and not rowsecurity`)
  assert.deepEqual(r, [])
})
