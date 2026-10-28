import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { MailCheck, MailX } from 'lucide-react'
import ThemeToggle from '../components/ui/ThemeToggle'
import { Button, errorMessage } from '../components/ui/Form'
import { isSupabaseConfigured } from '../lib/supabase'
import * as api from '../services/api'

const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type State = { kind: 'confirm' } | { kind: 'busy' } | { kind: 'done' } | { kind: 'invalid' } | { kind: 'error'; message: string }

/**
 * Trang công khai mở từ link "Hủy nhận email" cuối email tổng hợp. Không cần đăng nhập.
 * Phải bấm nút xác nhận (không tự hủy khi mở trang) vì bộ lọc thư rác / trình xem trước email hay tự mở link trong thư.
 */
export default function UnsubscribePage() {
  const [params] = useSearchParams()
  const token = params.get('t') ?? ''
  const [state, setState] = useState<State>(isSupabaseConfigured && TOKEN_RE.test(token) ? { kind: 'confirm' } : { kind: 'invalid' })

  async function onConfirm() {
    setState({ kind: 'busy' })
    try {
      setState((await api.unsubscribeDigest(token)) ? { kind: 'done' } : { kind: 'invalid' })
    } catch (e) {
      setState({ kind: 'error', message: errorMessage(e) })
    }
  }

  const done = state.kind === 'done'
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

        <div className="rounded-3xl border border-slate-200 bg-surface p-6 text-center shadow-xl shadow-brand-500/10">
          <span className={done ? 'mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600' : 'mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600'}>
            {done ? <MailCheck className="h-7 w-7" /> : <MailX className="h-7 w-7" />}
          </span>

          {(state.kind === 'confirm' || state.kind === 'busy') && (
            <>
              <h1 className="mt-4 text-xl font-extrabold text-slate-900">Hủy nhận email tổng hợp?</h1>
              <p className="mt-2 text-sm text-slate-600">Bạn sẽ không nhận email tổng hợp nhiệm vụ lúc 7:00 sáng nữa. Có thể bật lại bất cứ lúc nào trong Cài đặt.</p>
              <Button className="mt-6 w-full" onClick={() => void onConfirm()} busy={state.kind === 'busy'}>
                Hủy nhận email
              </Button>
            </>
          )}
          {done && (
            <>
              <h1 className="mt-4 text-xl font-extrabold text-slate-900">Đã hủy nhận email</h1>
              <p className="mt-2 text-sm text-slate-600">Bạn sẽ không nhận email tổng hợp nữa. Muốn nhận lại: Cài đặt → Email tổng hợp mỗi sáng.</p>
            </>
          )}
          {state.kind === 'invalid' && (
            <>
              <h1 className="mt-4 text-xl font-extrabold text-slate-900">Link không hợp lệ</h1>
              <p className="mt-2 text-sm text-slate-600">Link hủy nhận không đúng hoặc đã cũ. Bạn có thể tắt email trong Cài đặt của UniPlan.</p>
            </>
          )}
          {state.kind === 'error' && (
            <>
              <h1 className="mt-4 text-xl font-extrabold text-slate-900">Chưa hủy được</h1>
              <p className="mt-2 text-sm text-slate-600">{state.message}</p>
              <Button className="mt-6 w-full" onClick={() => void onConfirm()}>
                Thử lại
              </Button>
            </>
          )}

          <Link to="/settings" className="mt-4 inline-block text-sm font-semibold text-brand-600 hover:underline">
            Mở Cài đặt UniPlan
          </Link>
        </div>
      </div>
    </div>
  )
}
