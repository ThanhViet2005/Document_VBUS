import type { ReactNode } from 'react'
import { Flag, Flame, Mountain, Sparkles, Target } from 'lucide-react'
import { formatVietnamDay, greeting } from '../../lib/date'
import { useNow } from '../../lib/useNow'
import { cn } from '../../lib/cn'

interface HeroBannerProps {
  name: string
  todayCount: number
  overdueCount: number
  progress: number
}

/** Câu khích lệ theo tiến độ: giọng "phiêu lưu", ngắn, thân thiện kiểu sinh viên */
function motto(progress: number, overdue: number): string {
  if (overdue > 0) return 'Còn vài chặng bị bỏ lỡ, xử lý ngay để lấy lại phong độ nhé!'
  if (progress >= 100) return 'Cắm cờ trên đỉnh rồi! Thưởng cho mình một ly trà sữa nào.'
  if (progress >= 60) return 'Đã qua nửa hành trình, đỉnh núi ở ngay trước mặt!'
  if (progress >= 25) return 'Khởi động tốt, giữ nhịp này thêm chút nữa thôi.'
  return 'Mỗi deadline là một chặng, bắt đầu chặng đầu tiên thôi!'
}

export default function HeroBanner({ name, todayCount, overdueCount, progress }: HeroBannerProps) {
  const firstName = name.trim().split(/\s+/).pop()
  // Cập nhật mỗi phút để lời chào đổi đúng lúc sang buổi mới khi đang mở app
  const now = useNow(60_000)
  const pct = Math.max(0, Math.min(100, progress))

  return (
    // Nền cam cố định bằng mã hex (brand-600 bị đổi ở giao diện tối)
    <section className="relative isolate overflow-hidden rounded-hero bg-gradient-to-br from-[#fb8a2e] via-[#f97316] to-[#e8590c] p-6 text-white shadow-[0_20px_40px_-20px_rgb(234_88_12/0.6)] sm:p-8">
      {/* Họa tiết: lưới chấm "bản đồ" + vệt xanh FPT chéo góc + vòng tròn mờ */}
      <div className="bg-trail pointer-events-none absolute inset-0 -z-10 text-white/15 [mask-image:linear-gradient(110deg,transparent_35%,black)]" aria-hidden />
      <div className="pointer-events-none absolute -bottom-24 -right-10 -z-10 h-64 w-64 rotate-12 rounded-[3rem] bg-[#0b6bcb]/25 blur-sm" aria-hidden />
      <div className="pointer-events-none absolute -right-16 -top-20 -z-10 h-56 w-56 rounded-full bg-white/10" aria-hidden />

      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold ring-1 ring-white/25 backdrop-blur">
            <Sparkles className="h-3.5 w-3.5" />
            {formatVietnamDay(now)}
          </p>
          <h2 className="text-2xl font-black leading-tight tracking-tight sm:text-4xl">
            {greeting(now)}, {firstName}!
          </h2>
          <p className="mt-2 max-w-xl text-sm font-medium text-white/90 sm:text-base">{motto(pct, overdueCount)}</p>

          {/* Chip nhiệm vụ: số liệu chính của hôm nay, đọc được trong 1 giây */}
          <div className="mt-4 flex flex-wrap gap-2">
            <Chip icon={<Target className="h-4 w-4" />}>
              <b className="font-extrabold tabular-nums">{todayCount}</b> nhiệm vụ hôm nay
            </Chip>
            <Chip icon={<Flame className="h-4 w-4" />} alert={overdueCount > 0}>
              <b className="font-extrabold tabular-nums">{overdueCount}</b> quá hạn
            </Chip>
          </div>
        </div>

        <JourneyTrail value={pct} />
      </div>
    </section>
  )
}

function Chip({ icon, alert, children }: { icon: ReactNode; alert?: boolean; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ring-1 backdrop-blur',
        // Quá hạn > 0: chip trắng chữ đỏ để nổi hẳn trên nền cam
        alert ? 'bg-white text-[#b91c1c] ring-white' : 'bg-white/15 text-white ring-white/25',
      )}
    >
      {icon}
      <span>{children}</span>
    </span>
  )
}

/**
 * Tiến độ tổng thể dạng "đường lên đỉnh": vạch tiến độ có 4 mốc (0 / 33 / 66 / 100%) và biểu tượng leo dần theo phần trăm.
 * Vẫn là thanh tiến độ chuẩn cho trình đọc màn hình (role="progressbar").
 */
function JourneyTrail({ value }: { value: number }) {
  const marks = [0, 33, 66, 100]
  return (
    <div className="w-full shrink-0 rounded-2xl bg-white/15 p-4 ring-1 ring-white/25 backdrop-blur lg:w-80">
      <div className="mb-7 flex items-end justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-white/85">Hành trình học kỳ</p>
          <p className="text-3xl font-black leading-none tabular-nums">{value}%</p>
        </div>
        <Mountain className="h-8 w-8 text-white/85" aria-hidden />
      </div>

      <div role="progressbar" aria-label="Tiến độ tổng thể" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} className="relative h-3 rounded-full bg-black/15">
        <div className="h-full rounded-full bg-white transition-[width] duration-700 ease-out" style={{ width: `${value}%` }} />
        {marks.map((m) => (
          <span
            key={m}
            className={cn('absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2', value >= m ? 'bg-white ring-[#fdba74]' : 'bg-[#f97316] ring-white/60')}
            style={{ left: `${m}%` }}
            aria-hidden
          />
        ))}
        {/* Lá cờ đi theo tiến độ */}
        <span className="absolute -top-6 -translate-x-1/2 transition-[left] duration-700 ease-out" style={{ left: `${value}%` }} aria-hidden>
          <Flag className="h-4 w-4 fill-white" />
        </span>
      </div>
      <div className="mt-2 flex justify-between text-[11px] font-semibold text-white/80">
        <span>Xuất phát</span>
        <span>Đỉnh</span>
      </div>
    </div>
  )
}
