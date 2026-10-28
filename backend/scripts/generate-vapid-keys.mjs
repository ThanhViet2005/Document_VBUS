// Tạo cặp khóa VAPID cho Web Push (chỉ cần Node ≥ 20, không cần thư viện).
//   node backend/scripts/generate-vapid-keys.mjs
// - VAPID_PUBLIC_KEY : công khai → frontend (VITE_VAPID_PUBLIC_KEY / UNIPLAN_VAPID_PUBLIC_KEY) và Edge Function
// - VAPID_PRIVATE_KEY: BÍ MẬT → chỉ đặt trong Supabase Edge Function secrets
const b64url = (buf) => Buffer.from(buf).toString('base64url')

const { publicKey, privateKey } = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
const raw = new Uint8Array(await crypto.subtle.exportKey('raw', publicKey))
const jwk = await crypto.subtle.exportKey('jwk', privateKey)

console.log(`VAPID_PUBLIC_KEY=${b64url(raw)}`)
console.log(`VAPID_PRIVATE_KEY=${jwk.d}`)
