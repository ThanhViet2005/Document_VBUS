export type BlockName = 'Block 1' | 'Block 2' | 'Block 3'

export type CourseColor = 'red' | 'blue' | 'purple' | 'orange' | 'green' | 'teal' | 'pink' | 'amber'

export type TaskType = 'assignment' | 'lab' | 'practical' | 'revision' | 'group_project'

export type Priority = 'low' | 'medium' | 'high'

export type TaskStatus = 'todo' | 'in_progress' | 'done'

export interface UserProfile {
  id: string
  email: string
  fullName: string
  studentCode: string
  campus: string
  avatarUrl?: string
  /** admin: thêm / sửa / khóa tài khoản người dùng (trang Quản trị) và vẫn dùng app như người dùng thường */
  role: UserRole
  isLocked: boolean
  lockedReason?: string | null
}

export type UserRole = 'user' | 'admin'

export interface Course {
  id: string
  userId: string
  code: string
  name: string
  colorCode: CourseColor
  /** Màu tự chọn (#rrggbb). Không có / null = dùng màu gợi ý colorCode */
  colorHex?: string | null
  /** Giảng viên của môn (nhập ở form môn). Không có → lấy từ thời khóa biểu */
  lecturer?: string | null
  blockName: BlockName
  semester: string | null
}

export interface Schedule {
  id: string
  courseId: string
  /** 1 = Thứ 2 ... 7 = Chủ nhật */
  dayOfWeek: number
  room: string
  lecturer: string
  /** HH:mm */
  startTime: string
  endTime: string
  blockPeriod: BlockName
  /** Ngày học buổi cuối (YYYY-MM-DD). Không có = lặp hằng tuần mãi */
  endDate?: string | null
  /** Ngày học buổi đầu (YYYY-MM-DD). Không có = lặp từ trước tới nay */
  startDate?: string | null
  /** Các ngày bỏ buổi (đã dời riêng sang chỗ khác) */
  skipDates?: string[]
}

export interface Subtask {
  id: string
  title: string
  isCompleted: boolean
}

export interface Deadline {
  id: string
  userId: string
  courseId: string | null
  groupId: string | null
  title: string
  taskType: TaskType
  /** ISO datetime */
  dueDate: string
  priority: Priority
  status: TaskStatus
  progressPercent: number
  notes?: string
  isGroup: boolean
  subtasks: Subtask[]
}

export type ExamType = 'PE' | 'FE'

export interface Exam {
  id: string
  courseId: string
  examType: ExamType
  /** ISO datetime */
  examDate: string
  durationMinutes: number | null
  room: string
  /** Hình thức thi: Thực hành trên máy, Trắc nghiệm... */
  examFormat: string
  weightPercentage: number | null
  notes: string
}

export type GroupRole = 'owner' | 'member'

export interface GroupMember {
  userId: string
  role: GroupRole
  fullName: string
  email: string
  avatarUrl?: string
}

export interface Group {
  id: string
  name: string
  description: string
  courseId: string | null
  ownerId: string
  members: GroupMember[]
}

/** Gợi ý tài khoản khi chủ nhóm gõ tên / email để mời */
export interface InviteCandidate {
  userId: string
  fullName: string
  avatarUrl?: string
  /** Email đã che, vd "vi***@fpt.edu.vn" – để phân biệt người trùng tên */
  emailHint: string
  /** Đã có lời mời đang chờ trả lời */
  invited: boolean
}

/** Lời mời vào nhóm mình nhận được (chưa là thành viên nên kèm sẵn tên nhóm / môn / người mời) */
export interface GroupInvitation {
  id: string
  groupId: string
  groupName: string
  courseCode: string | null
  courseName: string | null
  inviterName: string
  inviterAvatar?: string
  memberCount: number
  createdAt: string
}

/** Lời mời chủ nhóm đã gửi: đang chờ hoặc bị từ chối */
export interface SentInvitation {
  id: string
  userId: string
  fullName: string
  avatarUrl?: string
  status: 'pending' | 'declined'
  createdAt: string
}

export interface Assignment {
  id: string
  groupId: string
  deadlineId: string
  assigneeId: string | null
  title: string
  status: TaskStatus
  dueDate: string | null
}

/** Dữ liệu tối thiểu trả về từ link chia sẻ (RPC get_shared_deadline) */
export interface SharedDeadline {
  title: string
  taskType: TaskType
  dueDate: string
  priority: Priority
  notes: string | null
  expiresAt: string | null
  course: { code: string; name: string; colorCode: CourseColor; blockName: BlockName } | null
  subtasks: { title: string }[]
}

/** Buổi tự học trong Kế hoạch học */
export interface StudySession {
  id: string
  courseId: string | null
  deadlineId: string | null
  examId: string | null
  title: string
  /** ISO datetime */
  startAt: string
  endAt: string
  isDone: boolean
  notes: string
}
