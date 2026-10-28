import { Lock, LogOut } from 'lucide-react'
import { useSignOut } from '../../lib/useSignOut'
import { Button } from '../ui/Form'

/**
 * Hiện khi tài khoản bị admin khóa mà phiên đăng nhập cũ vẫn còn (access token chưa hết hạn).
 * Database đã chặn mọi dữ liệu (policy RESTRICTIVE), nên ở đây chỉ báo lý do và cho đăng xuất.
 */
export default function LockedScreen({ reason }: { reason?: string | null }) {
  const { signOut, busy } = useSignOut()
  return (
    <main className="flex min-h-full items-center justify-center bg-page px-4 py-10">
      <section className="w-full max-w-md rounded-3xl border border-red-200 bg-surface p-8 text-center shadow-xl" role="alert">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 text-red-600">
          <Lock className="h-8 w-8" />
        </span>
        <h1 className="mt-5 text-2xl font-extrabold text-slate-900">Tài khoản đã bị khóa</h1>
        <p className="mt-2 text-sm text-slate-500">Quản trị viên đã tạm khóa tài khoản này. Dữ liệu của bạn vẫn được giữ nguyên và sẽ dùng lại được khi tài khoản được mở khóa.</p>
        {reason && (
          <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            <b>Lý do:</b> {reason}
          </p>
        )}
        <p className="mt-4 text-xs text-slate-500">Cần hỗ trợ? Liên hệ quản trị viên UniPlan hoặc phòng Công tác sinh viên.</p>
        <Button variant="secondary" onClick={() => void signOut()} busy={busy} className="mt-6 w-full">
          <LogOut className="h-4 w-4" /> Đăng xuất
        </Button>
      </section>
    </main>
  )
}
