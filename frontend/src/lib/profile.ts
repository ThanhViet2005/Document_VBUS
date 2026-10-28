// Hồ sơ cá nhân: danh sách cơ sở và kiểm tra dữ liệu (khớp trigger validate_user_profile, migration 011)
import { validateFullName } from './authValidation'

export const CAMPUSES = [
  'FPT University Hà Nội',
  'FPT University Hồ Chí Minh',
  'FPT University Đà Nẵng',
  'FPT University Cần Thơ',
  'FPT University Quy Nhơn',
] as const

export interface ProfileInput {
  fullName: string
  studentCode: string
  campus: string
}

export const STUDENT_CODE_MAX = 14
export const PHONE_MIN_DIGITS = 8
export const PHONE_MAX_DIGITS = 14

/** Bỏ khoảng trắng, dấu chấm, gạch ngang, ngoặc → chuỗi lưu trong database (vd "+84 353 021 389" → "+84353021389") */
export const normalizePhone = (raw: string) => raw.replace(/[\s.\-()]/g, '')

/** Số điện thoại 8–14 chữ số, cho phép + đầu số. Trống hợp lệ. Trả về lỗi hoặc null */
export function validatePhone(raw: string): string | null {
  const p = normalizePhone(raw)
  if (!p) return null
  if (!/^[+]?[0-9]{8,14}$/.test(p)) return `Số điện thoại gồm ${PHONE_MIN_DIGITS}–${PHONE_MAX_DIGITS} chữ số, có thể bắt đầu bằng + (vd: 0353 021 389)`
  return null
}

/**
 * Hiển thị số điện thoại dễ đọc: 0353021389 → "0353 021 389", +84353021389 → "+84 353 021 389".
 * Số khác chuẩn thì nhóm 3 chữ số từ cuối (không đổi nội dung, chỉ thêm khoảng trắng).
 */
export function formatPhone(phone: string): string {
  const p = normalizePhone(phone)
  if (/^0\d{9}$/.test(p)) return `${p.slice(0, 4)} ${p.slice(4, 7)} ${p.slice(7)}`
  if (/^\+84\d{9}$/.test(p)) return `+84 ${p.slice(3, 6)} ${p.slice(6, 9)} ${p.slice(9)}`
  const plus = p.startsWith('+') ? '+' : ''
  const digits = p.replace(/^[+]/, '')
  return plus + (digits.match(/\d{1,3}(?=(\d{3})*$)/g)?.join(' ') ?? digits)
}

/** Giữ nguyên chữ hoa / thường như người dùng nhập, chỉ bỏ khoảng trắng hai đầu */
export const normalizeStudentCode = (code: string) => code.trim()

/**
 * Lọc ô nhập MSSV: chỉ giữ ký tự tiếng Anh (ASCII in được: chữ không dấu, số, khoảng trắng, ký hiệu).
 * Chữ tiếng Việt được đổi về chữ không dấu (ế → e, đ → d) để bộ gõ tiếng Việt không làm mất chữ; mọi ký tự còn lại ngoài ASCII bị bỏ.
 */
export function toEnglishCode(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^\x20-\x7E]/g, '')
    .slice(0, STUDENT_CODE_MAX)
}

/** Mã SV không bắt buộc (giảng viên không có): chỉ ký tự tiếng Anh (ASCII in được), tối đa 14 ký tự */
export function validateStudentCode(code: string): string | null {
  const value = normalizeStudentCode(code)
  if (!value) return null
  if (!/^[ -~]+$/.test(value)) return 'Mã số sinh viên chỉ gồm chữ không dấu, số và ký hiệu (tiếng Anh)'
  if (value.length > STUDENT_CODE_MAX) return `Mã số sinh viên tối đa ${STUDENT_CODE_MAX} ký tự`
  return null
}

export function validateProfile(input: ProfileInput): Partial<Record<keyof ProfileInput, string>> {
  const errors: Partial<Record<keyof ProfileInput, string>> = {}
  const name = validateFullName(input.fullName)
  const code = validateStudentCode(input.studentCode)
  if (name) errors.fullName = name
  if (code) errors.studentCode = code
  if (!(CAMPUSES as readonly string[]).includes(input.campus)) errors.campus = 'Vui lòng chọn cơ sở'
  return errors
}
