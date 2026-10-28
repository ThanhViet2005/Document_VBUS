// Tiện ích dùng chung cho Edge Functions: CORS, JSON, xác thực, rate limit.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0'

// ALLOWED_ORIGINS: danh sách origin cách nhau bởi dấu phẩy, vd "https://uniplan.vercel.app,http://localhost:5173"
const ALLOWED = (Deno.env.get('ALLOWED_ORIGINS') || '*').split(',').map((s) => s.trim()).filter(Boolean)

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? ''
  const allow = ALLOWED.includes('*') ? '*' : ALLOWED.includes(origin) ? origin : ALLOWED[0] ?? ''
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json; charset=utf-8' },
  })
}

export function preflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405)
  return null
}

export interface AuthedRequest {
  userId: string
  /** Client chạy dưới quyền người dùng (RLS áp dụng) */
  client: SupabaseClient
}

/** Xác thực JWT người dùng. Trả về Response lỗi nếu không hợp lệ. */
export async function requireUser(req: Request): Promise<AuthedRequest | Response> {
  const authorization = req.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) return json(req, { error: 'Cần đăng nhập' }, 401)

  const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await client.auth.getUser(authorization.slice('Bearer '.length))
  if (error || !data.user) return json(req, { error: 'Phiên đăng nhập không hợp lệ' }, 401)
  return { userId: data.user.id, client }
}

/** Gọi public.check_rate_limit() bằng JWT người dùng; vượt giới hạn → Response 429 */
export async function rateLimit(req: Request, client: SupabaseClient, bucket: string, max: number, windowSeconds = 60) {
  const { error } = await client.rpc('check_rate_limit', { p_bucket: bucket, p_max: max, p_window_seconds: windowSeconds })
  if (!error) return null
  if (error.code === 'PT429') return json(req, { error: error.message }, 429)
  return json(req, { error: 'Không kiểm tra được giới hạn truy cập' }, 500)
}
