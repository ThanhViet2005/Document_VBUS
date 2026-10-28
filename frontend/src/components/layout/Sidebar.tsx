import { Link, NavLink } from 'react-router-dom'
import { ChevronsLeft, ChevronsRight, Loader2, LogOut } from 'lucide-react'
import { useAppData } from '../../store/AppData'
import { useAuth } from '../../store/Auth'
import { cn } from '../../lib/cn'
import { useSignOut } from '../../lib/useSignOut'
import { useNavCollapsed } from '../../lib/navCollapse'
import Avatar from '../ui/Avatar'
import { navItemsFor } from './nav'
import { adminApi } from '../../services/admin'
import SidebarJourney from './SidebarJourney'
import { Planet } from '../ui/SkyBackdrop'

/**
 * Thanh điều hướng theo cỡ màn hình:
 *  - điện thoại (< 768px): ẩn, dùng thanh dưới (BottomNav) + bảng "Thêm" (MoreSheet)
 *  - iPad (768-1279px): thanh hẹp (80px) luôn hiện: biểu tượng + nhãn ngắn bên dưới (màn cảm ứng không có hover nên không dựa vào tooltip)
 *  - laptop / PC (>= 1280px): đầy đủ (256px), bấm nút « ở mép phải để thu gọn còn 80px (ghi nhớ trên thiết bị)
 * Kiểu thanh hẹp dùng biến thể nav-compact (index.css) cho cả hai trường hợp iPad và laptop thu gọn.
 */
export default function Sidebar() {
  const { user, deadlines } = useAppData()
  const { mode } = useAuth()
  const { signOut, busy: signingOut } = useSignOut()
  const pendingCount = deadlines.filter((d) => d.status !== 'done').length
  const [collapsed, toggleCollapsed] = useNavCollapsed()

  return (
    <aside
      className={cn(
        // Nền cam thương hiệu cố định (không đổi theo sáng / tối), nên dùng mã màu trực tiếp thay vì brand-* (brand-600/700 bị đổi ở giao diện tối)
        'fixed inset-y-0 left-0 z-40 hidden w-64 flex-col bg-gradient-to-b from-[#f97316] via-[#ef6a12] to-[#c2410c] pt-[env(safe-area-inset-top)] text-white shadow-xl shadow-orange-900/20 transition-[width] duration-300 ease-out md:flex',
        'md:w-20 xl:w-64 nav-compact:w-20',
      )}
    >
      {/* Họa tiết vũ trụ phía dưới menu (lấp khoảng trống): quỹ đạo nét đứt, hành tinh nhỏ, sao lấp lánh.
          -z-10: nằm dưới chữ / nút nhưng trên nền cam (aside là ngăn xếp riêng nhờ z-40) */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
        <div className="absolute -left-24 bottom-24 h-80 w-80 rounded-full border border-dashed border-white/15" />
        <div className="absolute -right-20 bottom-52 h-52 w-52 rounded-full border border-dashed border-white/10" />
        <Planet kind="ice" className="bottom-[22.5rem] left-[3.25rem] h-8 w-8 animate-hero-float nav-compact:hidden [@media(max-height:900px)]:hidden" />
        <Planet kind="earth" className="bottom-[30rem] right-10 h-6 w-6 animate-hero-float-slow nav-compact:hidden [@media(max-height:900px)]:hidden" />
        <Planet kind="violet" className="bottom-[17rem] right-7 h-5 w-5 animate-hero-float-slow nav-compact:hidden [@media(max-height:820px)]:hidden" />
        <span className="absolute bottom-[19rem] right-12 h-1 w-1 animate-hero-twinkle rounded-full bg-white" />
        <span className="absolute bottom-[27rem] left-8 h-1.5 w-1.5 animate-hero-twinkle rounded-full bg-white/90 [animation-delay:0.8s]" />
        <span className="absolute bottom-[13rem] left-10 h-1 w-1 animate-hero-twinkle rounded-full bg-white [animation-delay:1.6s]" />
        <span className="absolute bottom-[24rem] right-8 h-1 w-1 animate-hero-twinkle rounded-full bg-[#fde68a] [animation-delay:2.2s]" />
      </div>

      {/* Nút thu gọn / mở rộng: chỉ laptop / PC (iPad luôn hẹp, điện thoại dùng thanh dưới) */}
      <button
        type="button"
        onClick={toggleCollapsed}
        aria-expanded={!collapsed}
        aria-label={collapsed ? 'Mở rộng thanh điều hướng' : 'Thu gọn thanh điều hướng'}
        title={collapsed ? 'Mở rộng' : 'Thu gọn'}
        // Vùng bấm 44px trong suốt bọc vòng tròn 28px nhìn thấy
        className="group/toggle absolute -right-5.5 top-19 z-10 hidden h-11 w-11 items-center justify-center rounded-full focus-visible:outline-none xl:flex"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-[#c2410c] shadow-md shadow-orange-950/25 ring-1 ring-black/5 transition group-hover/toggle:scale-110 group-hover/toggle:shadow-lg group-focus-visible/toggle:ring-2 group-focus-visible/toggle:ring-[#f97316] dark:bg-[#0f172a] dark:text-[#fb923c] dark:ring-white/10">
          {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
        </span>
      </button>

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-4 nav-compact:justify-center nav-compact:px-0">
        {/* Logo: thẻ nổi trên nền cam, sáng / tối theo giao diện; bấm để về Tổng quan */}
        <Link
          to="/"
          aria-label="UniPlan – về trang Tổng quan"
          title="Về trang Tổng quan"
          className="group flex min-w-0 flex-1 items-center gap-3 rounded-2xl bg-white px-3 py-2.5 shadow-lg shadow-orange-950/20 ring-1 ring-black/5 transition-[transform,box-shadow,background-color] duration-300 hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white dark:bg-[#0f172a] dark:shadow-orange-950/30 dark:ring-white/10 nav-compact:flex-none nav-compact:p-1.5"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#fb923c] to-[#ea580c] text-xl font-extrabold text-white shadow-md shadow-orange-500/40 transition group-hover:scale-105">
            U
          </span>
          <span className="min-w-0 nav-compact:hidden">
            {/* Mã màu cố định: slate-* / brand-* bị đảo ở giao diện tối nên không dùng được cho thẻ tự đổi màu này */}
            <span className="block truncate text-lg font-extrabold leading-tight text-[#0f172a] dark:text-white">UniPlan</span>
            <span className="block truncate text-[11px] font-bold uppercase tracking-wider text-[#c2410c] dark:text-[#fb923c]">FPT University Đà Nẵng</span>
          </span>
        </Link>
      </div>

      {/* Menu */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2 nav-compact:px-1.5" aria-label="Điều hướng chính">
        {navItemsFor(user.role).map(({ to, label, shortLabel, icon: Icon, showTaskBadge }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            // Quản trị: tải trước mã trang + danh sách khi rê chuột / focus / chạm → bấm vào hiện gần như tức thì
            {...(to === '/admin' ? { onMouseEnter: adminApi.prefetch, onFocus: adminApi.prefetch, onTouchStart: adminApi.prefetch } : {})}
            className={({ isActive }) =>
              cn(
                'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                // Thanh hẹp: biểu tượng ở trên, nhãn ngắn ở dưới (như thanh dưới của điện thoại)
                'nav-compact:flex-col nav-compact:gap-1 nav-compact:px-0.5 nav-compact:py-2',
                isActive ? 'bg-white font-semibold text-[#c2410c] shadow-lg shadow-orange-900/20' : 'text-white/85 hover:bg-white/15 hover:text-white',
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon className={cn('h-5 w-5 shrink-0', isActive ? 'text-[#ea580c]' : 'text-white/80 group-hover:text-white')} />
                <span className="flex-1 nav-compact:hidden">{label}</span>
                <span className="hidden w-full truncate text-center text-[11px] font-semibold leading-tight nav-compact:block">{shortLabel ?? label}</span>
                {showTaskBadge && pendingCount > 0 && (
                  <span className={cn('min-w-6 rounded-full px-1.5 py-0.5 text-center text-xs font-bold nav-compact:absolute nav-compact:right-1 nav-compact:top-1 nav-compact:min-w-5 nav-compact:px-1 nav-compact:text-[11px] nav-compact:leading-4', isActive ? 'bg-[#ea580c] text-white' : 'bg-white text-[#c2410c]')}>
                    {pendingCount}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <SidebarJourney />

      {/* Footer: người dùng */}
      <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))] nav-compact:px-2">
        <div className="flex items-center gap-3 rounded-2xl bg-white/15 p-2.5 ring-1 ring-white/20 backdrop-blur nav-compact:justify-center nav-compact:bg-transparent nav-compact:p-0 nav-compact:ring-0">
          <Avatar name={user.fullName || user.email} src={user.avatarUrl} className="ring-2 ring-white/60" />
          <div className="min-w-0 flex-1 nav-compact:hidden">
            <p className="truncate text-sm font-semibold text-white">{user.fullName || '—'}</p>
            <p className="truncate text-xs text-white/80">{user.email}</p>
          </div>
          {mode === 'supabase' && (
            <button
              onClick={() => void signOut()}
              disabled={signingOut}
              className="flex h-11 w-11 items-center justify-center rounded-xl text-white hover:bg-white/20 disabled:opacity-60 nav-compact:hidden"
              title="Đăng xuất"
              aria-label="Đăng xuất"
            >
              {signingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
            </button>
          )}
        </div>
      </div>
    </aside>
  )
}
