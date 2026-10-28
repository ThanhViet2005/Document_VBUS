// POST /functions/v1/send-reminders
// Hai chế độ:
//   1. Cron (header x-cron-secret = CRON_SECRET): gửi nhắc deadline theo các mốc NGƯỜI DÙNG ĐÃ CHỌN (reminder_prefs, migration 020:
//      trước hạn 3 ngày / 1 ngày / 3 giờ / 1 giờ / 15 phút / lúc đến hạn) tới mọi thiết bị đã đăng ký.
//      Chỉ ghi reminder_log khi gửi thành công ít nhất 1 thiết bị → lỗi tạm thời sẽ được thử lại ở lần chạy sau.
//      Đăng ký hết hạn (404/410) bị xóa.
//   2. Gửi thử (Authorization: Bearer <JWT người dùng>): gửi 1 thông báo thử tới thiết bị của chính người đó. 3 lần/phút.
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:...), CRON_SECRET.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { json, preflight, rateLimit, requireUser } from '../_shared/http.ts'
import { isCronCall } from '../_shared/cron.ts'
import { isPushEndpoint, sendWebPush, type VapidKeys } from '../_shared/webpush.ts'

interface Sub {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
}
interface Due {
  user_id: string
  deadline_id: string
  kind: '3d' | '24h' | '3h' | '1h' | '15m' | 'due'
  title: string
  course_code: string | null
  due_date: string
}

const CONCURRENCY = 10
const MAX_PER_USER = 20

function vapidKeys(): VapidKeys | null {
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY')
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY')
  if (!publicKey || !privateKey) return null
  return { publicKey, privateKey, subject: Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@uniplan.app' }
}

function serviceClient() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

const dueParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Ho_Chi_Minh',
  hour: '2-digit',
  minute: '2-digit',
  day: '2-digit',
  month: '2-digit',
  hourCycle: 'h23',
})

/** "23:59 17/10" theo giờ Việt Nam. Tự ghép để không phụ thuộc thứ tự định dạng của ICU từng môi trường. */
function formatDue(iso: string): string {
  const p = Object.fromEntries(dueParts.formatToParts(new Date(iso)).map((x) => [x.type, x.value]))
  return `${p.hour}:${p.minute} ${p.day}/${p.month}`
}

/** "Còn 2 ngày 5 giờ" / "Còn 20 giờ" / "Còn 35 phút" — thời gian còn lại thật lúc gửi (deadline tạo muộn thì mốc 3 ngày có thể chỉ còn 2 ngày) */
function remaining(dueIso: string, now = Date.now()): string {
  const min = Math.max(1, Math.round((new Date(dueIso).getTime() - now) / 60_000))
  if (min < 60) return `Còn ${min} phút`
  const h = Math.round(min / 60)
  if (h < 24) return `Còn ${h} giờ`
  const d = Math.floor(h / 24)
  return `Còn ${d} ngày${h % 24 ? ` ${h % 24} giờ` : ''}`
}

/** Tiêu đề theo mốc (khớp frontend/src/lib/reminders.ts để nhắc trong app và Web Push giống nhau) */
function reminderTitle(r: Due): string {
  switch (r.kind) {
    case 'due':
      return `🔔 Đã đến hạn: ${r.title}`
    case '15m':
    case '1h':
      return `⏰ ${remaining(r.due_date)}: ${r.title}`
    case '3h':
    case '24h':
      return `⏳ ${remaining(r.due_date)}: ${r.title}`
    default:
      return `📅 ${remaining(r.due_date)}: ${r.title}`
  }
}

function reminderPayload(r: Due) {
  const course = r.course_code ? `${r.course_code} · ` : ''
  return {
    title: reminderTitle(r),
    body: `${course}Hạn ${formatDue(r.due_date)}`,
    // Bấm thông báo → mở trang Nhiệm vụ, bọc viền đúng deadline được nhắc
    url: `/tasks?task=${r.deadline_id}`,
    // Cùng tag với nhắc nhở trong app → trình duyệt gộp, không hiện trùng
    tag: `deadline-${r.deadline_id}-${r.kind}`,
  }
}

/** Chạy các tác vụ với số luồng giới hạn */
async function pool<T>(items: T[], worker: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += CONCURRENCY) await Promise.allSettled(items.slice(i, i + CONCURRENCY).map(worker))
}

async function sendToSubs(subs: Sub[], data: unknown, keys: VapidKeys, topic: string) {
  let sent = 0
  const gone: string[] = []
  const used: string[] = []
  await pool(subs, async (s) => {
    // Không phải dịch vụ push của trình duyệt → không gửi (chống SSRF), xóa đăng ký đó
    if (!isPushEndpoint(s.endpoint)) {
      gone.push(s.id)
      return
    }
    try {
      const r = await sendWebPush(s, data, keys, { topic, ttlSeconds: 6 * 3600 })
      if (r.ok) {
        sent++
        used.push(s.id)
      } else if (r.gone) gone.push(s.id)
      else console.warn('push lỗi', r.status, new URL(s.endpoint).host)
    } catch (e) {
      console.warn('push lỗi', (e as Error).message)
    }
  })
  return { sent, gone, used }
}

async function cleanup(db: ReturnType<typeof serviceClient>, gone: string[], used: string[]) {
  if (gone.length) await db.from('push_subscriptions').delete().in('id', gone)
  if (used.length) await db.from('push_subscriptions').update({ last_used_at: new Date().toISOString() }).in('id', used)
}

async function runReminders(keys: VapidKeys) {
  const db = serviceClient()
  const { data: due, error } = await db.rpc('due_reminders')
  if (error) throw new Error(`due_reminders: ${error.message}`)
  const reminders = (due ?? []) as Due[]
  if (reminders.length === 0) return { due: 0, sent: 0, logged: 0, removed: 0 }

  const userIds = [...new Set(reminders.map((r) => r.user_id))]
  const { data: subRows, error: subErr } = await db.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth').in('user_id', userIds)
  if (subErr) throw new Error(`push_subscriptions: ${subErr.message}`)
  const subsByUser = new Map<string, Sub[]>()
  for (const s of (subRows ?? []) as Sub[]) subsByUser.set(s.user_id, [...(subsByUser.get(s.user_id) ?? []), s])

  const perUser = new Map<string, number>()
  const logs: { deadline_id: string; user_id: string; kind: string }[] = []
  const gone = new Set<string>()
  const used = new Set<string>()
  let sent = 0

  for (const r of reminders) {
    const count = perUser.get(r.user_id) ?? 0
    if (count >= MAX_PER_USER) continue
    perUser.set(r.user_id, count + 1)
    const subs = (subsByUser.get(r.user_id) ?? []).filter((s) => !gone.has(s.id))
    if (subs.length === 0) continue
    const result = await sendToSubs(subs, reminderPayload(r), keys, `d${r.deadline_id.replace(/-/g, '').slice(0, 20)}${r.kind}`)
    result.gone.forEach((id) => gone.add(id))
    result.used.forEach((id) => used.add(id))
    sent += result.sent
    if (result.sent > 0) logs.push({ deadline_id: r.deadline_id, user_id: r.user_id, kind: r.kind })
  }

  if (logs.length) {
    const { error: logErr } = await db.from('reminder_log').upsert(logs, { onConflict: 'deadline_id,user_id,kind', ignoreDuplicates: true })
    if (logErr) console.error('reminder_log', logErr.message)
  }
  await cleanup(db, [...gone], [...used])
  return { due: reminders.length, sent, logged: logs.length, removed: gone.size }
}

async function sendTest(userId: string, keys: VapidKeys) {
  const db = serviceClient()
  const { data, error } = await db.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth').eq('user_id', userId)
  if (error) throw new Error(error.message)
  const subs = (data ?? []) as Sub[]
  if (subs.length === 0) return { devices: 0, sent: 0, removed: 0 }
  const result = await sendToSubs(
    subs,
    { title: 'UniPlan', body: 'Thông báo thử thành công 🎉 Bạn sẽ được nhắc deadline theo các mốc đã chọn, kể cả khi không mở UniPlan.', url: '/settings', tag: 'uniplan-test' },
    keys,
    'uniplantest',
  )
  await cleanup(db, result.gone, result.used)
  return { devices: subs.length, sent: result.sent, removed: result.gone.length }
}

Deno.serve(async (req) => {
  const early = preflight(req)
  if (early) return early

  const keys = vapidKeys()
  if (!keys) return json(req, { error: 'Máy chủ chưa cấu hình VAPID (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY)' }, 503)

  try {
    const providedSecret = req.headers.get('x-cron-secret')
    if (providedSecret !== null) {
      // Mã trong bảng cron_token (migration 010) hoặc secret CRON_SECRET
      if (!(await isCronCall(providedSecret, serviceClient()))) return json(req, { error: 'Cron secret không đúng' }, 401)
      return json(req, await runReminders(keys))
    }

    const auth = await requireUser(req)
    if (auth instanceof Response) return auth
    const limited = await rateLimit(req, auth.client, 'push_test', 3)
    if (limited) return limited
    const result = await sendTest(auth.userId, keys)
    if (result.devices === 0) return json(req, { error: 'Thiết bị này chưa bật thông báo đẩy' }, 404)
    return json(req, result)
  } catch (e) {
    console.error('send-reminders', (e as Error).message)
    return json(req, { error: 'Gửi thông báo thất bại' }, 500)
  }
})
