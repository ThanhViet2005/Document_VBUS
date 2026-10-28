import { cn } from '../../lib/cn'

interface ProgressBarProps {
  value: number
  /** Class màu nền của thanh, vd: bg-red-500 */
  barClassName?: string
  className?: string
  /** Class màu nền của rãnh (mặc định bg-slate-100) – đặt riêng vì cn() không gộp class trùng loại */
  trackClassName?: string
}

export default function ProgressBar({ value, barClassName = 'bg-brand-500', className, trackClassName = 'bg-slate-100' }: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, value))
  return (
    <div
      className={cn('h-2 w-full overflow-hidden rounded-full', trackClassName, className)}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={cn('h-full rounded-full transition-all duration-500', barClassName)} style={{ width: `${pct}%` }} />
    </div>
  )
}
