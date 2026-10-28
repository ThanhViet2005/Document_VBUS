import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { mockUser } from '../data/mock'
import { disablePush } from '../lib/push'
import { clearAllChatHistory } from '../lib/chatHistory'
import { normalizeEmail, validateEmail, validateFullName, validateNewPassword } from '../lib/authValidation'

export interface SignUpInput {
  email: string
  password: string
  fullName: string
  /** Tùy chọn: trigger handle_new_user() bỏ qua nếu sai định dạng */
  studentCode?: string
}

interface AuthState {
  /** demo: chưa cấu hình Supabase, dùng dữ liệu mẫu */
  mode: 'demo' | 'supabase'
  loading: boolean
  userId: string | null
  email: string | null
  signIn: (email: string, password: string) => Promise<void>
  /** Trả về true nếu cần xác nhận email trước khi đăng nhập */
  signUp: (input: SignUpInput) => Promise<boolean>
  /** returnTo: đường dẫn quay lại sau khi Google xác thực xong */
  signInWithGoogle: (returnTo?: string) => Promise<void>
  signOut: () => Promise<void>
  /** Tài khoản đã có mật khẩu (đăng ký bằng email). false = chỉ đăng nhập bằng Google */
  hasPassword: boolean
  /** Đổi mật khẩu. current = mật khẩu hiện tại (bắt buộc khi hasPassword), dùng để xác minh lại chủ tài khoản */
  changePassword: (current: string | null, next: string) => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

function translateAuthError(message: string): string {
  if (/invalid login credentials/i.test(message)) return 'Email hoặc mật khẩu không đúng.'
  if (/banned/i.test(message)) return 'Tài khoản đã bị quản trị viên khóa. Liên hệ quản trị viên để được hỗ trợ.'
  if (/email không hợp lệ/i.test(message)) return 'Email không đúng định dạng.'
  // GoTrue che lỗi thật của trigger trên auth.users. Email đã qua kiểm tra đuôi FPT ở form,
  // nên lỗi này là do máy chủ (vd: thiếu migration), không phải do người dùng nhập sai.
  if (/database error saving new user/i.test(message)) return 'Máy chủ chưa tạo được tài khoản. Vui lòng thử lại sau hoặc báo nhóm phát triển.'
  if (/failed to fetch|network/i.test(message)) return 'Không kết nối được máy chủ. Kiểm tra mạng và thử lại.'
  if (/email not confirmed/i.test(message)) return 'Bạn cần xác nhận email trước khi đăng nhập.'
  if (/already registered/i.test(message)) return 'Email này đã được đăng ký.'
  if (/password should be at least/i.test(message)) return 'Mật khẩu phải có ít nhất 6 ký tự.'
  if (/rate limit/i.test(message)) return 'Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút.'
  if (/different from the old password|same.password/i.test(message)) return 'Mật khẩu mới phải khác mật khẩu hiện tại.'
  if (/reauthenticat/i.test(message)) return 'Vì lý do bảo mật, hãy đăng xuất rồi đăng nhập lại trước khi đổi mật khẩu.'
  if (/weak.password|password is known to be weak/i.test(message)) return 'Mật khẩu quá dễ đoán, hãy chọn mật khẩu khác.'
  return message
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(isSupabaseConfigured)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  // Validation được kiểm tra lại ở đây (không chỉ ở form) để mọi lời gọi đều phải qua cùng một luật.
  const signIn = useCallback(async (email: string, password: string) => {
    const invalid = validateEmail(email) ?? (password ? null : 'Vui lòng nhập mật khẩu')
    if (invalid) throw new Error(invalid)
    const { error } = await supabase!.auth.signInWithPassword({ email: normalizeEmail(email), password })
    if (error) throw new Error(translateAuthError(error.message))
  }, [])

  const signUp = useCallback(async ({ email, password, fullName, studentCode }: SignUpInput) => {
    const invalid = validateFullName(fullName) ?? validateEmail(email) ?? validateNewPassword(password)
    if (invalid) throw new Error(invalid)
    const { data, error } = await supabase!.auth.signUp({
      email: normalizeEmail(email),
      password,
      options: {
        // Trigger handle_new_user() đọc metadata này để tạo hồ sơ public.users
        data: { full_name: fullName.trim().replace(/\s+/g, ' '), student_code: (studentCode ?? '').trim() },
        emailRedirectTo: window.location.origin,
      },
    })
    if (error) throw new Error(translateAuthError(error.message))
    // Khi bật "Confirm email", Supabase không báo lỗi với email đã tồn tại (chống dò email)
    // mà trả về user không có identity nào → báo cho người dùng đăng nhập thay vì chờ email không bao giờ đến.
    if (data.user && data.user.identities?.length === 0) throw new Error('Email này đã được đăng ký. Hãy đăng nhập.')
    return !data.session
  }, [])

  const signInWithGoogle = useCallback(async (returnTo = '/') => {
    // Chỉ chấp nhận đường dẫn nội bộ để tránh open redirect
    const path = returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/'
    const { error } = await supabase!.auth.signInWithOAuth({
      provider: 'google',
      // Mọi tài khoản Google. prompt=select_account: luôn cho chọn tài khoản (máy có nhiều Gmail / máy dùng chung)
      options: { redirectTo: `${window.location.origin}${path}`, queryParams: { prompt: 'select_account' } },
    })
    if (error) throw new Error(translateAuthError(error.message))
  }, [])

  const email = session?.user.email ?? null
  // Có danh tính "email" = đã đặt mật khẩu; tài khoản chỉ có Google thì chưa có mật khẩu để đổi
  const hasPassword = Boolean(session?.user.identities?.some((i) => i.provider === 'email') ?? session?.user.app_metadata.providers?.includes('email'))

  const changePassword = useCallback(
    async (current: string | null, next: string) => {
      const invalid = validateNewPassword(next)
      if (invalid) throw new Error(invalid)
      if (!email) throw new Error('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.')
      if (hasPassword) {
        if (!current) throw new Error('Vui lòng nhập mật khẩu hiện tại')
        if (current === next) throw new Error('Mật khẩu mới phải khác mật khẩu hiện tại.')
        // Xác minh lại chủ tài khoản: máy đang mở sẵn UniPlan cũng không đổi được mật khẩu nếu không biết mật khẩu cũ
        const { error } = await supabase!.auth.signInWithPassword({ email, password: current })
        if (error) throw new Error(/invalid login credentials/i.test(error.message) ? 'Mật khẩu hiện tại không đúng.' : translateAuthError(error.message))
      }
      const { error } = await supabase!.auth.updateUser({ password: next })
      if (error) throw new Error(translateAuthError(error.message))
    },
    [email, hasPassword],
  )

  const signOut = useCallback(async () => {
    // Hủy Web Push trên thiết bị TRƯỚC khi mất phiên (cần phiên để xóa đăng ký qua RLS):
    // máy dùng chung không được tiếp tục nhận nhắc nhở mang nội dung deadline của người vừa đăng xuất.
    // Tối đa 3 giây, lỗi cũng không chặn việc đăng xuất.
    await Promise.race([disablePush().catch(() => {}), new Promise((r) => setTimeout(r, 3000))])
    // Thu hồi phiên trên máy chủ. Kể cả khi request lỗi (mất mạng), supabase-js vẫn xóa phiên trên thiết bị,
    // nên người dùng luôn được đăng xuất (đã kiểm chứng trong E2E "mất mạng khi gọi logout").
    await supabase?.auth.signOut()
    // Lịch sử chat AI lưu trên thiết bị: xóa để người dùng sau trên cùng máy không đọc được
    clearAllChatHistory()
  }, [])

  const value = useMemo<AuthState>(() => {
    if (!isSupabaseConfigured) {
      const noop = async () => { }
      const changePassword = async () => {
        throw new Error('Bản demo không dùng tài khoản thật nên không đổi được mật khẩu.')
      }
      return { mode: 'demo', loading: false, userId: mockUser.id, email: mockUser.email, signIn: noop, signUp: async () => false, signInWithGoogle: noop, signOut: noop, hasPassword: true, changePassword }
    }
    return {
      mode: 'supabase',
      loading,
      userId: session?.user.id ?? null,
      email: session?.user.email ?? null,
      signIn,
      signUp,
      signInWithGoogle,
      signOut,
      hasPassword,
      changePassword,
    }
  }, [loading, session, signIn, signUp, signInWithGoogle, signOut, hasPassword, changePassword])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth phải được dùng bên trong <AuthProvider>')
  return ctx
}
