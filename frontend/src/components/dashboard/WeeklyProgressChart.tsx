import type { WeekdayProgress } from '../../lib/tasks'
import { isoDayOfWeek } from '../../lib/date'
import { cn } from '../../lib/cn'
import Card from '../ui/Card'

/**
 * Biểu đồ cột chồng "Tiến độ tuần này" (hoàn thành / chưa làm theo từng ngày T2 → CN).
 * Vẽ bằng HTML + CSS thay cho thư viện recharts (~370 KB) → trang Tổng quan tải nhanh hơn nhiều.
 * Màu chữ / lưới dùng slate-* nên tự đổi theo giao diện sáng / tối; màu cột cố định.
 */
export default function WeeklyProgressChart({ data }: { data: WeekdayProgress[] }) {
  const max = Math.max(1, ...data.map((d) => d.done + d.pending))
  // Trục Y: 4 khoảng chia, mỗi khoảng là số nguyên
  const step = Math.ceil(max / 4)
  const top = step * 4
  const ticks = [4, 3, 2, 1, 0].map((i) => i * step)
  const today = isoDayOfWeek(new Date()) - 1
  const pct = (n: number) => `${(n / top) * 100}%`

  return (
    <Card
      className="xl:col-span-2"
      title="Tiến độ tuần này"
      action={
        <div className="flex items-center gap-3 text-xs font-medium text-slate-500">
          <LegendDot className="bg-[#10b981]" label="Hoàn thành" />
          <LegendDot className="bg-[#f97316]" label="Chưa làm" />
        </div>
      }
    >
      <div className="flex h-56 gap-2 sm:h-64 2xl:h-72" aria-hidden>
        {/* Trục Y */}
        <div className="flex w-6 shrink-0 flex-col justify-between pb-7 text-right text-xs tabular-nums text-slate-400">
          {ticks.map((t) => (
            <span key={t} className="-translate-y-1/2 leading-none first:translate-y-0 last:translate-y-0">
              {t}
            </span>
          ))}
        </div>

        <div className="relative min-w-0 flex-1">
          {/* Lưới ngang */}
          <div className="absolute inset-x-0 bottom-7 top-0 flex flex-col justify-between">
            {ticks.map((t) => (
              <span key={t} className={cn('h-px w-full', t === 0 ? 'bg-slate-200' : 'bg-slate-100')} />
            ))}
          </div>

          {/* Cột */}
          <div className="absolute inset-x-0 bottom-7 top-0 flex items-end">
            {data.map((d, i) => (
              <div key={d.day} className="group relative flex h-full flex-1 items-end justify-center">
                <div
                  className="flex w-[58%] max-w-14 origin-bottom animate-bar-grow flex-col-reverse overflow-hidden rounded-t-lg transition-[filter] duration-200 group-hover:brightness-110"
                  style={{ height: pct(d.done + d.pending), animationDelay: `${i * 50}ms` }}
                >
                  <span className="w-full bg-[#10b981]" style={{ height: d.done + d.pending ? `${(d.done / (d.done + d.pending)) * 100}%` : 0 }} />
                  <span className="w-full flex-1 bg-[#f97316]" />
                </div>
                {/* Chú thích khi rê chuột */}
                {d.done + d.pending > 0 && (
                  <span className="pointer-events-none absolute left-1/2 z-10 mb-1.5 -translate-x-1/2 -translate-y-1 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white opacity-0 shadow-lg transition group-hover:translate-y-0 group-hover:opacity-100 dark:bg-slate-100 dark:text-slate-900" style={{ bottom: pct(d.done + d.pending) }}>
                    {d.done} xong · {d.pending} chưa làm
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Nhãn ngày */}
          <div className="absolute inset-x-0 bottom-0 flex h-7 items-end">
            {data.map((d, i) => (
              <span key={d.day} className={cn('flex-1 text-center text-xs', i === today ? 'font-bold text-brand-600' : 'text-slate-500')}>
                {d.day}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Bản dành cho trình đọc màn hình */}
      <table className="sr-only">
        <caption>Số nhiệm vụ đến hạn mỗi ngày trong tuần</caption>
        <thead>
          <tr>
            <th>Ngày</th>
            <th>Hoàn thành</th>
            <th>Chưa làm</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.day}>
              <td>{d.day}</td>
              <td>{d.done}</td>
              <td>{d.pending}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className={cn('h-2.5 w-2.5 rounded-full', className)} />
      {label}
    </span>
  )
}
