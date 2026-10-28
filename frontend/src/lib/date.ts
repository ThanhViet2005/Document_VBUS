const DAY_MS = 24 * 60 * 60 * 1000

export function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export function isSameDay(a: Date, b: Date): boolean {
  return startOfDay(a).getTime() === startOfDay(b).getTime()
}

/** Thứ 2 của tuần chứa ngày d */
export function startOfWeek(d: Date): Date {
  const x = startOfDay(d)
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return x
}

export function addDays(d: Date, n: number): Date {
  const x = startOfDay(d)
  x.setDate(x.getDate() + n)
  return x
}

/** 1 = Thứ 2 ... 7 = Chủ nhật */
export function isoDayOfWeek(d: Date): number {
  return ((d.getDay() + 6) % 7) + 1
}

export function daysBetween(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY_MS)
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
}

/** Giờ chuẩn Việt Nam (Hà Nội, UTC+7, không có giờ mùa hè) */
export const VN_TIME_ZONE = 'Asia/Ho_Chi_Minh'

const vnHourFormat = new Intl.DateTimeFormat('en-GB', { timeZone: VN_TIME_ZONE, hour: '2-digit', hourCycle: 'h23' })

/** Giờ (0-23) hiện tại ở Việt Nam, không phụ thuộc múi giờ đang đặt trên thiết bị */
export function vietnamHour(now = new Date()): number {
  const hour = vnHourFormat.formatToParts(now).find((p) => p.type === 'hour')?.value
  return Number(hour ?? 0) % 24
}

/** Lời chào theo buổi trong ngày ở Việt Nam: sáng 5-11h, trưa 11-13h, chiều 13-18h, tối 18-5h */
export function greeting(now = new Date()): string {
  const h = vietnamHour(now)
  if (h >= 5 && h < 11) return 'Chào buổi sáng'
  if (h >= 11 && h < 13) return 'Chào buổi trưa'
  if (h >= 13 && h < 18) return 'Chào buổi chiều'
  return 'Chào buổi tối'
}

/** "Thứ Hai, 19 tháng 10" theo ngày ở Việt Nam */
export function formatVietnamDay(now = new Date()): string {
  return now.toLocaleDateString('vi-VN', { timeZone: VN_TIME_ZONE, weekday: 'long', day: 'numeric', month: 'long' })
}

export const WEEKDAY_SHORT = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']
export const WEEKDAY_LONG = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật']

/** Khung giờ (slot) học của FPT. Có thể nhập giờ tùy chỉnh nếu lớp học khác slot. */
export const FPT_SLOTS = [
  { label: 'Slot 1', start: '07:00', end: '09:15' },
  { label: 'Slot 2', start: '09:30', end: '11:45' },
  { label: 'Slot 3', start: '12:30', end: '14:45' },
  { label: 'Slot 4', start: '15:00', end: '17:15' },
  { label: 'Slot 5', start: '17:30', end: '19:45' },
  { label: 'Slot 6', start: '20:00', end: '22:15' },
]

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
