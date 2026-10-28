import { cn } from '../../lib/cn'

interface AvatarProps {
  name: string
  src?: string
  className?: string
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  const last = parts[parts.length - 1] ?? ''
  const first = parts.length > 1 ? parts[0] : ''
  return (first.charAt(0) + last.charAt(0)).toUpperCase()
}

export default function Avatar({ name, src, className }: AvatarProps) {
  if (src) return <img src={src} alt={name} className={cn('h-10 w-10 shrink-0 rounded-full object-cover', className)} />
  return (
    <div
      className={cn(
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-600 text-sm font-bold text-white',
        className,
      )}
      aria-label={name}
    >
      {initials(name)}
    </div>
  )
}
