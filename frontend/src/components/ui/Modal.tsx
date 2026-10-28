import { useEffect, useId, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '../../lib/cn'

interface ModalProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  size?: 'md' | 'lg'
}

/** Các modal đang mở, theo thứ tự mở. Chỉ modal trên cùng nhận phím Esc / Tab (vd hộp xác nhận xóa mở trên form) */
const openStack: symbol[] = []

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export default function Modal({ open, title, onClose, children, footer, size = 'md' }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  // Giữ onClose trong ref: effect chỉ chạy khi mở/đóng, không chạy lại mỗi lần render (tránh giật focus khi gõ)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    const id = Symbol('modal')
    openStack.push(id)
    // Phần tử đã mở modal: đóng xong trả focus về đó để người dùng bàn phím không bị lạc
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null

    const onKey = (e: KeyboardEvent) => {
      if (openStack[openStack.length - 1] !== id) return
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current()
        return
      }
      // Giữ Tab vòng trong modal, không chạy ra trang phía sau
      if (e.key === 'Tab' && panelRef.current) {
        const items = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null)
        if (items.length === 0) return
        const first = items[0]
        const last = items[items.length - 1]
        const active = document.activeElement
        if (e.shiftKey && (active === first || !panelRef.current.contains(active))) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && (active === last || !panelRef.current.contains(active))) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // Focus ban đầu: phần tử có data-autofocus → ô nhập đầu tiên trong nội dung → phần tử bấm được đầu tiên trong nội dung → nút Đóng.
    // Không tự focus nút ở chân modal: nút đầu tiên ở đó thường là "Xóa", Enter nhầm sẽ mất dữ liệu.
    requestAnimationFrame(() => {
      const panel = panelRef.current
      if (!panel) return
      const target =
        panel.querySelector<HTMLElement>('[data-autofocus]') ??
        bodyRef.current?.querySelector<HTMLElement>('input:not([disabled]), select:not([disabled]), textarea:not([disabled])') ??
        bodyRef.current?.querySelector<HTMLElement>(FOCUSABLE) ??
        panel.querySelector<HTMLElement>(FOCUSABLE)
      target?.focus()
    })

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      const i = openStack.indexOf(id)
      if (i >= 0) openStack.splice(i, 1)
      if (opener?.isConnected) opener.focus()
    }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          'relative flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-surface shadow-xl sm:rounded-2xl',
          size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-lg',
        )}
      >
        <header className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 pl-5 pr-2">
          <h2 id={titleId} className="text-base font-bold text-slate-900">
            {title}
          </h2>
          {/* Vùng chạm 44px (WCAG 2.5.5), biểu tượng vẫn 20px */}
          <button onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-800" aria-label="Đóng">
            <X className="h-5 w-5" />
          </button>
        </header>
        <div ref={bodyRef} className="overflow-y-auto px-5 py-4">
          {children}
        </div>
        {footer && <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-3">{footer}</footer>}
      </div>
    </div>
  )
}
