// Gọi Edge Function `admin-users` (chỉ admin). Máy chủ tự kiểm tra quyền, dữ liệu và ghi nhật ký;
// ở đây chỉ là lớp gọi + kiểu dữ liệu.
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { UserRole } from '../types'

export interface AdminUser {
  id: string
  email: string
  fullName: string
  studentCode: string
  phone: string
  campus: string
  avatarUrl?: string
  role: UserRole
  isLocked: boolean
  lockedAt: string | null
  lockedReason: string | null
  createdAt: string
  lastSignInAt: string | null
}

export interface AdminStats {
  total: number
  admins: number
  locked: number
  newThisWeek: number
}

export interface AdminListResult {
  users: AdminUser[]
  total: number
  pageSize: number
  stats: AdminStats
  /** Chỉ có khi gọi với withAudit: true (50 dòng nhật ký mới nhất) */
  audit?: AdminAuditEntry[] | null
}

export interface AdminListParams {
  query?: string
  role?: UserRole | ''
  status?: 'active' | 'locked' | ''
  page?: number
}

export interface AdminAuditEntry {
  id: number
  action: 'create' | 'update' | 'lock' | 'unlock' | 'reset_password' | 'change_role'
  details: Record<string, unknown>
  created_at: string
  admin: { email: string; full_name: string } | null
  target: { email: string; full_name: string } | null
}

export interface AdminUserInput {
  email?: string
  password?: string
  fullName: string
  studentCode: string
  /** Số di động VN, để trống = không có */
  phone: string
  campus: string
  role: UserRole
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Chức năng quản trị cần kết nối Supabase (bản demo không hỗ trợ)')
  const { data, error } = await supabase.functions.invoke<T>('admin-users', { body })
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const res = (await error.context.json().catch(() => null)) as { error?: string } | null
      throw new Error(res?.error ?? 'Máy chủ quản trị đang lỗi')
    }
    throw new Error('Không gọi được máy chủ quản trị. Kiểm tra đã deploy function admin-users chưa.')
  }
  return data as T
}

// Bộ nhớ đệm trong phiên (chỉ trong RAM, không lưu xuống ổ: dữ liệu có email / số điện thoại).
// Quay lại trang Quản trị → hiện ngay bản đã tải, đồng thời tải bản mới ở nền.
const listCache = new Map<string, AdminListResult>()
const keyOf = (p: AdminListParams) => JSON.stringify([p.query ?? '', p.role ?? '', p.status ?? '', p.page ?? 0])
let prefetching: Promise<AdminListResult | null> | null = null

async function list(p: AdminListParams & { withAudit?: boolean }): Promise<AdminListResult> {
  const r = await call<AdminListResult>({ action: 'list', ...p })
  const prev = listCache.get(keyOf(p))
  // Giữ nhật ký cũ trong bộ nhớ đệm nếu lần này không xin nhật ký
  listCache.set(keyOf(p), r.audit ? r : { ...r, audit: prev?.audit ?? null })
  return r
}

export const adminApi = {
  /** Danh sách người dùng + tổng + thống kê (+ nhật ký nếu withAudit) trong MỘT lời gọi */
  list,
  /** Bản đã tải gần nhất của đúng bộ lọc này (nếu có) */
  cached: (p: AdminListParams) => listCache.get(keyOf(p)),
  /** Đang tải trước trang đầu (do rê chuột vào mục Quản trị) → dùng luôn kết quả đó thay vì gọi lại */
  pendingPrefetch: () => prefetching,
  /**
   * Tải trước khi người dùng rê chuột / chạm vào mục "Quản trị": mã trang + trang đầu danh sách.
   * Bấm vào là có dữ liệu ngay (Edge Function đã "ấm", không phải chờ khởi động lạnh).
   */
  prefetch: () => {
    void import('../pages/AdminPage')
    if (!supabase || prefetching || listCache.has(keyOf({}))) return
    prefetching = list({ withAudit: true })
      .catch(() => null)
      .finally(() => {
        prefetching = null
      })
  },
  create: (input: AdminUserInput) => call<{ user: AdminUser }>({ action: 'create', ...input }),
  update: (userId: string, input: Partial<AdminUserInput>) => call<{ user: AdminUser }>({ action: 'update', userId, ...input }),
  lock: (userId: string, reason: string) => call<{ user: AdminUser }>({ action: 'lock', userId, reason }),
  unlock: (userId: string) => call<{ user: AdminUser }>({ action: 'unlock', userId }),
}
