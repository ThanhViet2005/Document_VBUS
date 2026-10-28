import { useCallback, useRef, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  History,
  KeyRound,
  Lock,
  LockOpen,
  Pencil,
  Phone,
  RefreshCw,
  Search,
  ShieldCheck,
  UserCog,
  UserPlus,
  Users,
  UserX,
  Wand2,
} from 'lucide-react'
import { useAppData } from '../store/AppData'
import { cn } from '../lib/cn'
import { CAMPUSES, formatPhone, normalizePhone, PHONE_MAX_DIGITS, STUDENT_CODE_MAX, toEnglishCode, validatePhone, validateStudentCode } from '../lib/profile'
import { validateEmail, validateFullName, validateNewPassword } from '../lib/authValidation'
import { adminApi, type AdminAuditEntry, type AdminListResult, type AdminUser, type AdminUserInput } from '../services/admin'
import type { UserRole } from '../types'
import Avatar from '../components/ui/Avatar'
import Modal from '../components/ui/Modal'
import { Button, EmptyState, errorMessage, Field, FormError, inputClass } from '../components/ui/Form'
import { useToast } from '../components/ui/Toast'
import { useConfirm } from '../components/ui/ConfirmDialog'

const ROLE_LABEL: Record<UserRole, string> = { user: 'Người dùng', admin: 'Quản trị viên' }
const LOCK_REASONS = ['Vi phạm quy định sử dụng', 'Tài khoản bị xâm nhập', 'Sinh viên đã nghỉ học / ra trường', 'Theo yêu cầu của chủ tài khoản']

const ago = (iso: string | null) => {
  if (!iso) return 'Chưa đăng nhập'
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (m < 1) return 'Vừa xong'
  if (m < 60) return `${m} phút trước`
  if (m < 1440) return `${Math.round(m / 60)} giờ trước`
  if (m < 30 * 1440) return `${Math.round(m / 1440)} ngày trước`
  return new Date(iso).toLocaleDateString('vi-VN')
}

/** Trang Quản trị: chỉ admin vào được (route guard + máy chủ kiểm tra lại quyền ở mọi thao tác) */
export default function AdminPage() {
  const confirm = useConfirm()
  const { user, isDemo } = useAppData()
  const toast = useToast()
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [role, setRole] = useState<UserRole | ''>('')
  const [status, setStatus] = useState<'active' | 'locked' | ''>('')
  const [page, setPage] = useState(0)
  const [data, setData] = useState<AdminListResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [audit, setAudit] = useState<AdminAuditEntry[]>([])
  const [form, setForm] = useState<{ mode: 'create' } | { mode: 'edit'; user: AdminUser } | null>(null)
  const [locking, setLocking] = useState<AdminUser | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  // Gõ tìm kiếm: chờ 300ms rồi mới gọi máy chủ
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300)
    return () => clearTimeout(t)
  }, [query])
  useEffect(() => setPage(0), [debounced, role, status])

  // Đã có nhật ký thì đổi trang / bộ lọc không cần tải lại nhật ký
  const hasAudit = useRef(false)

  /** withAudit: tải kèm nhật ký (lần đầu, sau mỗi thao tác sửa / khóa, bấm "Tải lại") */
  const load = useCallback(
    async (opts: { withAudit?: boolean } = {}) => {
      if (isDemo) {
        setLoading(false)
        return
      }
      const params = { query: debounced, role, status, page }
      const withAudit = opts.withAudit ?? !hasAudit.current
      // Hiện ngay bản đã tải trước đó (nếu có), rồi cập nhật bản mới ở nền
      const cached = adminApi.cached(params)
      if (cached) {
        setData(cached)
        if (cached.audit) {
          setAudit(cached.audit)
          hasAudit.current = true
        }
      }
      setLoading(true)
      setError(null)
      try {
        const isFirstPage = !params.query && !params.role && !params.status && !params.page
        const prefetched = isFirstPage ? await adminApi.pendingPrefetch() : null
        const result = prefetched ?? (await adminApi.list({ ...params, withAudit }))
        setData(result)
        if (result.audit) {
          setAudit(result.audit)
          hasAudit.current = true
        }
      } catch (e) {
        setError(errorMessage(e))
      } finally {
        setLoading(false)
      }
    },
    [debounced, role, status, page, isDemo],
  )

  useEffect(() => {
    void load()
  }, [load])

  /** Sau khi thêm / sửa / khóa / mở khóa: tải lại cả danh sách và nhật ký */
  const reload = useCallback(() => load({ withAudit: true }), [load])

  async function unlock(u: AdminUser) {
    if (
      !(await confirm({
        title: 'Mở khóa tài khoản?',
        message: <><b className="font-semibold text-slate-900">{u.email}</b> sẽ đăng nhập và dùng lại được ngay.</>,
        confirmLabel: 'Mở khóa',
        destructive: false,
      }))
    )
      return
    setBusyId(u.id)
    try {
      await adminApi.unlock(u.id)
      toast.success(`Đã mở khóa ${u.email}`)
      await reload()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusyId(null)
    }
  }

  if (isDemo) {
    return <EmptyState icon={<ShieldCheck className="h-6 w-6" />} title="Quản trị cần kết nối Supabase" text="Bản demo không có tài khoản thật nên không dùng được chức năng quản trị." />
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  return (
    <div className="space-y-5">
      {/* Đầu trang */}
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-slate-200 bg-surface p-5 sm:p-6 shadow-card">
        <div className="min-w-0">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-brand-700">
            <ShieldCheck className="h-3.5 w-3.5" /> Quản trị viên
          </span>
          <p className="mt-2 text-sm text-slate-500 sm:text-base">Thêm, sửa thông tin, phân quyền và khóa tài khoản người dùng. Mọi thao tác đều được ghi nhật ký.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => void reload()} disabled={loading} aria-label="Tải lại">
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </Button>
          <Button onClick={() => setForm({ mode: 'create' })} className="px-5">
            <UserPlus className="h-4 w-4" /> Thêm tài khoản
          </Button>
        </div>
      </section>

      {/* Thống kê */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat label="Tổng tài khoản" value={data?.stats.total} icon={Users} tone="bg-brand-50 text-brand-600" />
        <Stat label="Quản trị viên" value={data?.stats.admins} icon={ShieldCheck} tone="bg-violet-50 text-violet-600" />
        <Stat label="Đang bị khóa" value={data?.stats.locked} icon={UserX} tone="bg-red-50 text-red-600" />
        <Stat label="Mới trong 7 ngày" value={data?.stats.newThisWeek} icon={UserPlus} tone="bg-emerald-50 text-emerald-600" />
      </div>

      {/* Tìm kiếm + lọc */}
      <section className="grid grid-cols-1 gap-2 rounded-2xl border border-slate-200 bg-surface p-3 sm:grid-cols-[minmax(0,1fr)_180px_180px] shadow-card">
        <label className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className={cn(inputClass, 'bg-slate-50 pl-9')} placeholder="Tìm theo tên, email, MSSV, số điện thoại…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Tìm tài khoản" />
        </label>
        <select className={cn(inputClass, 'bg-slate-50')} value={role} onChange={(e) => setRole(e.target.value as UserRole | '')} aria-label="Lọc vai trò">
          <option value="">Mọi vai trò</option>
          <option value="user">Người dùng</option>
          <option value="admin">Quản trị viên</option>
        </select>
        <select className={cn(inputClass, 'bg-slate-50')} value={status} onChange={(e) => setStatus(e.target.value as 'active' | 'locked' | '')} aria-label="Lọc trạng thái">
          <option value="">Mọi trạng thái</option>
          <option value="active">Đang hoạt động</option>
          <option value="locked">Đã khóa</option>
        </select>
      </section>

      {error ? (
        <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : !data && loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : data && data.users.length === 0 ? (
        <EmptyState icon={<Users className="h-6 w-6" />} title="Không có tài khoản phù hợp" text="Thử đổi từ khóa hoặc bộ lọc." />
      ) : (
        data && (
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-surface shadow-card">
            {/* Bảng (máy tính) */}
            <table className="hidden w-full text-left text-sm md:table">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-4 py-3">Tài khoản</th>
                  <th className="px-4 py-3">MSSV</th>
                  <th className="px-4 py-3">Cơ sở</th>
                  <th className="px-4 py-3">Điện thoại</th>
                  <th className="px-4 py-3">Vai trò</th>
                  <th className="px-4 py-3">Trạng thái</th>
                  <th className="px-4 py-3">Đăng nhập gần nhất</th>
                  <th className="px-4 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.users.map((u) => (
                  <tr key={u.id} className={cn('transition hover:bg-slate-50', u.isLocked && 'bg-red-50/30')}>
                    <td className="px-4 py-3">
                      <UserCell u={u} self={u.id === user.id} />
                    </td>
                    <td className="text-data font-semibold whitespace-nowrap px-4 py-3 text-sm text-slate-800">{u.studentCode || <span className="font-normal text-slate-400">—</span>}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-700">{u.campus.replace('FPT University ', '')}</td>
                    <td className="whitespace-nowrap px-4 py-3">{u.phone ? <PhoneLink phone={u.phone} /> : <span className="text-slate-400">—</span>}</td>
                    <td className="px-4 py-3">
                      <RoleChip role={u.role} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusChip u={u} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">{ago(u.lastSignInAt)}</td>
                    <td className="px-4 py-3">
                      <Actions u={u} self={u.id === user.id} busy={busyId === u.id} onEdit={() => setForm({ mode: 'edit', user: u })} onLock={() => setLocking(u)} onUnlock={() => void unlock(u)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Thẻ (điện thoại) */}
            <ul className="divide-y divide-slate-100 md:hidden">
              {data.users.map((u) => (
                <li key={u.id} className={cn('space-y-3 p-4', u.isLocked && 'bg-red-50/30')}>
                  <UserCell u={u} self={u.id === user.id} />
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <RoleChip role={u.role} />
                    <StatusChip u={u} />
                    {u.studentCode && <span className="text-data font-semibold rounded-md bg-slate-100 px-2 py-1 text-slate-800">{u.studentCode}</span>}
                    <span className="rounded-md bg-slate-100 px-2 py-1 font-medium text-slate-700">{u.campus.replace('FPT University ', '')}</span>
                    {u.phone && <PhoneLink phone={u.phone} />}
                    <span className="text-slate-600">· {ago(u.lastSignInAt)}</span>
                  </div>
                  <Actions u={u} self={u.id === user.id} busy={busyId === u.id} onEdit={() => setForm({ mode: 'edit', user: u })} onLock={() => setLocking(u)} onUnlock={() => void unlock(u)} />
                </li>
              ))}
            </ul>

            {/* Phân trang */}
            <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 text-sm text-slate-500">
              <span>
                {data.total} tài khoản · Trang {page + 1}/{pages}
              </span>
              <div className="flex gap-1">
                <Button variant="secondary" className="px-2.5 py-1.5" disabled={page === 0 || loading} onClick={() => setPage((p) => p - 1)} aria-label="Trang trước">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="secondary" className="px-2.5 py-1.5" disabled={page + 1 >= pages || loading} onClick={() => setPage((p) => p + 1)} aria-label="Trang sau">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </section>
        )
      )}

      <AuditLog entries={audit} />

      {form && (
        <UserFormModal
          mode={form.mode}
          user={form.mode === 'edit' ? form.user : undefined}
          self={form.mode === 'edit' && form.user.id === user.id}
          onClose={() => setForm(null)}
          onSaved={() => void reload()}
        />
      )}
      {locking && <LockModal user={locking} onClose={() => setLocking(null)} onLocked={() => void reload()} />}
    </div>
  )
}

function Stat({ label, value, icon: Icon, tone }: { label: string; value?: number; icon: typeof Users; tone: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-surface p-4 shadow-card">
      <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', tone)}>
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs font-bold uppercase tracking-wider text-slate-500">{label}</p>
        <p className="text-2xl font-extrabold text-slate-900">{value ?? '—'}</p>
      </div>
    </div>
  )
}

function UserCell({ u, self }: { u: AdminUser; self: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar name={u.fullName || u.email} src={u.avatarUrl} className="h-10 w-10 text-xs" />
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 truncate font-semibold text-slate-900">
          <span className="truncate">{u.fullName || '—'}</span>
          {self && <span className="shrink-0 rounded bg-brand-50 px-1.5 py-0.5 text-[11px] font-bold text-brand-700">Bạn</span>}
        </p>
        <p className="truncate text-xs text-slate-500">{u.email}</p>
      </div>
    </div>
  )
}

/** Bấm để gọi trên điện thoại */
const PhoneLink = ({ phone }: { phone: string }) => (
  <a href={`tel:${phone}`} title="Bấm để gọi" className="text-data font-semibold inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 text-sm text-slate-800 transition hover:bg-brand-50 hover:text-brand-700">
    <Phone className="h-3.5 w-3.5" /> {formatPhone(phone)}
  </a>
)

const RoleChip = ({ role }: { role: UserRole }) => (
  <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold', role === 'admin' ? 'bg-brand-50 text-brand-700' : 'bg-slate-100 text-slate-700')}>
    {role === 'admin' && <ShieldCheck className="h-3.5 w-3.5" />}
    {ROLE_LABEL[role]}
  </span>
)

const StatusChip = ({ u }: { u: AdminUser }) =>
  u.isLocked ? (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700 ring-1 ring-red-200" title={u.lockedReason ? `Lý do: ${u.lockedReason}` : undefined}>
      <Lock className="h-3.5 w-3.5" /> Đã khóa
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200">
      <span className="h-2 w-2 rounded-full bg-emerald-500" /> Hoạt động
    </span>
  )

function Actions({ u, self, busy, onEdit, onLock, onUnlock }: { u: AdminUser; self: boolean; busy: boolean; onEdit: () => void; onLock: () => void; onUnlock: () => void }) {
  return (
    <div className="flex justify-end gap-1.5">
      <Button variant="secondary" className="px-2.5 py-1.5 text-xs" onClick={onEdit} aria-label={`Sửa ${u.email}`}>
        <Pencil className="h-3.5 w-3.5" /> Sửa
      </Button>
      {u.isLocked ? (
        <Button variant="secondary" className="px-2.5 py-1.5 text-xs text-emerald-700" onClick={onUnlock} busy={busy} aria-label={`Mở khóa ${u.email}`}>
          {!busy && <LockOpen className="h-3.5 w-3.5" />} Mở khóa
        </Button>
      ) : (
        <Button
          variant="dangerOutline"
          className="px-2.5 py-1.5 text-xs"
          onClick={onLock}
          disabled={self}
          title={self ? 'Không tự khóa tài khoản của mình' : undefined}
          aria-label={`Khóa ${u.email}`}
        >
          <Lock className="h-3.5 w-3.5" /> Khóa
        </Button>
      )}
    </div>
  )
}

/** Mật khẩu tạm ngẫu nhiên 12 ký tự (có chữ hoa, thường, số) để admin gửi cho người dùng */
function randomPassword(): string {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789']
  const all = sets.join('')
  const bytes = crypto.getRandomValues(new Uint32Array(12))
  const chars = Array.from(bytes, (b, i) => (i < 3 ? sets[i] : all)[b % (i < 3 ? sets[i].length : all.length)])
  return chars.sort(() => (crypto.getRandomValues(new Uint8Array(1))[0] > 127 ? 1 : -1)).join('')
}

function UserFormModal({ mode, user, self, onClose, onSaved }: { mode: 'create' | 'edit'; user?: AdminUser; self: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast()
  const [form, setForm] = useState<AdminUserInput>(() => ({
    email: user?.email ?? '',
    password: '',
    fullName: user?.fullName ?? '',
    studentCode: user?.studentCode ?? '',
    phone: user?.phone ?? '',
    campus: user?.campus ?? 'FPT University Đà Nẵng',
    role: user?.role ?? 'user',
  }))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof AdminUserInput>(k: K, v: AdminUserInput[K]) => setForm((f) => ({ ...f, [k]: v }))

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const invalid =
      (mode === 'create' ? validateEmail(form.email ?? '') : null) ??
      validateFullName(form.fullName) ??
      validateStudentCode(form.studentCode) ??
      validatePhone(form.phone) ??
      (mode === 'create' || form.password ? validateNewPassword(form.password ?? '') : null)
    if (invalid) return setError(invalid)
    setBusy(true)
    setError(null)
    try {
      if (mode === 'create') {
        const { user: created } = await adminApi.create(form)
        toast.success(`Đã tạo tài khoản ${created.email}`)
      } else if (user) {
        // Chỉ gửi trường thay đổi để nhật ký ghi đúng
        const patch: Partial<AdminUserInput> = {}
        if (form.fullName.trim() !== user.fullName) patch.fullName = form.fullName
        if (form.studentCode.trim() !== user.studentCode) patch.studentCode = form.studentCode
        if (normalizePhone(form.phone) !== user.phone) patch.phone = form.phone
        if (form.campus !== user.campus) patch.campus = form.campus
        if (form.role !== user.role) patch.role = form.role
        if (form.password) patch.password = form.password
        if (!Object.keys(patch).length) return onClose()
        await adminApi.update(user.id, patch)
        toast.success(`Đã cập nhật ${user.email}`)
      }
      onSaved()
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      title={mode === 'create' ? 'Thêm tài khoản' : 'Sửa tài khoản'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Hủy
          </Button>
          <Button type="submit" form="admin-user-form" busy={busy}>
            {mode === 'create' ? 'Tạo tài khoản' : 'Lưu thay đổi'}
          </Button>
        </>
      }
    >
      <form id="admin-user-form" onSubmit={onSubmit} noValidate className="space-y-4">
        <Field label="Email" hint={mode === 'edit' ? 'Email đăng nhập không đổi được.' : 'Email bất kỳ (Gmail, email trường...). Tài khoản dùng được ngay, không cần xác nhận email.'}>
          <input className={inputClass} type="email" value={form.email} onChange={(e) => set('email', e.target.value)} disabled={mode === 'edit'} placeholder="Nhập email" autoComplete="off" />
        </Field>
        <Field label="Họ và tên">
          <input className={inputClass} value={form.fullName} onChange={(e) => set('fullName', e.target.value)} placeholder="Nhập họ và tên" maxLength={100} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Mã số sinh viên" hint={`Chỉ ký tự tiếng Anh, tối đa ${STUDENT_CODE_MAX} ký tự (${form.studentCode.trim().length}/${STUDENT_CODE_MAX}). Không bắt buộc.`}>
            <input
              className={inputClass}
              value={form.studentCode}
              onChange={(e) => set('studentCode', toEnglishCode(e.target.value))}
              placeholder="Nhập mã số sinh viên"
              maxLength={STUDENT_CODE_MAX}
              lang="en"
              inputMode="text"
              autoCapitalize="off"
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
          <Field label="Cơ sở">
            <select className={inputClass} value={form.campus} onChange={(e) => set('campus', e.target.value)}>
              {CAMPUSES.map((c) => (
                <option key={c} value={c}>
                  {c.replace('FPT University ', '')}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field
          label="Số điện thoại"
          hint={`${normalizePhone(form.phone).replace(/^[+]/, '').length}/${PHONE_MAX_DIGITS} chữ số, có thể bắt đầu bằng +. Chỉ bạn và chủ tài khoản xem được, bạn cùng nhóm không thấy.`}
        >
          <div className="relative">
            <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className={cn(inputClass, 'text-data font-semibold pl-9')}
              type="tel"
              inputMode="tel"
              value={form.phone}
              // Chỉ nhận chữ số, +, khoảng trắng và . - ( ); + chỉ ở đầu; tối đa 14 chữ số. Rời ô thì tự định dạng 0353 021 389
              onChange={(e) => {
                const v = e.target.value.replace(/[^0-9+\s.\-()]/g, '').replace(/(?!^)\+/g, '')
                if (v.replace(/\D/g, '').length <= PHONE_MAX_DIGITS) set('phone', v)
              }}
              onBlur={() => form.phone && !validatePhone(form.phone) && set('phone', formatPhone(normalizePhone(form.phone)))}
              placeholder="Nhập số điện thoại"
              maxLength={24}
              autoComplete="off"
            />
          </div>
        </Field>
        <Field label="Vai trò" as="group" hint={self ? 'Không tự đổi vai trò của chính mình.' : form.role === 'admin' ? 'Quản trị viên có toàn quyền thêm / sửa / khóa tài khoản khác.' : undefined}>
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 text-sm font-semibold">
            {(['user', 'admin'] as const).map((r) => (
              <button
                key={r}
                type="button"
                disabled={self}
                onClick={() => set('role', r)}
                aria-pressed={form.role === r}
                className={cn('inline-flex items-center justify-center gap-1.5 rounded-lg py-1.5 transition disabled:cursor-not-allowed', form.role === r ? 'bg-surface text-slate-900 shadow-sm' : 'text-slate-500')}
              >
                {r === 'admin' ? <ShieldCheck className="h-4 w-4" /> : <UserCog className="h-4 w-4" />} {ROLE_LABEL[r]}
              </button>
            ))}
          </div>
        </Field>
        <Field label={mode === 'create' ? 'Mật khẩu' : 'Đặt mật khẩu mới'} hint={mode === 'edit' ? 'Để trống nếu không đổi. Gửi mật khẩu mới cho người dùng qua kênh riêng.' : 'Ít nhất 8 ký tự, có chữ và số. Gửi cho người dùng qua kênh riêng.'}>
          <div className="flex gap-2">
            <input className={cn(inputClass, 'font-mono')} value={form.password} onChange={(e) => set('password', e.target.value)} placeholder={mode === 'edit' ? 'Nhập mật khẩu mới' : 'Nhập mật khẩu'} autoComplete="new-password" />
            <Button variant="secondary" onClick={() => set('password', randomPassword())} className="shrink-0" title="Tạo mật khẩu ngẫu nhiên">
              <Wand2 className="h-4 w-4" /> Tạo
            </Button>
          </div>
        </Field>
        <FormError message={error} />
      </form>
    </Modal>
  )
}

function LockModal({ user, onClose, onLocked }: { user: AdminUser; onClose: () => void; onLocked: () => void }) {
  const toast = useToast()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!reason.trim()) return setError('Nhập lý do khóa tài khoản')
    setBusy(true)
    setError(null)
    try {
      await adminApi.lock(user.id, reason.trim())
      toast.success(`Đã khóa ${user.email}`)
      onLocked()
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      title="Khóa tài khoản"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Hủy
          </Button>
          <Button variant="destructive" type="submit" form="lock-form" busy={busy}>
            <Lock className="h-4 w-4" /> Khóa tài khoản
          </Button>
        </>
      }
    >
      <form id="lock-form" onSubmit={onSubmit} className="space-y-4">
        <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
          <Avatar name={user.fullName || user.email} src={user.avatarUrl} className="h-10 w-10 text-xs" />
          <div className="min-w-0">
            <p className="truncate font-semibold text-slate-900">{user.fullName}</p>
            <p className="truncate text-xs text-slate-500">{user.email}</p>
          </div>
        </div>
        <ul className="space-y-1 text-sm text-slate-600">
          <li>• Đăng xuất khỏi mọi thiết bị, không đăng nhập lại được.</li>
          <li>• Không xem / sửa được dữ liệu, ngừng nhận nhắc deadline.</li>
          <li>• Dữ liệu được giữ nguyên, mở khóa là dùng lại bình thường.</li>
        </ul>
        <Field label="Lý do (người dùng sẽ thấy khi đăng nhập)">
          <textarea className={cn(inputClass, 'min-h-20')} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="Nhập lý do khóa tài khoản" />
        </Field>
        <div className="flex flex-wrap gap-1.5">
          {LOCK_REASONS.map((r) => (
            <button key={r} type="button" onClick={() => setReason(r)} className="rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-600 transition hover:border-red-300 hover:text-red-600">
              {r}
            </button>
          ))}
        </div>
        <FormError message={error} />
      </form>
    </Modal>
  )
}

const AUDIT_TEXT: Record<AdminAuditEntry['action'], { label: string; icon: typeof Lock; tone: string }> = {
  create: { label: 'tạo tài khoản', icon: UserPlus, tone: 'bg-emerald-50 text-emerald-600' },
  update: { label: 'sửa thông tin', icon: Pencil, tone: 'bg-blue-50 text-blue-600' },
  change_role: { label: 'đổi vai trò', icon: ShieldCheck, tone: 'bg-violet-50 text-violet-600' },
  reset_password: { label: 'đặt lại mật khẩu', icon: KeyRound, tone: 'bg-amber-50 text-amber-600' },
  lock: { label: 'khóa', icon: Lock, tone: 'bg-red-50 text-red-600' },
  unlock: { label: 'mở khóa', icon: LockOpen, tone: 'bg-emerald-50 text-emerald-600' },
}

function AuditLog({ entries }: { entries: AdminAuditEntry[] }) {
  const [open, setOpen] = useState(false)
  const shown = open ? entries : entries.slice(0, 5)
  const detail = (e: AdminAuditEntry): ReactNode => {
    if (e.action === 'lock' && typeof e.details.reason === 'string') return `Lý do: ${e.details.reason}`
    if (e.action === 'change_role') return 'Vai trò mới: ' + ROLE_LABEL[((e.details.role as { to?: UserRole })?.to ?? 'user') as UserRole]
    if (e.action === 'update') return `Trường: ${Object.keys(e.details).join(', ')}`
    return null
  }
  return (
    <section className="rounded-2xl border border-slate-200 bg-surface p-4 sm:p-5 shadow-card">
      <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-900">
        <History className="h-4 w-4 text-brand-500" /> Nhật ký quản trị
      </h2>
      {entries.length === 0 ? (
        <p className="text-sm text-slate-500">Chưa có thao tác nào.</p>
      ) : (
        <>
          <ul className="space-y-2.5">
            {shown.map((e) => {
              const meta = AUDIT_TEXT[e.action]
              const Icon = meta.icon
              return (
                <li key={e.id} className="flex items-start gap-3 text-sm">
                  <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', meta.tone)}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-slate-700">
                      <b className="text-slate-900">{e.admin?.full_name || e.admin?.email || 'Admin'}</b> đã {meta.label} <b className="text-slate-900">{e.target?.email ?? '—'}</b>
                    </p>
                    {detail(e) && <p className="truncate text-xs text-slate-500">{detail(e)}</p>}
                  </div>
                  <span className="shrink-0 text-xs text-slate-400">{ago(e.created_at)}</span>
                </li>
              )
            })}
          </ul>
          {entries.length > 5 && (
            <button onClick={() => setOpen((v) => !v)} className="mt-3 text-xs font-semibold text-brand-600 hover:underline">
              {open ? 'Thu gọn' : `Xem thêm ${entries.length - 5} mục`}
            </button>
          )}
        </>
      )}
    </section>
  )
}
