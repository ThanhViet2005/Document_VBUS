// Giao diện sáng / tối. Lựa chọn lưu theo THIẾT BỊ (không theo tài khoản) để trang đăng nhập cũng đúng giao diện.
// Logic áp dụng giống public/theme-init.js (chạy trước khi vẽ trang); sửa cả hai nơi khi đổi.
import { useSyncExternalStore } from 'react'

export type ThemePref = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

const KEY = 'uniplan.theme'
const EVENT = 'uniplan:theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch {
    // storage bị chặn → theo hệ thống
  }
  return 'system'
}

const systemPrefersDark = () => typeof window !== 'undefined' && window.matchMedia?.(DARK_QUERY).matches

export function resolveTheme(pref: ThemePref): ResolvedTheme {
  return pref === 'dark' || (pref === 'system' && systemPrefersDark()) ? 'dark' : 'light'
}

/** Đặt class "dark" trên <html>, color-scheme (thanh cuộn, ô chọn ngày, dropdown) và màu thanh trình duyệt trên điện thoại */
export function applyTheme(pref: ThemePref = getThemePref()): ResolvedTheme {
  const resolved = resolveTheme(pref)
  const root = document.documentElement
  root.classList.toggle('dark', resolved === 'dark')
  root.style.colorScheme = resolved
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#070c19' : '#f97316')
  return resolved
}

export function setThemePref(pref: ThemePref) {
  try {
    if (pref === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, pref)
  } catch {
    // không lưu được → chỉ có hiệu lực đến khi tải lại trang
  }
  applyTheme(pref)
  window.dispatchEvent(new Event(EVENT))
}

function subscribe(cb: () => void) {
  const mq = window.matchMedia?.(DARK_QUERY)
  const onSystem = () => {
    // Đang ở chế độ "Theo hệ thống" mà hệ điều hành đổi sáng / tối (vd: tự động theo giờ) → cập nhật ngay
    if (getThemePref() === 'system') applyTheme('system')
    cb()
  }
  mq?.addEventListener('change', onSystem)
  window.addEventListener(EVENT, cb)
  window.addEventListener('storage', onSystem) // đổi ở tab khác
  return () => {
    mq?.removeEventListener('change', onSystem)
    window.removeEventListener(EVENT, cb)
    window.removeEventListener('storage', onSystem)
  }
}

/** pref: lựa chọn của người dùng; theme: giao diện đang hiển thị (đã quy đổi "Theo hệ thống") */
export function useTheme(): { pref: ThemePref; theme: ResolvedTheme; setPref: (p: ThemePref) => void; toggle: () => void } {
  const pref = useSyncExternalStore(subscribe, getThemePref, () => 'system' as ThemePref)
  const theme = useSyncExternalStore(
    subscribe,
    () => resolveTheme(getThemePref()),
    () => 'light' as ResolvedTheme,
  )
  return {
    pref,
    theme,
    setPref: setThemePref,
    // Nút nhanh trên thanh trên cùng: đảo giao diện đang hiển thị và ghi nhớ lựa chọn rõ ràng
    toggle: () => setThemePref(theme === 'dark' ? 'light' : 'dark'),
  }
}
