import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  BookOpenCheck,
  Building2,
  CalendarDays,
  CalendarRange,
  CheckCheck,
  CircleCheck,
  GraduationCap,
  Lightbulb,
  ChevronLeft,
  ChevronRight,
  PieChart,
  Plus,
  Sparkles,
  Sun,
  Timer,
  TriangleAlert,
  Undo2,
} from 'lucide-react'
import { useAppData } from '../store/AppData'
import { cn } from '../lib/cn'
import { addDays, daysBetween, formatTime, isSameDay, startOfDay, startOfWeek, WEEKDAY_LONG, WEEKDAY_SHORT } from '../lib/date'
import { BLOCKS, courseColor, courseHex } from '../lib/labels'
import { useNow } from '../lib/useNow'
import { useCurrentBlock } from '../lib/useCurrentBlock'
import { occursOn } from '../lib/schedule'
import { findFreeSlot, formatMinutes, sessionIntervals, sessionMinutes, suggestStudySessions, weekStats, type Suggestion } from '../lib/studyPlan'
import type { StudySessionInput } from '../services/api'
import type { BlockName, Course, Schedule, StudySession } from '../types'
import SessionForm from '../components/plan/SessionForm'
import { Button, errorMessage } from '../components/ui/Form'
import StatTile from '../components/ui/StatTile'
import { useToast } from '../components/ui/Toast'

const dayLabel = (d: Date) => d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }).replace('/', '-')
const timeRange = (s: { startAt: string; endAt: string }) => `${formatTime(s.startAt)} – ${formatTime(s.endAt)}`

/** Mã màu cho biểu đồ tròn (SVG cần màu thật, không dùng được class Tailwind) */
/** Phút trong ngày từ "HH:mm" */
const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export default function PlanPage() {
  const { studySessions, schedules, exams, deadlines, courseById, saveStudySession } = useAppData()
  const toast = useToast()
  const now = useNow(60_000)
  const [block, setBlock] = useCurrentBlock()
  const [weekOffset, setWeekOffset] = useState(0)
  const [editing, setEditing] = useState<StudySessionInput | null>(null)
  const [adding, setAdding] = useState<string | null>(null)

  const weekStart = useMemo(() => addDays(startOfWeek(now), weekOffset * 7), [now, weekOffset])
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])
  const blockSchedules = useMemo(() => schedules.filter((s) => s.blockPeriod === block), [schedules, block])

  const stats = useMemo(() => weekStats(studySessions, weekStart), [studySessions, weekStart])
  const suggestions = useMemo(
    () => suggestStudySessions({ now, exams, deadlines, sessions: studySessions, schedules: blockSchedules, courseById }),
    [now, exams, deadlines, studySessions, blockSchedules, courseById],
  )
  const nextExam = exams.filter((e) => new Date(e.examDate) > now).sort((a, b) => a.examDate.localeCompare(b.examDate))[0]

  /** Buổi mới trong một ngày: lấy giờ trống đầu tiên (90 phút) của ngày đó, không có thì 19:00 */
  function newSessionOn(day: Date) {
    const dayStart = startOfDay(day).getTime()
    const slot = findFreeSlot({
      durationMin: 90,
      busy: sessionIntervals(studySessions),
      schedules: blockSchedules,
      notBefore: Math.max(dayStart, now.getTime()),
      notAfter: dayStart + 24 * 60 * 60_000 - 1,
      maxDays: 0,
    })
    const start = slot ? new Date(slot.start) : new Date(dayStart + 19 * 60 * 60_000)
    const end = slot ? new Date(slot.end) : new Date(start.getTime() + 90 * 60_000)
    setEditing({ title: '', courseId: null, deadlineId: null, examId: null, startAt: start.toISOString(), endAt: end.toISOString(), isDone: false, notes: '' })
  }

  async function accept(list: Suggestion[]) {
    setAdding(list.length === 1 ? list[0].key : 'all')
    try {
      for (const s of list) {
        await saveStudySession({ title: s.title, courseId: s.courseId, deadlineId: s.deadlineId, examId: s.examId, startAt: s.startAt, endAt: s.endAt, isDone: false, notes: '' })
      }
      toast.success(list.length === 1 ? 'Đã thêm vào kế hoạch' : `Đã thêm ${list.length} buổi vào kế hoạch`)
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setAdding(null)
    }
  }

  const examDays = nextExam ? daysBetween(now, new Date(nextExam.examDate)) : null
  const weekend = days.slice(5)

  return (
    <div className="space-y-5">
      {/* Thanh điều khiển: tuần · block · thêm buổi */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-2xl border border-slate-200 bg-surface p-1 shadow-card">
          <button onClick={() => setWeekOffset((w) => w - 1)} className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900" aria-label="Tuần trước">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span key={weekOffset} className="inline-flex min-w-44 animate-week-label items-center justify-center gap-2 px-1 text-sm font-bold text-slate-900">
            <CalendarDays className="h-4 w-4 text-brand-500" />
            {dayLabel(days[0])} – {dayLabel(days[6])}-{days[6].getFullYear()}
          </span>
          <button onClick={() => setWeekOffset((w) => w + 1)} className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900" aria-label="Tuần sau">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        {weekOffset !== 0 && (
          <Button variant="secondary" onClick={() => setWeekOffset(0)}>
            <Undo2 className="h-4 w-4" /> Tuần này
          </Button>
        )}
        <div className="flex gap-1 rounded-2xl border border-slate-200 bg-surface p-1 text-sm font-semibold shadow-card" role="group" aria-label="Block đang học">
          {BLOCKS.map((b) => (
            <button
              key={b}
              onClick={() => setBlock(b)}
              aria-pressed={block === b}
              className={cn('rounded-xl px-3.5 py-1.5 transition', block === b ? 'bg-cta text-white shadow-md shadow-brand-500/30' : 'text-slate-500 hover:text-slate-800')}
            >
              {b}
            </button>
          ))}
        </div>
        <Button className="ml-auto px-5 py-2.5 shadow-lg shadow-brand-500/30" onClick={() => newSessionOn(weekOffset === 0 ? now : days[0])}>
          <Plus className="h-4 w-4" /> Thêm buổi học
        </Button>
      </div>

      {/* 4 thẻ số liệu */}
      <div className="stagger grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatTile label="Buổi tự học" value={stats.sessionCount} unit="buổi" hint={`${formatMinutes(stats.plannedMin)} đã lên kế hoạch`} icon={CalendarRange} tone="orange" />
        <StatTile
          label="Đã hoàn thành"
          value={stats.doneCount}
          unit={stats.sessionCount ? `/ ${stats.sessionCount} buổi` : 'buổi'}
          progress={stats.sessionCount ? Math.round((stats.doneCount / stats.sessionCount) * 100) : 0}
          hint={`${formatMinutes(stats.doneMin)} đã tích lũy`}
          icon={CircleCheck}
          tone="green"
        />
        <StatTile
          label="Kỳ thi sắp tới"
          value={
            nextExam ? (
              // Loại thi (PE / FE) là nhãn nhỏ, mã môn là con số chính: mã môn dài không còn chiếm hết thẻ
              <span className="inline-flex min-w-0 items-center gap-2">
                <span className="shrink-0 rounded-lg bg-amber-50 px-2 py-0.5 text-sm font-extrabold tracking-normal text-amber-700">{nextExam.examType}</span>
                <span className="truncate text-xl sm:text-2xl">{courseById(nextExam.courseId)?.code ?? '—'}</span>
              </span>
            ) : (
              '—'
            )
          }
          hint={examDays === null ? 'Không có kỳ thi nào' : examDays === 0 ? 'Thi hôm nay' : `Còn ${examDays} ngày nữa`}
          icon={GraduationCap}
          // Còn ≤ 3 ngày: đổi sang đỏ để nhắc ôn gấp
          tone={examDays !== null && examDays <= 3 ? 'red' : 'amber'}
        />
        <StatTile label="Gợi ý UniAI" value={suggestions.length} unit="bài" hint="Nên thêm vào kế hoạch" icon={Lightbulb} tone="teal" />
      </div>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        {/* Lịch tuần: mỗi ngày (T2 → CN) một thẻ, một hàng riêng */}
        <section className="space-y-4" aria-label="Kế hoạch trong tuần">
          {[...days.slice(0, 5), ...weekend].map((day) => (
            <DayCard key={day.toISOString()} day={day} now={now} block={block} onAdd={() => newSessionOn(day)} onEdit={setEditing} />
          ))}
        </section>

        <aside className="space-y-5 xl:sticky xl:top-[calc(var(--app-header-h,4.5rem)+1rem)]">
          <SuggestionsCard suggestions={suggestions} block={block} adding={adding} onAccept={(list) => void accept(list)} />
          <DistributionCard byCourse={stats.byCourse} plannedMin={stats.plannedMin} />
        </aside>
      </div>

      {editing && <SessionForm initial={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

type Item =
  | { kind: 'class'; key: string; sort: string; s: Schedule; course?: Course }
  | { kind: 'exam'; key: string; sort: string; label: string; room: string; time: string }
  | { kind: 'deadline'; key: string; sort: string; title: string; time: string; courseCode?: string }
  | { kind: 'session'; key: string; sort: string; session: StudySession }

function DayCard({ day, now, block, onAdd, onEdit }: { day: Date; now: Date; block: BlockName; onAdd: () => void; onEdit: (s: StudySession) => void }) {
  const { studySessions, schedules, exams, deadlines, courseById } = useAppData()
  const isToday = isSameDay(day, now)
  const isPast = startOfDay(day) < startOfDay(now)
  const dow = ((day.getDay() + 6) % 7) + 1

  const items: Item[] = [
    ...schedules
      .filter((s) => s.blockPeriod === block && occursOn(s, day, dow))
      .map<Item>((s) => ({ kind: 'class', key: s.id, sort: s.startTime, s, course: courseById(s.courseId) })),
    ...exams
      .filter((e) => isSameDay(new Date(e.examDate), day))
      .map<Item>((e) => ({ kind: 'exam', key: e.id, sort: formatTime(e.examDate), time: formatTime(e.examDate), room: e.room, label: `Thi ${e.examType} ${courseById(e.courseId)?.code ?? ''}` })),
    ...deadlines
      .filter((d) => d.status !== 'done' && isSameDay(new Date(d.dueDate), day))
      .map<Item>((d) => ({ kind: 'deadline', key: d.id, sort: formatTime(d.dueDate), time: formatTime(d.dueDate), title: d.title, courseCode: courseById(d.courseId)?.code })),
    ...studySessions
      .filter((s) => isSameDay(new Date(s.startAt), day))
      .map<Item>((s) => ({ kind: 'session', key: s.id, sort: formatTime(s.startAt), session: s })),
  ].sort((a, b) => a.sort.localeCompare(b.sort))

  const nowMin = now.getHours() * 60 + now.getMinutes()

  return (
    <article className={cn('rounded-3xl border bg-surface p-4 transition sm:p-5 shadow-card', isToday ? 'border-brand-500/40 shadow-lg shadow-brand-500/5' : 'border-slate-200', isPast && 'opacity-80')}>
      <header className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-baseline gap-2">
          <span className="text-xl font-extrabold text-slate-900">{WEEKDAY_LONG[dow - 1]}</span>
          <span className="text-sm text-slate-500">{dayLabel(day)}</span>
          {isToday && <span className="self-center rounded-full bg-cta px-2 py-0.5 text-[11px] font-bold uppercase text-white">Hôm nay</span>}
        </h3>
        <button onClick={onAdd} className="rounded-xl p-2 text-slate-500 transition hover:bg-brand-50 hover:text-brand-600" aria-label={`Thêm buổi học ${WEEKDAY_LONG[dow - 1]}`} title="Thêm buổi tự học">
          <Plus className="h-4 w-4" />
        </button>
      </header>

      {items.length === 0 ? (
        <p className="flex items-center gap-2 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
          <Sun className="h-4 w-4 shrink-0 text-amber-500" />
          {isPast ? 'Không có lịch.' : dow >= 6 ? 'Trống, một ngày tốt để ôn thi hoặc nghỉ ngơi.' : 'Trống lịch, thời gian lý tưởng để tự học hoặc nghỉ ngơi.'}
        </p>
      ) : (
        <ul className="space-y-2.5">
          {items.map((it) => {
            if (it.kind === 'session') return <SessionRow key={it.key} s={it.session} now={now} onEdit={() => onEdit(it.session)} />
            if (it.kind === 'class') {
              const start = minutesOf(it.s.startTime)
              const end = minutesOf(it.s.endTime)
              const state = !isToday ? (isPast ? 'past' : null) : nowMin >= end ? 'past' : nowMin >= start ? 'live' : null
              return (
                <Row
                  key={it.key}
                  icon={<Building2 className="h-5 w-5" />}
                  iconClass="bg-slate-100 text-slate-500"
                  time={`${it.s.startTime} – ${it.s.endTime}`}
                  chip={state === 'past' ? { label: 'Đã diễn ra', className: 'bg-slate-200/70 text-slate-600' } : state === 'live' ? { label: 'Đang học', className: 'bg-brand-50 text-brand-700' } : undefined}
                  title={`Trên lớp: ${it.course?.code ?? '—'}${it.s.room ? ` · ${it.s.room}` : ''}`}
                  sub={[it.s.lecturer && `Giảng viên: ${it.s.lecturer}`, it.course?.name].filter(Boolean).join(' · ')}
                  className="bg-slate-50"
                />
              )
            }
            if (it.kind === 'exam') {
              return (
                <Row
                  key={it.key}
                  icon={<GraduationCap className="h-5 w-5" />}
                  iconClass="bg-red-50 text-red-600"
                  time={`${it.time} · Kỳ thi`}
                  title={it.label}
                  sub={it.room ? `Phòng ${it.room}` : undefined}
                  className="bg-red-50/60 ring-1 ring-red-200"
                />
              )
            }
            return (
              <Row
                key={it.key}
                icon={<TriangleAlert className="h-5 w-5" />}
                iconClass="bg-amber-100 text-amber-600"
                time={`${it.time} deadline`}
                title={`Hạn nộp: ${it.title}`}
                sub={it.courseCode}
                className="bg-amber-50/70 ring-1 ring-amber-200"
                action={
                  <Link to={`/tasks?task=${it.key}`} className="rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-amber-600">
                    Xem việc
                  </Link>
                }
              />
            )
          })}
        </ul>
      )}
    </article>
  )
}

function Row({
  icon,
  iconClass,
  time,
  chip,
  title,
  sub,
  className,
  action,
}: {
  icon: ReactNode
  iconClass: string
  time: string
  chip?: { label: string; className: string }
  title: string
  sub?: string
  className?: string
  action?: ReactNode
}) {
  return (
    <li className={cn('flex items-center gap-3 rounded-2xl p-3 sm:p-3.5', className)}>
      <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', iconClass)}>{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2">
          <span className="text-data text-xs font-bold uppercase tabular-nums text-slate-500">{time}</span>
          {chip && <span className={cn('rounded-md px-1.5 py-0.5 text-xs font-semibold', chip.className)}>{chip.label}</span>}
        </p>
        <p className="mt-0.5 truncate font-semibold text-slate-900">{title}</p>
        {sub && <p className="truncate text-xs text-slate-500">{sub}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </li>
  )
}

function SessionRow({ s, now, onEdit }: { s: StudySession; now: Date; onEdit: () => void }) {
  const { courseById, deadlines, exams, toggleStudySessionDone } = useAppData()
  const course = courseById(s.courseId)
  const color = courseColor(course)
  const exam = exams.find((e) => e.id === s.examId)
  const deadline = deadlines.find((d) => d.id === s.deadlineId)
  const start = new Date(s.startAt).getTime()
  const end = new Date(s.endAt).getTime()
  const live = !s.isDone && now.getTime() >= start && now.getTime() < end
  const sub = s.notes || deadline?.title || (exam ? `Ôn thi ${exam.examType}` : '')

  return (
    <li className={cn('relative flex items-center gap-3 overflow-hidden rounded-2xl p-3 pl-4 sm:p-3.5 sm:pl-5', live ? 'bg-brand-50 ring-1 ring-brand-500/30' : 'bg-slate-50')}>
      <span className={cn('absolute inset-y-0 left-0 w-1', live ? 'bg-brand-500' : color.bar)} aria-hidden />
      <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', live ? 'bg-brand-500/15 text-brand-600' : cn(color.soft, color.text))}>
        {exam ? <GraduationCap className="h-5 w-5" /> : deadline ? <BookOpenCheck className="h-5 w-5" /> : <Timer className="h-5 w-5" />}
      </span>
      <button onClick={onEdit} className="min-w-0 flex-1 text-left">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-data text-xs font-bold tabular-nums text-slate-500">{timeRange(s)}</span>
          {live && <span className="rounded-md bg-brand-500/15 px-1.5 py-0.5 text-xs font-semibold text-brand-700">Đang diễn ra</span>}
          {course && <span className={cn('rounded-md px-1.5 py-0.5 text-xs font-semibold', color.soft, color.text)}>{course.code}</span>}
          <span className="text-xs text-slate-500">{formatMinutes(sessionMinutes(s))}</span>
        </span>
        <span className={cn('mt-0.5 block truncate font-bold text-slate-900', s.isDone && 'text-slate-400 line-through')}>Tự học: {s.title}</span>
        {sub && <span className="block truncate text-xs text-slate-500">{sub}</span>}
      </button>
      <button
        onClick={() => toggleStudySessionDone(s.id)}
        aria-pressed={s.isDone}
        className={cn(
          'inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition',
          s.isDone ? 'bg-emerald-500 text-white hover:bg-emerald-600' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
        )}
        title={s.isDone ? 'Bỏ đánh dấu' : 'Đánh dấu đã học xong'}
      >
        <CheckCheck className="h-4 w-4" />
        <span className="hidden sm:inline">{s.isDone ? 'Đã xong' : 'Đánh dấu xong'}</span>
      </button>
    </li>
  )
}

/** Ô ngày nhỏ (thứ + ngày) ở đầu mỗi gợi ý: liếc là biết hôm nào, không phải đọc hết dòng chữ */
function DateBadge({ iso, className }: { iso: string; className?: string }) {
  const d = new Date(iso)
  return (
    <span className={cn('flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl leading-none', className)}>
      <span className="text-[11px] font-bold uppercase">{WEEKDAY_SHORT[(d.getDay() + 6) % 7]}</span>
      <span className="mt-0.5 text-base font-black tabular-nums">{d.getDate()}</span>
    </span>
  )
}

function SuggestionsCard({ suggestions, block, adding, onAccept }: { suggestions: Suggestion[]; block: BlockName; adding: string | null; onAccept: (list: Suggestion[]) => void }) {
  const { courseById } = useAppData()
  const [top, ...rest] = suggestions

  return (
    <section className="surface-card p-4 sm:p-5">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#fb923c] to-[#ea580c] text-white shadow-cta">
          <Sparkles className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-extrabold tracking-tight text-slate-900">Gợi ý cho bạn</h3>
          <p className="truncate text-xs text-slate-500">UniAI xếp vào giờ trống</p>
        </div>
      </div>

      {!top ? (
        <p className="flex items-center gap-2 rounded-2xl bg-emerald-50 px-3 py-3 text-sm font-medium text-emerald-700">
          <CheckCheck className="h-4 w-4 shrink-0" /> Bạn đã lên kế hoạch đủ cho các kỳ thi và deadline sắp tới.
        </p>
      ) : (
        <>
          {/* Gợi ý quan trọng nhất: to, có vạch màu theo mức gấp, giờ đề xuất in lớn (không bị cắt chữ) */}
          <div className={cn('relative overflow-hidden rounded-2xl border p-4 pl-5', top.urgent ? 'border-red-200 bg-red-50/40' : 'border-brand-200 bg-brand-50/40')}>
            <span className={cn('absolute inset-y-0 left-0 w-1', top.urgent ? 'bg-[#ef4444]' : 'bg-[#f97316]')} aria-hidden />
            {top.urgent && (
              <span className="mb-2 inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-red-600 ring-1 ring-inset ring-red-200">
                <TriangleAlert className="h-3 w-3" /> Cần ưu tiên
              </span>
            )}
            <p className="line-clamp-2 text-[15px] font-bold leading-snug text-slate-900">{top.title}</p>
            <p className={cn('mt-1 text-xs font-semibold', top.urgent ? 'text-red-600' : 'text-brand-600')}>{top.reason}</p>

            <div className="mt-3 flex items-center gap-3 rounded-xl bg-surface p-2.5 ring-1 ring-slate-200/70">
              <DateBadge iso={top.startAt} className={top.urgent ? 'bg-red-50 text-red-600' : 'bg-brand-50 text-brand-700'} />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-500">
                  {WEEKDAY_LONG[(new Date(top.startAt).getDay() + 6) % 7]}, {dayLabel(new Date(top.startAt))}
                  {top.late && <span className="ml-1 text-red-600">(sau hạn)</span>}
                </p>
                <p className="text-lg font-black tracking-tight text-slate-900 tabular-nums">{timeRange(top)}</p>
              </div>
            </div>

            <Button busy={adding === top.key || adding === 'all'} onClick={() => onAccept([top])} className="mt-3 w-full">
              <Plus className="h-4 w-4" /> Thêm vào kế hoạch
            </Button>
            <p className="mt-2 text-center text-xs text-slate-500">Đã tránh giờ học trên lớp {block}</p>
          </div>

          {rest.length > 0 && (
            <>
              {/* Nút "Thêm tất cả" đặt ở đây (không ở tiêu đề) để tiêu đề không bị xuống dòng trong cột hẹp */}
              <div className="mb-2 mt-4 flex items-center justify-between gap-2">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Gợi ý khác</p>
                <button
                  onClick={() => onAccept(suggestions)}
                  disabled={adding !== null}
                  className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-full bg-brand-50 px-3 text-xs font-bold text-brand-700 ring-1 ring-inset ring-brand-200 transition hover:bg-brand-100 disabled:opacity-50"
                >
                  <CheckCheck className="h-3.5 w-3.5" /> Thêm tất cả ({suggestions.length})
                </button>
              </div>
              <ul className="space-y-2">
                {rest.map((s) => {
                  const course = courseById(s.courseId)
                  const color = courseColor(course)
                  return (
                    <li key={s.key} className="flex items-center gap-3 rounded-2xl border border-slate-200 p-2 pr-2.5 transition hover:border-slate-300 hover:bg-slate-50">
                      <DateBadge iso={s.startAt} className={cn(color.soft, color.text)} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900">{s.title}</p>
                        <p className="mt-0.5 flex items-center gap-1.5 text-xs font-medium text-slate-600 tabular-nums">
                          {timeRange(s)}
                          {s.urgent && <span className="rounded-full bg-red-50 px-1.5 text-[11px] font-bold text-red-600">Gấp</span>}
                        </p>
                      </div>
                      <button
                        onClick={() => onAccept([s])}
                        disabled={adding !== null}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-brand-200 bg-brand-50 text-brand-600 transition hover:scale-105 hover:bg-cta hover:text-white disabled:opacity-50"
                        aria-label={`Thêm ${s.title}`}
                        title="Thêm vào kế hoạch"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </>
      )}
      <p className="mt-4 flex items-start gap-1.5 text-xs text-slate-500">
        <Lightbulb className="mt-px h-3.5 w-3.5 shrink-0 text-amber-500" /> Gợi ý dựa trên deadline, kỳ thi và giờ trống quanh lịch học.
      </p>
    </section>
  )
}

function DistributionCard({ byCourse, plannedMin }: { byCourse: { courseId: string | null; minutes: number; doneMinutes: number }[]; plannedMin: number }) {
  const { courseById } = useAppData()
  const rows = [...byCourse].sort((a, b) => b.minutes - a.minutes)
  const courseCount = rows.filter((r) => r.courseId).length

  // Biểu đồ tròn: mỗi môn 1 cung, độ dài theo số phút
  const R = 60
  const C = 2 * Math.PI * R
  let offset = 0
  const arcs = rows.map((r) => {
    const course = courseById(r.courseId)
    const len = plannedMin ? (r.minutes / plannedMin) * C : 0
    const arc = { key: r.courseId ?? 'none', color: courseHex(course), len, offset }
    offset += len
    return arc
  })

  return (
    <section className="surface-card p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#3b8fe0] to-[#0b6bcb] text-white shadow-[0_6px_16px_-6px_rgb(11_107_203/0.55)]">
          <PieChart className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-extrabold tracking-tight text-slate-900">Phân bổ trong tuần</h3>
          <p className="text-xs text-slate-500">
            Tổng <span className="font-bold text-slate-700">{formatMinutes(plannedMin)}</span> tự học
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="mt-4 rounded-2xl bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">Chưa có buổi tự học nào trong tuần này.</p>
      ) : (
        <>
          <div className="relative mx-auto my-5 h-40 w-40">
            <svg viewBox="0 0 160 160" className="h-full w-full -rotate-90" role="img" aria-label="Biểu đồ phân bổ giờ tự học theo môn">
              <circle cx="80" cy="80" r={R} fill="none" strokeWidth="16" className="stroke-slate-100" />
              {arcs.map((a) => (
                <circle
                  key={a.key}
                  cx="80"
                  cy="80"
                  r={R}
                  fill="none"
                  stroke={a.color}
                  strokeWidth="16"
                  strokeLinecap="round"
                  strokeDasharray={`${Math.max(0, a.len - 6)} ${C}`}
                  strokeDashoffset={-a.offset - 3}
                  className="transition-all duration-700"
                />
              ))}
            </svg>
            {/* Số ở giữa vừa vòng trong (đường kính ~110px) */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <p className="text-3xl font-black leading-none text-slate-900 tabular-nums">{courseCount}</p>
              <p className="mt-1 text-xs font-bold text-slate-500">môn học</p>
            </div>
          </div>

          <ul className="space-y-2">
            {rows.map((r) => {
              const course = courseById(r.courseId)
              const hex = courseHex(course)
              const pct = plannedMin ? Math.round((r.minutes / plannedMin) * 100) : 0
              return (
                <li key={r.courseId ?? 'none'} className="rounded-xl bg-slate-50 px-3 py-2.5" title={`Đã học ${formatMinutes(r.doneMinutes)} / ${formatMinutes(r.minutes)}`}>
                  <div className="flex items-center gap-2.5">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: hex }} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-slate-900">{course ? course.code : 'Không gắn môn'}</p>
                      {course?.name && <p className="truncate text-xs text-slate-500">{course.name}</p>}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-black tabular-nums" style={{ color: hex }}>
                        {pct}%
                      </p>
                      <p className="text-xs font-medium text-slate-500 tabular-nums">{formatMinutes(r.minutes)}</p>
                    </div>
                  </div>
                  {/* Thanh tỉ lệ: phần đã học đậm, phần còn lại nhạt */}
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200/70">
                    <div className="relative h-full rounded-full" style={{ width: `${pct}%`, background: `${hex}55` }}>
                      <div className="h-full rounded-full" style={{ width: `${r.minutes ? Math.min(100, (r.doneMinutes / r.minutes) * 100) : 0}%`, background: hex }} />
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
          <p className="mt-3 flex items-center gap-3 text-[11px] font-medium text-slate-500">
            <span className="inline-flex items-center gap-1">
              <span className="h-1.5 w-3 rounded-full bg-slate-500" /> Đã học
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-1.5 w-3 rounded-full bg-slate-500/35" /> Đã lên lịch
            </span>
          </p>
        </>
      )}
    </section>
  )
}
