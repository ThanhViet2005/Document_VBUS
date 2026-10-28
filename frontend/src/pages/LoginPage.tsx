import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../store/Auth'
import { hasErrors, liveEmailError, normalizeEmail, validateEmail, validateLogin } from '../lib/authValidation'
import AuthLayout from '../components/auth/AuthLayout'
import { AuthField, AuthFormError, AuthSubmit, focusFirstInvalid } from '../components/auth/AuthField'
import GoogleButton, { AuthDivider, useOAuthError } from '../components/auth/GoogleButton'

type Errors = Partial<Record<'email' | 'password', string>>

export default function LoginPage() {
  const { userId, mode, signIn } = useAuth()
  const location = useLocation()
  const [form, setForm] = useState({ email: '', password: '' })
  const [errors, setErrors] = useState<Errors>({})
  const oauthError = useOAuthError()
  const [formError, setFormError] = useState<string | null>(oauthError)
  const [busy, setBusy] = useState(false)

  // Quay lại trang đang mở dở (vd: link chia sẻ /s/:code) sau khi đăng nhập
  const from = (location.state as { from?: { pathname: string; search?: string } } | null)?.from
  const returnTo = from ? `${from.pathname}${from.search ?? ''}` : '/'

  if (userId || mode === 'demo') return <Navigate to={returnTo} replace />

  const set = (key: keyof typeof form) => (value: string) => {
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((e) => ({ ...e, [key]: undefined }))
    setFormError(null)
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const found = validateLogin(form)
    if (hasErrors(found)) {
      setErrors(found)
      focusFirstInvalid(e.currentTarget)
      return
    }
    setBusy(true)
    try {
      await signIn(normalizeEmail(form.email), form.password)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Đã có lỗi xảy ra')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      title="Đăng nhập"
      footer={
        <>
          Chưa có tài khoản?{' '}
          <Link to="/register" state={location.state} className="font-semibold text-brand-600 hover:underline">
            Đăng ký
          </Link>
        </>
      }
    >
      <GoogleButton returnTo={returnTo} onError={setFormError} />
      <AuthDivider />
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <AuthField
          label="Email"
          type="email"
          value={form.email}
          onChange={(e) => {
            set('email')(e.target.value)
            // Báo ngay khi email chắc chắn sai định dạng (khoảng trắng, nhiều @...)
            setErrors((er) => ({ ...er, email: liveEmailError(e.target.value) ?? undefined }))
          }}
          onBlur={() => form.email && setErrors((er) => ({ ...er, email: validateEmail(form.email) ?? undefined }))}
          error={errors.email}
          placeholder="Nhập email"
          autoComplete="email"
          autoFocus
        />
        <AuthField
          label="Mật khẩu"
          type="password"
          value={form.password}
          onChange={(e) => set('password')(e.target.value)}
          error={errors.password}
          placeholder="Nhập mật khẩu"
          autoComplete="current-password"
        />
        <AuthFormError message={formError} />
        <AuthSubmit busy={busy}>Đăng nhập</AuthSubmit>
      </form>
    </AuthLayout>
  )
}
