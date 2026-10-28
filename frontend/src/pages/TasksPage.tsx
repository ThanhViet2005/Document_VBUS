import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BarChart3, ListTodo, Plus, Search } from 'lucide-react'
import { useAppData } from '../store/AppData'
import { cn } from '../lib/cn'
import { TASK_TYPE_LABEL } from '../lib/labels'
import { overallProgress, urgencyOf, type Urgency } from '../lib/tasks'
import { useShareDeadline } from '../lib/useShareDeadline'
import type { DeadlineInput } from '../services/api'
import type { Deadline, TaskStatus, TaskType } from '../types'
import TaskBoardCard from '../components/tasks/TaskBoardCard'
import TaskForm, { blankDeadline } from '../components/tasks/TaskForm'
import { Button, EmptyState, inputClass } from '../components/ui/Form'
import { useToast } from '../components/ui/Toast'

type View = 'active' | 'urgent' | 'overdue' | 'done' | 'all'
const VIEWS: { key: View; label: string; match: (u: Urgency) => boolean; badge: string }[] = [
  { key: 'active', label: 'Đang mở', match: (u) => u !== 'done' && u !== 'overdue', badge: 'bg-brand-50 text-brand-700' },
  { key: 'urgent', label: 'Gấp trong 24h', match: (u) => u === 'urgent', badge: 'bg-red-50 text-red-600' },
  { key: 'overdue', label: 'Quá hạn', match: (u) => u === 'overdue', badge: 'bg-red-50 text-red-600' },
  { key: 'done', label: 'Hoàn thành', match: (u) => u === 'done', badge: 'bg-emerald-50 text-emerald-700' },
  { key: 'all', label: 'Tất cả', match: () => true, badge: 'bg-slate-100 text-slate-600' },
]

/** Tab mặc định chứa 1 nhiệm vụ (dùng khi mở ?task=<id> mà tab hiện tại không có nhiệm vụ đó) */
const viewOf = (u: Urgency): View => (u === 'overdue' ? 'overdue' : u === 'done' ? 'done' : 'active')

/** Việc quá hạn / gấp lên đầu, cùng mức thì hạn sớm trước. Việc đã xong: mới nhất trước */
const URGENCY_RANK: Record<Urgency, number> = { overdue: 0, urgent: 1, soon: 2, normal: 3, done: 4 }

const selectClass = cn(inputClass, 'cursor-pointer bg-slate-50 font-medium')
const EMPTY_IDS: ReadonlySet<string> = new Set()

export default function TasksPage() {
  const { status, deadlines, courses, groups, courseById, groupById, setTaskStatus, toggleSubtask } = useAppData()
  const toast = useToast()
  const { share } = useShareDeadline()
  const [params, setParams] = useSearchParams()
  const [editing, setEditing] = useState<DeadlineInput | null>(null)
  const [query, setQuery] = useState('')

  const view = (VIEWS.find((v) => v.key === params.get('view'))?.key ?? 'active') as View
  const courseId = params.get('course') ?? ''
  const groupId = params.get('group') ?? ''
  const type = (params.get('type') ?? '') as TaskType | ''
  // ?task=<id>: nhiệm vụ người dùng bấm "Xem" từ thông báo, trợ lý AI, Kế hoạch học... → bọc viền và cuộn tới
  const focusId = params.get('task')

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    // Đổi tab / bộ lọc là người dùng đã chuyển sang việc khác → bỏ đánh dấu
    next.delete('task')
    setParams(next, { replace: true })
  }
  const clearFocus = () => {
    const next = new URLSearchParams(params)
    next.delete('task')
    setParams(next, { replace: true })
  }

  // Mở bằng ?task=<id>: chuyển sang tab chứa nhiệm vụ và bỏ bộ lọc đang che nó, để thẻ chắc chắn hiện ra
  useEffect(() => {
    if (!focusId || status === 'loading') return
    const target = deadlines.find((d) => d.id === focusId)
    if (!target) {
      toast.info('Nhiệm vụ này không còn tồn tại hoặc bạn không còn quyền xem.')
      clearFocus()
      return
    }
    const u = urgencyOf(target)
    const currentMatch = VIEWS.find((v) => v.key === view)!.match(u)
    const hiddenByFilter =
      (courseId && target.courseId !== courseId) ||
      (groupId && (groupId === 'personal' ? Boolean(target.groupId) : target.groupId !== groupId)) ||
      (type && target.taskType !== type)
    if (currentMatch && !hiddenByFilter) return
    const next = new URLSearchParams({ task: focusId })
    const v = viewOf(u)
    if (v !== 'active') next.set('view', v)
    setParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ chạy lại khi đổi nhiệm vụ cần xem hoặc dữ liệu vừa tải xong
  }, [focusId, status, deadlines])

  useEffect(() => {
    if (focusId) setQuery('')
  }, [focusId])

  const counts = useMemo(() => {
    const c: Record<View, number> = { active: 0, urgent: 0, overdue: 0, done: 0, all: deadlines.length }
    for (const d of deadlines) {
      const u = urgencyOf(d)
      for (const v of VIEWS) if (v.key !== 'all' && v.match(u)) c[v.key]++
    }
    return c
  }, [deadlines])

  const progress = useMemo(() => overallProgress(deadlines), [deadlines])

  // Thẻ người dùng vừa thao tác (tick bước nhỏ / đổi trạng thái): GIỮ NGUYÊN CHỖ trong danh sách dù trạng thái đã đổi
  // (vd tick đủ → "Hoàn thành" nhưng vẫn ở tab "Đang mở"), để các thẻ không nhảy chỗ khi đang thao tác.
  // Đổi tab / bộ lọc / từ khóa thì danh sách mới được lọc + sắp xếp lại bình thường.
  const filterKey = `${view}|${courseId}|${groupId}|${type}|${query.trim().toLowerCase()}`
  const [touched, setTouched] = useState<{ key: string; ids: Set<string> }>({ key: filterKey, ids: new Set() })
  const touchedIds = touched.key === filterKey ? touched.ids : EMPTY_IDS
  // Đổi tab / bộ lọc / từ khóa → bỏ danh sách "đang thao tác" (quay lại tab cũ cũng lọc lại từ đầu)
  useEffect(() => {
    setTouched((t) => (t.key === filterKey ? t : { key: filterKey, ids: new Set() }))
  }, [filterKey])
  const markTouched = (id: string) =>
    setTouched((t) => (t.key === filterKey && t.ids.has(id) ? t : { key: filterKey, ids: new Set([...(t.key === filterKey ? t.ids : []), id]) }))
  /** Thứ tự đang hiển thị (để giữ vị trí các thẻ khi dữ liệu đổi trong lúc thao tác) */
  const orderRef = useRef<{ key: string; ids: string[] }>({ key: '', ids: [] })

  const filtered = useMemo(() => {
    const match = VIEWS.find((v) => v.key === view)!.match
    const q = query.trim().toLowerCase()
    const sorted = deadlines
      .map((d) => ({ d, u: urgencyOf(d) }))
      .filter(
        ({ d, u }) =>
          (match(u) || touchedIds.has(d.id)) &&
          (!courseId || d.courseId === courseId) &&
          (!groupId || (groupId === 'personal' ? !d.groupId : d.groupId === groupId)) &&
          (!type || d.taskType === type) &&
          (!q ||
            d.title.toLowerCase().includes(q) ||
            d.notes?.toLowerCase().includes(q) ||
            courseById(d.courseId)?.code.toLowerCase().includes(q)),
      )
      .sort((a, b) => {
        if (a.u !== b.u) return URGENCY_RANK[a.u] - URGENCY_RANK[b.u]
        const diff = new Date(a.d.dueDate).getTime() - new Date(b.d.dueDate).getTime()
        return a.u === 'done' ? -diff : diff
      })
      .map(({ d }) => d)

    // Chưa thao tác gì (hoặc vừa đổi bộ lọc): sắp xếp bình thường
    const prev = orderRef.current
    if (touchedIds.size === 0 || prev.key !== filterKey) {
      orderRef.current = { key: filterKey, ids: sorted.map((d) => d.id) }
      return sorted
    }
    // Đang thao tác: thẻ đã có giữ đúng thứ tự cũ, thẻ mới (vd vừa thêm) nối vào cuối
    const pos = new Map(prev.ids.map((id, i) => [id, i]))
    const kept = sorted.filter((d) => pos.has(d.id)).sort((a, b) => pos.get(a.id)! - pos.get(b.id)!)
    const result = [...kept, ...sorted.filter((d) => !pos.has(d.id))]
    orderRef.current = { key: filterKey, ids: result.map((d) => d.id) }
    return result
  }, [deadlines, view, courseId, groupId, type, query, courseById, touchedIds, filterKey])

  const open = (d: Deadline) =>
    setEditing({
      id: d.id,
      courseId: d.courseId,
      groupId: d.groupId,
      title: d.title,
      taskType: d.taskType,
      dueDate: d.dueDate,
      priority: d.priority,
      status: d.status,
      progressPercent: d.progressPercent,
      notes: d.notes ?? '',
      subtasks: d.subtasks,
    })

  const filtering = Boolean(courseId || groupId || type || query.trim())

  // Cuộn tới thẻ đang xem 1 lần mỗi khi mở nhiệm vụ mới (chờ thẻ có trong danh sách sau khi đổi tab)
  const scrolledTo = useRef<string | null>(null)
  const focusVisible = Boolean(focusId && filtered.some((d) => d.id === focusId))
  useEffect(() => {
    if (!focusId) {
      scrolledTo.current = null
      return
    }
    if (!focusVisible || scrolledTo.current === focusId) return
    scrolledTo.current = focusId
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    requestAnimationFrame(() => document.getElementById(`task-${focusId}`)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' }))
  }, [focusId, focusVisible])

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Button onClick={() => setEditing(blankDeadline({ courseId: courseId || null, groupId: groupId && groupId !== 'personal' ? groupId : null }))}>
          <Plus className="h-4 w-4" /> Thêm nhiệm vụ
        </Button>
      </div>

      {/* Thanh lọc: tab trạng thái + tiến độ kỳ học, bên dưới là tìm kiếm & bộ lọc */}
      <section className="rounded-2xl border border-slate-200 bg-surface p-3 sm:p-4 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 text-sm font-semibold sm:pb-0" role="tablist" aria-label="Lọc theo trạng thái">
            {VIEWS.map((v) => {
              const active = view === v.key
              return (
                <button
                  key={v.key}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setParam('view', v.key === 'active' ? '' : v.key)}
                  className={cn(
                    'inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 transition',
                    active ? 'bg-cta text-white shadow-md shadow-brand-500/30' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800',
                  )}
                >
                  {v.label}
                  <span className={cn('min-w-5 rounded-full px-1.5 text-center text-xs font-bold leading-5', active ? 'bg-white/25 text-white' : v.badge)}>
                    {counts[v.key]}
                  </span>
                </button>
              )
            })}
          </div>
          <p className="inline-flex items-center gap-2 text-sm text-slate-500">
            <BarChart3 className="h-4 w-4 text-brand-500" />
            Tiến độ kỳ học: <span className="font-bold text-slate-900">{progress}%</span> hoàn thành
          </p>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 border-t border-slate-100 pt-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
          <label className="relative sm:col-span-2 lg:col-span-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className={cn(inputClass, 'bg-slate-50 pl-9')}
              placeholder="Tìm theo tên bài, mã môn, ghi chú…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Tìm nhiệm vụ"
            />
          </label>
          <select className={selectClass} value={courseId} onChange={(e) => setParam('course', e.target.value)} aria-label="Lọc theo môn">
            <option value="">Tất cả môn ({courses.length} môn)</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>{c.code} · {c.name}</option>
            ))}
          </select>
          <select className={selectClass} value={groupId} onChange={(e) => setParam('group', e.target.value)} aria-label="Lọc cá nhân / nhóm">
            <option value="">Cá nhân & nhóm</option>
            <option value="personal">Chỉ cá nhân</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
          <select className={selectClass} value={type} onChange={(e) => setParam('type', e.target.value)} aria-label="Lọc theo loại">
            <option value="">Mọi loại bài tập</option>
            {(Object.keys(TASK_TYPE_LABEL) as TaskType[]).map((t) => (
              <option key={t} value={t}>{TASK_TYPE_LABEL[t]}</option>
            ))}
          </select>
        </div>
      </section>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<ListTodo className="h-6 w-6" />}
          title={deadlines.length === 0 ? 'Chưa có nhiệm vụ nào' : 'Không có nhiệm vụ phù hợp'}
          text={deadlines.length === 0 ? 'Thêm assignment, lab, practical… kèm hạn nộp và các bước nhỏ.' : filtering ? 'Thử đổi bộ lọc hoặc từ khóa.' : 'Tab này đang trống.'}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {filtered.map((d) => (
            <TaskBoardCard
              key={d.id}
              task={d}
              course={courseById(d.courseId)}
              group={groupById(d.groupId)}
              onStatusChange={(s: TaskStatus) => {
                markTouched(d.id)
                setTaskStatus(d.id, s)
              }}
              onToggleSubtask={(id) => {
                markTouched(d.id)
                // Tick bước cuối cùng → nhiệm vụ tự "Hoàn thành": báo cho người dùng biết (thẻ vẫn ở nguyên chỗ)
                const sub = d.subtasks.find((x) => x.id === id)
                if (sub && !sub.isCompleted && d.status !== 'done' && d.subtasks.every((x) => x.id === id || x.isCompleted)) {
                  toast.success(`Đã hoàn thành "${d.title}" 🎉`)
                }
                toggleSubtask(d.id, id)
              }}
              onOpen={() => open(d)}
              onShare={() => void share(d.id)}
              highlighted={d.id === focusId}
              onClearHighlight={clearFocus}
            />
          ))}
        </div>
      )}

      {editing && <TaskForm initial={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
