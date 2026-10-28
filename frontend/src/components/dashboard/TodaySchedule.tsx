import { Clock, MapPin, User } from 'lucide-react'
import type { Course, Schedule } from '../../types'
import { cn } from '../../lib/cn'
import { courseColor } from '../../lib/labels'
import Card from '../ui/Card'

interface TodayScheduleProps {
  items: Schedule[]
  courseById: (id: string) => Course | undefined
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export default function TodaySchedule({ items, courseById }: TodayScheduleProps) {
  const now = new Date()
  const nowMin = now.getHours() * 60 + now.getMinutes()

  return (
    <Card title="Lịch học hôm nay" action={<span className="text-xs font-medium text-slate-500">{items.length} buổi</span>}>
      {items.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500">Hôm nay không có lịch học 🎉</p>
      ) : (
        <ol className="space-y-3">
          {items.map((s) => {
            const course = courseById(s.courseId)
            const color = courseColor(course)
            const ongoing = nowMin >= toMinutes(s.startTime) && nowMin < toMinutes(s.endTime)
            const finished = nowMin >= toMinutes(s.endTime)

            return (
              <li
                key={s.id}
                className={cn(
                  'relative rounded-xl border p-3 pl-4',
                  ongoing ? 'border-brand-500/40 bg-brand-50' : 'border-slate-200',
                  // Buổi đã qua: nền lõm + vạch màu nhạt (không giảm độ mờ chữ để vẫn đọc rõ)
                  finished && 'bg-slate-50',
                )}
              >
                <span className={cn('absolute inset-y-3 left-0 w-1 rounded-r-full', color.bar, finished && 'opacity-40')} />
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-slate-900">{course?.code ?? '—'}</p>
                  {ongoing && <span className="rounded-full bg-cta px-2 py-0.5 text-[11px] font-bold text-white">Đang học</span>}
                </div>
                <p className="truncate text-xs text-slate-500">{course?.name}</p>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5 text-slate-400" />
                    {s.startTime} - {s.endTime}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5 text-slate-400" />
                    {s.room}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <User className="h-3.5 w-3.5 text-slate-400" />
                    {s.lecturer}
                  </span>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </Card>
  )
}
