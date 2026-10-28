// Nhắc deadline ngay trong app (khi đang mở UniPlan): toast + thông báo hệ điều hành.
// Bổ sung cho Web Push từ máy chủ; dùng chung tag "deadline-<id>-<mốc>" nên không hiện trùng.
// Mốc do người dùng chọn (Cài đặt), cách chọn mốc khớp due_reminders() (migration 020).
import type { Course, Deadline } from '../types'

export type ReminderKind = '3d' | '24h' | '3h' | '1h' | '15m' | 'due'

export interface Reminder {
  key: string
  deadlineId: string
  kind: ReminderKind
  title: string
  body: string
  tag: string
  url: string
}

const MIN = 60_000
/** Vừa đến hạn trong vòng 15 phút thì báo "Đã đến hạn" (mở app muộn hơn thì thôi, tránh báo cũ). Khớp máy chủ */
const DUE_GRACE_MIN = 15
const HOUR = 60 * MIN
const DAY = 24 * HOUR

/** Các mốc người dùng chọn được (Cài đặt → Thông báo), xếp từ xa đến gần hạn. lead = nhắc trước hạn bao lâu */
export const REMINDER_OPTIONS: { kind: ReminderKind; label: string; lead: number }[] = [
  { kind: '3d', label: 'Trước 3 ngày', lead: 3 * DAY },
  { kind: '24h', label: 'Trước 1 ngày', lead: DAY },
  { kind: '3h', label: 'Trước 3 giờ', lead: 3 * HOUR },
  { kind: '1h', label: 'Trước 1 giờ', lead: HOUR },
  { kind: '15m', label: 'Trước 15 phút', lead: 15 * MIN },
  { kind: 'due', label: 'Đúng giờ hạn', lead: 0 },
]

/** Chưa chọn gì → trước 1 ngày + trước 1 giờ (khớp default của bảng reminder_prefs và due_reminders, migration 010) */
export const DEFAULT_REMINDER_KINDS: ReminderKind[] = ['24h', '1h']

export const isReminderKind = (v: unknown): v is ReminderKind => REMINDER_OPTIONS.some((o) => o.kind === v)

/** Thứ tự ưu tiên khi hiện nhiều nhắc cùng lúc: gấp nhất trước */
const ORDER: ReminderKind[] = ['due', '15m', '1h', '3h', '24h', '3d']

/** Mốc gấp (hiện toast đỏ) */
export const URGENT_KINDS: ReminderKind[] = ['due', '15m', '1h']

/** "Còn 2 ngày 5 giờ" / "Còn 20 giờ" / "Còn 35 phút" (khớp remaining() của Edge Function send-reminders) */
export function remainingText(ms: number): string {
  const min = Math.max(1, Math.round(ms / MIN))
  if (min < 60) return `Còn ${min} phút`
  const h = Math.round(min / 60)
  if (h < 24) return `Còn ${h} giờ`
  const d = Math.floor(h / 24)
  return `Còn ${d} ngày${h % 24 ? ` ${h % 24} giờ` : ''}`
}

const ICON: Record<ReminderKind, string> = { due: '🔔 Đã đến hạn', '15m': '⏰', '1h': '⏰', '3h': '⏳', '24h': '⏳', '3d': '📅' }

function formatDue(iso: string): string {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())} ${p(d.getDate())}/${p(d.getMonth() + 1)}`
}

/**
 * Các nhắc nhở đang hiệu lực tại thời điểm now. Mỗi deadline tối đa 1 mốc: mốc GẦN NHẤT trong các mốc đã bật mà thời gian còn lại
 * đã lọt vào (vd bật 1 ngày + 15 phút, còn 5 giờ → mốc 1 ngày). Không gửi bù mốc đã qua. Khớp due_reminders() trên máy chủ.
 */
export function computeReminders(
  deadlines: Deadline[],
  now: Date,
  courseById: (id: string | null) => Course | undefined,
  kinds: readonly ReminderKind[] = DEFAULT_REMINDER_KINDS,
): Reminder[] {
  const t = now.getTime()
  // Mốc đã bật (trừ "đúng giờ hạn"), gần hạn nhất trước
  const before = REMINDER_OPTIONS.filter((o) => o.kind !== 'due' && kinds.includes(o.kind)).sort((a, b) => a.lead - b.lead)
  const out: Reminder[] = []
  for (const d of deadlines) {
    if (d.status === 'done') continue
    const ms = new Date(d.dueDate).getTime() - t
    let kind: ReminderKind | null = null
    if (ms <= 0) kind = ms > -DUE_GRACE_MIN * MIN && kinds.includes('due') ? 'due' : null
    else kind = before.find((o) => ms <= o.lead)?.kind ?? null
    if (!kind) continue

    const code = courseById(d.courseId)?.code
    const title = kind === 'due' ? `${ICON.due}: ${d.title}` : `${ICON[kind]} ${remainingText(ms)}: ${d.title}`
    out.push({
      key: `${d.id}:${kind}`,
      deadlineId: d.id,
      kind,
      title,
      body: `${code ? `${code} · ` : ''}Hạn ${formatDue(d.dueDate)}`,
      tag: `deadline-${d.id}-${kind}`,
      url: `/tasks?task=${d.id}`,
    })
  }
  return out.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind))
}

/** Bộ nhớ "đã nhắc" trên thiết bị (để không nhắc lại mỗi lần mở app) */
export function reminderStore(userId: string) {
  const key = `uniplan.reminded.${userId}`
  const load = (): string[] => {
    try {
      const v = JSON.parse(localStorage.getItem(key) ?? '[]')
      return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
    } catch {
      return []
    }
  }
  return {
    has: (k: string) => load().includes(k),
    add: (keys: string[]) => {
      try {
        // Giữ tối đa 300 mục gần nhất
        localStorage.setItem(key, JSON.stringify([...new Set([...load(), ...keys])].slice(-300)))
      } catch {
        // storage bị chặn → có thể nhắc lại sau khi tải lại trang, chấp nhận được
      }
    },
  }
}
