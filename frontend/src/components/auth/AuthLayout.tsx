import type { ReactNode } from 'react'
import { CalendarCheck, Users, Zap, type LucideIcon } from 'lucide-react'
import ThemeToggle from '../ui/ThemeToggle'
import AuthHero from './AuthHero'
import SkyBackdrop from '../ui/SkyBackdrop'

interface AuthLayoutProps {
  title: string
  /** Chỉ dùng cho màn hình phụ (vd: kiểm tra hộp thư). Đăng nhập / Đăng ký không có mô tả. */
  subtitle?: ReactNode
  children: ReactNode
  /** Dòng chuyển trang ở cuối form, vd: "Chưa có tài khoản? Đăng ký" */
  footer?: ReactNode
}

/** Khung chung cho Đăng nhập / Đăng ký: panel giới thiệu cam bên trái (desktop), form bên phải */
export default function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
  return (
    <div className="grid min-h-full lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-[#fb923c] via-[#f97316] to-[#c2410c] p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-12">
        {/* Nền: đốm sáng mờ + lưới chấm nhẹ để panel có chiều sâu */}
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 animate-hero-glow rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-32 left-10 h-96 w-96 rounded-full bg-[#7c2d12]/20 blur-3xl" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.18)_1px,transparent_1px)] bg-size-[22px_22px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
        <div className="relative flex items-center gap-3">
          <img src="/pwa-icon.svg" alt="" className="h-11 w-11 rounded-xl ring-2 ring-white/40" />
          <div>
            <p className="text-xl font-extrabold">UniPlan</p>
            <p className="text-xs font-semibold uppercase tracking-wider text-white/80">FPT University Đà Nẵng</p>
          </div>
        </div>
        <AuthHero />

        <div className="relative max-w-lg">
          {/* Chữ nổi 3D: nhiều lớp bóng đổ cam đậm dần xuống dưới */}
          <h1 className="text-4xl font-black leading-[1.1] tracking-tight xl:text-5xl">
            <span className="block text-white [text-shadow:0_1px_0_#fed7aa,0_2px_0_#fdba74,0_3px_0_#fb923c,0_4px_0_#ea580c,0_5px_0_#c2410c,0_10px_18px_rgba(124,45,18,0.45)]">
              Không bao giờ trễ
            </span>
            <span className="block text-[#fff7ed] [text-shadow:0_1px_0_#fde68a,0_2px_0_#fcd34d,0_3px_0_#f59e0b,0_4px_0_#d97706,0_5px_0_#b45309,0_6px_0_#92400e,0_12px_20px_rgba(124,45,18,0.5)]">
              deadline nữa<span className="text-[#fde68a]">.</span>
            </span>
          </h1>
          <ul className="mt-7 space-y-3.5 text-white/90">
            <Feature icon={CalendarCheck} text="Thời khóa biểu theo Block 5 tuần & lịch thi PE / FE" />
            <Feature icon={Zap} text="Theo dõi deadline, subtask và tiến độ từng môn" />
            <Feature icon={Users} text="Chia việc bài nhóm và gửi deadline cho bạn bè chỉ với 1 click" />
          </ul>
        </div>
        <p className="relative text-xs text-white/70">© {new Date().getFullYear()} UniPlan</p>
      </aside>

      <main className="relative flex items-center justify-center overflow-hidden bg-linear-to-br from-brand-50 via-surface to-orange-100/70 px-4 py-10 sm:px-8">
        {/* Nền bầu trời: sáng = mặt trời + hành tinh, tối = trăng khuyết + sao (nằm sau thẻ form) */}
        <SkyBackdrop variant="hero" />
        <ThemeToggle className="absolute right-4 top-4 z-10" />
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-brand-200/40 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-brand-100/70 blur-3xl" />

        <div className="relative w-full max-w-md">
          <div className="mb-6 flex items-center justify-center gap-3 lg:hidden">
            <img src="/pwa-icon.svg" alt="" className="h-10 w-10 rounded-xl" />
            <p className="text-xl font-extrabold text-slate-900">
              Uni<span className="text-brand-500">Plan</span>
            </p>
          </div>

          <section className="overflow-hidden rounded-3xl border border-brand-100 bg-surface shadow-xl shadow-brand-500/10 ring-1 ring-black/2">
            <div className="h-1.5 bg-linear-to-r from-brand-400 via-brand-500 to-brand-600" aria-hidden />
            <div className="px-6 pb-7 pt-8 sm:px-9">
              <h2 className="text-center text-3xl font-extrabold tracking-tight text-brand-600">{title}</h2>
              {subtitle && <p className="mt-2 text-center text-sm text-slate-500">{subtitle}</p>}

              <div className="mt-7">{children}</div>
            </div>
            {footer && <div className="border-t border-brand-100 bg-brand-50/60 px-6 py-4 text-center text-sm text-slate-600">{footer}</div>}
          </section>
        </div>
      </main>
    </div>
  )
}

function Feature({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/15">
        <Icon className="h-4 w-4" />
      </span>
      <span className="pt-1">{text}</span>
    </li>
  )
}
