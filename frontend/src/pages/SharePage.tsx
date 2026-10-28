import { useEffect, useState } from 'react'
import ThemeToggle from '../components/ui/ThemeToggle'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { CalendarClock, CalendarPlus, Link2Off, ListChecks, Loader2 } from 'lucide-react'
import { useAuth } from '../store/Auth'
import { isSupabaseConfigured } from '../lib/supabase'
import { cn } from '../lib/cn'
import { formatDateTime } from '../lib/date'
import { courseColor, PRIORITY_LABEL, PRIORITY_STYLE, TASK_TYPE_LABEL } from '../lib/labels'
import * as api from '../services/api'
import type { SharedDeadline } from '../types'
import { Button, errorMessage } from '../components/ui/Form'
import { useToast } from '../components/ui/Toast'

type State = { kind: 'loading' } | { kind: 'ready'; data: SharedDeadline } | { kind: 'missing' } | { kind: 'error'; message: string }

/** Trang công khai mở từ link "Gửi cho bạn": xem trước rồi thêm vào lịch cá nhân */
export default function SharePage() {
  const { code = '' } = useParams()
  const { userId, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()
  const [state, setState] = useState<State>(isSupabaseConfigured ? { kind: 'loading' } : { kind: 'error', message: 'Ứng dụng chưa kết nối máy chủ nên không mở được link chia sẻ.' })
  const [copying, setCopying] = useState(false)

  useEffect(() => {
    if (!isSupabaseConfigured) return
    if (!/^[A-Za-z0-9]{6,16}$/.test(code)) {
      setState({ kind: 'missing' })
      return
    }
    api
      .getSharedDeadline(code)
      .then((data) => setState(data ? { kind: 'ready', data } : { kind: 'missing' }))
      .catch((e: unknown) => setState({ kind: 'error', message: errorMessage(e) }))
  }, [code])

  async function onCopy() {
    if (!userId) {
      navigate('/login', { state: { from: location } })
      return
    }
    setCopying(true)
    try {
      await api.copySharedDeadline(code)
      toast.success('Đã thêm vào lịch của bạn')
      navigate('/tasks', { replace: true })
    } catch (e) {
      toast.error(errorMessage(e))
      setCopying(false)
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-br from-brand-50 to-surface px-4 py-10">
      <ThemeToggle className="fixed right-4 top-4 z-10" />
      <div className="w-full max-w-md">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2">
          <img src="/pwa-icon.svg" alt="" className="h-9 w-9 rounded-xl" />
          <span className="text-lg font-extrabold text-slate-900">
            Uni<span className="text-brand-500">Plan</span>
          </span>
        </Link>

        <div className="rounded-3xl border border-slate-200 bg-surface p-6 shadow-xl shadow-brand-500/10">
          {state.kind === 'loading' && (
            <div className="flex justify-center py-10">
              <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
            </div>
          )}

          {(state.kind === 'missing' || state.kind === 'error') && (
            <div className="py-6 text-center">
              <Link2Off className="mx-auto h-10 w-10 text-slate-400" />
              <h1 className="mt-3 text-lg font-bold text-slate-900">{state.kind === 'missing' ? 'Link không còn hiệu lực' : 'Không mở được link'}</h1>
              <p className="mt-1 text-sm text-slate-500">
                {state.kind === 'missing' ? 'Link chia sẻ không tồn tại, đã hết hạn hoặc hết lượt sử dụng.' : state.message}
              </p>
            </div>
          )}

          {state.kind === 'ready' && <Preview data={state.data} />}

          {state.kind === 'ready' && (
            <Button className="mt-6 w-full" onClick={() => void onCopy()} busy={copying || authLoading}>
              <CalendarPlus className="h-4 w-4" />
              {userId ? 'Thêm vào lịch của tôi' : 'Đăng nhập để thêm vào lịch'}
            </Button>
          )}
        </div>
        <p className="mt-4 text-center text-xs text-slate-500">Bản sao là của riêng bạn: thay đổi của bạn không ảnh hưởng tới người gửi.</p>
      </div>
    </div>
  )
}

function Preview({ data }: { data: SharedDeadline }) {
  const color = courseColor(data.course)
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">Bạn được gửi một deadline</p>
      <h1 className="mt-2 text-xl font-bold text-slate-900">{data.title}</h1>
      <div className="mt-3 flex flex-wrap gap-1.5 text-xs font-medium">
        {data.course && <span className={cn('rounded-md px-2 py-0.5', color.soft, color.text)}>#{data.course.code}</span>}
        <span className={cn('rounded-md px-2 py-0.5', PRIORITY_STYLE[data.priority])}>{PRIORITY_LABEL[data.priority]}</span>
        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-slate-600">{TASK_TYPE_LABEL[data.taskType]}</span>
      </div>
      {data.course && <p className="mt-2 text-sm text-slate-500">{data.course.name}</p>}
      <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
        <CalendarClock className="h-4 w-4 text-brand-500" />
        Hạn nộp: {formatDateTime(data.dueDate)}
      </p>
      {data.subtasks.length > 0 && (
        <div className="mt-4">
          <p className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <ListChecks className="h-4 w-4 text-slate-400" /> {data.subtasks.length} bước nhỏ
          </p>
          <ul className="list-inside list-disc space-y-0.5 text-sm text-slate-600">
            {data.subtasks.map((s, i) => (
              <li key={i}>{s.title}</li>
            ))}
          </ul>
        </div>
      )}
      {data.notes && <p className="mt-4 whitespace-pre-line rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">{data.notes}</p>}
    </div>
  )
}
