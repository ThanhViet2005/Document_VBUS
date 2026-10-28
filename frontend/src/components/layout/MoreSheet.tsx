import { NavLink } from 'react-router-dom'
import { ChevronRight, Loader2, LogOut } from 'lucide-react'
import { useAppData } from '../../store/AppData'
import { useAuth } from '../../store/Auth'
import { cn } from '../../lib/cn'
import { useSignOut } from '../../lib/useSignOut'
import Modal from '../ui/Modal'
import Avatar from '../ui/Avatar'
import { navItemsFor } from './nav'
import { PRIMARY_MOBILE } from './BottomNav'
import { adminApi } from '../../services/admin'

/**
 * Bảng "Thêm" trên điện thoại (trượt lên từ dưới, dùng Modal): chỉ các mục KHÔNG có ở thanh dưới
 * (Môn học, Kế hoạch học, Cài đặt, Quản trị) + tài khoản và Đăng xuất. Không lặp lại 4 mục của thanh dưới.
 */
export default function MoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAppData()
  const { mode } = useAuth()
  const { signOut, busy: signingOut } = useSignOut()
  const items = navItemsFor(user.role).filter((n) => !PRIMARY_MOBILE.includes(n.to))

  return (
    <Modal open={open} title="Thêm" onClose={onClose}>
      <div className="mb-4 flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
        <Avatar name={user.fullName || user.email} src={user.avatarUrl} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">{user.fullName || '—'}</p>
          <p className="truncate text-xs text-slate-500">{user.email}</p>
        </div>
      </div>

      <nav aria-label="Các trang khác" className="space-y-1">
        {items.map(({ to, label, subtitle, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onClose}
            {...(to === '/admin' ? { onTouchStart: adminApi.prefetch, onFocus: adminApi.prefetch } : {})}
            className={({ isActive }) =>
              cn('flex min-h-14 items-center gap-3 rounded-xl px-3 py-2 transition-colors', isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-700 active:bg-slate-100')
            }
          >
            {({ isActive }) => (
              <>
                <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', isActive ? 'bg-cta text-white' : 'bg-brand-50 text-brand-600')}>
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{label}</span>
                  <span className="block truncate text-xs text-slate-500">{subtitle}</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {mode === 'supabase' && (
        <button
          type="button"
          onClick={() => void signOut()}
          disabled={signingOut}
          className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-red-200 text-sm font-semibold text-red-600 active:bg-red-50 disabled:opacity-60"
        >
          {signingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
          Đăng xuất
        </button>
      )}
    </Modal>
  )
}
