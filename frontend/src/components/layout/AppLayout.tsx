import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { TriangleAlert } from 'lucide-react'
import { useAuth } from '../../store/Auth'
import { useDeadlineReminders } from '../../lib/useDeadlineReminders'
import { supabaseConfigError } from '../../lib/supabase'
import Sidebar from './Sidebar'
import BottomNav from './BottomNav'
import MoreSheet from './MoreSheet'
import NotificationsMenu from './NotificationsMenu'
import ThemeToggle from '../ui/ThemeToggle'
import TopHeader from './TopHeader'
import { NAV_ITEMS, navItemsFor } from './nav'
import { useAppData } from '../../store/AppData'
import LockedScreen from './LockedScreen'
import { useAutoCollapseNav } from '../../lib/navCollapse'

// Trợ lý AI (~50 KB gồm form + bộ phân tích deadline): tải sau khi trang đã vẽ xong, không làm chậm lần mở app
const AiChat = lazy(() => import('../ai/AiChat'))

/** true sau khi trình duyệt rảnh (hoặc tối đa 1,5 giây): dùng để tải những phần không cần ngay */
function useIdle(timeout = 1500): boolean {
  const [idle, setIdle] = useState(false)
  useEffect(() => {
    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(() => setIdle(true), { timeout })
      return () => window.cancelIdleCallback(id)
    }
    const t = setTimeout(() => setIdle(true), 300)
    return () => clearTimeout(t)
  }, [timeout])
  return idle
}
import SkyBackdrop from '../ui/SkyBackdrop'

export default function AppLayout() {
  const [menuOpen, setMenuOpen] = useState(false)
  const { pathname } = useLocation()
  const { mode } = useAuth()
  const { user } = useAppData()
  useDeadlineReminders()
  // Bấm vào vùng nội dung → thanh điều hướng tự thu gọn (laptop / PC)
  const contentRef = useRef<HTMLDivElement>(null)
  useAutoCollapseNav(contentRef)
  const idle = useIdle()

  const current = navItemsFor(user.role).find((n) => n.to === pathname) ?? NAV_ITEMS[0]

  // Tài khoản bị admin khóa: database đã chặn mọi dữ liệu, ở đây chỉ hiện thông báo + đăng xuất
  if (user.isLocked) return <LockedScreen reason={user.lockedReason} />

  return (
    // isolate: tạo ngăn xếp riêng để nền bầu trời (-z-10) nằm trên nền trang nhưng dưới mọi nội dung
    <div className="relative isolate min-h-full">
      <SkyBackdrop variant="ambient" />
      <Sidebar />
      {/* Chừa chỗ cho thanh điều hướng: iPad 80px, laptop / PC (từ 1280px) 256px hoặc 80px khi thu gọn, điện thoại dùng thanh dưới */}
      <div ref={contentRef} className="transition-[padding] duration-300 ease-out md:pl-20 xl:pl-64 nav-compact:pl-20">
        <TopHeader
          title={current.title}
          subtitle={current.subtitle}
          demo={mode === 'demo'}
          actions={
            <>
              <ThemeToggle />
              <NotificationsMenu />
            </>
          }
        />
        <main className="mx-auto max-w-7xl px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-5 sm:px-6 sm:pt-6 md:pb-24 lg:px-8 2xl:max-w-[1600px] min-[2400px]:max-w-[1760px]">
          {supabaseConfigError && (
            <p className="mb-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Cấu hình Supabase không hợp lệ ({supabaseConfigError}), đang chạy dữ liệu demo. Vui lòng báo cho nhóm phát triển.
              </span>
            </p>
          )}
          {/* key theo đường dẫn: mỗi lần đổi trang nội dung hiện dần thay vì nhảy cái bụp */}
          <div key={pathname} className="animate-page-in">
            <Outlet />
          </div>
        </main>
      </div>
      <BottomNav onMore={() => setMenuOpen(true)} />
      <MoreSheet open={menuOpen} onClose={() => setMenuOpen(false)} />
      {idle && (
        <Suspense fallback={null}>
          <AiChat />
        </Suspense>
      )}
    </div>
  )
}
