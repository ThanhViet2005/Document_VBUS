import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, CalendarDays, CircleCheck, Clock, Plus, RotateCw, TriangleAlert, X } from 'lucide-react'
import { EmptyState } from '../components/ui/Form'
import { useAppData } from '../store/AppData'
import { isoDayOfWeek, WEEKDAY_SHORT } from '../lib/date'
import { groupByBucket, overallProgress, UPCOMING_DAYS, weeklyProgress } from '../lib/tasks'
import HeroBanner from '../components/dashboard/HeroBanner'
import StatTile from '../components/ui/StatTile'
import WeeklyProgressChart from '../components/dashboard/WeeklyProgressChart'
import { occursOn } from '../lib/schedule'
import TodaySchedule from '../components/dashboard/TodaySchedule'
import TaskListSection from '../components/dashboard/TaskListSection'
import CourseCard from '../components/dashboard/CourseCard'

export default function DashboardPage() {
  const { status, error, user, deadlines, courses, schedules, courseById, reload, dismissError } = useAppData()

  const groups = useMemo(() => groupByBucket(deadlines), [deadlines])
  const weekly = useMemo(() => weeklyProgress(deadlines, WEEKDAY_SHORT), [deadlines])
  const progress = overallProgress(deadlines)

  const todayClasses = useMemo(() => {
    const today = new Date()
    const dow = isoDayOfWeek(today)
    return schedules.filter((s) => occursOn(s, today, dow)).sort((a, b) => a.startTime.localeCompare(b.startTime))
  }, [schedules])

  // Lưới chỉ hiện môn của mình (môn của nhóm do bạn khác tạo vẫn dùng để gắn tag)
  const myCourses = useMemo(() => courses.filter((c) => c.userId === user.id), [courses, user.id])
  const semesterLabel = useMemo(() => {
    const semesters = [...new Set(myCourses.map((c) => c.semester).filter(Boolean))]
    return [semesters.join(', '), 'Block 1, 2 & 3'].filter(Boolean).join(' · ')
  }, [myCourses])

  if (status === 'loading') return <DashboardSkeleton />

  if (status === 'error' && deadlines.length === 0 && courses.length === 0) {
    return (
      <div className="flex flex-col items-center rounded-2xl border border-red-200 bg-red-50 px-6 py-14 text-center">
        <TriangleAlert className="h-10 w-10 text-red-500" />
        <h2 className="mt-3 text-lg font-bold text-slate-900">Không tải được dữ liệu</h2>
        <p className="mt-1 max-w-md text-sm text-slate-600">{error}</p>
        <button onClick={reload} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-cta px-4 py-2 text-sm font-semibold text-white hover:bg-cta-hover">
          <RotateCw className="h-4 w-4" /> Thử lại
        </button>
      </div>
    )
  }

  return (
    // stagger: các khối hiện lần lượt khi mở trang (tắt khi bật "Giảm chuyển động")
    <div className="stagger space-y-6">
      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="flex-1">{error}</p>
          <button onClick={dismissError} aria-label="Đóng" className="text-red-400 hover:text-red-600">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <HeroBanner name={user.fullName || user.email} todayCount={groups.today.length} overdueCount={groups.overdue.length} progress={progress} />

      {/* Bấm thẻ → trang Nhiệm vụ đúng tab */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatTile to="/tasks?view=urgent" label="Hôm nay" value={groups.today.length} unit="việc" hint="Đến hạn hôm nay" icon={CalendarDays} tone="orange" />
        <StatTile to="/tasks" label="Sắp đến hạn" value={groups.upcoming.length} unit="việc" hint={`Trong ${UPCOMING_DAYS} ngày tới`} icon={Clock} tone="blue" />
        <StatTile
          to="/tasks?view=overdue"
          label="Quá hạn"
          value={groups.overdue.length}
          unit="việc"
          hint={groups.overdue.length ? 'Cần xử lý ngay' : 'Không có gì quá hạn'}
          icon={TriangleAlert}
          tone={groups.overdue.length ? 'red' : 'green'}
        />
        <StatTile
          to="/tasks?view=done"
          label="Hoàn thành"
          value={groups.done.length}
          unit={`/ ${deadlines.length} việc`}
          progress={deadlines.length ? Math.round((groups.done.length / deadlines.length) * 100) : 0}
          hint={`${progress}% tổng tiến độ`}
          icon={CircleCheck}
          tone="green"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:gap-6 xl:grid-cols-3">
        <WeeklyProgressChart data={weekly} />
        <TodaySchedule items={todayClasses} courseById={courseById} />
      </div>

      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
        <TaskListSection title="Nhiệm vụ hôm nay" icon={CalendarDays} iconClassName="bg-orange-50 text-orange-500" tasks={groups.today} emptyText="Không có nhiệm vụ hôm nay" />
        <TaskListSection title="Sắp đến hạn" icon={Clock} iconClassName="bg-blue-50 text-blue-500" tasks={groups.upcoming} emptyText="Không có nhiệm vụ sắp đến hạn" />
        <TaskListSection title="Quá hạn" icon={TriangleAlert} iconClassName="bg-red-50 text-red-500" tasks={groups.overdue} emptyText="Tuyệt vời, không có gì quá hạn!" />
      </div>

      <section>
        <div className="mb-4">
          <h2 className="text-lg font-extrabold tracking-tight text-slate-900">Môn học của <span className="text-gradient">bạn</span></h2>
          <p className="text-sm text-slate-500">{semesterLabel}</p>
        </div>
        {myCourses.length === 0 ? (
          <EmptyState
            icon={<BookOpen className="h-6 w-6" />}
            title="Bạn chưa có môn học nào"
            text="Thêm các môn của Block 1, 2 & 3 để bắt đầu theo dõi lịch học và deadline."
            action={
              <Link to="/courses" className="inline-flex items-center gap-2 rounded-xl bg-cta px-4 py-2 text-sm font-semibold text-white shadow-cta transition hover:-translate-y-0.5 hover:bg-cta-hover active:scale-[0.97]">
                <Plus className="h-4 w-4" /> Thêm môn học
              </Link>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {myCourses.map((c) => {
              const tasks = deadlines.filter((d) => d.courseId === c.id)
              return <CourseCard key={c.id} course={c} taskCount={tasks.length} progress={overallProgress(tasks)} />
            })}
          </div>
        )}
      </section>
    </div>
  )
}

function DashboardSkeleton() {
  const block = 'animate-pulse rounded-2xl bg-slate-200/70'
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Đang tải">
      <div className={`${block} h-36`} />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => <div key={i} className={`${block} h-24`} />)}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:gap-6 xl:grid-cols-3">
        <div className={`${block} h-80 lg:col-span-2`} />
        <div className={`${block} h-80`} />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => <div key={i} className={`${block} h-56`} />)}
      </div>
    </div>
  )
}
