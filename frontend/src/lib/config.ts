// Cấu hình máy chủ do LẬP TRÌNH VIÊN đặt bằng biến môi trường lúc build VITE_* (Vercel / frontend/.env),
// người dùng không chỉnh được từ giao diện.
// Chỉ chứa giá trị CÔNG KHAI: Supabase URL, anon/publishable key (được RLS bảo vệ), VAPID public key.
// Key bí mật (Groq, VAPID private...) nằm trong Supabase Edge Function secrets, không bao giờ ở frontend.

export function getSupabaseConfig(): { url: string; anonKey: string } {
  const env = import.meta.env as Record<string, string | undefined>
  return {
    // Chấp nhận cả khi lỡ dán URL REST (https://xxx.supabase.co/rest/v1/): supabase-js cần URL gốc của project
    url: (env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, ''),
    anonKey: (env.VITE_SUPABASE_ANON_KEY || '').trim(),
  }
}

/** Khóa công khai VAPID cho Web Push (công khai, không phải bí mật) */
export function getVapidPublicKey(): string {
  return ((import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) || '').trim()
}

/**
 * Bản cũ cho phép tự nhập Supabase URL / Grok key / Vercel hook và lưu trong trình duyệt.
 * Tính năng đó đã bỏ: xóa dữ liệu cũ để key không còn nằm lại trên thiết bị.
 */
export function clearLegacyDeviceConfig() {
  for (const storage of [() => window.localStorage, () => window.sessionStorage]) {
    try {
      storage().removeItem('uniplan.config.v1')
    } catch {
      // storage bị chặn → không có gì để xóa
    }
  }
}

// ---------------------------------------------------------------------
// Kiểm tra cấu hình của lập trình viên (phát hiện cấu hình sai / lỡ dùng secret key)
// ---------------------------------------------------------------------
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '='))) as Record<string, unknown>
  } catch {
    return null
  }
}

const PRIVATE_HOST = /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|[\w-]+\.local)$/

export function validateSupabaseUrl(url: string): string | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return 'URL không hợp lệ'
  }
  if (u.protocol === 'https:') return null
  if (u.protocol === 'http:' && PRIVATE_HOST.test(u.hostname)) return null
  return 'Chỉ chấp nhận https:// (hoặc http:// cho máy chủ nội bộ / localhost)'
}

/** Chặn tuyệt đối việc dùng service_role / secret key ở frontend */
export function validateAnonKey(key: string): string | null {
  const k = key.trim()
  if (k.startsWith('sb_secret_')) return 'Đây là SECRET key. Chỉ dùng publishable/anon key ở trình duyệt.'
  if (k.startsWith('sb_publishable_')) return null
  const payload = decodeJwtPayload(k)
  if (!payload) return 'Anon key không đúng định dạng (JWT hoặc sb_publishable_...)'
  if (payload.role === 'service_role') return 'Đây là service_role key: tuyệt đối không dùng ở frontend!'
  if (payload.role !== 'anon') return 'Key phải có role "anon"'
  return null
}
