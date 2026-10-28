// Xác thực lời gọi từ lịch chạy (pg_cron + pg_net) cho send-reminders / send-email-digest.
// Header x-cron-secret được chấp nhận nếu khớp:
//   1. mã trong bảng public.cron_token (migration 010, sinh ngẫu nhiên trong database, cron đọc trực tiếp) – cách mặc định;
//   2. hoặc secret CRON_SECRET của Edge Function (cách cũ: cron đọc từ Vault 'uniplan_cron_secret').
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0'

/** So sánh chuỗi thời gian hằng (tránh dò mã theo thời gian phản hồi) */
export function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a)
  const y = new TextEncoder().encode(b)
  let diff = x.length ^ y.length
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return diff === 0
}

/** service: client service role (bảng cron_token chỉ service_role đọc được) */
export async function isCronCall(provided: string, service: SupabaseClient): Promise<boolean> {
  if (provided.length < 16) return false
  const envSecret = Deno.env.get('CRON_SECRET')
  if (envSecret && safeEqual(provided, envSecret)) return true
  const { data, error } = await service.from('cron_token').select('token').eq('id', 1).maybeSingle()
  // Chưa chạy migration 010 → chỉ còn cách CRON_SECRET
  if (error || !data?.token) return false
  return safeEqual(provided, data.token as string)
}
