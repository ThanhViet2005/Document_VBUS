import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '../../lib/cn'

export const inputClass =
  'w-full rounded-xl border border-slate-200 bg-surface px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 disabled:bg-slate-50 disabled:text-slate-500'

/**
 * as="label" (mặc định): bọc 1 ô nhập. as="group": bọc nhóm nút / danh sách. Không dùng <label> cho nhóm,
 * vì trình duyệt sẽ gắn nhãn vào phần tử đầu tiên: bấm vào tiêu đề sẽ kích hoạt nút / checkbox đầu tiên.
 */
export function Field({
  label,
  hint,
  children,
  className,
  as = 'label',
}: {
  label: string
  hint?: ReactNode
  children: ReactNode
  className?: string
  as?: 'label' | 'group'
}) {
  const content = (
    <>
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </>
  )
  if (as === 'group') {
    return (
      <div role="group" aria-label={label} className={cn('block', className)}>
        {content}
      </div>
    )
  }
  return <label className={cn('block', className)}>{content}</label>
}

type Variant = 'primary' | 'secondary' | 'danger' | 'dangerOutline' | 'destructive' | 'ghost'

const VARIANT: Record<Variant, string> = {
  primary: 'bg-cta text-white shadow-cta hover:-translate-y-0.5 hover:bg-cta-hover disabled:hover:translate-y-0',
  secondary: 'border border-slate-200 bg-surface text-slate-700 hover:bg-slate-100',
  danger: 'bg-red-50 text-red-600 hover:bg-red-100',
  dangerOutline: 'border border-red-200 bg-surface text-red-600 hover:border-red-300 hover:bg-red-50',
  destructive: 'bg-[#dc2626] text-white shadow-sm shadow-red-600/30 hover:bg-[#b91c1c]',
  ghost: 'text-slate-600 hover:bg-slate-100',
}

export function Button({
  variant = 'primary',
  busy = false,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      disabled={disabled || busy}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition duration-200 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100',
        VARIANT[variant],
        className,
      )}
    >
      {busy && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  )
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600" role="alert">
      {message}
    </p>
  )
}

export function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="relative isolate flex flex-col items-center overflow-hidden rounded-card border border-dashed border-slate-300 bg-surface px-6 py-12 text-center">
      {/* Họa tiết bản đồ mờ dần ra rìa: trạng thái trống là "vùng đất chưa khám phá" */}
      <div className="bg-trail pointer-events-none absolute inset-0 -z-10 text-slate-300/60 [mask-image:radial-gradient(closest-side,black,transparent)]" aria-hidden />
      <div className="relative">
        <span className="absolute inset-0 rotate-12 rounded-2xl bg-fpt-blue/15" aria-hidden />
        <div className="relative flex h-14 w-14 -rotate-6 items-center justify-center rounded-2xl bg-gradient-to-br from-[#fb923c] to-[#ea580c] text-white shadow-cta">{icon}</div>
      </div>
      <p className="mt-4 text-base font-extrabold tracking-tight text-slate-900">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-slate-500">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/** Chuyển ISO → giá trị cho <input type="datetime-local"> theo giờ địa phương */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fromLocalInput(value: string): string {
  return new Date(value).toISOString()
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : 'Đã có lỗi xảy ra'
}
