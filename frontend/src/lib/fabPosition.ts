// Vị trí nút nổi (trợ lý AI): luôn dính mép TRÁI hoặc PHẢI, tự do theo chiều dọc.
// Lưu dạng (mép, tỉ lệ dọc 0..1) thay vì pixel để vẫn đúng khi xoay màn hình / đổi kích thước cửa sổ.

export type FabSide = 'left' | 'right'

export interface FabPos {
  side: FabSide
  /** 0 = sát đầu vùng cho phép, 1 = sát đáy */
  y: number
}

/** Vùng nút được phép nằm (pixel, tọa độ cửa sổ) */
export interface FabBounds {
  width: number
  /** Cạnh trên được phép (dưới thanh tiêu đề) */
  top: number
  /** Cạnh dưới được phép (trên thanh điều hướng dưới nếu có) */
  bottom: number
  /** Kích thước nút (vuông) */
  size: number
  /** Khoảng cách tới mép cửa sổ */
  margin: number
}

export const DEFAULT_FAB_POS: FabPos = { side: 'right', y: 1 }
const STORAGE_KEY = 'uniplan.ai-fab'

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

/** Tâm nút nằm nửa trái màn hình → mép trái, ngược lại → mép phải */
export function snapSide(left: number, bounds: Pick<FabBounds, 'width' | 'size'>): FabSide {
  return left + bounds.size / 2 < bounds.width / 2 ? 'left' : 'right'
}

/** Khoảng di chuyển được theo chiều dọc (không âm) */
function travel(b: FabBounds): number {
  return Math.max(0, b.bottom - b.top - b.size)
}

export function toPixels(pos: FabPos, b: FabBounds): { left: number; top: number } {
  return {
    left: pos.side === 'left' ? b.margin : b.width - b.size - b.margin,
    top: b.top + clamp(pos.y, 0, 1) * travel(b),
  }
}

/** Từ vị trí pixel (sau khi thả) → mép gần nhất + tỉ lệ dọc */
export function fromPixels(left: number, top: number, b: FabBounds): FabPos {
  const t = travel(b)
  return { side: snapSide(left, b), y: t === 0 ? 1 : clamp((top - b.top) / t, 0, 1) }
}

/** Giữ nút trong cửa sổ khi đang kéo (chưa dính mép) */
export function clampPixels(left: number, top: number, b: FabBounds): { left: number; top: number } {
  return {
    left: clamp(left, 0, Math.max(0, b.width - b.size)),
    top: clamp(top, b.top, b.top + travel(b)),
  }
}

export function loadFabPos(): FabPos {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_FAB_POS
    const v = JSON.parse(raw) as Partial<FabPos>
    if ((v.side === 'left' || v.side === 'right') && typeof v.y === 'number' && Number.isFinite(v.y)) return { side: v.side, y: clamp(v.y, 0, 1) }
  } catch {
    // storage bị chặn hoặc dữ liệu hỏng → vị trí mặc định
  }
  return DEFAULT_FAB_POS
}

export function saveFabPos(pos: FabPos) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ side: pos.side, y: Math.round(pos.y * 1000) / 1000 }))
  } catch {
    // không lưu được → chỉ có hiệu lực đến khi tải lại trang
  }
}
