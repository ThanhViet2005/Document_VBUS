import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useAuth } from '../../store/Auth'

/** Logo "G" nhiều màu theo hướng dẫn thương hiệu của Google (giữ nguyên màu ở cả giao diện sáng / tối) */
function GoogleLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}

/** Dịch lỗi Google / Supabase trả về trên URL sau khi quay lại từ trang đăng nhập Google */
function translateOAuthError(code: string, description: string): string {
  const text = `${code} ${description}`
  if (/access_denied|cancel/i.test(text)) return 'Bạn đã hủy đăng nhập bằng Google.'
  if (/provider is not enabled|unsupported provider/i.test(text)) return 'Đăng nhập bằng Google chưa được bật trên máy chủ. Vui lòng báo quản trị viên.'
  if (/banned/i.test(text)) return 'Tài khoản đã bị quản trị viên khóa. Liên hệ quản trị viên để được hỗ trợ.'
  if (/email không hợp lệ|database error saving new user/i.test(text)) return 'Không tạo được tài khoản từ email Google này. Vui lòng thử lại hoặc dùng email khác.'
  if (/redirect/i.test(text)) return 'Địa chỉ quay lại sau khi đăng nhập Google chưa được khai báo. Vui lòng báo quản trị viên.'
  return description || 'Đăng nhập bằng Google không thành công, vui lòng thử lại.'
}

/**
 * Lỗi đăng nhập Google nằm trên URL (?error=...&error_description=... hoặc #error=...).
 * Đọc 1 lần, rồi xóa khỏi thanh địa chỉ để tải lại trang không hiện lại lỗi cũ.
 */
export function useOAuthError(): string | null {
  const [error] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const code = params.get('error') ?? hash.get('error')
    if (!code) return null
    return translateOAuthError(code, params.get('error_description') ?? hash.get('error_description') ?? '')
  })
  useEffect(() => {
    if (error) window.history.replaceState(null, '', window.location.pathname)
  }, [error])
  return error
}

/**
 * Nút "Tiếp tục với Google": đăng nhập nhanh bằng mọi tài khoản Gmail / Google. Chưa có tài khoản thì Supabase tự tạo;
 * đã đăng ký bằng email + mật khẩu cùng địa chỉ thì Supabase tự gộp vào cùng 1 tài khoản.
 */
export default function GoogleButton({ returnTo = '/', onError }: { returnTo?: string; onError: (message: string) => void }) {
  const { mode, signInWithGoogle } = useAuth()
  const [busy, setBusy] = useState(false)
  const demo = mode === 'demo'

  async function onClick() {
    setBusy(true)
    try {
      // Trình duyệt chuyển sang trang Google; quay lại thì phiên đăng nhập được nhận tự động
      await signInWithGoogle(returnTo)
    } catch (e) {
      setBusy(false)
      onError(e instanceof Error ? e.message : 'Không mở được trang đăng nhập Google')
    }
  }

  return (
    <button
      type="button"
      onClick={() => void onClick()}
      disabled={busy || demo}
      title={demo ? 'Bản demo không đăng nhập bằng Google được' : undefined}
      className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-surface px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/20 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-sm"
    >
      {busy ? <Loader2 className="h-5 w-5 animate-spin text-slate-400" /> : <GoogleLogo className="h-5 w-5" />}
      {busy ? 'Đang chuyển tới Google…' : 'Tiếp tục với Google'}
    </button>
  )
}

/** Đường kẻ "hoặc" ngăn nút Google với form email */
export function AuthDivider() {
  return (
    <div className="my-5 flex items-center gap-3 text-xs font-medium uppercase tracking-wider text-slate-400" role="separator">
      <span className="h-px flex-1 bg-slate-200" />
      hoặc dùng email
      <span className="h-px flex-1 bg-slate-200" />
    </div>
  )
}
