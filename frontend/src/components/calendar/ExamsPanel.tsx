import { useState, type FormEvent } from 'react'
import { Clock, GraduationCap, MapPin, Pencil, Percent, Plus, Timer, Trash2 } from 'lucide-react'
import { useAppData } from '../../store/AppData'
import { cn } from '../../lib/cn'
import { formatDateTime } from '../../lib/date'
import { courseColor } from '../../lib/labels'
import { countdownLabel, useNow } from '../../lib/useNow'
import type { ExamInput } from '../../services/api'
import type { Exam, ExamType } from '../../types'
import Modal from '../ui/Modal'
import { Button, EmptyState, errorMessage, Field, FormError, fromLocalInput, inputClass, toLocalInput } from '../ui/Form'
import { useToast } from '../ui/Toast'
import { useConfirm } from '../ui/ConfirmDialog'

const EXAM_FORMATS = ['Thực hành trên máy', 'Trắc nghiệm trên máy', 'Tự luận', 'Vấn đáp', 'Thuyết trình', 'Viết luận']
const TYPE_STYLE: Record<ExamType, string> = {
  PE: 'bg-violet-100 text-violet-700',
  FE: 'bg-red-100 text-red-700',
}
const TYPE_LABEL: Record<ExamType, string> = { PE: 'Practical Exam', FE: 'Final Exam' }

export default function ExamsPanel() {
  const { exams, courses, user } = useAppData()
  const now = useNow(30_000)
  const [editing, setEditing] = useState<ExamInput | null>(null)
  const [showPast, setShowPast] = useState(false)

  const upcoming = exams.filter((e) => new Date(e.examDate) > now)
  const past = exams.filter((e) => new Date(e.examDate) <= now).reverse()
  const firstCourse = courses.find((c) => c.userId === user.id)

  const blank = (): ExamInput => {
    const d = new Date()
    d.setDate(d.getDate() + 7)
    d.setHours(7, 30, 0, 0)
    return {
      courseId: firstCourse?.id ?? '',
      examType: 'FE',
      examDate: d.toISOString(),
      durationMinutes: 60,
      room: '',
      examFormat: 'Trắc nghiệm trên máy',
      weightPercentage: 40,
      notes: '',
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">{upcoming.length} kỳ thi sắp tới</p>
        <Button onClick={() => setEditing(blank())}>
          <Plus className="h-4 w-4" /> Thêm kỳ thi
        </Button>
      </div>

      {exams.length === 0 ? (
        <EmptyState icon={<GraduationCap className="h-6 w-6" />} title="Chưa có lịch thi" text="Thêm lịch thi PE / FE để theo dõi đếm ngược và trọng số điểm." />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {upcoming.map((e) => (
              <ExamCard key={e.id} exam={e} now={now} onEdit={() => setEditing(e)} />
            ))}
          </div>
          {upcoming.length === 0 && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">Không còn kỳ thi nào sắp tới 🎉</p>}

          {past.length > 0 && (
            <div>
              <button onClick={() => setShowPast((v) => !v)} className="text-sm font-semibold text-slate-500 hover:text-slate-800">
                {showPast ? 'Ẩn' : 'Xem'} {past.length} kỳ thi đã qua
              </button>
              {showPast && (
                <div className="mt-3 grid grid-cols-1 gap-4 opacity-70 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {past.map((e) => (
                    <ExamCard key={e.id} exam={e} now={now} onEdit={() => setEditing(e)} />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {editing && <ExamForm initial={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function ExamCard({ exam, now, onEdit }: { exam: Exam; now: Date; onEdit: () => void }) {
  const { courseById } = useAppData()
  const course = courseById(exam.courseId)
  const color = courseColor(course)
  const cd = countdownLabel(new Date(exam.examDate), now)

  return (
    <article className="relative overflow-hidden rounded-2xl border border-slate-200 bg-surface p-5 shadow-card">
      <div className={cn('absolute inset-x-0 top-0 h-1', color.bar)} />
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={cn('rounded-lg px-2.5 py-1 text-sm font-bold', color.soft, color.text)}>{course?.code ?? '—'}</span>
          <span className={cn('rounded-md px-2 py-0.5 text-xs font-bold', TYPE_STYLE[exam.examType])} title={TYPE_LABEL[exam.examType]}>
            {exam.examType}
          </span>
        </div>
        <button onClick={onEdit} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700" aria-label="Sửa kỳ thi">
          <Pencil className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-2 truncate text-sm text-slate-600">{course?.name}</p>

      <div
        className={cn(
          'mt-4 flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold',
          cd.past ? 'bg-slate-100 text-slate-500' : cd.urgent ? 'bg-red-50 text-red-600' : 'bg-brand-50 text-brand-600',
        )}
      >
        <Timer className="h-4 w-4" />
        {cd.text}
      </div>

      <dl className="mt-3 space-y-1.5 text-xs text-slate-600">
        <div className="flex items-center gap-2">
          <Clock className="h-3.5 w-3.5 text-slate-400" />
          <dt className="sr-only">Thời gian</dt>
          <dd>
            {formatDateTime(exam.examDate)}
            {exam.durationMinutes ? ` · ${exam.durationMinutes} phút` : ''}
          </dd>
        </div>
        <div className="flex items-center gap-2">
          <MapPin className="h-3.5 w-3.5 text-slate-400" />
          <dt className="sr-only">Phòng</dt>
          <dd>{exam.room || 'Chưa có phòng'} · {exam.examFormat || 'Chưa rõ hình thức'}</dd>
        </div>
        <div className="flex items-center gap-2">
          <Percent className="h-3.5 w-3.5 text-slate-400" />
          <dt className="sr-only">Trọng số</dt>
          <dd>Trọng số {exam.weightPercentage ?? '—'}%</dd>
        </div>
      </dl>
      {exam.notes && <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">{exam.notes}</p>}
    </article>
  )
}

function ExamForm({ initial, onClose }: { initial: ExamInput; onClose: () => void }) {
  const confirm = useConfirm()
  const { courses, user, saveExam, deleteExam } = useAppData()
  const toast = useToast()
  const [form, setForm] = useState<ExamInput>(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mine = courses.filter((c) => c.userId === user.id)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!form.courseId) return setError('Chọn môn học')
    if (form.weightPercentage !== null && (form.weightPercentage < 0 || form.weightPercentage > 100)) return setError('Trọng số từ 0 đến 100%')
    setBusy(true)
    setError(null)
    try {
      await saveExam(form)
      toast.success('Đã lưu lịch thi')
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function onDelete() {
    if (!initial.id) return
    if (!(await confirm({ title: 'Xóa kỳ thi?', message: 'Kỳ thi sẽ bị xóa khỏi lịch thi và không còn được nhắc.', confirmLabel: 'Xóa kỳ thi' }))) return
    try {
      await deleteExam(initial.id)
      toast.success('Đã xóa kỳ thi')
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const num = (v: string) => (v === '' ? null : Number(v))

  return (
    <Modal
      open
      title={initial.id ? 'Sửa kỳ thi' : 'Thêm kỳ thi'}
      onClose={onClose}
      footer={
        <>
          {initial.id && (
            <Button variant="danger" onClick={() => void onDelete()} className="mr-auto">
              <Trash2 className="h-4 w-4" /> Xóa
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>Hủy</Button>
          <Button type="submit" form="exam-form" busy={busy}>Lưu</Button>
        </>
      }
    >
      {mine.length === 0 ? (
        <p className="text-sm text-slate-600">Bạn cần thêm môn học trước (mục Môn học).</p>
      ) : (
        <form id="exam-form" onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Field label="Môn học" className="col-span-2">
              <select className={inputClass} value={form.courseId} onChange={(e) => setForm({ ...form, courseId: e.target.value })} required>
                <option value="">Chọn môn…</option>
                {mine.map((c) => (
                  <option key={c.id} value={c.id}>{c.code} - {c.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Loại">
              <select className={inputClass} value={form.examType} onChange={(e) => setForm({ ...form, examType: e.target.value as ExamType })}>
                <option value="PE">PE</option>
                <option value="FE">FE</option>
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Ngày giờ thi" className="col-span-2">
              <input
                type="datetime-local"
                className={inputClass}
                value={toLocalInput(form.examDate)}
                onChange={(e) => e.target.value && setForm({ ...form, examDate: fromLocalInput(e.target.value) })}
                required
              />
            </Field>
            <Field label="Thời lượng (phút)">
              <input type="number" min={1} max={600} className={inputClass} value={form.durationMinutes ?? ''} onChange={(e) => setForm({ ...form, durationMinutes: num(e.target.value) })} />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Phòng thi">
              <input maxLength={100} className={inputClass} value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} placeholder="Nhập phòng thi" />
            </Field>
            <Field label="Hình thức" className="col-span-2">
              <input maxLength={200} className={inputClass} list="exam-formats" value={form.examFormat} onChange={(e) => setForm({ ...form, examFormat: e.target.value })} />
              <datalist id="exam-formats">
                {EXAM_FORMATS.map((f) => (
                  <option key={f} value={f} />
                ))}
              </datalist>
            </Field>
          </div>
          <Field label="Trọng số điểm (%)">
            <input type="number" min={0} max={100} step={0.5} className={inputClass} value={form.weightPercentage ?? ''} onChange={(e) => setForm({ ...form, weightPercentage: num(e.target.value) })} />
          </Field>
          <Field label="Ghi chú">
            <textarea maxLength={2000} className={inputClass} rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Nhập ghi chú" />
          </Field>
          <FormError message={error} />
        </form>
      )}
    </Modal>
  )
}
