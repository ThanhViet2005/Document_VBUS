import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'

/**
 * Minh họa động cho panel cam ở trang Đăng nhập / Đăng ký:
 * logo UniPlan đội mũ tốt nghiệp ở giữa, quỹ đạo có "hành tinh" chạy quanh, các thẻ kính nổi (deadline, lịch, tiến độ, nhóm)
 * và huy hiệu dạng đồng xu. Các lớp nghiêng nhẹ theo con trỏ (parallax).
 *
 * Màu viết bằng mã hex: panel luôn cam ở cả sáng / tối, còn slate-* / brand-* bị đảo màu ở giao diện tối.
 * Chuyển động tắt khi người dùng bật "Giảm chuyển động" (CSS toàn cục + kiểm tra cho SVG và parallax).
 */
export default function AuthHero() {
  const ref = useRef<HTMLDivElement>(null)
  const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  // Parallax: lưu vị trí con trỏ (-1..1) vào biến CSS, mỗi lớp dịch theo độ sâu riêng
  useEffect(() => {
    const el = ref.current?.closest('aside')
    if (!el || reduced) return
    let raf = 0
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      const x = ((e.clientX - r.left) / r.width) * 2 - 1
      const y = ((e.clientY - r.top) / r.height) * 2 - 1
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        ref.current?.style.setProperty('--px', x.toFixed(3))
        ref.current?.style.setProperty('--py', y.toFixed(3))
      })
    }
    const onLeave = () => {
      ref.current?.style.setProperty('--px', '0')
      ref.current?.style.setProperty('--py', '0')
    }
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerleave', onLeave)
    return () => {
      cancelAnimationFrame(raf)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerleave', onLeave)
    }
  }, [reduced])

  return (
    <div ref={ref} className="relative mx-auto h-[clamp(260px,38vh,400px)] w-full max-w-xl select-none" aria-hidden style={{ '--px': 0, '--py': 0 } as CSSProperties}>
      {/* Quầng sáng sau logo */}
      <Layer depth={6} className="left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="h-56 w-56 animate-hero-glow rounded-full bg-[radial-gradient(circle,rgba(255,237,213,0.55),rgba(255,237,213,0)_70%)]" />
      </Layer>

      {/* Quỹ đạo: 2 elip nghiêng, có hành tinh chạy theo */}
      <Layer depth={10} className="inset-0">
        <svg viewBox="0 0 600 400" className="h-full w-full overflow-visible">
          <defs>
            <linearGradient id="orbit" x1="0" x2="1">
              <stop offset="0" stopColor="#fff" stopOpacity="0.15" />
              <stop offset="0.5" stopColor="#fff" stopOpacity="0.7" />
              <stop offset="1" stopColor="#fff" stopOpacity="0.15" />
            </linearGradient>
            <radialGradient id="planet" cx="0.35" cy="0.35">
              <stop offset="0" stopColor="#fff7ed" />
              <stop offset="1" stopColor="#fdba74" />
            </radialGradient>
          </defs>
          <g transform="rotate(-8 300 200)">
            <ellipse id="orbitA" cx="300" cy="200" rx="250" ry="78" fill="none" stroke="url(#orbit)" strokeWidth="2" />
            <ellipse cx="300" cy="200" rx="200" ry="58" fill="none" stroke="url(#orbit)" strokeWidth="1.2" strokeDasharray="4 8" />
            {!reduced && (
              <>
                <circle r="9" fill="url(#planet)" filter="drop-shadow(0 2px 4px rgba(124,45,18,.35))">
                  <animateMotion dur="14s" repeatCount="indefinite" path="M550,200 a250,78 0 1,1 -500,0 a250,78 0 1,1 500,0" />
                </circle>
                <circle r="5" fill="#fff">
                  <animateMotion dur="9s" repeatCount="indefinite" path="M100,200 a200,58 0 1,0 400,0 a200,58 0 1,0 -400,0" />
                </circle>
              </>
            )}
          </g>
        </svg>
      </Layer>

      {/* Logo ở giữa, đội mũ tốt nghiệp */}
      <Layer depth={18} className="left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="relative animate-hero-float">
          <GradCap className="absolute -top-10 left-1/2 z-10 h-16 w-20 -translate-x-1/2 -rotate-12 drop-shadow-[0_6px_8px_rgba(124,45,18,0.35)]" />
          <div className="flex h-28 w-28 items-center justify-center rounded-[2rem] bg-white shadow-[0_18px_40px_-8px_rgba(124,45,18,0.55)] ring-4 ring-white/40">
            <span className="bg-gradient-to-br from-[#fb923c] to-[#c2410c] bg-clip-text text-6xl font-black text-transparent">U</span>
          </div>
          <Sparkle className="absolute -right-6 top-2 h-5 w-5 animate-hero-twinkle text-white" />
          <Sparkle className="absolute -left-5 bottom-3 h-3.5 w-3.5 animate-hero-twinkle text-[#fff7ed] [animation-delay:1.2s]" />
        </div>
      </Layer>

      {/* Thẻ: Deadline (trên trái) */}
      <Layer depth={26} className="left-0 top-2">
        <GlassCard title="Deadline" className="w-48 -rotate-6 animate-hero-float [animation-delay:-1s]">
          <p className="text-[13px] font-bold text-[#0f172a]">Lab 5 · PRO192</p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#ffedd5]">
            <div className="h-full w-[70%] animate-hero-fill rounded-full bg-gradient-to-r from-[#fb923c] to-[#ea580c]" />
          </div>
          <p className="mt-1.5 flex items-center justify-between text-xs">
            <span className="font-semibold text-[#dc2626]">23:59 hôm nay</span>
            <span className="text-[#64748b]">70%</span>
          </p>
        </GlassCard>
      </Layer>

      {/* Thẻ: Lịch học (trên phải) */}
      <Layer depth={22} className="right-0 top-0">
        <GlassCard title="Lịch học" className="w-44 rotate-6 animate-hero-float-slow">
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 21 }, (_, i) => (
              <span
                key={i}
                className={
                  i === 9
                    ? 'h-3.5 animate-pulse rounded bg-[#ea580c]'
                    : [2, 5, 11, 15, 18].includes(i)
                      ? 'h-3.5 rounded bg-[#fdba74]'
                      : 'h-3.5 rounded bg-[#f1f5f9]'
                }
              />
            ))}
          </div>
          <p className="mt-2 text-xs font-semibold text-[#0f172a]">
            Slot 2 · <span className="text-[#ea580c]">DE-201</span>
          </p>
        </GlassCard>
      </Layer>

      {/* Thẻ: Tiến độ (dưới trái) – cột tăng dần */}
      <Layer depth={30} className="bottom-2 left-6">
        <GlassCard title="Tiến độ" className="w-40 rotate-3 animate-hero-float-slow [animation-delay:-3s]">
          <div className="flex h-14 items-end gap-2">
            {[38, 58, 46, 88].map((h, i) => (
              <span
                key={i}
                className="w-full origin-bottom animate-hero-bar rounded-t-md bg-gradient-to-t from-[#ea580c] to-[#fdba74]"
                style={{ height: `${h}%`, animationDelay: `${i * 0.25}s` }}
              />
            ))}
          </div>
        </GlassCard>
      </Layer>

      {/* Thẻ: Nhóm (dưới phải) */}
      <Layer depth={24} className="bottom-6 right-2">
        <GlassCard title="Bài nhóm" className="w-44 -rotate-3 animate-hero-float [animation-delay:-2.2s]">
          <div className="flex items-center">
            {['#f97316', '#3b82f6', '#10b981'].map((c, i) => (
              <span key={c} className="-ml-1.5 flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold text-white ring-2 ring-white first:ml-0" style={{ background: c }}>
                {['VA', 'TM', 'NH'][i]}
              </span>
            ))}
            <span className="ml-1.5 text-xs font-semibold text-[#64748b]">+2</span>
          </div>
          <p className="mt-2 inline-flex items-center gap-1 rounded-md bg-[#dcfce7] px-1.5 py-0.5 text-xs font-bold text-[#047857]">✓ 3/4 việc xong</p>
        </GlassCard>
      </Layer>

      {/* Huy hiệu đồng xu */}
      <Layer depth={34} className="left-[30%] top-0">
        <Coin className="h-12 w-12 animate-hero-bob">✓</Coin>
      </Layer>
      <Layer depth={38} className="bottom-0 right-[34%]">
        <Coin className="h-10 w-10 animate-hero-bob text-sm [animation-delay:-1.5s]">A+</Coin>
      </Layer>
      <Layer depth={14} className="left-[22%] top-[44%]">
        <span className="block h-3 w-3 animate-hero-bob rounded-full bg-[#fed7aa] shadow-[0_2px_6px_rgba(124,45,18,.3)] [animation-delay:-0.6s]" />
      </Layer>
      <Layer depth={12} className="right-[24%] top-[30%]">
        <span className="block h-2 w-2 animate-hero-bob rounded-full bg-white/90 [animation-delay:-2.4s]" />
      </Layer>
    </div>
  )
}

/**
 * Lớp parallax: dịch theo con trỏ, depth càng lớn càng "gần" người xem.
 * Dùng transform (không dùng thuộc tính translate): class -translate-x-1/2 của Tailwind v4 đã chiếm thuộc tính translate.
 */
function Layer({ depth, className, children }: { depth: number; className: string; children: ReactNode }) {
  return (
    <div
      className={`absolute transition-transform duration-500 ease-out ${className}`}
      style={{ transform: `translate(calc(var(--px) * ${depth}px), calc(var(--py) * ${depth * 0.6}px))` }}
    >
      {children}
    </div>
  )
}

function GlassCard({ title, className, children }: { title: string; className?: string; children: ReactNode }) {
  return (
    <div className={`rounded-2xl bg-white/90 p-3 shadow-[0_16px_32px_-12px_rgba(124,45,18,0.5)] ring-1 ring-white/60 backdrop-blur ${className ?? ''}`}>
      <div className="mb-2 flex items-center justify-between">
        <span className="flex gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-[#cbd5e1]" />
          <span className="h-1.5 w-1.5 rounded-full bg-[#cbd5e1]" />
          <span className="h-1.5 w-1.5 rounded-full bg-[#cbd5e1]" />
        </span>
        <span className="text-xs font-bold text-[#334155]">{title}</span>
      </div>
      {children}
    </div>
  )
}

function Coin({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span
      className={`flex items-center justify-center rounded-full bg-gradient-to-br from-[#fdba74] via-[#f97316] to-[#c2410c] font-black text-white shadow-[inset_0_-3px_0_rgba(124,45,18,0.45),0_8px_16px_-4px_rgba(124,45,18,0.6)] ring-2 ring-[#fed7aa] ${className ?? ''}`}
    >
      {children}
    </span>
  )
}

function GradCap({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 64" className={className}>
      <path d="M40 6 L76 22 L40 38 L4 22 Z" fill="#1e3a8a" />
      <path d="M40 6 L76 22 L40 30 L4 22 Z" fill="#2563eb" />
      <path d="M18 30 V44 C18 50 62 50 62 44 V30 L40 40 Z" fill="#1e40af" />
      <path d="M70 25 V44" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="70" cy="47" r="4" fill="#fbbf24" />
    </svg>
  )
}

function Sparkle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M12 0c.6 5.4 3 9 12 12-9 3-11.4 6.6-12 12-.6-5.4-3-9-12-12 9-3 11.4-6.6 12-12z" />
    </svg>
  )
}
