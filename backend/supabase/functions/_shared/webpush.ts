// Web Push thuần WebCrypto (chạy được trên Deno/Edge Functions và Node ≥ 20, không cần thư viện):
//   * RFC 8291: mã hóa nội dung "aes128gcm" cho Web Push
//   * RFC 8292: xác thực máy chủ bằng VAPID (JWT ES256)
// Tạo cặp khóa VAPID: node backend/scripts/generate-vapid-keys.mjs

export interface PushSubscriptionKeys {
  endpoint: string
  /** Khóa công khai P-256 của trình duyệt (base64url, 65 byte không nén) */
  p256dh: string
  /** Bí mật xác thực 16 byte (base64url) */
  auth: string
}

export interface VapidKeys {
  /** base64url, 65 byte không nén (cũng là applicationServerKey phía trình duyệt) */
  publicKey: string
  /** base64url, 32 byte (thành phần d) */
  privateKey: string
  /** mailto:... hoặc https://... để dịch vụ push liên hệ khi có sự cố */
  subject: string
}

export interface SendResult {
  ok: boolean
  status: number
  /** 404/410: đăng ký đã hết hạn / bị thu hồi → nên xóa khỏi database */
  gone: boolean
}

const enc = new TextEncoder()

export function b64urlEncode(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function b64urlDecode(str: string): Uint8Array<ArrayBuffer> {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '')
  const raw = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(parts.reduce((n, p) => n + p.length, 0)))
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

/** HKDF-SHA256 (extract + expand) */
export async function hkdf(salt: Uint8Array<ArrayBuffer>, ikm: Uint8Array<ArrayBuffer>, info: Uint8Array<ArrayBuffer>, length: number): Promise<Uint8Array<ArrayBuffer>> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8))
}

/** Khóa ECDH P-256 từ khóa công khai dạng 65 byte không nén */
export function importP256Public(raw: Uint8Array<ArrayBuffer>, usage: 'ECDH' | 'ECDSA'): Promise<CryptoKey> {
  const alg = usage === 'ECDH' ? { name: 'ECDH', namedCurve: 'P-256' } : { name: 'ECDSA', namedCurve: 'P-256' }
  return crypto.subtle.importKey('raw', raw, alg, true, usage === 'ECDH' ? [] : ['verify'])
}

/** Thông số dẫn xuất khóa theo RFC 8291 §3.3–3.4 (dùng chung cho mã hóa & giải mã khi kiểm thử) */
export async function deriveContentKeys(opts: {
  ecdhSecret: Uint8Array<ArrayBuffer>
  authSecret: Uint8Array<ArrayBuffer>
  uaPublic: Uint8Array<ArrayBuffer>
  asPublic: Uint8Array<ArrayBuffer>
  salt: Uint8Array<ArrayBuffer>
}): Promise<{ cek: Uint8Array<ArrayBuffer>; nonce: Uint8Array<ArrayBuffer> }> {
  const keyInfo = concat(enc.encode('WebPush: info\0'), opts.uaPublic, opts.asPublic)
  const ikm = await hkdf(opts.authSecret, opts.ecdhSecret, keyInfo, 32)
  const cek = await hkdf(opts.salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(opts.salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12)
  return { cek, nonce }
}

const RECORD_SIZE = 4096

/** Mã hóa nội dung push (một record, aes128gcm). Trả về body gửi tới endpoint. */
export async function encryptPayload(sub: PushSubscriptionKeys, payload: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const uaPublic = b64urlDecode(sub.p256dh)
  const authSecret = b64urlDecode(sub.auth)
  if (uaPublic.length !== 65 || uaPublic[0] !== 4) throw new Error('p256dh không hợp lệ')
  if (authSecret.length !== 16) throw new Error('auth không hợp lệ')
  // record = nội dung + 1 byte phân cách + 16 byte tag ≤ 4096
  if (payload.length > RECORD_SIZE - 17 - 86) throw new Error('Nội dung push quá dài')

  const asKeys = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', asKeys.publicKey))
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: await importP256Public(uaPublic, 'ECDH') } as EcdhKeyDeriveParams, asKeys.privateKey, 256),
  )
  const salt = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16)))
  const { cek, nonce } = await deriveContentKeys({ ecdhSecret, authSecret, uaPublic, asPublic, salt })

  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  // 0x02: phân cách của record cuối cùng
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, concat(payload, new Uint8Array([2]))))

  const header = new Uint8Array(new ArrayBuffer(16 + 4 + 1))
  header.set(salt, 0)
  new DataView(header.buffer).setUint32(16, RECORD_SIZE)
  header[20] = asPublic.length
  return concat(header, asPublic, cipher)
}

/** JWT VAPID (ES256) cho origin của endpoint */
export async function vapidAuthorization(endpoint: string, vapid: VapidKeys, nowSeconds = Math.floor(Date.now() / 1000)): Promise<string> {
  const pub = b64urlDecode(vapid.publicKey)
  if (pub.length !== 65 || pub[0] !== 4) throw new Error('VAPID public key không hợp lệ')
  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', d: vapid.privateKey, x: b64urlEncode(pub.slice(1, 33)), y: b64urlEncode(pub.slice(33, 65)), ext: true },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )
  const header = b64urlEncode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = b64urlEncode(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: nowSeconds + 12 * 3600, sub: vapid.subject })))
  const signingInput = `${header}.${claims}`
  // WebCrypto trả chữ ký dạng r||s (64 byte) = đúng định dạng JWS ES256
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(signingInput)))
  return `vapid t=${signingInput}.${b64urlEncode(sig)}, k=${vapid.publicKey}`
}

/**
 * Endpoint là dịch vụ push của trình duyệt (Chrome / Edge / Firefox / Safari)? Khớp public.is_push_endpoint() trong database.
 * Lớp bảo vệ thứ hai chống SSRF: dù database bị ghi sai, máy chủ cũng không gửi request tới địa chỉ tùy ý.
 */
const PUSH_HOST = /^(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)$/
export function isPushEndpoint(endpoint: string): boolean {
  try {
    const u = new URL(endpoint)
    return u.protocol === 'https:' && u.port === '' && !u.username && !u.password && PUSH_HOST.test(u.hostname) && endpoint.length <= 2000
  } catch {
    return false
  }
}

/** Gửi một thông báo push. Không ném lỗi với phản hồi HTTP lỗi, chỉ ném khi mất mạng / dữ liệu sai. */
export async function sendWebPush(
  sub: PushSubscriptionKeys,
  data: unknown,
  vapid: VapidKeys,
  opts: { ttlSeconds?: number; urgency?: 'very-low' | 'low' | 'normal' | 'high'; topic?: string; fetchImpl?: typeof fetch } = {},
): Promise<SendResult> {
  const body = await encryptPayload(sub, enc.encode(JSON.stringify(data)))
  const headers: Record<string, string> = {
    Authorization: await vapidAuthorization(sub.endpoint, vapid),
    'Content-Encoding': 'aes128gcm',
    'Content-Type': 'application/octet-stream',
    TTL: String(opts.ttlSeconds ?? 24 * 3600),
    Urgency: opts.urgency ?? 'high',
  }
  // Topic: thông báo mới cùng topic thay thế thông báo chưa giao (≤ 32 ký tự base64url)
  if (opts.topic) headers.Topic = opts.topic.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32)
  const res = await (opts.fetchImpl ?? fetch)(sub.endpoint, { method: 'POST', headers, body })
  await res.body?.cancel()
  return { ok: res.ok, status: res.status, gone: res.status === 404 || res.status === 410 }
}
