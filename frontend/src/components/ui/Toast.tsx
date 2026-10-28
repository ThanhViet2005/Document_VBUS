import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { CircleCheck, CircleX, Info } from 'lucide-react'
import { cn } from '../../lib/cn'

type Tone = 'success' | 'error' | 'info'
interface ToastItem {
  id: number
  tone: Tone
  message: string
}

interface ToastApi {
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)

const ICON = { success: CircleCheck, error: CircleX, info: Info }
const STYLE: Record<Tone, string> = {
  success: 'border-emerald-200 bg-surface text-emerald-700',
  error: 'border-red-200 bg-surface text-red-700',
  info: 'border-slate-200 bg-surface text-slate-700',
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const nextId = useRef(1)

  const push = useCallback((tone: Tone, message: string) => {
    const id = nextId.current++
    setItems((list) => [...list.slice(-3), { id, tone, message }])
    setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), tone === 'error' ? 6000 : 3500)
  }, [])

  const api = useMemo<ToastApi>(
    () => ({ success: (m) => push('success', m), error: (m) => push('error', m), info: (m) => push('info', m) }),
    [push],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-60 md:bottom-4 flex flex-col items-center gap-2 px-4" aria-live="polite">
        {items.map((t) => {
          const Icon = ICON[t.tone]
          return (
            <div key={t.id} className={cn('pointer-events-auto flex w-full max-w-sm items-start gap-2 rounded-xl border px-4 py-3 text-sm shadow-lg', STYLE[t.tone])}>
              <Icon className="mt-0.5 h-4 w-4 shrink-0" />
              <p className="flex-1">{t.message}</p>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast phải được dùng bên trong <ToastProvider>')
  return ctx
}
