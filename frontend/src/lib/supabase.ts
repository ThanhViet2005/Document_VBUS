import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { clearLegacyDeviceConfig, getSupabaseConfig, validateAnonKey, validateSupabaseUrl } from './config'

// Client được khởi tạo từ cấu hình của lập trình viên (biến VITE_* lúc build).
clearLegacyDeviceConfig()
const { url, anonKey } = getSupabaseConfig()

/** Lý do cấu hình không dùng được (null nếu hợp lệ hoặc chưa cấu hình) */
export const supabaseConfigError: string | null =
  url && anonKey ? (validateSupabaseUrl(url) ?? validateAnonKey(anonKey)) : null

if (supabaseConfigError) console.error(`[UniPlan] Cấu hình Supabase không hợp lệ: ${supabaseConfigError}`)

/** Chưa cấu hình (hoặc cấu hình sai) → app chạy ở chế độ demo với dữ liệu mẫu */
export const isSupabaseConfigured = Boolean(url && anonKey && !supabaseConfigError)

// Chỉ dùng anon key công khai (được bảo vệ bởi RLS). Không bao giờ đặt service_role key ở frontend.
// Lưu ý về Connection Pooling: supabase-js nói chuyện qua HTTP (PostgREST/Realtime), không mở kết nối
// Postgres trực tiếp. PostgREST đã tự pool kết nối, nên 100+ người dùng đồng thời không tạo thêm kết nối DB.
export const supabase: SupabaseClient<Database> | null = isSupabaseConfigured
  ? createClient<Database>(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      realtime: { params: { eventsPerSecond: 5 } },
    })
  : null
