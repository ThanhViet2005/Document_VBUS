import type { Schedule } from '../types'
import type { ScheduleInput } from '../services/api'
import { addDays } from './date'

/** Ngày theo giờ máy dạng YYYY-MM-DD (so sánh chuỗi được với cột date của Postgres) */
export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Buổi học lặp tuần có diễn ra vào ngày này không: đúng thứ, trong khoảng bắt đầu – kết thúc, không bị bỏ */
export function occursOn(s: Schedule, date: Date, dayOfWeek: number): boolean {
  if (s.dayOfWeek !== dayOfWeek) return false
  const key = toDateKey(date)
  return (!s.startDate || key >= s.startDate) && (!s.endDate || key <= s.endDate) && !s.skipDates?.includes(key)
}

/** Buổi học chỉ diễn ra 1 lần (buổi đã dời riêng / học bù) */
export const isOneOff = (s: Schedule) => Boolean(s.startDate && s.startDate === s.endDate)

/** Phạm vi khi dời lịch, như Google Calendar */
export type MoveScope = 'one' | 'following' | 'all'

export interface MoveChange {
  dayOfWeek: number
  startTime: string
  endTime: string
}

/** Các lệnh ghi cần làm để dời lịch: sửa dòng hiện có và/hoặc tạo dòng mới */
export interface MovePlan {
  update: ScheduleInput
  create?: ScheduleInput
}

/**
 * Tính cách lưu khi dời 1 buổi của chuỗi lặp tuần.
 *  - one: bỏ buổi gốc (thêm vào skip_dates) + tạo buổi 1 lần ở ngày mới
 *  - following: chuỗi cũ kết thúc trước tuần của buổi gốc, chuỗi mới (giờ mới) bắt đầu từ tuần đó
 *  - all: sửa thẳng chuỗi lặp (mọi tuần, kể cả trước đây)
 * @param originDate ngày của buổi gốc đang được kéo
 * @param targetDate ngày được thả tới (có thể ở tuần khác)
 */
export function planMove(s: Schedule, scope: MoveScope, change: MoveChange, originDate: Date, targetDate: Date): MovePlan {
  const targetKey = toDateKey(targetDate)
  // Buổi 1 lần thì chỉ việc dời chính nó sang ngày mới
  if (isOneOff(s)) return { update: { ...s, ...change, startDate: targetKey, endDate: targetKey } }

  const { id: _id, ...series } = s
  if (scope === 'one') {
    return {
      update: { ...s, skipDates: [...new Set([...(s.skipDates ?? []), toDateKey(originDate)])] },
      create: { ...series, ...change, startDate: targetKey, endDate: targetKey, skipDates: [] },
    }
  }

  if (scope === 'following') {
    // Thứ 2 của tuần có buổi gốc: chuỗi cũ dừng hôm Chủ nhật trước đó, chuỗi mới bắt đầu từ đây
    const weekStart = addDays(originDate, -((originDate.getDay() + 6) % 7))
    const startKey = toDateKey(weekStart)
    const cutKey = toDateKey(addDays(weekStart, -1))
    // Không có buổi nào trước tuần này → giống "tất cả"
    if (!(s.startDate && s.startDate > cutKey)) {
      return {
        update: { ...s, endDate: cutKey, skipDates: (s.skipDates ?? []).filter((d) => d <= cutKey) },
        create: { ...series, ...change, startDate: startKey, endDate: s.endDate ?? null, skipDates: [] },
      }
    }
  }

  // Đổi thứ thì các ngày bỏ cũ (theo thứ cũ) không còn ý nghĩa. undefined = database chưa có cột → không gửi
  const skipDates = s.skipDates === undefined || s.dayOfWeek === change.dayOfWeek ? s.skipDates : []
  return { update: { ...s, ...change, skipDates } }
}
