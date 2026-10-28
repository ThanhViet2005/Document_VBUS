import { useEffect, useId, useState } from 'react'
import { Check, Palette, Pipette } from 'lucide-react'
import { cn } from '../../lib/cn'
import { COURSE_COLOR, COURSE_HEX, courseColor, HEX_COLOR_RE, nearestCourseColor } from '../../lib/labels'
import type { CourseColor } from '../../types'
import { inputClass } from '../ui/Form'

const PRESETS = Object.keys(COURSE_COLOR) as CourseColor[]

export const COLOR_LABEL: Record<CourseColor, string> = {
  red: 'Đỏ',
  blue: 'Xanh dương',
  purple: 'Tím',
  orange: 'Cam',
  green: 'Xanh lá',
  teal: 'Xanh ngọc',
  pink: 'Hồng',
  amber: 'Vàng',
}

/** Bảng màu: 12 tông × 2 sắc (tươi / đậm) + vài màu trung tính. Đủ đa dạng mà vẫn hài hòa với giao diện */
const PALETTE = [
  ['#f43f5e', '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6'],
  ['#be123c', '#b91c1c', '#c2410c', '#b45309', '#a16207', '#4d7c0f', '#15803d', '#047857', '#0f766e', '#0e7490', '#0369a1', '#1d4ed8'],
  ['#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f472b6', '#4338ca', '#6d28d9', '#7e22ce', '#a21caf', '#64748b', '#334155'],
]

export interface ColorValue {
  colorCode: CourseColor
  /** null = bỏ màu tự chọn (quay về màu gợi ý); undefined = chưa từng có màu tự chọn */
  colorHex?: string | null
}

/**
 * Chọn màu môn: hàng màu gợi ý + ô "màu tùy chọn" (cầu vồng). Bấm ô đó → mở bảng màu ngay bên dưới:
 * lưới màu có sẵn, chọn màu bất kỳ bằng bộ chọn màu của hệ điều hành, hoặc nhập mã màu. Có xem trước nhãn môn.
 */
export default function ColorPicker({ value, onChange, previewCode }: { value: ColorValue; onChange: (v: ColorValue) => void; previewCode: string }) {
  const id = useId()
  const custom = value.colorHex && HEX_COLOR_RE.test(value.colorHex) ? value.colorHex.toLowerCase() : null
  const [open, setOpen] = useState(Boolean(custom))
  const [hexText, setHexText] = useState(custom ?? '')
  useEffect(() => setHexText(custom ?? ''), [custom])

  const pickPreset = (c: CourseColor) =>
    // Chỉ gửi null khi trước đó có màu tự chọn (database chưa có cột color_hex vẫn lưu được)
    onChange({ colorCode: c, colorHex: value.colorHex ? null : undefined })
  const pickHex = (hex: string) => {
    const h = hex.toLowerCase()
    onChange({ colorCode: nearestCourseColor(h), colorHex: h })
  }
  const color = courseColor(value)

  return (
    <div className="space-y-3">
      <div>
        <p className="mb-2 text-xs font-medium text-slate-500">Gợi ý</p>
        <div className="flex flex-wrap items-center gap-2.5">
          {PRESETS.map((c) => {
            const active = !custom && value.colorCode === c
            return (
              <button
                key={c}
                type="button"
                onClick={() => pickPreset(c)}
                aria-label={COLOR_LABEL[c]}
                title={COLOR_LABEL[c]}
                aria-pressed={active}
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-full text-white ring-offset-2 ring-offset-surface transition hover:scale-110',
                  COURSE_COLOR[c].bar,
                  active && 'ring-2 ring-brand-500',
                )}
              >
                {active && <Check className="h-4 w-4" strokeWidth={3} />}
              </button>
            )
          })}

          <span className="mx-0.5 h-6 w-px bg-slate-200" aria-hidden />

          {/* Màu tùy chọn: chưa chọn = vòng cầu vồng; đã chọn = chính màu đó */}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls={`${id}-palette`}
            aria-label={custom ? `Màu tùy chọn ${custom}, mở bảng màu` : 'Mở bảng màu để chọn màu khác'}
            title="Chọn màu khác"
            className={cn(
              'relative flex h-9 w-9 items-center justify-center rounded-full ring-offset-2 ring-offset-surface transition hover:scale-110',
              custom ? 'text-white' : 'text-white [background:conic-gradient(#ef4444,#f59e0b,#eab308,#22c55e,#06b6d4,#3b82f6,#8b5cf6,#ec4899,#ef4444)]',
              (custom || open) && 'ring-2 ring-brand-500',
            )}
            style={custom ? { backgroundColor: custom } : undefined}
          >
            {custom ? <Check className="h-4 w-4" strokeWidth={3} /> : <Palette className="h-4 w-4 drop-shadow" />}
          </button>
        </div>
      </div>

      {open && (
        <div id={`${id}-palette`} className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-medium text-slate-500">Bảng màu</p>
          <div className="grid grid-cols-12 gap-1.5" role="group" aria-label="Bảng màu">
            {PALETTE.flat().map((hex) => {
              const active = custom === hex
              return (
                <button
                  key={hex}
                  type="button"
                  onClick={() => pickHex(hex)}
                  aria-label={hex}
                  title={hex}
                  aria-pressed={active}
                  className={cn(
                    'flex aspect-square items-center justify-center rounded-lg text-white ring-offset-1 ring-offset-slate-50 transition hover:scale-110',
                    active && 'ring-2 ring-brand-500',
                  )}
                  style={{ backgroundColor: hex }}
                >
                  {active && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                </button>
              )
            })}
          </div>

          {/* Màu bất kỳ: bộ chọn màu của hệ điều hành hoặc nhập mã màu */}
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-surface px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100">
              <Pipette className="h-4 w-4 text-brand-500" />
              Màu bất kỳ
              <input type="color" className="sr-only" value={custom ?? COURSE_HEX[value.colorCode]} onChange={(e) => pickHex(e.target.value)} />
            </label>
            <input
              className={cn(inputClass, 'text-data h-10 w-32 font-semibold uppercase')}
              value={hexText}
              maxLength={7}
              placeholder="Nhập mã màu"
              aria-label="Mã màu (dạng #RRGGBB)"
              onChange={(e) => {
                const v = e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`
                setHexText(v)
                if (HEX_COLOR_RE.test(v)) pickHex(v)
              }}
            />
            {custom && (
              <button type="button" onClick={() => pickPreset(value.colorCode)} className="text-xs font-semibold text-slate-500 hover:text-slate-800 hover:underline">
                Bỏ màu tùy chọn
              </button>
            )}
          </div>
        </div>
      )}

      {/* Xem trước: nhãn môn như trên thẻ / lịch */}
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <span>Xem trước:</span>
        <span className={cn('relative overflow-hidden rounded-lg py-1 pl-3 pr-2.5 text-sm font-bold', color.soft, color.text)}>
          <span className={cn('absolute inset-y-0 left-0 w-1', color.bar)} aria-hidden />
          {previewCode.trim() || 'Mã môn'}
        </span>
      </div>
    </div>
  )
}
