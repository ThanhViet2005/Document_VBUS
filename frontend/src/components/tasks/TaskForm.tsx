import { useState, type FormEvent } from 'react'
import { Plus, Send, Trash2, X } from 'lucide-react'
import { useAppData } from '../../store/AppData'
import { cn } from '../../lib/cn'
import { PRIORITY_LABEL, STATUS_LABEL, TASK_TYPE_LABEL } from '../../lib/labels'
import { useShareDeadline } from '../../lib/useShareDeadline'
import type { DeadlineInput } from '../../services/api'
import type { Deadline, Priority, TaskStatus, TaskType } from '../../types'
import Modal from '../ui/Modal'
import { Button, errorMessage, Field, FormError, fromLocalInput, inputClass, toLocalInput } from '../ui/Form'
import { useToast } from '../ui/Toast'
import { useConfirm } from '../ui/ConfirmDialog'

const TYPES = Object.keys(TASK_TYPE_LABEL) as TaskType[]
const PRIORITIES = Object.keys(PRIORITY_LABEL) as Priority[]
const STATUSES = Object.keys(STATUS_LABEL) as TaskStatus[]

export function blankDeadline(overrides: Partial<DeadlineInput> = {}): DeadlineInput {
  const due = new Date()
  due.setDate(due.getDate() + 3)
  due.setHours(23, 59, 0, 0)
  return {
    courseId: null,
    groupId: null,
    title: '',
    taskType: 'assignment',
    dueDate: due.toISOString(),
    priority: 'medium',
    status: 'todo',
    progressPercent: 0,
    notes: '',
    subtasks: [],
    ...overrides,
  }
}

export default function TaskForm({
  initial,
  onClose,
  onSaved,
}: {
  initial: DeadlineInput
  onClose: () => void
  /** Gọi sau khi lưu thành công (vd: AI Chat đánh dấu bản nháp đã thêm) */
  onSaved?: (saved: Deadline) => void
}) {
  const { courses, groups, user, saveDeadline, deleteDeadline, groupById } = useAppData()
  const toast = useToast()
  const confirm = useConfirm()
  const { share, sharingId } = useShareDeadline()
  const [form, setForm] = useState<DeadlineInput>(initial)
  const [newSub, setNewSub] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isEdit = Boolean(initial.id)
  const group = groupById(form.groupId)
  // Deadline nhóm gắn với môn của nhóm (RLS chỉ cho phép môn của mình hoặc môn của nhóm)
  const courseOptions = courses.filter((c) => c.userId === user.id || c.id === group?.courseId)
  const hasSubtasks = form.subtasks.length > 0

  function addSubtask() {
    const title = newSub.trim()
    if (!title) return
    setForm((f) => ({ ...f, subtasks: [...f.subtasks, { id: crypto.randomUUID(), title, isCompleted: false }] }))
    setNewSub('')
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) return setError('Vui lòng nhập tên nhiệm vụ')
    setBusy(true)
    setError(null)
    try {
      // Có subtask → % tiến độ tính theo subtask
      let { status, progressPercent } = form
      if (status === 'done') progressPercent = 100
      else if (hasSubtasks) progressPercent = Math.min(99, Math.round((form.subtasks.filter((s) => s.isCompleted).length / form.subtasks.length) * 100))
      else if (status === 'todo') progressPercent = 0
      else progressPercent = Math.min(99, progressPercent)

      const saved = await saveDeadline({ ...form, status, progressPercent })
      onSaved?.(saved)
      toast.success(isEdit ? 'Đã cập nhật nhiệm vụ' : 'Đã thêm nhiệm vụ')
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function onDelete() {
    if (!initial.id) return
    if (
      !(await confirm({
        title: 'Xóa nhiệm vụ?',
        message: <>Nhiệm vụ <b className="font-semibold text-slate-900">{initial.title || 'này'}</b> cùng các subtask sẽ bị xóa.</>,
        confirmLabel: 'Xóa nhiệm vụ',
      }))
    )
      return
    try {
      await deleteDeadline(initial.id)
      toast.success('Đã xóa nhiệm vụ')
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <Modal
      open
      size="lg"
      title={isEdit ? 'Chi tiết nhiệm vụ' : 'Thêm nhiệm vụ'}
      onClose={onClose}
      footer={
        <>
          {isEdit && (
            <>
              <Button variant="danger" onClick={() => void onDelete()}>
                <Trash2 className="h-4 w-4" /> Xóa
              </Button>
              <Button variant="secondary" onClick={() => void share(initial.id!)} busy={sharingId === initial.id} className="mr-auto">
                <Send className="h-4 w-4" /> Gửi cho bạn
              </Button>
            </>
          )}
          <Button variant="secondary" onClick={onClose}>Hủy</Button>
          <Button type="submit" form="task-form" busy={busy}>Lưu</Button>
        </>
      }
    >
      <form id="task-form" onSubmit={onSubmit} className="space-y-4">
        <Field label="Tên nhiệm vụ">
          <input className={inputClass} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Nhập tên nhiệm vụ" required maxLength={200} />
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Nhóm" hint={isEdit ? 'Không đổi được nhóm sau khi tạo' : 'Để trống nếu là việc cá nhân'}>
            <select
              className={inputClass}
              value={form.groupId ?? ''}
              disabled={isEdit}
              onChange={(e) => {
                const g = groupById(e.target.value || null)
                setForm({ ...form, groupId: g?.id ?? null, courseId: g ? g.courseId : form.courseId, taskType: g ? 'group_project' : form.taskType })
              }}
            >
              <option value="">Cá nhân</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Môn học">
            <select className={inputClass} value={form.courseId ?? ''} onChange={(e) => setForm({ ...form, courseId: e.target.value || null })}>
              <option value="">Không gắn môn</option>
              {courseOptions.map((c) => (
                <option key={c.id} value={c.id}>{c.code} - {c.name}</option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Loại">
            <select className={inputClass} value={form.taskType} onChange={(e) => setForm({ ...form, taskType: e.target.value as TaskType })}>
              {TYPES.map((t) => (
                <option key={t} value={t}>{TASK_TYPE_LABEL[t]}</option>
              ))}
            </select>
          </Field>
          <Field label="Ưu tiên">
            <select className={inputClass} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as Priority })}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>
              ))}
            </select>
          </Field>
          <Field label="Hạn nộp" className="col-span-2 sm:col-span-1">
            <input
              type="datetime-local"
              className={inputClass}
              value={toLocalInput(form.dueDate)}
              onChange={(e) => e.target.value && setForm({ ...form, dueDate: fromLocalInput(e.target.value) })}
              required
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Trạng thái" as="group">
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setForm({ ...form, status: s })}
                  className={cn('rounded-lg py-1.5 text-xs font-semibold', form.status === s ? 'bg-surface text-slate-900 shadow-sm' : 'text-slate-500')}
                >
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </Field>
          <Field label={`Tiến độ: ${form.status === 'done' ? 100 : form.progressPercent}%`} hint={hasSubtasks ? 'Tự tính theo số subtask đã xong' : undefined}>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              className="w-full accent-brand-500"
              value={form.status === 'done' ? 100 : form.progressPercent}
              disabled={hasSubtasks || form.status === 'done'}
              onChange={(e) => {
                const v = Number(e.target.value)
                setForm({ ...form, progressPercent: v, status: v === 0 ? 'todo' : v === 100 ? 'done' : 'in_progress' })
              }}
            />
          </Field>
        </div>

        <Field label={`Các bước nhỏ (${form.subtasks.filter((s) => s.isCompleted).length}/${form.subtasks.length})`} as="group">
          <ul className="space-y-1.5">
            {form.subtasks.map((s) => (
              <li key={s.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-emerald-500"
                  checked={s.isCompleted}
                  onChange={() => setForm({ ...form, subtasks: form.subtasks.map((x) => (x.id === s.id ? { ...x, isCompleted: !x.isCompleted } : x)) })}
                />
                <input
                  className={cn('min-w-0 flex-1 bg-transparent text-sm outline-none', s.isCompleted && 'text-slate-500 line-through')}
                  value={s.title}
                  maxLength={200}
                  onChange={(e) => setForm({ ...form, subtasks: form.subtasks.map((x) => (x.id === s.id ? { ...x, title: e.target.value } : x)) })}
                />
                <button type="button" onClick={() => setForm({ ...form, subtasks: form.subtasks.filter((x) => x.id !== s.id) })} className="text-slate-500 hover:text-red-500" aria-label="Xóa bước">
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex gap-2">
            <input
              className={inputClass}
              value={newSub}
              maxLength={200}
              onChange={(e) => setNewSub(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addSubtask()
                }
              }}
              placeholder="Nhập bước nhỏ, nhấn Enter để thêm"
            />
            <Button variant="secondary" onClick={addSubtask} aria-label="Thêm bước">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </Field>

        <Field label="Ghi chú">
          <textarea maxLength={5000} className={inputClass} rows={3} value={form.notes ?? ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Nhập ghi chú" />
        </Field>
        <FormError message={error} />
      </form>
    </Modal>
  )
}
