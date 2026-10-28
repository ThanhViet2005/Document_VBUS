import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { TriangleAlert } from 'lucide-react'
import Modal from './Modal'
import { Button } from './Form'

export interface ConfirmOptions {
  title: string
  /** Hậu quả của thao tác, viết rõ để người dùng không bấm theo phản xạ */
  message?: ReactNode
  /** Chữ trên nút xác nhận, nêu đúng hành động (vd "Xóa môn PRF192"), không dùng "OK" */
  confirmLabel: string
  cancelLabel?: string
  /** true (mặc định): nút đỏ cho thao tác mất dữ liệu; false: nút cam cho thao tác thường (vd mở khóa tài khoản) */
  destructive?: boolean
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

/**
 * Hộp xác nhận cùng giao diện app, thay window.confirm (hộp xám của trình duyệt, iOS còn hiện tên miền).
 * Dùng: `if (!(await confirm({ title, confirmLabel }))) return`. Nút "Hủy" được focus sẵn nên Enter nhầm không xóa dữ liệu.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const resolveRef = useRef<((ok: boolean) => void) | null>(null)

  const confirm = useCallback<ConfirmFn>((next) => {
    resolveRef.current?.(false)
    setOptions(next)
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve
    })
  }, [])

  function close(ok: boolean) {
    resolveRef.current?.(ok)
    resolveRef.current = null
    setOptions(null)
  }

  const destructive = options?.destructive ?? true

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={options !== null}
        title={options?.title ?? ''}
        onClose={() => close(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => close(false)} data-autofocus>
              {options?.cancelLabel ?? 'Hủy'}
            </Button>
            <Button variant={destructive ? 'destructive' : 'primary'} onClick={() => close(true)}>
              {options?.confirmLabel}
            </Button>
          </>
        }
      >
        <div className="flex items-start gap-3">
          {destructive && (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600" aria-hidden>
              <TriangleAlert className="h-5 w-5" />
            </span>
          )}
          <div className="pt-0.5 text-sm leading-relaxed text-slate-600">{options?.message ?? 'Thao tác này không hoàn tác được.'}</div>
        </div>
      </Modal>
    </ConfirmContext.Provider>
  )
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm phải dùng bên trong <ConfirmProvider>')
  return ctx
}
