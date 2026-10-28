import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { MailCheck } from 'lucide-react'
import { useAuth } from '../store/Auth'
import { hasErrors, liveEmailError, normalizeEmail, PASSWORD_MIN_LENGTH, validateRegister } from '../lib/authValidation'
import AuthLayout from '../components/auth/AuthLayout'
import { AuthField, AuthFormError, AuthSubmit, focusFirstInvalid } from '../components/auth/AuthField'
import GoogleButton, { AuthDivider, useOAuthError } from '../components/auth/GoogleButton'

type FieldKey = 'fullName' | 'email' | 'password' | 'confirmPassword'
type Errors = Partial<Record<FieldKey, string>>

export default function RegisterPage() {
  const { userId, mode, signUp } = useAuth()
  const location = useLocation()
  const [form, setForm] = useState<Record<FieldKey, string>>({ fullName: '', email: '', password: '', confirmPassword: '' })
  const [errors, setErrors] = useState<Errors>({})
  const oauthError = useOAuthError()
  const [formError, setFormError] = useState<string | null>(oauthError)
  const [busy, setBusy] = useState(false)
  const [confirmSentTo, setConfirmSentTo] = useState<string | null>(null)

  if (userId || mode === 'demo') return <Navigate to="/" replace />

  const set = (key: FieldKey) => (value: string) => {
    const next = { ...form, [key]: value }
    setForm(next)
    setErrors((e) => {
      const updated = { ...e, [key]: undefined }
      // Đang báo "không khớp" mà người dùng sửa một trong hai ô → kiểm tra lại ngay
      if ((key === 'password' || key === 'confirmPassword') && e.confirmPassword && next.confirmPassword) {
        updated.confirmPassword = validateRegister(next).confirmPassword
      }
      return updated
    })
    setFormError(null)
  }

  /** Kiểm tra một ô khi rời khỏi ô đó (chỉ khi đã nhập) */
  const check = (key: FieldKey) => () => {
    if (!form[key]) return
    setErrors((e) => ({ ...e, [key]: validateRegister(form)[key] }))
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const found = validateRegister(form)
    if (hasErrors(found)) {
      setErrors(found)
      focusFirstInvalid(e.currentTarget)
      return
    }
    const email = normalizeEmail(form.email)
    setBusy(true)
    try {
      const needConfirm = await signUp({ fullName: form.fullName, email, password: form.password })
      if (needConfirm) setConfirmSentTo(email)
      // Không cần xác nhận email → đã có phiên đăng nhập, trang tự chuyển vào Dashboard
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Đã có lỗi xảy ra')
    } finally {
      setBusy(false)
    }
  }

  if (confirmSentTo) {
    return (
      <AuthLayout title="Kiểm tra hộp thư của bạn" subtitle="Còn một bước nữa để kích hoạt tài khoản">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
          <MailCheck className="mx-auto h-10 w-10 text-emerald-500" />
          <p className="mt-3 text-sm text-slate-700">
            Chúng tôi đã gửi link xác nhận tới <strong>{confirmSentTo}</strong>. Mở link đó rồi quay lại đăng nhập.
          </p>
          <Link to="/login" state={location.state} className="mt-4 inline-block text-sm font-semibold text-brand-600 hover:underline">
            Đến trang đăng nhập
          </Link>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Đăng ký"
      footer={
        <>
          Đã có tài khoản?{' '}
          <Link to="/login" state={location.state} className="font-semibold text-brand-600 hover:underline">
            Đăng nhập
          </Link>
        </>
      }
    >
      {/* Đăng ký bằng Google: không cần đặt mật khẩu, tên + ảnh đại diện lấy từ tài khoản Google */}
      <GoogleButton onError={setFormError} />
      <AuthDivider />
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <AuthField
          label="Họ và tên"
          value={form.fullName}
          onChange={(e) => set('fullName')(e.target.value)}
          onBlur={check('fullName')}
          error={errors.fullName}
          placeholder="Nhập họ và tên"
          autoComplete="name"
          autoFocus
        />
        <AuthField
          label="Email"
          type="email"
          value={form.email}
          onChange={(e) => {
            set('email')(e.target.value)
            // Báo ngay khi email chắc chắn sai định dạng (khoảng trắng, nhiều @...)
            setErrors((er) => ({ ...er, email: liveEmailError(e.target.value) ?? undefined }))
          }}
          onBlur={check('email')}
          error={errors.email}
          placeholder="Nhập email"
          autoComplete="email"
        />
        <AuthField
          label="Mật khẩu"
          type="password"
          value={form.password}
          onChange={(e) => set('password')(e.target.value)}
          onBlur={check('password')}
          error={errors.password}
          hint={`Ít nhất ${PASSWORD_MIN_LENGTH} ký tự, gồm cả chữ và số`}
          placeholder="Nhập mật khẩu"
          autoComplete="new-password"
        />
        <AuthField
          label="Nhập lại mật khẩu"
          type="password"
          value={form.confirmPassword}
          onChange={(e) => set('confirmPassword')(e.target.value)}
          onBlur={check('confirmPassword')}
          error={errors.confirmPassword}
          placeholder="Nhập lại mật khẩu"
          autoComplete="new-password"
        />
        <AuthFormError message={formError} />
        <AuthSubmit busy={busy}>Tạo tài khoản</AuthSubmit>
      </form>
    </AuthLayout>
  )
}
