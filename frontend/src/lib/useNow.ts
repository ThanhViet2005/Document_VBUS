import { useEffect, useState } from 'react'

/** Thời điểm hiện tại, tự cập nhật theo chu kỳ (dùng cho đồng hồ đếm ngược) */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

/** "Còn 3 ngày 4 giờ", "Còn 2 giờ 15 phút", "Đã diễn ra" */
export function countdownLabel(target: Date, now: Date): { text: string; urgent: boolean; past: boolean } {
  const ms = target.getTime() - now.getTime()
  if (ms <= 0) return { text: 'Đã diễn ra', urgent: false, past: true }
  const minutes = Math.floor(ms / 60_000)
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const mins = minutes % 60
  const text = days > 0 ? `Còn ${days} ngày ${hours} giờ` : hours > 0 ? `Còn ${hours} giờ ${mins} phút` : `Còn ${mins} phút`
  return { text, urgent: days < 3, past: false }
}
