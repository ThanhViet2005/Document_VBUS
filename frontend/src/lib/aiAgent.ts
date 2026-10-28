// AI agent phía app:
//  - buildAgentContext: dữ liệu thật của sinh viên gửi kèm mỗi lượt (môn, lịch học, deadline, kỳ thi, buổi tự học...).
//    Luật dùng công cụ + kiến thức sản phẩm nằm ở máy chủ (backend/supabase/functions/ai-chat/knowledge.ts).
//  - toAgentActions: KIỂM TRA LẠI đề xuất AI trả về (không tin dữ liệu AI): mã môn phải có thật / vừa được đề xuất tạo,
//    ngày giờ hợp lệ, không trùng môn đã có...
//  - Đề xuất chỉ được lưu khi người dùng bấm "Thêm" (xem components/ai/AiChat.tsx).
import type { BlockName, Course, CourseColor, Deadline, Exam, Priority, Schedule, StudySession, TaskType } from '../types'
import type { RawAgentAction } from '../services/ai'
import type { DeadlineDraft } from './deadlineParser'
import { addDays, formatDateTime, isoDayOfWeek, WEEKDAY_LONG } from './date'
import { BLOCKS, STATUS_LABEL } from './labels'
import { occursOn } from './schedule'

const TASK_TYPES: TaskType[] = ['assignment', 'lab', 'practical', 'revision', 'group_project']
const PRIORITIES: Priority[] = ['low', 'medium', 'high']
const COLORS: CourseColor[] = ['red', 'blue', 'purple', 'orange', 'green', 'teal', 'pink', 'amber']
/** Khớp MAX_CONTEXT_CHARS của Edge Function ai-chat (để dư) */
const MAX_CONTEXT = 9500

/** Đề xuất của agent, dùng mã môn (không dùng id) để môn vừa đề xuất tạo trong cùng lượt vẫn gắn được */
export type AgentAction =
  | { kind: 'task'; title: string; courseCode: string | null; taskType: TaskType; dueDate: string; priority: Priority; subtasks: string[]; notes: string }
  | { kind: 'course'; code: string; name: string; blockName: BlockName; colorCode: CourseColor; semester: string | null }
  | { kind: 'schedule'; courseCode: string; dayOfWeek: number; startTime: string; endTime: string; room: string; lecturer: string; blockPeriod: BlockName }
  | { kind: 'session'; title: string; courseCode: string | null; startAt: string; endAt: string; notes: string; deadlineTitle: string | null }

/** Lịch sử chat cũ lưu bản nháp deadline dạng DeadlineDraft (có courseId) → đổi sang AgentAction */
export function fromLegacyDraft(d: DeadlineDraft | AgentAction, courses: Course[]): AgentAction {
  if ('kind' in d) return d
  return {
    kind: 'task',
    title: d.title,
    courseCode: courses.find((c) => c.id === d.courseId)?.code ?? null,
    taskType: d.taskType,
    dueDate: d.dueDate,
    priority: d.priority,
    subtasks: d.subtasks,
    notes: d.notes,
  }
}

const vnDate = (iso: string) => formatDateTime(iso)
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

export function buildAgentContext(input: {
  now: Date
  userName: string
  page: string
  courses: Course[]
  schedules: Schedule[]
  deadlines: Deadline[]
  exams: Exam[]
  sessions: StudySession[]
  courseById: (id: string | null) => Course | undefined
}): string {
  const { now, courseById } = input
  const code = (id: string | null) => courseById(id)?.code ?? 'không môn'
  const horizon = now.getTime() + 21 * 86_400_000
  const semesters = [...new Set(input.courses.map((c) => c.semester).filter(Boolean))]
  const usedColors = new Set(input.courses.map((c) => c.colorCode))

  // Lịch học trên lớp 7 ngày tới (đã tính ngày kết thúc / buổi dời riêng)
  const week: string[] = []
  for (let i = 0; i < 7; i++) {
    const day = addDays(now, i)
    const dow = isoDayOfWeek(day)
    const list = input.schedules.filter((s) => occursOn(s, day, dow)).sort((a, b) => a.startTime.localeCompare(b.startTime))
    if (list.length) week.push(`- ${WEEKDAY_LONG[dow - 1]} ${day.getDate()}/${day.getMonth() + 1}: ${list.map((s) => `${code(s.courseId)} ${s.startTime}–${s.endTime}${s.room ? ` (${s.room})` : ''}`).join(', ')}`)
  }

  const lines = [
    `Bây giờ: ${WEEKDAY_LONG[isoDayOfWeek(now) - 1]} ${now.toLocaleDateString('vi-VN')} lúc ${hhmm(now)} (giờ Việt Nam, UTC+07:00).`,
    `Sinh viên: ${input.userName || 'chưa đặt tên'}. Đang mở trang: ${input.page}.`,
    `Học kỳ: ${semesters.join(', ') || 'chưa rõ'}. Màu môn chưa dùng: ${COLORS.filter((c) => !usedColors.has(c)).join(', ') || 'đã dùng hết'}.`,
    `Môn học (${input.courses.length}): ${input.courses.map((c) => `${c.code} – ${c.name} (${c.blockName})`).join('; ') || 'chưa có'}.`,
    'Thời khóa biểu cố định (lặp hằng tuần):',
    ...(input.schedules.length
      ? input.schedules.slice(0, 30).map((s) => `- ${code(s.courseId)} ${WEEKDAY_LONG[s.dayOfWeek - 1]} ${s.startTime}–${s.endTime} · ${s.blockPeriod}${s.room ? ` · ${s.room}` : ''}${s.endDate ? ` · đến ${s.endDate}` : ''}`)
      : ['- chưa có']),
    'Giờ lên lớp 7 ngày tới:',
    ...(week.length ? week : ['- không có buổi nào']),
    'Deadline chưa xong trong 21 ngày tới (kể cả quá hạn):',
    ...(() => {
      const list = input.deadlines
        .filter((d) => d.status !== 'done' && new Date(d.dueDate).getTime() <= horizon)
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
        .slice(0, 25)
        .map((d) => `- [${code(d.courseId)}] ${d.title} · hạn ${vnDate(d.dueDate)}${new Date(d.dueDate) < now ? ' (QUÁ HẠN)' : ''} · ${STATUS_LABEL[d.status]} ${d.progressPercent}% · ưu tiên ${d.priority}`)
      return list.length ? list : ['- không có']
    })(),
    `Đã hoàn thành: ${input.deadlines.filter((d) => d.status === 'done').length} / ${input.deadlines.length} deadline.`,
    'Kỳ thi sắp tới:',
    ...(() => {
      const list = input.exams
        .filter((e) => new Date(e.examDate) > now)
        .sort((a, b) => a.examDate.localeCompare(b.examDate))
        .slice(0, 10)
        .map((e) => `- ${e.examType} ${code(e.courseId)} · ${vnDate(e.examDate)}${e.durationMinutes ? ` · ${e.durationMinutes} phút` : ''}${e.room ? ` · phòng ${e.room}` : ''}${e.examFormat ? ` · ${e.examFormat}` : ''}`)
      return list.length ? list : ['- không có']
    })(),
    'Buổi tự học đã lên lịch (14 ngày tới):',
    ...(() => {
      const list = input.sessions
        .filter((s) => new Date(s.endAt) > now && new Date(s.startAt).getTime() <= now.getTime() + 14 * 86_400_000)
        .sort((a, b) => a.startAt.localeCompare(b.startAt))
        .slice(0, 20)
        .map((s) => `- ${vnDate(s.startAt)}–${hhmm(new Date(s.endAt))} · ${s.title}${s.courseId ? ` [${code(s.courseId)}]` : ''}${s.isDone ? ' (đã học)' : ''}`)
      return list.length ? list : ['- chưa có']
    })(),
  ]
  const text = lines.join('\n')
  return text.length > MAX_CONTEXT ? text.slice(0, MAX_CONTEXT) : text
}

const s = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const os = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)
function date(v: unknown): Date | null {
  if (typeof v !== 'string') return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Đề xuất thô từ máy chủ → AgentAction đã kiểm tra.
 * Mã môn chuẩn hóa theo môn có thật (đúng hoa / thường); môn đã tồn tại thì bỏ đề xuất tạo trùng.
 */
export function toAgentActions(raw: RawAgentAction[], courses: Course[]): { actions: AgentAction[]; rejected: number } {
  const known = new Map(courses.map((c) => [c.code.toLowerCase(), c.code]))
  // Môn được đề xuất tạo trong cùng lượt cũng tính là "có" cho lịch học / deadline đi kèm
  for (const r of raw) {
    if (r.type === 'create_course') {
      const code = s(r.args.code, 20)
      if (code && !known.has(code.toLowerCase())) known.set(code.toLowerCase(), code)
    }
  }
  const course = (v: unknown) => {
    const code = os(v, 20)
    return code ? (known.get(code.toLowerCase()) ?? null) : null
  }

  const actions: AgentAction[] = []
  let rejected = 0
  const existing = new Set(courses.map((c) => c.code.toLowerCase()))
  for (const r of raw.slice(0, 12)) {
    const a = r.args ?? {}
    if (r.type === 'create_task') {
      const due = date(a.due_date)
      const title = s(a.title, 200)
      if (!title || !due) { rejected++; continue }
      actions.push({
        kind: 'task',
        title,
        courseCode: course(a.course_code),
        taskType: TASK_TYPES.includes(a.task_type as TaskType) ? (a.task_type as TaskType) : 'assignment',
        dueDate: due.toISOString(),
        priority: PRIORITIES.includes(a.priority as Priority) ? (a.priority as Priority) : 'medium',
        subtasks: Array.isArray(a.subtasks) ? a.subtasks.map((x) => s(x, 200)).filter(Boolean).slice(0, 10) : [],
        notes: s(a.notes, 2000),
      })
    } else if (r.type === 'create_course') {
      const code = s(a.code, 20)
      const name = s(a.name, 200)
      if (!/^[A-Za-z0-9_-]{2,20}$/.test(code) || !name || existing.has(code.toLowerCase())) { rejected++; continue }
      existing.add(code.toLowerCase())
      const used = new Set([...courses.map((c) => c.colorCode), ...actions.flatMap((x) => (x.kind === 'course' ? [x.colorCode] : []))])
      actions.push({
        kind: 'course',
        code,
        name,
        blockName: BLOCKS.includes(a.block as BlockName) ? (a.block as BlockName) : 'Block 1',
        colorCode: COLORS.includes(a.color as CourseColor) ? (a.color as CourseColor) : (COLORS.find((c) => !used.has(c)) ?? 'orange'),
        semester: os(a.semester, 40) ?? courses.find((c) => c.semester)?.semester ?? null,
      })
    } else if (r.type === 'create_class_schedule') {
      const courseCode = course(a.course_code)
      const day = Number(a.day_of_week)
      const start = s(a.start_time, 5)
      const end = s(a.end_time, 5)
      if (!courseCode || !Number.isInteger(day) || day < 1 || day > 7 || !/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end) || end <= start) { rejected++; continue }
      actions.push({
        kind: 'schedule',
        courseCode,
        dayOfWeek: day,
        startTime: start,
        endTime: end,
        room: s(a.room, 40),
        lecturer: s(a.lecturer, 100),
        blockPeriod: BLOCKS.includes(a.block as BlockName) ? (a.block as BlockName) : 'Block 1',
      })
    } else if (r.type === 'create_study_session') {
      const start = date(a.start)
      const end = date(a.end)
      const title = s(a.title, 200)
      if (!title || !start || !end || end <= start) { rejected++; continue }
      actions.push({ kind: 'session', title, courseCode: course(a.course_code), startAt: start.toISOString(), endAt: end.toISOString(), notes: s(a.notes, 2000), deadlineTitle: os(a.deadline_title, 200) })
    } else {
      rejected++
    }
  }
  // Lưu theo thứ tự phụ thuộc: môn trước, rồi lịch học, deadline, buổi tự học (buổi tự học có thể gắn deadline vừa tạo)
  const order: AgentAction['kind'][] = ['course', 'schedule', 'task', 'session']
  actions.sort((x, y) => order.indexOf(x.kind) - order.indexOf(y.kind))
  return { actions, rejected }
}

/** 1 dòng mô tả đề xuất, nối vào lịch sử gửi AI để lượt sau AI biết mình đã đề xuất gì và người dùng xử lý thế nào */
export function describeAction(a: AgentAction): string {
  switch (a.kind) {
    case 'task':
      return `deadline "${a.title}"${a.courseCode ? ` [${a.courseCode}]` : ''} hạn ${vnDate(a.dueDate)}`
    case 'course':
      return `môn ${a.code} – ${a.name} (${a.blockName})`
    case 'schedule':
      return `lịch học ${a.courseCode} ${WEEKDAY_LONG[a.dayOfWeek - 1]} ${a.startTime}–${a.endTime}`
    case 'session':
      return `buổi tự học "${a.title}" ${vnDate(a.startAt)}–${hhmm(new Date(a.endAt))}`
  }
}
