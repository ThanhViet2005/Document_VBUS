// Thông báo nhắc deadline:
//  - Thông báo trong máy (local): khi app đang mở, chỉ cần quyền Notification. Hoạt động cả ở chế độ demo.
//  - Web Push: nhận nhắc nhở cả khi đã đóng app. Cần Service Worker (bản production, HTTPS),
//    VAPID public key và Supabase (lưu đăng ký vào push_subscriptions; Edge Function send-reminders gửi theo cron).
import { FunctionsHttpError } from '@supabase/supabase-js'
import { getVapidPublicKey } from './config'
import { supabase } from './supabase'

export type PushStatus =
  | 'unsupported' //       trình duyệt không có Notification API
  | 'insecure' //          không phải HTTPS / localhost
  | 'ios-needs-install' // iPhone/iPad: phải "Thêm vào Màn hình chính" mới có thông báo
  | 'denied' //            người dùng đã chặn
  | 'default' //           chưa hỏi quyền
  | 'local-only' //        đã cho phép, nhưng chưa có Web Push (dev, chưa cấu hình máy chủ, demo)
  | 'push-off' //          có thể bật Web Push nhưng thiết bị chưa đăng ký
  | 'push-on' //           đã đăng ký Web Push

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true

/** Máy chủ có hỗ trợ Web Push không (Supabase + VAPID + trình duyệt có PushManager) */
export function serverPushAvailable(): boolean {
  return Boolean(supabase && getVapidPublicKey() && 'serviceWorker' in navigator && 'PushManager' in window)
}

async function swRegistration(timeoutMs = 4000): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  const existing = await navigator.serviceWorker.getRegistration()
  if (!existing) return null // dev: SW không được đăng ký
  return Promise.race([navigator.serviceWorker.ready, new Promise<null>((r) => setTimeout(() => r(null), timeoutMs))])
}

export async function getPushStatus(): Promise<PushStatus> {
  if (!('Notification' in window)) return isIOS() && !isStandalone() ? 'ios-needs-install' : 'unsupported'
  if (!window.isSecureContext) return 'insecure'
  if (Notification.permission === 'denied') return 'denied'
  if (Notification.permission === 'default') return 'default'
  if (!serverPushAvailable()) return 'local-only'
  const reg = await swRegistration()
  if (!reg) return 'local-only'
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return 'push-off'
  // Máy chủ đã đổi khóa VAPID → đăng ký cũ không nhận được push nữa, cần đăng ký lại
  if (!sameKey(sub.options.applicationServerKey, urlBase64ToUint8Array(getVapidPublicKey()))) return 'push-off'
  // Đăng ký trên trình duyệt phải thuộc tài khoản đang đăng nhập (RLS chỉ trả về của chính mình).
  // Máy dùng chung: đăng ký của người trước → coi như chưa bật cho tài khoản này.
  const { data, error } = await supabase!.from('push_subscriptions').select('id').eq('endpoint', sub.endpoint).limit(1)
  if (error) return 'push-on' // không kiểm tra được (mất mạng) → giữ nguyên
  return data.length > 0 ? 'push-on' : 'push-off'
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a) return false
  const x = new Uint8Array(a)
  return x.length === b.length && x.every((v, i) => v === b[i])
}

export interface EnableResult {
  /** true: đã đăng ký Web Push; false: chỉ nhắc khi đang mở app */
  push: boolean
  note?: string
}

/** Phải gọi từ thao tác của người dùng (click) vì trình duyệt yêu cầu khi xin quyền. */
export async function enableNotifications(): Promise<EnableResult> {
  if (!('Notification' in window)) {
    throw new Error(isIOS() && !isStandalone() ? 'Trên iPhone/iPad, hãy "Thêm vào Màn hình chính" rồi mở UniPlan từ đó để bật thông báo.' : 'Trình duyệt không hỗ trợ thông báo.')
  }
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Bạn chưa cho phép thông báo. Hãy bật lại trong cài đặt trang web của trình duyệt.')

  if (!serverPushAvailable()) {
    return { push: false, note: 'Máy chủ chưa cấu hình Web Push: bạn sẽ được nhắc khi đang mở UniPlan.' }
  }
  const reg = await swRegistration()
  if (!reg) return { push: false, note: 'Service Worker chưa sẵn sàng (chỉ có ở bản production HTTPS): bạn sẽ được nhắc khi đang mở UniPlan.' }

  const appKey = urlBase64ToUint8Array(getVapidPublicKey())
  let sub = await reg.pushManager.getSubscription()
  // Máy chủ đổi khóa VAPID → đăng ký cũ không dùng được nữa
  if (sub && !sameKey(sub.options.applicationServerKey, appKey)) {
    await sub.unsubscribe()
    sub = null
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appKey })

  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) throw new Error('Trình duyệt trả về đăng ký push không hợp lệ')
  const { error } = await supabase!.rpc('register_push_subscription', {
    p_endpoint: json.endpoint,
    p_p256dh: json.keys.p256dh,
    p_auth: json.keys.auth,
    p_user_agent: navigator.userAgent.slice(0, 300),
  })
  if (error) throw new Error(`Không lưu được đăng ký thông báo: ${error.message}`)
  return { push: true }
}

/** Tắt Web Push trên thiết bị này (vẫn giữ quyền thông báo cho nhắc nhở khi đang mở app) */
export async function disablePush(): Promise<void> {
  const reg = await swRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return
  const endpoint = sub.endpoint
  await sub.unsubscribe()
  if (supabase) {
    const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
    if (error) throw new Error(error.message)
  }
}

/** Nhờ máy chủ gửi 1 thông báo thử tới các thiết bị của mình (Edge Function send-reminders) */
export async function sendTestPush(): Promise<{ devices: number; sent: number }> {
  if (!supabase) throw new Error('Chưa kết nối máy chủ')
  const { data, error } = await supabase.functions.invoke<{ devices: number; sent: number }>('send-reminders', { body: {} })
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const body = (await error.context.json().catch(() => null)) as { error?: string } | null
      throw new Error(body?.error ?? 'Máy chủ gửi thông báo thất bại')
    }
    throw new Error('Không gọi được máy chủ thông báo')
  }
  return data ?? { devices: 0, sent: 0 }
}

/**
 * Hiện thông báo hệ điều hành ngay trên máy. Dùng chung tag với Web Push từ máy chủ
 * nên cùng một nhắc nhở không bị hiện 2 lần.
 */
export async function showLocalNotification(n: { title: string; body: string; tag: string; url: string }): Promise<boolean> {
  if (!('Notification' in window) || Notification.permission !== 'granted') return false
  const options = { body: n.body, tag: n.tag, icon: '/pwa-icon.svg', badge: '/favicon.svg', data: { url: n.url } }
  try {
    const reg = await swRegistration(1500)
    if (reg) {
      await reg.showNotification(n.title, options)
      return true
    }
    const notification = new Notification(n.title, options)
    notification.onclick = () => {
      window.focus()
      window.location.assign(n.url)
    }
    return true
  } catch {
    return false
  }
}
