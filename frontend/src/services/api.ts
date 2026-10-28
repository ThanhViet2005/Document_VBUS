import { FunctionsHttpError } from '@supabase/supabase-js'
import type { Tables } from '../lib/database.types'
import { supabase } from '../lib/supabase'
import type {
  Assignment,
  Course,
  Deadline,
  Exam,
  Group,
  GroupInvitation,
  GroupMember,
  InviteCandidate,
  Schedule,
  SentInvitation,
  SharedDeadline,
  StudySession,
  Subtask,
  TaskStatus,
  UserProfile,
} from '../types'

// Mọi truy vấn đều chạy dưới quyền người dùng đang đăng nhập; RLS trên Postgres
// quyết định dữ liệu nào được trả về / được ghi.

function client() {
  if (!supabase) throw new Error('Supabase chưa được cấu hình')
  return supabase
}

/** Lỗi thân thiện: PT429 = rate limit (xem migration rate_limit) */
function toError(error: { message: string; code?: string }): Error {
  if (error.code === 'PT429') return new Error(error.message)
  if (error.code === '42501') return new Error('Bạn không có quyền thực hiện thao tác này')
  if (error.code === '23505') return new Error('Dữ liệu bị trùng (ví dụ: mã môn đã tồn tại trong học kỳ)')
  return new Error(error.message)
}

/** Không có lỗi thì data đã có (.single() đảm bảo); RPC có thể trả null → nơi gọi tự ép kiểu `| null` */
async function unwrap<R extends { data: unknown; error: { message: string; code?: string } | null }>(
  p: PromiseLike<R>,
): Promise<NonNullable<R['data']>> {
  const { data, error } = await p
  if (error) throw toError(error)
  return data as NonNullable<R['data']>
}

const nullIfEmpty = (s: string | null | undefined) => (s && s.trim() ? s.trim() : null)

// ----- Mappers -----
/**
 * Các cột hồ sơ được phép đọc (database cấp quyền SELECT theo cột). KHÔNG dùng select('*') cho bảng users:
 * locked_at / locked_reason không cấp quyền đọc (bạn cùng nhóm không được thấy); lý do khóa của chính mình lấy qua RPC my_lock_info.
 */
const USER_COLUMNS = 'id, email, full_name, student_code, campus, avatar_url, created_at, updated_at, role, is_locked'

type UserRow = Pick<Tables<'users'>, 'id' | 'email' | 'full_name' | 'student_code' | 'campus' | 'avatar_url' | 'role' | 'is_locked'> & {
  locked_reason?: string | null
}

export const toUser = (r: UserRow): UserProfile => ({
  id: r.id,
  email: r.email,
  fullName: r.full_name,
  studentCode: r.student_code ?? '',
  campus: r.campus,
  avatarUrl: r.avatar_url ?? undefined,
  // ?? : database chưa chạy migration 014 thì coi như người dùng thường
  role: r.role ?? 'user',
  isLocked: r.is_locked ?? false,
  lockedReason: r.locked_reason ?? null,
})

export const toCourse = (r: Tables<'courses'>): Course => ({
  id: r.id,
  userId: r.user_id,
  code: r.code,
  name: r.name,
  colorCode: r.color_code,
  // undefined = database chưa chạy migration 005 (chưa có cột)
  colorHex: r.color_hex,
  lecturer: r.lecturer,
  blockName: r.block_name,
  semester: r.semester,
})

export const toSchedule = (r: Tables<'schedules'>): Schedule => ({
  id: r.id,
  courseId: r.course_id,
  dayOfWeek: r.day_of_week,
  room: r.room ?? '',
  lecturer: r.lecturer ?? '',
  // Postgres trả "07:00:00" → giữ HH:mm
  startTime: r.start_time.slice(0, 5),
  endTime: r.end_time.slice(0, 5),
  blockPeriod: r.block_period,
  // undefined (khác null) khi database chưa có cột end_date
  endDate: r.end_date ?? undefined,
  startDate: r.start_date ?? undefined,
  skipDates: r.skip_dates ?? undefined,
})

export const toExam = (r: Tables<'exams'>): Exam => ({
  id: r.id,
  courseId: r.course_id,
  examType: r.exam_type,
  examDate: r.exam_date,
  durationMinutes: r.duration_minutes,
  room: r.room ?? '',
  examFormat: r.exam_format ?? '',
  weightPercentage: r.weight_percentage === null ? null : Number(r.weight_percentage),
  notes: r.notes ?? '',
})

const toSubtask = (r: Tables<'subtasks'>): Subtask => ({ id: r.id, title: r.title, isCompleted: r.is_completed })

type DeadlineRow = Tables<'deadlines'> & { subtasks: Tables<'subtasks'>[] }

export const toDeadline = (r: DeadlineRow): Deadline => ({
  id: r.id,
  userId: r.user_id,
  courseId: r.course_id,
  groupId: r.group_id,
  title: r.title,
  taskType: r.task_type,
  dueDate: r.due_date,
  priority: r.priority,
  status: r.status,
  progressPercent: r.progress_percent,
  notes: r.notes ?? undefined,
  isGroup: r.is_group,
  subtasks: [...r.subtasks]
    .sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at))
    .map(toSubtask),
})

type GroupRow = Tables<'groups'> & {
  group_members: (Pick<Tables<'group_members'>, 'user_id' | 'role'> & {
    users: Pick<Tables<'users'>, 'full_name' | 'email' | 'avatar_url'> | null
  })[]
}

const toGroup = (r: GroupRow): Group => ({
  id: r.id,
  name: r.name,
  description: r.description ?? '',
  courseId: r.course_id,
  ownerId: r.owner_id,
  members: r.group_members
    .map<GroupMember>((m) => ({
      userId: m.user_id,
      role: m.role,
      fullName: m.users?.full_name ?? '',
      email: m.users?.email ?? '',
      avatarUrl: m.users?.avatar_url ?? undefined,
    }))
    .sort((a, b) => (a.role === b.role ? a.fullName.localeCompare(b.fullName) : a.role === 'owner' ? -1 : 1)),
})

const toAssignment = (r: Tables<'assignments'>): Assignment => ({
  id: r.id,
  groupId: r.group_id,
  deadlineId: r.deadline_id,
  assigneeId: r.assignee_id,
  title: r.title,
  status: r.status,
  dueDate: r.due_date,
})

// ----- Mốc nhắc deadline (bảng reminder_prefs, migration 020) -----
/** null = người dùng chưa chọn (máy chủ dùng mặc định) */
export async function fetchReminderKinds(userId: string): Promise<string[] | null> {
  const { data, error } = await client().from('reminder_prefs').select('kinds').eq('user_id', userId).maybeSingle()
  if (error) throw toError(error)
  return data?.kinds ?? null
}

export async function saveReminderKinds(userId: string, kinds: string[]): Promise<void> {
  const { error } = await client().from('reminder_prefs').upsert({ user_id: userId, kinds, updated_at: new Date().toISOString() })
  if (error) {
    // Chưa chạy migration 020 trên Supabase
    if (error.code === '42P01' || error.code === 'PGRST205') throw new Error('Máy chủ chưa hỗ trợ chọn mốc nhắc (cần chạy migration 20261023000020_reminder_prefs.sql).')
    throw toError(error)
  }
}

// ----- Email tổng hợp mỗi sáng (bảng email_prefs, migration 008; gửi bởi Edge Function send-email-digest) -----
const MISSING_EMAIL_MIGRATION = 'Máy chủ chưa hỗ trợ email tổng hợp (cần chạy migration 20261025000008_email_digest.sql).'

/** false khi chưa từng bật (mặc định tắt) */
export async function fetchEmailDigest(userId: string): Promise<boolean> {
  const { data, error } = await client().from('email_prefs').select('enabled').eq('user_id', userId).maybeSingle()
  if (error) throw error.code === '42P01' || error.code === 'PGRST205' ? new Error(MISSING_EMAIL_MIGRATION) : toError(error)
  return data?.enabled ?? false
}

export async function setEmailDigest(enabled: boolean): Promise<void> {
  const { error } = await client().rpc('set_email_digest', { p_enabled: enabled })
  if (error) throw error.code === 'PGRST202' ? new Error(MISSING_EMAIL_MIGRATION) : toError(error)
}

/** Gọi Edge Function send-email-digest; lỗi HTTP → ném thông báo tiếng Việt máy chủ trả về */
async function invokeEmailFunction<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await client().functions.invoke<T>('send-email-digest', { body })
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const res = (await error.context.json().catch(() => null)) as { error?: string } | null
      throw new Error(res?.error ?? 'Máy chủ gửi email thất bại')
    }
    throw new Error('Không gọi được máy chủ gửi email')
  }
  return data as T
}

/** Gửi ngay 1 email tổng hợp (email thử) tới email đăng nhập của chính mình */
export async function sendTestDigestEmail(): Promise<string> {
  return (await invokeEmailFunction<{ email: string }>({})).email
}

/** Link "Hủy nhận email" (không cần đăng nhập). true = đã tắt */
export async function unsubscribeDigest(token: string): Promise<boolean> {
  return (await invokeEmailFunction<{ ok: boolean }>({ unsubscribe: token })).ok
}

// ----- Hồ sơ -----
export async function fetchProfile(userId: string): Promise<UserProfile> {
  const row = await unwrap(client().from('users').select(USER_COLUMNS).eq('id', userId).single())
  if (!row.is_locked) return toUser(row)
  // Bị khóa: lấy lý do khóa của chính mình qua RPC (cột này không đọc trực tiếp được)
  const { data } = await client().rpc('my_lock_info')
  const info = (data ?? {}) as { locked_reason?: string | null }
  return toUser({ ...row, locked_reason: info.locked_reason ?? null })
}

export interface ProfileUpdate {
  fullName: string
  studentCode: string
  campus: string
}

/** Chỉ gửi các cột được phép sửa (database cấp quyền UPDATE theo cột, migration 011) */
export async function updateProfile(userId: string, input: ProfileUpdate): Promise<UserProfile> {
  return toUser(
    await unwrap(
      client()
        .from('users')
        .update({ full_name: input.fullName.trim().replace(/\s+/g, ' '), student_code: nullIfEmpty(input.studentCode.trim()), campus: input.campus })
        .eq('id', userId)
        .select(USER_COLUMNS)
        .single(),
    ),
  )
}

const AVATAR_BUCKET = 'avatars'

/** Xóa các ảnh cũ trong thư mục của mình (trừ file đang dùng). Lỗi không quan trọng → bỏ qua. */
async function cleanupAvatars(userId: string, keep?: string) {
  const storage = client().storage.from(AVATAR_BUCKET)
  const { data } = await storage.list(userId, { limit: 100 })
  const old = (data ?? []).map((f) => `${userId}/${f.name}`).filter((p) => p !== keep)
  if (old.length) await storage.remove(old)
}

/**
 * Tải ảnh (đã cắt & nén ở trình duyệt) vào avatars/<uid>/avatar-<thời gian>.<ext>, rồi lưu URL vào hồ sơ.
 * Tên file mới mỗi lần → không bị cache ảnh cũ (CDN, trình duyệt của bạn cùng nhóm).
 */
export async function uploadAvatar(userId: string, file: { blob: Blob; type: string; ext: string }): Promise<UserProfile> {
  const path = `${userId}/avatar-${Date.now()}.${file.ext}`
  const storage = client().storage.from(AVATAR_BUCKET)
  const { error } = await storage.upload(path, file.blob, { contentType: file.type, cacheControl: '31536000', upsert: false })
  if (error) throw new Error(/exceeded|too large|payload/i.test(error.message) ? 'Ảnh quá lớn (tối đa 2 MB)' : `Không tải được ảnh: ${error.message}`)
  const url = storage.getPublicUrl(path).data.publicUrl
  let profile: UserProfile
  try {
    profile = toUser(await unwrap(client().from('users').update({ avatar_url: url }).eq('id', userId).select(USER_COLUMNS).single()))
  } catch (e) {
    await storage.remove([path]) // không để lại file mồ côi
    throw e
  }
  await cleanupAvatars(userId, path).catch(() => {})
  return profile
}

export async function removeAvatar(userId: string): Promise<UserProfile> {
  const profile = toUser(await unwrap(client().from('users').update({ avatar_url: null }).eq('id', userId).select(USER_COLUMNS).single()))
  await cleanupAvatars(userId).catch(() => {})
  return profile
}

// ----- Môn học -----
export type CourseInput = Omit<Course, 'id' | 'userId'> & { id?: string }

export async function fetchCourses(): Promise<Course[]> {
  const rows = await unwrap(client().from('courses').select('*').order('block_name').order('code'))
  return rows.map(toCourse)
}

export async function saveCourse(input: CourseInput): Promise<Course> {
  const values = {
    code: input.code.trim(),
    name: input.name.trim(),
    color_code: input.colorCode,
    // Chỉ gửi khi có thay đổi màu tự chọn: database chưa chạy migration 005 vẫn lưu được môn với màu gợi ý
    ...(input.colorHex !== undefined && { color_hex: input.colorHex ? input.colorHex.toLowerCase() : null }),
    // Tương tự: chỉ gửi khi có giảng viên (hoặc xóa giảng viên đã có) – database chưa chạy migration 006 vẫn lưu được
    ...(input.lecturer !== undefined && { lecturer: nullIfEmpty(input.lecturer) }),
    block_name: input.blockName,
    semester: nullIfEmpty(input.semester),
  }
  const q = input.id
    ? client().from('courses').update(values).eq('id', input.id).select('*').single()
    : client().from('courses').insert(values).select('*').single()
  return toCourse(await unwrap(q))
}

export async function deleteCourse(id: string): Promise<void> {
  await unwrap(client().from('courses').delete().eq('id', id))
}

// ----- Thời khóa biểu -----
export type ScheduleInput = Omit<Schedule, 'id'> & { id?: string }

export async function fetchSchedules(userId: string): Promise<Schedule[]> {
  const rows = await unwrap(
    client().from('schedules').select('*').eq('user_id', userId).order('day_of_week').order('start_time'),
  )
  return rows.map(toSchedule)
}

export async function saveSchedule(input: ScheduleInput): Promise<Schedule> {
  const values = {
    course_id: input.courseId,
    day_of_week: input.dayOfWeek,
    room: nullIfEmpty(input.room),
    lecturer: nullIfEmpty(input.lecturer),
    start_time: input.startTime,
    end_time: input.endTime,
    block_period: input.blockPeriod,
    // Chỉ gửi end_date khi form có đụng tới (undefined = không đổi). Nhờ vậy kéo thả / sửa lịch vẫn chạy
    // trên database chưa chạy migration 012 (chưa có cột end_date)
    ...(input.endDate !== undefined && { end_date: input.endDate || null }),
    ...(input.startDate !== undefined && { start_date: input.startDate || null }),
    ...(input.skipDates !== undefined && { skip_dates: input.skipDates }),
  }
  const q = input.id
    ? client().from('schedules').update(values).eq('id', input.id).select('*').single()
    : client().from('schedules').insert(values).select('*').single()
  return toSchedule(await unwrap(q))
}

export async function deleteSchedule(id: string): Promise<void> {
  await unwrap(client().from('schedules').delete().eq('id', id))
}

// ----- Kỳ thi -----
export type ExamInput = Omit<Exam, 'id'> & { id?: string }

export async function fetchExams(userId: string): Promise<Exam[]> {
  const rows = await unwrap(client().from('exams').select('*').eq('user_id', userId).order('exam_date'))
  return rows.map(toExam)
}

export async function saveExam(input: ExamInput): Promise<Exam> {
  const values = {
    course_id: input.courseId,
    exam_type: input.examType,
    exam_date: input.examDate,
    duration_minutes: input.durationMinutes,
    room: nullIfEmpty(input.room),
    exam_format: nullIfEmpty(input.examFormat),
    weight_percentage: input.weightPercentage,
    notes: nullIfEmpty(input.notes),
  }
  const q = input.id
    ? client().from('exams').update(values).eq('id', input.id).select('*').single()
    : client().from('exams').insert(values).select('*').single()
  return toExam(await unwrap(q))
}

export async function deleteExam(id: string): Promise<void> {
  await unwrap(client().from('exams').delete().eq('id', id))
}

// ----- Deadline & subtask -----
export type DeadlineInput = Omit<Deadline, 'id' | 'userId' | 'isGroup'> & { id?: string }

export async function fetchDeadlines(): Promise<Deadline[]> {
  const rows = await unwrap(client().from('deadlines').select('*, subtasks(*)').order('due_date').limit(1000))
  return rows.map(toDeadline)
}

async function fetchDeadline(id: string): Promise<Deadline> {
  return toDeadline(await unwrap(client().from('deadlines').select('*, subtasks(*)').eq('id', id).single()))
}

/**
 * Lưu deadline + đồng bộ subtask: xóa subtask bị bỏ, upsert phần còn lại theo thứ tự.
 * Subtask mới cần id do client sinh (crypto.randomUUID) để upsert được.
 */
export async function saveDeadline(input: DeadlineInput): Promise<Deadline> {
  const values = {
    course_id: input.courseId,
    title: input.title.trim(),
    task_type: input.taskType,
    due_date: input.dueDate,
    priority: input.priority,
    status: input.status,
    progress_percent: input.progressPercent,
    notes: nullIfEmpty(input.notes),
  }
  const row = input.id
    ? await unwrap(client().from('deadlines').update(values).eq('id', input.id).select('id').single())
    : await unwrap(client().from('deadlines').insert({ ...values, group_id: input.groupId }).select('id').single())
  const id = row.id

  const keep = input.subtasks.map((s) => s.id)
  if (input.id) {
    let del = client().from('subtasks').delete().eq('deadline_id', id)
    if (keep.length) del = del.not('id', 'in', `(${keep.join(',')})`)
    await unwrap(del)
  }
  if (input.subtasks.length) {
    await unwrap(
      client()
        .from('subtasks')
        .upsert(input.subtasks.map((s, i) => ({ id: s.id, deadline_id: id, title: s.title.trim(), is_completed: s.isCompleted, position: i })))
        .select('id'),
    )
  }
  return fetchDeadline(id)
}

export async function deleteDeadline(id: string): Promise<void> {
  await unwrap(client().from('deadlines').delete().eq('id', id))
}

export async function updateDeadlineStatus(id: string, status: TaskStatus, progressPercent: number): Promise<void> {
  await unwrap(client().from('deadlines').update({ status, progress_percent: progressPercent }).eq('id', id).select('id').single())
}

/** Đổi trạng thái subtask, đồng thời cập nhật % tiến độ của deadline (cũng kích hoạt realtime cho cả nhóm) */
export async function setSubtaskCompleted(deadline: Deadline, subtaskId: string, isCompleted: boolean, progressPercent: number, status: TaskStatus) {
  await unwrap(client().from('subtasks').update({ is_completed: isCompleted }).eq('id', subtaskId).select('id').single())
  await updateDeadlineStatus(deadline.id, status, progressPercent)
}

/** Đổi trạng thái kèm tick / bỏ tick MỌI subtask (Hoàn thành / Chưa bắt đầu) – đặt subtask trước để realtime của nhóm thấy đúng */
export async function setDeadlineStatusWithSubtasks(id: string, status: TaskStatus, progressPercent: number, allSubtasks: boolean) {
  await unwrap(client().from('subtasks').update({ is_completed: allSubtasks }).eq('deadline_id', id).select('id'))
  await updateDeadlineStatus(id, status, progressPercent)
}

// ----- Nhóm -----
export async function fetchGroups(): Promise<Group[]> {
  const rows = await unwrap(
    client()
      .from('groups')
      .select('*, group_members(user_id, role, users(full_name, email, avatar_url))')
      .order('created_at'),
  )
  return (rows as unknown as GroupRow[]).map(toGroup)
}

export async function createGroup(input: { name: string; description: string; courseId: string | null }): Promise<Group> {
  const row = await unwrap(
    client()
      .from('groups')
      .insert({ name: input.name.trim(), description: nullIfEmpty(input.description), course_id: input.courseId })
      .select('id')
      .single(),
  )
  const groups = await fetchGroups()
  const group = groups.find((g) => g.id === row.id)
  if (!group) throw new Error('Không tải được nhóm vừa tạo')
  return group
}

export async function deleteGroup(id: string): Promise<void> {
  await unwrap(client().from('groups').delete().eq('id', id))
}

// ----- Lời mời vào nhóm: chủ nhóm mời, người được mời đồng ý thì mới vào nhóm -----

/** Gợi ý tối đa 3 tài khoản theo tên (không phân biệt dấu) hoặc đúng email; bỏ qua người đã trong nhóm */
export async function searchInvitableUsers(groupId: string, query: string): Promise<InviteCandidate[]> {
  const rows = await unwrap(client().rpc('search_invitable_users_limited', { p_group_id: groupId, p_query: query.trim() }))
  return (rows ?? []).map((r) => ({
    userId: r.user_id,
    fullName: r.full_name,
    avatarUrl: r.avatar_url ?? undefined,
    emailHint: r.email_hint,
    invited: r.invited,
  }))
}

export async function inviteToGroup(groupId: string, userId: string): Promise<void> {
  await unwrap(client().rpc('invite_to_group_limited', { p_group_id: groupId, p_user_id: userId }))
}

export async function fetchMyInvitations(): Promise<GroupInvitation[]> {
  const rows = await unwrap(client().rpc('my_group_invitations'))
  return (rows ?? []).map((r) => ({
    id: r.id,
    groupId: r.group_id,
    groupName: r.group_name,
    courseCode: r.course_code,
    courseName: r.course_name,
    inviterName: r.inviter_name ?? 'Chủ nhóm',
    inviterAvatar: r.inviter_avatar ?? undefined,
    memberCount: r.member_count,
    createdAt: r.created_at,
  }))
}

export async function fetchSentInvitations(groupId: string): Promise<SentInvitation[]> {
  const rows = await unwrap(client().rpc('group_sent_invitations', { p_group_id: groupId }))
  return (rows ?? []).map((r) => ({
    id: r.id,
    userId: r.user_id,
    fullName: r.full_name,
    avatarUrl: r.avatar_url ?? undefined,
    status: r.status,
    createdAt: r.created_at,
  }))
}

/** Đồng ý (vào nhóm) hoặc từ chối lời mời */
export async function respondInvitation(invitationId: string, accept: boolean): Promise<void> {
  await unwrap(client().rpc('respond_group_invitation', { p_invitation_id: invitationId, p_accept: accept }))
}

/** Chủ nhóm thu hồi lời mời (hoặc xóa lời mời đã bị từ chối) */
export async function cancelInvitation(invitationId: string): Promise<void> {
  await unwrap(client().from('group_invitations').delete().eq('id', invitationId))
}

export async function removeGroupMember(groupId: string, userId: string): Promise<void> {
  const rows = await unwrap(client().from('group_members').delete().eq('group_id', groupId).eq('user_id', userId).select('user_id'))
  if (rows.length === 0) throw new Error('Không thể xóa thành viên này')
}

// ----- Phân công -----
export type AssignmentInput = Omit<Assignment, 'id'> & { id?: string }

export async function fetchAssignments(): Promise<Assignment[]> {
  const rows = await unwrap(client().from('assignments').select('*').order('created_at'))
  return rows.map(toAssignment)
}

export async function saveAssignment(input: AssignmentInput): Promise<Assignment> {
  const values = { assignee_id: input.assigneeId, title: input.title.trim(), status: input.status, due_date: input.dueDate }
  const q = input.id
    ? client().from('assignments').update(values).eq('id', input.id).select('*').single()
    : client().from('assignments').insert({ ...values, group_id: input.groupId, deadline_id: input.deadlineId }).select('*').single()
  return toAssignment(await unwrap(q))
}

export async function deleteAssignment(id: string): Promise<void> {
  await unwrap(client().from('assignments').delete().eq('id', id))
}

// ----- Chia sẻ -----
export async function createShareLink(deadlineId: string, includeNotes = false): Promise<string> {
  const row = await unwrap(client().from('share_links').insert({ deadline_id: deadlineId, include_notes: includeNotes }).select('code').single())
  return row.code
}

export async function getSharedDeadline(code: string): Promise<SharedDeadline | null> {
  const data = (await unwrap(client().rpc('get_shared_deadline', { p_code: code }))) as {
    title: string
    task_type: SharedDeadline['taskType']
    due_date: string
    priority: SharedDeadline['priority']
    notes: string | null
    expires_at: string | null
    course: { code: string; name: string; color_code: Course['colorCode']; block_name: Course['blockName'] } | null
    subtasks: { title: string }[]
  } | null
  if (!data) return null
  return {
    title: data.title,
    taskType: data.task_type,
    dueDate: data.due_date,
    priority: data.priority,
    notes: data.notes,
    expiresAt: data.expires_at,
    course: data.course && { code: data.course.code, name: data.course.name, colorCode: data.course.color_code, blockName: data.course.block_name },
    subtasks: data.subtasks,
  }
}

export async function copySharedDeadline(code: string): Promise<string> {
  return unwrap(client().rpc('copy_shared_deadline_limited', { p_code: code }))
}

// ----- Kế hoạch học -----
export type StudySessionInput = Omit<StudySession, 'id'> & { id?: string }

const toStudySession = (r: Tables<'study_sessions'>): StudySession => ({
  id: r.id,
  courseId: r.course_id,
  deadlineId: r.deadline_id,
  examId: r.exam_id,
  title: r.title,
  startAt: r.start_at,
  endAt: r.end_at,
  isDone: r.is_done,
  notes: r.notes ?? '',
})

/** Buổi học từ 60 ngày trước trở đi (đủ cho thống kê, không tải lịch sử quá dài) */
export async function fetchStudySessions(userId: string): Promise<StudySession[]> {
  const since = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()
  const rows = await unwrap(
    client().from('study_sessions').select('*').eq('user_id', userId).gte('start_at', since).order('start_at').limit(1000),
  )
  return rows.map(toStudySession)
}

export async function saveStudySession(input: StudySessionInput): Promise<StudySession> {
  const values = {
    course_id: input.courseId,
    deadline_id: input.deadlineId,
    exam_id: input.examId,
    title: input.title.trim(),
    start_at: input.startAt,
    end_at: input.endAt,
    is_done: input.isDone,
    notes: nullIfEmpty(input.notes),
  }
  const q = input.id
    ? client().from('study_sessions').update(values).eq('id', input.id).select('*').single()
    : client().from('study_sessions').insert(values).select('*').single()
  return toStudySession(await unwrap(q))
}

export async function deleteStudySession(id: string): Promise<void> {
  await unwrap(client().from('study_sessions').delete().eq('id', id))
}
