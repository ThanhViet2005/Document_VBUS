import { useId, useMemo, useState } from 'react'
import { Check, Search } from 'lucide-react'
import { cn } from '../../lib/cn'
import { fold, searchCatalog } from '../../lib/courseCatalog'
import type { CatalogCourse } from '../../data/fptCourses'
import { inputClass } from '../ui/Form'

/**
 * Ô tìm môn trong danh mục FPT: gõ mã hoặc tên (có dấu / không dấu đều được) → chọn → điền sẵn mã + tên vào form.
 * Danh sách hiện ngay dưới ô (không nổi đè) để không bị cắt trong Modal cuộn. Bàn phím: ↑ ↓ chọn, Enter điền, Esc đóng.
 * ownedCodes: mã môn người dùng đã có → nhãn "Đã có" (vẫn chọn được, vd học lại ở học kỳ khác).
 * Màu: nền trung tính như các ô khác của form; cam chỉ dùng cho mã môn và dòng đang chọn.
 */
export default function CatalogPicker({ ownedCodes, onPick }: { ownedCodes: Set<string>; onPick: (c: CatalogCourse) => void }) {
  const id = useId()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const results = useMemo(() => searchCatalog(query, 8), [query])

  function pick(c: CatalogCourse) {
    onPick(c)
    setQuery('')
    setOpen(false)
  }

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
        <input
          id={`${id}-q`}
          role="combobox"
          aria-label="Tìm môn trong danh mục FPT"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={open && results[active] ? `${id}-opt-${active}` : undefined}
          autoComplete="off"
          className={cn(inputClass, 'pl-9')}
          placeholder="Tìm theo mã hoặc tên môn"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          // Trễ một chút để kịp nhận cú bấm vào danh sách
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setOpen(true)
              setActive((i) => Math.min(i + 1, results.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((i) => Math.max(i - 1, 0))
            } else if (e.key === 'Enter' && open && results[active]) {
              // Không gửi form khi đang chọn môn
              e.preventDefault()
              pick(results[active])
            } else if (e.key === 'Escape' && open) {
              e.stopPropagation()
              setOpen(false)
            }
          }}
        />
      </div>

      {open && (
        <ul
          id={`${id}-list`}
          role="listbox"
          aria-label="Môn trong danh mục FPT"
          className="mt-2 max-h-60 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200 bg-surface shadow-card [scrollbar-color:var(--color-slate-300)_transparent] [scrollbar-width:thin]"
        >
          {results.length === 0 ? (
            <li className="px-3 py-4 text-center text-sm text-slate-500">
              Không có môn khớp "{query.trim()}". Bạn cứ nhập mã và tên môn ở phần 2.
            </li>
          ) : (
            results.map((c, i) => {
              const owned = ownedCodes.has(fold(c.code))
              const isActive = i === active
              return (
                <li
                  key={c.code}
                  id={`${id}-opt-${i}`}
                  role="option"
                  aria-selected={isActive}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(c)}
                  onMouseEnter={() => setActive(i)}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 px-3 py-2.5',
                    // Dòng đang chọn: nền cam rất nhạt + vạch cam bên trái (cùng tông với nút / tab đang chọn của app)
                    isActive && 'bg-brand-50 shadow-[inset_3px_0_0_#f97316]',
                  )}
                >
                  <span className="text-data w-24 shrink-0 break-all rounded-md bg-brand-50 px-2 py-1 text-center text-xs font-bold text-brand-600 ring-1 ring-inset ring-brand-200">
                    {c.code}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold leading-snug text-slate-900">{c.name}</span>
                    {c.nameVi && <span className="block text-xs leading-snug text-slate-500">{c.nameVi}</span>}
                  </span>
                  {owned && (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                      <Check className="h-3 w-3" /> Đã có
                    </span>
                  )}
                </li>
              )
            })
          )}
        </ul>
      )}
    </div>
  )
}
