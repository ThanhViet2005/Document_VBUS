import { CalendarClock, ListChecks, Send, Users } from 'lucide-react'
import type { Course, Deadline, TaskStatus } from '../../types'
import { cn } from '../../lib/cn'
import { daysBetween, formatDate, formatTime } from '../../lib/date'
import { courseColor, PRIORITY_LABEL, PRIORITY_STYLE, STATUS_LABEL, TASK_TYPE_LABEL } from '../../lib/labels'
import { bucketOf } from '../../lib/tasks'
import { useStatusPicker } from '../tasks/useStatusPicker'

interface TaskCardProps {
  task: Deadline
  course?: Course
  onStatusChange: (status: TaskStatus) => void
  /** Mở chi tiết / sửa (trang Nhiệm vụ) */
  onOpen?: () => void
  /** Nút "Gửi cho bạn" */
  onShare?: () => void
}

const STATUS_ORDER: TaskStatus[] = ['todo', 'in_progress', 'done']

const STATUS_ACTIVE: Record<TaskStatus, string> = {
  todo: 'bg-neutral-600 text-white',
  in_progress: 'bg-[#2563eb] text-white',
  done: 'bg-[#047857] text-white',
}

function dueLabel(task: Deadline): { text: string; className: string } {
  const due = new Date(task.dueDate)
  const bucket = bucketOf(task)
  if (bucket === 'overdue') return { text: `Quá hạn ${formatDate(task.dueDate)}`, className: 'text-red-600' }
  if (bucket === 'today') return { text: `Hôm nay, ${formatTime(task.dueDate)}`, className: 'text-orange-600' }
  if (bucket === 'done') return { text: `Hạn ${formatDate(task.dueDate)}`, className: 'text-emerald-600' }
  const days = daysBetween(new Date(), due)
  return { text: `Còn ${days} ngày · ${formatDate(task.dueDate)}`, className: 'text-blue-600' }
}

export default function TaskCard({ task, course, onStatusChange, onOpen, onShare }: TaskCardProps) {
  const due = dueLabel(task)
  const pickStatus = useStatusPicker(task, onStatusChange)
  const color = courseColor(course)
  const doneSubtasks = task.subtasks.filter((s) => s.isCompleted).length

  return (
    <article className="rounded-xl border border-slate-200 bg-surface p-4 shadow-card transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <h3 className={cn('font-semibold leading-snug text-slate-900', task.status === 'done' && 'text-slate-500 line-through')}>
          {onOpen ? (
            <button onClick={onOpen} className="text-left hover:text-brand-600 hover:underline">
              {task.title}
            </button>
          ) : (
            task.title
          )}
        </h3>
        <div className="flex shrink-0 items-center gap-1">
          {task.isGroup && (
            <span title="Bài nhóm" className="rounded-md bg-violet-50 p-1 text-violet-500">
              <Users className="h-4 w-4" />
            </span>
          )}
          {onShare && (
            <button onClick={onShare} title="Gửi cho bạn" aria-label="Gửi cho bạn" className="rounded-md p-1 text-slate-500 hover:bg-brand-50 hover:text-brand-600">
              <Send className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs font-medium">
        {course && <span className={cn('rounded-md px-2 py-0.5', color.soft, color.text)}>#{course.code}</span>}
        <span className={cn('rounded-md px-2 py-0.5', PRIORITY_STYLE[task.priority])}>{PRIORITY_LABEL[task.priority]}</span>
        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-slate-600">{TASK_TYPE_LABEL[task.taskType]}</span>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className={cn('inline-flex items-center gap-1 font-semibold', due.className)}>
          <CalendarClock className="h-3.5 w-3.5" />
          {due.text}
        </span>
        {task.subtasks.length > 0 && (
          <span className="inline-flex items-center gap-1 text-slate-500">
            <ListChecks className="h-3.5 w-3.5" />
            {doneSubtasks}/{task.subtasks.length}
          </span>
        )}
      </div>

      {/* Nút hành động nhanh */}
      <div className="mt-3 grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1" role="group" aria-label="Trạng thái">
        {STATUS_ORDER.map((s) => (
          <button
            key={s}
            onClick={() => void pickStatus(s)}
            aria-pressed={task.status === s}
            className={cn(
              'rounded-md px-1 py-1.5 text-xs font-semibold transition-colors',
              task.status === s ? STATUS_ACTIVE[s] : 'text-slate-500 hover:bg-surface hover:text-slate-800',
            )}
          >
            {STATUS_LABEL[s]}
          </button>
        ))}
      </div>
    </article>
  )
}
