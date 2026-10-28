import { useCallback, useEffect, useSyncExternalStore, type RefObject } from 'react'

// Thu gọn thanh điều hướng trên laptop / PC (>= 1280px): chỉ còn biểu tượng.
// Đánh dấu bằng thuộc tính data-nav-collapsed trên <html> để CSS (biến thể nav-compact trong index.css)
// đổi cả thanh điều hướng lẫn phần lề của nội dung. public/theme-init.js đặt sẵn trước khi vẽ trang (không nháy).
// Trạng thái dùng chung cho mọi component (Sidebar: nút « », AppLayout: tự thu gọn khi bấm vào nội dung) qua useSyncExternalStore.

const STORAGE_KEY = 'uniplan.nav-collapsed'
const EVENT = 'uniplan:nav-collapsed'
/** Chỉ màn hình này mới có thanh đầy đủ (iPad luôn hẹp, điện thoại dùng thanh dưới) */
const WIDE_QUERY = '(min-width: 80rem)'

function read(): boolean {
  return document.documentElement.hasAttribute('data-nav-collapsed')
}

function subscribe(onChange: () => void) {
  // Đồng bộ giữa các tab
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY) return
    apply(e.newValue === '1')
    onChange()
  }
  window.addEventListener(EVENT, onChange)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(EVENT, onChange)
    window.removeEventListener('storage', onStorage)
  }
}

function apply(collapsed: boolean) {
  document.documentElement.toggleAttribute('data-nav-collapsed', collapsed)
}

export function setNavCollapsed(collapsed: boolean) {
  if (read() === collapsed) return
  apply(collapsed)
  try {
    localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0')
  } catch {
    // không lưu được → chỉ có hiệu lực đến khi tải lại trang
  }
  window.dispatchEvent(new Event(EVENT))
}

export function useNavCollapsed(): [boolean, () => void] {
  const collapsed = useSyncExternalStore(subscribe, read, () => false)
  const toggle = useCallback(() => setNavCollapsed(!read()), [])
  return [collapsed, toggle]
}

/**
 * Tự thu gọn thanh điều hướng khi người dùng bấm vào vùng nội dung (giống bấm nút «), để nhường chỗ cho nội dung.
 * Mở lại bằng nút » trên thanh. Chỉ áp dụng ở màn hình >= 1280px (nơi thanh đang mở rộng).
 * Gọi ở `click` (sau khi thao tác của người dùng đã xử lý xong), không ở `pointerdown`: thanh co lại làm nội dung trượt sang trái,
 * nếu co ngay lúc nhấn chuột thì phần tử dưới con trỏ đổi chỗ và cú bấm bị mất.
 * KHÔNG thu gọn khi bấm vào nút / ô tick / ô nhập / tab / liên kết: người dùng đang thao tác (vd tick nhiều bước nhỏ liên tiếp),
 * cả trang trượt ngang dưới con trỏ sẽ làm họ bấm nhầm. Chỉ thu gọn khi bấm vào vùng trống / chữ của trang.
 */
const INTERACTIVE = 'button, a, input, textarea, select, label, summary, [role="button"], [role="tab"], [role="switch"], [role="checkbox"], [role="option"], [contenteditable="true"]'

export function useAutoCollapseNav(contentRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    const wide = window.matchMedia(WIDE_QUERY)
    const onClick = (e: MouseEvent) => {
      if (!wide.matches || read()) return
      if (e.target instanceof Element && e.target.closest(INTERACTIVE)) return
      setNavCollapsed(true)
    }
    el.addEventListener('click', onClick)
    return () => el.removeEventListener('click', onClick)
  }, [contentRef])
}
