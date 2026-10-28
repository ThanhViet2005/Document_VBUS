// Học kỳ FPT: 3 kỳ / năm. Lưu dạng "Fall 2026" (cột courses.semester) như trước để dữ liệu cũ vẫn dùng được.
export const TERMS = [
  { key: 'Spring', vi: 'Xuân', months: 'Tháng 1 – 5' },
  { key: 'Summer', vi: 'Hè', months: 'Tháng 5 – 9' },
  { key: 'Fall', vi: 'Thu', months: 'Tháng 9 – 12' },
] as const

export type TermKey = (typeof TERMS)[number]['key']

const SEMESTER_RE = /^(spring|summer|fall)\s+(\d{4})$/i

/** Kỳ đang học theo ngày: tháng 1–4 Spring, 5–8 Summer, 9–12 Fall */
export function currentSemester(now = new Date()): { term: TermKey; year: number } {
  const m = now.getMonth()
  return { term: m < 4 ? 'Spring' : m < 8 ? 'Summer' : 'Fall', year: now.getFullYear() }
}

/** "fall 2026" → { term: 'Fall', year: 2026 }; chữ tự do của dữ liệu cũ → null */
export function parseSemester(value: string | null | undefined): { term: TermKey; year: number } | null {
  const m = SEMESTER_RE.exec((value ?? '').trim())
  if (!m) return null
  const term = TERMS.find((t) => t.key.toLowerCase() === m[1].toLowerCase())!.key
  return { term, year: Number(m[2]) }
}

export const formatSemester = (term: TermKey, year: number) => `${term} ${year}`

export const defaultSemester = () => {
  const s = currentSemester()
  return formatSemester(s.term, s.year)
}
