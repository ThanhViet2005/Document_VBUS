import { useState, type FormEvent } from 'react'
import { Trash2 } from 'lucide-react'
import { useAppData } from '../../store/AppData'
import { formatDate } from '../../lib/date'
import type { StudySessionInput } from '../../services/api'
import Modal from '../ui/Modal'
import { Button, errorMessage, Field, FormError, inputClass } from '../ui/Form'
import { useToast } from '../ui/Toast'
import { useConfirm } from '../ui/ConfirmDialog'

const pad = (n: number) => String(n).padStart(2, '0')
const toDateInput = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const toTimeInput = (iso: string) => {
  const d = new Date(iso)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const combine = (date: string, time: string) => new Date(`${date}T${time}`).toISOString()

/** "deadline:<id>" | "exam:<id>" | "" */
type LinkValue = string

export default function SessionForm({ initial, onClose, onSaved }: { initial: StudySessionInput; onClose: () => void; onSaved?: () => void }) {
  const { courses, deadlines, exams, user, courseById, saveStudySession, deleteStudySession } = useAppData()
  const toast = useToast()
  const confirm = useConfirm()
  const [form, setForm] = useState({
    title: initial.title,
    courseId: initial.courseId ?? '',
    link: (initial.deadlineId ? `deadline:${initial.deadlineId}` : initial.examId ? `exam:${initial.examId}` : '') as LinkValue,
    date: toDateInput(initial.startAt),
    start: toTimeInput(initial.startAt),
    end: toTimeInput(initial.endAt),
    notes: initial.notes,
    isDone: initial.isDone,
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const now = Date.now()
  const openDeadlines = deadlines.filter((d) => d.status !== 'done' || `deadline:${d.id}` === form.link)
  const upcomingExams = exams.filter((e) => new Date(e.examDate).getTime() > now || `exam:${e.id}` === form.link)
  const courseOptions = courses.filter((c) => c.userId === user.id || c.id === form.courseId)

  function onLinkChange(value: LinkValue) {
    const [kind, id] = value.split(':')
    if (kind === 'deadline') {
      const d = deadlines.find((x) => x.id === id)
      setForm((f) => ({ ...f, link: value, courseId: d?.courseId ?? f.courseId, title: f.title || (d ? `Làm: ${d.title}` : '') }))
    } else if (kind === 'exam') {
      const e = exams.find((x) => x.id === id)
      const code = courseById(e?.courseId ?? null)?.code ?? ''
      setForm((f) => ({ ...f, link: value, courseId: e?.courseId ?? f.courseId, title: f.title || (e ? `Ôn thi ${e.examType} ${code}`.trim() : '') }))
    } else {
      setForm((f) => ({ ...f, link: '' }))
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) return setError('Vui lòng nhập nội dung buổi học')
    if (!form.date || !form.start || !form.end) return setError('Vui lòng chọn ngày và giờ')
    const startAt = combine(form.date, form.start)
    const endAt = combine(form.date, form.end)
    const minutes = (new Date(endAt).getTime() - new Date(startAt).getTime()) / 60_000
    if (minutes <= 0) return setError('Giờ kết thúc phải sau giờ bắt đầu')
    if (minutes > 12 * 60) return setError('Một buổi học tối đa 12 tiếng')

    const [kind, id] = form.link.split(':')
    setBusy(true)
    setError(null)
    try {
      await saveStudySession({
        id: initial.id,
        title: form.title,
        courseId: form.courseId || null,
        deadlineId: kind === 'deadline' ? id : null,
        examId: kind === 'exam' ? id : null,
        startAt,
        endAt,
        isDone: form.isDone,
        notes: form.notes,
      })
      toast.success(initial.id ? 'Đã cập nhật buổi học' : 'Đã thêm vào kế hoạch')
      onSaved?.()
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function onDelete() {
    if (!initial.id) return
    if (!(await confirm({ title: 'Xóa buổi tự học?', message: 'Buổi tự học sẽ bị xóa khỏi kế hoạch tuần.', confirmLabel: 'Xóa buổi tự học' }))) return
    try {
      await deleteStudySession(initial.id)
      toast.success('Đã xóa buổi học')
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <Modal
      open
      title={initial.id ? 'Sửa buổi học' : 'Thêm buổi tự học'}
      onClose={onClose}
      footer={
        <>
          {initial.id && (
            <Button variant="danger" onClick={() => void onDelete()} className="mr-auto">
              <Trash2 className="h-4 w-4" /> Xóa
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>Hủy</Button>
          <Button type="submit" form="session-form" busy={busy}>Lưu</Button>
        </>
      }
    >
      <form id="session-form" onSubmit={onSubmit} className="space-y-4">
        <Field label="Gắn với (tùy chọn)" hint="Gắn với deadline / kỳ thi để theo dõi số buổi đã chuẩn bị">
          <select className={inputClass} value={form.link} onChange={(e) => onLinkChange(e.target.value)}>
            <option value="">Không gắn</option>
            {upcomingExams.length > 0 && (
              <optgroup label="Kỳ thi">
                {upcomingExams.map((x) => (
                  <option key={x.id} value={`exam:${x.id}`}>
                    {x.examType} {courseById(x.courseId)?.code} · {formatDate(x.examDate)}
                  </option>
                ))}
              </optgroup>
            )}
            {openDeadlines.length > 0 && (
              <optgroup label="Deadline">
                {openDeadlines.map((d) => (
                  <option key={d.id} value={`deadline:${d.id}`}>
                    {d.title} · {formatDate(d.dueDate)}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </Field>
        <Field label="Nội dung">
          <input className={inputClass} value={form.title} maxLength={200} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Nhập nội dung buổi học" />
        </Field>
        <Field label="Môn học">
          <select className={inputClass} value={form.courseId} onChange={(e) => setForm({ ...form, courseId: e.target.value })}>
            <option value="">Không gắn môn</option>
            {courseOptions.map((c) => (
              <option key={c.id} value={c.id}>{c.code} - {c.name}</option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Ngày" className="col-span-2 sm:col-span-1">
            <input type="date" className={inputClass} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </Field>
          <Field label="Bắt đầu">
            <input type="time" className={inputClass} value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
          </Field>
          <Field label="Kết thúc">
            <input type="time" className={inputClass} value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
          </Field>
        </div>
        <Field label="Ghi chú">
          <textarea maxLength={2000} className={inputClass} rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Nhập ghi chú" />
        </Field>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" className="h-4 w-4 accent-emerald-500" checked={form.isDone} onChange={(e) => setForm({ ...form, isDone: e.target.checked })} />
          Đã học xong buổi này
        </label>
        <FormError message={error} />
      </form>
    </Modal>
  )
}
