import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { CalendarOff, ChevronLeft, ChevronRight, MapPin } from 'lucide-react'
import type { Course, Schedule } from '../../types'
import { cn } from '../../lib/cn'
import { addDays, FPT_SLOTS, isSameDay, toMinutes, WEEKDAY_LONG, WEEKDAY_SHORT } from '../../lib/date'
import { courseColor } from '../../lib/labels'
import { useAppData } from '../../store/AppData'
import { useToast } from '../ui/Toast'
import { errorMessage } from '../ui/Form'
import { isOneOff, planMove, type MoveScope } from '../../lib/schedule'
import MoveScopeDialog from './MoveScopeDialog'

interface Props {
  items: Schedule[]
  courseById: (id: string | null) => Course | undefined
  onSelect: (s: Schedule) => void
  /** Bấm vào ô trống: tạo buổi học mới tại ngày / giờ đó */
  onCreate: (dayOfWeek: number, startTime: string) => void
  /** Kéo thẻ giữ ở mép trái / phải đủ lâu → chuyển tuần (-1 tuần trước, 1 tuần sau) */
  onWeekChange?: (dir: -1 | 1) => void
  /** Thứ 2 của tuần đang xem */
  weekStart: Date
  now: Date
  /** Chiều cao khung lịch trên máy tính (px), do trang tính theo chỗ trống trên màn hình */
  height?: number
}

/** Trạng thái buổi học so với lúc này (chỉ có nghĩa khi biết ngày cụ thể của tuần đang xem) */
export type ClassStatus = 'done' | 'live' | 'next' | 'upcoming'

/** Mỗi màn hình lịch hiện đúng 8 tiếng → cuộn 3 trang (0h–8h, 8h–16h, 16h–24h) là hết ngày */
const HOURS_PER_PAGE = 8
const PAGE_STARTS = [0, 8, 16]
/** Chiều cao 1 giờ không nhỏ hơn mức này (px) để thẻ buổi học vẫn đọc được trên màn hình thấp */
const MIN_HOUR_PX = 36
const DAY_MIN = 24 * 60
/** Bề rộng cột giờ bên trái (px) */
const GUTTER_PX = 64
/** Bước bắt dính khi kéo (phút) */
const SNAP = 15
/** Cột giờ không lưu được 24:00 → kết thúc muộn nhất 23:59 */
const MAX_END = DAY_MIN - 1
const MIN_DURATION = 15
/** Cảm ứng: giữ bao lâu (ms) mới bắt đầu kéo, để vuốt bình thường vẫn cuộn được lịch */
const LONG_PRESS_MS = 350
const MOVE_THRESHOLD = 5
/** Chạm mép trái / phải là chuyển tuần ngay; vẫn giữ ở mép thì cứ mỗi khoảng này (ms) chuyển thêm 1 tuần */
const EDGE_REPEAT_MS = 1200
/** Độ rộng vùng mép tính là "sát tuần bên cạnh" (px) */
const EDGE_ZONE_PX = 40
/** Kéo gần mép trên / dưới thì lịch tự cuộn */
const AUTOSCROLL_ZONE_PX = 56
const AUTOSCROLL_MAX_PX = 16
const HOURS = Array.from({ length: 24 }, (_, i) => i)

function at(date: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number)
  const x = new Date(date)
  x.setHours(h, m, 0, 0)
  return x
}

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))
const snap = (min: number) => Math.round(min / SNAP) * SNAP
const ddmm = (d: Date) => d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })

/** Tính trạng thái của từng buổi trong tuần: đã xong / đang học / buổi kế tiếp trong hôm nay / sắp tới */
export function classStatuses(items: Schedule[], weekStart: Date, now: Date): Map<string, ClassStatus> {
  const result = new Map<string, ClassStatus>()
  let next: { id: string; start: number } | null = null
  for (const s of items) {
    const date = addDays(weekStart, s.dayOfWeek - 1)
    const start = at(date, s.startTime).getTime()
    const end = at(date, s.endTime).getTime()
    const t = now.getTime()
    if (t >= end) result.set(s.id, 'done')
    else if (t >= start) result.set(s.id, 'live')
    else {
      result.set(s.id, 'upcoming')
      if (isSameDay(date, now) && (!next || start < next.start)) next = { id: s.id, start }
    }
  }
  if (next) result.set(next.id, 'next')
  return result
}

/** Vị trí đang hiển thị của 1 buổi (có thể khác dữ liệu khi đang kéo / đang lưu) */
interface Placement {
  id: string
  day: number
  start: number
  end: number
}

type Mode = 'move' | 'resize'

/** Buổi vừa được thả, chờ người dùng chọn phạm vi dời */
interface PendingMove {
  s: Schedule
  target: Placement
  /** Ngày của buổi gốc (tuần lúc bắt đầu kéo) */
  originDate: Date
  /** Ngày được thả tới (tuần đang xem lúc thả) */
  targetDate: Date
}

const dayShort = (d: Date) => d.toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' })

interface Gesture {
  s: Schedule
  mode: Mode
  pointerId: number
  startX: number
  startY: number
  lastX: number
  lastY: number
  origin: Placement
  /** Vị trí con trỏ trong thẻ lúc bắt đầu (để thẻ bám tay đúng chỗ đã cầm) */
  grabX: number
  grabY: number
  /** Khoảng phút từ đầu thẻ tới chỗ cầm */
  grabMin: number
  width: number
  height: number
  /** Đã được phép kéo (chuột: ngay lập tức, cảm ứng: sau khi giữ) */
  armed: boolean
  moved: boolean
  timer?: ReturnType<typeof setTimeout>
  raf?: number
  /** Đang dừng ở mép trái / phải từ lúc nào */
  edge: { dir: -1 | 1; since: number } | null
  /** Thứ 2 của tuần lúc bắt đầu kéo (kéo chạm mép có thể sang tuần khác) */
  weekStart: Date
}

/** Các buổi chồng giờ trong cùng ngày chia nhau bề ngang (lane), như Google Calendar */
function layoutDay(list: Placement[]): Map<string, { lane: number; lanes: number }> {
  const out = new Map<string, { lane: number; lanes: number }>()
  const sorted = [...list].sort((a, b) => a.start - b.start || b.end - a.end)
  let cluster: Placement[] = []
  let laneEnds: number[] = []
  let clusterEnd = -1
  const flush = () => {
    for (const p of cluster) out.get(p.id)!.lanes = laneEnds.length
    cluster = []
    laneEnds = []
  }
  for (const p of sorted) {
    if (p.start >= clusterEnd) flush()
    let lane = laneEnds.findIndex((end) => end <= p.start)
    if (lane < 0) lane = laneEnds.push(p.end) - 1
    else laneEnds[lane] = p.end
    out.set(p.id, { lane, lanes: 1 })
    cluster.push(p)
    clusterEnd = Math.max(clusterEnd, p.end)
  }
  flush()
  return out
}

/** Lịch tuần dạng dòng thời gian 00:00 → 24:00. Kéo thẻ để dời ngày / giờ, kéo mép dưới để đổi giờ kết thúc */
export default function WeekTimetable({ items, courseById, onSelect, onCreate, onWeekChange, weekStart, now, height }: Props) {
  const todayIndex = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).findIndex((d) => isSameDay(d, now))
  const [day, setDay] = useState(todayIndex >= 0 ? todayIndex + 1 : 1)
  // Luôn đủ 7 ngày T2 → CN (kéo thả được sang Chủ nhật kể cả khi chưa có lớp)
  const weekDays = [1, 2, 3, 4, 5, 6, 7]
  const shared = { items, courseById, onSelect, onCreate, onWeekChange, weekStart, now, todayIndex }

  return (
    <>
      {/* Điện thoại: chọn 1 ngày, lịch 1 cột */}
      <div className="md:hidden">
        <div className="mb-3 grid gap-1" style={{ gridTemplateColumns: `repeat(${weekDays.length}, minmax(0, 1fr))` }}>
          {weekDays.map((d) => {
            const count = items.filter((s) => s.dayOfWeek === d).length
            const active = day === d
            return (
              <button
                key={d}
                onClick={() => setDay(d)}
                className={cn(
                  'flex flex-col items-center rounded-xl py-2 text-xs font-bold transition',
                  active ? 'bg-cta text-white shadow-md shadow-brand-500/30' : 'bg-surface text-slate-600 ring-1 ring-slate-200',
                  !active && d - 1 === todayIndex && 'text-brand-600 ring-brand-500/50',
                )}
              >
                {WEEKDAY_SHORT[d - 1]}
                <span className={cn('mt-0.5 text-[10px] font-medium', active ? 'text-white/80' : 'text-slate-500')}>{ddmm(addDays(weekStart, d - 1))}</span>
                <span className={cn('mt-1 h-1 w-1 rounded-full', count ? (active ? 'bg-white' : 'bg-brand-500') : 'bg-transparent')} />
              </button>
            )
          })}
        </div>
        <p className="mb-2 text-sm font-semibold text-slate-700">
          {WEEKDAY_LONG[day - 1]}, {ddmm(addDays(weekStart, day - 1))} {day - 1 === todayIndex && <span className="text-brand-600">· Hôm nay</span>}
        </p>
        <TimeGrid {...shared} days={[day]} showHeader={false} />
      </div>

      {/* Máy tính / iPad */}
      <div className="hidden md:block">
        <TimeGrid {...shared} days={weekDays} showHeader height={height} />
      </div>
    </>
  )
}

interface GridProps extends Props {
  days: number[]
  todayIndex: number
  showHeader: boolean
}

function TimeGrid(props: GridProps) {
  const { days, items, courseById, onSelect, onCreate, weekStart, now, todayIndex, showHeader } = props
  const { saveSchedule, deleteSchedule } = useAppData()
  const toast = useToast()
  const scrollRef = useRef<HTMLDivElement>(null)
  const colsRef = useRef<HTMLDivElement>(null)
  const ghostRef = useRef<HTMLDivElement>(null)
  const headerDaysRef = useRef<HTMLDivElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const previewRef = useRef<Placement | null>(null)
  const justDragged = useRef(false)
  const [preview, setPreview] = useState<Placement | null>(null)
  const [dragging, setDragging] = useState<{ id: string; mode: Mode; width: number; height: number } | null>(null)
  const [liftedId, setLiftedId] = useState<string | null>(null)
  const [edgeUi, setEdgeUi] = useState<{ dir: -1 | 1; progress: number } | null>(null)
  const [saving, setSaving] = useState<Placement | null>(null)

  // Trình xử lý gắn vào window chỉ đọc qua ref → luôn thấy props / hàm mới nhất mà không phải gắn lại
  const ctx = useRef({ props, saveSchedule, deleteSchedule, toast })
  ctx.current = { props, saveSchedule, deleteSchedule, toast }
  // Buổi vừa thả, đang chờ chọn phạm vi dời (chỉ buổi này / các tuần sau / tất cả)
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null)
  const [applying, setApplying] = useState(false)

  const statuses = classStatuses(items, weekStart, now)
  const nowMin = now.getHours() * 60 + now.getMinutes()

  // Hiệu ứng chuyển tuần: lưới trượt vào từ phía tuần mới + thông báo tuần ở giữa.
  // Dùng Web Animations thay vì đổi key để không gắn lại DOM (đang kéo thẻ sẽ mất pointer capture)
  const weekTime = weekStart.getTime()
  const prevWeek = useRef(weekTime)
  const [weekFlash, setWeekFlash] = useState<{ dir: -1 | 1; key: number } | null>(null)
  useEffect(() => {
    const prev = prevWeek.current
    if (weekTime === prev) return
    prevWeek.current = weekTime
    const dir = weekTime > prev ? 1 : -1
    setWeekFlash({ dir, key: weekTime })
    const timer = setTimeout(() => setWeekFlash(null), 1000)
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const frames: Keyframe[] = [
        { transform: `translateX(${dir * 56}px)`, opacity: 0.2 },
        { transform: 'translateX(0)', opacity: 1 },
      ]
      const opts: KeyframeAnimationOptions = { duration: 360, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }
      headerDaysRef.current?.animate(frames, opts)
      colsRef.current?.animate(frames, opts)
    }
    return () => clearTimeout(timer)
  }, [weekTime])

  // Chiều cao 1 giờ = (chiều cao khung lịch − hàng tiêu đề ngày) / 8 → mỗi màn hình vừa đúng 8 tiếng
  const stickyHeaderRef = useRef<HTMLDivElement>(null)
  const [hourPx, setHourPx] = useState(0)
  const [headerPx, setHeaderPx] = useState(0)
  const [pageFits, setPageFits] = useState(true)
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const measure = () => {
      const header = stickyHeaderRef.current?.offsetHeight ?? 0
      setHeaderPx(header)
      const fitted = (el.clientHeight - header) / HOURS_PER_PAGE
      setPageFits(fitted >= MIN_HOUR_PX)
      setHourPx(Math.max(MIN_HOUR_PX, fitted))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    if (stickyHeaderRef.current) ro.observe(stickyHeaderRef.current)
    return () => ro.disconnect()
  }, [])

  // Mở đúng trang 8 tiếng chứa giờ hiện tại (nếu tuần này) hoặc buổi học sớm nhất.
  // Chạy khi đo xong và một lần nữa khi dữ liệu tải xong; kéo thả xong thì không cuộn lại
  const autoScrolled = useRef<'none' | 'default' | 'data'>('none')
  const hasItems = items.length > 0
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el || !hourPx || autoScrolled.current === 'data' || (autoScrolled.current === 'default' && !hasItems)) return
    const focusMin = todayIndex >= 0 ? nowMin : hasItems ? Math.min(...items.map((s) => toMinutes(s.startTime))) : 7 * 60
    const page = Math.min(PAGE_STARTS.length - 1, Math.floor(focusMin / (HOURS_PER_PAGE * 60)))
    el.scrollTop = PAGE_STARTS[page] * hourPx
    autoScrolled.current = hasItems ? 'data' : 'default'
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ chạy khi đo xong / có dữ liệu lần đầu
  }, [hasItems, hourPx > 0])

  const minuteAt = (clientY: number) => {
    const rect = colsRef.current!.getBoundingClientRect()
    return ((clientY - rect.top) / hourPx) * 60
  }

  const dayAt = (clientX: number, fallback: number) => {
    const { days } = ctx.current.props
    const rect = colsRef.current?.getBoundingClientRect()
    if (!rect || days.length === 1) return fallback
    return days[clamp(Math.floor(((clientX - rect.left) / rect.width) * days.length), 0, days.length - 1)]
  }

  /** Vị trí thả (đã bắt dính) theo con trỏ hiện tại. Tính theo tọa độ tuyệt đối nên vẫn đúng khi lịch tự cuộn */
  const updatePreview = (g: Gesture) => {
    const m = minuteAt(g.lastY)
    let next: Placement
    if (g.mode === 'move') {
      const duration = g.origin.end - g.origin.start
      const start = clamp(snap(m - g.grabMin), 0, MAX_END - duration)
      next = { id: g.origin.id, day: dayAt(g.lastX, g.origin.day), start, end: start + duration }
    } else {
      next = { ...g.origin, end: clamp(snap(m), g.origin.start + MIN_DURATION, MAX_END) }
    }
    const cur = previewRef.current
    if (!cur || cur.day !== next.day || cur.start !== next.start || cur.end !== next.end) {
      previewRef.current = next
      setPreview(next)
    }
  }

  /** Thẻ "bóng" bám theo con trỏ: đổi transform trực tiếp, không render lại React → mượt 60fps */
  const placeGhost = (g: Gesture) => {
    if (ghostRef.current) ghostRef.current.style.transform = `translate3d(${g.lastX - g.grabX}px, ${g.lastY - g.grabY}px, 0) rotate(1.5deg)`
  }

  /** Vòng lặp mỗi khung hình khi đang kéo: tự cuộn dọc + đếm thời gian dừng ở mép để chuyển tuần */
  const tick = () => {
    const g = gesture.current
    const sc = scrollRef.current
    if (!g || !g.moved || !sc) return
    const r = sc.getBoundingClientRect()

    let dy = 0
    if (g.lastY < r.top + AUTOSCROLL_ZONE_PX) dy = -AUTOSCROLL_MAX_PX * (1 - Math.max(0, g.lastY - r.top) / AUTOSCROLL_ZONE_PX)
    else if (g.lastY > r.bottom - AUTOSCROLL_ZONE_PX) dy = AUTOSCROLL_MAX_PX * (1 - Math.max(0, r.bottom - g.lastY) / AUTOSCROLL_ZONE_PX)
    if (dy) {
      sc.scrollTop += dy
      updatePreview(g)
    }

    const { days, onWeekChange } = ctx.current.props
    if (g.mode === 'move' && days.length > 1 && onWeekChange) {
      const dir = g.lastX < r.left + GUTTER_PX + EDGE_ZONE_PX ? -1 : g.lastX > r.right - EDGE_ZONE_PX ? 1 : 0
      const t = performance.now()
      if (dir) {
        // Vừa chạm mép: lùi mốc thời gian để chuyển tuần ngay ở khung hình này
        if (!g.edge || g.edge.dir !== dir) g.edge = { dir, since: t - EDGE_REPEAT_MS }
        const progress = (t - g.edge.since) / EDGE_REPEAT_MS
        if (progress >= 1) {
          onWeekChange(dir)
          navigator.vibrate?.(15)
          g.edge.since = t // còn giữ ở mép thì một lúc sau chuyển tiếp tuần nữa
          setEdgeUi({ dir, progress: 0 })
        } else {
          setEdgeUi((prev) => (prev && prev.dir === dir && Math.abs(prev.progress - progress) < 0.02 ? prev : { dir, progress }))
        }
      } else if (g.edge) {
        g.edge = null
        setEdgeUi(null)
      }
    }
    g.raf = requestAnimationFrame(tick)
  }

  const end = () => {
    const g = gesture.current
    if (g?.timer) clearTimeout(g.timer)
    if (g?.raf) cancelAnimationFrame(g.raf)
    gesture.current = null
    previewRef.current = null
    window.removeEventListener('pointermove', win.move)
    window.removeEventListener('pointerup', win.up)
    window.removeEventListener('pointercancel', win.cancel)
    window.removeEventListener('touchmove', win.touch)
    document.body.style.removeProperty('user-select')
    document.body.style.removeProperty('cursor')
    setPreview(null)
    setDragging(null)
    setLiftedId(null)
    setEdgeUi(null)
  }

  const onMove = (e: PointerEvent) => {
    const g = gesture.current
    if (!g || g.pointerId !== e.pointerId) return
    g.lastX = e.clientX
    g.lastY = e.clientY
    const dist = Math.hypot(e.clientX - g.startX, e.clientY - g.startY)
    if (!g.armed) {
      // Cảm ứng vuốt trước khi giữ đủ lâu → người dùng đang cuộn, bỏ thao tác kéo
      if (dist > MOVE_THRESHOLD * 2) end()
      return
    }
    if (!g.moved) {
      if (dist < MOVE_THRESHOLD) return
      g.moved = true
      setDragging({ id: g.origin.id, mode: g.mode, width: g.width, height: g.height })
      document.body.style.userSelect = 'none'
      document.body.style.cursor = g.mode === 'move' ? 'grabbing' : 'ns-resize'
      g.raf = requestAnimationFrame(tick)
    }
    placeGhost(g)
    updatePreview(g)
  }

  const onUp = async (e: PointerEvent) => {
    const g = gesture.current
    if (!g || g.pointerId !== e.pointerId) return
    const target = previewRef.current
    const { moved, origin, s } = g
    end()
    if (!moved) {
      ctx.current.props.onSelect(s)
      return
    }
    // Nhả chuột trên ô trống sau khi kéo, trình duyệt vẫn bắn "click" → không mở form tạo buổi mới
    justDragged.current = true
    setTimeout(() => (justDragged.current = false), 0)
    if (!target || (target.day === origin.day && target.start === origin.start && target.end === origin.end)) return
    // Giữ thẻ ở chỗ mới trong lúc hỏi phạm vi / đang lưu để không bị nhảy về chỗ cũ
    setSaving(target)
    const move: PendingMove = {
      s,
      target,
      originDate: addDays(g.weekStart, origin.day - 1),
      targetDate: addDays(ctx.current.props.weekStart, target.day - 1),
    }
    // Buổi 1 lần (đã dời riêng / học bù) không có "các tuần khác" → dời luôn, không hỏi
    if (isOneOff(s)) void applyMove(move, 'all')
    else setPendingMove(move)
  }

  async function applyMove(move: PendingMove, scope: MoveScope) {
    const { s, target, originDate, targetDate } = move
    const { saveSchedule, deleteSchedule, toast } = ctx.current
    const plan = planMove(s, scope, { dayOfWeek: target.day, startTime: hhmm(target.start), endTime: hhmm(target.end) }, originDate, targetDate)
    setApplying(true)
    try {
      if (plan.create) {
        // Tạo dòng mới trước; sửa dòng cũ lỗi thì xóa dòng mới để không bị trùng buổi
        const created = await saveSchedule(plan.create)
        try {
          await saveSchedule(plan.update)
        } catch (err) {
          await deleteSchedule(created.id).catch(() => undefined)
          throw err
        }
      } else {
        await saveSchedule(plan.update)
      }
      const where = `${WEEKDAY_SHORT[target.day - 1]} ${hhmm(target.start)}–${hhmm(target.end)}`
      toast.success(
        scope === 'one' && !isOneOff(s)
          ? `Đã dời riêng buổi ${dayShort(originDate)} sang ${dayShort(targetDate)} ${hhmm(target.start)}`
          : scope === 'following' && plan.create
            ? `Từ tuần này trở đi học ${where}`
            : `Đã dời sang ${where}`,
      )
    } catch (err) {
      toast.error(`Không dời được lịch: ${errorMessage(err)}`)
    } finally {
      setApplying(false)
      setPendingMove(null)
      setSaving(null)
    }
  }

  // Hàm ổn định để gắn / gỡ khỏi window; bên trong gọi bản mới nhất
  const fns = useRef({ onMove, onUp, end })
  fns.current = { onMove, onUp, end }
  const win = useRef({
    move: (e: PointerEvent) => fns.current.onMove(e),
    up: (e: PointerEvent) => void fns.current.onUp(e),
    cancel: () => fns.current.end(),
    // Đã cầm thẻ (cảm ứng) thì chặn cuộn trang; listener phải non-passive mới preventDefault được
    touch: (e: TouchEvent) => {
      if (gesture.current?.armed) e.preventDefault()
    },
  }).current

  // Rời trang khi đang kéo → gỡ listener
  useEffect(() => () => fns.current.end(), [])

  const placementOf = (s: Schedule): Placement => {
    if (saving?.id === s.id) return saving
    // Kéo mép dưới: thẻ dài ra ngay tại chỗ. Kéo di chuyển: thẻ gốc đứng yên, có khung đích + thẻ bóng riêng
    if (dragging?.mode === 'resize' && preview?.id === s.id) return preview
    return { id: s.id, day: s.dayOfWeek, start: toMinutes(s.startTime), end: toMinutes(s.endTime) }
  }

  function onPointerDown(e: ReactPointerEvent, s: Schedule, mode: Mode) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if (gesture.current) return
    e.stopPropagation()
    const card = (e.currentTarget as HTMLElement).closest<HTMLElement>('[data-event]') ?? (e.currentTarget as HTMLElement)
    const rect = card.getBoundingClientRect()
    const origin = placementOf(s)
    const g: Gesture = {
      s,
      mode,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      origin,
      grabX: e.clientX - rect.left,
      grabY: e.clientY - rect.top,
      grabMin: minuteAt(e.clientY) - origin.start,
      width: rect.width,
      height: rect.height,
      armed: e.pointerType !== 'touch',
      moved: false,
      edge: null,
      weekStart: props.weekStart,
    }
    if (e.pointerType === 'touch') {
      g.timer = setTimeout(() => {
        g.armed = true
        navigator.vibrate?.(12)
        setLiftedId(s.id) // nhấc thẻ lên báo hiệu có thể kéo
      }, LONG_PRESS_MS)
    }
    gesture.current = g
    // Thẻ gốc không bị gỡ khỏi DOM trong lúc kéo nên giữ được pointer capture (kể cả khi chuột ra ngoài cửa sổ)
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    window.addEventListener('pointermove', win.move)
    window.addEventListener('pointerup', win.up)
    window.addEventListener('pointercancel', win.cancel)
    window.addEventListener('touchmove', win.touch, { passive: false })
  }

  function onEmptyClick(e: ReactMouseEvent<HTMLDivElement>, d: number) {
    if (e.target !== e.currentTarget || justDragged.current) return
    const rect = e.currentTarget.getBoundingClientRect()
    const min = clamp(Math.floor((((e.clientY - rect.top) / hourPx) * 60) / 30) * 30, 0, DAY_MIN - 60)
    onCreate(d, hhmm(min))
  }

  const placements = items.map(placementOf)
  const cols = `repeat(${days.length}, minmax(${days.length > 1 ? 120 : 0}px, 1fr))`
  const moving = dragging?.mode === 'move' ? dragging : null
  const movingItem = moving ? items.find((x) => x.id === moving.id) : undefined

  return (
    <div className="relative">
      {/* Máy tính: cao đúng phần màn hình còn trống (trang đo sẵn), cuộn hết trang vẫn thấy hàng ngày. Điện thoại: theo màn hình */}
      <div
        ref={scrollRef}
        className="relative overflow-auto overscroll-contain rounded-2xl border border-slate-200 bg-surface shadow-card"
        style={{
          // Bắt dính theo trang 8 tiếng: mỗi lần lăn chuột nhảy đúng 1 trang. Tắt khi đang kéo thẻ để lịch tự cuộn mượt
          // Màn hình quá thấp (1 trang không đủ 8 tiếng) thì tắt bắt dính, nếu không sẽ có giờ bị nhảy qua không xem được
          scrollSnapType: dragging || !pageFits ? 'none' : 'y mandatory',
          scrollPaddingTop: headerPx,
          height: showHeader
            ? (props.height ?? 'max(18rem, calc(100dvh - var(--app-header-h, 4.5rem) - 12rem))')
            : 'max(26rem, calc(100dvh - var(--app-header-h, 4.5rem) - 14rem))',
        }}
      >
        <div className={cn(days.length > 1 && 'min-w-200')}>
          {showHeader && (
            <div ref={stickyHeaderRef} className="sticky top-0 z-20 grid overflow-hidden border-b border-slate-200 bg-surface" style={{ gridTemplateColumns: `${GUTTER_PX}px minmax(0, 1fr)` }}>
              <div className="relative z-10 flex items-end justify-end bg-surface px-2 pb-2 text-[10px] font-semibold text-slate-500">GMT+07</div>
              <div ref={headerDaysRef} className="grid" style={{ gridTemplateColumns: cols }}>
              {days.map((d) => {
                const isToday = d - 1 === todayIndex
                const isTarget = moving && preview?.day === d
                return (
                  <div key={d} className={cn('relative border-l border-slate-100 px-2 py-2.5 text-center transition-colors', isToday && 'bg-brand-50', isTarget && 'bg-brand-100')}>
                    {isToday && <span className="absolute inset-x-0 top-0 h-1 bg-brand-500" aria-hidden />}
                    <p className={cn('text-xs font-bold uppercase', isToday || isTarget ? 'text-brand-600' : 'text-slate-500')}>{WEEKDAY_SHORT[d - 1]}</p>
                    <p className={cn('mx-auto mt-0.5 flex h-8 w-8 items-center justify-center rounded-full text-base font-extrabold', isToday ? 'bg-cta text-white' : 'text-slate-900')}>
                      {addDays(weekStart, d - 1).getDate()}
                    </p>
                  </div>
                )
              })}
              </div>
            </div>
          )}

          <div className="grid" style={{ gridTemplateColumns: `${GUTTER_PX}px minmax(0, 1fr)` }}>
            {/* Cột giờ + nhãn slot FPT */}
            <div className="relative" style={{ height: 24 * hourPx }}>
              {/* Mốc bắt dính đầu mỗi trang: 0h, 8h, 16h */}
              {PAGE_STARTS.map((h) => (
                <span key={h} className="pointer-events-none absolute inset-x-0 h-px snap-start" style={{ top: h * hourPx }} aria-hidden />
              ))}
              {!showHeader && <span className="absolute right-2 top-1 text-[10px] font-semibold text-slate-500">GMT+07</span>}
              {HOURS.slice(1).map((h) => (
                <span key={h} className="absolute right-2 -translate-y-1/2 text-[11px] text-slate-500" style={{ top: h * hourPx }}>
                  {hhmm(h * 60)}
                </span>
              ))}
              {FPT_SLOTS.map((slot) => (
                <span
                  key={slot.label}
                  className="absolute left-1 rounded bg-brand-50 px-1 text-[10px] font-bold uppercase text-brand-600"
                  style={{ top: (toMinutes(slot.start) / 60) * hourPx + 2 }}
                  title={`${slot.label}: ${slot.start}–${slot.end}`}
                >
                  {slot.label.replace('Slot ', 'S')}
                </span>
              ))}
            </div>

            <div ref={colsRef} className="relative grid" style={{ gridTemplateColumns: cols, height: 24 * hourPx }}>
              {/* Đường kẻ giờ (nét liền) và nửa giờ (nét đứt) */}
              <div className="pointer-events-none absolute inset-0" aria-hidden>
                {HOURS.map((h) => (
                  <div key={h}>
                    <div className="absolute inset-x-0 border-t border-slate-200" style={{ top: h * hourPx }} />
                    <div className="absolute inset-x-0 border-t border-dashed border-slate-100" style={{ top: h * hourPx + hourPx / 2 }} />
                  </div>
                ))}
              </div>

              {days.map((d) => {
                const isToday = d - 1 === todayIndex
                const dayItems = placements.filter((p) => p.day === d)
                const lanes = layoutDay(dayItems)
                return (
                  <div
                    key={d}
                    onClick={(e) => onEmptyClick(e, d)}
                    className={cn('relative cursor-cell border-l border-slate-100 transition-colors', isToday && 'bg-brand-50/40', moving && preview?.day === d && 'bg-brand-50/70')}
                    title="Bấm để thêm buổi học"
                  >
                    {dayItems.map((p) => {
                      const s = items.find((x) => x.id === p.id)!
                      const { lane, lanes: count } = lanes.get(p.id)!
                      return (
                        <EventCard
                          key={p.id}
                          s={s}
                          p={p}
                          course={courseById(s.courseId)}
                          status={statuses.get(s.id) ?? 'upcoming'}
                          variant={moving?.id === p.id ? 'source' : 'normal'}
                          lifted={liftedId === p.id || (dragging?.mode === 'resize' && dragging.id === p.id)}
                          saving={saving?.id === p.id}
                          style={{
                            top: (p.start / 60) * hourPx + 1,
                            height: Math.max(20, ((p.end - p.start) / 60) * hourPx - 2),
                            left: `calc(${(lane / count) * 100}% + 2px)`,
                            width: `calc(${100 / count}% - 4px)`,
                          }}
                          onPointerDown={onPointerDown}
                          onKeyOpen={() => onSelect(s)}
                        />
                      )
                    })}

                    {/* Khung đích: chỗ thẻ sẽ nằm khi thả, trượt mượt theo bước 15 phút */}
                    {moving && preview?.day === d && (
                      <div
                        className="pointer-events-none absolute inset-x-1 z-10 flex items-start rounded-lg border-2 border-dashed border-brand-500 bg-brand-500/10 px-2 py-1 text-[11px] font-bold text-brand-600 transition-[top] duration-100 ease-out"
                        style={{ top: (preview.start / 60) * hourPx + 1, height: Math.max(20, ((preview.end - preview.start) / 60) * hourPx - 2) }}
                        aria-hidden
                      >
                        {hhmm(preview.start)} – {hhmm(preview.end)}
                      </div>
                    )}

                    {isToday && (
                      <div className="pointer-events-none absolute inset-x-0 z-10" style={{ top: (nowMin / 60) * hourPx }} aria-hidden>
                        <span className="absolute -left-1.5 -top-1.5 h-3 w-3 rounded-full bg-red-500" />
                        <div className="border-t-2 border-red-500" />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {pendingMove && (
        <MoveScopeDialog
          courseCode={courseById(pendingMove.s.courseId)?.code ?? 'Buổi học'}
          originDate={pendingMove.originDate}
          originTime={`${pendingMove.s.startTime}–${pendingMove.s.endTime}`}
          targetDate={pendingMove.targetDate}
          targetTime={`${hhmm(pendingMove.target.start)}–${hhmm(pendingMove.target.end)}`}
          busy={applying}
          onConfirm={(scope) => void applyMove(pendingMove, scope)}
          onCancel={() => {
            if (applying) return
            setPendingMove(null)
            setSaving(null) // thẻ trượt về chỗ cũ
          }}
        />
      )}

      {/* Thông báo tuần mới: hiện giữa lịch rồi mờ dần, key đổi mỗi lần chuyển để chạy lại hiệu ứng */}
      {weekFlash && (
        <div
          key={weekFlash.key}
          className="pointer-events-none absolute left-1/2 top-16 z-40 flex animate-week-flash items-center gap-2 rounded-full bg-[#0f172a]/90 px-4 py-2 text-sm font-semibold text-white shadow-xl backdrop-blur"
          role="status"
        >
          {weekFlash.dir === -1 && <ChevronLeft className="h-4 w-4 text-[#fb923c]" />}
          <span>
            Tuần {ddmm(weekStart)} – {ddmm(addDays(weekStart, 6))}
          </span>
          {weekFlash.dir === 1 && <ChevronRight className="h-4 w-4 text-[#fb923c]" />}
        </div>
      )}

      {/* Mép trái / phải khi đang kéo: chạm vào là chuyển tuần, thanh tiến độ cho biết bao lâu nữa chuyển tiếp */}
      {moving && props.onWeekChange && days.length > 1 && (
        <>
          <EdgeZone dir={-1} active={edgeUi?.dir === -1} progress={edgeUi?.dir === -1 ? edgeUi.progress : 0} />
          <EdgeZone dir={1} active={edgeUi?.dir === 1} progress={edgeUi?.dir === 1 ? edgeUi.progress : 0} />
        </>
      )}

      {/* Thẻ bóng bám theo con trỏ (gắn vào body để position: fixed không bị lệch) */}
      {moving &&
        movingItem &&
        createPortal(
          <div
            ref={ghostRef}
            className="pointer-events-none fixed left-0 top-0 z-[100] will-change-transform"
            style={{
              width: moving.width,
              height: moving.height,
              transform: gesture.current ? `translate3d(${gesture.current.lastX - gesture.current.grabX}px, ${gesture.current.lastY - gesture.current.grabY}px, 0) rotate(1.5deg)` : undefined,
            }}
          >
            <EventCard
              s={movingItem}
              p={preview ?? placementOf(movingItem)}
              course={courseById(movingItem.courseId)}
              status={statuses.get(movingItem.id) ?? 'upcoming'}
              variant="ghost"
              lifted
              saving={false}
              style={{ inset: 0 }}
            />
          </div>,
          document.body,
        )}
    </div>
  )
}

function EdgeZone({ dir, active, progress }: { dir: -1 | 1; active: boolean; progress: number }) {
  const Icon = dir === -1 ? ChevronLeft : ChevronRight
  return (
    <div
      className={cn(
        'pointer-events-none absolute bottom-0 top-0 z-30 flex w-14 items-center justify-center rounded-2xl transition-opacity duration-200',
        dir === -1 ? 'left-0 bg-gradient-to-r' : 'right-0 bg-gradient-to-l',
        active ? 'from-brand-500/30 to-transparent opacity-100' : 'from-brand-500/10 to-transparent opacity-70',
      )}
      aria-hidden
    >
      <div className={cn('flex flex-col items-center gap-1.5 rounded-xl bg-surface/95 px-1.5 py-2 shadow-lg ring-1 ring-brand-500/30 transition-transform', active && 'scale-110')}>
        <Icon className="h-4 w-4 text-brand-600" />
        <span className="text-[10px] font-bold uppercase leading-tight text-brand-600 [writing-mode:vertical-rl]">{dir === -1 ? 'Tuần trước' : 'Tuần sau'}</span>
        {/* Thanh đếm tới lần chuyển tuần tiếp theo */}
        <span className="h-10 w-1 overflow-hidden rounded-full bg-brand-100">
          <span className="block w-full rounded-full bg-brand-500" style={{ height: `${Math.min(1, progress) * 100}%` }} />
        </span>
      </div>
    </div>
  )
}

interface EventCardProps {
  s: Schedule
  p: Placement
  course?: Course
  status: ClassStatus
  /** source: thẻ gốc mờ đi khi đang được kéo; ghost: thẻ bóng bám theo con trỏ */
  variant?: 'normal' | 'source' | 'ghost'
  lifted: boolean
  saving: boolean
  style: CSSProperties
  onPointerDown?: (e: ReactPointerEvent, s: Schedule, mode: Mode) => void
  onKeyOpen?: () => void
}

function EventCard({ s, p, course, status, variant = 'normal', lifted, saving, style, onPointerDown, onKeyOpen }: EventCardProps) {
  const color = courseColor(course)
  const highlight = status === 'live' || status === 'next'
  const short = p.end - p.start <= 45
  const ghost = variant === 'ghost'

  return (
    <div
      data-event
      role={ghost ? undefined : 'button'}
      tabIndex={ghost ? -1 : 0}
      aria-hidden={ghost || undefined}
      aria-label={ghost ? undefined : `${course?.code ?? 'Buổi học'} ${hhmm(p.start)}–${hhmm(p.end)}, kéo để dời lịch`}
      onPointerDown={onPointerDown && ((e) => onPointerDown(e, s, 'move'))}
      onKeyDown={(e) => {
        if (onKeyOpen && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onKeyOpen()
        }
      }}
      onContextMenu={(e) => e.preventDefault()}
      style={style}
      className={cn(
        'group absolute z-1 cursor-grab touch-pan-y select-none overflow-hidden rounded-lg py-1 pl-2.5 pr-1.5 text-left text-xs transition-[opacity,box-shadow,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
        highlight ? 'bg-gradient-to-br from-[#f97316] to-[#ea580c] text-white shadow-md shadow-brand-500/30' : cn(color.soft, 'text-slate-800'),
        status === 'done' && variant === 'normal' && !lifted && 'opacity-60',
        variant === 'source' && 'opacity-30',
        ghost && 'shadow-2xl ring-2 ring-brand-500',
        lifted && !ghost && 'z-30 scale-[1.02] shadow-xl ring-2 ring-brand-500',
        saving && 'animate-pulse',
      )}
    >
      {!highlight && <span className={cn('absolute inset-y-0 left-0 w-1', color.bar)} aria-hidden />}
      <p className={cn('truncate font-bold', highlight ? 'text-white' : color.text)}>
        {course?.code ?? '—'}
        {short && <span className={cn('ml-1 font-medium', highlight ? 'text-white/85' : 'text-slate-600')}>{hhmm(p.start)}</span>}
        {status === 'live' && <span className="ml-1 rounded bg-white/25 px-1 text-[10px] uppercase">Đang học</span>}
      </p>
      {!short && (
        <>
          <p className={cn('truncate', highlight ? 'text-white/90' : 'text-slate-600')}>
            {ghost && <span className="mr-1 font-bold">{WEEKDAY_SHORT[p.day - 1]}</span>}
            {hhmm(p.start)} – {hhmm(p.end)}
          </p>
          {s.room && (
            <p className={cn('flex items-center gap-1 truncate', highlight ? 'text-white/85' : 'text-slate-500')}>
              <MapPin className="h-3 w-3 shrink-0" />
              {s.room}
            </p>
          )}
          {s.endDate && (
            <p className={cn('flex items-center gap-1 truncate', highlight ? 'text-white/85' : 'text-slate-500')}>
              <CalendarOff className="h-3 w-3 shrink-0" />
              Đến {s.endDate.slice(8, 10)}/{s.endDate.slice(5, 7)}
            </p>
          )}
        </>
      )}

      {/* Kéo mép dưới để đổi giờ kết thúc */}
      {!ghost && (
        <div onPointerDown={onPointerDown && ((e) => onPointerDown(e, s, 'resize'))} className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize" aria-hidden>
          <span className={cn('mx-auto mt-0.5 block h-0.5 w-6 rounded-full opacity-0 transition group-hover:opacity-100', highlight ? 'bg-white/80' : 'bg-slate-400')} />
        </div>
      )}
    </div>
  )
}
