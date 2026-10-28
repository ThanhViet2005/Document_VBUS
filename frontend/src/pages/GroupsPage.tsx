import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  CircleEllipsis,
  ClipboardList,
  Crown,
  Flag,
  Lightbulb,
  ListPlus,
  LogOut,
  Pencil,
  Plus,
  Trash2,
  User,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { useAppData } from '../store/AppData'
import { cn } from '../lib/cn'
import { daysBetween, formatDate } from '../lib/date'
import { courseColor, STATUS_LABEL } from '../lib/labels'
import { overallProgress, urgencyOf } from '../lib/tasks'
import type { DeadlineInput } from '../services/api'
import type { Assignment, Deadline, Group, TaskStatus } from '../types'
import Avatar from '../components/ui/Avatar'
import Modal from '../components/ui/Modal'
import TaskForm, { blankDeadline } from '../components/tasks/TaskForm'
import InviteMembers from '../components/groups/InviteMembers'
import InvitationList from '../components/groups/InvitationList'
import { Button, EmptyState, errorMessage, Field, FormError, inputClass } from '../components/ui/Form'
import { useToast } from '../components/ui/Toast'
import { useConfirm } from '../components/ui/ConfirmDialog'

type GroupState = 'new' | 'running' | 'done'
const GROUP_STATE: Record<GroupState, { label: string; chip: string; bar: string; text: string }> = {
  new: { label: 'Mới tạo', chip: 'bg-slate-100 text-slate-600', bar: 'bg-slate-400', text: 'text-slate-500' },
  running: { label: 'Đang chạy', chip: 'bg-emerald-50 text-emerald-700', bar: 'bg-brand-500', text: 'text-brand-600' },
  done: { label: 'Xong', chip: 'bg-emerald-50 text-emerald-700', bar: 'bg-emerald-500', text: 'text-emerald-600' },
}

/** Tiến độ nhóm = trung bình tiến độ các deadline của nhóm */
function groupSummary(list: Deadline[]): { progress: number; state: GroupState; done: number } {
  const done = list.filter((d) => d.status === 'done').length
  const state: GroupState = list.length === 0 ? 'new' : done === list.length ? 'done' : 'running'
  return { progress: overallProgress(list), state, done }
}

export default function GroupsPage() {
  const { groups, deadlines, courses, user, courseById } = useAppData()
  const [params, setParams] = useSearchParams()
  const [creating, setCreating] = useState(false)

  const selected = groups.find((g) => g.id === params.get('id')) ?? groups[0]
  const semester = courses.find((c) => c.userId === user.id && c.semester)?.semester

  return (
    <div className="space-y-5">
      {/* Đầu trang */}
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-slate-200 bg-surface p-5 sm:p-6 shadow-card">
        <div className="min-w-0">
          <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-brand-700">{groups.length} nhóm đang tham gia</span>
          <p className="mt-2 text-sm text-slate-500 sm:text-base">Chia việc bài tập lớn theo môn, theo dõi tiến độ của cả nhóm theo thời gian thực.</p>
        </div>
        <Button onClick={() => setCreating(true)} className="px-5 py-2.5">
          <UserPlus className="h-4 w-4" /> Tạo nhóm mới
        </Button>
      </section>

      <InvitationList onJoined={(id) => setParams({ id }, { replace: true })} />

      {groups.length === 0 ? (
        <EmptyState
          icon={<Users className="h-6 w-6" />}
          title="Bạn chưa ở trong nhóm nào"
          text="Tạo nhóm cho bài tập lớn rồi tìm bạn theo tên để mời. Bạn ấy đồng ý là vào nhóm."
          action={
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> Tạo nhóm đầu tiên
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[360px_minmax(0,1fr)]">
          {/* Cột trái: danh sách nhóm + mẹo */}
          <aside className="space-y-3">
            <div className="flex items-baseline justify-between px-1">
              <h2 className="text-lg font-extrabold text-slate-900">Danh sách nhóm</h2>
              {semester && <span className="text-xs text-slate-500">{semester}</span>}
            </div>
            <nav className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1 lg:flex-col lg:overflow-visible" aria-label="Danh sách nhóm">
              {groups.map((g) => {
                const course = courseById(g.courseId)
                const color = courseColor(course)
                const summary = groupSummary(deadlines.filter((d) => d.groupId === g.id))
                const state = GROUP_STATE[summary.state]
                const active = selected?.id === g.id
                return (
                  <button
                    key={g.id}
                    onClick={() => setParams({ id: g.id }, { replace: true })}
                    aria-current={active ? 'true' : undefined}
                    className={cn(
                      'relative min-w-64 overflow-hidden rounded-2xl border p-4 text-left transition duration-200 lg:min-w-0',
                      active ? 'border-brand-500/50 bg-surface shadow-lg shadow-brand-500/10' : 'border-slate-200 bg-surface hover:-translate-y-0.5 hover:border-brand-500/30 hover:shadow-md',
                    )}
                  >
                    {active && <span className="absolute inset-y-0 left-0 w-1 bg-brand-500" aria-hidden />}
                    <div className="flex items-start gap-3">
                      <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold', color.soft, color.text)}>
                        {course?.code.slice(0, 2).toUpperCase() ?? <Users className="h-5 w-5" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start justify-between gap-2">
                          <span className="truncate font-bold text-slate-900">{g.name}</span>
                          <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold', state.chip)}>{state.label}</span>
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-slate-500">{course ? `${course.code} • ${course.name}` : 'Không gắn môn'}</span>
                      </span>
                    </div>
                    <div className="mt-4 flex items-center justify-between text-xs">
                      <span className="inline-flex items-center gap-1.5 text-slate-500">
                        <Users className="h-3.5 w-3.5" /> {g.members.length} thành viên
                      </span>
                      <span className={cn('font-bold', active ? state.text : 'text-slate-500')}>Tiến độ {summary.progress}%</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div className={cn('h-full rounded-full transition-all duration-500', state.bar)} style={{ width: `${summary.progress}%` }} />
                    </div>
                  </button>
                )
              })}
            </nav>

            <div className="hidden rounded-2xl border border-slate-200 bg-surface p-4 lg:block shadow-card">
              <p className="flex items-center gap-2 font-bold text-slate-900">
                <Lightbulb className="h-5 w-5 text-amber-500" /> Mẹo làm việc nhóm
              </p>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">
                Tách mỗi deadline thành các phần việc nhỏ và giao cho từng người. Cả nhóm thấy ai đang làm gì, tiến độ tự cập nhật khi tick xong.
              </p>
            </div>
          </aside>

          {selected && <GroupDetail key={selected.id} group={selected} />}
        </div>
      )}

      {creating && (
        <CreateGroupForm
          onClose={(id) => {
            setCreating(false)
            if (id) setParams({ id }, { replace: true })
          }}
        />
      )}
    </div>
  )
}

function GroupDetail({ group }: { group: Group }) {
  const confirm = useConfirm()
  const { user, deadlines, assignments, schedules, courseById, deleteGroup, removeMember } = useAppData()
  const toast = useToast()
  const [editing, setEditing] = useState<DeadlineInput | null>(null)

  const isOwner = group.ownerId === user.id
  const course = courseById(group.courseId)
  const groupDeadlines = deadlines.filter((d) => d.groupId === group.id).sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  const groupAssignments = assignments.filter((a) => a.groupId === group.id)
  const summary = groupSummary(groupDeadlines)
  const lecturer = schedules.find((s) => s.courseId === group.courseId && s.lecturer)?.lecturer

  async function onDeleteGroup() {
    if (
      !(await confirm({
        title: `Xóa nhóm "${group.name}"?`,
        message: 'Toàn bộ deadline và phân công của nhóm sẽ bị xóa với MỌI thành viên.',
        confirmLabel: 'Xóa nhóm',
      }))
    )
      return
    try {
      await deleteGroup(group.id)
      toast.success('Đã xóa nhóm')
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  async function onLeave() {
    if (!(await confirm({ title: `Rời nhóm "${group.name}"?`, message: 'Bạn sẽ không còn thấy deadline của nhóm.', confirmLabel: 'Rời nhóm' }))) return
    try {
      await removeMember(group.id, user.id)
      toast.success('Đã rời nhóm')
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <div className="min-w-0 space-y-5">
      {/* Thông tin nhóm + thành viên */}
      <section className="rounded-3xl border border-slate-200 bg-surface p-5 sm:p-6 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex flex-wrap items-center gap-2 text-2xl font-extrabold text-slate-900">
              <span className="truncate">{group.name}</span>
              {course && <span className="rounded-lg bg-brand-50 px-2 py-0.5 text-data text-xs font-bold text-brand-700">{course.code}</span>}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {[course?.name ?? 'Không gắn môn', group.description, lecturer && `Giảng viên: ${lecturer}`].filter(Boolean).join(' • ')}
            </p>
          </div>
          {isOwner ? (
            <Button variant="danger" onClick={() => void onDeleteGroup()}>
              <Trash2 className="h-4 w-4" /> Xóa nhóm
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => void onLeave()}>
              <LogOut className="h-4 w-4" /> Rời nhóm
            </Button>
          )}
        </div>

        <Members group={group} isOwner={isOwner} assignments={groupAssignments} />
      </section>

      {/* Deadline & công việc nhóm */}
      <section className="rounded-3xl border border-slate-200 bg-surface p-5 sm:p-6 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="flex items-center gap-2.5 text-lg font-extrabold text-slate-900">
            <ClipboardList className="h-5 w-5 text-brand-500" />
            Deadline &amp; Công việc nhóm
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">{groupDeadlines.length} nhiệm vụ</span>
          </h3>
          <button
            onClick={() => setEditing(blankDeadline({ groupId: group.id, courseId: group.courseId, taskType: 'group_project' }))}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-brand-600 transition hover:bg-brand-50"
          >
            <ListPlus className="h-4 w-4" /> Thêm deadline nhóm
          </button>
        </div>

        {groupDeadlines.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-slate-300 py-10 text-center text-sm text-slate-500">Chưa có deadline nào cho nhóm</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {groupDeadlines.map((d) => (
              <GroupDeadline
                key={d.id}
                deadline={d}
                group={group}
                items={groupAssignments.filter((a) => a.deadlineId === d.id)}
                onOpen={() => setEditing({ ...d, notes: d.notes ?? '' })}
              />
            ))}
          </ul>
        )}

        {groupDeadlines.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm">
            <Flag className="h-4 w-4 text-slate-500" />
            <span className="min-w-0 flex-1 truncate text-slate-700">Tiến độ chung {course ? `(${course.code})` : 'của nhóm'}</span>
            <span className="text-slate-500">
              {summary.done} / {groupDeadlines.length} hoàn tất
            </span>
            <span className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-200">
              <span className="block h-full rounded-full bg-emerald-500 transition-all duration-500" style={{ width: `${summary.progress}%` }} />
            </span>
          </div>
        )}
      </section>

      {editing && <TaskForm initial={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function Members({ group, isOwner, assignments }: { group: Group; isOwner: boolean; assignments: Assignment[] }) {
  const confirm = useConfirm()
  const { removeMember } = useAppData()
  const toast = useToast()

  async function onRemove(userId: string, name: string) {
    if (!(await confirm({ title: `Xóa ${name} khỏi nhóm?`, message: 'Thành viên này sẽ không còn thấy deadline của nhóm.', confirmLabel: 'Xóa khỏi nhóm' }))) return
    try {
      await removeMember(group.id, userId)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <div className="mt-6">
      <h3 className="mb-3 font-bold text-slate-900">Thành viên ({group.members.length})</h3>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
        {group.members.map((m) => {
          const name = m.fullName || m.email
          const tasks = assignments.filter((a) => a.assigneeId === m.userId)
          const done = tasks.filter((a) => a.status === 'done').length
          return (
            <li key={m.userId} className="group/member relative rounded-2xl bg-slate-50 p-3.5 ring-1 ring-slate-200/70">
              <div className="flex items-center gap-3">
                <span className="relative shrink-0">
                  <Avatar name={name} src={m.avatarUrl} className="h-11 w-11 text-sm" />
                  {m.role === 'owner' && (
                    <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 ring-2 ring-surface" title="Chủ nhóm">
                      <Crown className="h-3 w-3 text-white" />
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-slate-900">{name}</span>
                  <span className="block truncate text-xs text-slate-500">{m.email}</span>
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between gap-2 text-xs">
                <span className={cn('rounded-md px-2 py-0.5 font-semibold', m.role === 'owner' ? 'bg-brand-50 text-brand-700' : 'bg-surface text-slate-600 ring-1 ring-slate-200')}>
                  {m.role === 'owner' ? 'Chủ nhóm' : 'Thành viên'}
                </span>
                <span className="text-slate-500">{tasks.length ? `${done}/${tasks.length} việc` : 'Chưa giao việc'}</span>
              </div>
              {isOwner && m.role !== 'owner' && (
                <button
                  onClick={() => void onRemove(m.userId, name)}
                  className="absolute right-2 top-2 rounded-lg p-1 text-slate-400 opacity-0 transition hover:bg-red-50 hover:text-red-500 focus-visible:opacity-100 group-hover/member:opacity-100"
                  aria-label={`Xóa ${name} khỏi nhóm`}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </li>
          )
        })}
      </ul>

      {/* Chủ nhóm tìm bạn theo tên → gửi lời mời; bạn ấy đồng ý thì mới vào nhóm */}
      {isOwner && <InviteMembers group={group} />}
    </div>
  )
}

const STATUS_CHIP: Record<TaskStatus, string> = {
  todo: 'bg-slate-100 text-slate-600',
  in_progress: 'bg-orange-50 text-orange-600',
  done: 'bg-emerald-50 text-emerald-700',
}

const STATUS_ICON: Record<TaskStatus, { icon: typeof CheckCircle2; className: string }> = {
  todo: { icon: CircleDashed, className: 'text-slate-400' },
  in_progress: { icon: CircleEllipsis, className: 'text-orange-500' },
  done: { icon: CheckCircle2, className: 'text-emerald-500' },
}

function GroupDeadline({ deadline, group, items, onOpen }: { deadline: Deadline; group: Group; items: Assignment[]; onOpen: () => void }) {
  const { saveAssignment, deleteAssignment, user } = useAppData()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [assignee, setAssignee] = useState(user.id)
  const done = items.filter((a) => a.status === 'done').length
  const memberName = (id: string | null) => group.members.find((m) => m.userId === id)?.fullName || 'Chưa giao'
  const owners = [...new Set(items.map((a) => a.assigneeId).filter(Boolean))].map((id) => memberName(id))
  const u = urgencyOf(deadline)
  const days = daysBetween(new Date(), new Date(deadline.dueDate))
  const { icon: StatusIcon, className: statusColor } = STATUS_ICON[deadline.status]

  async function run(fn: () => Promise<unknown>) {
    try {
      await fn()
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  async function onAdd(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    await run(() => saveAssignment({ groupId: group.id, deadlineId: deadline.id, assigneeId: assignee || null, title, status: 'todo', dueDate: null }))
    setTitle('')
  }

  return (
    <li className={cn('rounded-2xl bg-slate-50 ring-1 transition', open ? 'ring-brand-500/30' : 'ring-slate-200/70')}>
      <div className="flex items-start gap-3 p-4">
        <StatusIcon className={cn('mt-0.5 h-5 w-5 shrink-0', statusColor)} aria-label={STATUS_LABEL[deadline.status]} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2">
            <button onClick={onOpen} className={cn('text-left font-semibold text-slate-900 transition hover:text-brand-600', deadline.status === 'done' && 'text-slate-500 line-through')}>
              {deadline.title}
            </button>
            {deadline.priority === 'high' && deadline.status !== 'done' && <span className="rounded-md bg-red-50 px-1.5 py-0.5 text-[11px] font-bold text-red-600">Quan trọng</span>}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1">
              {owners.length > 1 ? <Users className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
              {owners.length ? owners.join(' & ') : 'Cả nhóm'}
            </span>
            <span aria-hidden>•</span>
            <span className={cn('inline-flex items-center gap-1', (u === 'urgent' || u === 'overdue') && 'font-semibold text-red-600', u === 'soon' && 'font-semibold text-orange-600')}>
              <CalendarDays className="h-3.5 w-3.5" />
              Hạn: {formatDate(deadline.dueDate)}
              {u === 'overdue' ? ' (Quá hạn)' : u !== 'done' && days >= 0 && days <= 3 ? (days === 0 ? ' (Hôm nay)' : ` (Còn ${days} ngày)`) : ''}
            </span>
            {items.length > 0 && (
              <>
                <span aria-hidden>•</span>
                <span>
                  {done}/{items.length} phần việc
                </span>
              </>
            )}
          </p>
        </div>
        <span className={cn('hidden shrink-0 rounded-full px-2.5 py-1 text-xs font-bold sm:inline', STATUS_CHIP[deadline.status])}>{STATUS_LABEL[deadline.status]}</span>
        <div className="flex shrink-0 items-center">
          <button onClick={onOpen} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-surface hover:text-brand-600" aria-label={`Sửa ${deadline.title}`} title="Sửa deadline">
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-surface hover:text-brand-600"
            aria-label={open ? 'Thu gọn phần việc' : 'Xem và giao phần việc'}
            title="Phần việc"
          >
            <ChevronDown className={cn('h-4 w-4 transition-transform duration-200', open && 'rotate-180')} />
          </button>
        </div>
      </div>

      {/* Phần việc chi tiết: mở ra để giao việc / đổi trạng thái */}
      {open && (
        <div className="border-t border-slate-200/70 px-4 pb-4 pt-2">
          {items.length > 0 && (
            <ul className="divide-y divide-slate-200/70">
              {items.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-2 py-2">
                  <span className={cn('w-full min-w-0 text-sm text-slate-700 sm:w-auto sm:flex-1', a.status === 'done' && 'text-slate-400 line-through')}>{a.title}</span>
                  <select
                    className="rounded-lg border border-slate-200 bg-surface px-2 py-1 text-xs"
                    value={a.assigneeId ?? ''}
                    onChange={(e) => void run(() => saveAssignment({ ...a, assigneeId: e.target.value || null }))}
                    aria-label="Người được giao"
                  >
                    <option value="">Chưa giao</option>
                    {group.members.map((m) => (
                      <option key={m.userId} value={m.userId}>{m.fullName || m.email}</option>
                    ))}
                  </select>
                  <select
                    className={cn('rounded-lg px-2 py-1 text-xs font-semibold', STATUS_CHIP[a.status])}
                    value={a.status}
                    onChange={(e) => void run(() => saveAssignment({ ...a, status: e.target.value as TaskStatus }))}
                    aria-label={`Trạng thái phần việc của ${memberName(a.assigneeId)}`}
                  >
                    {(Object.keys(STATUS_LABEL) as TaskStatus[]).map((s) => (
                      <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                    ))}
                  </select>
                  <button onClick={() => void run(() => deleteAssignment(a.id))} className="rounded-lg p-1 text-slate-500 hover:bg-red-50 hover:text-red-500" aria-label="Xóa phần việc">
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={onAdd} className="mt-2 flex flex-wrap gap-2">
            <input className={cn(inputClass, 'min-w-40 flex-1 sm:w-auto')} placeholder="Nhập phần việc mới" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
            <select className={cn(inputClass, 'sm:w-48')} value={assignee} onChange={(e) => setAssignee(e.target.value)} aria-label="Giao cho">
              <option value="">Chưa giao</option>
              {group.members.map((m) => (
                <option key={m.userId} value={m.userId}>{m.fullName || m.email}</option>
              ))}
            </select>
            <Button type="submit">
              <Plus className="h-4 w-4" /> Giao việc
            </Button>
          </form>
        </div>
      )}
    </li>
  )
}

function CreateGroupForm({ onClose }: { onClose: (createdId?: string) => void }) {
  const { courses, user, createGroup } = useAppData()
  const toast = useToast()
  const mine = courses.filter((c) => c.userId === user.id)
  const [form, setForm] = useState({ name: '', description: '', courseId: mine[0]?.id ?? '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return setError('Vui lòng nhập tên nhóm')
    setBusy(true)
    setError(null)
    try {
      const g = await createGroup({ name: form.name, description: form.description, courseId: form.courseId || null })
      toast.success('Đã tạo nhóm')
      onClose(g.id)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      title="Tạo nhóm bài tập lớn"
      onClose={() => onClose()}
      footer={
        <>
          <Button variant="secondary" onClick={() => onClose()}>Hủy</Button>
          <Button type="submit" form="group-form" busy={busy}>Tạo nhóm</Button>
        </>
      }
    >
      <form id="group-form" onSubmit={onSubmit} className="space-y-4">
        <Field label="Tên nhóm">
          <input
            className={inputClass}
            value={form.name}
            maxLength={120}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Nhập tên nhóm"
            required
          />
        </Field>
        <Field label="Môn học" hint="Deadline của nhóm sẽ gắn với môn này cho mọi thành viên">
          <select className={inputClass} value={form.courseId} onChange={(e) => setForm({ ...form, courseId: e.target.value })}>
            <option value="">Không gắn môn</option>
            {mine.map((c) => (
              <option key={c.id} value={c.id}>{c.code} - {c.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Mô tả">
          <input maxLength={2000} className={inputClass} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Nhập mô tả" />
        </Field>
        <FormError message={error} />
      </form>
    </Modal>
  )
}
