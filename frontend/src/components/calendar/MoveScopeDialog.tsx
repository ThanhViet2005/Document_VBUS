import { useState } from 'react'
import { ArrowRight, CalendarDays, CalendarRange, Repeat } from 'lucide-react'
import { cn } from '../../lib/cn'
import { addDays } from '../../lib/date'
import type { MoveScope } from '../../lib/schedule'
import Modal from '../ui/Modal'
import { Button } from '../ui/Form'

interface Props {
  /** "HTE332423" */
  courseCode: string
  originDate: Date
  originTime: string
  targetDate: Date
  targetTime: string
  busy: boolean
  onConfirm: (scope: MoveScope) => void
  onCancel: () => void
}

const dayLabel = (d: Date) => d.toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' })

/** Hỏi phạm vi khi dời 1 buổi của lịch lặp hằng tuần: chỉ buổi này / buổi này và các tuần sau / tất cả */
export default function MoveScopeDialog({ courseCode, originDate, originTime, targetDate, targetTime, busy, onConfirm, onCancel }: Props) {
  const [scope, setScope] = useState<MoveScope>('one')
  const weekStart = addDays(originDate, -((originDate.getDay() + 6) % 7))
  const targetWeekday = targetDate.toLocaleDateString('vi-VN', { weekday: 'long' })

  const options: { key: MoveScope; icon: typeof CalendarDays; title: string; text: string }[] = [
    { key: 'one', icon: CalendarDays, title: 'Chỉ buổi này', text: `Chỉ dời buổi ${dayLabel(originDate)}. Các tuần khác giữ nguyên lịch cũ.` },
    {
      key: 'following',
      icon: CalendarRange,
      title: 'Buổi này và các tuần sau',
      text: `Từ tuần ${weekStart.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })} trở đi học ${targetWeekday} ${targetTime}. Các tuần trước giữ nguyên.`,
    },
    { key: 'all', icon: Repeat, title: 'Tất cả các tuần', text: `Đổi cả các buổi đã học trước đây sang ${targetWeekday} ${targetTime}.` },
  ]

  return (
    <Modal
      open
      title="Dời buổi học"
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Hủy
          </Button>
          <Button onClick={() => onConfirm(scope)} busy={busy}>
            Dời lịch
          </Button>
        </>
      }
    >
      {/* Tóm tắt: từ đâu → tới đâu */}
      <div className="mb-4 flex items-center gap-3 rounded-2xl bg-brand-50 px-4 py-3 text-sm">
        <div className="min-w-0">
          <p className="font-bold text-slate-900">{courseCode}</p>
          <p className="text-slate-500 line-through">
            {dayLabel(originDate)} · {originTime}
          </p>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-brand-500" />
        <p className="min-w-0 font-semibold text-brand-700">
          {dayLabel(targetDate)} · {targetTime}
        </p>
      </div>

      <div role="radiogroup" aria-label="Phạm vi dời lịch" className="space-y-2">
        {options.map(({ key, icon: Icon, title, text }) => {
          const active = scope === key
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setScope(key)}
              onDoubleClick={() => onConfirm(key)}
              className={cn(
                'flex w-full items-start gap-3 rounded-2xl border p-3.5 text-left transition',
                active ? 'border-brand-500 bg-brand-50/60 ring-2 ring-brand-500/20' : 'border-slate-200 hover:border-brand-500/40 hover:bg-slate-50',
              )}
            >
              <span className={cn('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2', active ? 'border-brand-500' : 'border-slate-300')}>
                {active && <span className="h-2.5 w-2.5 rounded-full bg-brand-500" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                  <Icon className={cn('h-4 w-4', active ? 'text-brand-500' : 'text-slate-400')} />
                  {title}
                </span>
                <span className="mt-0.5 block text-xs text-slate-500">{text}</span>
              </span>
            </button>
          )
        })}
      </div>
    </Modal>
  )
}
