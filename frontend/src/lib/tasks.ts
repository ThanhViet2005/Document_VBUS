import type { Deadline, Subtask, TaskStatus } from '../types'
import { addDays, daysBetween, isSameDay, startOfWeek } from './date'

export type TaskBucket = 'today' | 'upcoming' | 'overdue' | 'later' | 'done'

/** Số ngày tới được tính là "Sắp đến hạn" (không gồm hôm nay) */
export const UPCOMING_DAYS = 7

export function bucketOf(task: Deadline, now = new Date()): TaskBucket {
  if (task.status === 'done') return 'done'
  const diff = daysBetween(now, new Date(task.dueDate))
  if (diff < 0) return 'overdue'
  if (diff === 0) return 'today'
  if (diff <= UPCOMING_DAYS) return 'upcoming'
  return 'later'
}

/** Độ gấp tính theo giờ (khác bucketOf tính theo ngày lịch): "urgent" = còn dưới 24 giờ */
export type Urgency = 'overdue' | 'urgent' | 'soon' | 'normal' | 'done'

/** Số ngày tới được coi là "sắp tới hạn" (tô vàng) */
export const SOON_DAYS = 3

export function urgencyOf(task: Deadline, now = new Date()): Urgency {
  if (task.status === 'done') return 'done'
  const hours = (new Date(task.dueDate).getTime() - now.getTime()) / 3_600_000
  if (hours < 0) return 'overdue'
  if (hours < 24) return 'urgent'
  if (hours < SOON_DAYS * 24) return 'soon'
  return 'normal'
}

export function groupByBucket(tasks: Deadline[], now = new Date()): Record<TaskBucket, Deadline[]> {
  const groups: Record<TaskBucket, Deadline[]> = { today: [], upcoming: [], overdue: [], later: [], done: [] }
  for (const t of tasks) groups[bucketOf(t, now)].push(t)
  for (const list of Object.values(groups)) {
    list.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
  }
  return groups
}

/** Tiến độ tổng thể = trung bình % của tất cả nhiệm vụ (task xong tính 100%) */
export function overallProgress(tasks: Deadline[]): number {
  if (tasks.length === 0) return 0
  const sum = tasks.reduce((acc, t) => acc + (t.status === 'done' ? 100 : t.progressPercent), 0)
  return Math.round(sum / tasks.length)
}

export interface WeekdayProgress {
  day: string
  done: number
  pending: number
}

/** Số nhiệm vụ đến hạn mỗi ngày trong tuần hiện tại (T2 → CN), chia theo đã/chưa hoàn thành */
export function weeklyProgress(tasks: Deadline[], labels: string[], now = new Date()): WeekdayProgress[] {
  const monday = startOfWeek(now)
  return labels.map((day, i) => {
    const date = addDays(monday, i)
    const dueThatDay = tasks.filter((t) => isSameDay(new Date(t.dueDate), date))
    const done = dueThatDay.filter((t) => t.status === 'done').length
    return { day, done, pending: dueThatDay.length - done }
  })
}

/** % tiến độ khi đổi trạng thái (khớp trigger normalize_deadline() trên DB: chưa xong thì tối đa 99%) */
/**
 * Người dùng tự chọn trạng thái → đồng bộ các bước nhỏ cho khớp, để thẻ không hiện "Chưa bắt đầu" mà "3/3 bước":
 *   - Hoàn thành: tick hết các bước, 100%;
 *   - Chưa bắt đầu: bỏ tick hết các bước, 0% (giao diện hỏi xác nhận trước nếu đang có bước đã tick);
 *   - Đang làm: giữ nguyên các bước, % theo số bước đã tick (không có bước nào thì tối thiểu 10%).
 * allSubtasks: giá trị cần đặt cho MỌI bước (null = không đổi bước nào).
 */
export function applyStatus(task: Deadline, status: TaskStatus): { progressPercent: number; subtasks: Subtask[]; allSubtasks: boolean | null } {
  const set = (value: boolean) => ({ subtasks: task.subtasks.map((s) => ({ ...s, isCompleted: value })), allSubtasks: task.subtasks.length ? value : null })
  if (status === 'done') return { progressPercent: 100, ...set(true) }
  if (status === 'todo') return { progressPercent: 0, ...set(false) }
  if (task.subtasks.length > 0) {
    const done = task.subtasks.filter((s) => s.isCompleted).length
    return { progressPercent: Math.min(99, Math.round((done / task.subtasks.length) * 100)), subtasks: task.subtasks, allSubtasks: null }
  }
  return { progressPercent: Math.min(99, Math.max(task.progressPercent, 10)), subtasks: task.subtasks, allSubtasks: null }
}

/**
 * Tiến độ tính theo subtask; tick subtask đầu tiên thì chuyển "Chưa bắt đầu" → "Đang làm".
 * autoComplete (khi người dùng tick subtask): tick ĐỦ mọi subtask → tự chuyển "Hoàn thành" (100%).
 * Không bật khi người dùng tự chọn trạng thái (vd bấm "Đang làm" trên nhiệm vụ đã tick đủ thì vẫn giữ "Đang làm").
 */
export function progressFromSubtasks(task: Deadline, subtasks: Subtask[], autoComplete = false): { status: TaskStatus; progressPercent: number } {
  if (task.status === 'done') return { status: 'done', progressPercent: 100 }
  const done = subtasks.filter((s) => s.isCompleted).length
  if (autoComplete && subtasks.length > 0 && done === subtasks.length) return { status: 'done', progressPercent: 100 }
  const status: TaskStatus = task.status === 'todo' && done > 0 ? 'in_progress' : task.status
  const pct = subtasks.length ? Math.round((done / subtasks.length) * 100) : task.progressPercent
  return { status, progressPercent: Math.min(99, pct) }
}
