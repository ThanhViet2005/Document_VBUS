import { useState, type FormEvent } from 'react'
import { Trash2 } from 'lucide-react'
import { useAppData } from '../../store/AppData'
import { FPT_SLOTS, toMinutes, WEEKDAY_LONG } from '../../lib/date'
import type { ScheduleInput } from '../../services/api'
import type { BlockName } from '../../types'
import { BLOCKS } from '../../lib/labels'
import Modal from '../ui/Modal'
import { Button, errorMessage, Field, FormError, inputClass } from '../ui/Form'
import { useToast } from '../ui/Toast'
import { useConfirm } from '../ui/ConfirmDialog'
import { toDateKey } from '../../lib/schedule'

/** "2026-11-15" → "Chủ nhật, 15/11/2026" */
function formatEndDate(key: string): string {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function ScheduleForm({ initial, onClose, onSaved }: { initial: ScheduleInput; onClose: () => void; onSaved?: () => void }) {
  const { courses, user, saveSchedule, deleteSchedule } = useAppData()
  const toast = useToast()
  const confirm = useConfirm()
  const [form, setForm] = useState<ScheduleInput>(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mine = courses.filter((c) => c.userId === user.id)
  const slot = FPT_SLOTS.findIndex((s) => s.start === form.startTime && s.end === form.endTime)
  // Ngày kết thúc cũ (đã qua) vẫn giữ được khi sửa, chỉ chặn chọn ngày đã qua cho lịch mới
  const todayKey = initial.endDate && initial.endDate < toDateKey(new Date()) ? undefined : toDateKey(new Date())

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!form.courseId) return setError('Chọn môn học')
    if (toMinutes(form.endTime) <= toMinutes(form.startTime)) return setError('Giờ kết thúc phải sau giờ bắt đầu')
    setBusy(true)
    setError(null)
    try {
      await saveSchedule(form)
      toast.success('Đã lưu lịch học')
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
    if (!(await confirm({ title: 'Xóa buổi học?', message: 'Buổi học sẽ bị xóa khỏi thời khóa biểu.', confirmLabel: 'Xóa buổi học' }))) return
    try {
      await deleteSchedule(initial.id)
      toast.success('Đã xóa buổi học')
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <Modal
      open
      title={initial.id ? 'Sửa buổi học' : 'Thêm buổi học'}
      onClose={onClose}
      footer={
        <>
          {initial.id && (
            <Button variant="danger" onClick={() => void onDelete()} className="mr-auto">
              <Trash2 className="h-4 w-4" /> Xóa
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>Hủy</Button>
          <Button type="submit" form="schedule-form" busy={busy}>Lưu</Button>
        </>
      }
    >
      {mine.length === 0 ? (
        <p className="text-sm text-slate-600">Bạn cần thêm môn học trước (mục Môn học).</p>
      ) : (
        <form id="schedule-form" onSubmit={onSubmit} className="space-y-4">
          <Field label="Môn học">
            <select className={inputClass} value={form.courseId} onChange={(e) => setForm({ ...form, courseId: e.target.value })} required>
              <option value="">Chọn môn…</option>
              {mine.map((c) => (
                <option key={c.id} value={c.id}>{c.code} - {c.name}</option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Thứ">
              <select className={inputClass} value={form.dayOfWeek} onChange={(e) => setForm({ ...form, dayOfWeek: Number(e.target.value) })}>
                {WEEKDAY_LONG.map((d, i) => (
                  <option key={d} value={i + 1}>{d}</option>
                ))}
              </select>
            </Field>
            <Field label="Block">
              <select className={inputClass} value={form.blockPeriod} onChange={(e) => setForm({ ...form, blockPeriod: e.target.value as BlockName })}>
                {BLOCKS.map((b) => (
                  <option key={b}>{b}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Slot">
            <select
              className={inputClass}
              value={slot}
              onChange={(e) => {
                const s = FPT_SLOTS[Number(e.target.value)]
                if (s) setForm({ ...form, startTime: s.start, endTime: s.end })
              }}
            >
              {FPT_SLOTS.map((s, i) => (
                <option key={s.label} value={i}>{s.label} ({s.start}–{s.end})</option>
              ))}
              <option value={-1}>Tùy chỉnh</option>
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Bắt đầu">
              <input type="time" className={inputClass} value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} required />
            </Field>
            <Field label="Kết thúc">
              <input type="time" className={inputClass} value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} required />
            </Field>
          </div>
          <Field label="Ngày kết thúc" hint={form.endDate ? `Buổi cuối: ${formatEndDate(form.endDate)}. Sau ngày này buổi học không còn hiện trên lịch.` : 'Để trống nếu học hằng tuần đến khi tự xóa.'}>
            <div className="flex gap-2">
              <input
                type="date"
                className={inputClass}
                value={form.endDate ?? ''}
                min={todayKey}
                onChange={(e) => setForm({ ...form, endDate: e.target.value || null })}
              />
              {form.endDate && (
                <Button variant="secondary" onClick={() => setForm({ ...form, endDate: null })} className="shrink-0">
                  Bỏ
                </Button>
              )}
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phòng">
              <input maxLength={100} className={inputClass} value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} placeholder="Nhập phòng học" />
            </Field>
            <Field label="Giảng viên">
              <input maxLength={200} className={inputClass} value={form.lecturer} onChange={(e) => setForm({ ...form, lecturer: e.target.value })} placeholder="Nhập tên giảng viên" />
            </Field>
          </div>
          <FormError message={error} />
        </form>
      )}
    </Modal>
  )
}
