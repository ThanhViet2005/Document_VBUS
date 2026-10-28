import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

interface CardProps {
  title?: ReactNode
  /** Biểu tượng nhỏ cạnh tiêu đề (vd <Clock className="h-4 w-4" />), nằm trong ô màu cam nhạt */
  icon?: ReactNode
  action?: ReactNode
  /** true: thẻ bấm được → nhấc lên khi rê chuột (tiện ích lift) */
  interactive?: boolean
  className?: string
  children: ReactNode
}

/** Khối nội dung chuẩn của app. Muốn thẻ mới đồng bộ giao diện, dùng component này thay vì tự viết class. Xem docs/DESIGN_SYSTEM.md */
export default function Card({ title, icon, action, interactive, className, children }: CardProps) {
  return (
    <section className={cn('surface-card p-5', interactive && 'lift', className)}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && (
            <h2 className="flex min-w-0 items-center gap-2 text-base font-extrabold tracking-tight text-slate-900">
              {icon && <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-500">{icon}</span>}
              <span className="truncate">{title}</span>
            </h2>
          )}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}
