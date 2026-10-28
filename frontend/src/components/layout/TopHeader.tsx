import { useLayoutEffect, useRef, type ReactNode } from 'react'

interface TopHeaderProps {
  title: string
  subtitle: string
  demo: boolean
  /** Nút bên phải (đổi giao diện, chuông thông báo...) */
  actions?: ReactNode
}

export default function TopHeader({ title, subtitle, demo, actions }: TopHeaderProps) {
  const ref = useRef<HTMLElement>(null)

  // Báo chiều cao thanh tiêu đề qua biến CSS --app-header-h để các thanh dính (sticky) bên dưới đặt đúng chỗ
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const root = document.documentElement
    const update = () => root.style.setProperty('--app-header-h', `${el.offsetHeight}px`)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // z-45: thanh tiêu đề (và menu Thông báo bên trong) phải nằm trên mọi lớp của nội dung trang
  // (hàng ngày dính của thời khóa biểu z-20, nút chuyển tuần z-30, thông báo đổi tuần z-40), dưới Modal / trợ lý AI (z-50)
  return (
    <header ref={ref} className="sticky top-0 z-45 flex items-center gap-3 border-b border-slate-200 bg-surface/80 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur sm:px-6 sm:py-4 lg:px-8">
      <div className="min-w-0 flex-1">
        <h1 className="flex items-center gap-2 text-lg font-extrabold tracking-tight text-slate-900 sm:text-xl">
          <span className="truncate">{title}</span>
          {demo && (
            <span title="Chưa cấu hình Supabase: đang dùng dữ liệu mẫu" className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-700">
              Demo
            </span>
          )}
        </h1>
        <p className="truncate text-xs text-slate-500 sm:text-sm">{subtitle}</p>
      </div>

      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  )
}
