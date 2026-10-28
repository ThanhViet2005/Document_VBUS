// Mốc nhắc deadline người dùng chọn (Cài đặt → Thông báo nhắc deadline).
// Lưu trên máy chủ (bảng reminder_prefs, migration 020) để Web Push nhắc đúng mốc cả khi đã đóng app,
// kèm bản sao trong localStorage để mở app là có ngay (và dùng cho bản demo / khi chưa chạy migration).
import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { fetchReminderKinds, saveReminderKinds } from '../services/api'
import { DEFAULT_REMINDER_KINDS, isReminderKind, type ReminderKind } from './reminders'

const key = (userId: string) => `uniplan.reminder-kinds.${userId}`
const EVENT = 'uniplan:reminder-kinds'

function readLocal(userId: string): ReminderKind[] {
  try {
    const v = JSON.parse(localStorage.getItem(key(userId)) ?? 'null')
    if (Array.isArray(v)) return v.filter(isReminderKind)
  } catch {
    // storage bị chặn / dữ liệu hỏng → mặc định
  }
  return DEFAULT_REMINDER_KINDS
}

/** Giữ cùng một mảng khi nội dung không đổi (useSyncExternalStore cần snapshot ổn định) */
const snapshots = new Map<string, { raw: string; value: ReminderKind[] }>()
function snapshot(userId: string): ReminderKind[] {
  const value = readLocal(userId)
  const raw = value.join(',')
  const prev = snapshots.get(userId)
  if (prev && prev.raw === raw) return prev.value
  snapshots.set(userId, { raw, value })
  return value
}

function writeLocal(userId: string, kinds: ReminderKind[]) {
  try {
    localStorage.setItem(key(userId), JSON.stringify(kinds))
  } catch {
    // không lưu được trên máy → vẫn có bản trên máy chủ
  }
  window.dispatchEvent(new Event(EVENT))
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange)
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener(EVENT, onChange)
    window.removeEventListener('storage', onChange)
  }
}

/**
 * [mốc đang bật, lưu(mốc mới)]. Có máy chủ (online = true): tải lựa chọn từ máy chủ khi mở app và lưu lên máy chủ khi đổi
 * (lưu lỗi → trả về lựa chọn cũ và ném lỗi để giao diện báo).
 */
export function useReminderKinds(userId: string, online: boolean): [ReminderKind[], (kinds: ReminderKind[]) => Promise<void>] {
  const kinds = useSyncExternalStore(subscribe, () => snapshot(userId), () => DEFAULT_REMINDER_KINDS)

  useEffect(() => {
    if (!online || !userId) return
    let alive = true
    fetchReminderKinds(userId)
      .then((server) => {
        if (alive && server) writeLocal(userId, server.filter(isReminderKind))
      })
      // Chưa chạy migration 020 / mất mạng: dùng bản trên máy
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [userId, online])

  const save = useCallback(
    async (next: ReminderKind[]) => {
      const prev = readLocal(userId)
      writeLocal(userId, next)
      if (!online) return
      try {
        await saveReminderKinds(userId, next)
      } catch (e) {
        writeLocal(userId, prev)
        throw e
      }
    },
    [userId, online],
  )

  return [kinds, save]
}
