// Kiểm thử module Web Push (RFC 8291 aes128gcm + RFC 8292 VAPID) chạy bằng Node (tự bỏ kiểu TS).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import {
  b64urlDecode,
  b64urlEncode,
  concat,
  deriveContentKeys,
  encryptPayload,
  importP256Public,
  isPushEndpoint,
  sendWebPush,
  vapidAuthorization,
} from '../supabase/functions/_shared/webpush.ts'

const dec = new TextDecoder()

/** Phía trình duyệt: giải mã body aes128gcm bằng khóa riêng của subscription */
async function decryptAsBrowser(body, uaKeys, uaPublic, authSecret) {
  const salt = body.slice(0, 16)
  const rs = new DataView(body.buffer, body.byteOffset).getUint32(16)
  const idlen = body[20]
  const asPublic = body.slice(21, 21 + idlen)
  const cipher = body.slice(21 + idlen)
  assert.equal(rs, 4096)
  assert.equal(idlen, 65)
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: await importP256Public(asPublic, 'ECDH') }, uaKeys.privateKey, 256),
  )
  const { cek, nonce } = await deriveContentKeys({ ecdhSecret, authSecret, uaPublic, asPublic, salt })
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt'])
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, cipher))
  assert.equal(plain[plain.length - 1], 2, 'phân cách record cuối = 0x02')
  return dec.decode(plain.slice(0, -1))
}

test('isPushEndpoint: chỉ nhận dịch vụ push của trình duyệt (chống SSRF)', () => {
  for (const ok of ['https://fcm.googleapis.com/fcm/send/a', 'https://updates.push.services.mozilla.com/wpush/v2/a', 'https://web.push.apple.com/a', 'https://wns2-par02p.notify.windows.com/w/?token=a']) {
    assert.ok(isPushEndpoint(ok), ok)
  }
  for (const bad of ['http://fcm.googleapis.com/a', 'https://fcm.googleapis.com.evil.com/a', 'https://evil.com/fcm.googleapis.com', 'https://127.0.0.1/a', 'https://fcm.googleapis.com:8443/a', 'https://u:p@fcm.googleapis.com/a', 'không phải url']) {
    assert.ok(!isPushEndpoint(bad), bad)
  }
})

async function newSubscriber(endpoint = 'https://fcm.googleapis.com/fcm/send/xyz') {
  const uaKeys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const uaPublic = new Uint8Array(await crypto.subtle.exportKey('raw', uaKeys.publicKey))
  const authSecret = crypto.getRandomValues(new Uint8Array(16))
  return { uaKeys, uaPublic, authSecret, sub: { endpoint, p256dh: b64urlEncode(uaPublic), auth: b64urlEncode(authSecret) } }
}

async function newVapid() {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey))
  const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey)
  return { publicKey: b64urlEncode(pub), privateKey: jwk.d, subject: 'mailto:admin@uniplan.app' }
}

test('Khớp bộ dữ liệu mẫu RFC 8291 §5 (dẫn xuất khóa + giải mã)', async () => {
  const v = {
    plaintext: 'When I grow up, I want to be a watermelon',
    asPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
    uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
    uaPrivate: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
    authSecret: 'BTBZMqHH6r4Tts7J_aSIgg',
    salt: 'DGv6ra1nlYgDCS1FRnbzlw',
    ecdhSecret: 'kyrL1jIIOHEzg3sM2ZWRHDRB62YACZhhSlknJ672kSs',
    cek: 'oIhVW04MRdy2XN9CiKLxTg',
    nonce: '4h_95klXJ5E_qnoN',
    body: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
  }
  const uaPublic = b64urlDecode(v.uaPublic)
  // ECDH của trình duyệt (ua_private × as_public) phải ra đúng ecdh_secret của RFC
  const uaPrivate = await crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', d: v.uaPrivate, x: b64urlEncode(uaPublic.slice(1, 33)), y: b64urlEncode(uaPublic.slice(33)), ext: true },
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveBits'],
  )
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: await importP256Public(b64urlDecode(v.asPublic), 'ECDH') }, uaPrivate, 256))
  assert.equal(b64urlEncode(ecdh), v.ecdhSecret)

  const { cek, nonce } = await deriveContentKeys({
    ecdhSecret: b64urlDecode(v.ecdhSecret),
    authSecret: b64urlDecode(v.authSecret),
    uaPublic,
    asPublic: b64urlDecode(v.asPublic),
    salt: b64urlDecode(v.salt),
  })
  assert.equal(b64urlEncode(cek), v.cek)
  assert.equal(b64urlEncode(nonce), v.nonce)

  const body = b64urlDecode(v.body)
  const text = await decryptAsBrowser(body, { privateKey: uaPrivate }, uaPublic, b64urlDecode(v.authSecret))
  assert.equal(text, v.plaintext)
})

test('Mã hóa → trình duyệt giải mã được; mỗi lần mã hóa dùng khóa tạm & salt mới', async () => {
  const s = await newSubscriber()
  const payload = JSON.stringify({ title: 'Sắp đến hạn: Lab 5 ⏰', body: 'PRO192 · còn 1 giờ', url: '/tasks' })
  const b1 = await encryptPayload(s.sub, new TextEncoder().encode(payload))
  const b2 = await encryptPayload(s.sub, new TextEncoder().encode(payload))
  assert.equal(await decryptAsBrowser(b1, s.uaKeys, s.uaPublic, s.authSecret), payload)
  assert.notEqual(b64urlEncode(b1.slice(0, 16)), b64urlEncode(b2.slice(0, 16)), 'salt ngẫu nhiên')
  assert.notEqual(b64urlEncode(b1.slice(21, 86)), b64urlEncode(b2.slice(21, 86)), 'khóa tạm ngẫu nhiên')
  // Sai auth secret → không giải mã được
  await assert.rejects(decryptAsBrowser(b1, s.uaKeys, s.uaPublic, crypto.getRandomValues(new Uint8Array(16))))
  // Dữ liệu subscription hỏng / nội dung quá dài
  await assert.rejects(encryptPayload({ ...s.sub, p256dh: 'abc' }, new Uint8Array(1)), /p256dh/)
  await assert.rejects(encryptPayload({ ...s.sub, auth: 'abc' }, new Uint8Array(1)), /auth/)
  await assert.rejects(encryptPayload(s.sub, new Uint8Array(5000)), /quá dài/)
})

test('VAPID: JWT ES256 hợp lệ, đúng aud/exp/sub, kiểm chứng được bằng khóa công khai', async () => {
  const vapid = await newVapid()
  const now = 1_800_000_000
  const header = await vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc?x=1', vapid, now)
  const m = header.match(/^vapid t=([^,]+), k=(.+)$/)
  assert.ok(m, header)
  assert.equal(m[2], vapid.publicKey)
  const [h, c, sig] = m[1].split('.')
  assert.deepEqual(JSON.parse(new TextDecoder().decode(b64urlDecode(h))), { typ: 'JWT', alg: 'ES256' })
  assert.deepEqual(JSON.parse(new TextDecoder().decode(b64urlDecode(c))), { aud: 'https://fcm.googleapis.com', exp: now + 12 * 3600, sub: 'mailto:admin@uniplan.app' })
  const key = await importP256Public(b64urlDecode(vapid.publicKey), 'ECDSA')
  const valid = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, b64urlDecode(sig), new TextEncoder().encode(`${h}.${c}`))
  assert.equal(valid, true)
  // JWT do cặp khóa khác ký → khóa công khai của mình không xác minh được
  const other = await newVapid()
  const bad = (await vapidAuthorization('https://x.example/1', other, now)).match(/t=([^,]+)/)[1].split('.')
  assert.equal(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, b64urlDecode(bad[2]), new TextEncoder().encode(`${bad[0]}.${bad[1]}`)), false)
})

test('Gửi tới "dịch vụ push" giả: header đúng chuẩn, nội dung giải mã đúng; 410 → gone', async () => {
  const vapid = await newVapid()
  let status = 201
  let received
  const server = createServer((req, res) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      received = { headers: req.headers, body: new Uint8Array(Buffer.concat(chunks)) }
      res.writeHead(status).end()
    })
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const endpoint = `http://127.0.0.1:${server.address().port}/push/abc`
  try {
    const s = await newSubscriber(endpoint)
    const data = { title: 'Nhắc deadline', body: 'Lab 5 còn 1 giờ', url: '/tasks', tag: 'deadline-1-1h' }
    const r = await sendWebPush(s.sub, data, vapid, { topic: 'deadline-1-1h!!', ttlSeconds: 3600 })
    assert.deepEqual(r, { ok: true, status: 201, gone: false })
    assert.equal(received.headers['content-encoding'], 'aes128gcm')
    assert.equal(received.headers['content-type'], 'application/octet-stream')
    assert.equal(received.headers.ttl, '3600')
    assert.equal(received.headers.urgency, 'high')
    assert.equal(received.headers.topic, 'deadline-1-1h')
    assert.match(received.headers.authorization, /^vapid t=.+\..+\..+, k=/)
    assert.deepEqual(JSON.parse(await decryptAsBrowser(received.body, s.uaKeys, s.uaPublic, s.authSecret)), data)

    status = 410
    assert.deepEqual(await sendWebPush(s.sub, data, vapid), { ok: false, status: 410, gone: true })
    status = 429
    assert.deepEqual(await sendWebPush(s.sub, data, vapid), { ok: false, status: 429, gone: false })
  } finally {
    server.close()
  }
})

test('Tiện ích base64url / concat', () => {
  const bytes = new Uint8Array([0, 251, 255, 62, 63, 1])
  assert.equal(b64urlEncode(bytes), 'APv_Pj8B')
  assert.deepEqual([...b64urlDecode('APv_Pj8B')], [...bytes])
  assert.deepEqual([...concat(new Uint8Array([1]), new Uint8Array([2, 3]))], [1, 2, 3])
})
