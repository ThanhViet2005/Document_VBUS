import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Lightbulb } from 'lucide-react'
import { useAppData } from '../../store/AppData'
import { formatDate, isSameDay } from '../../lib/date'
import { useNow } from '../../lib/useNow'
import { Planet } from '../ui/SkyBackdrop'

/** Mẹo học tập, đổi mỗi ngày (cùng ngày thì cùng mẹo) */
const TIPS = [
  'Chia deadline lớn thành subtask nhỏ, tick từng bước cho có động lực.',
  'Làm việc khó nhất vào buổi sáng, khi đầu óc còn tỉnh táo.',
  'Học 25 phút, nghỉ 5 phút: cách Pomodoro giúp tập trung lâu hơn.',
  'Ôn lại bài trong 24 giờ sau buổi học để nhớ lâu gấp đôi.',
  'Bài nhóm: chia việc rõ ràng ngay buổi đầu, tránh dồn vào phút chót.',
  'Đặt hạn riêng sớm hơn hạn thật 1 ngày để còn thời gian kiểm tra.',
  'Ngủ đủ giấc trước hôm thi quan trọng hơn thức khuya ôn thêm.',
]

/**
 * Thẻ "Chặng hôm nay" ở khoảng trống cuối thanh điều hướng: vòng tiến độ việc đến hạn hôm nay + mẹo trong ngày,
 * trang trí hành tinh theo chủ đề bầu trời (SkyBackdrop). Bấm để mở trang Nhiệm vụ.
 * Thanh đầy đủ: thẻ chi tiết. Thanh hẹp (iPad / thu gọn): chỉ vòng tiến độ. Màn hình thấp (< 760px): ẩn để menu không phải cuộn.
 * Màu hex cố định vì thanh điều hướng luôn cam ở cả giao diện sáng / tối.
 */
export default function SidebarJourney() {
  const { deadlines } = useAppData()
  const now = useNow(60_000)

  const info = useMemo(() => {
    const today = deadlines.filter((d) => isSameDay(new Date(d.dueDate), now))
    const done = today.filter((d) => d.status === 'done').length
    const next = deadlines
      .filter((d) => d.status !== 'done' && new Date(d.dueDate) > now)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0]
    const dayIndex = Math.floor((now.getTime() - now.getTimezoneOffset() * 60_000) / 86_400_000)
    return { total: today.length, done, next, tip: TIPS[dayIndex % TIPS.length] }
  }, [deadlines, now])

  const pct = info.total ? Math.round((info.done / info.total) * 100) : 100
  const headline = info.total ? `${info.done}/${info.total} việc xong` : 'Hôm nay rảnh rang'
  const detail = info.total
    ? info.done === info.total
      ? 'Hoàn thành chặng hôm nay, tuyệt vời!'
      : `Còn ${info.total - info.done} việc đến hạn hôm nay`
    : info.next
      ? `Hạn tiếp theo: ${info.next.title} · ${formatDate(info.next.dueDate)}`
      : 'Không còn deadline nào, tận hưởng nhé!'

  return (
    <>
      {/* Thanh đầy đủ */}
      <Link
        to="/tasks"
        aria-label={`Chặng hôm nay: ${headline}. ${detail}`}
        className="group relative mx-3 mb-1 mt-3 block overflow-hidden rounded-2xl bg-white/12 p-3.5 ring-1 ring-white/25 backdrop-blur transition duration-300 hover:-translate-y-0.5 hover:bg-white/18 hover:shadow-lg hover:shadow-orange-950/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white nav-compact:hidden [@media(max-height:760px)]:hidden"
      >
        {/* Trang trí: hành tinh xanh FPT (nằm trọn trong thẻ, cạnh tiêu đề) + hành tinh nhỏ + vài ngôi sao */}
        <Planet kind="gas" className="right-1 top-0.5 h-12 w-12 animate-hero-float-slow transition-transform duration-500 group-hover:scale-110" />
        <Planet kind="ice" className="right-14 top-2 h-4 w-4 animate-hero-float" />
        <span className="absolute left-[46%] top-3 h-1 w-1 animate-hero-twinkle rounded-full bg-white" aria-hidden />
        <span className="absolute right-4 top-[58%] h-1 w-1 animate-hero-twinkle rounded-full bg-white [animation-delay:1.2s]" aria-hidden />

        <p className="relative pr-14 text-[11px] font-bold uppercase tracking-wider text-white/85">Chặng hôm nay</p>
        <div className="relative mt-2.5 flex items-center gap-3">
          <Ring pct={pct} />
          <div className="min-w-0">
            <p className="text-sm font-extrabold leading-tight text-white">{headline}</p>
            <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-white/85">{detail}</p>
          </div>
        </div>
        <p className="relative mt-3 flex gap-1.5 rounded-xl bg-[#7c2d12]/25 px-2.5 py-2 text-xs leading-snug text-white/95">
          <Lightbulb className="mt-px h-3.5 w-3.5 shrink-0 text-[#fde68a]" aria-hidden />
          <span>{info.tip}</span>
        </p>
      </Link>

      {/* Thanh hẹp: chỉ vòng tiến độ */}
      <Link
        to="/tasks"
        title={`Chặng hôm nay: ${headline}`}
        aria-label={`Chặng hôm nay: ${headline}`}
        className="mx-auto mb-1 mt-3 hidden h-14 w-14 items-center justify-center rounded-2xl bg-white/12 ring-1 ring-white/25 transition hover:bg-white/20 nav-compact:flex [@media(max-height:760px)]:hidden!"
      >
        <Ring pct={pct} size="sm" />
      </Link>
    </>
  )
}

/** Vòng tiến độ trắng trên nền cam, số % ở giữa */
function Ring({ pct, size = 'md' }: { pct: number; size?: 'sm' | 'md' }) {
  const r = 20
  const c = 2 * Math.PI * r
  return (
    <span className={size === 'md' ? 'relative h-14 w-14 shrink-0' : 'relative h-10 w-10 shrink-0'} aria-hidden>
      <svg viewBox="0 0 48 48" className="h-full w-full -rotate-90">
        <circle cx="24" cy="24" r={r} fill="none" stroke="#fff" strokeOpacity="0.25" strokeWidth="5" />
        <circle
          cx="24"
          cy="24"
          r={r}
          fill="none"
          stroke="#fff"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <span className={size === 'md' ? 'absolute inset-0 flex items-center justify-center text-xs font-black text-white' : 'absolute inset-0 flex items-center justify-center text-[10px] font-black text-white'}>
        {pct}%
      </span>
    </span>
  )
}
