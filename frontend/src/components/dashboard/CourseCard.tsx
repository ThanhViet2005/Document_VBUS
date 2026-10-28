import type { Course } from '../../types'
import { cn } from '../../lib/cn'
import { courseColor } from '../../lib/labels'
import ProgressBar from '../ui/ProgressBar'

interface CourseCardProps {
  course: Course
  taskCount: number
  progress: number
}

export default function CourseCard({ course, taskCount, progress }: CourseCardProps) {
  const color = courseColor(course)

  return (
    <article className="surface-card lift group relative overflow-hidden p-5">
      <div className={cn('absolute inset-x-0 top-0 h-1.5 transition-[height] duration-200 group-hover:h-2', color.bar)} />

      <div className="flex items-start justify-between gap-2">
        <span className={cn('rounded-lg px-2.5 py-1 text-sm font-bold', color.soft, color.text)}>{course.code}</span>
        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">{course.blockName}</span>
      </div>

      <h3 className="mt-3 line-clamp-2 min-h-10 text-sm font-semibold leading-snug text-slate-800">{course.name}</h3>

      <div className="mt-4 flex items-center justify-between text-xs">
        <span className="text-slate-500">{taskCount} NV</span>
        <span className={cn('font-bold', color.text)}>{progress}%</span>
      </div>
      <ProgressBar value={progress} barClassName={color.bar} className="mt-1.5" />
    </article>
  )
}
