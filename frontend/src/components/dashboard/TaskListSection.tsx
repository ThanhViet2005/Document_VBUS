import { useNavigate } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import type { Deadline } from '../../types'
import { useAppData } from '../../store/AppData'
import { cn } from '../../lib/cn'
import TaskCard from './TaskCard'

interface TaskListSectionProps {
  title: string
  icon: LucideIcon
  iconClassName: string
  tasks: Deadline[]
  emptyText: string
}

export default function TaskListSection({ title, icon: Icon, iconClassName, tasks, emptyText }: TaskListSectionProps) {
  const { courseById, setTaskStatus } = useAppData()
  const navigate = useNavigate()

  return (
    <section className="flex flex-col rounded-card border border-slate-200 bg-slate-50/60 p-4">
      <header className="mb-3 flex items-center gap-2">
        <span className={cn('flex h-8 w-8 items-center justify-center rounded-xl', iconClassName)}>
          <Icon className="h-4 w-4" />
        </span>
        <h2 className="flex-1 font-extrabold tracking-tight text-slate-900">{title}</h2>
        <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-semibold text-slate-500 ring-1 ring-slate-200">{tasks.length}</span>
      </header>

      <div className="space-y-3">
        {tasks.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 bg-surface py-8 text-center text-sm text-slate-500">{emptyText}</p>
        ) : (
          tasks.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              course={courseById(t.courseId)}
              onStatusChange={(s) => setTaskStatus(t.id, s)}
              // Bấm tên → trang Nhiệm vụ, thẻ này được bọc viền "Đang xem"
              onOpen={() => navigate(`/tasks?task=${t.id}`)}
            />
          ))
        )}
      </div>
    </section>
  )
}
