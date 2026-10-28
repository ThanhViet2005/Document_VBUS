// Validation cho Đăng nhập / Đăng ký.
// Chấp nhận MỌI email hợp lệ (Gmail, Outlook, email trường...). Database cũng kiểm tra định dạng ngay tại auth.users
// (migration ..._any_email.sql), nên kiểm tra ở đây là để báo lỗi ngay cho người dùng, không phải lớp bảo vệ duy nhất.

/** Phần trước @: chữ, số và . _ % + - ; tên miền: các nhãn chữ / số / gạch ngang ngăn bởi dấu chấm, đuôi ≥ 2 chữ cái. Khớp is_allowed_email() */
export const EMAIL_REGEX = /^[a-z0-9._%+-]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/i

/** Email trường FPT: chỉ dùng để hiện huy hiệu "Sinh viên FPTU", không còn là điều kiện đăng nhập */
export const FPT_EMAIL_REGEX = /^[a-z0-9._%+-]+@(fpt\.edu\.vn|fe\.edu\.vn)$/i
export const isFptEmail = (email: string) => FPT_EMAIL_REGEX.test(email.trim())

export const PASSWORD_MIN_LENGTH = 8

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function validateEmail(email: string): string | null {
  const value = normalizeEmail(email)
  if (!value) return 'Vui lòng nhập email'
  if (value.length > 254 || !EMAIL_REGEX.test(value)) return 'Email không đúng định dạng (vd: ten@gmail.com)'
  return null
}

/**
 * Kiểm tra NGAY KHI ĐANG GÕ: chỉ báo khi chắc chắn sai (có khoảng trắng, nhiều dấu @, ký tự lạ).
 * Đang gõ dở "abc@gm" thì chưa báo, tránh làm phiền; rời ô mới kiểm tra đầy đủ.
 */
export function liveEmailError(email: string): string | null {
  const value = email.trim()
  if (!value) return null
  if (/\s/.test(value) || (value.match(/@/g)?.length ?? 0) > 1 || /[^a-z0-9._%+\-@]/i.test(value)) return 'Email không đúng định dạng (vd: ten@gmail.com)'
  return null
}

export function validateFullName(name: string): string | null {
  const value = name.trim().replace(/\s+/g, ' ')
  if (!value) return 'Vui lòng nhập họ và tên'
  if (value.length < 2 || value.length > 100) return 'Họ và tên từ 2 đến 100 ký tự'
  // Chữ cái (kể cả tiếng Việt có dấu), khoảng trắng, dấu nháy, gạch nối
  if (!/^[\p{L}\p{M}' -]+$/u.test(value)) return 'Họ và tên chỉ gồm chữ cái'
  return null
}

export function validateNewPassword(password: string): string | null {
  if (!password) return 'Vui lòng nhập mật khẩu'
  if (password.length < PASSWORD_MIN_LENGTH) return `Mật khẩu phải có ít nhất ${PASSWORD_MIN_LENGTH} ký tự`
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Mật khẩu cần có cả chữ và số'
  return null
}

export interface RegisterInput {
  fullName: string
  email: string
  password: string
  confirmPassword: string
}

export type FieldErrors<K extends string> = Partial<Record<K, string>>

export function validateRegister(input: RegisterInput): FieldErrors<keyof RegisterInput> {
  const errors: FieldErrors<keyof RegisterInput> = {}
  const name = validateFullName(input.fullName)
  const email = validateEmail(input.email)
  const password = validateNewPassword(input.password)
  if (name) errors.fullName = name
  if (email) errors.email = email
  if (password) errors.password = password
  if (!input.confirmPassword) errors.confirmPassword = 'Vui lòng nhập lại mật khẩu'
  else if (input.confirmPassword !== input.password) errors.confirmPassword = 'Mật khẩu nhập lại không khớp'
  return errors
}

export function validateLogin(input: { email: string; password: string }): FieldErrors<'email' | 'password'> {
  const errors: FieldErrors<'email' | 'password'> = {}
  const email = validateEmail(input.email)
  if (email) errors.email = email
  if (!input.password) errors.password = 'Vui lòng nhập mật khẩu'
  return errors
}

export const hasErrors = (errors: object) => Object.values(errors).some(Boolean)
