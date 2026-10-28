import { useId, useState, type InputHTMLAttributes, type ReactNode } from 'react'
import { CircleAlert, Eye, EyeOff, Loader2 } from 'lucide-react'
import { cn } from '../../lib/cn'

interface AuthFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> {
  label: string
  /** Lỗi của riêng trường này: viền đỏ + dòng báo lỗi bên dưới */
  error?: string | null
  hint?: ReactNode
}

/** Ô nhập cho form xác thực. type="password" có nút hiện/ẩn mật khẩu. */
export function AuthField({ label, error, hint, type = 'text', ...props }: AuthFieldProps) {
  const id = useId()
  const [show, setShow] = useState(false)
  const isPassword = type === 'password'
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={isPassword && show ? 'text' : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...props}
          className={cn(
            'w-full rounded-xl border bg-surface px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:ring-4',
            isPassword && 'pr-11',
            error ? 'border-red-400 focus:border-red-500 focus:ring-red-500/15' : 'border-slate-200 focus:border-brand-500 focus:ring-brand-500/15',
          )}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-500 hover:text-slate-700"
            aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 flex items-start gap-1.5 text-xs font-medium text-red-600" role="alert">
          <CircleAlert className="mt-px h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="mt-1.5 text-xs text-slate-500">
            {hint}
          </p>
        )
      )}
    </div>
  )
}

export function AuthSubmit({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="flex w-full items-center justify-center gap-2 rounded-xl bg-cta py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand-500/30 transition hover:bg-cta-hover disabled:opacity-60"
    >
      {busy && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  )
}

/** Đưa con trỏ về ô lỗi đầu tiên (chạy sau khi React render xong viền đỏ) */
export function focusFirstInvalid(form: HTMLFormElement) {
  requestAnimationFrame(() => form.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus())
}

/** Lỗi chung của form (vd: sai mật khẩu, mất mạng) */
export function AuthFormError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700" role="alert">
      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
      {message}
    </p>
  )
}
