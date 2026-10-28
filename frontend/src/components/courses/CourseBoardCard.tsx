import { Link } from 'react-router-dom'
import { ArrowRight, BookOpenCheck, ClipboardList, FlaskConical, GraduationCap, Pencil, Presentation, RefreshCw, Trash2, User, Users } from 'lucide-react'
import type { Course, Deadline, Exam, Schedule, TaskType } from '../../types'
import { cn } from '../../lib/cn'
import { daysBetween, FPT_SLOTS, formatTime, isoDayOfWeek, WEEKDAY_LONG } from '../../lib/date'
import { courseColor, progressTone, STATUS_TONE } from '../../lib/labels'
import { overallProgress, urgencyOf } from '../../lib/tasks'
import { occursOn, toDateKey } from '../../lib/schedule'

interface Props {
  course: Course
  tasks: Deadline[]
  schedules: Schedule[]
  exams: Exam[]
  now: Date
  onEdit: () => void
  onDelete: () => void
}

const TYPE_ICON: Record<TaskType, typeof ClipboardList> = {
  assignment: ClipboardList,
  lab: FlaskConical,
  practical: Presentation,
  revision: RefreshCw,
  group_project: Users,
}

/** "23:59 hôm nay", "09:00 ngày mai", "Thứ 6, 24/10" */
function dueText(iso: string, now: Date): string {
  const due = new Date(iso)
  const days = daysBetween(now, due)
  if (days === 0) return `${formatTime(iso)} hôm nay`
  if (days === 1) return `${formatTime(iso)} ngày mai`
  return due.toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' })
}

/** "Thứ 2 - Thứ 4 (Slot 2)" theo thời khóa biểu của môn */
function scheduleText(list: Schedule[]): string {
  if (list.length === 0) return 'Chưa xếp lịch'
  const days = [...new Set(list.map((s) => s.dayOfWeek))].sort().map((d) => WEEKDAY_LONG[d - 1])
  const slots = [...new Set(list.map((s) => FPT_SLOTS.findIndex((x) => x.start === s.startTime)).filter((i) => i >= 0).map((i) => i + 1))]
  const slotText = slots.length ? ` (Slot ${slots.join(', ')})` : ` (${list[0].startTime})`
  return days.join(' - ') + slotText
}

/** Thẻ môn học lớn: tiến độ, số liệu nhanh, việc sắp tới, lịch học */
export default function CourseBoardCard({ course, tasks, schedules, exams, now, onEdit, onDelete }: Props) {
  const color = courseColor(course)
  const progress = overallProgress(tasks)
  // Màu tiến độ: 0% cam → đang học xanh dương → 100% xanh lá (cùng quy ước với trạng thái nhiệm vụ)
  const tone = STATUS_TONE[progressTone(progress)]
  const done = tasks.filter((t) => t.status === 'done').length
  const open = tasks
    .filter((t) => t.status !== 'done')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  const nextTask = open.find((t) => urgencyOf(t, now) !== 'overdue')
  const overdue = open.filter((t) => urgencyOf(t, now) === 'overdue').length
  const upcoming = [...open.filter((t) => urgencyOf(t, now) === 'overdue'), ...open.filter((t) => urgencyOf(t, now) !== 'overdue')].slice(0, 2)
  const nextExam = exams.filter((e) => new Date(e.examDate) > now).sort((a, b) => a.examDate.localeCompare(b.examDate))[0]
  // Lấy giảng viên / phòng từ buổi học gần nhất trong tuần (ưu tiên buổi còn diễn ra)
  const today = isoDayOfWeek(now)
  const active = schedules.filter((s) => !s.endDate || s.endDate >= toDateKey(now))
  const main = [...active].sort((a, b) => ((a.dayOfWeek - today + 7) % 7) - ((b.dayOfWeek - today + 7) % 7))[0]
  const hasClassToday = schedules.some((s) => occursOn(s, now, today))

  const nextUrgency = nextTask ? urgencyOf(nextTask, now) : null
  const examDays = nextExam ? daysBetween(now, new Date(nextExam.examDate)) : null

  return (
    <article className="group relative flex flex-col gap-4 overflow-hidden rounded-3xl border border-slate-200 bg-surface p-5 pt-6 shadow-card transition duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-slate-900/5 sm:p-6 sm:pt-7">
      {/* Vạch màu môn trên đầu thẻ (kể cả màu tự chọn) */}
      <span className={cn('absolute inset-x-0 top-0 h-1.5', color.bar)} aria-hidden />

      {/* Chip + nút sửa / xóa */}
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
          <span className={cn('rounded-lg px-2.5 py-1 text-data font-bold tracking-wide', color.soft, color.text)}>{course.code}</span>
          <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-slate-600">{course.blockName}</span>
          {course.semester && <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-slate-600">{course.semester}</span>}
          {hasClassToday && <span className="rounded-lg bg-brand-50 px-2.5 py-1 text-brand-700">Có lớp hôm nay</span>}
        </div>
        <div className="flex shrink-0 gap-1.5">
          <button onClick={onEdit} className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-500 transition hover:bg-brand-50 hover:text-brand-600" aria-label={`Sửa ${course.code}`} title="Sửa môn">
            <Pencil className="h-4 w-4" />
          </button>
          <button onClick={onDelete} className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-500 transition hover:bg-red-50 hover:text-red-600" aria-label={`Xóa ${course.code}`} title="Xóa môn">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div>
      <h3 className="text-lg font-bold leading-snug text-slate-900">{course.name}</h3>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <User className="h-3.5 w-3.5" />
          {/* Giảng viên nhập ở form môn; chưa nhập thì lấy từ thời khóa biểu */}
          Giảng viên: <span className="font-semibold text-slate-700">{course.lecturer || main?.lecturer || '—'}</span>
        </span>
      </p>
      </div>

      {/* Tiến độ + 3 số liệu nhanh */}
      <section className="rounded-2xl border border-slate-200 bg-slate-100/70 p-4" aria-label="Tiến độ học phần">
        <div className="flex items-center justify-between text-sm">
          <span className="inline-flex items-center gap-2 font-bold text-slate-800">
            <span className={cn('h-2 w-2 rounded-full', color.bar)} /> Tiến độ học phần
          </span>
          <span className={cn('text-data text-base font-extrabold', tone.text)}>{progress}%</span>
        </div>
        <div className="mt-2.5 h-2.5 overflow-hidden rounded-full bg-slate-300/70" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
          <div className={cn('h-full rounded-full transition-all duration-700', tone.bar)} style={{ width: `${progress}%` }} />
        </div>

        <div className="mt-4 grid grid-cols-3 divide-x divide-slate-300 border-t border-slate-300 pt-3 text-center">
          <Stat label="Nhiệm vụ" value={tasks.length ? `${done} / ${tasks.length} xong` : 'Chưa có'} />
          <Stat
            label="Hạn gần nhất"
            value={nextTask ? dueText(nextTask.dueDate, now) : overdue ? `${overdue} quá hạn` : 'Không còn'}
            className={nextUrgency === 'urgent' ? 'text-red-700' : nextUrgency === 'soon' ? 'text-amber-700' : !nextTask && overdue ? 'text-red-700' : undefined}
          />
          <Stat
            label={nextExam ? `Thi ${nextExam.examType}` : 'Kỳ thi'}
            value={examDays === null ? 'Chưa có' : examDays === 0 ? 'Hôm nay' : `Còn ${examDays} ngày`}
            className={examDays !== null && examDays <= 7 ? 'text-red-700' : examDays !== null ? 'text-emerald-700' : undefined}
          />
        </div>
      </section>

      {/* Việc sắp tới của môn */}
      <section className="rounded-2xl border border-slate-200 bg-slate-100/70 p-3" aria-label="Việc sắp tới">
        <div className="mb-2 flex items-center justify-between px-1">
          <p className="inline-flex items-center gap-2 text-sm font-bold text-slate-800">
            <BookOpenCheck className={cn('h-4 w-4', color.text)} /> Việc sắp tới
          </p>
          <span className={cn('text-data text-xs font-bold', color.text)}>{open.length} việc đang mở</span>
        </div>
        {upcoming.length === 0 ? (
          <p className="px-1 py-2 text-sm text-slate-600">Không còn việc nào, tuyệt vời 🎉</p>
        ) : (
          <ul className="space-y-1.5">
            {upcoming.map((t) => {
              const Icon = TYPE_ICON[t.taskType]
              const u = urgencyOf(t, now)
              return (
                <li key={t.id}>
                  <Link
                    to={`/tasks?course=${course.id}`}
                    className="flex items-center gap-2.5 rounded-xl bg-surface px-3 py-2.5 text-sm shadow-sm shadow-slate-900/5 ring-1 ring-slate-200 transition hover:ring-brand-500/50"
                  >
                    <Icon className={cn('h-4 w-4 shrink-0', color.text)} />
                    <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{t.title}</span>
                    <span className={cn('shrink-0 text-xs font-bold', u === 'overdue' || u === 'urgent' ? 'text-red-700' : u === 'soon' ? 'text-amber-700' : 'text-slate-600')}>
                      {u === 'overdue' ? 'Quá hạn' : dueText(t.dueDate, now)}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* Đẩy chân thẻ xuống đáy để các thẻ cùng hàng thẳng nhau */}
      <div className="-mt-4 flex-1" aria-hidden />
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
        <p className="text-sm text-slate-500">
          Lịch học: <span className="font-semibold text-slate-700">{scheduleText(active)}</span>
          {nextExam && (
            <span className="ml-2 inline-flex items-center gap-1 text-xs">
              <GraduationCap className="h-3.5 w-3.5" /> {nextExam.examType}
            </span>
          )}
        </p>
        {/* Nút theo màu môn (kể cả màu tự chọn), chữ trắng */}
        <Link
          to={`/tasks?course=${course.id}`}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-md shadow-slate-900/10 transition duration-200 hover:-translate-y-0.5 hover:gap-2.5 hover:shadow-lg hover:brightness-110 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/30 active:translate-y-0',
            color.bar,
          )}
        >
          Xem nhiệm vụ <ArrowRight className="h-4 w-4" />
        </Link>
      </footer>
    </article>
  )
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="min-w-0 px-1.5">
      <p className="truncate text-[11px] font-bold uppercase tracking-wider text-slate-600">{label}</p>
      <p className={cn('mt-1 truncate text-sm font-bold text-slate-900', className)}>{value}</p>
    </div>
  )
}
