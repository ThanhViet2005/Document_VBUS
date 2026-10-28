import { useState } from 'react'
import { AlarmClock, ArrowRight, CalendarDays, CheckCircle2, Clock, Eye, Send, Users, X } from 'lucide-react'
import type { Course, Deadline, Group, TaskStatus } from '../../types'
import { cn } from '../../lib/cn'
import { formatDate, formatTime } from '../../lib/date'
import { courseColor, PRIORITY_LABEL, STATUS_LABEL, STATUS_TONE, TASK_TYPE_LABEL } from '../../lib/labels'
import { urgencyOf, type Urgency } from '../../lib/tasks'
import Avatar from '../ui/Avatar'
import ProgressBar from '../ui/ProgressBar'
import { useStatusPicker } from './useStatusPicker'

interface Props {
  task: Deadline
  course?: Course
  group?: Group
  onStatusChange: (status: TaskStatus) => void
  onToggleSubtask: (subtaskId: string) => void
  onOpen: () => void
  onShare: () => void
  /** Nhiệm vụ người dùng bấm "Xem" từ chỗ khác (thông báo, trợ lý AI, Kế hoạch...): bọc viền cam + nhãn "Đang xem" */
  highlighted?: boolean
  /** Bấm × trên nhãn "Đang xem" để bỏ đánh dấu */
  onClearHighlight?: () => void
}

const STATUS_ORDER: TaskStatus[] = ['todo', 'in_progress', 'done']
/** Số subtask hiện sẵn trên thẻ, còn lại bấm "xem thêm" */
const SUBTASK_PREVIEW = 3
const MAX_AVATARS = 3

const PRIORITY_DOT: Record<Deadline['priority'], string> = {
  low: 'bg-slate-400',
  medium: 'bg-amber-500',
  high: 'bg-red-500',
}

/** Màu ô hạn nộp theo độ gấp (thanh tiến độ thì theo trạng thái: STATUS_TONE) */
const URGENCY_STYLE: Record<Urgency, { chip: string }> = {
  overdue: { chip: 'bg-red-50 text-red-700 ring-1 ring-red-200' },
  urgent: { chip: 'bg-red-50 text-red-700 ring-1 ring-red-200' },
  soon: { chip: 'bg-amber-50 text-amber-700 ring-1 ring-amber-500/30' },
  normal: { chip: 'bg-slate-100 text-slate-800 ring-1 ring-slate-200' },
  done: { chip: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-500/30' },
}

function dueText(task: Deadline, urgency: Urgency, now = Date.now()): string {
  const due = new Date(task.dueDate)
  const at = `${formatTime(task.dueDate)} · ${formatDate(task.dueDate)}`
  const ms = due.getTime() - now
  if (urgency === 'done') return `Đã xong · hạn ${formatDate(task.dueDate)}`
  if (urgency === 'overdue') {
    const days = Math.max(1, Math.floor(-ms / 86_400_000))
    return `Quá hạn ${days} ngày · ${at}`
  }
  if (urgency === 'urgent') {
    const hours = Math.floor(ms / 3_600_000)
    return hours < 1 ? `GẤP · Còn ${Math.max(1, Math.floor(ms / 60_000))} phút · ${formatTime(task.dueDate)}` : `GẤP · Còn ${hours} giờ · ${at}`
  }
  return `Còn ${Math.ceil(ms / 86_400_000)} ngày · ${at}`
}

/** Thẻ nhiệm vụ cỡ lớn cho trang Nhiệm vụ: mô tả, tiến độ, tick subtask và đổi trạng thái ngay trên thẻ */
export default function TaskBoardCard({ task, course, group, onStatusChange, onToggleSubtask, onOpen, onShare, highlighted, onClearHighlight }: Props) {
  const [showAll, setShowAll] = useState(false)
  const pickStatus = useStatusPicker(task, onStatusChange)
  const urgency = urgencyOf(task)
  const style = URGENCY_STYLE[urgency]
  const color = courseColor(course)
  const accent = urgency === 'overdue' || urgency === 'urgent' ? 'bg-red-500' : urgency === 'done' ? 'bg-emerald-500' : color.bar
  const DueIcon = urgency === 'done' ? CheckCircle2 : urgency === 'urgent' || urgency === 'overdue' ? AlarmClock : urgency === 'soon' ? Clock : CalendarDays

  const doneSubtasks = task.subtasks.filter((s) => s.isCompleted).length
  const progress = task.status === 'done' ? 100 : task.progressPercent
  // Màu thanh tiến độ / nhãn trạng thái theo trạng thái hiện tại
  const tone = STATUS_TONE[task.status]
  const visibleSubtasks = showAll ? task.subtasks : task.subtasks.slice(0, SUBTASK_PREVIEW)
  const hiddenCount = task.subtasks.length - visibleSubtasks.length
  const members = group?.members ?? []
  // ≤ 3 người: hiện đủ; nhiều hơn: 2 người + "+số còn lại" (số còn lại = tổng − 2)
  const shownMembers = members.length > MAX_AVATARS ? members.slice(0, MAX_AVATARS - 1) : members
  const extraMembers = members.length - shownMembers.length

  return (
    <article
      id={`task-${task.id}`}
      aria-current={highlighted ? 'true' : undefined}
      className={cn(
        // scroll-mt: chừa chỗ cho thanh tiêu đề dính khi cuộn tới thẻ. gap-4: các khối cách đều, không dính nhau
        'group/card relative flex scroll-mt-28 flex-col gap-4 overflow-hidden rounded-2xl border border-slate-200 bg-surface p-5 pl-6 shadow-card transition duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-900/5 sm:p-6 sm:pl-7',
        urgency === 'done' && !highlighted && 'opacity-85',
        highlighted && 'animate-focus-pulse border-brand-500 ring-2 ring-brand-500 ring-offset-2 ring-offset-page',
      )}
    >
      {/* Vạch trái: theo độ gấp (đỏ khi gấp / quá hạn, xanh lá khi xong, còn lại màu môn) */}
      <span className={cn('absolute inset-y-0 left-0 w-1.5', accent)} aria-hidden />
      {highlighted && (
        <div className="flex items-center justify-between gap-2 rounded-xl bg-brand-50 py-1 pl-3 pr-1 text-xs font-bold text-brand-700">
          <span className="inline-flex items-center gap-1.5">
            <Eye className="h-3.5 w-3.5" /> Nhiệm vụ bạn đang xem
          </span>
          {onClearHighlight && (
            <button type="button" onClick={onClearHighlight} className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-brand-100" aria-label="Bỏ đánh dấu nhiệm vụ đang xem">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {/* 1. Đầu thẻ: nhãn môn / ưu tiên / loại / nhóm + nút gửi */}
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
          {course && <span className={cn('rounded-full px-2.5 py-1', color.soft, color.text)}>{course.code}</span>}
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">
            <span className={cn('h-1.5 w-1.5 rounded-full', PRIORITY_DOT[task.priority])} aria-hidden />
            {PRIORITY_LABEL[task.priority]}
          </span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">{TASK_TYPE_LABEL[task.taskType]}</span>
          {task.isGroup && (
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-violet-600">
              <Users className="h-3 w-3" />
              {members.length ? `Nhóm ${members.length} người` : 'Bài nhóm'}
            </span>
          )}
        </div>
        <button onClick={onShare} title="Gửi cho bạn" aria-label="Gửi cho bạn" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition hover:bg-brand-50 hover:text-brand-600">
          <Send className="h-4 w-4" />
        </button>
      </header>

      {/* 2. Tên nhiệm vụ, ghi chú, hạn nộp */}
      <div>
        <h3 className={cn('text-[17px] font-bold leading-snug text-slate-900', task.status === 'done' && 'text-slate-500 line-through')}>
          <button onClick={onOpen} className="text-left transition hover:text-brand-600">
            {task.title}
          </button>
        </h3>
        {task.notes && <p className="mt-1.5 line-clamp-2 text-sm text-slate-600">{task.notes}</p>}
        <p className={cn('mt-3 inline-flex w-fit items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold', style.chip)}>
          <DueIcon className="h-3.5 w-3.5" />
          {dueText(task, urgency)}
        </p>
      </div>

      {/* 3. Tiến độ + các bước nhỏ: gom trong 1 khối nền nhạt */}
      <section className="rounded-2xl border border-slate-200 bg-slate-100/70 p-4" aria-label="Tiến độ">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="inline-flex items-center gap-2 text-sm font-bold text-slate-800">
            Tiến độ
            <span className={cn('rounded-full px-2 py-0.5 text-xs font-bold ring-1 ring-current/25', tone.soft)}>{STATUS_LABEL[task.status]}</span>
          </span>
          <span className={cn('text-data text-sm font-extrabold', tone.text)}>
            {task.subtasks.length ? `${doneSubtasks}/${task.subtasks.length} bước` : `${progress}%`}
          </span>
        </div>
        {/* Màu thanh theo trạng thái: cam (chưa bắt đầu) → xanh dương (đang làm) → xanh lá (hoàn thành) */}
        <ProgressBar value={progress} barClassName={tone.bar} className="mt-2.5" trackClassName="bg-slate-300/70" />

        {task.subtasks.length > 0 && (
          <ul className="mt-3 space-y-0.5 border-t border-slate-300 pt-2">
            {visibleSubtasks.map((s) => (
              <li key={s.id}>
                <label className="flex cursor-pointer items-start gap-2.5 rounded-lg px-1.5 py-1.5 text-sm transition hover:bg-surface">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[#16a34a]"
                    checked={s.isCompleted}
                    disabled={task.status === 'done'}
                    onChange={() => onToggleSubtask(s.id)}
                  />
                  <span className={cn('font-medium text-slate-800', s.isCompleted && 'font-normal text-slate-500 line-through')}>{s.title}</span>
                </label>
              </li>
            ))}
            {(hiddenCount > 0 || showAll) && task.subtasks.length > SUBTASK_PREVIEW && (
              <li>
                <button onClick={() => setShowAll((v) => !v)} className="px-1.5 py-1 text-xs font-semibold text-brand-600 hover:underline">
                  {showAll ? 'Thu gọn' : `+${hiddenCount} bước nữa`}
                </button>
              </li>
            )}
          </ul>
        )}
      </section>

      {/* Đẩy chân thẻ xuống đáy để các thẻ cùng hàng thẳng nhau */}
      <div className="-mt-4 flex-1" aria-hidden />

      {/* 4. Chân thẻ: đổi trạng thái + Chi tiết; thành viên nhóm ở hàng riêng */}
      <footer className="space-y-3 border-t border-slate-200 pt-4">
        {/* Cùng 1 hàng theo độ rộng THẺ (container query @container), không theo màn hình:
            ≥ 26rem: "Chi tiết →" đủ chữ cùng hàng; 20.5–26rem: chỉ mũi tên 44px, vẫn cùng hàng;
            < 20.5rem (đa số điện thoại): 3 nút trạng thái chiếm cả hàng, "Chi tiết →" cả hàng bên dưới.
            Không đặt min-w-0 cho nhóm trạng thái: bóp nhỏ hơn chữ là chữ tràn đè lên nút bên cạnh. */}
        <div className="@container">
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <div className="flex w-full gap-0.5 rounded-xl border border-slate-200 bg-slate-100 p-1 @[20.5rem]:w-auto @[20.5rem]:flex-1 @[26rem]:flex-none" role="group" aria-label="Trạng thái">
            {STATUS_ORDER.map((s) => (
              <button
                key={s}
                onClick={() => void pickStatus(s)}
                aria-pressed={task.status === s}
                className={cn(
                  'flex-1 rounded-lg px-1 py-1.5 text-xs leading-tight font-bold transition @[17rem]:whitespace-nowrap @[26rem]:flex-none @[26rem]:px-2.5',
                  task.status === s ? STATUS_TONE[s].solid : 'text-slate-700 hover:bg-surface hover:text-slate-900',
                )}
              >
                {STATUS_LABEL[s]}
              </button>
            ))}
          </div>
          {/* Nút theo màu môn (kể cả màu tự chọn), chữ trắng; nhiệm vụ không gắn môn dùng cam */}
          <button
            onClick={onOpen}
            aria-label="Chi tiết"
            title="Chi tiết"
            className={cn(
              'group/btn inline-flex h-11 w-full min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-white @[20.5rem]:ml-auto @[20.5rem]:w-auto @[26rem]:h-auto @[26rem]:px-3.5 @[26rem]:py-2 shadow-md shadow-slate-900/10 transition duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:brightness-110 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/30 active:translate-y-0 active:scale-95',
              course ? color.bar : 'bg-cta',
            )}
          >
            <span className="@[20.5rem]:hidden @[26rem]:inline">Chi tiết</span>
            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover/btn:translate-x-0.5" />
          </button>
        </div>
        </div>

        {/* Thành viên nhóm: tối đa 3 người thì hiện đủ, nhiều hơn thì hiện 2 người + "+số còn lại" */}
        {members.length > 0 && (
          <div className="flex items-center gap-2" title={members.map((m) => m.fullName).join(', ')}>
            <div className="flex gap-[3px]">
              {shownMembers.map((m) => (
                <Avatar key={m.userId} name={m.fullName} src={m.avatarUrl} className="h-2 w-2 text-[0px]" />
              ))}
            </div>
            {/* Ô 8px không chứa nổi chữ: "+số" là chữ thường đứng cạnh các chấm ảnh */}
            {extraMembers > 0 && <span className="text-[11px] font-bold leading-none text-slate-600">+{extraMembers}</span>}
            <span className="text-xs text-slate-600">{members.length} thành viên</span>
          </div>
        )}
      </footer>
    </article>
  )
}
