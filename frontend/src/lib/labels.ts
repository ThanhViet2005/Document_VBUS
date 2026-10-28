import type { BlockName, CourseColor, Priority, TaskStatus, TaskType } from '../types'

/** 3 Block của 1 học kỳ (enum block_name, migration 009 thêm Block 3) */
export const BLOCKS: BlockName[] = ['Block 1', 'Block 2', 'Block 3']

export const PRIORITY_LABEL: Record<Priority, string> = {
  low: 'Thấp',
  medium: 'Trung bình',
  high: 'Cao',
}

export const PRIORITY_STYLE: Record<Priority, string> = {
  low: 'bg-slate-100 text-slate-600',
  medium: 'bg-amber-50 text-amber-700',
  high: 'bg-red-50 text-red-600',
}

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'Chưa bắt đầu',
  in_progress: 'Đang làm',
  done: 'Hoàn thành',
}

export const TASK_TYPE_LABEL: Record<TaskType, string> = {
  assignment: 'Assignment',
  lab: 'Lab',
  practical: 'Practical',
  revision: 'Revision',
  group_project: 'Group Project',
}

/** Class Tailwind viết đầy đủ để trình quét của Tailwind nhận diện được */
export const COURSE_COLOR: Record<CourseColor, { bar: string; soft: string; text: string }> = {
  red: { bar: 'bg-red-500', soft: 'bg-red-50', text: 'text-red-600' },
  blue: { bar: 'bg-blue-500', soft: 'bg-blue-50', text: 'text-blue-600' },
  purple: { bar: 'bg-violet-500', soft: 'bg-violet-50', text: 'text-violet-600' },
  orange: { bar: 'bg-orange-500', soft: 'bg-orange-50', text: 'text-orange-600' },
  green: { bar: 'bg-emerald-500', soft: 'bg-emerald-50', text: 'text-emerald-600' },
  teal: { bar: 'bg-teal-500', soft: 'bg-teal-50', text: 'text-teal-600' },
  pink: { bar: 'bg-pink-500', soft: 'bg-pink-50', text: 'text-pink-600' },
  amber: { bar: 'bg-amber-500', soft: 'bg-amber-50', text: 'text-amber-600' },
}

/** Mã màu (hex) của 8 màu gợi ý: dùng cho biểu đồ SVG và để tìm màu gợi ý gần nhất với màu tự chọn */
export const COURSE_HEX: Record<CourseColor, string> = {
  red: '#ef4444',
  blue: '#3b82f6',
  purple: '#8b5cf6',
  orange: '#f97316',
  green: '#10b981',
  teal: '#14b8a6',
  pink: '#ec4899',
  amber: '#f59e0b',
}

export const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i

/**
 * Màu theo trạng thái: Chưa bắt đầu = cam, Đang làm = xanh dương, Hoàn thành = xanh lá.
 * Dùng chung cho nút trạng thái, thanh tiến độ, nhãn trạng thái (cùng một quy ước màu khắp app).
 *   solid: nền đậm + chữ trắng (nút đang chọn); bar: thanh tiến độ; soft: nhãn nền nhạt; text: chữ cùng tông.
 */
export const STATUS_TONE: Record<TaskStatus, { solid: string; bar: string; soft: string; text: string }> = {
  todo: { solid: 'bg-[#f97316] text-white shadow-sm shadow-orange-500/30', bar: 'bg-[#f97316]', soft: 'bg-orange-50 text-orange-600', text: 'text-orange-600' },
  in_progress: { solid: 'bg-[#2563eb] text-white shadow-sm shadow-blue-600/30', bar: 'bg-[#2563eb]', soft: 'bg-blue-50 text-blue-600', text: 'text-blue-600' },
  done: { solid: 'bg-[#16a34a] text-white shadow-sm shadow-green-600/30', bar: 'bg-[#16a34a]', soft: 'bg-emerald-50 text-emerald-700', text: 'text-emerald-600' },
}

/** Tông màu của 1 % tiến độ (thanh tiến độ môn học): 0% cam → đang làm xanh dương → 100% xanh lá */
export const progressTone = (pct: number): TaskStatus => (pct >= 100 ? 'done' : pct > 0 ? 'in_progress' : 'todo')

/**
 * Màu tự chọn (#rrggbb) không có sẵn class Tailwind → tạo class lúc chạy (1 lần / màu) trong thẻ <style id="course-colors">.
 * soft / text pha với màu nền thẻ / màu chữ đậm của giao diện (var) nên tự đổi đúng ở giao diện sáng / tối:
 *   sáng: nền nhạt + chữ đậm cùng tông; tối: nền tối pha màu + chữ sáng cùng tông.
 */
const injected = new Set<string>()
function hexClasses(hex: string): { bar: string; soft: string; text: string } {
  const k = hex.slice(1).toLowerCase()
  if (!injected.has(k) && typeof document !== 'undefined') {
    let el = document.getElementById('course-colors') as HTMLStyleElement | null
    if (!el) {
      el = document.createElement('style')
      el.id = 'course-colors'
      document.head.appendChild(el)
    }
    const c = `#${k}`
    for (const rule of [
      `.cc-${k}-bar{background-color:${c}}`,
      `.cc-${k}-soft{background-color:color-mix(in oklab,${c} 16%,var(--color-surface))}`,
      `.cc-${k}-text{color:color-mix(in oklab,${c} 70%,var(--color-slate-900))}`,
    ])
      el.sheet?.insertRule(rule, el.sheet.cssRules.length)
    injected.add(k)
  }
  return { bar: `cc-${k}-bar`, soft: `cc-${k}-soft`, text: `cc-${k}-text` }
}

type ColorSource = { colorCode: CourseColor; colorHex?: string | null } | null | undefined

/** Class màu của 1 môn (bar: vạch / chấm đậm, soft: nền nhạt, text: chữ). Không có môn → cam. Có màu tự chọn → dùng màu đó */
export function courseColor(c: ColorSource): { bar: string; soft: string; text: string } {
  if (!c) return COURSE_COLOR.orange
  if (c.colorHex && HEX_COLOR_RE.test(c.colorHex)) return hexClasses(c.colorHex)
  return COURSE_COLOR[c.colorCode] ?? COURSE_COLOR.orange
}

/** Mã hex của màu môn (biểu đồ SVG, style inline) */
export function courseHex(c: ColorSource, fallback = '#94a3b8'): string {
  if (!c) return fallback
  if (c.colorHex && HEX_COLOR_RE.test(c.colorHex)) return c.colorHex.toLowerCase()
  return COURSE_HEX[c.colorCode] ?? fallback
}

/** Màu gợi ý gần nhất với 1 màu tự chọn (lưu kèm color_code để link chia sẻ / dữ liệu cũ vẫn có màu hợp lý) */
export function nearestCourseColor(hex: string): CourseColor {
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
  const [r, g, b] = rgb(hex)
  let best: CourseColor = 'orange'
  let bestD = Infinity
  for (const [name, h] of Object.entries(COURSE_HEX) as [CourseColor, string][]) {
    const [r2, g2, b2] = rgb(h)
    // Trọng số theo độ nhạy của mắt với từng kênh màu
    const d = 2 * (r - r2) ** 2 + 4 * (g - g2) ** 2 + 3 * (b - b2) ** 2
    if (d < bestD) {
      bestD = d
      best = name
    }
  }
  return best
}
