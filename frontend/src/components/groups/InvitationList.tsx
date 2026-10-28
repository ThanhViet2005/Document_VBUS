import { useState } from 'react'
import { Check, Mail, Users, X } from 'lucide-react'
import type { GroupInvitation } from '../../types'
import { cn } from '../../lib/cn'
import { useAppData } from '../../store/AppData'
import Avatar from '../ui/Avatar'
import { errorMessage } from '../ui/Form'
import { useToast } from '../ui/Toast'

/**
 * Lời mời vào nhóm mình nhận được: Đồng ý → vào nhóm, Từ chối → không vào.
 * `compact`: bản gọn trong chuông Thông báo; mặc định: thẻ ở đầu trang Nhóm.
 */
export default function InvitationList({ compact = false, onJoined }: { compact?: boolean; onJoined?: (groupId: string) => void }) {
  const { invitations } = useAppData()
  if (invitations.length === 0) return null

  if (compact) {
    return (
      <section className="mb-1">
        <h3 className="px-3 pb-1 pt-2 text-xs font-bold uppercase tracking-wide text-brand-600">Lời mời vào nhóm</h3>
        <ul className="space-y-1">
          {invitations.map((inv) => (
            <InvitationItem key={inv.id} inv={inv} compact onJoined={onJoined} />
          ))}
        </ul>
      </section>
    )
  }

  return (
    <section className="rounded-3xl border border-brand-500/30 bg-surface p-4 shadow-card sm:p-5" aria-label="Lời mời vào nhóm">
      <h2 className="flex items-center gap-2 font-extrabold text-slate-900">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
          <Mail className="h-4 w-4" />
        </span>
        Lời mời vào nhóm
        <span className="rounded-full bg-cta px-2 py-0.5 text-xs font-bold text-white">{invitations.length}</span>
      </h2>
      <ul className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
        {invitations.map((inv) => (
          <InvitationItem key={inv.id} inv={inv} onJoined={onJoined} />
        ))}
      </ul>
    </section>
  )
}

function InvitationItem({ inv, compact = false, onJoined }: { inv: GroupInvitation; compact?: boolean; onJoined?: (groupId: string) => void }) {
  const { respondInvitation } = useAppData()
  const toast = useToast()
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null)

  async function respond(accept: boolean) {
    setBusy(accept ? 'accept' : 'decline')
    try {
      await respondInvitation(inv.id, accept)
      if (accept) {
        toast.success(`Đã vào nhóm "${inv.groupName}"`)
        onJoined?.(inv.groupId)
      } else {
        toast.success(`Đã từ chối lời mời vào "${inv.groupName}"`)
      }
    } catch (e) {
      toast.error(errorMessage(e))
      setBusy(null)
    }
  }

  return (
    <li className={cn('rounded-2xl border border-slate-200 bg-slate-50', compact ? 'mx-1 p-3' : 'p-4')}>
      <div className="flex items-start gap-3">
        <Avatar name={inv.inviterName} src={inv.inviterAvatar} className={compact ? 'h-8 w-8 text-xs' : 'h-10 w-10 text-sm'} />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-slate-700">
            <span className="font-bold text-slate-900">{inv.inviterName}</span> mời bạn vào nhóm
          </p>
          <p className="truncate font-bold text-slate-900">{inv.groupName}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-600">
            {inv.courseCode && <span className="text-data font-semibold">{inv.courseCode}</span>}
            <span className="inline-flex items-center gap-1">
              <Users className="h-3.5 w-3.5" /> {inv.memberCount} thành viên
            </span>
          </p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => void respond(true)}
          disabled={busy !== null}
          className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-cta px-3 py-2 text-sm font-bold text-white transition hover:bg-cta-hover disabled:opacity-60"
        >
          <Check className="h-4 w-4" /> {busy === 'accept' ? 'Đang vào nhóm…' : 'Đồng ý'}
        </button>
        <button
          type="button"
          onClick={() => void respond(false)}
          disabled={busy !== null}
          className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-surface px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
        >
          <X className="h-4 w-4" /> Từ chối
        </button>
      </div>
    </li>
  )
}
