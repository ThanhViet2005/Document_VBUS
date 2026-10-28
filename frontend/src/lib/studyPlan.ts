// Logic Kế hoạch học: tìm giờ trống (tránh giờ học trên lớp & buổi tự học khác) và gợi ý buổi học
// dựa trên kỳ thi / deadline sắp tới. Toàn bộ là hàm thuần để dễ kiểm thử.
import type { Course, Deadline, Exam, Schedule, StudySession } from '../types'
import { addDays, daysBetween, isoDayOfWeek, startOfDay, toMinutes } from './date'
import { occursOn } from './schedule'

export interface Interval {
  start: number // epoch ms
  end: number
}

const MIN = 60_000
/** Nghỉ tối thiểu giữa 2 hoạt động (phút) */
const BUFFER_MIN = 15
/** Bước dò giờ trống (phút) */
const STEP_MIN = 15
/** Gợi ý tối đa hiển thị */
const MAX_SUGGESTIONS = 6
/** Xét kỳ thi trong N ngày tới / deadline trong N ngày tới */
const EXAM_HORIZON_DAYS = 21
const DEADLINE_HORIZON_DAYS = 7

/** Số buổi ôn nên có trước mỗi loại kỳ thi */
export const TARGET_REVIEW_SESSIONS: Record<Exam['examType'], number> = { FE: 3, PE: 2 }

/** Khung giờ ưu tiên để tự học, theo thứ tự ưu tiên (giờ địa phương) */
const WEEKDAY_WINDOWS: [string, string][] = [
  ['19:00', '22:30'],
  ['13:00', '17:30'],
  ['07:30', '11:45'],
]
const WEEKEND_WINDOWS: [string, string][] = [
  ['08:00', '11:30'],
  ['14:00', '17:30'],
  ['19:00', '22:00'],
]

function at(day: Date, hhmm: string): number {
  const d = startOfDay(day)
  return d.getTime() + toMinutes(hhmm) * MIN
}

/** Giờ học trên lớp trong ngày (theo thời khóa biểu lặp tuần) */
export function classIntervals(day: Date, schedules: Schedule[]): Interval[] {
  const dow = isoDayOfWeek(day)
  return schedules.filter((s) => occursOn(s, day, dow)).map((s) => ({ start: at(day, s.startTime), end: at(day, s.endTime) }))
}

export function sessionIntervals(sessions: Pick<StudySession, 'startAt' | 'endAt'>[]): Interval[] {
  return sessions.map((s) => ({ start: new Date(s.startAt).getTime(), end: new Date(s.endAt).getTime() }))
}

const overlaps = (a: Interval, b: Interval, bufferMs: number) => a.start < b.end + bufferMs && b.start < a.end + bufferMs

/**
 * Tìm khung giờ trống sớm nhất (theo thứ tự ưu tiên khung giờ trong ngày) từ notBefore đến trước notAfter.
 * Trả null nếu không còn chỗ.
 */
export function findFreeSlot(opts: {
  durationMin: number
  busy: Interval[]
  schedules: Schedule[]
  notBefore: number
  notAfter: number
  maxDays?: number
  /** true: lấy giờ trống sớm nhất theo thời gian (bỏ qua thứ tự ưu tiên khung giờ), dùng cho việc đã trễ hạn */
  earliest?: boolean
}): Interval | null {
  const { durationMin, busy, schedules, notBefore, notAfter } = opts
  const duration = durationMin * MIN
  const buffer = BUFFER_MIN * MIN
  const step = STEP_MIN * MIN
  const maxDays = opts.maxDays ?? 30

  for (let i = 0; i <= maxDays; i++) {
    const day = addDays(new Date(notBefore), i)
    if (day.getTime() > notAfter) break
    const dayBusy = [...busy, ...classIntervals(day, schedules)]
    const preferred = isoDayOfWeek(day) >= 6 ? WEEKEND_WINDOWS : WEEKDAY_WINDOWS
    const windows = opts.earliest ? [...preferred].sort((a, b) => toMinutes(a[0]) - toMinutes(b[0])) : preferred

    for (const [from, to] of windows) {
      const winEnd = at(day, to)
      // Làm tròn lên mốc 15 phút
      let start = Math.max(at(day, from), Math.ceil(notBefore / step) * step)
      for (; start + duration <= winEnd && start + duration <= notAfter; start += step) {
        const slot = { start, end: start + duration }
        if (!dayBusy.some((b) => overlaps(slot, b, buffer))) return slot
      }
    }
  }
  return null
}

export interface Suggestion {
  key: string
  title: string
  reason: string
  courseId: string | null
  deadlineId: string | null
  examId: string | null
  startAt: string
  endAt: string
  /** Không xếp được trước hạn → đặt ở giờ trống gần nhất */
  late: boolean
  urgent: boolean
}

/** Số ngày lịch (hôm nay = 0, ngày mai = 1), không làm tròn theo giờ */
const daysUntil = (iso: string, now: number) => daysBetween(new Date(now), new Date(iso))

/**
 * Gợi ý buổi học:
 *  - Kỳ thi trong 21 ngày mà số buổi ôn đã lên kế hoạch (chưa diễn ra hoặc đã học) < mục tiêu → gợi ý 1 buổi ôn 90 phút.
 *  - Deadline chưa xong trong 7 ngày (kể cả quá hạn) chưa có buổi làm nào sắp tới → gợi ý 1 buổi theo độ ưu tiên.
 * Các gợi ý không chồng lên nhau, lên lớp hay buổi tự học đã có.
 */
export function suggestStudySessions(input: {
  now: Date
  exams: Exam[]
  deadlines: Deadline[]
  sessions: StudySession[]
  schedules: Schedule[]
  courseById: (id: string | null) => Course | undefined
}): Suggestion[] {
  const now = input.now.getTime()
  const busy = sessionIntervals(input.sessions.filter((s) => new Date(s.endAt).getTime() > now))
  const relevant = (s: StudySession) => s.isDone || new Date(s.endAt).getTime() > now

  type Need = Omit<Suggestion, 'startAt' | 'endAt' | 'late'> & {
    durationMin: number
    dueAt: number
    /** Kỳ thi: mốc cứng, không bao giờ gợi ý sau thời điểm này (ôn sau khi thi là vô nghĩa) */
    hardStop?: number
  }
  const needs: Need[] = []

  for (const exam of input.exams) {
    const examAt = new Date(exam.examDate).getTime()
    const days = daysUntil(exam.examDate, now)
    if (examAt <= now || days > EXAM_HORIZON_DAYS) continue
    const planned = input.sessions.filter((s) => s.examId === exam.id && relevant(s)).length
    const target = TARGET_REVIEW_SESSIONS[exam.examType]
    if (planned >= target) continue
    const code = input.courseById(exam.courseId)?.code ?? ''
    needs.push({
      key: `exam:${exam.id}:${planned}`,
      title: `Ôn thi ${exam.examType} ${code}`.trim(),
      reason: `${exam.examType} ${days === 0 ? 'hôm nay' : days === 1 ? 'ngày mai' : `còn ${days} ngày`} · đã có ${planned}/${target} buổi ôn`,
      courseId: exam.courseId,
      deadlineId: null,
      examId: exam.id,
      urgent: days <= 3,
      durationMin: 90,
      // Lý tưởng: ôn xong trước giờ thi ít nhất 12 tiếng
      dueAt: examAt - 12 * 60 * MIN,
      hardStop: examAt - 60 * MIN,
    })
  }

  for (const d of input.deadlines) {
    if (d.status === 'done') continue
    const days = daysUntil(d.dueDate, now)
    if (days > DEADLINE_HORIZON_DAYS) continue
    if (input.sessions.some((s) => s.deadlineId === d.id && relevant(s))) continue
    const overdue = new Date(d.dueDate).getTime() <= now
    needs.push({
      key: `deadline:${d.id}`,
      title: `Làm: ${d.title}`.slice(0, 200),
      reason: overdue ? 'Đã quá hạn, nên xử lý sớm' : days === 0 ? 'Hạn hôm nay' : days === 1 ? 'Hạn ngày mai' : `Hạn còn ${days} ngày`,
      courseId: d.courseId,
      deadlineId: d.id,
      examId: null,
      urgent: overdue || days <= 1,
      durationMin: d.priority === 'high' ? 120 : d.priority === 'medium' ? 90 : 60,
      dueAt: new Date(d.dueDate).getTime(),
    })
  }

  // Việc gấp xếp trước để giành giờ trống sớm
  needs.sort((a, b) => a.dueAt - b.dueAt)

  const out: Suggestion[] = []
  for (const need of needs.slice(0, MAX_SUGGESTIONS)) {
    const base = { durationMin: need.durationMin, busy, schedules: input.schedules, notBefore: now }
    let slot = need.dueAt > now ? findFreeSlot({ ...base, notAfter: need.dueAt }) : null
    let late = false
    if (!slot && need.hardStop !== undefined) {
      // Kỳ thi: nới tới 1 tiếng trước giờ thi, rồi rút buổi ôn còn 45 phút; vẫn không có chỗ thì bỏ qua
      slot =
        findFreeSlot({ ...base, notAfter: need.hardStop, earliest: true }) ??
        findFreeSlot({ ...base, durationMin: 45, notAfter: need.hardStop, earliest: true })
    } else if (!slot) {
      // Deadline không kịp trước hạn → làm sớm nhất có thể
      slot = findFreeSlot({ ...base, notAfter: now + 14 * 24 * 60 * MIN, earliest: true })
      late = true
    }
    if (!slot) continue
    busy.push(slot)
    const { durationMin: _d, dueAt: _due, hardStop: _stop, ...rest } = need
    out.push({ ...rest, startAt: new Date(slot.start).toISOString(), endAt: new Date(slot.end).toISOString(), late })
  }
  return out
}

export interface WeekStats {
  plannedMin: number
  doneMin: number
  sessionCount: number
  doneCount: number
  byCourse: { courseId: string | null; minutes: number; doneMinutes: number }[]
}

export function sessionMinutes(s: Pick<StudySession, 'startAt' | 'endAt'>): number {
  return Math.round((new Date(s.endAt).getTime() - new Date(s.startAt).getTime()) / MIN)
}

/** Thống kê các buổi học bắt đầu trong tuần [weekStart, weekStart + 7 ngày) */
export function weekStats(sessions: StudySession[], weekStart: Date): WeekStats {
  const from = startOfDay(weekStart).getTime()
  const to = addDays(weekStart, 7).getTime()
  const inWeek = sessions.filter((s) => {
    const t = new Date(s.startAt).getTime()
    return t >= from && t < to
  })
  const map = new Map<string | null, { minutes: number; doneMinutes: number }>()
  let plannedMin = 0
  let doneMin = 0
  for (const s of inWeek) {
    const m = sessionMinutes(s)
    plannedMin += m
    if (s.isDone) doneMin += m
    const entry = map.get(s.courseId) ?? { minutes: 0, doneMinutes: 0 }
    entry.minutes += m
    if (s.isDone) entry.doneMinutes += m
    map.set(s.courseId, entry)
  }
  return {
    plannedMin,
    doneMin,
    sessionCount: inWeek.length,
    doneCount: inWeek.filter((s) => s.isDone).length,
    byCourse: [...map.entries()].map(([courseId, v]) => ({ courseId, ...v })).sort((a, b) => b.minutes - a.minutes),
  }
}

export function formatMinutes(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m} phút`
  return m ? `${h}g${String(m).padStart(2, '0')}` : `${h} giờ`
}
