// POST /functions/v1/send-email-digest – Email tổng hợp nhiệm vụ mỗi sáng, gửi qua Brevo (gói miễn phí 300 email / ngày).
// Ba chế độ:
//   1. Cron (header x-cron-secret = CRON_SECRET, 7:00 sáng giờ VN): gửi cho mọi người đã bật trong Cài đặt
//      các việc quá hạn + đến hạn hôm nay (migration 010). Ghi email_log khi Brevo nhận → mỗi người 1 email / ngày.
//   2. Hủy nhận (không cần đăng nhập):
//      - ?unsubscribe=<mã> + body "List-Unsubscribe=One-Click": nút "Hủy đăng ký" của Gmail / Outlook (RFC 8058);
//      - body JSON { "unsubscribe": "<mã>" }: trang /unsubscribe của app.
//   3. Gửi thử (Authorization: Bearer <JWT người dùng>): gửi ngay email tổng hợp tới email của chính người đó. 2 lần / 5 phút.
// Secrets: BREVO_API_KEY, EMAIL_FROM (email gửi đã xác minh trên Brevo), EMAIL_FROM_NAME (tùy chọn), APP_URL, CRON_SECRET.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { json, preflight, rateLimit, requireUser } from '../_shared/http.ts'
import { isCronCall } from '../_shared/cron.ts'

interface Item {
  id: string
  title: string
  course_code: string | null
  due_date: string
  bucket: 'overdue' | 'today' | 'tomorrow'
}
interface Digest {
  user_id: string
  email: string
  full_name: string | null
  unsubscribe_token: string
  overdue_count: number
  today_count: number
  tomorrow_count: number
  items: Item[]
}
interface Config {
  apiKey: string
  from: string
  fromName: string
  appUrl: string
  functionUrl: string
}

const CONCURRENCY = 5
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function config(): Config | null {
  const apiKey = Deno.env.get('BREVO_API_KEY')
  const from = Deno.env.get('EMAIL_FROM')
  const appUrl = (Deno.env.get('APP_URL') || '').replace(/\/+$/, '')
  if (!apiKey || !from || !appUrl) return null
  return {
    apiKey,
    from,
    fromName: Deno.env.get('EMAIL_FROM_NAME') || 'UniPlan',
    appUrl,
    functionUrl: `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email-digest`,
  }
}

function serviceClient() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

const vnParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Ho_Chi_Minh',
  hour: '2-digit',
  minute: '2-digit',
  day: '2-digit',
  month: '2-digit',
  hourCycle: 'h23',
})
/** "23:59 17/10" theo giờ Việt Nam */
function formatDue(iso: string): string {
  const p = Object.fromEntries(vnParts.formatToParts(new Date(iso)).map((x) => [x.type, x.value]))
  return `${p.hour}:${p.minute} ${p.day}/${p.month}`
}

const SECTIONS: { bucket: Item['bucket']; title: string; color: string }[] = [
  { bucket: 'overdue', title: 'Quá hạn', color: '#dc2626' },
  { bucket: 'today', title: 'Đến hạn hôm nay', color: '#ea580c' },
  { bucket: 'tomorrow', title: 'Ngày mai', color: '#2563eb' },
]

function subjectOf(d: Digest): string {
  const parts = [
    d.overdue_count && `${d.overdue_count} việc quá hạn`,
    d.today_count && `${d.today_count} việc hạn hôm nay`,
    d.tomorrow_count && `${d.tomorrow_count} việc hạn ngày mai`,
  ].filter(Boolean)
  return parts.length ? `UniPlan: ${parts.join(', ')}` : 'UniPlan: không có việc gấp hôm nay 🎉'
}

/** Email HTML đơn giản (bảng + style inline để hiển thị đúng trên Gmail / Outlook) kèm bản chữ thuần */
function render(d: Digest, cfg: Config, test: boolean) {
  const name = d.full_name || d.email.split('@')[0]
  const unsubscribeUrl = `${cfg.appUrl}/unsubscribe?t=${d.unsubscribe_token}`
  const total = d.overdue_count + d.today_count + d.tomorrow_count
  const hidden = total - d.items.length

  const sectionsHtml = SECTIONS.map((s) => {
    const items = d.items.filter((i) => i.bucket === s.bucket)
    if (!items.length) return ''
    const rows = items
      .map(
        (i) => `<tr><td style="padding:10px 12px;border-top:1px solid #e2e8f0">
  <a href="${cfg.appUrl}/tasks?task=${i.id}" style="color:#0f172a;font-weight:600;text-decoration:none">${esc(i.title)}</a>
  <div style="color:#475569;font-size:13px;margin-top:2px">${i.course_code ? `${esc(i.course_code)} · ` : ''}Hạn ${formatDue(i.due_date)}</div>
</td></tr>`,
      )
      .join('')
    return `<h3 style="margin:20px 0 6px;font-size:14px;color:${s.color};text-transform:uppercase;letter-spacing:.04em">${s.title}</h3>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e2e8f0;border-radius:12px;border-collapse:separate">${rows}</table>`
  }).join('')

  const html = `<!doctype html><html lang="vi"><body style="margin:0;background:#eef2f7;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden">
<tr><td style="background:#f97316;padding:18px 24px;color:#ffffff;font-size:20px;font-weight:800">UniPlan</td></tr>
<tr><td style="padding:24px">
${test ? '<p style="margin:0 0 12px;padding:8px 12px;background:#fff7ed;border-radius:8px;color:#9a3412;font-size:13px">Đây là email thử. Email thật được gửi lúc 7:00 sáng khi bạn có việc hạn hôm nay hoặc việc quá hạn.</p>' : ''}
<p style="margin:0;font-size:16px">Chào ${esc(name)},</p>
<p style="margin:8px 0 0;color:#334155">${total ? `Bạn có <b>${total}</b> việc cần chú ý:` : 'Hôm nay bạn không có việc nào đến hạn hay quá hạn. Tuyệt vời! 🎉'}</p>
${sectionsHtml}
${hidden > 0 ? `<p style="margin:12px 0 0;color:#475569;font-size:13px">… và ${hidden} việc khác.</p>` : ''}
<p style="margin:24px 0 0"><a href="${cfg.appUrl}/tasks" style="display:inline-block;background:#f97316;color:#ffffff;font-weight:700;text-decoration:none;padding:12px 20px;border-radius:12px">Mở UniPlan</a></p>
</td></tr>
<tr><td style="padding:16px 24px;background:#f8fafc;color:#64748b;font-size:12px">
Bạn nhận email này vì đã bật "Email tổng hợp mỗi sáng" trong Cài đặt UniPlan.
<a href="${unsubscribeUrl}" style="color:#64748b">Hủy nhận email</a>
</td></tr></table></td></tr></table></body></html>`

  const text = [
    test ? '[Email thử]' : '',
    `Chào ${name},`,
    total ? `Bạn có ${total} việc cần chú ý:` : 'Hôm nay bạn không có việc nào đến hạn hay quá hạn.',
    ...SECTIONS.flatMap((s) => {
      const items = d.items.filter((i) => i.bucket === s.bucket)
      return items.length ? ['', s.title.toUpperCase(), ...items.map((i) => `- ${i.title}${i.course_code ? ` (${i.course_code})` : ''} – hạn ${formatDue(i.due_date)}`)] : []
    }),
    hidden > 0 ? `… và ${hidden} việc khác.` : '',
    '',
    `Mở UniPlan: ${cfg.appUrl}/tasks`,
    `Hủy nhận email: ${unsubscribeUrl}`,
  ]
    // Bỏ dòng trống ở đầu và dòng trống liên tiếp
    .filter((l, i, a) => l !== '' || (i > 0 && a[i - 1] !== ''))
    .join('\n')

  return { subject: subjectOf(d), html, text, oneClick: `${cfg.functionUrl}?unsubscribe=${d.unsubscribe_token}` }
}

async function sendBrevo(d: Digest, cfg: Config, test = false): Promise<boolean> {
  const m = render(d, cfg, test)
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': cfg.apiKey, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { email: cfg.from, name: cfg.fromName },
      to: [{ email: d.email, name: d.full_name || undefined }],
      subject: m.subject,
      htmlContent: m.html,
      textContent: m.text,
      // Nút "Hủy đăng ký" một chạm của Gmail / Outlook
      headers: { 'List-Unsubscribe': `<${m.oneClick}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
      tags: [test ? 'digest-test' : 'digest'],
    }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) console.warn('brevo lỗi', res.status, (await res.text()).slice(0, 300))
  return res.ok
}

async function runDigest(cfg: Config) {
  const db = serviceClient()
  const { data, error } = await db.rpc('due_email_digest')
  if (error) throw new Error(`due_email_digest: ${error.message}`)
  const list = (data ?? []) as Digest[]
  // Ngày theo giờ VN, khớp digest_date trong due_email_digest()
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date())
  const sent: string[] = []
  for (let i = 0; i < list.length; i += CONCURRENCY) {
    await Promise.allSettled(
      list.slice(i, i + CONCURRENCY).map(async (d) => {
        if (await sendBrevo(d, cfg)) sent.push(d.user_id)
      }),
    )
  }
  if (sent.length) {
    const { error: logErr } = await db.from('email_log').upsert(
      sent.map((user_id) => ({ user_id, digest_date: today })),
      { onConflict: 'user_id,digest_date', ignoreDuplicates: true },
    )
    if (logErr) console.error('email_log', logErr.message)
  }
  return { due: list.length, sent: sent.length }
}

async function unsubscribe(token: string): Promise<boolean> {
  if (!UUID_RE.test(token)) return false
  const { data, error } = await serviceClient().rpc('unsubscribe_email_digest', { p_token: token })
  if (error) throw new Error(error.message)
  return data === true
}

Deno.serve(async (req) => {
  const early = preflight(req)
  if (early) return early

  try {
    // Hủy nhận một chạm từ Gmail / Outlook (RFC 8058): không có JWT, mã nằm trên URL
    const oneClick = new URL(req.url).searchParams.get('unsubscribe')
    if (oneClick !== null) return json(req, { ok: await unsubscribe(oneClick) })

    const providedSecret = req.headers.get('x-cron-secret')
    if (providedSecret !== null) {
      // Mã trong bảng cron_token (migration 010) hoặc secret CRON_SECRET
      if (!(await isCronCall(providedSecret, serviceClient()))) return json(req, { error: 'Cron secret không đúng' }, 401)
      const cfg = config()
      if (!cfg) return json(req, { error: 'Máy chủ chưa cấu hình email (BREVO_API_KEY / EMAIL_FROM / APP_URL)' }, 503)
      return json(req, await runDigest(cfg))
    }

    const body = (await req.json().catch(() => ({}))) as { unsubscribe?: unknown }
    // Trang /unsubscribe của app (không cần đăng nhập)
    if (typeof body.unsubscribe === 'string') return json(req, { ok: await unsubscribe(body.unsubscribe) })

    // Gửi thử tới email của chính người dùng
    const auth = await requireUser(req)
    if (auth instanceof Response) return auth
    const cfg = config()
    if (!cfg) return json(req, { error: 'Máy chủ chưa cấu hình gửi email' }, 503)
    const limited = await rateLimit(req, auth.client, 'email_test', 2, 300)
    if (limited) return limited
    const { data, error } = await serviceClient().rpc('due_email_digest', { p_only_user: auth.userId })
    if (error) throw new Error(error.message)
    const digest = ((data ?? []) as Digest[])[0]
    if (!digest) return json(req, { error: 'Không tìm thấy tài khoản' }, 404)
    if (!(await sendBrevo(digest, cfg, true))) return json(req, { error: 'Dịch vụ email từ chối gửi. Hãy thử lại sau.' }, 502)
    return json(req, { sent: true, email: digest.email })
  } catch (e) {
    console.error('send-email-digest', (e as Error).message)
    return json(req, { error: 'Gửi email thất bại' }, 500)
  }
})
