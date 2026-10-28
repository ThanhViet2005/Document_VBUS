// Hiểu câu tiếng Việt đơn giản để tạo nhanh deadline, KHÔNG cần AI.
// Dùng khi chưa cấu hình Groq / chế độ demo / AI lỗi. Ví dụ:
//   "Lab 5 PRO192 thứ 6 23h59 gấp"
//   "nộp assignment MKT202 ngày mai 9h tối"
//   "ôn tập MAD101 20/10"
import type { Course, Priority, TaskType } from '../types'
import { addDays, isoDayOfWeek } from './date'

export interface DeadlineDraft {
  title: string
  courseId: string | null
  taskType: TaskType
  /** ISO datetime */
  dueDate: string
  priority: Priority
  subtasks: string[]
  notes: string
}

// \b của JS không hiểu chữ có dấu → tự định nghĩa ranh giới từ
const B = '(?<![\\p{L}\\p{N}])'
const E = '(?![\\p{L}\\p{N}])'
const re = (src: string) => new RegExp(`${B}(?:${src})${E}`, 'iu')

const WEEKDAY_WORDS: Record<string, number> = {
  hai: 1, '2': 1, ba: 2, '3': 2, 'tư': 3, tu: 3, '4': 3, 'năm': 4, nam: 4, '5': 4, 'sáu': 5, sau: 5, '6': 5, 'bảy': 6, bay: 6, '7': 6,
}

const DATE_RULES: { pattern: RegExp; resolve: (m: RegExpMatchArray, now: Date) => Date | null }[] = [
  { pattern: re('hôm nay|hom nay|hnay|today'), resolve: (_m, now) => addDays(now, 0) },
  { pattern: re('ngày kia|ngay kia|ngày mốt|ngay mot|mốt'), resolve: (_m, now) => addDays(now, 2) },
  { pattern: re('(?:ngày |ngay )?mai|tomorrow|tmr'), resolve: (_m, now) => addDays(now, 1) },
  { pattern: re('(\\d{1,2}) ngày nữa|(\\d{1,2}) ngay nua'), resolve: (m, now) => addDays(now, Number(m[1] ?? m[2])) },
  {
    // 20/10, 20-10-2026, 5.11
    pattern: /(?<!\d)(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?(?!\d)/u,
    resolve: (m, now) => {
      const day = Number(m[1])
      const month = Number(m[2]) - 1
      let year = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : now.getFullYear()
      let d = new Date(year, month, day)
      if (d.getMonth() !== month || d.getDate() !== day) return null // 31/02...
      // Không ghi năm mà ngày đã qua → hiểu là năm sau
      if (!m[3] && d.getTime() < addDays(now, -1).getTime()) {
        year += 1
        d = new Date(year, month, day)
      }
      return d
    },
  },
  {
    // thứ 6, thứ sáu, t6, chủ nhật, cn (+ "tuần sau")
    pattern: re('(?:thứ|thu) (2|3|4|5|6|7|hai|ba|tư|tu|năm|nam|sáu|sau|bảy|bay)|t([2-7])|(chủ nhật|chu nhat|cn)'),
    resolve: (m, now) => {
      const target = m[3] ? 7 : WEEKDAY_WORDS[(m[1] ?? m[2]).toLowerCase()]
      if (!target) return null
      // Lần tới của thứ đó; trùng thứ hôm nay → hôm nay ("tuần sau" cộng thêm 7 ngày ở dưới)
      return addDays(now, (target - isoDayOfWeek(now) + 7) % 7)
    },
  },
]

const NEXT_WEEK = re('tuần sau|tuan sau|tuần tới|tuan toi')

// 23h59, 9h, 9 giờ tối, 21:30, 7h30 sáng
const TIME = new RegExp(
  `${B}(\\d{1,2})\\s*(?:h|giờ|gio|:)\\s*(\\d{1,2})?(?:\\s*(?:phút|phut|p))?(?:\\s*(sáng|sang|trưa|trua|chiều|chieu|tối|toi|đêm|dem|am|pm))?${E}`,
  'iu',
)

const TYPE_RULES: [RegExp, TaskType][] = [
  [re('lab'), 'lab'],
  [re('nhóm|nhom|group|project|dự án|du an'), 'group_project'],
  [re('practical|thực hành|thuc hanh|pt'), 'practical'],
  [re('ôn tập|on tap|ôn|revision|review'), 'revision'],
  [re('assignment|ass|asm|bài tập|bai tap|btvn|essay|quiz|report|báo cáo|bao cao'), 'assignment'],
]

const HIGH = re('gấp|gap|khẩn|khan|quan trọng|quan trong|ưu tiên cao|uu tien cao|urgent|important|!!')
const LOW = re('ưu tiên thấp|uu tien thap|không gấp|khong gap|thong thả|thong tha|low')
const MEDIUM = re('ưu tiên trung bình|uu tien trung binh|trung bình|trung binh')

// Từ đệm cần bỏ khỏi tiêu đề
const FILLERS = re(
  'thêm|them|tạo|tao|add|nhắc|nhac|nhớ|nho|giúp|giup|mình|minh|tôi|toi|em|deadline|hạn chót|han chot|hạn|han|nộp|nop|vào|vao|lúc|luc|trước|truoc|ngày|ngay|môn|mon|cho|nhé|nhe|với|voi|là|la|của|cua',
)

function stripAll(text: string, pattern: RegExp): string {
  return text.replace(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g'), ' ')
}

/**
 * Hiểu câu thành bản nháp deadline. Trả null nếu câu không có mốc thời gian
 * (không đoán bừa ngày hạn).
 */
export function parseQuickDeadline(input: string, ctx: { now: Date; courses: Course[] }): DeadlineDraft | null {
  const text = input.trim().replace(/\s+/g, ' ')
  if (!text || text.length > 300) return null
  const { now } = ctx
  let rest = text

  // --- Ngày ---
  let date: Date | null = null
  for (const rule of DATE_RULES) {
    const m = rest.match(rule.pattern)
    if (!m) continue
    date = rule.resolve(m, now)
    if (date) {
      rest = rest.replace(m[0], ' ')
      break
    }
  }
  const nextWeek = NEXT_WEEK.test(rest)
  rest = stripAll(rest, NEXT_WEEK)

  // --- Giờ ---
  let hours = 23
  let minutes = 59
  let hasTime = false
  const t = rest.match(TIME)
  if (t) {
    const h = Number(t[1])
    const mm = t[2] ? Number(t[2]) : 0
    const period = (t[3] ?? '').toLowerCase()
    let hh = h
    if (/chiều|chieu|tối|toi|đêm|dem|pm/.test(period) && h < 12) hh = h + 12
    if (/sáng|sang|am/.test(period) && h === 12) hh = 0
    if (hh <= 23 && mm <= 59) {
      hours = hh
      minutes = mm
      hasTime = true
      rest = rest.replace(t[0], ' ')
    }
  }

  if (!date && !hasTime) return null
  if (!date) date = addDays(now, 0)
  if (nextWeek) date = addDays(date, 7)

  const due = new Date(date)
  due.setHours(hours, minutes, 0, 0)
  // Chỉ nói giờ (vd "9h tối") mà giờ đó đã qua → hiểu là ngày mai
  if (due.getTime() <= now.getTime() && !nextWeek && addDays(date, 0).getTime() === addDays(now, 0).getTime()) {
    if (hasTime && !/hôm nay|hom nay|hnay|today/i.test(text)) due.setDate(due.getDate() + 1)
  }

  // --- Môn học (mã dài khớp trước, tránh PRO19 ăn mất PRO192) ---
  let courseId: string | null = null
  for (const c of [...ctx.courses].sort((a, b) => b.code.length - a.code.length)) {
    const p = re(c.code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    if (p.test(rest)) {
      courseId = c.id
      rest = rest.replace(p, ' ')
      break
    }
  }

  // --- Loại, ưu tiên ---
  const taskType = TYPE_RULES.find(([p]) => p.test(rest))?.[1] ?? 'assignment'
  let priority: Priority = 'medium'
  if (LOW.test(rest)) priority = 'low'
  else if (HIGH.test(rest)) priority = 'high'
  for (const p of [LOW, HIGH, MEDIUM]) rest = stripAll(rest, p)

  // --- Tiêu đề: phần còn lại sau khi bỏ từ đệm ---
  let title = stripAll(rest, FILLERS)
    .replace(/\s+/g, ' ')
    .replace(/^[\s,.:;\-–]+|[\s,.:;\-–]+$/g, '')
    .trim()
  if (title.length < 2) {
    const code = ctx.courses.find((c) => c.id === courseId)?.code
    title = [TYPE_TITLE[taskType], code].filter(Boolean).join(' ')
  }
  title = title.charAt(0).toUpperCase() + title.slice(1)

  return { title: title.slice(0, 200), courseId, taskType, dueDate: due.toISOString(), priority, subtasks: [], notes: '' }
}

const TYPE_TITLE: Record<TaskType, string> = {
  assignment: 'Assignment',
  lab: 'Lab',
  practical: 'Practical',
  revision: 'Ôn tập',
  group_project: 'Bài nhóm',
}
