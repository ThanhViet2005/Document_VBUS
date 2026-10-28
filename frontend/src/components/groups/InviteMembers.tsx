import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { Clock, Loader2, RotateCcw, Search, Send, UserX, X } from 'lucide-react'
import type { Group, InviteCandidate, SentInvitation } from '../../types'
import * as api from '../../services/api'
import { supabase } from '../../lib/supabase'
import { cn } from '../../lib/cn'
import { useAppData } from '../../store/AppData'
import Avatar from '../ui/Avatar'
import { errorMessage, FormError, inputClass } from '../ui/Form'
import { useToast } from '../ui/Toast'

/** Gõ ít nhất 2 ký tự mới gợi ý; chờ người dùng ngừng gõ 300ms rồi mới hỏi máy chủ */
const MIN_QUERY = 2
const DEBOUNCE_MS = 300

/**
 * Chủ nhóm mời bạn: gõ tên (không cần dấu) hoặc email → gợi ý 2–3 tài khoản → bấm "Mời".
 * Người được mời phải đồng ý thì mới vào nhóm; danh sách bên dưới cho thấy lời mời đang chờ / bị từ chối.
 */
export default function InviteMembers({ group }: { group: Group }) {
  const { inviteMember, isDemo } = useAppData()
  const toast = useToast()
  const listId = useId()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<InviteCandidate[]>([])
  const [searching, setSearching] = useState(false)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<SentInvitation[]>([])
  const boxRef = useRef<HTMLDivElement>(null)
  const trimmed = query.trim()

  const loadSent = useCallback(() => {
    if (isDemo) return
    void api.fetchSentInvitations(group.id).then(setSent, () => setSent([]))
  }, [group.id, isDemo])

  // Tải lời mời đã gửi; tải lại khi có người vào nhóm (đồng ý) hoặc lời mời đổi trạng thái (từ chối)
  useEffect(loadSent, [loadSent, group.members.length])
  useEffect(() => {
    if (isDemo || !supabase) return
    const sb = supabase
    const channel = sb
      .channel(`invites:${group.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'group_invitations', filter: `group_id=eq.${group.id}` }, loadSent)
      .subscribe()
    return () => void sb.removeChannel(channel)
  }, [group.id, isDemo, loadSent])

  // Gợi ý theo chữ đang gõ (bỏ kết quả cũ nếu người dùng gõ tiếp)
  useEffect(() => {
    if (isDemo || trimmed.length < MIN_QUERY) {
      setResults([])
      setSearching(false)
      return
    }
    let stale = false
    setSearching(true)
    const t = setTimeout(() => {
      api
        .searchInvitableUsers(group.id, trimmed)
        .then((r) => {
          if (stale) return
          setResults(r)
          setActive(0)
          setError(null)
        })
        .catch((e) => !stale && setError(errorMessage(e)))
        .finally(() => !stale && setSearching(false))
    }, DEBOUNCE_MS)
    return () => {
      stale = true
      clearTimeout(t)
    }
  }, [trimmed, group.id, isDemo])

  // Bấm ra ngoài → đóng danh sách gợi ý
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => boxRef.current && !boxRef.current.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  async function invite(c: { userId: string; fullName: string }) {
    setBusyId(c.userId)
    setError(null)
    try {
      await inviteMember(group.id, c.userId)
      toast.success(`Đã gửi lời mời tới ${c.fullName}. Bạn ấy đồng ý thì sẽ vào nhóm.`)
      setResults((list) => list.map((x) => (x.userId === c.userId ? { ...x, invited: true } : x)))
      loadSent()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusyId(null)
    }
  }

  async function cancel(inv: SentInvitation) {
    try {
      await api.cancelInvitation(inv.id)
      setSent((list) => list.filter((x) => x.id !== inv.id))
      if (inv.status === 'pending') toast.success(`Đã thu hồi lời mời của ${inv.fullName}`)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') return setOpen(false)
    if (!results.length) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setOpen(true)
      setActive((i) => (i + (e.key === 'ArrowDown' ? 1 : results.length - 1)) % results.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const c = results[active]
      if (c && !c.invited) void invite(c)
    }
  }

  const showList = open && trimmed.length >= MIN_QUERY
  const pending = sent.filter((s) => s.status === 'pending')
  const declined = sent.filter((s) => s.status === 'declined')

  return (
    <div className="mt-4 space-y-3">
      <div ref={boxRef} className="relative">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            className={cn(inputClass, 'rounded-2xl bg-slate-50 py-2.5 pl-10 pr-10')}
            placeholder={isDemo ? 'Cần kết nối Supabase để mời thành viên' : 'Tìm theo tên hoặc email bạn cùng nhóm'}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            disabled={isDemo}
            maxLength={100}
            autoComplete="off"
            role="combobox"
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={showList && results[active] ? `${listId}-${active}` : undefined}
            aria-label="Tìm bạn để mời vào nhóm"
          />
          {searching && <Loader2 className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-500" aria-hidden />}
        </label>

        {/* Gợi ý: tối đa 3 tài khoản có tên gần giống chữ đang gõ */}
        {showList && (
          <div className="absolute inset-x-0 top-full z-20 mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-surface shadow-xl">
            {results.length === 0 ? (
              <p className="px-4 py-3 text-sm text-slate-600">
                {searching ? 'Đang tìm…' : `Không tìm thấy tài khoản nào khớp "${trimmed}". Bạn ấy cần đăng ký UniPlan trước.`}
              </p>
            ) : (
              <ul id={listId} role="listbox" aria-label="Gợi ý tài khoản" className="p-1.5">
                {results.map((c, i) => (
                  <li
                    key={c.userId}
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={i === active}
                    onMouseEnter={() => setActive(i)}
                    className={cn('flex items-center gap-3 rounded-xl px-2.5 py-2', i === active && 'bg-slate-100')}
                  >
                    <Avatar name={c.fullName} src={c.avatarUrl} className="h-9 w-9 text-xs" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-900">{c.fullName}</span>
                      <span className="block truncate text-xs text-slate-600">{c.emailHint}</span>
                    </span>
                    {c.invited ? (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-bold text-amber-700">
                        <Clock className="h-3.5 w-3.5" /> Đã mời
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void invite(c)}
                        disabled={busyId !== null}
                        className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg bg-cta px-3 py-1.5 text-xs font-bold text-white transition hover:bg-cta-hover disabled:opacity-60"
                      >
                        {busyId === c.userId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                        Mời
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
      <FormError message={error} />

      {/* Lời mời đã gửi: chờ đồng ý / bị từ chối */}
      {(pending.length > 0 || declined.length > 0) && (
        <ul className="space-y-1.5">
          {[...pending, ...declined].map((inv) => (
            <li key={inv.id} className="flex items-center gap-3 rounded-xl border border-dashed border-slate-300 px-3 py-2">
              <Avatar name={inv.fullName} src={inv.avatarUrl} className="h-8 w-8 text-xs opacity-80" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{inv.fullName}</span>
              {inv.status === 'pending' ? (
                <span className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-amber-700">
                  <Clock className="h-3.5 w-3.5" /> Chờ đồng ý
                </span>
              ) : (
                <span className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-red-700">
                  <UserX className="h-3.5 w-3.5" /> Đã từ chối
                </span>
              )}
              {inv.status === 'declined' && (
                <button
                  type="button"
                  onClick={() => void invite(inv)}
                  disabled={busyId !== null}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-brand-50 hover:text-brand-600"
                  aria-label={`Mời lại ${inv.fullName}`}
                  title="Mời lại"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => void cancel(inv)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-red-50 hover:text-red-600"
                aria-label={inv.status === 'pending' ? `Thu hồi lời mời ${inv.fullName}` : `Xóa ${inv.fullName} khỏi danh sách`}
                title={inv.status === 'pending' ? 'Thu hồi lời mời' : 'Xóa khỏi danh sách'}
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
