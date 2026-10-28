import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { BookOpen, Bot, CalendarClock, CalendarRange, Check, CheckCheck, History, Loader2, MapPin, MessageSquare, Pencil, Search, SendHorizonal, Sparkles, SquarePen, Timer, Trash2, X } from 'lucide-react'
import { useAppData } from '../../store/AppData'
import { cn } from '../../lib/cn'
import { formatDateTime, WEEKDAY_LONG } from '../../lib/date'
import { COURSE_COLOR, courseColor, PRIORITY_LABEL, PRIORITY_STYLE, TASK_TYPE_LABEL } from '../../lib/labels'
import { parseQuickDeadline, type DeadlineDraft } from '../../lib/deadlineParser'
import { buildAgentContext, describeAction, fromLegacyDraft, toAgentActions, type AgentAction } from '../../lib/aiAgent'
import { loadFabPos, type FabSide } from '../../lib/fabPosition'
import { historyGroup, loadConversations, MAX_CONVERSATIONS, saveConversations, titleFrom, type StoredConversation } from '../../lib/chatHistory'
import { aiMode, chat, type ChatMessage } from '../../services/ai'
import type { CourseInput, DeadlineInput, ScheduleInput, StudySessionInput } from '../../services/api'
import type { Course } from '../../types'
import TaskForm from '../tasks/TaskForm'
import SessionForm from '../plan/SessionForm'
import ScheduleForm from '../calendar/ScheduleForm'
import CourseForm from '../courses/CourseForm'
import DraggableFab from './DraggableFab'
import { errorMessage } from '../ui/Form'
import { useConfirm } from '../ui/ConfirmDialog'

type DraftStatus = 'pending' | 'saving' | 'added' | 'dismissed'
/** Đề xuất của AI agent kèm trạng thái duyệt. Lịch sử cũ có thể còn DeadlineDraft (chỉ deadline) → đổi bằng fromLegacyDraft */
interface DraftState {
  draft: AgentAction | DeadlineDraft
  status: DraftStatus
  /** id bản ghi vừa tạo (deadline) để nút "Xem nhiệm vụ" mở đúng thẻ trên trang Nhiệm vụ */
  savedId?: string
}

/** Đang mở form để sửa 1 đề xuất trước khi lưu */
type Editing =
  | { messageId: string; index: number; form: 'task'; input: DeadlineInput }
  | { messageId: string; index: number; form: 'course'; input: CourseInput }
  | { messageId: string; index: number; form: 'schedule'; input: ScheduleInput }
  | { messageId: string; index: number; form: 'session'; input: StudySessionInput }

/** Đối chiếu trong 1 lần "Thêm tất cả": môn / deadline vừa tạo để các đề xuất sau gắn vào */
interface Batch {
  courses: Map<string, string>
  deadlines: Map<string, string>
}
const newBatch = (): Batch => ({ courses: new Map(), deadlines: new Map() })

const ACTION_LABEL: Record<AgentAction['kind'], string> = { task: 'deadline', course: 'môn học', schedule: 'lịch học', session: 'buổi tự học' }
const STATUS_TEXT: Record<DraftStatus, string> = { pending: 'chưa duyệt', saving: 'đang lưu', added: 'đã thêm', dismissed: 'người dùng bỏ qua' }
interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  drafts?: DraftState[]
  error?: boolean
}

type Conversation = StoredConversation<Message>

const HISTORY_FOR_AI = 12
const MAX_TITLE = 80
const MAX_INPUT = 1000
/** Ô nhập cao tối đa ~8 dòng (leading-6 = 24px/dòng), vượt quá thì cuộn bên trong ô */
const INPUT_MAX_HEIGHT = 192

const EXAMPLES = [
  'Thêm Lab 5 PRO192 thứ 6 23h59',
  'Lên kế hoạch học tập cho tuần này',
  'Thêm môn MAD101 Toán rời rạc vào Block 1',
  'Làm sao để dời lịch học sang tuần sau?',
]

const newId = () => crypto.randomUUID()

/** Đọc lịch sử của 1 tài khoản; thao tác đang lưu dở khi tải lại trang → coi như chưa xử lý */
function loadFor(userId: string): Conversation[] {
  return loadConversations<Message>(userId).map((c) => ({
    ...c,
    messages: c.messages.map((m) => ({ ...m, drafts: m.drafts?.map((d) => (d.status === 'saving' ? { ...d, status: 'pending' as const } : d)) })),
  }))
}

function toDeadlineInput(d: Extract<AgentAction, { kind: 'task' }>, courseId: string | null): DeadlineInput {
  return {
    courseId,
    groupId: null,
    title: d.title,
    taskType: d.taskType,
    dueDate: d.dueDate,
    priority: d.priority,
    status: 'todo',
    progressPercent: 0,
    notes: d.notes,
    subtasks: d.subtasks.map((title) => ({ id: crypto.randomUUID(), title, isCompleted: false })),
  }
}

/** Nút nổi + khung chat nổi bật ra từ góc có nút (luôn gắn trong DOM để giữ hội thoại và chạy hiệu ứng đóng / mở) */
export default function AiChat() {
  const [open, setOpen] = useState(false)
  const [side, setSide] = useState<FabSide>(() => loadFabPos().side)
  const close = useCallback(() => setOpen(false), [])
  return (
    <>
      <DraggableFab
        label="Mở trợ lý AI"
        title="Trợ lý AI (kéo để di chuyển)"
        hidden={open}
        onClick={() => {
          setSide(loadFabPos().side)
          setOpen(true)
        }}
      >
        <Sparkles className="h-6 w-6" />
      </DraggableFab>
      <ChatPanel open={open} side={side} onClose={close} />
    </>
  )
}

function ChatPanel({ open, side, onClose }: { open: boolean; side: FabSide; onClose: () => void }) {
  const app = useAppData()
  const { user, courses, deadlines, exams, schedules, studySessions, courseById, saveDeadline, saveCourse, saveSchedule, saveStudySession } = app
  const location = useLocation()
  // Lịch sử gắn với tài khoản đang đăng nhập: đổi tài khoản thì nạp lại (lưu kèm uid để không ghi nhầm sang tài khoản khác)
  const [store, setStore] = useState(() => ({ uid: user.id, list: loadFor(user.id) }))
  if (store.uid !== user.id) setStore({ uid: user.id, list: loadFor(user.id) })
  const conversations = store.uid === user.id ? store.list : []
  const setConversations = useCallback((fn: (list: Conversation[]) => Conversation[]) => setStore((s) => ({ ...s, list: fn(s.list) })), [])
  // null = cuộc trò chuyện mới, chưa gửi gì (chỉ tạo khi gửi tin đầu tiên)
  const [activeId, setActiveId] = useState<string | null>(null)
  const active = conversations.find((c) => c.id === activeId)
  const messages = useMemo(() => active?.messages ?? [], [active])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<Editing | null>(null)
  const mode = aiMode()
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Ô nhập tự cao lên theo nội dung (Shift + Enter xuống dòng) để thấy hết những gì đã gõ; tối đa INPUT_MAX_HEIGHT rồi mới cuộn bên trong.
  // useLayoutEffect: đo và đặt chiều cao trước khi vẽ nên không bị nháy. Gửi xong (input rỗng) tự thu về 1 dòng.
  useLayoutEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    const next = Math.min(el.scrollHeight, INPUT_MAX_HEIGHT)
    el.style.height = `${next}px`
    el.style.overflowY = el.scrollHeight > INPUT_MAX_HEIGHT ? 'auto' : 'hidden'
  }, [input])

  useEffect(() => saveConversations(store.uid, store.list), [store])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  /** Ghi vào đúng 1 cuộc trò chuyện (theo id, không theo cuộc đang mở: AI trả lời chậm mà người dùng đã chuyển sang cuộc khác) */
  const update = useCallback(
    (id: string, fn: (list: Message[]) => Message[]) =>
      setConversations((list) => list.map((c) => (c.id === id ? { ...c, messages: fn(c.messages), updatedAt: Date.now() } : c))),
    [setConversations],
  )

  function startNew() {
    setActiveId(null)
    setHistoryOpen(false)
    setInput('')
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  function openConversation(id: string) {
    setActiveId(id)
    setHistoryOpen(false)
  }

  function deleteConversation(id: string) {
    setConversations((list) => list.filter((c) => c.id !== id))
    if (id === activeId) setActiveId(null)
  }

  useEffect(() => {
    if (!open) return
    // Chờ khung bắt đầu hiện rồi mới focus, tránh trình duyệt cuộn giật khi đang trượt
    const t = setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 80)
    const onKey = (e: KeyboardEvent) => {
      // Đang mở form sửa deadline (modal khác) → để modal đó xử lý Esc; đang mở lịch sử thì Esc đóng lịch sử trước
      if (e.key !== 'Escape' || document.querySelectorAll('[role="dialog"][aria-modal="true"]').length > 0) return
      if (historyRef.current) setHistoryOpen(false)
      else onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(t)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])
  const historyRef = useRef(historyOpen)
  historyRef.current = historyOpen

  const updateDraft = useCallback(
    (messageId: string, index: number, status: DraftStatus, savedId?: string) => {
      setConversations((list) =>
        list.map((c) =>
          c.messages.some((m) => m.id === messageId)
            ? { ...c, messages: c.messages.map((m) => (m.id === messageId ? { ...m, drafts: m.drafts?.map((d, i) => (i === index ? { ...d, status, ...(savedId ? { savedId } : {}) } : d)) } : m)) }
            : c,
        ),
      )
    },
    [setConversations],
  )

  const norm = (d: DraftState['draft']) => fromLegacyDraft(d, courses)
  /** Mã môn → id: môn vừa tạo trong lần "Thêm tất cả" trước, rồi tới môn đã có */
  const courseIdOf = (code: string | null, batch: Batch) =>
    code ? (batch.courses.get(code.toLowerCase()) ?? courses.find((c) => c.code.toLowerCase() === code.toLowerCase())?.id ?? null) : null

  /** Lưu 1 đề xuất bằng đúng các hàm lưu của app (RLS của người dùng). Lỗi → ném ra để báo */
  async function execute(a: AgentAction, batch: Batch) {
    switch (a.kind) {
      case 'course': {
        const exists = courses.find((c) => c.userId === user.id && c.code.toLowerCase() === a.code.toLowerCase())
        if (exists) {
          batch.courses.set(a.code.toLowerCase(), exists.id)
          return
        }
        const saved = await saveCourse({ code: a.code, name: a.name, colorCode: a.colorCode, blockName: a.blockName, semester: a.semester })
        batch.courses.set(saved.code.toLowerCase(), saved.id)
        return
      }
      case 'schedule': {
        const courseId = courseIdOf(a.courseCode, batch)
        if (!courseId) throw new Error(`Chưa có môn ${a.courseCode}, hãy thêm môn trước`)
        await saveSchedule({ courseId, dayOfWeek: a.dayOfWeek, startTime: a.startTime, endTime: a.endTime, room: a.room, lecturer: a.lecturer, blockPeriod: a.blockPeriod })
        return
      }
      case 'task': {
        const saved = await saveDeadline(toDeadlineInput(a, courseIdOf(a.courseCode, batch)))
        batch.deadlines.set(saved.title.toLowerCase(), saved.id)
        return saved.id
      }
      case 'session': {
        const key = a.deadlineTitle?.toLowerCase()
        const deadlineId = key
          ? (batch.deadlines.get(key) ?? deadlines.find((d) => d.title.toLowerCase() === key)?.id ?? deadlines.find((d) => d.title.toLowerCase().includes(key))?.id ?? null)
          : null
        await saveStudySession({ title: a.title, courseId: courseIdOf(a.courseCode, batch), deadlineId, examId: null, startAt: a.startAt, endAt: a.endAt, isDone: false, notes: a.notes })
        return
      }
    }
  }

  function reportError(messageId: string, a: AgentAction, e: unknown) {
    const conv = conversations.find((c) => c.messages.some((m) => m.id === messageId))
    if (conv) update(conv.id, (list) => [...list, { id: newId(), role: 'assistant', content: `Không lưu được ${ACTION_LABEL[a.kind]}: ${errorMessage(e)}`, error: true }])
  }

  async function addDraft(messageId: string, index: number, draft: DraftState['draft'], batch = newBatch()) {
    const a = norm(draft)
    updateDraft(messageId, index, 'saving')
    try {
      const savedId = await execute(a, batch)
      updateDraft(messageId, index, 'added', savedId)
      return true
    } catch (e) {
      updateDraft(messageId, index, 'pending')
      reportError(messageId, a, e)
      return false
    }
  }

  /** Thêm lần lượt mọi đề xuất chưa duyệt của 1 tin nhắn (đã xếp: môn → lịch học → deadline → buổi tự học) */
  async function addAll(m: Message) {
    const batch = newBatch()
    let ok = 0
    for (const [i, d] of (m.drafts ?? []).entries()) {
      if (d.status !== 'pending') continue
      if (await addDraft(m.id, i, d.draft, batch)) ok++
    }
    if (ok > 1) {
      const conv = conversations.find((c) => c.messages.some((x) => x.id === m.id))
      if (conv) update(conv.id, (list) => [...list, { id: newId(), role: 'assistant', content: `Đã thêm ${ok} mục vào UniPlan ✅` }])
    }
  }

  function startEdit(messageId: string, index: number, draft: DraftState['draft']) {
    const a = norm(draft)
    const batch = newBatch()
    if (a.kind === 'task') setEditing({ messageId, index, form: 'task', input: toDeadlineInput(a, courseIdOf(a.courseCode, batch)) })
    else if (a.kind === 'course') setEditing({ messageId, index, form: 'course', input: { code: a.code, name: a.name, colorCode: a.colorCode, blockName: a.blockName, semester: a.semester } })
    else if (a.kind === 'schedule')
      setEditing({
        messageId,
        index,
        form: 'schedule',
        input: { courseId: courseIdOf(a.courseCode, batch) ?? '', dayOfWeek: a.dayOfWeek, startTime: a.startTime, endTime: a.endTime, room: a.room, lecturer: a.lecturer, blockPeriod: a.blockPeriod },
      })
    else
      setEditing({
        messageId,
        index,
        form: 'session',
        input: { title: a.title, courseId: courseIdOf(a.courseCode, batch), deadlineId: null, examId: null, startAt: a.startAt, endAt: a.endAt, isDone: false, notes: a.notes },
      })
  }

  function localReply(text: string, prefix = ''): Message {
    const draft = parseQuickDeadline(text, { now: new Date(), courses })
    if (draft) {
      return { id: newId(), role: 'assistant', content: `${prefix}Mình hiểu là deadline sau, bạn kiểm tra lại rồi bấm Thêm nhé:`, drafts: [{ draft: fromLegacyDraft(draft, courses), status: 'pending' }] }
    }
    return {
      id: newId(),
      role: 'assistant',
      content:
        prefix +
        'Mình chưa thấy mốc thời gian trong câu. Hãy ghi tên việc, mã môn và hạn, ví dụ:\n' +
        '- Lab 5 PRO192 thứ 6 23h59 gấp\n- Assignment MKT202 ngày mai 9h tối\n- Ôn tập MAD101 20/10' +
        (mode === 'unavailable' ? '\n\nBản demo chưa có AI để hỏi đáp tự do.' : ''),
    }
  }

  async function send(raw: string) {
    const text = raw.trim().slice(0, MAX_INPUT)
    if (!text || busy) return
    const userMsg: Message = { id: newId(), role: 'user', content: text }
    const history = [...messages, userMsg]
    // Tin đầu tiên của cuộc mới → tạo cuộc trò chuyện, tiêu đề = câu hỏi
    let convId = activeId
    if (!convId || !active) {
      const id = newId()
      const now = Date.now()
      convId = id
      setConversations((list) => [{ id, title: titleFrom(text), createdAt: now, updatedAt: now, messages: [userMsg] }, ...list].slice(0, MAX_CONVERSATIONS))
      setActiveId(id)
    } else {
      update(convId, () => history)
    }
    const id = convId
    const setMessages = (fn: (list: Message[]) => Message[]) => update(id, fn)
    setInput('')

    if (mode === 'unavailable') {
      setMessages((list) => [...list, localReply(text)])
      return
    }

    setBusy(true)
    try {
      // Tin của trợ lý kèm tóm tắt các đề xuất + người dùng đã duyệt hay chưa, để lượt sau AI nắm được ngữ cảnh
      const convo: ChatMessage[] = history
        .filter((m) => !m.error && (m.content || m.drafts?.length))
        .slice(-HISTORY_FOR_AI)
        .map((m) => {
          const proposals = m.drafts?.length ? `\n[Đã đề xuất: ${m.drafts.map((d) => `${describeAction(norm(d.draft))} (${STATUS_TEXT[d.status]})`).join('; ')}]` : ''
          return { role: m.role, content: (m.content + proposals).trim().slice(0, 4000) }
        })
      const context = buildAgentContext({ now: new Date(), userName: user.fullName, page: location.pathname, courses, schedules, deadlines, exams, sessions: studySessions, courseById })
      const { reply, actions: raw } = await chat(convo, { context })
      const { actions, rejected } = toAgentActions(raw, courses)
      const note = rejected ? `\n\n(Bỏ qua ${rejected} đề xuất không hợp lệ hoặc bị trùng.)` : ''
      setMessages((list) => [
        ...list,
        {
          id: newId(),
          role: 'assistant',
          content: (reply || (actions.length ? 'Mình đã chuẩn bị các mục dưới đây, bạn kiểm tra rồi bấm Thêm nhé:' : '(AI không trả lời)')) + note,
          drafts: actions.map((draft) => ({ draft, status: 'pending' as const })),
        },
      ])
    } catch (e) {
      // AI lỗi → nếu câu hiểu được thành deadline thì vẫn đưa bản nháp, để không chặn việc thêm deadline
      const understood = parseQuickDeadline(text, { now: new Date(), courses }) !== null
      setMessages((list) => [
        ...list,
        { id: newId(), role: 'assistant', content: errorMessage(e), error: true },
        ...(understood ? [localReply(text, 'Trong lúc AI lỗi, mình thử hiểu theo cách đơn giản. ')] : []),
      ])
    } finally {
      setBusy(false)
      inputRef.current?.focus()
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    void send(input)
  }

  return (
    <>
      {/* Điện thoại: phủ mờ nền để tập trung vào khung chat. Máy tính: không phủ, vẫn thao tác trang bên dưới được */}
      <div
        className={cn('fixed inset-0 z-50 bg-black/30 transition-opacity duration-300 sm:hidden', open ? 'opacity-100' : 'pointer-events-none opacity-0')}
        onClick={onClose}
        aria-hidden
      />
      <section
        role="dialog"
        aria-modal="false"
        aria-label="Trợ lý AI UniPlan"
        aria-hidden={!open}
        inert={!open}
        className={cn(
          'fixed inset-x-2 bottom-2 z-50 flex h-[min(85dvh,640px)] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-surface shadow-2xl shadow-slate-900/20',
          'sm:inset-x-auto sm:bottom-5 sm:h-[min(680px,calc(100dvh-7rem))] sm:w-100 2xl:w-110',
          side === 'left' ? 'origin-bottom-left sm:left-5' : 'origin-bottom-right sm:right-5',
          // Mở: trượt lên + phóng nhẹ, nảy mềm. Đóng: thu nhanh về góc có nút
          'transition-[opacity,transform] will-change-transform',
          open
            ? 'translate-y-0 scale-100 opacity-100 duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]'
            : 'pointer-events-none translate-y-6 scale-90 opacity-0 duration-200 ease-in',
        )}
      >
        {/* Ánh cam nhạt phía trên, giữ nhận diện thương hiệu */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-brand-50 to-transparent" aria-hidden />

        <header className="relative flex items-center gap-2 px-3 py-3">
          <button
            onClick={() => setHistoryOpen(true)}
            className="relative flex h-9 w-9 items-center justify-center rounded-full bg-surface/80 text-slate-500 ring-1 ring-slate-200 transition hover:text-brand-600"
            aria-label="Lịch sử trò chuyện"
            aria-expanded={historyOpen}
            title="Lịch sử trò chuyện"
          >
            <History className="h-4 w-4" />
            {conversations.length > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-cta px-1 text-[10px] font-bold text-white">{conversations.length}</span>
            )}
          </button>
          <h2 className="flex min-w-0 flex-1 items-center justify-center gap-1.5 text-base font-bold text-slate-900">
            <Bot className="h-4 w-4 shrink-0 text-brand-500" />
            <span className="truncate">{active ? active.title : 'Trợ lý UniPlan'}</span>
          </h2>
          <button
            onClick={startNew}
            disabled={!active}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-surface/80 text-slate-500 ring-1 ring-slate-200 transition hover:text-brand-600 disabled:opacity-40 disabled:hover:text-slate-500"
            aria-label="Cuộc trò chuyện mới"
            title="Cuộc trò chuyện mới"
          >
            <SquarePen className="h-4 w-4" />
          </button>
          <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full bg-surface/80 text-slate-500 ring-1 ring-slate-200 transition hover:text-brand-600" aria-label="Đóng trợ lý">
            <X className="h-4 w-4" />
          </button>
        </header>

        <HistoryDrawer
          open={historyOpen}
          conversations={conversations}
          activeId={activeId}
          onClose={() => setHistoryOpen(false)}
          onOpen={openConversation}
          onNew={startNew}
          onDelete={deleteConversation}
          // Đổi tên không đổi updatedAt: cuộc trò chuyện giữ nguyên vị trí trong danh sách
          onRename={(id, title) => setConversations((list) => list.map((c) => (c.id === id ? { ...c, title } : c)))}
          onClearAll={() => {
            setConversations(() => [])
            setActiveId(null)
          }}
        />

        <div ref={listRef} className="relative flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 pb-4 pt-1" aria-live="polite">
          {messages.length === 0 && (
            <div className="flex min-h-full flex-col items-center justify-center px-2 py-4 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-lg shadow-brand-500/40">
                <Sparkles className="h-8 w-8" />
              </span>
              <p className="mt-5 text-2xl font-extrabold tracking-tight text-slate-900">Chào {user.fullName.split(' ').pop() || 'bạn'} 👋</p>
              <p className="mt-2 max-w-xs text-sm text-slate-500">
                {mode === 'unavailable'
                  ? 'Bản demo chưa có AI, nhưng bạn vẫn có thể gõ câu tự nhiên để thêm nhanh deadline.'
                  : 'Thêm deadline từ câu bạn gõ, tóm tắt lịch tuần này hoặc lên kế hoạch ôn thi.'}
              </p>
              <div className="mt-5 flex w-full flex-col gap-2.5">
                {(mode === 'unavailable' ? [EXAMPLES[0], 'Assignment MKT202 ngày mai 9h tối'] : EXAMPLES).map((ex) => (
                  <button
                    key={ex}
                    onClick={() => void send(ex)}
                    className="rounded-full border border-brand-500/50 bg-surface px-4 py-2.5 text-sm font-medium text-brand-700 transition hover:-translate-y-0.5 hover:border-brand-500 hover:bg-brand-50 hover:shadow-sm"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) => (
            <div key={m.id} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div className={cn('max-w-[88%] space-y-2', m.role === 'user' && 'items-end')}>
                {m.content && (
                  <div
                    className={cn(
                      'rounded-2xl px-3.5 py-2.5 text-sm',
                      m.role === 'user'
                        ? 'rounded-br-md bg-cta text-white'
                        : m.error
                          ? 'rounded-bl-md bg-red-50 text-red-700 ring-1 ring-red-200'
                          : 'rounded-bl-md bg-slate-100 text-slate-800',
                    )}
                  >
                    <RichText text={m.content} />
                  </div>
                )}
                {m.drafts?.map((d, i) => (
                  <ActionCard
                    key={i}
                    action={norm(d.draft)}
                    status={d.status}
                    savedId={d.savedId}
                    onAdd={() => void addDraft(m.id, i, d.draft)}
                    onEdit={() => startEdit(m.id, i, d.draft)}
                    onDismiss={() => updateDraft(m.id, i, 'dismissed')}
                  />
                ))}
                {(m.drafts?.filter((d) => d.status === 'pending').length ?? 0) > 1 && (
                  <button
                    onClick={() => void addAll(m)}
                    disabled={m.drafts?.some((d) => d.status === 'saving')}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-cta px-3 py-2 text-sm font-semibold text-white shadow-sm shadow-brand-500/30 transition hover:bg-cta-hover disabled:opacity-60"
                  >
                    <CheckCheck className="h-4 w-4" /> Thêm tất cả ({m.drafts?.filter((d) => d.status === 'pending').length})
                  </button>
                )}
              </div>
            </div>
          ))}

          {/* Đang chờ AI: bong bóng "đang soạn tin" (3 chấm nhảy lần lượt) giống tin nhắn của trợ lý, như Messenger / Zalo */}
          {busy && (
            <div className="flex justify-start" role="status" aria-live="polite">
              <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md bg-slate-100 px-4 py-3.5" aria-label="Trợ lý đang soạn câu trả lời">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="h-2 w-2 animate-typing-dot rounded-full bg-slate-400" style={{ animationDelay: `${i * 0.18}s` }} aria-hidden />
                ))}
              </div>
            </div>
          )}
        </div>

        <form onSubmit={onSubmit} className="relative bg-surface px-3 pb-3 pt-2">
          <div className="flex items-end gap-2">
            <div className="flex min-h-12 flex-1 items-center rounded-3xl border border-slate-200 bg-slate-50 py-2.5 pl-4 pr-2 transition focus-within:border-brand-500 focus-within:bg-surface focus-within:ring-4 focus-within:ring-brand-500/15">
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              maxLength={MAX_INPUT}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  void send(input)
                }
              }}
              placeholder={mode === 'unavailable' ? 'Nhập deadline cần thêm' : 'Nhập câu hỏi hoặc yêu cầu'}
              className="block min-h-6 flex-1 resize-none overflow-hidden bg-transparent pr-2 text-sm leading-6 outline-none placeholder:text-slate-400 [scrollbar-width:thin]"
              aria-label="Tin nhắn"
            />
            </div>
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-600 text-white shadow-lg shadow-brand-500/30 transition hover:scale-105 active:scale-95 disabled:scale-100 disabled:opacity-40 disabled:shadow-none"
              aria-label="Gửi"
            >
              <SendHorizonal className="h-5 w-5" />
            </button>
          </div>
        </form>
      </section>

      {editing?.form === 'task' && <TaskForm initial={editing.input} onClose={() => setEditing(null)} onSaved={(saved) => updateDraft(editing.messageId, editing.index, 'added', saved.id)} />}
      {editing?.form === 'course' && <CourseForm initial={editing.input} onClose={() => setEditing(null)} onSaved={() => updateDraft(editing.messageId, editing.index, 'added')} />}
      {editing?.form === 'schedule' && <ScheduleForm initial={editing.input} onClose={() => setEditing(null)} onSaved={() => updateDraft(editing.messageId, editing.index, 'added')} />}
      {editing?.form === 'session' && <SessionForm initial={editing.input} onClose={() => setEditing(null)} onSaved={() => updateDraft(editing.messageId, editing.index, 'added')} />}
    </>
  )
}

/** Ngăn lịch sử trượt ra từ trái, phủ lên khung chat */
function HistoryDrawer({
  open,
  conversations,
  activeId,
  onClose,
  onOpen,
  onNew,
  onDelete,
  onRename,
  onClearAll,
}: {
  open: boolean
  conversations: Conversation[]
  activeId: string | null
  onClose: () => void
  onOpen: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
  onRename: (id: string, title: string) => void
  onClearAll: () => void
}) {
  const confirm = useConfirm()
  const [query, setQuery] = useState('')
  // Đổi tên ngay trong danh sách: Enter / bấm ✓ / bấm ra ngoài để lưu, Esc để hủy
  const [renaming, setRenaming] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const startRename = (c: Conversation) => {
    setRenaming(c.id)
    setDraftTitle(c.title)
  }
  const commitRename = () => {
    if (!renaming) return
    const title = draftTitle.replace(/\s+/g, ' ').trim()
    if (title) onRename(renaming, title.slice(0, MAX_TITLE))
    setRenaming(null)
  }
  // Đóng ngăn giữa chừng → bỏ đổi tên dở
  useEffect(() => {
    if (!open) setRenaming(null)
  }, [open])
  const q = query.trim().toLowerCase()
  const list = [...conversations]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .filter((c) => !q || c.title.toLowerCase().includes(q) || c.messages.some((m) => m.content.toLowerCase().includes(q)))
  const groups: { label: string; items: Conversation[] }[] = []
  for (const c of list) {
    const label = historyGroup(c.updatedAt)
    const g = groups.find((x) => x.label === label)
    if (g) g.items.push(c)
    else groups.push({ label, items: [c] })
  }
  const time = (ts: number) =>
    historyGroup(ts) === 'Hôm nay'
      ? new Date(ts).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
      : new Date(ts).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })

  return (
    <>
      {/* Lớp mờ: bấm ra ngoài để đóng */}
      <div
        className={cn('absolute inset-0 z-20 bg-slate-900/20 transition-opacity duration-300', open ? 'opacity-100' : 'pointer-events-none opacity-0')}
        onClick={onClose}
        aria-hidden
      />
      <aside
        aria-label="Lịch sử trò chuyện"
        aria-hidden={!open}
        inert={!open}
        className={cn(
          'absolute inset-y-0 left-0 z-30 flex w-[85%] max-w-80 flex-col bg-surface shadow-2xl transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <p className="flex items-center gap-2 font-bold text-slate-900">
            <History className="h-4 w-4 text-brand-500" /> Lịch sử trò chuyện
          </p>
          <button onClick={onClose} className="rounded-full p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800" aria-label="Đóng lịch sử">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-2 px-3 pt-3">
          <button
            onClick={onNew}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-cta px-3 py-2 text-sm font-semibold text-white shadow-sm shadow-brand-500/30 transition hover:bg-cta-hover"
          >
            <SquarePen className="h-4 w-4" /> Cuộc trò chuyện mới
          </button>
          {conversations.length > 3 && (
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Tìm trong lịch sử…"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:bg-surface"
                aria-label="Tìm trong lịch sử"
              />
            </label>
          )}
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-2 py-2">
          {conversations.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-slate-500">Chưa có cuộc trò chuyện nào. Hỏi trợ lý một câu để bắt đầu nhé.</p>
          ) : list.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-slate-500">Không tìm thấy “{query}”.</p>
          ) : (
            groups.map((g) => (
              <div key={g.label} className="mb-2">
                <p className="px-2 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">{g.label}</p>
                <ul className="space-y-0.5">
                  {g.items.map((c) => {
                    const current = c.id === activeId
                    if (renaming === c.id) {
                      return (
                        <li key={c.id}>
                          <form
                            onSubmit={(e) => {
                              e.preventDefault()
                              commitRename()
                            }}
                            className="flex items-center gap-1.5 rounded-xl bg-brand-50 px-2 py-1.5 ring-2 ring-brand-500/40"
                          >
                            <MessageSquare className="h-4 w-4 shrink-0 text-brand-500" />
                            <input
                              autoFocus
                              value={draftTitle}
                              maxLength={MAX_TITLE}
                              onChange={(e) => setDraftTitle(e.target.value)}
                              onFocus={(e) => e.currentTarget.select()}
                              onBlur={commitRename}
                              onKeyDown={(e) => {
                                if (e.key === 'Escape') {
                                  // Chỉ hủy đổi tên, không đóng ngăn lịch sử / khung chat
                                  e.stopPropagation()
                                  setRenaming(null)
                                }
                              }}
                              className="min-w-0 flex-1 bg-transparent text-sm font-medium text-slate-900 outline-none"
                              aria-label="Tên cuộc trò chuyện"
                            />
                            <button
                              type="submit"
                              onMouseDown={(e) => e.preventDefault()} // giữ focus để onBlur không lưu 2 lần
                              className="rounded-lg p-1 text-brand-600 transition hover:bg-brand-100"
                              aria-label="Lưu tên"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                          </form>
                        </li>
                      )
                    }
                    return (
                      <li key={c.id} className="group relative">
                        <button
                          onClick={() => onOpen(c.id)}
                          onDoubleClick={() => startRename(c)}
                          aria-current={current ? 'true' : undefined}
                          className={cn(
                            'flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 pr-16 text-left transition',
                            current ? 'bg-brand-50 text-brand-700' : 'text-slate-700 hover:bg-slate-100',
                          )}
                        >
                          <MessageSquare className={cn('mt-0.5 h-4 w-4 shrink-0', current ? 'text-brand-500' : 'text-slate-400')} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{c.title}</span>
                            <span className="block text-xs text-slate-500">
                              {time(c.updatedAt)} · {c.messages.length} tin nhắn
                            </span>
                          </span>
                        </button>
                        <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 opacity-0 transition focus-within:opacity-100 group-hover:opacity-100">
                          <button
                            onClick={() => startRename(c)}
                            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-brand-50 hover:text-brand-600"
                            aria-label={`Đổi tên cuộc trò chuyện ${c.title}`}
                            title="Đổi tên"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => onDelete(c.id)}
                            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-500"
                            aria-label={`Xóa cuộc trò chuyện ${c.title}`}
                            title="Xóa"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))
          )}
        </div>

        <div className="border-t border-slate-100 px-4 py-3">
          {conversations.length > 0 && (
            <button
              onClick={() =>
                void confirm({ title: 'Xóa toàn bộ lịch sử?', message: 'Mọi cuộc trò chuyện với trợ lý AI trên thiết bị này sẽ bị xóa.', confirmLabel: 'Xóa tất cả' }).then(
                  (ok) => ok && onClearAll(),
                )
              }
              className="mb-1.5 inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 hover:underline"
            >
              <Trash2 className="h-3.5 w-3.5" /> Xóa toàn bộ lịch sử
            </button>
          )}
          <p className="text-xs text-slate-500">Lưu tối đa {MAX_CONVERSATIONS} cuộc trên thiết bị này, tự xóa khi đăng xuất.</p>
        </div>
      </aside>
    </>
  )
}

const KIND_META: Record<AgentAction['kind'], { label: string; icon: typeof CalendarClock; to: string; link: string }> = {
  task: { label: 'Deadline mới', icon: CalendarClock, to: '/tasks', link: 'Xem nhiệm vụ' },
  course: { label: 'Môn học mới', icon: BookOpen, to: '/courses', link: 'Xem môn học' },
  schedule: { label: 'Lịch học trên lớp', icon: CalendarRange, to: '/calendar', link: 'Xem lịch' },
  session: { label: 'Buổi tự học', icon: Timer, to: '/plan', link: 'Xem kế hoạch' },
}

/** Màu nhận diện từng loại đề xuất: vạch trái, ô biểu tượng, nhãn và biểu tượng giờ */
const KIND_TONE: Record<AgentAction['kind'], { bar: string; tile: string; text: string }> = {
  task: { bar: 'bg-orange-500', tile: 'bg-orange-50 text-orange-600', text: 'text-orange-600' },
  course: { bar: 'bg-violet-500', tile: 'bg-violet-50 text-violet-600', text: 'text-violet-600' },
  schedule: { bar: 'bg-blue-500', tile: 'bg-blue-50 text-blue-600', text: 'text-blue-600' },
  session: { bar: 'bg-emerald-500', tile: 'bg-emerald-50 text-emerald-600', text: 'text-emerald-600' },
}

/** Thẻ đề xuất của AI agent: xem trước rồi Thêm / Chỉnh sửa / Bỏ */
function ActionCard({
  action: a,
  status,
  savedId,
  onAdd,
  onEdit,
  onDismiss,
}: {
  action: AgentAction
  status: DraftStatus
  savedId?: string
  onAdd: () => void
  onEdit: () => void
  onDismiss: () => void
}) {
  const { courses } = useAppData()
  const meta = KIND_META[a.kind]
  const tone = KIND_TONE[a.kind]
  const codeOf = (code: string | null) => (code ? courses.find((c) => c.code.toLowerCase() === code.toLowerCase()) : undefined)
  const chip = (course: Course | undefined, code: string | null) => {
    if (!code) return null
    const color = courseColor(course)
    return <span className={cn('rounded-md px-2 py-0.5 font-semibold ring-1 ring-inset ring-current/25', color.soft, color.text)}>#{course?.code ?? code}</span>
  }

  let title = ''
  let body: ReactNode = null
  if (a.kind === 'task') {
    const overdue = new Date(a.dueDate).getTime() < Date.now()
    title = a.title
    body = (
      <>
        <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs font-medium">
          {chip(codeOf(a.courseCode), a.courseCode)}
          <span className={cn('rounded-md px-2 py-0.5', PRIORITY_STYLE[a.priority])}>{PRIORITY_LABEL[a.priority]}</span>
          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-slate-700">{TASK_TYPE_LABEL[a.taskType]}</span>
        </div>
        <p className={cn('mt-2.5 flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-[13px] font-semibold', overdue ? 'text-red-600' : 'text-slate-800')}>
          <CalendarClock className={cn('h-4 w-4 shrink-0', overdue ? 'text-red-600' : tone.text)} /> Hạn: {formatDateTime(a.dueDate)}
          {overdue && ' (đã qua)'}
        </p>
        {a.subtasks.length > 0 && <p className="mt-1.5 text-xs text-slate-600">{a.subtasks.length} bước nhỏ: {a.subtasks.join(', ')}</p>}
      </>
    )
  } else if (a.kind === 'course') {
    const color = COURSE_COLOR[a.colorCode]
    title = `${a.code} – ${a.name}`
    body = (
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs font-medium">
        <span className={cn('h-3 w-3 rounded-full', color.bar)} aria-hidden />
        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-slate-700">{a.blockName}</span>
        {a.semester && <span className="rounded-md bg-slate-100 px-2 py-0.5 text-slate-700">{a.semester}</span>}
      </div>
    )
  } else if (a.kind === 'schedule') {
    title = `Học ${a.courseCode} mỗi ${WEEKDAY_LONG[a.dayOfWeek - 1]}`
    body = (
      <>
        <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs font-medium">
          {chip(codeOf(a.courseCode), a.courseCode)}
          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-slate-700">{a.blockPeriod}</span>
        </div>
        <p className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-slate-50 px-3 py-2 text-[13px] font-semibold text-slate-800">
          <span className="inline-flex items-center gap-2">
            <CalendarClock className={cn('h-4 w-4 shrink-0', tone.text)} /> {a.startTime} – {a.endTime}
          </span>
          {a.room && (
            <span className="inline-flex items-center gap-1 font-medium text-slate-600">
              <MapPin className="h-3.5 w-3.5" /> {a.room}
            </span>
          )}
        </p>
        {a.lecturer && <p className="mt-1.5 text-xs text-slate-600">Giảng viên: {a.lecturer}</p>}
      </>
    )
  } else {
    const minutes = Math.round((new Date(a.endAt).getTime() - new Date(a.startAt).getTime()) / 60_000)
    const end = new Date(a.endAt)
    title = a.title
    body = (
      <>
        <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs font-medium">
          {chip(codeOf(a.courseCode), a.courseCode)}
          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-slate-700">{minutes >= 60 ? `${Math.floor(minutes / 60)}g${minutes % 60 ? ` ${minutes % 60}p` : ''}` : `${minutes} phút`}</span>
        </div>
        <p className="mt-2.5 flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-[13px] font-semibold text-slate-800">
          <CalendarClock className={cn('h-4 w-4 shrink-0', tone.text)} /> {formatDateTime(a.startAt)} – {String(end.getHours()).padStart(2, '0')}:{String(end.getMinutes()).padStart(2, '0')}
        </p>
        {a.deadlineTitle && <p className="mt-1.5 text-xs text-slate-600">Cho: {a.deadlineTitle}</p>}
      </>
    )
  }
  const Icon = meta.icon

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border border-slate-200 bg-surface p-3.5 pl-4.5 text-sm shadow-card transition',
        status === 'dismissed' ? 'opacity-55' : 'hover:shadow-md',
      )}
      aria-label={`Đề xuất ${meta.label}: ${title}`}
    >
      {/* Vạch màu theo loại đề xuất */}
      <span className={cn('absolute inset-y-0 left-0 w-1', tone.bar)} aria-hidden />
      <p className={cn('mb-1.5 flex items-center gap-2 text-xs font-bold', tone.text)}>
        <span className={cn('flex h-6 w-6 items-center justify-center rounded-lg', tone.tile)}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        {meta.label}
      </p>
      <p className={cn('text-[15px] font-bold leading-snug text-slate-900', status === 'dismissed' && 'line-through')}>{title}</p>
      {body}

      <div className="mt-3 flex flex-wrap gap-2">
        {status === 'added' ? (
          <Link to={a.kind === 'task' && savedId ? `/tasks?task=${savedId}` : meta.to} className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-emerald-50 px-3.5 text-[13px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
            <Check className="h-3.5 w-3.5" /> Đã thêm · {meta.link}
          </Link>
        ) : status === 'dismissed' ? (
          <span className="text-xs text-slate-500">Đã bỏ qua</span>
        ) : (
          <>
            <button onClick={onAdd} disabled={status === 'saving'} className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-cta px-3.5 text-[13px] font-semibold text-white shadow-sm shadow-brand-500/30 hover:bg-cta-hover disabled:opacity-60">
              {status === 'saving' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Thêm
            </button>
            <button onClick={onEdit} disabled={status === 'saving'} className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-slate-300 bg-surface px-3.5 text-[13px] font-semibold text-slate-800 hover:bg-slate-100">
              <Pencil className="h-3.5 w-3.5" /> Chỉnh sửa
            </button>
            <button onClick={onDismiss} disabled={status === 'saving'} className="min-h-9 rounded-xl px-3 text-[13px] font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900">
              Bỏ
            </button>
          </>
        )}
      </div>
    </div>
  )
}

/** Hiển thị văn bản AI: xuống dòng, gạch đầu dòng "- ", **đậm**. Không render HTML (an toàn XSS). */
function RichText({ text }: { text: string }) {
  const lines = text.split('\n')
  const out: ReactNode[] = []
  let bullets: string[] = []
  const flush = () => {
    if (bullets.length) {
      out.push(
        <ul key={`ul${out.length}`} className="my-1 list-disc space-y-0.5 pl-5">
          {bullets.map((b, i) => (
            <li key={i}>{bold(b)}</li>
          ))}
        </ul>,
      )
      bullets = []
    }
  }
  lines.forEach((line, i) => {
    const m = line.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)$/)
    if (m) {
      bullets.push(m[1])
      return
    }
    flush()
    out.push(line.trim() ? <p key={i}>{bold(line)}</p> : <div key={i} className="h-2" />)
  })
  flush()
  return <div className="space-y-0.5 break-words">{out}</div>
}

function bold(s: string): ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part))
}
