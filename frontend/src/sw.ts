/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { CacheFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'

declare let self: ServiceWorkerGlobalScope

self.skipWaiting()
self.addEventListener('activate', () => self.clients.claim())

// Precache toàn bộ asset build ra
cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

// SPA: mọi điều hướng trả về index.html (hoạt động offline)
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')))

// Cache Google Fonts
registerRoute(
  ({ url }) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
  new CacheFirst({
    cacheName: 'google-fonts',
    plugins: [new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 })],
  }),
)

// ===== Web Push: nhắc deadline =====
// Payload do Supabase Edge Function gửi: { title, body, url?, tag? }
interface PushPayload {
  title: string
  body: string
  url?: string
  tag?: string
}

self.addEventListener('push', (event) => {
  let data: PushPayload = { title: 'UniPlan', body: 'Bạn có nhiệm vụ sắp đến hạn.' }
  try {
    if (event.data) data = { ...data, ...(event.data.json() as Partial<PushPayload>) }
  } catch {
    if (event.data) data.body = event.data.text()
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/pwa-icon.svg',
      badge: '/favicon.svg',
      tag: data.tag,
      data: { url: data.url ?? '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  // Chỉ mở đường dẫn nội bộ của app (không để nội dung thông báo dẫn ra trang ngoài)
  const raw = (event.notification.data?.url as string | undefined) ?? '/'
  const url = new URL(raw, self.location.origin)
  const target = url.origin === self.location.origin ? url.href : self.location.origin + '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
      // Đã mở UniPlan ở tab nào đó → đưa tab đó lên và chuyển tới trang cần xem
      const existing = clients.find((c) => c.url === target) ?? clients.find((c) => new URL(c.url).origin === self.location.origin)
      if (existing) {
        const focused = await existing.focus()
        return focused.url === target ? focused : focused.navigate(target)
      }
      return self.clients.openWindow(target)
    }),
  )
})
