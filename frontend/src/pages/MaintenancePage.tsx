import { useState } from 'react'
import { Mail, Phone, RefreshCw, ShieldCheck, Wrench } from 'lucide-react'

const env = import.meta.env as Record<string, string | undefined>
/** Nội dung đặt lúc build bản bảo trì (Vercel → Environment Variables), có sẵn câu mặc định */
const TITLE = env.VITE_MAINTENANCE_TITLE?.trim() || 'Hệ thống đang tạm ngưng'
const MESSAGE = env.VITE_MAINTENANCE_MESSAGE?.trim() || 'Vui lòng liên hệ bộ phận kỹ thuật để gia hạn dịch vụ.'
/** Email và / hoặc số điện thoại, cách nhau bởi dấu phẩy. Bỏ trống thì không hiện mục liên hệ. */
const CONTACTS = (env.VITE_MAINTENANCE_CONTACT ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
  .slice(0, 3)

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Màn hình duy nhất của bản bảo trì: mọi đường dẫn đều hiện trang này */
export default function MaintenancePage() {
  const [checking, setChecking] = useState(false)

  // Hỏi lại máy chủ: nếu đã khôi phục (rollback), SW bản thường kích hoạt → pwa.ts tự tải lại trang vào app
  async function retry() {
    setChecking(true)
    try {
      const reg = await navigator.serviceWorker?.getRegistration()
      await reg?.update()
    } catch {
      // mất mạng → thử tải lại bên dưới
    }
    setTimeout(() => window.location.reload(), 800)
  }

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-page px-4 py-12">
      <div className="bg-trail pointer-events-none absolute inset-0 text-slate-300/50 [mask-image:radial-gradient(closest-side,black,transparent)]" aria-hidden />
      <div className="relative w-full max-w-lg">
        <div className="mb-6 flex items-center justify-center gap-2">
          <img src="/pwa-icon.svg" alt="" className="h-10 w-10 rounded-xl" />
          <span className="text-xl font-extrabold text-slate-900">
            Uni<span className="text-[#f97316]">Plan</span>
          </span>
        </div>

        <section className="rounded-3xl border border-slate-200 bg-surface p-6 text-center shadow-xl shadow-slate-900/5 sm:p-8" aria-labelledby="maintenance-title">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 ring-1 ring-brand-500/25">
            <Wrench className="h-8 w-8" />
          </span>
          <h1 id="maintenance-title" className="mt-5 text-2xl font-extrabold text-slate-900">
            {TITLE}
          </h1>
          <p className="mx-auto mt-3 max-w-sm text-base leading-relaxed text-slate-600">{MESSAGE}</p>

          {CONTACTS.length > 0 && (
            <ul className="mt-6 space-y-2 text-left">
              {CONTACTS.map((c) => {
                const email = EMAIL_RE.test(c)
                const href = email ? `mailto:${c}` : `tel:${c.replace(/[^\d+]/g, '')}`
                const Icon = email ? Mail : Phone
                return (
                  <li key={c}>
                    <a
                      href={href}
                      className="flex min-h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 transition hover:border-[#f97316]/50 hover:bg-surface"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface text-[#ea580c] ring-1 ring-slate-200">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">{email ? 'Email kỹ thuật' : 'Điện thoại'}</span>
                        <span className="text-data block truncate font-semibold text-slate-900">{c}</span>
                      </span>
                    </a>
                  </li>
                )
              })}
            </ul>
          )}

          <button
            type="button"
            onClick={() => void retry()}
            disabled={checking}
            className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-cta px-5 py-2.5 text-sm font-bold text-white transition hover:bg-cta-hover disabled:opacity-70"
          >
            <RefreshCw className={checking ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} /> {checking ? 'Đang kiểm tra…' : 'Thử lại'}
          </button>

          <p className="mt-6 flex items-start justify-center gap-1.5 text-xs text-slate-500">
            <ShieldCheck className="mt-px h-4 w-4 shrink-0 text-emerald-600" />
            Dữ liệu của bạn vẫn được lưu giữ an toàn và sẽ hiển thị lại đầy đủ khi hệ thống hoạt động trở lại.
          </p>
        </section>
      </div>
    </main>
  )
}
