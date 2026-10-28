import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { BadgeCheck, Bell, BellOff, BellRing, Camera, Check, CircleAlert, CloudUpload, GraduationCap, Info, Laptop, Loader2, Lock, LogOut, Mail, MailCheck, MapPin, Monitor, Moon, Palette, Pencil, Send, Sparkles, Sun, Trash2, Upload, UserCog, UserRound } from 'lucide-react'
import { cn } from '../../lib/cn'
import { AVATAR_ACCEPT, prepareAvatar } from '../../lib/avatarImage'
import { CAMPUSES, STUDENT_CODE_MAX, toEnglishCode, validateProfile, type ProfileInput } from '../../lib/profile'
import { setNotifyEnabled, useNotifyEnabled } from '../../lib/notifyPref'
import { useReminderKinds } from '../../lib/reminderPrefs'
import { REMINDER_OPTIONS, type ReminderKind } from '../../lib/reminders'
import { useTheme, type ThemePref } from '../../lib/theme'
import { useSkyEnabled } from '../../lib/sky'
import { disablePush, enableNotifications, getPushStatus, sendTestPush, serverPushAvailable, showLocalNotification, type PushStatus } from '../../lib/push'
import { useSignOut } from '../../lib/useSignOut'
import { useAppData } from '../../store/AppData'
import { useAuth } from '../../store/Auth'
import * as api from '../../services/api'
import { isFptEmail } from '../../lib/authValidation'
import Avatar from '../ui/Avatar'
import { Button, errorMessage, inputClass } from '../ui/Form'
import { useToast } from '../ui/Toast'
import CameraCaptureModal from './CameraCaptureModal'
import PasswordSection from './PasswordSection'

/** Trang Cài đặt của người dùng: hồ sơ, ảnh đại diện, thông báo, đăng xuất */
export default function SettingsPanel() {
  return (
    <div className="space-y-6">
      <ProfileHeader />
      <ProfileForm />
      <AppearanceSection />
      <NotificationSection />
      <EmailDigestSection />
      <PasswordSection />
      <AccountSection />
    </div>
  )
}

function Section({ icon, title, description, children, id }: { icon: ReactNode; title: string; description?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section aria-labelledby={id} className="rounded-3xl border border-slate-200 bg-surface p-5 sm:p-6 shadow-card">
      <div className="mb-5 flex items-start gap-3.5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-500">{icon}</span>
        <div className="min-w-0">
          <h2 id={id} className="text-lg font-extrabold text-slate-900">{title}</h2>
          {description && <p className="text-xs text-slate-500 sm:text-sm">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}

// ---------------------------------------------------------------------
// Ảnh đại diện + tóm tắt hồ sơ
// ---------------------------------------------------------------------
function ProfileHeader() {
  const { user, changeAvatar } = useAppData()
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState<'upload' | 'remove' | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [cameraOpen, setCameraOpen] = useState(false)
  const name = user.fullName || user.email
  // Huy hiệu chỉ hiện với email trường FPT (Gmail vẫn dùng app bình thường)
  const verified = isFptEmail(user.email)

  // Menu chọn nguồn ảnh: đóng khi bấm ra ngoài hoặc nhấn Esc
  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent) => menuRef.current && !menuRef.current.contains(e.target as Node) && setMenuOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  /** Xử lý + tải lên. Báo lỗi bằng toast rồi ném lại để modal camera biết là chưa thành công. */
  async function upload(file: File) {
    setBusy('upload')
    try {
      await changeAvatar(await prepareAvatar(file))
      toast.success('Đã cập nhật ảnh đại diện')
    } catch (e) {
      toast.error(errorMessage(e))
      throw e
    } finally {
      setBusy(null)
    }
  }

  async function onPick(file: File | undefined) {
    if (fileRef.current) fileRef.current.value = '' // chọn lại cùng 1 file vẫn kích hoạt onChange
    if (!file) return
    await upload(file).catch(() => {})
  }

  async function onRemove() {
    setBusy('remove')
    try {
      await changeAvatar(null)
      toast.success('Đã xóa ảnh đại diện')
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  const pickFile = () => {
    setMenuOpen(false)
    fileRef.current?.click()
  }
  const openCamera = () => {
    setMenuOpen(false)
    setCameraOpen(true)
  }

  return (
    <section aria-label="Ảnh đại diện" className="rounded-3xl border border-slate-200 bg-surface shadow-card">
      {/* Ảnh bìa cam: màu cố định ở cả sáng / tối */}
      <div className="relative h-28 rounded-t-3xl bg-linear-to-br from-[#fb923c] via-[#f97316] to-[#c2410c] sm:h-32">
        {verified && (
          <span className="absolute right-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-black/25 px-3 py-1 text-xs font-semibold text-white ring-1 ring-white/30 backdrop-blur">
            <BadgeCheck className="h-4 w-4 text-amber-300" /> Sinh viên FPTU Verified
          </span>
        )}
      </div>
      <div className="flex flex-col items-center gap-4 px-5 pb-6 sm:flex-row sm:items-end sm:px-6">
        <div ref={menuRef} className="relative -mt-12 shrink-0 sm:-mt-14">
          <Avatar name={name} src={user.avatarUrl} className="h-24 w-24 text-2xl ring-4 ring-surface sm:h-28 sm:w-28" />
          {busy && (
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45" role="status" aria-label="Đang xử lý ảnh">
              <Loader2 className="h-6 w-6 animate-spin text-white" />
            </span>
          )}
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            disabled={!!busy}
            className="absolute bottom-0 right-0 flex h-9 w-9 items-center justify-center rounded-full bg-cta text-white shadow-md ring-4 ring-surface transition hover:bg-cta-hover disabled:opacity-60"
            aria-label="Đổi ảnh đại diện"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            title="Đổi ảnh đại diện"
          >
            <Camera className="h-4 w-4" />
          </button>

          {menuOpen && (
            <div
              role="menu"
              aria-label="Đổi ảnh đại diện"
              className="absolute left-1/2 top-full z-20 mt-3 w-60 -translate-x-1/2 overflow-hidden rounded-xl border border-slate-200 bg-surface py-1 shadow-xl sm:left-0 sm:translate-x-0"
            >
              <MenuItem icon={<Upload className="h-4 w-4" />} onClick={pickFile}>
                Tải ảnh từ thiết bị
              </MenuItem>
              <MenuItem icon={<Camera className="h-4 w-4" />} onClick={openCamera}>
                Chụp ảnh bằng camera
              </MenuItem>
              {user.avatarUrl && (
                <MenuItem
                  icon={<Trash2 className="h-4 w-4" />}
                  tone="danger"
                  onClick={() => {
                    setMenuOpen(false)
                    void onRemove()
                  }}
                >
                  Xóa ảnh hiện tại
                </MenuItem>
              )}
            </div>
          )}

          <input
            ref={fileRef}
            type="file"
            accept={AVATAR_ACCEPT}
            className="sr-only"
            tabIndex={-1}
            aria-label="Chọn ảnh đại diện"
            onChange={(e) => void onPick(e.target.files?.[0])}
          />
        </div>

        <div className="min-w-0 flex-1 text-center sm:pb-1 sm:pt-4 sm:text-left">
          <p className="flex items-center justify-center gap-1.5 text-xl font-extrabold text-slate-900 sm:justify-start sm:text-2xl">
            <span className="truncate">{user.fullName || 'Chưa đặt tên'}</span>
            {verified && <BadgeCheck className="h-5 w-5 shrink-0 text-brand-500" aria-label="Email trường đã xác thực" />}
          </p>
          <p className="truncate text-sm text-slate-500">{user.email}</p>
          <div className="mt-2 flex flex-wrap justify-center gap-2 sm:justify-start">
            <span className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700">
              <MapPin className="h-3.5 w-3.5" /> {user.campus}
            </span>
            {user.studentCode && (
              <span className="text-data font-semibold inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-sm text-slate-800">
                <GraduationCap className="h-3.5 w-3.5" /> {user.studentCode}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap justify-center gap-2 sm:pb-1">
          <Button variant="secondary" onClick={pickFile} disabled={!!busy}>
            <CloudUpload className="h-4 w-4" /> {user.avatarUrl ? 'Đổi ảnh' : 'Tải ảnh lên'}
          </Button>
          <Button variant="secondary" onClick={openCamera} disabled={!!busy}>
            <Camera className="h-4 w-4" /> Chụp ảnh
          </Button>
          {user.avatarUrl && (
            <Button variant="dangerOutline" onClick={() => void onRemove()} busy={busy === 'remove'} disabled={!!busy} aria-label="Xóa ảnh đại diện">
              <Trash2 className="h-4 w-4" /> Xóa
            </Button>
          )}
        </div>
      </div>
      <div className="px-5 pb-5 sm:px-6">
        <p className="flex items-start gap-2 rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-500">
          <Info className="mt-px h-4 w-4 shrink-0" />
          <span className="flex-1">PNG, JPG hoặc WebP, hoặc chụp trực tiếp. Ảnh được cắt vuông, thu nhỏ và xóa thông tin vị trí trước khi tải lên.</span>
          <span className="hidden shrink-0 sm:inline">Tối đa 10 MB</span>
        </p>
      </div>

      <CameraCaptureModal open={cameraOpen} onClose={() => setCameraOpen(false)} onCapture={upload} onPickFile={() => fileRef.current?.click()} />
    </section>
  )
}

function MenuItem({ icon, tone, onClick, children }: { icon: ReactNode; tone?: 'danger'; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm font-medium transition',
        tone === 'danger' ? 'text-red-600 hover:bg-red-50' : 'text-slate-700 hover:bg-slate-100',
      )}
    >
      {icon}
      {children}
    </button>
  )
}

// ---------------------------------------------------------------------
// Thông tin cá nhân
// ---------------------------------------------------------------------
type ProfileErrors = Partial<Record<keyof ProfileInput, string>>

function FieldRow({ label, htmlFor, error, hint, tag, children }: { label: string; htmlFor: string; error?: string; hint?: ReactNode; tag?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label htmlFor={htmlFor} className="text-sm font-medium text-slate-700">
          {label}
        </label>
        {tag && <span className="text-xs text-slate-500">{tag}</span>}
      </div>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="mt-1.5 flex items-start gap-1.5 text-xs font-medium text-red-600" role="alert">
          <CircleAlert className="mt-px h-3.5 w-3.5 shrink-0" /> {error}
        </p>
      ) : (
        hint && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>
      )}
    </div>
  )
}

const fromUser = (u: { fullName: string; studentCode: string; campus: string }): ProfileInput => ({
  fullName: u.fullName,
  studentCode: u.studentCode,
  campus: (CAMPUSES as readonly string[]).includes(u.campus) ? u.campus : 'FPT University Đà Nẵng',
})

function ProfileForm() {
  const { user, saveProfile } = useAppData()
  const toast = useToast()
  const saved = fromUser(user)
  const [form, setForm] = useState<ProfileInput>(saved)
  const [errors, setErrors] = useState<ProfileErrors>({})
  const [busy, setBusy] = useState(false)
  const dirty = form.fullName !== saved.fullName || form.studentCode !== saved.studentCode || form.campus !== saved.campus

  // Hồ sơ tải xong (hoặc đổi ở tab khác) mà chưa sửa gì → cập nhật lại form
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  useEffect(() => {
    if (!dirtyRef.current) setForm(fromUser(user))
  }, [user])

  const set = (key: keyof ProfileInput) => (value: string) => {
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((e) => ({ ...e, [key]: undefined }))
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const found = validateProfile(form)
    if (Object.values(found).some(Boolean)) {
      setErrors(found)
      const form = e.currentTarget
      requestAnimationFrame(() => form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
      return
    }
    setBusy(true)
    try {
      const profile = await saveProfile(form)
      setForm(fromUser(profile))
      toast.success('Đã lưu thông tin cá nhân')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const invalid = (key: keyof ProfileInput) => (errors[key] ? { 'aria-invalid': true, 'aria-describedby': `profile-${key}-error` } : {})
  const errorRing = (key: keyof ProfileInput) => errors[key] && 'border-red-400 focus:border-red-500 focus:ring-red-500/15'

  return (
    <Section id="profile-title" icon={<UserRound className="h-5 w-5" />} title="Thông tin cá nhân" description="Tên và ảnh hiển thị với các thành viên trong nhóm của bạn.">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldRow label="Họ và tên" htmlFor="profile-fullName" error={errors.fullName} tag={<span className="font-semibold text-brand-600">Bắt buộc</span>}>
            <div className="relative">
              <input
                id="profile-fullName"
                className={cn(inputClass, 'py-2.5 pr-10', errorRing('fullName'))}
                value={form.fullName}
                onChange={(e) => set('fullName')(e.target.value)}
                placeholder="Nhập họ và tên"
                autoComplete="name"
                maxLength={100}
                {...invalid('fullName')}
              />
              <Pencil className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            </div>
          </FieldRow>
          <FieldRow
            label="Email"
            htmlFor="profile-email"
            hint="Email dùng để đăng nhập UniPlan, không thể thay đổi tại đây."
            tag={
              <span className="inline-flex items-center gap-1">
                <Lock className="h-3 w-3" /> Không thể sửa
              </span>
            }
          >
            <div className="relative">
              <input id="profile-email" className={cn(inputClass, 'py-2.5 pr-10')} value={user.email} readOnly disabled />
              <Lock className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            </div>
          </FieldRow>
          <FieldRow label="Mã số sinh viên" htmlFor="profile-studentCode" error={errors.studentCode} hint="Không bắt buộc với Mentor / Giảng viên.">
            <input
              id="profile-studentCode"
              className={cn(inputClass, 'py-2.5', errorRing('studentCode'))}
              value={form.studentCode}
              onChange={(e) => set('studentCode')(toEnglishCode(e.target.value))}
              placeholder="Nhập mã số sinh viên"
              maxLength={STUDENT_CODE_MAX}
              lang="en"
              inputMode="text"
              autoCapitalize="off"
              autoComplete="off"
              spellCheck={false}
              {...invalid('studentCode')}
            />
          </FieldRow>
          <FieldRow label="Cơ sở FPT University" htmlFor="profile-campus" error={errors.campus} hint="Hiển thị trên hồ sơ và với thành viên trong nhóm.">
            <select
              id="profile-campus"
              className={cn(inputClass, 'py-2.5', errorRing('campus'))}
              value={form.campus}
              onChange={(e) => set('campus')(e.target.value)}
              {...invalid('campus')}
            >
              {CAMPUSES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </FieldRow>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-4">
          {dirty && <span className="mr-auto text-xs font-medium text-amber-600">Bạn có thay đổi chưa lưu</span>}
          <Button
            type="button"
            variant="secondary"
            disabled={!dirty || busy}
            onClick={() => {
              setForm(saved)
              setErrors({})
            }}
          >
            Hủy
          </Button>
          <Button type="submit" busy={busy} disabled={!dirty} className="px-5 shadow-lg shadow-brand-500/30">
            {!busy && <Check className="h-4 w-4" />} Lưu thay đổi
          </Button>
        </div>
      </form>
    </Section>
  )
}

// ---------------------------------------------------------------------
// Giao diện sáng / tối
// ---------------------------------------------------------------------
const THEME_OPTIONS: { value: ThemePref; label: string; hint: string; icon: ReactNode; preview: string }[] = [
  {
    value: 'light',
    label: 'Sáng',
    hint: 'Nền trắng, dễ đọc ban ngày',
    icon: <Sun className="h-4 w-4" />,
    preview: 'linear-gradient(#ffffff, #ffffff)',
  },
  {
    value: 'dark',
    label: 'Tối',
    hint: 'Dịu mắt khi học buổi tối',
    icon: <Moon className="h-4 w-4" />,
    preview: 'linear-gradient(#0a1020, #0a1020)',
  },
  {
    value: 'system',
    label: 'Theo thiết bị',
    hint: 'Tự đổi theo cài đặt máy',
    icon: <Monitor className="h-4 w-4" />,
    preview: 'linear-gradient(100deg, #f8fafc 35%, #0a1020 100%)',
  },
]

/** Hình thu nhỏ giao diện: màu cố định (không theo theme) để người dùng thấy trước kết quả */
function ThemePreview({ value, background }: { value: ThemePref; background: string }) {
  const dark = value === 'dark'
  return (
    <span aria-hidden className="relative block h-24 w-full overflow-hidden rounded-xl border border-slate-300/60" style={{ background }}>
      {/* Thanh tiêu đề, 2 dòng nội dung, nút cam: mô phỏng 1 màn hình UniPlan */}
      <span className={cn('absolute left-3 top-3 h-2 w-12 rounded-full', dark ? 'bg-[#475569]' : value === 'system' ? 'bg-[#cbd5e1]' : 'bg-[#cbd5e1]')} />
      <span className="absolute right-3 top-3 h-2 w-2 rounded-full bg-[#f97316]" />
      <span className={cn('absolute left-3 right-3 top-9 h-1.5 rounded-full', dark ? 'bg-[#334155]' : 'bg-[#e2e8f0]')} />
      <span className={cn('absolute left-3 top-[3.25rem] h-1.5 w-2/3 rounded-full', dark ? 'bg-[#334155]' : 'bg-[#e2e8f0]')} />
      <span className="absolute bottom-3 left-3 h-2.5 w-20 rounded-full bg-[#f97316]" />
    </span>
  )
}

function AppearanceSection() {
  const { pref, setPref } = useTheme()
  const [sky, setSky] = useSkyEnabled()
  const toast = useToast()

  return (
    <Section id="theme-title" icon={<Palette className="h-5 w-5" />} title="Giao diện" description="Lựa chọn được ghi nhớ trên thiết bị này.">
      <div role="radiogroup" aria-labelledby="theme-title" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {THEME_OPTIONS.map((o) => {
          const active = pref === o.value
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => {
                setPref(o.value)
                toast.success(o.value === 'system' ? 'Giao diện sẽ theo cài đặt của thiết bị' : `Đã chuyển sang giao diện ${o.label.toLowerCase()}`)
              }}
              className={cn(
                'rounded-2xl border-2 bg-slate-50 p-3 text-left transition duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/25',
                active ? 'border-brand-500 shadow-lg shadow-brand-500/10' : 'border-transparent hover:-translate-y-0.5 hover:border-slate-200',
              )}
            >
              <ThemePreview value={o.value} background={o.preview} />
              <span className="mt-3 flex items-center gap-2 text-sm font-bold text-slate-900">
                <span className="text-brand-500">{o.icon}</span>
                {o.label}
                {/* Nút radio: tròn cam có dấu ✓ khi đang chọn */}
                <span className={cn('ml-auto flex h-5 w-5 items-center justify-center rounded-full transition', active ? 'bg-cta text-white' : 'bg-slate-300/70')} aria-hidden>
                  {active && <Check className="h-3 w-3" strokeWidth={3} />}
                </span>
              </span>
              <span className="mt-0.5 block text-xs text-slate-500">{o.hint}</span>
            </button>
          )
        })}
      </div>

      <div className="mt-4 flex items-center gap-3 rounded-2xl bg-slate-50 p-3.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-500">
          <Sparkles className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-900">Nền bầu trời</p>
          <p className="text-xs text-slate-500">Hành tinh (giao diện sáng) và các vì sao (giao diện tối) ở nền các trang. Tắt để giao diện gọn hơn hoặc tiết kiệm pin.</p>
        </div>
        <Switch checked={sky} onChange={setSky} label="Hiện nền bầu trời" />
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------------
// Thông báo nhắc deadline (công tắc bật / tắt)
// ---------------------------------------------------------------------
const BLOCKED: Partial<Record<PushStatus, string>> = {
  unsupported: 'Trình duyệt này không hỗ trợ thông báo.',
  insecure: 'Cần mở UniPlan qua HTTPS để dùng thông báo.',
  'ios-needs-install': 'iPhone/iPad: Chia sẻ → "Thêm vào Màn hình chính", mở UniPlan từ biểu tượng đó rồi bật thông báo.',
  denied: 'Bạn đã chặn thông báo. Mở cài đặt trang web của trình duyệt (biểu tượng ổ khóa cạnh địa chỉ) để cho phép lại.',
}

function Switch({ checked, disabled, busy, onChange, label }: { checked: boolean; disabled?: boolean; busy?: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled || busy}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/25 disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-brand-500' : 'bg-slate-300',
      )}
    >
      <span className={cn('inline-flex h-5 w-5 items-center justify-center rounded-full bg-surface shadow transition', checked ? 'translate-x-6' : 'translate-x-1')}>
        {busy && <Loader2 className="h-3 w-3 animate-spin text-slate-400" />}
      </span>
    </button>
  )
}

function NotificationSection() {
  const { user } = useAppData()
  const { mode } = useAuth()
  const toast = useToast()
  const wanted = useNotifyEnabled(user.id)
  const [kinds, saveKinds] = useReminderKinds(user.id, mode === 'supabase')
  const [status, setStatus] = useState<PushStatus | null>(null)
  const [busy, setBusy] = useState<'toggle' | 'test' | null>(null)

  const refresh = () => void getPushStatus().then(setStatus)
  useEffect(refresh, [])

  const blocked = status ? BLOCKED[status] : undefined
  // Bật = người dùng muốn nhận + trình duyệt cho phép + (đã đăng ký Web Push nếu máy chủ hỗ trợ)
  const on = wanted && (status === 'push-on' || status === 'local-only')
  const background = status === 'push-on'

  async function toggle(next: boolean) {
    setBusy('toggle')
    try {
      if (next) {
        setNotifyEnabled(user.id, true)
        const r = await enableNotifications()
        toast.success(r.push ? 'Đã bật nhắc deadline trên thiết bị này' : (r.note ?? 'Đã bật thông báo'))
      } else {
        setNotifyEnabled(user.id, false)
        if (status === 'push-on') await disablePush()
        toast.success('Đã tắt nhắc deadline trên thiết bị này')
      }
    } catch (e) {
      if (next) setNotifyEnabled(user.id, false)
      toast.error(errorMessage(e))
    } finally {
      setBusy(null)
      refresh()
    }
  }

  async function toggleKind(kind: ReminderKind) {
    // Giữ thứ tự xa → gần hạn cho dễ đọc khi lưu
    const next = REMINDER_OPTIONS.map((o) => o.kind).filter((k) => (k === kind ? !kinds.includes(k) : kinds.includes(k)))
    try {
      await saveKinds(next)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  async function test() {
    setBusy('test')
    try {
      if (background) {
        const r = await sendTestPush()
        toast.success(`Máy chủ đã gửi thông báo thử tới ${r.sent}/${r.devices} thiết bị`)
      } else {
        const shown = await showLocalNotification({ title: 'UniPlan', body: 'Thông báo thử thành công 🎉', tag: 'uniplan-test', url: '/settings' })
        if (!shown) throw new Error('Không hiển thị được thông báo. Hãy kiểm tra quyền thông báo của trình duyệt.')
      }
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Section
      id="notify-title"
      icon={on ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
      title="Thông báo nhắc deadline"
      description="Nhắc bài tập, Lab, Assignment và deadline nhóm trước khi tới hạn."
    >
      <div className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50 p-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-500">
          <BellRing className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900">Nhắc deadline trên thiết bị này</p>
          <p className="mt-0.5 text-sm text-slate-500">Theo các mốc bạn chọn bên dưới, cả deadline nhóm. Mỗi mốc chỉ nhắc một lần.</p>
        </div>
        <Switch checked={on} disabled={!status || !!blocked} busy={busy === 'toggle'} onChange={(v) => void toggle(v)} label="Nhắc deadline trên thiết bị này" />
      </div>

      {/* Chọn mốc nhắc: lưu lên máy chủ nên áp dụng cho mọi thiết bị và cả khi đã đóng app */}
      <div className="mt-3 rounded-2xl bg-slate-50 p-4">
        <p id="reminder-kinds-title" className="text-sm font-semibold text-slate-900">
          Nhắc tôi vào các mốc
        </p>
        <p className="mt-0.5 text-xs text-slate-500">Áp dụng cho mọi thiết bị của bạn. Mỗi deadline chỉ nhận mốc gần nhất, không nhắc bù mốc đã qua.</p>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-labelledby="reminder-kinds-title">
          {REMINDER_OPTIONS.map((o) => {
            const active = kinds.includes(o.kind)
            return (
              <button
                key={o.kind}
                type="button"
                aria-pressed={active}
                onClick={() => void toggleKind(o.kind)}
                className={cn(
                  'inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/25',
                  active ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 bg-surface text-slate-600 hover:border-slate-300 hover:text-slate-900',
                )}
              >
                {active && <Check className="h-4 w-4" strokeWidth={3} />}
                {o.label}
              </button>
            )
          })}
        </div>
        {kinds.length === 0 && (
          <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-amber-700" role="status">
            <CircleAlert className="h-3.5 w-3.5" /> Chưa chọn mốc nào: bạn sẽ không nhận được nhắc deadline.
          </p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3">
        {blocked ? (
          <p className="flex flex-1 items-start gap-2 text-sm text-amber-700" role="status">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {blocked}
          </p>
        ) : on ? (
          <p className="flex min-w-0 flex-1 items-center gap-2 text-sm text-emerald-600" role="status">
            <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-emerald-500" />
            {background
                ? 'Đang bật: nhận nhắc cả khi đã đóng UniPlan.'
                : mode === 'supabase' && !serverPushAvailable()
                  ? 'Đang bật: nhắc khi UniPlan đang mở (máy chủ chưa hỗ trợ nhắc khi đã đóng app).'
                  : 'Đang bật: nhắc khi UniPlan đang mở.'}
          </p>
        ) : (
          <p className="flex min-w-0 flex-1 items-center gap-2 text-sm text-slate-500" role="status">
            <span className="h-2 w-2 shrink-0 rounded-full bg-slate-400" /> Đang tắt: bạn sẽ không nhận nhắc deadline trên thiết bị này.
          </p>
        )}
        {on && (
          <Button variant="secondary" onClick={() => void test()} busy={busy === 'test'} className="px-3 py-1.5 text-xs">
            <Send className="h-3.5 w-3.5 text-brand-500" /> Gửi thông báo thử
          </Button>
        )}
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------------
// Email tổng hợp mỗi sáng (Brevo): việc quá hạn + hạn hôm nay, gửi tới email đăng nhập
// ---------------------------------------------------------------------
function EmailDigestSection() {
  const { user } = useAppData()
  const { mode } = useAuth()
  const toast = useToast()
  const online = mode === 'supabase'
  const [enabled, setEnabled] = useState<boolean | null>(online ? null : false)
  const [unavailable, setUnavailable] = useState<string | null>(online ? null : 'Bản demo không gửi email.')
  const [busy, setBusy] = useState<'toggle' | 'test' | null>(null)

  useEffect(() => {
    if (!online || !user.id) return
    let alive = true
    api
      .fetchEmailDigest(user.id)
      .then((v) => alive && setEnabled(v))
      .catch((e) => {
        if (!alive) return
        setEnabled(false)
        setUnavailable(errorMessage(e))
      })
    return () => {
      alive = false
    }
  }, [online, user.id])

  async function toggle(next: boolean) {
    setBusy('toggle')
    try {
      await api.setEmailDigest(next)
      setEnabled(next)
      toast.success(next ? `Đã bật: mỗi sáng 7:00 gửi tới ${user.email} các việc hạn hôm nay và việc quá hạn` : 'Đã tắt email tổng hợp')
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  async function test() {
    setBusy('test')
    try {
      const email = await api.sendTestDigestEmail()
      toast.success(`Đã gửi email thử tới ${email}. Không thấy thì xem trong mục Thư rác / Quảng cáo.`)
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Section
      id="email-digest-title"
      icon={<Mail className="h-5 w-5" />}
      title="Email tổng hợp mỗi sáng"
      description="Các việc đến hạn hôm nay và việc quá hạn, gửi lúc 7:00 sáng tới email đăng nhập, kể cả khi bạn không mở UniPlan."
    >
      <div className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50 p-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-500">
          <MailCheck className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900">Nhận email tổng hợp</p>
          <p className="mt-0.5 truncate text-sm text-slate-500">
            Gửi tới <span className="font-medium text-slate-700">{user.email || 'email của bạn'}</span>. Ngày không có việc nào thì không gửi.
          </p>
        </div>
        <Switch checked={!!enabled} disabled={enabled === null || !!unavailable} busy={busy === 'toggle'} onChange={(v) => void toggle(v)} label="Nhận email tổng hợp mỗi sáng" />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3">
        {unavailable ? (
          <p className="flex flex-1 items-start gap-2 text-sm text-amber-700" role="status">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {unavailable}
          </p>
        ) : (
          <p className="min-w-0 flex-1 text-sm text-slate-600" role="status">
            {enabled ? 'Đang bật. Mỗi email có link "Hủy nhận" ở cuối thư.' : 'Đang tắt. Bạn vẫn có thể gửi thử để xem email trông thế nào.'}
          </p>
        )}
        {!unavailable && (
          <Button variant="secondary" onClick={() => void test()} busy={busy === 'test'} className="px-3 py-1.5 text-xs">
            <Send className="h-3.5 w-3.5 text-brand-500" /> Gửi email thử
          </Button>
        )}
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------------
// Tài khoản: đăng xuất
// ---------------------------------------------------------------------
function AccountSection() {
  const { mode } = useAuth()
  const { signOut, busy } = useSignOut()
  const [confirming, setConfirming] = useState(false)
  const demo = mode === 'demo'

  return (
    <Section id="account-title" icon={<UserCog className="h-5 w-5" />} title="Tài khoản & Phiên đăng nhập" description="Email đăng nhập và thiết bị đang đăng nhập.">
      <div className="flex flex-col gap-3 rounded-2xl bg-slate-50 p-4 sm:flex-row sm:items-center">
        <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface text-slate-600 ring-1 ring-slate-200 sm:flex">
          <Laptop className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
            Đăng xuất khỏi thiết bị này
            <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] font-bold text-emerald-700">Thiết bị hiện tại</span>
          </p>
          <p className="mt-0.5 text-sm text-slate-500">
            {demo ? 'Bản demo không dùng tài khoản nên không cần đăng xuất.' : 'Nhắc deadline và đồng bộ dữ liệu nhóm gửi tới thiết bị này sẽ tạm dừng.'}
          </p>
        </div>
        {confirming ? (
          <div className="flex shrink-0 gap-2" role="group" aria-label="Xác nhận đăng xuất">
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={busy}>
              Hủy
            </Button>
            <Button variant="destructive" onClick={() => void signOut()} busy={busy}>
              <LogOut className="h-4 w-4" /> Xác nhận đăng xuất
            </Button>
          </div>
        ) : (
          <Button variant="danger" className="shrink-0" onClick={() => setConfirming(true)} disabled={demo}>
            <LogOut className="h-4 w-4" /> Đăng xuất
          </Button>
        )}
      </div>
    </Section>
  )
}
