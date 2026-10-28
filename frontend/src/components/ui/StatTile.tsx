import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import { cn } from '../../lib/cn'

/**
 * Màu từng thẻ số liệu. tile: ô biểu tượng gradient (mã hex cố định, giống nhau ở sáng / tối);
 * chip: dòng gợi ý; bar: vạch / thanh tiến độ; glow: vầng màu trang trí. chip dùng thang màu có bản tối trong index.css.
 */
export const STAT_TONES = {
  orange: { tile: 'from-[#fb923c] to-[#ea580c] shadow-[0_6px_16px_-6px_rgb(234_88_12/0.55)]', chip: 'bg-orange-50 text-orange-600', bar: 'bg-[#f97316]', glow: 'bg-[#f97316]' },
  green: { tile: 'from-[#5cc765] to-[#2f9a3a] shadow-[0_6px_16px_-6px_rgb(63_174_73/0.55)]', chip: 'bg-emerald-50 text-emerald-600', bar: 'bg-[#10b981]', glow: 'bg-[#10b981]' },
  amber: { tile: 'from-[#fcd34d] to-[#f59e0b] shadow-[0_6px_16px_-6px_rgb(245_158_11/0.55)]', chip: 'bg-amber-50 text-amber-700', bar: 'bg-[#f59e0b]', glow: 'bg-[#f59e0b]' },
  teal: { tile: 'from-[#2dd4bf] to-[#0d9488] shadow-[0_6px_16px_-6px_rgb(13_148_136/0.55)]', chip: 'bg-teal-50 text-teal-600', bar: 'bg-[#14b8a6]', glow: 'bg-[#14b8a6]' },
  blue: { tile: 'from-[#3b8fe0] to-[#0b6bcb] shadow-[0_6px_16px_-6px_rgb(11_107_203/0.55)]', chip: 'bg-blue-50 text-blue-600', bar: 'bg-[#0b6bcb]', glow: 'bg-[#0b6bcb]' },
  red: { tile: 'from-[#f87171] to-[#dc2626] shadow-[0_6px_16px_-6px_rgb(220_38_38/0.5)]', chip: 'bg-red-50 text-red-600', bar: 'bg-[#ef4444]', glow: 'bg-[#ef4444]' },
}

export default function StatTile({
  label,
  value,
  unit,
  hint,
  icon: Icon,
  tone,
  progress,
  to,
}: {
  label: string
  value: ReactNode
  unit?: string
  hint: string
  icon: LucideIcon
  tone: keyof typeof STAT_TONES
  /** Có đường dẫn → cả thẻ bấm được (Link), vd mở trang Nhiệm vụ đúng tab */
  to?: string
  /** 0..100: hiện thanh tiến độ nhỏ dưới con số */
  progress?: number
}) {
  const t = STAT_TONES[tone]
  const content = (
    <>
      {/* Trang trí: vầng màu góc phải, đậm lên khi rê chuột */}
      <span className={cn('pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full opacity-10 blur-2xl transition-opacity duration-300 group-hover:opacity-25', t.glow)} aria-hidden />

      <div className="relative flex items-center gap-3">
        <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white sm:h-11 sm:w-11', t.tile)}>
          <Icon className="h-5 w-5 group-hover:animate-wiggle" />
        </span>
        <p className="min-w-0 text-xs font-bold uppercase leading-tight tracking-wide text-slate-600">{label}</p>
      </div>

      <p className="relative mt-3 flex min-w-0 items-baseline gap-1.5">
        <span className="min-w-0 truncate text-2xl font-black leading-tight tracking-tight text-slate-900 tabular-nums sm:text-3xl">{value}</span>
        {unit && <span className="shrink-0 text-sm font-semibold text-slate-500">{unit}</span>}
      </p>

      {progress !== undefined && (
        <div className="relative mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label={label}>
          <div className={cn('h-full rounded-full transition-[width] duration-700 ease-out', t.bar)} style={{ width: `${progress}%` }} />
        </div>
      )}

      {/* Đẩy chip gợi ý xuống đáy để 4 thẻ thẳng hàng */}
      <div className="flex-1" aria-hidden />
      <p className={cn('relative mt-3 w-fit max-w-full rounded-lg px-2.5 py-1 text-xs font-semibold leading-snug sm:rounded-full', t.chip)}>{hint}</p>

      <span className={cn('absolute inset-x-0 bottom-0 h-1 origin-left scale-x-0 transition-transform duration-300 group-hover:scale-x-100', t.bar)} aria-hidden />
    </>
  )
  const cls = 'surface-card lift group relative flex flex-col overflow-hidden p-4 sm:p-5'
  return to ? (
    <Link to={to} className={cn(cls, 'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/25')}>
      {content}
    </Link>
  ) : (
    <div className={cls}>{content}</div>
  )
}
