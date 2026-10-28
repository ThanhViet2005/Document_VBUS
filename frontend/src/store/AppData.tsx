import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { mockAssignments, mockCourses, mockDeadlines, mockExams, mockGroups, mockSchedules, mockStudySessions, mockUser } from '../data/mock'
import { supabase } from '../lib/supabase'
import { applyStatus, progressFromSubtasks } from '../lib/tasks'
import * as api from '../services/api'
import type { Assignment, Course, Deadline, Exam, Group, GroupInvitation, Schedule, StudySession, TaskStatus, UserProfile } from '../types'
import { useAuth } from './Auth'

type LoadStatus = 'loading' | 'ready' | 'error'

interface AppData {
  status: LoadStatus
  error: string | null
  isDemo: boolean
  user: UserProfile
  courses: Course[]
  schedules: Schedule[]
  exams: Exam[]
  deadlines: Deadline[]
  groups: Group[]
  assignments: Assignment[]
  courseById: (id: string | null) => Course | undefined
  groupById: (id: string | null) => Group | undefined
  reload: () => void
  dismissError: () => void

  setTaskStatus: (id: string, status: TaskStatus) => void
  toggleSubtask: (deadlineId: string, subtaskId: string) => void
  saveDeadline: (input: api.DeadlineInput) => Promise<Deadline>
  deleteDeadline: (id: string) => Promise<void>

  saveCourse: (input: api.CourseInput) => Promise<Course>
  deleteCourse: (id: string) => Promise<void>
  saveSchedule: (input: api.ScheduleInput) => Promise<Schedule>
  deleteSchedule: (id: string) => Promise<void>
  saveExam: (input: api.ExamInput) => Promise<Exam>
  deleteExam: (id: string) => Promise<void>

  createGroup: (input: { name: string; description: string; courseId: string | null }) => Promise<Group>
  deleteGroup: (id: string) => Promise<void>
  /** Gửi lời mời; người được mời phải đồng ý thì mới vào nhóm */
  inviteMember: (groupId: string, userId: string) => Promise<void>
  /** Lời mời vào nhóm mình nhận được, đang chờ trả lời */
  invitations: GroupInvitation[]
  respondInvitation: (invitationId: string, accept: boolean) => Promise<void>
  removeMember: (groupId: string, userId: string) => Promise<void>
  saveAssignment: (input: api.AssignmentInput) => Promise<Assignment>
  deleteAssignment: (id: string) => Promise<void>

  createShareLink: (deadlineId: string) => Promise<string>

  studySessions: StudySession[]
  saveStudySession: (input: api.StudySessionInput) => Promise<StudySession>
  deleteStudySession: (id: string) => Promise<void>
  toggleStudySessionDone: (id: string) => void

  saveProfile: (input: api.ProfileUpdate) => Promise<UserProfile>
  /** null = xóa ảnh */
  changeAvatar: (file: { blob: Blob; type: string; ext: string } | null) => Promise<UserProfile>
}

const AppDataContext = createContext<AppData | null>(null)

const EMPTY_USER: UserProfile = { id: '', email: '', fullName: '', studentCode: '', campus: 'FPT University Đà Nẵng', role: 'user', isLocked: false }
const DEMO_ONLY_ONLINE = 'Chế độ demo không hỗ trợ tính năng này.'

const localId = () => crypto.randomUUID()
const upsert = <T extends { id: string }>(list: T[], item: T) =>
  list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item]

export function AppDataProvider({ children }: { children: ReactNode }) {
  const { mode, userId, email } = useAuth()
  const isDemo = mode === 'demo'

  const [status, setStatus] = useState<LoadStatus>(isDemo ? 'ready' : 'loading')
  const [error, setError] = useState<string | null>(null)
  const [user, setUser] = useState<UserProfile>(isDemo ? mockUser : EMPTY_USER)
  const [courses, setCourses] = useState<Course[]>(isDemo ? mockCourses : [])
  const [schedules, setSchedules] = useState<Schedule[]>(isDemo ? mockSchedules : [])
  const [exams, setExams] = useState<Exam[]>(isDemo ? mockExams : [])
  const [deadlines, setDeadlines] = useState<Deadline[]>(isDemo ? mockDeadlines : [])
  const [groups, setGroups] = useState<Group[]>(isDemo ? mockGroups : [])
  const [assignments, setAssignments] = useState<Assignment[]>(isDemo ? mockAssignments : [])
  const [studySessions, setStudySessions] = useState<StudySession[]>(isDemo ? mockStudySessions : [])
  const [invitations, setInvitations] = useState<GroupInvitation[]>([])
  const studySessionsRef = useRef(studySessions)
  studySessionsRef.current = studySessions

  const deadlinesRef = useRef(deadlines)
  deadlinesRef.current = deadlines
  const userIdRef = useRef(userId)
  userIdRef.current = userId

  const loadAll = useCallback(async () => {
    if (isDemo || !userId) return
    setStatus('loading')
    try {
      const [profile, c, s, e, d, g, a, ss] = await Promise.all([
        api.fetchProfile(userId),
        api.fetchCourses(),
        api.fetchSchedules(userId),
        api.fetchExams(userId),
        api.fetchDeadlines(),
        api.fetchGroups(),
        api.fetchAssignments(),
        api.fetchStudySessions(userId),
      ])
      setUser(profile)
      setCourses(c)
      setSchedules(s)
      setExams(e)
      setDeadlines(d)
      setGroups(g)
      setAssignments(a)
      setStudySessions(ss)
      // Lời mời tải riêng: database chưa chạy migration 007 thì chỉ thiếu lời mời, app vẫn chạy
      void api.fetchMyInvitations().then(setInvitations, () => setInvitations([]))
      setStatus('ready')
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được dữ liệu')
      setStatus('error')
    }
  }, [isDemo, userId])

  useEffect(() => {
    if (!isDemo && userId) setUser({ ...EMPTY_USER, id: userId, email: email ?? '' })
    void loadAll()
  }, [isDemo, userId, email, loadAll])

  // ----- Realtime -----
  // Lọc theo user và theo nhóm của mình để server không phải đánh giá RLS cho mọi thay đổi của mọi người
  // (quan trọng khi có ~100 người dùng đồng thời).
  const groupKey = groups.map((g) => g.id).sort().join(',')
  useEffect(() => {
    if (isDemo || !userId || !supabase) return
    const sb = supabase
    const timers: Record<string, ReturnType<typeof setTimeout>> = {}
    const debounce = (key: string, fn: () => Promise<unknown>) => () => {
      clearTimeout(timers[key])
      timers[key] = setTimeout(() => void fn().catch(() => {}), 400)
    }
    const refreshDeadlines = debounce('d', () => api.fetchDeadlines().then(setDeadlines))
    const refreshGroups = debounce('g', () =>
      Promise.all([api.fetchGroups(), api.fetchAssignments(), api.fetchCourses()]).then(([g, a, c]) => {
        setGroups(g)
        setAssignments(a)
        setCourses(c)
      }),
    )
    const refreshAssignments = debounce('a', () => api.fetchAssignments().then(setAssignments))
    const refreshInvitations = debounce('i', () => api.fetchMyInvitations().then(setInvitations))

    let channel = sb
      .channel(`uniplan:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deadlines', filter: `user_id=eq.${userId}` }, refreshDeadlines)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_members', filter: `user_id=eq.${userId}` }, () => {
        refreshGroups()
        refreshDeadlines()
      })
      // Có người mời mình vào nhóm / chủ nhóm thu hồi lời mời
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_invitations', filter: `invitee_id=eq.${userId}` }, refreshInvitations)
    if (groupKey) {
      const ids = groupKey.split(',').slice(0, 100).join(',')
      channel = channel
        .on('postgres_changes', { event: '*', schema: 'public', table: 'deadlines', filter: `group_id=in.(${ids})` }, refreshDeadlines)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'assignments', filter: `group_id=in.(${ids})` }, refreshAssignments)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'group_members', filter: `group_id=in.(${ids})` }, refreshGroups)
    }
    channel.subscribe()

    return () => {
      Object.values(timers).forEach(clearTimeout)
      void sb.removeChannel(channel)
    }
  }, [isDemo, userId, groupKey])

  // ----- Deadline -----
  const setTaskStatus = useCallback(
    (id: string, next: TaskStatus) => {
      const prev = deadlinesRef.current.find((d) => d.id === id)
      if (!prev || prev.status === next) return
      // Các bước nhỏ đổi theo trạng thái (Hoàn thành = tick hết, Chưa bắt đầu = bỏ tick hết) để thẻ không tự mâu thuẫn
      const { progressPercent, subtasks, allSubtasks } = applyStatus(prev, next)

      // Cập nhật lạc quan, lỗi thì hoàn tác
      setDeadlines((list) => list.map((d) => (d.id === id ? { ...d, status: next, progressPercent, subtasks } : d)))
      if (isDemo) return
      const save =
        allSubtasks === null || prev.subtasks.every((s) => s.isCompleted === allSubtasks)
          ? api.updateDeadlineStatus(id, next, progressPercent)
          : api.setDeadlineStatusWithSubtasks(id, next, progressPercent, allSubtasks)
      save.catch((e: unknown) => {
        setDeadlines((list) => list.map((d) => (d.id === id ? prev : d)))
        setError(`Không cập nhật được trạng thái: ${e instanceof Error ? e.message : 'lỗi không xác định'}`)
      })
    },
    [isDemo],
  )

  const toggleSubtask = useCallback(
    (deadlineId: string, subtaskId: string) => {
      const prev = deadlinesRef.current.find((d) => d.id === deadlineId)
      const sub = prev?.subtasks.find((s) => s.id === subtaskId)
      if (!prev || !sub) return
      const subtasks = prev.subtasks.map((s) => (s.id === subtaskId ? { ...s, isCompleted: !s.isCompleted } : s))
      const { status, progressPercent } = progressFromSubtasks(prev, subtasks, true)
      setDeadlines((list) => list.map((d) => (d.id === deadlineId ? { ...d, subtasks, status, progressPercent } : d)))
      if (isDemo) return
      api.setSubtaskCompleted(prev, subtaskId, !sub.isCompleted, progressPercent, status).catch((e: unknown) => {
        setDeadlines((list) => list.map((d) => (d.id === deadlineId ? prev : d)))
        setError(`Không cập nhật được subtask: ${e instanceof Error ? e.message : 'lỗi không xác định'}`)
      })
    },
    [isDemo],
  )

  const saveDeadline = useCallback(
    async (input: api.DeadlineInput) => {
      const saved: Deadline = isDemo
        ? { ...input, id: input.id ?? localId(), userId: userIdRef.current ?? mockUser.id, isGroup: Boolean(input.groupId) }
        : await api.saveDeadline(input)
      setDeadlines((list) => upsert(list, saved).sort((a, b) => a.dueDate.localeCompare(b.dueDate)))
      return saved
    },
    [isDemo],
  )

  const deleteDeadline = useCallback(
    async (id: string) => {
      if (!isDemo) await api.deleteDeadline(id)
      setDeadlines((list) => list.filter((d) => d.id !== id))
      setAssignments((list) => list.filter((a) => a.deadlineId !== id))
      setStudySessions((list) => list.map((x) => (x.deadlineId === id ? { ...x, deadlineId: null } : x)))
    },
    [isDemo],
  )

  // ----- Môn học / lịch / kỳ thi -----
  const saveCourse = useCallback(
    async (input: api.CourseInput) => {
      const saved: Course = isDemo
        ? { ...input, code: input.code.trim(), id: input.id ?? localId(), userId: userIdRef.current ?? mockUser.id }
        : await api.saveCourse(input)
      setCourses((list) => upsert(list, saved))
      return saved
    },
    [isDemo],
  )

  const deleteCourse = useCallback(
    async (id: string) => {
      if (!isDemo) await api.deleteCourse(id)
      // Giống DB: lịch & kỳ thi bị xóa theo (cascade), deadline giữ lại nhưng bỏ gắn môn (set null)
      setCourses((list) => list.filter((c) => c.id !== id))
      setSchedules((list) => list.filter((s) => s.courseId !== id))
      setExams((list) => list.filter((e) => e.courseId !== id))
      setDeadlines((list) => list.map((d) => (d.courseId === id ? { ...d, courseId: null } : d)))
      setGroups((list) => list.map((g) => (g.courseId === id ? { ...g, courseId: null } : g)))
      setStudySessions((list) => list.map((x) => (x.courseId === id ? { ...x, courseId: null } : x)))
    },
    [isDemo],
  )

  const saveSchedule = useCallback(
    async (input: api.ScheduleInput) => {
      const saved: Schedule = isDemo ? { ...input, id: input.id ?? localId() } : await api.saveSchedule(input)
      setSchedules((list) => upsert(list, saved))
      return saved
    },
    [isDemo],
  )

  const deleteSchedule = useCallback(
    async (id: string) => {
      if (!isDemo) await api.deleteSchedule(id)
      setSchedules((list) => list.filter((s) => s.id !== id))
    },
    [isDemo],
  )

  const saveExam = useCallback(
    async (input: api.ExamInput) => {
      const saved: Exam = isDemo ? { ...input, id: input.id ?? localId() } : await api.saveExam(input)
      setExams((list) => upsert(list, saved).sort((a, b) => a.examDate.localeCompare(b.examDate)))
      return saved
    },
    [isDemo],
  )

  const deleteExam = useCallback(
    async (id: string) => {
      if (!isDemo) await api.deleteExam(id)
      setExams((list) => list.filter((e) => e.id !== id))
      setStudySessions((list) => list.map((x) => (x.examId === id ? { ...x, examId: null } : x)))
    },
    [isDemo],
  )

  // ----- Nhóm -----
  const createGroup = useCallback(
    async (input: { name: string; description: string; courseId: string | null }) => {
      let group: Group
      if (isDemo) {
        group = {
          id: localId(),
          ...input,
          ownerId: mockUser.id,
          members: [{ userId: mockUser.id, role: 'owner', fullName: mockUser.fullName, email: mockUser.email }],
        }
      } else {
        group = await api.createGroup(input)
      }
      setGroups((list) => [...list, group])
      return group
    },
    [isDemo],
  )

  const deleteGroup = useCallback(
    async (id: string) => {
      if (!isDemo) await api.deleteGroup(id)
      setGroups((list) => list.filter((g) => g.id !== id))
      setDeadlines((list) => list.filter((d) => d.groupId !== id))
      setAssignments((list) => list.filter((a) => a.groupId !== id))
    },
    [isDemo],
  )

  const inviteMember = useCallback(
    async (groupId: string, inviteeId: string) => {
      if (isDemo) throw new Error(DEMO_ONLY_ONLINE)
      await api.inviteToGroup(groupId, inviteeId)
    },
    [isDemo],
  )

  const respondInvitation = useCallback(async (invitationId: string, accept: boolean) => {
    await api.respondInvitation(invitationId, accept)
    setInvitations((list) => list.filter((i) => i.id !== invitationId))
    if (accept) {
      // Vừa vào nhóm: tải lại nhóm + deadline / phần việc / môn của nhóm
      const [g, d, a, c] = await Promise.all([api.fetchGroups(), api.fetchDeadlines(), api.fetchAssignments(), api.fetchCourses()])
      setGroups(g)
      setDeadlines(d)
      setAssignments(a)
      setCourses(c)
    }
  }, [])

  const removeMember = useCallback(
    async (groupId: string, memberId: string) => {
      if (!isDemo) await api.removeGroupMember(groupId, memberId)
      if (memberId === (userIdRef.current ?? mockUser.id)) {
        // Tự rời nhóm → mất quyền xem dữ liệu nhóm
        setGroups((list) => list.filter((g) => g.id !== groupId))
        setDeadlines((list) => list.filter((d) => d.groupId !== groupId))
        setAssignments((list) => list.filter((a) => a.groupId !== groupId))
      } else {
        setGroups((list) => list.map((g) => (g.id === groupId ? { ...g, members: g.members.filter((m) => m.userId !== memberId) } : g)))
        setAssignments((list) => list.map((a) => (a.groupId === groupId && a.assigneeId === memberId ? { ...a, assigneeId: null } : a)))
      }
    },
    [isDemo],
  )

  const saveAssignment = useCallback(
    async (input: api.AssignmentInput) => {
      const saved: Assignment = isDemo ? { ...input, id: input.id ?? localId() } : await api.saveAssignment(input)
      setAssignments((list) => upsert(list, saved))
      return saved
    },
    [isDemo],
  )

  const deleteAssignment = useCallback(
    async (id: string) => {
      if (!isDemo) await api.deleteAssignment(id)
      setAssignments((list) => list.filter((a) => a.id !== id))
    },
    [isDemo],
  )

  const createShareLink = useCallback(
    async (deadlineId: string) => {
      if (isDemo) throw new Error(DEMO_ONLY_ONLINE)
      return api.createShareLink(deadlineId)
    },
    [isDemo],
  )

  // ----- Kế hoạch học -----
  const sortByStart = (list: StudySession[]) => [...list].sort((a, b) => a.startAt.localeCompare(b.startAt))

  const saveStudySession = useCallback(
    async (input: api.StudySessionInput) => {
      const saved: StudySession = isDemo ? { ...input, id: input.id ?? localId() } : await api.saveStudySession(input)
      setStudySessions((list) => sortByStart(upsert(list, saved)))
      return saved
    },
    [isDemo],
  )

  // ----- Hồ sơ -----
  const applyProfile = useCallback((profile: UserProfile) => {
    setUser(profile)
    // Tên / ảnh của mình trong danh sách thành viên các nhóm cũng đổi theo
    setGroups((list) =>
      list.map((g) => ({
        ...g,
        members: g.members.map((m) => (m.userId === profile.id ? { ...m, fullName: profile.fullName, avatarUrl: profile.avatarUrl } : m)),
      })),
    )
    return profile
  }, [])

  const userRef = useRef(user)
  userRef.current = user

  const saveProfile = useCallback(
    async (input: api.ProfileUpdate) => {
      const current = userRef.current
      if (isDemo) {
        return applyProfile({
          ...current,
          fullName: input.fullName.trim().replace(/\s+/g, ' '),
          studentCode: input.studentCode.trim(),
          campus: input.campus,
        })
      }
      return applyProfile(await api.updateProfile(current.id, input))
    },
    [isDemo, applyProfile],
  )

  const changeAvatar = useCallback(
    async (file: { blob: Blob; type: string; ext: string } | null) => {
      const current = userRef.current
      if (isDemo) {
        // Demo: ảnh chỉ nằm trong bộ nhớ trình duyệt
        if (current.avatarUrl?.startsWith('blob:')) URL.revokeObjectURL(current.avatarUrl)
        return applyProfile({ ...current, avatarUrl: file ? URL.createObjectURL(file.blob) : undefined })
      }
      return applyProfile(file ? await api.uploadAvatar(current.id, file) : await api.removeAvatar(current.id))
    },
    [isDemo, applyProfile],
  )

  const deleteStudySession = useCallback(
    async (id: string) => {
      if (!isDemo) await api.deleteStudySession(id)
      setStudySessions((list) => list.filter((x) => x.id !== id))
    },
    [isDemo],
  )

  const toggleStudySessionDone = useCallback(
    (id: string) => {
      const prev = studySessionsRef.current.find((x) => x.id === id)
      if (!prev) return
      const next = { ...prev, isDone: !prev.isDone }
      setStudySessions((list) => list.map((x) => (x.id === id ? next : x)))
      if (isDemo) return
      api.saveStudySession(next).catch((e: unknown) => {
        setStudySessions((list) => list.map((x) => (x.id === id ? prev : x)))
        setError(`Không cập nhật được buổi học: ${e instanceof Error ? e.message : 'lỗi không xác định'}`)
      })
    },
    [isDemo],
  )

  const value = useMemo<AppData>(() => {
    const courseMap = new Map(courses.map((c) => [c.id, c]))
    const groupMap = new Map(groups.map((g) => [g.id, g]))
    return {
      status,
      error,
      isDemo,
      user,
      courses,
      schedules,
      exams,
      deadlines,
      groups,
      assignments,
      courseById: (id) => (id ? courseMap.get(id) : undefined),
      groupById: (id) => (id ? groupMap.get(id) : undefined),
      reload: () => void loadAll(),
      dismissError: () => setError(null),
      setTaskStatus,
      toggleSubtask,
      saveDeadline,
      deleteDeadline,
      saveCourse,
      deleteCourse,
      saveSchedule,
      deleteSchedule,
      saveExam,
      deleteExam,
      createGroup,
      deleteGroup,
      inviteMember,
      invitations,
      respondInvitation,
      removeMember,
      saveAssignment,
      deleteAssignment,
      createShareLink,
      studySessions,
      saveStudySession,
      deleteStudySession,
      toggleStudySessionDone,
      saveProfile,
      changeAvatar,
    }
  }, [
    status, error, isDemo, user, courses, schedules, exams, deadlines, groups, assignments, loadAll,
    setTaskStatus, toggleSubtask, saveDeadline, deleteDeadline, saveCourse, deleteCourse, saveSchedule, deleteSchedule,
    saveExam, deleteExam, createGroup, deleteGroup, inviteMember, invitations, respondInvitation, removeMember, saveAssignment, deleteAssignment, createShareLink,
    studySessions, saveStudySession, deleteStudySession, toggleStudySessionDone, saveProfile, changeAvatar,
  ])

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>
}

export function useAppData(): AppData {
  const ctx = useContext(AppDataContext)
  if (!ctx) throw new Error('useAppData phải được dùng bên trong <AppDataProvider>')
  return ctx
}
