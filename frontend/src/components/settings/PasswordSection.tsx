import { useState, type FormEvent } from 'react'
import { Check, CircleAlert, Eye, EyeOff, KeyRound, ShieldCheck, X } from 'lucide-react'
import { cn } from '../../lib/cn'
import { PASSWORD_MIN_LENGTH, validateNewPassword } from '../../lib/authValidation'
import { useAuth } from '../../store/Auth'
import { Button, errorMessage, inputClass } from '../ui/Form'
import { useToast } from '../ui/Toast'

type Field = 'current' | 'next' | 'confirm'
type Errors = Partial<Record<Field, string>>

const EMPTY = { current: '', next: '', confirm: '' }

/** Các điều kiện mật khẩu mới, hiện dạng checklist khi đang gõ (khớp validateNewPassword) */
const RULES: { label: string; test: (v: string) => boolean }[] = [
  { label: `Ít nhất ${PASSWORD_MIN_LENGTH} ký tự`, test: (v) => v.length >= PASSWORD_MIN_LENGTH },
  { label: 'Có chữ cái', test: (v) => /[A-Za-z]/.test(v) },
  { label: 'Có chữ số', test: (v) => /\d/.test(v) },
]

/** Độ mạnh 0–4: mỗi điều kiện bắt buộc + 1 điểm cho mật khẩu dài / có ký tự đặc biệt */
function strength(v: string): number {
  if (!v) return 0
  const base = RULES.filter((r) => r.test(v)).length
  const bonus = v.length >= 12 || /[^A-Za-z0-9]/.test(v) ? 1 : 0
  return Math.min(4, base + (base === RULES.length ? bonus : 0))
}
const STRENGTH = [
  { label: '', bar: 'bg-slate-200', text: 'text-slate-400' },
  { label: 'Yếu', bar: 'bg-red-500', text: 'text-red-600' },
  { label: 'Trung bình', bar: 'bg-amber-500', text: 'text-amber-600' },
  { label: 'Khá', bar: 'bg-blue-500', text: 'text-blue-600' },
  { label: 'Mạnh', bar: 'bg-emerald-500', text: 'text-emerald-600' },
]

/** Đổi mật khẩu (hoặc đặt mật khẩu lần đầu với tài khoản chỉ đăng nhập bằng Google) */
export default function PasswordSection() {
  const { mode, email, hasPassword, changePassword } = useAuth()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState<Errors>({})
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const demo = mode === 'demo'
  const level = strength(form.next)

  const set = (key: Field) => (value: string) => {
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((e) => ({ ...e, [key]: undefined }))
  }

  function close() {
    setOpen(false)
    setForm(EMPTY)
    setErrors({})
    setShow(false)
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const found: Errors = {}
    if (hasPassword && !form.current) found.current = 'Vui lòng nhập mật khẩu hiện tại'
    const pw = validateNewPassword(form.next)
    if (pw) found.next = pw
    else if (hasPassword && form.next === form.current) found.next = 'Mật khẩu mới phải khác mật khẩu hiện tại'
    if (!form.confirm) found.confirm = 'Vui lòng nhập lại mật khẩu mới'
    else if (form.confirm !== form.next) found.confirm = 'Mật khẩu nhập lại không khớp'
    if (Object.keys(found).length) {
      setErrors(found)
      const el = e.currentTarget
      requestAnimationFrame(() => el.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
      return
    }
    setBusy(true)
    try {
      await changePassword(hasPassword ? form.current : null, form.next)
      toast.success(hasPassword ? 'Đã đổi mật khẩu' : 'Đã đặt mật khẩu, giờ bạn có thể đăng nhập bằng email + mật khẩu')
      close()
    } catch (err) {
      const message = errorMessage(err)
      // Sai mật khẩu hiện tại → báo ngay dưới ô đó thay vì toast
      if (/hiện tại không đúng/i.test(message)) setErrors({ current: message })
      else toast.error(message)
    } finally {
      setBusy(false)
    }
  }

  const input = (key: Field, label: string, autoComplete: string, placeholder: string) => (
    <div>
      <label htmlFor={`pw-${key}`} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <div className="relative">
        <input
          id={`pw-${key}`}
          type={show ? 'text' : 'password'}
          className={cn(inputClass, 'py-2.5 pr-10', errors[key] && 'border-red-400 focus:border-red-500 focus:ring-red-500/15')}
          value={form[key]}
          onChange={(e) => set(key)(e.target.value)}
          autoComplete={autoComplete}
          placeholder={placeholder}
          maxLength={72}
          aria-invalid={errors[key] ? true : undefined}
          aria-describedby={errors[key] ? `pw-${key}-error` : undefined}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
          aria-pressed={show}
          tabIndex={-1}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {errors[key] && (
        <p id={`pw-${key}-error`} className="mt-1.5 flex items-start gap-1.5 text-xs font-medium text-red-600" role="alert">
          <CircleAlert className="mt-px h-3.5 w-3.5 shrink-0" /> {errors[key]}
        </p>
      )}
    </div>
  )

  return (
    <section aria-labelledby="password-title" className="rounded-3xl border border-slate-200 bg-surface p-5 sm:p-6 shadow-card">
      <div className="flex flex-wrap items-start gap-3.5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-500">
          <KeyRound className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="password-title" className="text-lg font-extrabold text-slate-900">
            {hasPassword ? 'Đổi mật khẩu' : 'Đặt mật khẩu'}
          </h2>
          <p className="text-xs text-slate-500 sm:text-sm">
            {hasPassword
              ? 'Cần nhập mật khẩu hiện tại để xác nhận đúng là bạn.'
              : 'Tài khoản đang đăng nhập bằng Google. Đặt mật khẩu để đăng nhập thêm bằng email + mật khẩu.'}
          </p>
        </div>
        {!open && (
          <Button variant="secondary" onClick={() => setOpen(true)} disabled={demo} title={demo ? 'Bản demo không dùng tài khoản thật' : undefined}>
            <KeyRound className="h-4 w-4 text-brand-500" /> {hasPassword ? 'Đổi mật khẩu' : 'Đặt mật khẩu'}
          </Button>
        )}
      </div>

      {open && (
        <form onSubmit={onSubmit} noValidate className="mt-5 space-y-4">
          {/* Ô ẩn giúp trình quản lý mật khẩu biết đang đổi mật khẩu cho tài khoản nào */}
          <input type="text" name="username" autoComplete="username" className="sr-only" tabIndex={-1} aria-hidden readOnly value={email ?? ''} />
          <div className="grid gap-4 sm:grid-cols-2">
            {hasPassword && <div className="sm:col-span-2 sm:max-w-[calc(50%-0.5rem)]">{input('current', 'Mật khẩu hiện tại', 'current-password', 'Nhập mật khẩu hiện tại')}</div>}
            <div>
              {input('next', 'Mật khẩu mới', 'new-password', 'Nhập mật khẩu mới')}
              {/* Thanh độ mạnh + checklist điều kiện */}
              {form.next && (
                <div className="mt-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="flex flex-1 gap-1" aria-hidden>
                      {[1, 2, 3, 4].map((i) => (
                        <span key={i} className={cn('h-1.5 flex-1 rounded-full transition-colors', i <= level ? STRENGTH[level].bar : 'bg-slate-200')} />
                      ))}
                    </div>
                    <span className={cn('w-20 text-right text-xs font-semibold', STRENGTH[level].text)}>{STRENGTH[level].label}</span>
                  </div>
                  <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                    {RULES.map((r) => {
                      const ok = r.test(form.next)
                      return (
                        <li key={r.label} className={cn('inline-flex items-center gap-1', ok ? 'text-emerald-600' : 'text-slate-500')}>
                          {ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />} {r.label}
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}
            </div>
            {input('confirm', 'Nhập lại mật khẩu mới', 'new-password', 'Nhập lại mật khẩu mới')}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-4">
            <p className="mr-auto flex items-center gap-1.5 text-xs text-slate-500">
              <ShieldCheck className="h-4 w-4 text-emerald-500" /> Thiết bị này vẫn đăng nhập sau khi đổi.
            </p>
            <Button variant="secondary" onClick={close} disabled={busy}>
              Hủy
            </Button>
            <Button type="submit" busy={busy} className="px-5 shadow-lg shadow-brand-500/30">
              {!busy && <Check className="h-4 w-4" />} {hasPassword ? 'Đổi mật khẩu' : 'Đặt mật khẩu'}
            </Button>
          </div>
        </form>
      )}
    </section>
  )
}
