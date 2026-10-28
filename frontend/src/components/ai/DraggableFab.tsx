import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { clampPixels, fromPixels, loadFabPos, saveFabPos, toPixels, type FabBounds, type FabPos } from '../../lib/fabPosition'

interface Props {
  label: string
  title?: string
  onClick: () => void
  /** Ẩn bằng hiệu ứng thu nhỏ (vd. khi khung chat đang mở) thay vì gỡ khỏi trang */
  hidden?: boolean
  children: ReactNode
}

const MARGIN = 16
/** Quãng kéo tối thiểu (px) để coi là kéo thay vì bấm */
const DRAG_THRESHOLD = 6
/** Bước di chuyển khi dùng phím mũi tên (px) */
const KEY_STEP = 48

/**
 * Nút nổi kéo thả được. Kéo đi đâu cũng được; thả ra thì tự dính vào mép trái hoặc phải gần nhất
 * (giữ nguyên độ cao). Bấm nhẹ (không kéo) thì mở như nút thường. Nhớ vị trí trên thiết bị.
 * Bàn phím: tập trung vào nút rồi dùng phím mũi tên để chuyển mép / nhích lên xuống, Enter để mở.
 */
export default function DraggableFab({ label, title, onClick, hidden = false, children }: Props) {
  const ref = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState<FabPos>(loadFabPos)
  const [bounds, setBounds] = useState<FabBounds | null>(null)
  const [drag, setDrag] = useState<{ left: number; top: number } | null>(null)
  const gesture = useRef<{ id: number; startX: number; startY: number; originLeft: number; originTop: number; moved: boolean } | null>(null)
  const justDragged = useRef(false)

  /** Vùng cho phép: dưới thanh tiêu đề, trên thanh điều hướng dưới (điện thoại) */
  const measure = useCallback((): FabBounds => {
    const size = ref.current?.offsetWidth ?? 56
    const height = window.innerHeight
    const header = document.querySelector('header')
    const nav = document.querySelector('nav[aria-label="Điều hướng nhanh"]')
    const navTop = nav && nav.getBoundingClientRect().height > 0 ? nav.getBoundingClientRect().top : height
    return {
      width: document.documentElement.clientWidth,
      top: Math.max(MARGIN, (header ? header.getBoundingClientRect().bottom : 0) + 8),
      bottom: Math.min(height, navTop) - MARGIN,
      size,
      margin: MARGIN,
    }
  }, [])

  // Đo trước khi vẽ (không nháy vị trí), đo lại khi đổi kích thước / xoay màn hình
  useLayoutEffect(() => {
    const update = () => setBounds(measure())
    update()
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
    }
  }, [measure])

  // Có thể bị chọn lại vị trí ở tab khác
  useEffect(() => {
    const onStorage = (e: StorageEvent) => e.key === 'uniplan.ai-fab' && setPos(loadFabPos())
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const commit = (next: FabPos) => {
    setPos(next)
    saveFabPos(next)
  }

  function onPointerDown(e: PointerEvent<HTMLButtonElement>) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    // Nút có thể đang phóng to khi rê chuột (hover:scale): lấy vị trí GỐC (chưa phóng) từ tâm hình chữ nhật
    const rect = e.currentTarget.getBoundingClientRect()
    const size = e.currentTarget.offsetWidth
    gesture.current = {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originLeft: rect.left + rect.width / 2 - size / 2,
      originTop: rect.top + rect.height / 2 - size / 2,
      moved: false,
    }
    // Chuột / bút: giữ sự kiện khi con trỏ ra ngoài nút. Cảm ứng đã tự bám theo nút từ lúc chạm; gọi thêm ở đây làm trình duyệt bỏ sự kiện click sau khi vuốt.
    if (e.pointerType !== 'touch') e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: PointerEvent<HTMLButtonElement>) {
    const g = gesture.current
    if (!g || g.id !== e.pointerId) return
    const dx = e.clientX - g.startX
    const dy = e.clientY - g.startY
    if (!g.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
    g.moved = true
    setDrag(clampPixels(g.originLeft + dx, g.originTop + dy, measure()))
  }

  function endGesture(e: PointerEvent<HTMLButtonElement>, cancelled: boolean) {
    const g = gesture.current
    if (!g || g.id !== e.pointerId) return
    gesture.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    if (!g.moved) return // chỉ là một cú bấm: để onClick xử lý
    // Sau khi kéo trình duyệt vẫn bắn "click": bỏ qua để không mở khung chat
    justDragged.current = true
    setTimeout(() => (justDragged.current = false), 0)
    const b = measure()
    const live = clampPixels(g.originLeft + (e.clientX - g.startX), g.originTop + (e.clientY - g.startY), b)
    setDrag(null)
    if (!cancelled) commit(fromPixels(live.left, live.top, b))
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    const b = measure()
    const range = Math.max(1, b.bottom - b.top - b.size)
    if (e.key === 'ArrowLeft') commit({ ...pos, side: 'left' })
    else if (e.key === 'ArrowRight') commit({ ...pos, side: 'right' })
    else if (e.key === 'ArrowUp') commit({ ...pos, y: Math.max(0, pos.y - KEY_STEP / range) })
    else if (e.key === 'ArrowDown') commit({ ...pos, y: Math.min(1, pos.y + KEY_STEP / range) })
    else return
    e.preventDefault()
  }

  const place = drag ?? (bounds ? toPixels(pos, bounds) : null)

  return (
    <button
      ref={ref}
      type="button"
      onClick={() => {
        if (!justDragged.current) onClick()
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => endGesture(e, false)}
      onPointerCancel={(e) => endGesture(e, true)}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
      aria-label={label}
      aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown"
      title={title}
      aria-hidden={hidden}
      inert={hidden}
      style={place ? { left: place.left, top: place.top } : undefined}
      className={cn(
        'fixed z-40 flex h-14 w-14 touch-none select-none items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-600 text-white shadow-lg shadow-brand-500/40',
        'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/40',
        // Dính mép bằng hiệu ứng trượt; đang kéo thì bám sát ngón tay (không trễ)
        drag ? 'scale-110 cursor-grabbing shadow-xl transition-none' : 'cursor-grab transition-[left,top,transform,box-shadow,opacity] duration-200 ease-out hover:scale-105',
        hidden && 'pointer-events-none scale-50 opacity-0 hover:scale-50',
        !place && 'invisible',
      )}
    >
      {children}
    </button>
  )
}
