import { useEffect, useRef } from 'react'
import { useAppData } from '../store/AppData'
import { useToast } from '../components/ui/Toast'
import { computeReminders, reminderStore, URGENT_KINDS } from './reminders'
import { showLocalNotification } from './push'
import { useNotifyEnabled } from './notifyPref'
import { useReminderKinds } from './reminderPrefs'
import { useAuth } from '../store/Auth'

const CHECK_EVERY_MS = 60_000
const MAX_TOASTS = 3

/**
 * Kiểm tra mỗi phút (và khi quay lại tab): deadline tới một mốc người dùng đã chọn (Cài đặt) → toast trong app
 * + thông báo hệ điều hành (nếu đã cho phép; cùng tag với Web Push nên không hiện trùng).
 * Mỗi mốc của mỗi deadline chỉ nhắc 1 lần trên thiết bị. Tắt được bằng công tắc trong Cài đặt.
 */
export function useDeadlineReminders() {
  const { deadlines, user, courseById, status } = useAppData()
  const toast = useToast()
  const enabled = useNotifyEnabled(user.id)
  const { mode } = useAuth()
  const [kinds] = useReminderKinds(user.id, mode === 'supabase')
  const latest = useRef({ deadlines, courseById, kinds })
  latest.current = { deadlines, courseById, kinds }

  useEffect(() => {
    // Người dùng tắt "Nhắc deadline" trong Cài đặt → không nhắc (chuông thông báo vẫn liệt kê)
    if (status !== 'ready' || !user.id || !enabled) return
    const store = reminderStore(user.id)

    const check = () => {
      const fresh = computeReminders(latest.current.deadlines, new Date(), latest.current.courseById, latest.current.kinds).filter((r) => !store.has(r.key))
      if (fresh.length === 0) return
      store.add(fresh.map((r) => r.key))

      if (fresh.length > MAX_TOASTS) {
        toast.info(`Bạn có ${fresh.length} deadline sắp đến hạn. Mở chuông thông báo để xem.`)
      } else {
        // Gấp (15 phút / 1 giờ / đến hạn) hiện màu đỏ, còn lại màu xanh thông tin
        for (const r of fresh) (URGENT_KINDS.includes(r.kind) ? toast.error : toast.info)(`${r.title} (${r.body})`)
      }
      for (const r of fresh) void showLocalNotification({ title: r.title, body: r.body, tag: r.tag, url: r.url })
    }

    check()
    const id = setInterval(check, CHECK_EVERY_MS)
    const onVisible = () => document.visibilityState === 'visible' && check()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [status, user.id, toast, enabled])
}
