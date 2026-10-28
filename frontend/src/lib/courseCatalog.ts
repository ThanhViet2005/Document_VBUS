// Tìm môn trong danh mục FPT (data/fptCourses.ts): theo mã hoặc tên tiếng Anh / tiếng Việt, không phân biệt hoa thường và dấu.
import { FPT_COURSES, type CatalogCourse } from '../data/fptCourses'

/** Mã môn hợp lệ: 2–20 ký tự gồm chữ, số, gạch dưới, gạch ngang (vd PRO192, WED201c, BF_GRA_ELE). Khớp ràng buộc database */
export const COURSE_CODE_RE = /^[A-Za-z0-9_-]{2,20}$/

/** Bỏ dấu tiếng Việt + chữ thường: "Ngân hàng số" → "ngan hang so" */
export function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim()
}

const INDEX = FPT_COURSES.map((c) => ({ course: c, code: fold(c.code), text: fold(`${c.name} ${c.nameVi ?? ''}`) }))

/**
 * Kết quả xếp theo độ khớp: mã trùng khớp → mã bắt đầu bằng từ khóa → mã chứa từ khóa → tên chứa đủ mọi từ.
 * Từ khóa rỗng → toàn bộ danh mục (theo thứ tự mã).
 */
export function searchCatalog(query: string, limit = 8): CatalogCourse[] {
  const q = fold(query)
  if (!q) return FPT_COURSES.slice(0, limit)
  const words = q.split(/\s+/)
  const scored: { course: CatalogCourse; score: number }[] = []
  for (const { course, code, text } of INDEX) {
    let score = 0
    if (code === q) score = 100
    else if (code.startsWith(q)) score = 80
    else if (code.includes(q)) score = 60
    else if (words.every((w) => text.includes(w) || code.includes(w))) score = text.startsWith(words[0]) ? 40 : 20
    if (score) scored.push({ course, score })
  }
  return scored.sort((a, b) => b.score - a.score || a.course.code.localeCompare(b.course.code)).slice(0, limit).map((s) => s.course)
}

/** Môn trong danh mục có đúng mã này (không phân biệt hoa thường) */
export function findCatalogCourse(code: string): CatalogCourse | undefined {
  const c = fold(code)
  return c ? INDEX.find((x) => x.code === c)?.course : undefined
}
