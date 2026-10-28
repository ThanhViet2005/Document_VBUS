// Công tắc "Nhắc deadline" của người dùng trên thiết bị này.
// Trình duyệt không cho trang web tự thu hồi quyền thông báo, nên khi tắt ta ghi nhớ lựa chọn ở đây
// (và hủy Web Push) để app không hiện nhắc nhở nữa. Mặc định: bật.
import { useSyncExternalStore } from 'react'

const key = (userId: string) => `uniplan.notify.${userId}`
const EVENT = 'uniplan:notify-pref'

export function isNotifyEnabled(userId: string): boolean {
  try {
    return localStorage.getItem(key(userId)) !== 'off'
  } catch {
    return true
  }
}

export function setNotifyEnabled(userId: string, enabled: boolean) {
  try {
    if (enabled) localStorage.removeItem(key(userId))
    else localStorage.setItem(key(userId), 'off')
  } catch {
    // storage bị chặn → chỉ có hiệu lực đến khi tải lại trang
  }
  window.dispatchEvent(new Event(EVENT))
}

export function useNotifyEnabled(userId: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener(EVENT, cb)
      window.addEventListener('storage', cb)
      return () => {
        window.removeEventListener(EVENT, cb)
        window.removeEventListener('storage', cb)
      }
    },
    () => isNotifyEnabled(userId),
  )
}
