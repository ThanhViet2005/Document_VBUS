// Công cụ của AI agent (Groq tool calling, định dạng OpenAI).
// Mọi công cụ chỉ tạo ĐỀ XUẤT trả về app; người dùng bấm "Thêm" thì app mới lưu (qua RLS của chính họ).
// Máy chủ kiểm tra kiểu / định dạng ở đây; app kiểm tra lại lần nữa (mã môn có thật không, trùng môn...).

export type ToolName = 'create_task' | 'create_course' | 'create_class_schedule' | 'create_study_session'

export interface AgentAction {
  type: ToolName
  args: Record<string, unknown>
}

const TASK_TYPES = ['assignment', 'lab', 'practical', 'revision', 'group_project']
const PRIORITIES = ['low', 'medium', 'high']
const BLOCKS = ['Block 1', 'Block 2', 'Block 3']
const COLORS = ['red', 'blue', 'purple', 'orange', 'green', 'teal', 'pink', 'amber']
const ISO_DESC = 'ISO 8601 có +07:00, vd 2026-10-23T23:59:00+07:00'

export const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'create_task',
      description: 'Đề xuất 1 deadline / nhiệm vụ.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          course_code: { type: 'string', description: 'Mã môn đã có; không rõ thì bỏ trống' },
          task_type: { type: 'string', enum: TASK_TYPES },
          due_date: { type: 'string', description: ISO_DESC },
          priority: { type: 'string', enum: PRIORITIES },
          subtasks: { type: 'array', items: { type: 'string' } },
          notes: { type: 'string' },
        },
        required: ['title', 'task_type', 'due_date', 'priority'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_course',
      description: 'Đề xuất 1 môn học mới.',
      parameters: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'Chữ và số, vd PRO192' },
          name: { type: 'string' },
          block: { type: 'string', enum: BLOCKS },
          color: { type: 'string', enum: COLORS },
          semester: { type: 'string', description: 'vd Fall 2026' },
        },
        required: ['code', 'name', 'block'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_class_schedule',
      description: 'Đề xuất 1 buổi học trên lớp lặp hằng tuần.',
      parameters: {
        type: 'object',
        properties: {
          course_code: { type: 'string' },
          day_of_week: { type: 'integer', description: '1=Thứ 2 ... 6=Thứ 7, 7=Chủ nhật' },
          start_time: { type: 'string', description: 'HH:mm' },
          end_time: { type: 'string', description: 'HH:mm' },
          room: { type: 'string' },
          lecturer: { type: 'string' },
          block: { type: 'string', enum: BLOCKS },
        },
        required: ['course_code', 'day_of_week', 'start_time', 'end_time', 'block'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_study_session',
      description: 'Đề xuất 1 buổi tự học; lên kế hoạch thì gọi nhiều lần.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Nội dung buổi học' },
          course_code: { type: 'string' },
          start: { type: 'string', description: ISO_DESC },
          end: { type: 'string', description: ISO_DESC },
          deadline_title: { type: 'string', description: 'Deadline liên quan (nếu có)' },
          notes: { type: 'string' },
        },
        required: ['title', 'start', 'end'],
      },
    },
  },
] as const

type Result = { ok: true; action: AgentAction; summary: string } | { ok: false; error: string }

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const optStr = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)
const isHHmm = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v)
/** Chỉ nhận ISO có múi giờ (Z hoặc ±hh:mm), năm hợp lý */
function isoDate(v: unknown): Date | null {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(v.trim())) return null
  const d = new Date(v)
  const year = d.getUTCFullYear()
  const now = new Date().getUTCFullYear()
  return Number.isNaN(d.getTime()) || year < now - 1 || year > now + 2 ? null : d
}
const vn = (d: Date) => d.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

/** Kiểm tra 1 lần gọi công cụ; trả về đề xuất đã chuẩn hóa hoặc lỗi (gửi lại cho mô hình để tự sửa) */
export function validateToolCall(name: string, rawArgs: string): Result {
  let a: Record<string, unknown>
  try {
    a = JSON.parse(rawArgs || '{}')
  } catch {
    return { ok: false, error: 'tham số không phải JSON hợp lệ' }
  }
  if (!a || typeof a !== 'object' || Array.isArray(a)) return { ok: false, error: 'tham số phải là object' }

  switch (name) {
    case 'create_task': {
      const title = str(a.title, 200)
      const due = isoDate(a.due_date)
      if (!title) return { ok: false, error: 'thiếu title' }
      if (!due) return { ok: false, error: `due_date không hợp lệ. ${ISO_DESC}` }
      const args = {
        title,
        course_code: optStr(a.course_code, 20),
        task_type: TASK_TYPES.includes(a.task_type as string) ? a.task_type : 'assignment',
        due_date: due.toISOString(),
        priority: PRIORITIES.includes(a.priority as string) ? a.priority : 'medium',
        subtasks: Array.isArray(a.subtasks) ? a.subtasks.map((s) => str(s, 200)).filter(Boolean).slice(0, 10) : [],
        notes: str(a.notes, 2000),
      }
      return { ok: true, action: { type: name, args }, summary: `deadline "${title}" hạn ${vn(due)}` }
    }
    case 'create_course': {
      const code = str(a.code, 20)
      const nameValue = str(a.name, 200)
      if (!/^[A-Za-z0-9_-]{2,20}$/.test(code)) return { ok: false, error: 'code 2–20 ký tự, gồm chữ, số, _ hoặc -' }
      if (!nameValue) return { ok: false, error: 'thiếu name' }
      const args = {
        code,
        name: nameValue,
        block: BLOCKS.includes(a.block as string) ? a.block : 'Block 1',
        color: COLORS.includes(a.color as string) ? a.color : null,
        semester: optStr(a.semester, 40),
      }
      return { ok: true, action: { type: name, args }, summary: `môn ${code} – ${nameValue} (${args.block})` }
    }
    case 'create_class_schedule': {
      const code = str(a.course_code, 20)
      const day = Number(a.day_of_week)
      const start = str(a.start_time, 5)
      const end = str(a.end_time, 5)
      if (!code) return { ok: false, error: 'thiếu course_code' }
      if (!Number.isInteger(day) || day < 1 || day > 7) return { ok: false, error: 'day_of_week phải từ 1 (Thứ 2) đến 7 (Chủ nhật)' }
      if (!isHHmm(start) || !isHHmm(end) || end <= start) return { ok: false, error: 'start_time / end_time phải dạng HH:mm và kết thúc sau bắt đầu' }
      const args = {
        course_code: code,
        day_of_week: day,
        start_time: start,
        end_time: end,
        room: str(a.room, 40),
        lecturer: str(a.lecturer, 100),
        block: BLOCKS.includes(a.block as string) ? a.block : 'Block 1',
      }
      const dayName = day === 7 ? 'Chủ nhật' : `Thứ ${day + 1}`
      return { ok: true, action: { type: name, args }, summary: `lịch học ${code} ${dayName} ${start}–${end}` }
    }
    case 'create_study_session': {
      const title = str(a.title, 200)
      const start = isoDate(a.start)
      const end = isoDate(a.end)
      if (!title) return { ok: false, error: 'thiếu title' }
      if (!start || !end) return { ok: false, error: `start / end không hợp lệ. ${ISO_DESC}` }
      const minutes = (end.getTime() - start.getTime()) / 60_000
      if (minutes < 15 || minutes > 360) return { ok: false, error: 'buổi tự học phải dài 15 phút – 6 giờ và end sau start' }
      if (end.getTime() < Date.now()) return { ok: false, error: 'buổi tự học đã ở quá khứ, hãy xếp từ bây giờ trở đi' }
      const args = {
        title,
        course_code: optStr(a.course_code, 20),
        start: start.toISOString(),
        end: end.toISOString(),
        deadline_title: optStr(a.deadline_title, 200),
        notes: str(a.notes, 2000),
      }
      return { ok: true, action: { type: name, args }, summary: `buổi tự học "${title}" ${vn(start)} (${Math.round(minutes)} phút)` }
    }
    default:
      return { ok: false, error: `không có công cụ ${name}` }
  }
}
