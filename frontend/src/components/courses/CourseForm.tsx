import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { useAppData } from '../../store/AppData'
import { useToast } from '../ui/Toast'
import Modal from '../ui/Modal'
import { Button, errorMessage, Field, FormError, inputClass } from '../ui/Form'
import { cn } from '../../lib/cn'
import { BLOCKS } from '../../lib/labels'
import type { CourseInput } from '../../services/api'
import { currentSemester, defaultSemester, formatSemester, parseSemester, TERMS, type TermKey } from '../../lib/semester'
import { COURSE_CODE_RE, findCatalogCourse, fold } from '../../lib/courseCatalog'
import { FPT_COURSES, type CatalogCourse } from '../../data/fptCourses'
import CatalogPicker from './CatalogPicker'
import ColorPicker from './ColorPicker'

/** Form thêm / sửa môn học (trang Môn học và thẻ đề xuất của trợ lý AI) */
export default function CourseForm({ initial, onClose, onSaved }: { initial: CourseInput; onClose: () => void; onSaved?: () => void }) {
  const { saveCourse, courses, user } = useAppData()
  const toast = useToast()
  const [form, setForm] = useState<CourseInput>(() => ({ ...initial, semester: initial.semester || defaultSemester() }))
  // Môn vừa chọn từ danh mục FPT (để đổi qua lại tên tiếng Anh / tiếng Việt)
  const [picked, setPicked] = useState<CatalogCourse | null>(null)
  const ownedCodes = useMemo(() => new Set(courses.filter((c) => c.userId === user.id).map((c) => fold(c.code))), [courses, user.id])
  // Gõ tay đúng mã có trong danh mục mà chưa có tên → gợi ý điền tên
  const codeMatch = !picked && !form.name.trim() ? findCatalogCourse(form.code) : undefined

  function pickCourse(c: CatalogCourse) {
    // Chỉ điền mã + tên; học kỳ, Block, màu giữ nguyên. Mọi ô vẫn sửa được sau khi chọn.
    setForm((f) => ({ ...f, code: c.code, name: c.name }))
    setPicked(c)
    setError(null)
  }
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!COURSE_CODE_RE.test(form.code.trim())) return setError('Mã môn 2–20 ký tự, gồm chữ, số, dấu _ hoặc - (không dấu cách)')
    if (!form.name.trim()) return setError('Vui lòng nhập tên môn')
    setBusy(true)
    setError(null)
    try {
      // Giảng viên trống: không gửi (môn chưa từng có) hoặc gửi null (xóa tên đã có)
      const lecturer = form.lecturer?.trim() ? form.lecturer.trim() : initial.lecturer ? null : undefined
      const saved = await saveCourse({ ...form, lecturer })
      toast.success(initial.id ? `Đã cập nhật ${saved.code}` : `Đã thêm ${saved.code}`)
      onSaved?.()
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      title={initial.id ? 'Sửa môn học' : 'Thêm môn học'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Hủy</Button>
          <Button type="submit" form="course-form" busy={busy}>Lưu</Button>
        </>
      }
    >
      <form id="course-form" onSubmit={onSubmit} className="space-y-6">
        {/* 1. Chọn nhanh: tùy chọn, điền sẵn mã + tên */}
        <FormSection step={1} title="Chọn nhanh từ danh mục FPT" hint={`${FPT_COURSES.length} môn · không bắt buộc`}>
          <CatalogPicker ownedCodes={ownedCodes} onPick={pickCourse} />
        </FormSection>

        {/* 2. Thông tin môn: luôn sửa được, kể cả sau khi chọn từ danh mục */}
        <FormSection step={2} title="Thông tin môn học" hint={picked ? 'Đã điền từ danh mục, vẫn sửa được' : undefined}>
          <div className="space-y-4">
            {/* Học kỳ cần đủ rộng cho "Summer (Hè) · Tháng 5 – 9" + ô năm → mỗi ô 1 hàng */}
            <div className="space-y-4">
              <Field label="Mã môn">
                <input maxLength={20} className={cn(inputClass, 'text-data font-semibold')} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="Nhập mã môn" required />
              </Field>
              <Field label="Học kỳ" as="group">
                <SemesterPicker value={form.semester ?? ''} onChange={(semester) => setForm({ ...form, semester })} />
              </Field>
            </div>
            <div className="space-y-2">
              <Field label="Tên môn">
                <input maxLength={200} className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nhập tên môn học" required />
              </Field>
              {/* Môn chọn từ danh mục có tên tiếng Việt: đổi qua lại tên hiển thị */}
              {picked?.nameVi && (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-medium text-slate-500">Dùng tên:</span>
                  <Segmented
                    options={[
                      { value: picked.name, label: 'Tiếng Anh' },
                      { value: picked.nameVi, label: 'Tiếng Việt' },
                    ]}
                    value={form.name}
                    onChange={(v) => setForm({ ...form, name: v })}
                    size="sm"
                  />
                </div>
              )}
              {codeMatch && (
                <button
                  type="button"
                  onClick={() => pickCourse(codeMatch)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 ring-1 ring-inset ring-brand-200 hover:bg-brand-100"
                >
                  Điền tên theo danh mục: {codeMatch.name}
                </button>
              )}
            </div>
            <Field label="Giảng viên" hint="Không bắt buộc. Để trống thì lấy theo thời khóa biểu của môn.">
              <input
                maxLength={200}
                className={inputClass}
                value={form.lecturer ?? ''}
                onChange={(e) => setForm({ ...form, lecturer: e.target.value })}
                placeholder="Nhập tên giảng viên"
                autoComplete="off"
              />
            </Field>
          </div>
        </FormSection>

        {/* 3. Hiển thị: Block + màu trên lịch / thẻ môn */}
        <FormSection step={3} title="Hiển thị">
          <div className="space-y-4">
            <Field label="Block" as="group">
              <Segmented options={BLOCKS.map((b) => ({ value: b, label: b }))} value={form.blockName} onChange={(b) => setForm({ ...form, blockName: b })} />
            </Field>
            <Field label="Màu trên lịch và thẻ môn" as="group">
              <ColorPicker
                value={{ colorCode: form.colorCode, colorHex: form.colorHex }}
                onChange={(v) => setForm((f) => ({ ...f, ...v }))}
                previewCode={form.code}
              />
            </Field>
          </div>
        </FormSection>
        <FormError message={error} />
      </form>
    </Modal>
  )
}

/** Một phần của form: số thứ tự (cam) + tiêu đề + gợi ý, ngăn cách phần trước bằng đường kẻ */
function FormSection({ step, title, hint, children }: { step: number; title: string; hint?: string; children: ReactNode }) {
  return (
    <section className={cn(step > 1 && 'border-t border-slate-100 pt-5')}>
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cta text-xs font-bold text-white" aria-hidden>
          {step}
        </span>
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        {hint && <span className="ml-auto truncate text-xs text-slate-500">{hint}</span>}
      </div>
      {children}
    </section>
  )
}

/** Nút chọn 1 trong nhiều (Block, tên Anh / Việt): cùng kiểu với tab của app, mục đang chọn tô cam */
function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
  size?: 'sm' | 'md'
}) {
  return (
    <div className={cn('inline-grid gap-1 rounded-xl bg-slate-100 p-1 font-semibold', size === 'md' ? 'w-full text-sm' : 'text-xs')} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.label}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={active}
            className={cn(
              'rounded-lg transition-colors',
              size === 'md' ? 'py-2' : 'px-3 py-1',
              active ? 'bg-cta text-white shadow-sm shadow-brand-500/30' : 'text-slate-600 hover:bg-surface hover:text-slate-900',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Chọn học kỳ FPT: kỳ (Spring / Summer / Fall, kèm tháng) + năm. Lưu dạng "Fall 2026".
 * Môn cũ có học kỳ gõ tự do (không đúng dạng) → giữ nguyên làm 1 lựa chọn riêng cho tới khi người dùng đổi.
 */
function SemesterPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const parsed = parseSemester(value)
  const legacy = !parsed && value.trim() ? value.trim() : null
  const now = currentSemester()
  const term = parsed?.term ?? now.term
  const year = parsed?.year ?? now.year
  // Năm trước / năm nay / năm sau (+ năm của dữ liệu cũ nếu nằm ngoài khoảng đó)
  const years = [...new Set([now.year - 1, now.year, now.year + 1, year])].sort()

  return (
    // inputClass có sẵn w-full (cn() không gộp class xung đột) → độ rộng đặt ở thẻ bọc, select luôn đầy thẻ bọc
    <div className="flex gap-2">
      <div className="min-w-0 flex-1">
        <select
          className={cn(inputClass, 'cursor-pointer')}
          value={legacy ? '__legacy' : term}
          onChange={(e) => e.target.value !== '__legacy' && onChange(formatSemester(e.target.value as TermKey, year))}
          aria-label="Kỳ học"
        >
          {TERMS.map((t) => (
            <option key={t.key} value={t.key}>
              {t.key} ({t.vi}) · {t.months}
            </option>
          ))}
          {legacy && <option value="__legacy">{legacy}</option>}
        </select>
      </div>
      <div className="w-24 shrink-0">
        <select
          className={cn(inputClass, 'text-data cursor-pointer')}
          value={year}
          onChange={(e) => onChange(formatSemester(legacy ? now.term : term, Number(e.target.value)))}
          aria-label="Năm học"
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
