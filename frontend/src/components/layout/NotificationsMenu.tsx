import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, BellOff, BellRing, CalendarClock, GraduationCap, TriangleAlert } from 'lucide-react'
import { useAppData } from '../../store/AppData'
import { cn } from '../../lib/cn'
import { formatDateTime } from '../../lib/date'
import { countdownLabel, useNow } from '../../lib/useNow'
import { enableNotifications, getPushStatus, type PushStatus } from '../../lib/push'
import { setNotifyEnabled, useNotifyEnabled } from '../../lib/notifyPref'
import { useToast } from '../ui/Toast'
import { errorMessage } from '../ui/Form'
import InvitationList from '../groups/InvitationList'

const DAY = 24 * 60 * 60_000

const STATUS_TEXT: Record<PushStatus, string> = {
  unsupported: 'Trình duyệt này không hỗ trợ thông báo.',
  insecure: 'Cần mở UniPlan qua HTTPS để bật thông báo.',
  'ios-needs-install': 'Trên iPhone/iPad: Chia sẻ → "Thêm vào Màn hình chính", mở UniPlan từ đó rồi bật thông báo.',
  denied: 'Bạn đã chặn thông báo. Bật lại trong cài đặt trang web của trình duyệt (biểu tượng ổ khóa cạnh địa chỉ).',
  default: 'Bật để được nhắc deadline theo các mốc bạn chọn trong Cài đặt, kể cả khi đã đóng UniPlan.',
  'local-only': 'Đang nhắc khi UniPlan đang mở. Nhắc cả khi đóng app cần máy chủ Web Push.',
  'push-off': 'Bật để nhận nhắc nhở cả khi đã đóng UniPlan.',
  'push-on': 'Đã bật nhắc deadline trên thiết bị này.',
}

/** Chuông thông báo: deadline quá hạn / sắp đến hạn, kỳ thi sắp tới, và bật nhắc nhở */
export default function NotificationsMenu() {
  const { deadlines, exams, courseById, user, invitations } = useAppData()
  const wanted = useNotifyEnabled(user.id)
  const navigate = useNavigate()
  const toast = useToast()
  const now = useNow(60_000)
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<PushStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const { overdue, soon, upcomingExams } = useMemo(() => {
    const t = now.getTime()
    const open = deadlines.filter((d) => d.status !== 'done')
    return {
      overdue: open.filter((d) => new Date(d.dueDate).getTime() <= t).sort((a, b) => b.dueDate.localeCompare(a.dueDate)),
      // Cùng khung với mốc nhắc sớm nhất (3 ngày trước hạn), gần hạn nhất lên đầu
      soon: open
        .filter((d) => {
          const ms = new Date(d.dueDate).getTime() - t
          return ms > 0 && ms <= 3 * DAY
        })
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
      upcomingExams: exams.filter((e) => {
        const ms = new Date(e.examDate).getTime() - t
        return ms > 0 && ms <= 3 * DAY
      }),
    }
  }, [deadlines, exams, now])
  const count = invitations.length + overdue.length + soon.length

  useEffect(() => {
    if (!open) return
    void getPushStatus().then(setStatus)
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  async function onEnable() {
    setBusy(true)
    try {
      setNotifyEnabled(user.id, true)
      const r = await enableNotifications()
      toast.success(r.push ? 'Đã bật nhắc deadline trên thiết bị này' : (r.note ?? 'Đã bật thông báo'))
    } catch (e) {
      setNotifyEnabled(user.id, false)
      toast.error(errorMessage(e))
    } finally {
      setStatus(await getPushStatus())
      setBusy(false)
    }
  }

  const go = (path: string) => {
    setOpen(false)
    navigate(path)
  }
  // Người dùng đã tắt bằng công tắc trong Cài đặt
  const turnedOff = !wanted && status !== null && !['unsupported', 'insecure', 'ios-needs-install', 'denied'].includes(status)
  const canEnable = turnedOff || status === 'default' || status === 'push-off'
  const isOn = !turnedOff && (status === 'push-on' || status === 'local-only')

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-xl border border-slate-200 bg-surface p-2.5 text-slate-600 hover:bg-slate-100"
        aria-label={count ? `Thông báo (${count})` : 'Thông báo'}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Bell className="h-5 w-5" />
        {count > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white ring-2 ring-surface">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Thông báo"
          className="fixed inset-x-3 top-20 z-40 overflow-hidden rounded-2xl border border-slate-200 bg-surface shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96"
        >
          <div className="max-h-[60vh] overflow-y-auto p-2">
            {count === 0 && upcomingExams.length === 0 && <p className="px-3 py-6 text-center text-sm text-slate-500">Không có gì cần lo lúc này 🎉</p>}
            {/* Lời mời vào nhóm: trả lời ngay tại đây; đồng ý thì chuyển tới nhóm đó */}
            <InvitationList compact onJoined={(id) => go(`/groups?id=${id}`)} />
            <Group title="Quá hạn" items={overdue.slice(0, 5)} more={overdue.length - 5} tone="red" onMore={() => go('/tasks?view=overdue')}>
              {(d) => (
                <Item key={d.id} icon={TriangleAlert} tone="red" title={d.title} meta={`${courseById(d.courseId)?.code ?? ''} · hạn ${formatDateTime(d.dueDate)}`} onClick={() => go(`/tasks?task=${d.id}`)} />
              )}
            </Group>
            <Group title="Trong 3 ngày tới" items={soon.slice(0, 8)} more={soon.length - 8} tone="orange" onMore={() => go('/tasks')}>
              {(d) => (
                <Item key={d.id} icon={CalendarClock} tone="orange" title={d.title} meta={`${courseById(d.courseId)?.code ?? ''} · ${countdownLabel(new Date(d.dueDate), now).text.toLowerCase()}`} onClick={() => go(`/tasks?task=${d.id}`)} />
              )}
            </Group>
            <Group title="Kỳ thi trong 3 ngày" items={upcomingExams} tone="violet">
              {(e) => (
                <Item key={e.id} icon={GraduationCap} tone="violet" title={`${e.examType} ${courseById(e.courseId)?.code ?? ''}`} meta={`${formatDateTime(e.examDate)}${e.room ? ` · ${e.room}` : ''}`} onClick={() => go('/calendar?tab=exams')} />
              )}
            </Group>
          </div>

          <div className="flex items-center gap-3 border-t border-slate-100 bg-slate-50 px-4 py-3">
            {isOn ? (
              <BellRing className="h-4 w-4 shrink-0 text-emerald-500" />
            ) : (
              <BellOff className="h-4 w-4 shrink-0 text-slate-400" />
            )}
            <p className="flex-1 text-xs text-slate-600">{turnedOff ? 'Bạn đã tắt nhắc deadline trên thiết bị này.' : status ? STATUS_TEXT[status] : 'Đang kiểm tra…'}</p>
            {canEnable && (
              <button onClick={() => void onEnable()} disabled={busy} className="shrink-0 rounded-lg bg-cta px-3 py-1.5 text-xs font-semibold text-white hover:bg-cta-hover disabled:opacity-60">
                Bật nhắc nhở
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const TONE = {
  red: 'bg-red-50 text-red-500',
  orange: 'bg-orange-50 text-orange-500',
  violet: 'bg-violet-50 text-violet-500',
}

function Group<T>({ title, items, more = 0, tone, onMore, children }: { title: string; items: T[]; more?: number; tone: keyof typeof TONE; onMore?: () => void; children: (item: T) => ReactNode }) {
  if (items.length === 0) return null
  return (
    <section className="mb-1">
      <h3 className={cn('px-3 pb-1 pt-2 text-xs font-bold uppercase tracking-wide', tone === 'red' ? 'text-red-500' : tone === 'orange' ? 'text-orange-500' : 'text-violet-500')}>{title}</h3>
      <ul>{items.map(children)}</ul>
      {more > 0 && (
        <button onClick={onMore} className="px-3 py-1 text-xs font-semibold text-slate-500 hover:text-slate-800">
          + {more} mục khác
        </button>
      )}
    </section>
  )
}

function Item({ icon: Icon, tone, title, meta, onClick }: { icon: typeof Bell; tone: keyof typeof TONE; title: string; meta: string; onClick: () => void }) {
  return (
    <li>
      <button onClick={onClick} className="flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left hover:bg-slate-100">
        <span className={cn('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', TONE[tone])}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-slate-900">{title}</span>
          <span className="block truncate text-xs text-slate-500">{meta.replace(/^ · /, '')}</span>
        </span>
      </button>
    </li>
  )
}
