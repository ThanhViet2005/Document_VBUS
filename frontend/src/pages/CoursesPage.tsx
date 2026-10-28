import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AlarmClock, BookOpen, CalendarClock, CircleCheckBig, CircleDashed, Layers, Plus } from 'lucide-react'
import { useAppData } from '../store/AppData'
import { useToast } from '../components/ui/Toast'
import { useConfirm } from '../components/ui/ConfirmDialog'
import CourseBoardCard from '../components/courses/CourseBoardCard'
import CourseForm from '../components/courses/CourseForm'
import { Button, EmptyState, errorMessage } from '../components/ui/Form'
import { cn } from '../lib/cn'
import { BLOCKS, COURSE_COLOR } from '../lib/labels'
import { overallProgress } from '../lib/tasks'
import { daysBetween, formatDate, formatTime, isoDayOfWeek } from '../lib/date'
import { occursOn, toDateKey } from '../lib/schedule'
import { useNow } from '../lib/useNow'
import type { CourseInput } from '../services/api'
import type { BlockName, Course, CourseColor } from '../types'

const COLORS = Object.keys(COURSE_COLOR) as CourseColor[]

export default function CoursesPage() {
  const { courses, deadlines, schedules, exams, user, deleteCourse } = useAppData()
  const toast = useToast()
  const confirm = useConfirm()
  const now = useNow(60_000)
  const [editing, setEditing] = useState<CourseInput | null>(null)

  const mine = courses.filter((c) => c.userId === user.id)
  const lastSemester = mine.find((c) => c.semester)?.semester ?? ''
  // Mặc định mở Block đang có môn (ưu tiên Block 1)
  const [block, setBlock] = useState<BlockName>(() => BLOCKS.find((b) => mine.some((c) => c.blockName === b)) ?? 'Block 1')
  const list = mine.filter((c) => c.blockName === block)

  const stats = useMemo(() => {
    const ids = new Set(list.map((c) => c.id))
    const tasks = deadlines.filter((d) => d.courseId && ids.has(d.courseId))
    const nextDue = tasks
      .filter((t) => t.status !== 'done' && new Date(t.dueDate) > now)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0]
    const today = isoDayOfWeek(now)
    return {
      progress: overallProgress(tasks),
      sessions: schedules.filter((s) => ids.has(s.courseId) && (!s.endDate || s.endDate >= toDateKey(now))).length,
      classesToday: schedules.filter((s) => ids.has(s.courseId) && occursOn(s, now, today)).length,
      nextDue,
    }
  }, [list, deadlines, schedules, now])

  async function onDelete(c: Course) {
    if (
      !(await confirm({
        title: `Xóa môn ${c.code}?`,
        message: 'Lịch học và lịch thi của môn sẽ bị xóa. Deadline được giữ lại nhưng bỏ gắn môn.',
        confirmLabel: `Xóa môn ${c.code}`,
      }))
    )
      return
    try {
      await deleteCourse(c.id)
      toast.success(`Đã xóa ${c.code}`)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  const add = () => setEditing({ code: '', name: '', colorCode: COLORS[mine.length % COLORS.length], blockName: block, semester: lastSemester })

  return (
    <div className="space-y-5">
      {/* Đầu trang: học kỳ + hạn nộp tiếp theo + thêm môn */}
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-slate-200 bg-surface p-4 sm:p-5 shadow-card">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            {lastSemester && <span className="rounded-full bg-brand-50 px-2.5 py-0.5 font-bold uppercase tracking-wide text-brand-700">{lastSemester}</span>}
            Thời khóa biểu Block 5 tuần
          </p>
          <p className="mt-1 text-sm text-slate-500">Các môn trong Block 1, 2 &amp; 3 · tiến độ, hạn nộp và kỳ thi của từng môn</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {stats.nextDue && (
            <Link to="/tasks" className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-200">
              <AlarmClock className="h-4 w-4 text-brand-500" />
              Hạn nộp tiếp theo:{' '}
              <span className="font-semibold text-slate-900">
                {formatTime(stats.nextDue.dueDate)} {daysBetween(now, new Date(stats.nextDue.dueDate)) === 0 ? 'hôm nay' : formatDate(stats.nextDue.dueDate)}
              </span>
            </Link>
          )}
          <Button onClick={add}>
            <Plus className="h-4 w-4" /> Thêm môn học
          </Button>
        </div>
      </section>

      {/* Chọn Block + chỉ số tổng hợp của Block đó */}
      <section className="flex flex-wrap items-center gap-3 rounded-3xl border border-slate-200 bg-surface p-3 shadow-card">
        <div className="flex max-w-full gap-1.5 overflow-x-auto rounded-2xl bg-slate-100 p-1.5" role="tablist" aria-label="Chọn Block">
          {BLOCKS.map((b) => {
            const active = block === b
            const count = mine.filter((c) => c.blockName === b).length
            return (
              <button
                key={b}
                role="tab"
                aria-selected={active}
                onClick={() => setBlock(b)}
                className={cn(
                  'inline-flex shrink-0 items-center gap-2.5 rounded-xl px-4 py-2 text-sm font-bold transition',
                  active ? 'bg-cta text-white shadow-md shadow-brand-500/30' : 'text-slate-500 hover:bg-surface hover:text-slate-800',
                )}
              >
                {active ? <CircleCheckBig className="h-4 w-4" /> : <Layers className="h-4 w-4" />}
                {b}
                <span className={cn('rounded-full px-2 py-0.5 text-xs', active ? 'bg-white/25' : 'bg-surface text-slate-500')}>{count} môn</span>
              </button>
            )
          })}
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <Chip icon={<BookOpen className="h-4 w-4 text-brand-500" />}>
            Số môn: <b className="text-slate-900">{list.length}</b>
          </Chip>
          <Chip icon={<CircleDashed className="h-4 w-4 text-emerald-500" />}>
            Hoàn thành TB: <b className="text-emerald-600">{stats.progress}%</b>
          </Chip>
          <Chip icon={<CalendarClock className="h-4 w-4 text-blue-500" />}>
            Buổi học / tuần: <b className="text-slate-900">{stats.sessions}</b>
            {stats.classesToday > 0 && <span className="text-xs text-brand-600">· {stats.classesToday} hôm nay</span>}
          </Chip>
        </div>
      </section>

      {mine.length === 0 ? (
        <EmptyState icon={<BookOpen className="h-6 w-6" />} title="Chưa có môn học" text="Thêm các môn của Block 1, 2 & 3 để xếp thời khóa biểu, lịch thi và deadline." />
      ) : list.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="h-6 w-6" />}
          title={`${block} chưa có môn nào`}
          text="Thêm môn cho Block này, hoặc chuyển sang Block khác."
          action={
            <Button onClick={add}>
              <Plus className="h-4 w-4" /> Thêm môn vào {block}
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 2xl:grid-cols-3">
          {list.map((c) => (
            <CourseBoardCard
              key={c.id}
              course={c}
              tasks={deadlines.filter((d) => d.courseId === c.id)}
              schedules={schedules.filter((s) => s.courseId === c.id)}
              exams={exams.filter((e) => e.courseId === c.id)}
              now={now}
              onEdit={() => setEditing({ ...c })}
              onDelete={() => void onDelete(c)}
            />
          ))}
        </div>
      )}

      {editing && <CourseForm initial={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function Chip({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-slate-600">
      {icon}
      {children}
    </span>
  )
}
