import { Moon, Sun } from 'lucide-react'
import { cn } from '../../lib/cn'
import { useTheme } from '../../lib/theme'

/** Nút nhanh đổi sáng / tối (đảo giao diện đang hiển thị và ghi nhớ). Cài đặt → Giao diện có thêm "Theo hệ thống". */
export default function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme()
  const dark = theme === 'dark'
  return (
    <button
      type="button"
      onClick={toggle}
      className={cn('rounded-xl border border-slate-200 bg-surface p-2.5 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900', className)}
      aria-label={dark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
      title={dark ? 'Giao diện sáng' : 'Giao diện tối'}
    >
      {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </button>
  )
}
