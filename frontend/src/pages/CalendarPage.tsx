import { useLayoutEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowRight, BookOpen, CalendarCheck, CalendarDays, ChevronLeft, ChevronRight, Clock, GraduationCap, Laptop, MapPin, Plus, Timer } from 'lucide-react'
import { useAppData } from '../store/AppData'
import { cn } from '../lib/cn'
import { addDays, formatDateTime, isoDayOfWeek, isSameDay, startOfWeek } from '../lib/date'
import { occursOn } from '../lib/schedule'
import { useNow } from '../lib/useNow'
import type { ScheduleInput } from '../services/api'
import type { BlockName, Schedule } from '../types'
import { BLOCKS } from '../lib/labels'
import WeekTimetable, { classStatuses } from '../components/calendar/WeekTimetable'
import ScheduleForm from '../components/calendar/ScheduleForm'
import ExamsPanel from '../components/calendar/ExamsPanel'
import { Button, EmptyState } from '../components/ui/Form'

type Tab = 'timetable' | 'exams'

export default function CalendarPage() {
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('tab') === 'exams' ? 'exams' : 'timetable'
  const { exams } = useAppData()
  const now = useNow(60_000)
  const hasUpcomingExam = exams.some((e) => new Date(e.examDate) > now)
  const goTab = (key: Tab) => setParams(key === 'exams' ? { tab: 'exams' } : {}, { replace: true })

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-1 rounded-2xl border border-slate-200 bg-surface p-1 text-sm font-semibold sm:inline-grid shadow-card" role="tablist">
        {(
          [
            // [khóa, nhãn đầy đủ, nhãn ngắn trên điện thoại, biểu tượng]
            ['timetable', 'Thời khóa biểu', 'Thời khóa biểu', CalendarDays],
            ['exams', 'Lịch thi PE / FE', 'Lịch thi', GraduationCap],
          ] as const
        ).map(([key, label, short, Icon]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => goTab(key)}
            className={cn(
              'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 transition sm:px-4',
              tab === key ? 'bg-cta text-white shadow-md shadow-brand-500/30' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800',
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="sm:hidden">{short}</span>
            <span className="hidden sm:inline">{label}</span>
            {key === 'exams' && hasUpcomingExam && tab !== 'exams' && <span className="h-2 w-2 rounded-full bg-brand-500" aria-label="Có kỳ thi sắp tới" />}
          </button>
        ))}
      </div>

      {tab === 'timetable' ? <Timetable now={now} onShowExams={() => goTab('exams')} /> : <ExamsPanel />}
    </div>
  )
}

function weekLabel(offset: number): string {
  if (offset === 0) return 'Tuần này'
  if (offset === 1) return 'Tuần sau'
  if (offset === -1) return 'Tuần trước'
  return offset > 0 ? `${offset} tuần sau` : `${-offset} tuần trước`
}

function Timetable({ now, onShowExams }: { now: Date; onShowExams: () => void }) {
  const { schedules, courses, user, courseById } = useAppData()
  const mine = courses.filter((c) => c.userId === user.id)
  // Mặc định chọn Block đang có lịch; người dùng tự chuyển Block khi sang 5 tuần sau
  const [block, setBlock] = useState<BlockName>(() => BLOCKS.find((b) => schedules.some((s) => s.blockPeriod === b)) ?? 'Block 1')
  const [editing, setEditing] = useState<ScheduleInput | null>(null)
  const [offset, setOffset] = useState(0)

  const weekStart = addDays(startOfWeek(now), offset * 7)
  // Buổi học đã qua ngày kết thúc thì không hiện ở tuần đó nữa
  const items = schedules.filter((s) => s.blockPeriod === block && occursOn(s, addDays(weekStart, s.dayOfWeek - 1), s.dayOfWeek))
  const weekEnd = addDays(weekStart, 6)
  const courseCount = new Set(items.map((s) => s.courseId)).size

  // Chiều cao lịch = phần màn hình còn lại dưới thanh tiêu đề + thanh chọn tuần (đang dính) + đệm đáy trang.
  // Đo bằng JS vì thanh chọn tuần xuống 2 dòng trên màn hẹp; nhờ vậy cuộn hết trang vẫn thấy hàng ngày của lịch
  const toolbarRef = useRef<HTMLElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [gridHeight, setGridHeight] = useState<number | undefined>()
  useLayoutEffect(() => {
    const bar = toolbarRef.current
    const wrap = wrapRef.current
    if (!bar || !wrap) return
    const header = document.querySelector('header')
    const measure = () => {
      const main = wrap.closest('main')
      // Khoảng từ đáy lịch tới đáy trang (đệm đáy của <main> trừ phần lịch được kéo xuống bằng margin âm); không đổi khi cuộn
      const bottomGap = main ? main.getBoundingClientRect().bottom - wrap.getBoundingClientRect().bottom : 0
      const headerH = header?.getBoundingClientRect().height ?? 72
      // 8px: khoảng cách thanh chọn tuần với thanh tiêu đề; 16px: khoảng cách thanh chọn tuần với lịch
      setGridHeight(Math.max(288, Math.floor(window.innerHeight - headerH - 8 - bar.offsetHeight - 16 - bottomGap)))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(bar)
    if (header) ro.observe(header)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  const blank = (): ScheduleInput => ({
    courseId: mine.find((c) => c.blockName === block)?.id ?? mine[0]?.id ?? '',
    dayOfWeek: isoDayOfWeek(new Date()),
    room: '',
    lecturer: '',
    startTime: '07:00',
    endTime: '09:15',
    blockPeriod: block,
  })

  return (
    // Máy tính: kéo lịch xuống phần đệm đáy trang (6rem → còn 1rem) để lịch dài vừa khít màn hình
    <div ref={wrapRef} className="space-y-4 md:-mb-20">
      {/* Kỳ thi sắp tới + thống kê tuần đặt trên cùng, để lịch bên dưới có chỗ kéo dài */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <NextExamCard now={now} onShowExams={onShowExams} />
        <WeekStats items={items} weekStart={weekStart} now={now} />
      </div>

      {/* Thanh công cụ: Block · số môn · chọn tuần · thêm buổi */}
      {/* Máy tính / iPad: dính ngay dưới thanh tiêu đề khi cuộn, để luôn biết đang xem tuần nào */}
      <section
        ref={toolbarRef}
        className="z-10 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-surface/90 p-3 shadow-sm backdrop-blur md:sticky"
        style={{ top: 'calc(var(--app-header-h, 4.5rem) + 0.5rem)' }}
      >
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1 text-sm font-semibold">
          {BLOCKS.map((b) => (
            <button
              key={b}
              onClick={() => setBlock(b)}
              aria-pressed={block === b}
              className={cn('rounded-lg px-3 py-1.5 transition', block === b ? 'bg-cta text-white shadow-sm shadow-brand-500/30' : 'text-slate-500 hover:text-slate-800')}
            >
              {b} <span className={cn('text-xs', block === b ? 'text-white/80' : 'text-slate-400')}>· {schedules.filter((s) => s.blockPeriod === b).length}</span>
            </button>
          ))}
        </div>
        <p className="inline-flex items-center gap-1.5 text-sm text-slate-500">
          <BookOpen className="h-4 w-4 text-emerald-500" />
          {courseCount} môn đang học
        </p>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-xl bg-slate-100 p-1">
            <button onClick={() => setOffset((o) => o - 1)} className="rounded-lg p-1.5 text-slate-500 transition hover:bg-surface hover:text-slate-900" aria-label="Tuần trước">
              <ChevronLeft className="h-4 w-4" />
            </button>
            {/* key đổi theo tuần → nhãn trượt nhẹ vào mỗi lần chuyển */}
            <p key={offset} className="min-w-44 animate-week-label px-2 text-center text-sm" aria-live="polite">
              <span className="font-bold text-slate-900">{weekLabel(offset)}</span>{' '}
              <span className="text-xs text-slate-500">
                ({weekStart.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })} – {weekEnd.toLocaleDateString('vi-VN')})
              </span>
            </p>
            <button onClick={() => setOffset((o) => o + 1)} className="rounded-lg p-1.5 text-slate-500 transition hover:bg-surface hover:text-slate-900" aria-label="Tuần sau">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <Button variant="secondary" onClick={() => setOffset(0)} disabled={offset === 0} className="py-1.5">
            Hôm nay
          </Button>
          <Button onClick={() => setEditing(blank())} className="py-1.5">
            <Plus className="h-4 w-4" /> Thêm buổi học
          </Button>
        </div>
      </section>

      {schedules.length === 0 && mine.length === 0 ? (
        <EmptyState icon={<CalendarDays className="h-6 w-6" />} title="Chưa có thời khóa biểu" text="Thêm môn học trước, sau đó xếp các buổi học lặp lại hằng tuần theo slot." />
      ) : (
        <WeekTimetable
          items={items}
          courseById={courseById}
          onSelect={(s) => setEditing(s)}
          onCreate={(dayOfWeek, startTime) => {
            const [h, m] = startTime.split(':').map(Number)
            // Mặc định 1 slot FPT (2 giờ 15 phút), không vượt quá 23:59
            const end = Math.min(h * 60 + m + 135, 24 * 60 - 1)
            setEditing({ ...blank(), dayOfWeek, startTime, endTime: `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}` })
          }}
          onWeekChange={(dir) => setOffset((o) => o + dir)}
          height={gridHeight}
          weekStart={weekStart}
          now={now}
        />
      )}

      {editing && <ScheduleForm initial={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

/** Kỳ thi gần nhất: đếm ngược, giờ, phòng, nút sang tab Lịch thi */
function NextExamCard({ now, onShowExams }: { now: Date; onShowExams: () => void }) {
  const { exams, courseById } = useAppData()
  const next = exams.filter((e) => new Date(e.examDate) > now).sort((a, b) => a.examDate.localeCompare(b.examDate))[0]

  if (!next) {
    return (
      <section className="surface-card flex flex-col gap-4 border-dashed p-5 sm:flex-row sm:items-center lg:col-span-2">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#fb923c] to-[#ea580c] text-white shadow-cta">
          <CalendarCheck className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-extrabold tracking-tight text-slate-900">Chưa có kỳ thi sắp tới</p>
          <p className="text-sm text-slate-500">Thêm lịch thi PE / FE để theo dõi đếm ngược.</p>
        </div>
        <Button variant="secondary" onClick={onShowExams}>
          <Plus className="h-4 w-4" /> Thêm kỳ thi
        </Button>
      </section>
    )
  }

  const course = courseById(next.courseId)
  const ms = new Date(next.examDate).getTime() - now.getTime()
  const days = Math.floor(ms / 86_400_000)
  const hours = Math.floor((ms % 86_400_000) / 3_600_000)
  const minutes = Math.floor((ms % 3_600_000) / 60_000)
  // Còn dưới 3 ngày: tông đỏ để nhắc ôn gấp (cùng ngưỡng với countdownLabel trong lib/useNow.ts)
  const urgent = days < 3
  const tone = urgent
    ? { tile: 'from-[#f87171] to-[#dc2626]', ring: 'bg-red-50 text-red-600 ring-red-200' }
    : { tile: 'from-[#fbbf24] to-[#f59e0b]', ring: 'bg-amber-50 text-amber-700 ring-amber-300' }
  const parts: [number, string][] = days > 0 ? [[days, 'ngày'], [hours, 'giờ']] : [[hours, 'giờ'], [minutes, 'phút']]

  return (
    <section className="surface-card group relative isolate flex flex-col gap-4 overflow-hidden p-5 sm:flex-row sm:items-center lg:col-span-2">
      {/* Họa tiết bản đồ mờ góc phải */}
      <div className="bg-trail pointer-events-none absolute inset-y-0 right-0 -z-10 w-1/2 text-slate-300/50 [mask-image:linear-gradient(to_left,black,transparent)]" aria-hidden />

      <span className={cn('flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg', tone.tile)}>
        <GraduationCap className="h-7 w-7 group-hover:animate-wiggle" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2">
          <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ring-inset', tone.ring)}>
            {next.examType} · {next.examType === 'PE' ? 'Practical Exam' : 'Final Exam'}
          </span>
          <span className="text-xs font-semibold text-slate-500">Kỳ thi gần nhất</span>
        </p>
        <p className="mt-1.5 truncate text-xl font-black tracking-tight text-slate-900">
          {course?.code ?? '—'}
          {course?.name && <span className="ml-2 text-base font-semibold text-slate-500">{course.name}</span>}
        </p>
        {/* Thông tin thi dạng chip: dễ quét mắt hơn một dòng dài */}
        <div className="mt-2.5 flex flex-wrap gap-1.5 text-xs font-semibold text-slate-700">
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1">
            <Clock className="h-3.5 w-3.5 text-slate-500" /> {formatDateTime(next.examDate)}
          </span>
          {next.durationMinutes ? (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1">
              <Timer className="h-3.5 w-3.5 text-slate-500" /> {next.durationMinutes} phút
            </span>
          ) : null}
          {next.examFormat && (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1">
              <Laptop className="h-3.5 w-3.5 text-slate-500" /> {next.examFormat}
            </span>
          )}
          {next.room && (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-2.5 py-1 text-brand-700">
              <MapPin className="h-3.5 w-3.5" /> {next.room}
            </span>
          )}
        </div>
      </div>

      {/* Đếm ngược: số to, nhìn là biết còn bao lâu */}
      <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-stretch">
        <div className={cn('flex items-baseline justify-center gap-2 rounded-2xl px-4 py-2.5 ring-1 ring-inset', tone.ring)} aria-label={`Còn ${parts.map(([n, u]) => `${n} ${u}`).join(' ')}`}>
          {parts.map(([n, u]) => (
            <span key={u} className="flex items-baseline gap-1">
              <span className="text-2xl font-black leading-none tabular-nums">{n}</span>
              <span className="text-xs font-bold">{u}</span>
            </span>
          ))}
        </div>
        <Button onClick={onShowExams} className="flex-1 sm:flex-none">
          Xem lịch thi <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </section>
  )
}

/** Thống kê buổi học của tuần đang xem: đã học / hôm nay / còn lại (thanh tiến độ 3 đoạn) */
function WeekStats({ items, weekStart, now }: { items: Schedule[]; weekStart: Date; now: Date }) {
  const statuses = classStatuses(items, weekStart, now)
  const today = items.filter((s) => isSameDay(addDays(weekStart, s.dayOfWeek - 1), now) && statuses.get(s.id) !== 'done').length
  const done = [...statuses.values()].filter((v) => v === 'done').length
  const left = items.length - done - today
  const pct = items.length ? Math.round((done / items.length) * 100) : 0
  const seg = (n: number) => (items.length ? `${(n / items.length) * 100}%` : '0%')

  return (
    <section className="surface-card group relative overflow-hidden p-5">
      <span className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-[#10b981] opacity-10 blur-2xl transition-opacity duration-300 group-hover:opacity-25" aria-hidden />
      <div className="relative flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#5cc765] to-[#2f9a3a] text-white shadow-[0_6px_16px_-6px_rgb(63_174_73/0.55)]">
          <BookOpen className="h-5 w-5 group-hover:animate-wiggle" />
        </span>
        <p className="min-w-0 flex-1 text-xs font-bold uppercase leading-tight tracking-wide text-slate-600">Buổi học trong tuần</p>
        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">{pct}%</span>
      </div>

      <p className="relative mt-3 flex items-baseline gap-1.5">
        <span className="text-3xl font-black leading-tight tracking-tight text-slate-900 tabular-nums">{done}</span>
        <span className="text-sm font-semibold text-slate-500">/ {items.length} buổi đã học</span>
      </p>

      {/* Thanh 3 đoạn: đã học (xanh) · hôm nay (cam) · còn lại (nền) */}
      <div
        className="relative mt-2.5 flex h-2 overflow-hidden rounded-full bg-slate-100"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label="Buổi học đã hoàn thành trong tuần"
      >
        <div className="h-full bg-[#10b981] transition-[width] duration-700 ease-out" style={{ width: seg(done) }} />
        <div className="h-full bg-[#f97316] transition-[width] duration-700 ease-out" style={{ width: seg(today) }} />
      </div>

      <div className="relative mt-3 flex flex-wrap gap-1.5 text-xs font-semibold">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">
          <span className="h-2 w-2 rounded-full bg-[#10b981]" />
          Đã học {done}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 px-2.5 py-1 text-orange-600">
          <span className="h-2 w-2 rounded-full bg-[#f97316]" />
          Hôm nay {today}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
          <span className="h-2 w-2 rounded-full bg-slate-400" />
          Còn lại {left}
        </span>
      </div>
    </section>
  )
}
