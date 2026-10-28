import { NavLink, useLocation } from 'react-router-dom'
import { Menu } from 'lucide-react'
import { useAppData } from '../../store/AppData'
import { cn } from '../../lib/cn'
import { NAV_ITEMS } from './nav'

/** Các mục dùng nhiều nhất, đặt ở thanh dưới để chạm bằng ngón cái (chỉ điện thoại). Còn lại nằm trong bảng "Thêm" (MoreSheet). */
export const PRIMARY_MOBILE = ['/', '/tasks', '/calendar', '/groups']

export default function BottomNav({ onMore }: { onMore: () => void }) {
  const { deadlines } = useAppData()
  const { pathname } = useLocation()
  const pending = deadlines.filter((d) => d.status !== 'done').length
  const items = PRIMARY_MOBILE.map((to) => NAV_ITEMS.find((n) => n.to === to)!).filter(Boolean)
  // Đang ở trang nằm trong "Thêm" (Môn học, Kế hoạch, Cài đặt...): tô sáng nút "Thêm" để người dùng biết mình đang ở đâu
  const inMore = !PRIMARY_MOBILE.includes(pathname)

  const base = 'relative flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 whitespace-nowrap px-0.5 py-1.5 text-[11px] font-semibold transition-colors min-[360px]:px-1 min-[360px]:text-xs'

  return (
    <nav
      aria-label="Điều hướng nhanh"
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-slate-200 bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      {items.map(({ to, label, shortLabel, icon: Icon, showTaskBadge }) => (
        <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => cn(base, isActive ? 'text-brand-600' : 'text-slate-500 active:bg-slate-100')}>
          {({ isActive }) => (
            <>
              {isActive && <span className="absolute inset-x-6 top-0 h-0.5 rounded-b-full bg-brand-500" aria-hidden />}
              <span className="relative">
                <Icon className="h-6 w-6" />
                {showTaskBadge && pending > 0 && (
                  <span className="absolute -right-2.5 -top-1.5 min-w-4 rounded-full bg-cta px-1 text-center text-[10px] font-bold leading-4 text-white ring-2 ring-surface">
                    {pending > 9 ? '9+' : pending}
                  </span>
                )}
              </span>
              <span>{shortLabel ?? label}</span>
            </>
          )}
        </NavLink>
      ))}
      <button
        type="button"
        onClick={onMore}
        className={cn(base, inMore ? 'text-brand-600' : 'text-slate-500 active:bg-slate-100')}
        aria-haspopup="dialog"
        aria-current={inMore ? 'page' : undefined}
      >
        {inMore && <span className="absolute inset-x-6 top-0 h-0.5 rounded-b-full bg-brand-500" aria-hidden />}
        <Menu className="h-6 w-6" />
        <span>Thêm</span>
      </button>
    </nav>
  )
}
