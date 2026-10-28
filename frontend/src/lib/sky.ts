import { useCallback, useSyncExternalStore } from 'react'

// Nền "bầu trời" (components/ui/SkyBackdrop.tsx): sáng = mặt trời + hành tinh, tối = trăng khuyết + các vì sao.

export interface Star {
  /** Vị trí theo % chiều ngang / dọc của khung chứa */
  x: number
  y: number
  /** Bán kính (px) */
  r: number
  /** Độ sáng 0..1 */
  o: number
  /** Chỉ một phần số sao nhấp nháy (animate-hero-twinkle), còn lại đứng yên cho nhẹ máy */
  twinkle: boolean
  delay: number
  dur: number
}

/**
 * Sinh sao theo hạt giống (mulberry32): cùng hạt giống → cùng bầu trời ở mọi lần render và mọi lần mở app
 * (dùng Math.random sẽ làm sao nhảy vị trí mỗi khi component dựng lại).
 */
export function makeStars(count: number, seed: number): Star[] {
  let a = seed
  const rnd = () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return Array.from({ length: count }, (_, i) => {
    const size = rnd()
    return {
      x: rnd() * 100,
      y: rnd() * 100,
      // Phần lớn là sao nhỏ, vài ngôi sao lớn hơn
      r: 0.7 + size * size * 1.6,
      o: 0.35 + rnd() * 0.55,
      twinkle: i % 4 === 0,
      delay: rnd() * 5,
      dur: 2.4 + rnd() * 3,
    }
  })
}

// ---------------------------------------------------------------------
// Tùy chọn "Hiệu ứng nền bầu trời" ở các trang trong app (Cài đặt → Giao diện). Lưu theo thiết bị, mặc định BẬT.
// Trang Đăng nhập / Đăng ký luôn có nền này.
// ---------------------------------------------------------------------
const KEY = 'uniplan.sky'
const EVENT = 'uniplan:sky'
/** Dự phòng khi localStorage bị chặn: giữ lựa chọn đến khi tải lại trang */
let memory: boolean | null = null

function read(): boolean {
  if (memory !== null) return memory
  try {
    return localStorage.getItem(KEY) !== '0'
  } catch {
    return true
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange)
  window.addEventListener('storage', onChange) // đồng bộ giữa các tab
  return () => {
    window.removeEventListener(EVENT, onChange)
    window.removeEventListener('storage', onChange)
  }
}

export function useSkyEnabled(): [boolean, (enabled: boolean) => void] {
  const enabled = useSyncExternalStore(subscribe, read, () => true)
  const set = useCallback((next: boolean) => {
    memory = next
    try {
      localStorage.setItem(KEY, next ? '1' : '0')
    } catch {
      // không lưu được → chỉ có hiệu lực đến khi tải lại trang
    }
    window.dispatchEvent(new Event(EVENT))
  }, [])
  return [enabled, set]
}
