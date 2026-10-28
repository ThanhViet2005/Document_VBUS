import { useId, useMemo, type CSSProperties, type ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { makeStars, useSkyEnabled } from '../../lib/sky'

/**
 * Nền "bầu trời" theo giao diện:
 *  - Sáng: mặt trời + các hành tinh nhỏ trôi nhẹ, có quỹ đạo.
 *  - Tối: trăng khuyết phát sáng; MỖI HÀNH TINH hóa thành một ngôi sao lấp lánh ở đúng vị trí cũ, thêm sao nền và sao băng.
 *
 * variant="hero":    Đăng nhập / Đăng ký. Đặt trong khung `relative overflow-hidden`; đầy đủ chi tiết, nằm sau thẻ form.
 * variant="ambient": các trang trong app. Cố định toàn màn hình sau mọi nội dung, rất nhạt (thẻ nội dung đặc nên chỉ lộ ở khe và lề),
 *                    chỉ hành tinh / sao, không mặt trời / trăng. Người dùng tắt được ở Cài đặt → Giao diện.
 *
 * Hiệu năng: không JavaScript chạy khi hiển thị. Chuyển động chỉ dùng transform / opacity (CSS), tối đa ~50 phần tử.
 * Hai lớp sáng / tối chuyển mượt bằng opacity (đổi giao diện không bị giật); lớp đang ẩn có visibility:hidden nên không vẽ.
 * Tắt hẳn chuyển động khi người dùng bật "Giảm chuyển động" (khối cuối index.css). Toàn bộ là trang trí → aria-hidden.
 * Màu viết bằng mã hex vì slate-* / brand-* bị đảo ở giao diện tối.
 */
export default function SkyBackdrop({ variant }: { variant: 'hero' | 'ambient' }) {
  const [enabled] = useSkyEnabled()
  if (variant === 'ambient') return enabled ? <AmbientSky /> : null
  return <HeroSky />
}

// ---------------------------------------------------------------------
// Các thiên thể (SVG nhỏ, dùng chung). Mỗi SVG có id gradient riêng (useId) để nhiều bản không đè nhau.
// ---------------------------------------------------------------------
export type PlanetKind = 'ringed' | 'gas' | 'earth' | 'rocky' | 'ice' | 'violet'

interface Look {
  /** 3 màu thân: vùng sáng → giữa → vùng tối */
  light: string
  mid: string
  dark: string
  /** Màu quầng khí quyển */
  glow: string
  /** Vành đai: [màu sáng, màu tối] và góc nghiêng */
  ring?: [string, string]
  tilt?: number
  /** Dải mây khí (hành tinh khí) */
  bands?: string
  /** Cơn bão (đốm) trên dải mây */
  storm?: string
  /** Lục địa + mây trắng (hành tinh kiểu Trái Đất) */
  land?: string
  craters?: boolean
  /** Có 1 mặt trăng nhỏ bên cạnh */
  moon?: boolean
}

/** Bảng màu theo bộ ba FPT (cam, xanh dương, xanh lá) + 3 màu phụ hài hòa */
const LOOK: Record<PlanetKind, Look> = {
  ringed: { light: '#ffe8cc', mid: '#fb923c', dark: '#9a3412', glow: '#fdba74', ring: ['#fde68a', '#f59e0b'], tilt: -20, bands: '#c2410c' },
  gas: { light: '#dbeafe', mid: '#3b82f6', dark: '#0b3d82', glow: '#93c5fd', bands: '#1e40af', storm: '#fb923c', moon: true },
  earth: { light: '#c9f4ff', mid: '#22a6c9', dark: '#0b4f6c', glow: '#a5f3fc', land: '#3fae49' },
  rocky: { light: '#fef3c7', mid: '#f5b13a', dark: '#92400e', glow: '#fde68a', craters: true },
  ice: { light: '#f0f9ff', mid: '#a5c8ff', dark: '#4561c9', glow: '#c7e3ff', ring: ['#e0f2fe', '#7aa7f5'], tilt: 24 },
  violet: { light: '#f3e8ff', mid: '#a78bfa', dark: '#4c1d95', glow: '#c4b5fd', bands: '#6d28d9' },
}

/**
 * Hành tinh SVG nhiều lớp: quầng khí quyển → nửa sau vành đai → thân (gradient cầu) → chi tiết bề mặt (dải mây / lục địa / miệng núi lửa,
 * cắt theo hình tròn) → bóng tối phía khuất sáng → đốm phản quang → nửa trước vành đai → mặt trăng nhỏ.
 * Ánh sáng chiếu từ góc trên bên trái cho mọi hành tinh để cả bầu trời nhất quán.
 */
export function Planet({ kind, className }: { kind: PlanetKind; className?: string }) {
  const id = useId()
  const l = LOOK[kind]
  const ring = l.ring && (
    <>
      <linearGradient id={`${id}-r`} x1="0" x2="1">
        <stop offset="0" stopColor={l.ring[1]} stopOpacity="0.25" />
        <stop offset="0.5" stopColor={l.ring[0]} />
        <stop offset="1" stopColor={l.ring[1]} stopOpacity="0.25" />
      </linearGradient>
    </>
  )
  const tilt = `rotate(${l.tilt ?? 0} 50 50)`
  return (
    <svg viewBox="0 0 100 100" className={cn('absolute overflow-visible', className)} aria-hidden>
      <defs>
        <radialGradient id={`${id}-b`} cx="0.34" cy="0.3" r="0.8">
          <stop offset="0" stopColor={l.light} />
          <stop offset="0.55" stopColor={l.mid} />
          <stop offset="1" stopColor={l.dark} />
        </radialGradient>
        {/* Bóng phía khuất sáng (góc dưới phải) */}
        <radialGradient id={`${id}-s`} cx="0.3" cy="0.28" r="0.85">
          <stop offset="0.5" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.4" />
        </radialGradient>
        {/* Quầng khí quyển: vòng sáng mờ ôm sát thân */}
        <radialGradient id={`${id}-a`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0.76" stopColor={l.glow} stopOpacity="0" />
          <stop offset="0.86" stopColor={l.glow} stopOpacity="0.55" />
          <stop offset="1" stopColor={l.glow} stopOpacity="0" />
        </radialGradient>
        <clipPath id={`${id}-c`}>
          <circle cx="50" cy="50" r="26" />
        </clipPath>
        {ring}
      </defs>

      <circle cx="50" cy="50" r="34" fill={`url(#${id}-a)`} />

      {l.ring && (
        <g transform={tilt} fill="none">
          <ellipse cx="50" cy="50" rx="46" ry="11" stroke={`url(#${id}-r)`} strokeWidth="5" opacity="0.45" />
          <ellipse cx="50" cy="50" rx="39" ry="9" stroke={l.ring[0]} strokeWidth="1.2" opacity="0.5" />
        </g>
      )}

      <circle cx="50" cy="50" r="26" fill={`url(#${id}-b)`} />

      <g clipPath={`url(#${id}-c)`}>
        {l.bands && (
          <g fill="none" stroke={l.bands} strokeLinecap="round">
            <path d="M20 37 Q50 31 80 37" strokeWidth="3" opacity="0.3" />
            <path d="M18 46 Q50 41 82 47" strokeWidth="5" opacity="0.22" />
            <path d="M18 56 Q50 52 82 57" strokeWidth="3.5" opacity="0.3" />
            <path d="M22 65 Q50 61 78 66" strokeWidth="2.5" opacity="0.25" />
          </g>
        )}
        {l.storm && <ellipse cx="61" cy="57" rx="6" ry="3.4" fill={l.storm} opacity="0.75" />}
        {l.land && (
          <>
            <g fill={l.land} opacity="0.9">
              <path d="M30 38c5-6 13-5 16 0s-1 10-7 10-12-4-9-10z" />
              <path d="M52 55c6-4 14-2 16 4s-3 10-9 9-10-9-7-13z" />
              <path d="M40 66c3-2 7-1 8 1s-2 4-5 4-5-3-3-5z" />
            </g>
            <g fill="none" stroke="#fff" strokeLinecap="round" opacity="0.65">
              <path d="M24 50 Q34 46 44 50" strokeWidth="2" />
              <path d="M56 40 Q66 36 74 40" strokeWidth="1.6" />
            </g>
          </>
        )}
        {l.craters && (
          <g>
            {[
              [40, 56, 5],
              [59, 43, 3.6],
              [56, 63, 2.6],
              [34, 42, 2.2],
            ].map(([cx, cy, r]) => (
              <g key={`${cx}-${cy}`}>
                <circle cx={cx} cy={cy} r={r} fill={l.dark} opacity="0.3" />
                <circle cx={cx - r * 0.25} cy={cy - r * 0.25} r={r * 0.75} fill={l.light} opacity="0.18" />
              </g>
            ))}
          </g>
        )}
        <circle cx="50" cy="50" r="26" fill={`url(#${id}-s)`} />
      </g>

      {/* Đốm phản quang */}
      <ellipse cx="40" cy="38" rx="7" ry="4" fill="#fff" opacity="0.45" transform="rotate(-32 40 38)" />

      {l.ring && (
        <g transform={tilt} fill="none">
          <path d="M4 50 A46 11 0 0 0 96 50" stroke={`url(#${id}-r)`} strokeWidth="5" />
          <path d="M11 50 A39 9 0 0 0 89 50" stroke={l.ring[0]} strokeWidth="1.2" opacity="0.8" />
        </g>
      )}

      {l.moon && (
        <g>
          <circle cx="88" cy="24" r="5" fill="#94a3b8" />
          <circle cx="87" cy="23" r="4.2" fill="#e2e8f0" />
          <circle cx="86" cy="22" r="1.5" fill="#fff" opacity="0.8" />
        </g>
      )}
    </svg>
  )
}

/** Ngôi sao 4 cánh lấp lánh: hình dạng "hành tinh hóa thành sao" ở giao diện tối */
function Sparkle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={cn('animate-hero-twinkle [filter:drop-shadow(0_0_6px_rgba(191,219,254,0.9))]', className)} aria-hidden>
      <path d="M50 0C53 36 64 47 100 50C64 53 53 64 50 100C47 64 36 53 0 50C36 47 47 36 50 0Z" fill="#eef4ff" />
    </svg>
  )
}

function Sun({ className }: { className?: string }) {
  const id = useId()
  return (
    <div className={cn('absolute', className)}>
      <div className="absolute -inset-[70%] animate-hero-glow rounded-full bg-[radial-gradient(circle,rgba(253,186,116,0.7),rgba(253,186,116,0)_62%)]" />
      <svg viewBox="0 0 200 200" className="relative h-full w-full overflow-visible" aria-hidden>
        <defs>
          <radialGradient id={`${id}-c`} cx="0.38" cy="0.35" r="0.75">
            <stop offset="0" stopColor="#fff7d6" />
            <stop offset="0.45" stopColor="#fdba3b" />
            <stop offset="1" stopColor="#f97316" />
          </radialGradient>
        </defs>
        {/* Tia nắng quay rất chậm (transform-box: view-box để quay quanh tâm hình, không quanh góc) */}
        <g className="animate-sky-spin" style={{ transformOrigin: '100px 100px', transformBox: 'view-box' } as CSSProperties}>
          {Array.from({ length: 12 }, (_, i) => (
            <rect key={i} x="97" y="10" width="6" height="26" rx="3" fill="#fbbf24" opacity={i % 2 ? 0.5 : 0.9} transform={`rotate(${i * 30} 100 100)`} />
          ))}
        </g>
        <circle cx="100" cy="100" r="52" fill={`url(#${id}-c)`} />
      </svg>
    </div>
  )
}

function Moon({ className }: { className?: string }) {
  const id = useId()
  return (
    <div className={cn('absolute', className)}>
      <div className="absolute -inset-[80%] animate-hero-glow rounded-full bg-[radial-gradient(circle,rgba(186,215,255,0.4),rgba(186,215,255,0)_60%)]" />
      <svg viewBox="0 0 200 200" className="relative h-full w-full overflow-visible [filter:drop-shadow(0_0_14px_rgba(191,219,254,0.6))]" aria-hidden>
        <defs>
          {/* Trăng khuyết = hình tròn sáng khoét bớt bởi 1 hình tròn lệch tâm */}
          <mask id={`${id}-m`}>
            <rect width="200" height="200" fill="white" />
            <circle cx="136" cy="82" r="64" fill="black" />
          </mask>
          <radialGradient id={`${id}-g`} cx="0.3" cy="0.35" r="0.9">
            <stop offset="0" stopColor="#fffdf0" />
            <stop offset="0.6" stopColor="#e8eefc" />
            <stop offset="1" stopColor="#b9c7ea" />
          </radialGradient>
        </defs>
        <g mask={`url(#${id}-m)`}>
          <circle cx="92" cy="104" r="72" fill={`url(#${id}-g)`} />
          <g fill="#aebbe0" opacity="0.5">
            <circle cx="60" cy="122" r="9" />
            <circle cx="78" cy="148" r="5" />
            <circle cx="50" cy="92" r="4" />
          </g>
        </g>
      </svg>
    </div>
  )
}

// ---------------------------------------------------------------------
// Vị trí các "thiên thể": ban ngày là hành tinh, ban đêm là sao lấp lánh ở CÙNG chỗ
// ---------------------------------------------------------------------
interface Anchor {
  kind: PlanetKind
  /** Class vị trí (absolute) + độ hiện theo cỡ màn hình */
  pos: string
  /** Cỡ hành tinh */
  size: string
  /** Cỡ ngôi sao tương ứng */
  star: string
  float: 'animate-hero-float' | 'animate-hero-float-slow'
}

const HERO_ANCHORS: Anchor[] = [
  { kind: 'ringed', pos: 'right-[7%] top-[19%]', size: 'h-20 w-20 sm:h-28 sm:w-28', star: 'h-6 w-6 sm:h-8 sm:w-8', float: 'animate-hero-float-slow' },
  { kind: 'gas', pos: 'left-[7%] bottom-[14%]', size: 'h-14 w-14 sm:h-16 sm:w-16', star: 'h-5 w-5', float: 'animate-hero-float' },
  { kind: 'earth', pos: 'right-[11%] bottom-[8%]', size: 'h-11 w-11 sm:h-12 sm:w-12', star: 'h-4 w-4', float: 'animate-hero-float-slow' },
  { kind: 'ice', pos: 'right-[3%] top-[50%] hidden sm:block', size: 'h-12 w-12', star: 'h-4 w-4', float: 'animate-hero-float' },
  { kind: 'violet', pos: 'left-[40%] top-[7%] hidden sm:block', size: 'h-8 w-8', star: 'h-3.5 w-3.5', float: 'animate-hero-float-slow' },
  { kind: 'rocky', pos: 'left-[3%] top-[46%]', size: 'h-8 w-8', star: 'h-3.5 w-3.5', float: 'animate-hero-float' },
  { kind: 'rocky', pos: 'right-[32%] bottom-[3%] hidden sm:block', size: 'h-6 w-6', star: 'h-3 w-3', float: 'animate-hero-float-slow' },
  { kind: 'violet', pos: 'left-[24%] bottom-[4%] hidden lg:block', size: 'h-5 w-5', star: 'h-2.5 w-2.5', float: 'animate-hero-float' },
]

/** Lề phải, đáy và lề trái (phía bên phải thanh điều hướng) */
const AMBIENT_ANCHORS: Anchor[] = [
  { kind: 'ringed', pos: '-right-6 top-24', size: 'h-28 w-28 sm:h-36 sm:w-36', star: 'h-6 w-6 sm:h-8 sm:w-8', float: 'animate-hero-float-slow' },
  { kind: 'gas', pos: 'right-[9%] bottom-[14%]', size: 'h-12 w-12 sm:h-16 sm:w-16', star: 'h-4 w-4 sm:h-5 sm:w-5', float: 'animate-hero-float' },
  { kind: 'earth', pos: 'right-[34%] bottom-[5%] hidden sm:block', size: 'h-9 w-9', star: 'h-3.5 w-3.5', float: 'animate-hero-float-slow' },
  { kind: 'rocky', pos: 'right-[26%] top-[11%] hidden md:block', size: 'h-7 w-7', star: 'h-3 w-3', float: 'animate-hero-float' },
  { kind: 'ice', pos: 'right-[2%] top-[52%] hidden sm:block', size: 'h-11 w-11', star: 'h-4 w-4', float: 'animate-hero-float' },
  { kind: 'violet', pos: 'right-[55%] bottom-[3%] hidden lg:block', size: 'h-7 w-7', star: 'h-3 w-3', float: 'animate-hero-float-slow' },
  { kind: 'rocky', pos: 'right-[17%] top-[33%] hidden lg:block', size: 'h-5 w-5', star: 'h-2.5 w-2.5', float: 'animate-hero-float-slow' },
  // Bên trái: tính từ mép phải thanh điều hướng (--nav-w trong index.css) nên không bị thanh che; ẩn ở điện thoại / iPad dọc
  { kind: 'violet', pos: 'left-[calc(var(--nav-w)+6%)] top-[16%] hidden lg:block', size: 'h-14 w-14', star: 'h-5 w-5', float: 'animate-hero-float-slow' },
  { kind: 'ice', pos: 'left-[calc(var(--nav-w)+3%)] bottom-[12%] hidden lg:block', size: 'h-16 w-16', star: 'h-5 w-5', float: 'animate-hero-float' },
  { kind: 'earth', pos: 'left-[calc(var(--nav-w)+10%)] top-[56%] hidden xl:block', size: 'h-10 w-10', star: 'h-4 w-4', float: 'animate-hero-float-slow' },
  { kind: 'rocky', pos: 'left-[calc(var(--nav-w)+14%)] top-[34%] hidden xl:block', size: 'h-6 w-6', star: 'h-3 w-3', float: 'animate-hero-float' },
]

function Bodies({ anchors, as, className }: { anchors: Anchor[]; as: 'planets' | 'stars'; className?: string }) {
  return (
    <>
      {anchors.map((a, i) => (
        <div key={i} className={cn('absolute', a.pos, a.size, a.float, className)}>
          {as === 'planets' ? (
            <Planet kind={a.kind} className="inset-0 h-full w-full" />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center">
              <Sparkle className={a.star} />
            </span>
          )}
        </div>
      ))}
    </>
  )
}

/** Sao nền (chấm tròn nhỏ), tọa độ cố định theo hạt giống */
function StarField({ count, seed, className }: { count: number; seed: number; className?: string }) {
  const stars = useMemo(() => makeStars(count, seed), [count, seed])
  return (
    <div className={cn('absolute inset-0', className)}>
      {stars.map((s, i) => (
        <span
          key={i}
          className={cn('absolute rounded-full bg-white', s.twinkle && 'animate-hero-twinkle')}
          style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.r * 2, height: s.r * 2, opacity: s.o, animationDelay: `${s.delay}s`, animationDuration: `${s.dur}s` }}
        />
      ))}
    </div>
  )
}

/** Một lớp (sáng hoặc tối): hiện / ẩn mượt bằng opacity, ẩn hẳn bằng visibility sau khi mờ xong để không tốn công vẽ */
function Layer({ show, children }: { show: 'light' | 'dark'; children: ReactNode }) {
  return (
    <div
      className={cn(
        'absolute inset-0 transition-[opacity,visibility] duration-700',
        show === 'light' ? 'visible opacity-100 dark:invisible dark:opacity-0' : 'invisible opacity-0 dark:visible dark:opacity-100',
      )}
    >
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------
// Đăng nhập / Đăng ký
// ---------------------------------------------------------------------
function Orbit({ inset, duration, reverse, children }: { inset: string; duration: string; reverse?: boolean; children: ReactNode }) {
  return (
    <div
      className="absolute animate-sky-spin rounded-full border border-dashed border-[#f97316]/25"
      style={{ inset, animationDuration: duration, animationDirection: reverse ? 'reverse' : 'normal' }}
    >
      {children}
    </div>
  )
}

function HeroSky() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {/* Ban ngày: bầu trời ấm, mặt trời có 2 quỹ đạo (hành tinh nhỏ chạy quanh), hành tinh trôi nhẹ */}
      <Layer show="light">
        <div className="absolute inset-0 bg-linear-to-b from-[#ffe7c7]/80 via-[#fff3e2]/40 to-transparent" />
        <div className="absolute left-[6%] top-[5%] h-24 w-24 sm:h-32 sm:w-32">
          <Orbit inset="-85%" duration="70s">
            <Planet kind="gas" className="left-1/2 top-0 h-6 w-6 -translate-x-1/2 -translate-y-1/2" />
          </Orbit>
          <Orbit inset="-175%" duration="120s" reverse>
            <Planet kind="rocky" className="left-1/2 top-0 h-6 w-6 -translate-x-1/2 -translate-y-1/2" />
          </Orbit>
          <Sun className="inset-0" />
        </div>
        <Bodies anchors={HERO_ANCHORS} as="planets" />
        {/* Vài chấm bụi sao cho bầu trời ban ngày bớt trống */}
        <span className="absolute left-[44%] top-[9%] h-1.5 w-1.5 rounded-full bg-[#f97316]/40" />
        <span className="absolute right-[30%] top-[46%] h-1 w-1 rounded-full bg-[#0b6bcb]/40" />
        <span className="absolute bottom-[26%] left-[20%] h-1 w-1 rounded-full bg-[#3fae49]/50" />
      </Layer>

      {/* Ban đêm: trời xanh thẫm, trăng khuyết phát sáng thay mặt trời, hành tinh → sao, thêm sao nền và 1 sao băng */}
      <Layer show="dark">
        <div className="absolute inset-0 bg-linear-to-b from-[#070d24] via-[#0c1634] to-[#111a2e]" />
        <StarField count={70} seed={20261022} />
        <Moon className="left-[8%] top-[6%] h-20 w-20 sm:h-28 sm:w-28" />
        <Bodies anchors={HERO_ANCHORS} as="stars" />
        <span className="animate-shooting absolute right-[18%] top-[10%] h-px w-24 -rotate-[35deg] bg-linear-to-l from-white to-transparent opacity-0" />
      </Layer>
    </div>
  )
}

// ---------------------------------------------------------------------
// Các trang trong app: rất nhạt, nằm sau mọi nội dung
// ---------------------------------------------------------------------
function AmbientSky() {
  return (
    // -z-10 + cha dùng `isolate` (AppLayout): nằm trên nền trang nhưng dưới mọi nội dung. contain: tách vùng vẽ khỏi phần còn lại
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden [contain:layout_paint_style]" aria-hidden>
      <Layer show="light">
        {/* Quỹ đạo mờ quanh hành tinh lớn + các hành tinh trong suốt một phần (thẻ nội dung đè lên nên không cản chữ) */}
        <div className="absolute -right-40 -top-32 h-130 w-130 rounded-full border border-dashed border-[#f97316]/15" />
        <Bodies anchors={AMBIENT_ANCHORS} as="planets" className="opacity-40" />
      </Layer>
      <Layer show="dark">
        <StarField count={46} seed={1022} className="opacity-80" />
        <Bodies anchors={AMBIENT_ANCHORS} as="stars" className="opacity-70" />
      </Layer>
    </div>
  )
}
