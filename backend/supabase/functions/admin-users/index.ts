// POST /functions/v1/admin-users  { action: 'list' | 'create' | 'update' | 'lock' | 'unlock', ... }  (list có withAudit: kèm nhật ký)
// Quản trị tài khoản người dùng. CHỈ admin (public.users.role = 'admin', chưa bị khóa) gọi được.
// Ghi bằng service role (vượt RLS) nên mọi dữ liệu đầu vào được kiểm tra ở đây; mọi thao tác ghi đều lưu
// vào public.admin_audit_log. Không có thao tác xóa tài khoản (dùng khóa để giữ dữ liệu, có thể mở lại).
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0'
import { json, preflight, rateLimit, requireUser } from '../_shared/http.ts'

const PAGE_SIZE = 20
/** Ban trong Supabase Auth: ~100 năm = khóa vô thời hạn cho tới khi mở khóa */
const BAN_FOREVER = '876000h'
const CAMPUSES = [
  'FPT University Hà Nội',
  'FPT University Hồ Chí Minh',
  'FPT University Đà Nẵng',
  'FPT University Cần Thơ',
  'FPT University Quy Nhơn',
]
// Mọi email hợp lệ (Gmail, email trường...): khớp public.is_allowed_email() của migration 018
const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/i
const USER_COLUMNS = 'id, email, full_name, student_code, campus, avatar_url, role, is_locked, locked_at, locked_reason, created_at'

type Role = 'user' | 'admin'

interface UserRow {
  id: string
  email: string
  full_name: string
  student_code: string | null
  campus: string
  avatar_url: string | null
  role: Role
  is_locked: boolean
  locked_at: string | null
  locked_reason: string | null
  created_at: string
}

function serviceClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

class BadRequest extends Error {}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const uuid = (v: unknown) => {
  const s = str(v)
  if (!/^[0-9a-f-]{36}$/i.test(s)) throw new BadRequest('userId không hợp lệ')
  return s
}

// Cùng luật với form hồ sơ / đăng ký (validate_user_profile trong migration 011, lib/authValidation.ts)
function checkFullName(v: unknown): string {
  const name = str(v).replace(/\s+/g, ' ')
  if (name.length < 2 || name.length > 100 || /[0-9<>{}()@#$%^&*_+=|/:;"!?.,~]/.test(name)) throw new BadRequest('Họ và tên từ 2 đến 100 ký tự, chỉ gồm chữ cái')
  return name
}
/** MSSV chỉ gồm ký tự tiếng Anh (ASCII in được: chữ không dấu, số, khoảng trắng, ký hiệu), giữ nguyên chữ hoa / thường, tối đa 14 ký tự. Trống → null */
function checkStudentCode(v: unknown): string | null {
  const code = str(v)
  if (!code) return null
  if (!/^[ -~]+$/.test(code)) throw new BadRequest('Mã số sinh viên chỉ gồm chữ không dấu, số và ký hiệu (tiếng Anh)')
  if (code.length > 14) throw new BadRequest('Mã số sinh viên tối đa 14 ký tự')
  return code
}
function checkCampus(v: unknown): string {
  const campus = str(v)
  if (!CAMPUSES.includes(campus)) throw new BadRequest('Cơ sở không hợp lệ')
  return campus
}
/** Số điện thoại 8–14 chữ số, cho phép + đầu số. Nhận 0353 021 389, 035.302.1389, (035) 302-1389, +84 353 021 389 → bỏ khoảng trắng / . / - / ( ). Trống → null */
function checkPhone(v: unknown): string | null {
  const p = str(v).replace(/[\s.\-()]/g, '')
  if (!p) return null
  if (!/^[+]?[0-9]{8,14}$/.test(p)) throw new BadRequest('Số điện thoại gồm 8–14 chữ số, có thể bắt đầu bằng + (vd: 0353 021 389 hoặc +84 353 021 389)')
  return p
}
function checkRole(v: unknown): Role {
  if (v !== 'user' && v !== 'admin') throw new BadRequest('Vai trò phải là user hoặc admin')
  return v
}
function checkPassword(v: unknown): string {
  const pw = typeof v === 'string' ? v : ''
  if (pw.length < 8 || pw.length > 72 || !/[A-Za-z]/.test(pw) || !/\d/.test(pw)) throw new BadRequest('Mật khẩu 8–72 ký tự, có cả chữ và số')
  return pw
}

const toUser = (r: UserRow, phone: string | null, auth?: { last_sign_in_at?: string | null; email_confirmed_at?: string | null }) => ({
  id: r.id,
  email: r.email,
  fullName: r.full_name,
  studentCode: r.student_code ?? '',
  phone: phone ?? '',
  campus: r.campus,
  avatarUrl: r.avatar_url ?? undefined,
  role: r.role,
  isLocked: r.is_locked,
  lockedAt: r.locked_at,
  lockedReason: r.locked_reason,
  createdAt: r.created_at,
  lastSignInAt: auth?.last_sign_in_at ?? null,
})

async function audit(db: SupabaseClient, adminId: string, targetId: string | null, action: string, details: Record<string, unknown>) {
  const { error } = await db.from('admin_audit_log').insert({ admin_id: adminId, target_id: targetId, action, details })
  if (error) console.error('audit log', error.message)
}

async function getPhone(db: SupabaseClient, id: string): Promise<string | null> {
  const { data } = await db.from('user_private').select('phone').eq('user_id', id).maybeSingle()
  return (data?.phone as string | null | undefined) ?? null
}

/** Đặt / xóa số điện thoại (bảng riêng user_private, ghi bằng service role) */
async function savePhone(db: SupabaseClient, id: string, phone: string | null) {
  const { error } = phone
    ? await db.from('user_private').upsert({ user_id: id, phone, updated_at: new Date().toISOString() })
    : await db.from('user_private').delete().eq('user_id', id)
  if (error) throw new Error(error.message)
}

async function getTarget(db: SupabaseClient, id: string): Promise<UserRow> {
  const { data, error } = await db.from('users').select(USER_COLUMNS).eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new BadRequest('Không tìm thấy tài khoản')
  return data as UserRow
}

/** Không để hệ thống mất admin cuối cùng (hạ quyền / khóa admin còn hoạt động duy nhất) */
async function ensureAnotherAdmin(db: SupabaseClient, exceptId: string) {
  const { count, error } = await db.from('users').select('id', { count: 'exact', head: true }).eq('role', 'admin').eq('is_locked', false).neq('id', exceptId)
  if (error) throw new Error(error.message)
  if (!count) throw new BadRequest('Phải còn ít nhất 1 admin đang hoạt động')
}

// ---------------------------------------------------------------------
// Các thao tác
// ---------------------------------------------------------------------
/**
 * Danh sách người dùng: MỘT lời gọi RPC admin_list_users (migration 20261024000002) trả về trang người dùng kèm số điện thoại
 * và lần đăng nhập gần nhất, tổng theo bộ lọc, thống kê và (withAudit) 50 dòng nhật ký. Trước đây ~26 lời gọi API nối tiếp.
 */
async function list(db: SupabaseClient, body: Record<string, unknown>) {
  const { data, error } = await db.rpc('admin_list_users', {
    // Bỏ ký tự đại diện của LIKE để từ khóa luôn được hiểu là chữ thường
    p_query: str(body.query).slice(0, 100).replace(/[%_\\]/g, ' ').trim(),
    p_role: body.role === 'user' || body.role === 'admin' ? body.role : null,
    p_status: body.status === 'locked' || body.status === 'active' ? body.status : null,
    p_page: Math.max(0, Math.min(500, Number(body.page) || 0)),
    p_page_size: PAGE_SIZE,
    p_with_audit: body.withAudit === true,
  })
  if (error) throw new Error(error.message)
  return data
}

async function create(db: SupabaseClient, adminId: string, body: Record<string, unknown>) {
  const email = str(body.email).toLowerCase()
  if (email.length > 254 || !EMAIL_RE.test(email)) throw new BadRequest('Email không hợp lệ')
  const password = checkPassword(body.password)
  const fullName = checkFullName(body.fullName)
  const studentCode = checkStudentCode(body.studentCode)
  const phone = checkPhone(body.phone)
  const campus = body.campus ? checkCampus(body.campus) : 'FPT University Đà Nẵng'
  const role = body.role ? checkRole(body.role) : 'user'

  // email_confirm: admin tạo hộ nên không bắt xác nhận email; trigger handle_new_user tạo hồ sơ public.users
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName, student_code: studentCode ?? '' } })
  if (error || !data.user) {
    if (/already|registered|exists/i.test(error?.message ?? '')) throw new BadRequest('Email này đã có tài khoản')
    throw new Error(error?.message ?? 'Không tạo được tài khoản')
  }
  const { data: row, error: upErr } = await db.from('users').update({ full_name: fullName, student_code: studentCode, campus, role }).eq('id', data.user.id).select(USER_COLUMNS).single()
  if (upErr) throw new Error(upErr.message)
  if (phone) await savePhone(db, data.user.id, phone)
  await audit(db, adminId, data.user.id, 'create', { email, role, campus, ...(phone && { phone: 'đã nhập' }) })
  return { user: toUser(row as UserRow, phone, data.user) }
}

async function update(db: SupabaseClient, adminId: string, body: Record<string, unknown>) {
  const id = uuid(body.userId)
  const before = await getTarget(db, id)
  const phoneBefore = await getPhone(db, id)
  const patch: Record<string, unknown> = {}
  const phoneChanged = body.phone !== undefined && checkPhone(body.phone) !== phoneBefore
  const phone = body.phone !== undefined ? checkPhone(body.phone) : phoneBefore
  if (body.fullName !== undefined) patch.full_name = checkFullName(body.fullName)
  if (body.studentCode !== undefined) patch.student_code = checkStudentCode(body.studentCode)
  if (body.campus !== undefined) patch.campus = checkCampus(body.campus)
  if (body.role !== undefined) {
    const role = checkRole(body.role)
    if (role !== before.role) {
      if (id === adminId) throw new BadRequest('Không tự đổi vai trò của chính mình')
      if (before.role === 'admin') await ensureAnotherAdmin(db, id)
      patch.role = role
    }
  }
  const password = body.password ? checkPassword(body.password) : null
  if (!Object.keys(patch).length && !password && !phoneChanged) throw new BadRequest('Không có gì thay đổi')

  let row = before
  if (Object.keys(patch).length) {
    const { data, error } = await db.from('users').update(patch).eq('id', id).select(USER_COLUMNS).single()
    if (error) throw new BadRequest(error.message)
    row = data as UserRow
    // Ghi nhật ký giá trị cũ → mới (không ghi mật khẩu)
    const changes = Object.fromEntries(Object.keys(patch).map((k) => [k, { from: before[k as keyof UserRow], to: row[k as keyof UserRow] }]))
    await audit(db, adminId, id, patch.role ? 'change_role' : 'update', changes)
  }
  if (phoneChanged) {
    await savePhone(db, id, phone)
    // Nhật ký chỉ ghi số đã thay đổi hay xóa, không ghi số điện thoại
    await audit(db, adminId, id, 'update', { phone: { from: phoneBefore ? 'đã có' : 'trống', to: phone ? 'đã nhập' : 'đã xóa' } })
  }
  if (password) {
    const { error } = await db.auth.admin.updateUserById(id, { password })
    if (error) throw new Error(error.message)
    await audit(db, adminId, id, 'reset_password', {})
  }
  return { user: toUser(row, phone) }
}

async function setLocked(db: SupabaseClient, adminId: string, body: Record<string, unknown>, locked: boolean) {
  const id = uuid(body.userId)
  if (id === adminId) throw new BadRequest('Không tự khóa tài khoản của chính mình')
  const target = await getTarget(db, id)
  if (target.is_locked === locked) throw new BadRequest(locked ? 'Tài khoản đã bị khóa' : 'Tài khoản đang hoạt động')
  const reason = locked ? str(body.reason).slice(0, 300) : ''
  if (locked && !reason) throw new BadRequest('Nhập lý do khóa tài khoản')
  if (locked && target.role === 'admin') await ensureAnotherAdmin(db, id)

  // 1) Cấm / bỏ cấm đăng nhập trong Supabase Auth (chặn đăng nhập mới + làm mới phiên)
  const { error: banErr } = await db.auth.admin.updateUserById(id, { ban_duration: locked ? BAN_FOREVER : 'none' })
  if (banErr) throw new Error(banErr.message)
  // 2) Cờ trong database: policy RESTRICTIVE chặn mọi truy cập dữ liệu ngay, kể cả token cũ còn hạn
  const { data, error } = await db
    .from('users')
    .update(locked ? { is_locked: true, locked_at: new Date().toISOString(), locked_reason: reason } : { is_locked: false, locked_at: null, locked_reason: null })
    .eq('id', id)
    .select(USER_COLUMNS)
    .single()
  if (error) {
    // Hoàn tác bước 1 để hai nơi không lệch nhau
    await db.auth.admin.updateUserById(id, { ban_duration: locked ? 'none' : BAN_FOREVER })
    throw new Error(error.message)
  }
  // 3) Bị khóa thì ngừng gửi nhắc deadline tới thiết bị của người đó
  if (locked) await db.from('push_subscriptions').delete().eq('user_id', id)

  await audit(db, adminId, id, locked ? 'lock' : 'unlock', locked ? { reason } : {})
  return { user: toUser(data as UserRow, await getPhone(db, id)) }
}

Deno.serve(async (req) => {
  const early = preflight(req)
  if (early) return early

  const auth = await requireUser(req)
  if (auth instanceof Response) return auth

  // Giới hạn truy cập + xác minh vai trò bằng service role (không tin dữ liệu từ client): chạy song song cho nhanh
  const db = serviceClient()
  const [limited, { data: me, error: meErr }] = await Promise.all([
    rateLimit(req, auth.client, 'admin_users', 60),
    db.from('users').select('role, is_locked').eq('id', auth.userId).maybeSingle(),
  ])
  if (limited) return limited
  if (meErr) return json(req, { error: 'Không kiểm tra được quyền' }, 500)
  if (!me || me.role !== 'admin' || me.is_locked) return json(req, { error: 'Chỉ quản trị viên mới dùng được chức năng này' }, 403)

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
    if (!body || typeof body !== 'object') throw new Error()
  } catch {
    return json(req, { error: 'Body phải là JSON' }, 400)
  }

  try {
    switch (body.action) {
      case 'list':
        return json(req, await list(db, body))
      case 'create':
        return json(req, await create(db, auth.userId, body))
      case 'update':
        return json(req, await update(db, auth.userId, body))
      case 'lock':
        return json(req, await setLocked(db, auth.userId, body, true))
      case 'unlock':
        return json(req, await setLocked(db, auth.userId, body, false))
      default:
        return json(req, { error: 'action không hợp lệ' }, 400)
    }
  } catch (e) {
    if (e instanceof BadRequest) return json(req, { error: e.message }, 400)
    console.error('admin-users', e)
    return json(req, { error: 'Máy chủ gặp lỗi khi xử lý' }, 500)
  }
})
