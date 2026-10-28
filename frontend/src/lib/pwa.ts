import { registerSW } from 'virtual:pwa-register'

/** Hỏi máy chủ có bản mới không: định kỳ + mỗi khi người dùng quay lại tab (tối đa 1 lần / phút) */
const UPDATE_EVERY_MS = 15 * 60_000
const MIN_GAP_MS = 60_000

/**
 * Chỉ bật Service Worker ở bản production chạy trong secure context (HTTPS của Vercel, hoặc localhost khi preview).
 * - Dev: gỡ SW cũ (nếu có) để tránh cache cũ che mất code mới.
 * - HTTP qua IP mạng LAN (vd: mở bản dev từ máy khác): trình duyệt không cho SW → app vẫn chạy bình thường, chỉ không cài/offline được.
 * - registerType 'autoUpdate': SW mới kích hoạt → trang tự tải lại. Tab mở sẵn nhiều giờ chỉ biết có bản mới khi được hỏi lại,
 *   nên kiểm tra định kỳ: deploy bản bảo trì (hoặc rollback về bản thường) là mọi tab đang mở tự chuyển theo, không cần F5.
 */
export function setupPWA(): void {
  if (!('serviceWorker' in navigator)) return

  if (!import.meta.env.PROD) {
    void navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => void r.unregister()))
    return
  }
  if (!window.isSecureContext) return

  registerSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
      if (!registration) return
      let last = Date.now()
      const check = () => {
        if (Date.now() - last < MIN_GAP_MS || !navigator.onLine) return
        last = Date.now()
        void registration.update().catch(() => {})
      }
      setInterval(() => {
        last = 0
        check()
      }, UPDATE_EVERY_MS)
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check())
      window.addEventListener('online', check)
    },
  })
}
