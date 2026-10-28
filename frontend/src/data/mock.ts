import type { Assignment, Course, Deadline, Exam, Group, Schedule, StudySession, UserProfile } from '../types'

// Dữ liệu mẫu cho chế độ demo (khi chưa cấu hình Supabase trong .env).
// Hạn nộp tính tương đối theo hôm nay để dashboard luôn có dữ liệu.
function at(dayOffset: number, hour = 23, minute = 59): string {
  const d = new Date()
  d.setDate(d.getDate() + dayOffset)
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}

export const mockUser: UserProfile = {
  id: 'u1',
  email: 'vietnt@fpt.edu.vn',
  fullName: 'Nguyễn Thanh Việt',
  studentCode: 'DE180001',
  campus: 'FPT University Đà Nẵng',
  role: 'user',
  isLocked: false,
}

const own = { userId: mockUser.id, semester: 'Fall 2026' }

export const mockCourses: Course[] = [
  { id: 'c1', code: 'PRO192', name: 'Lập trình hướng đối tượng với Java', colorCode: 'red', blockName: 'Block 1', ...own },
  { id: 'c2', code: 'MKT202', name: 'Nguyên lý Marketing', colorCode: 'blue', blockName: 'Block 1', ...own },
  { id: 'c3', code: 'MAD101', name: 'Toán rời rạc', colorCode: 'purple', blockName: 'Block 1', ...own },
  { id: 'c4', code: 'WED201c', name: 'Thiết kế Web', colorCode: 'orange', blockName: 'Block 2', ...own },
  { id: 'c5', code: 'SWE201c', name: 'Nhập môn Kỹ thuật phần mềm', colorCode: 'green', blockName: 'Block 2', ...own },
  { id: 'c6', code: 'ENW492c', name: 'Viết học thuật', colorCode: 'teal', blockName: 'Block 2', ...own },
]

// Thời khóa biểu lặp theo tuần, có lịch mỗi ngày để luôn có dữ liệu "Lịch học hôm nay"
export const mockSchedules: Schedule[] = [
  { id: 's1', courseId: 'c1', dayOfWeek: 1, room: 'DE-201', lecturer: 'ThS. Trần Văn An', startTime: '07:00', endTime: '09:15', blockPeriod: 'Block 1' },
  { id: 's2', courseId: 'c2', dayOfWeek: 1, room: 'DE-305', lecturer: 'ThS. Lê Thị Bình', startTime: '09:30', endTime: '11:45', blockPeriod: 'Block 1' },
  { id: 's3', courseId: 'c3', dayOfWeek: 2, room: 'AL-L104', lecturer: 'TS. Phạm Văn Cường', startTime: '12:30', endTime: '14:45', blockPeriod: 'Block 1' },
  { id: 's4', courseId: 'c1', dayOfWeek: 3, room: 'DE-201', lecturer: 'ThS. Trần Văn An', startTime: '07:00', endTime: '09:15', blockPeriod: 'Block 1' },
  { id: 's5', courseId: 'c2', dayOfWeek: 4, room: 'DE-305', lecturer: 'ThS. Lê Thị Bình', startTime: '09:30', endTime: '11:45', blockPeriod: 'Block 1' },
  { id: 's6', courseId: 'c3', dayOfWeek: 5, room: 'AL-L104', lecturer: 'TS. Phạm Văn Cường', startTime: '12:30', endTime: '14:45', blockPeriod: 'Block 1' },
  { id: 's7', courseId: 'c1', dayOfWeek: 5, room: 'DE-LAB2', lecturer: 'ThS. Trần Văn An', startTime: '15:00', endTime: '17:15', blockPeriod: 'Block 1' },
  { id: 's8', courseId: 'c2', dayOfWeek: 6, room: 'DE-305', lecturer: 'ThS. Lê Thị Bình', startTime: '07:00', endTime: '09:15', blockPeriod: 'Block 1' },
  { id: 's9', courseId: 'c3', dayOfWeek: 7, room: 'Online', lecturer: 'TS. Phạm Văn Cường', startTime: '19:00', endTime: '20:30', blockPeriod: 'Block 1' },
]

type MockDeadline = Omit<Deadline, 'userId' | 'groupId'>

const rawDeadlines: MockDeadline[] = [
  {
    id: 'd1', courseId: 'c1', title: 'Lab 4 - Inheritance & Polymorphism', taskType: 'lab', dueDate: at(0, 23, 59),
    priority: 'high', status: 'in_progress', progressPercent: 60, isGroup: false,
    subtasks: [
      { id: 'st1', title: 'Đọc đề', isCompleted: true },
      { id: 'st2', title: 'Code class Animal', isCompleted: true },
      { id: 'st3', title: 'Viết unit test', isCompleted: false },
    ],
  },
  { id: 'd2', courseId: 'c2', title: 'Phân tích SWOT thương hiệu Highlands', taskType: 'assignment', dueDate: at(0, 17, 0), priority: 'medium', status: 'todo', progressPercent: 0, isGroup: false, subtasks: [] },
  { id: 'd3', courseId: 'c3', title: 'Bài tập chương 5 - Đồ thị', taskType: 'assignment', dueDate: at(2), priority: 'medium', status: 'todo', progressPercent: 0, isGroup: false, subtasks: [] },
  { id: 'd4', courseId: 'c2', title: 'Marketing Plan - Nhóm 4', taskType: 'group_project', dueDate: at(4), priority: 'high', status: 'in_progress', progressPercent: 35, isGroup: true, subtasks: [] },
  { id: 'd5', courseId: 'c1', title: 'Ôn tập PE - Collections', taskType: 'revision', dueDate: at(6), priority: 'low', status: 'todo', progressPercent: 0, isGroup: false, subtasks: [] },
  { id: 'd6', courseId: 'c2', title: 'Quiz chương 3 - Hành vi khách hàng', taskType: 'assignment', dueDate: at(-4), priority: 'medium', status: 'todo', progressPercent: 0, isGroup: false, subtasks: [] },
  { id: 'd7', courseId: 'c3', title: 'Practical: Quan hệ & Hàm', taskType: 'practical', dueDate: at(-1), priority: 'high', status: 'in_progress', progressPercent: 50, isGroup: false, subtasks: [] },
  { id: 'd8', courseId: 'c1', title: 'Lab 3 - Encapsulation', taskType: 'lab', dueDate: at(-3), priority: 'medium', status: 'done', progressPercent: 100, isGroup: false, subtasks: [] },
  { id: 'd9', courseId: 'c3', title: 'Bài tập chương 4 - Quy nạp', taskType: 'assignment', dueDate: at(-2), priority: 'low', status: 'done', progressPercent: 100, isGroup: false, subtasks: [] },
  { id: 'd10', courseId: 'c2', title: 'Đọc case study Vinamilk', taskType: 'revision', dueDate: at(-1), priority: 'low', status: 'done', progressPercent: 100, isGroup: false, subtasks: [] },
  { id: 'd11', courseId: 'c4', title: 'Wireframe Landing page', taskType: 'assignment', dueDate: at(1), priority: 'medium', status: 'done', progressPercent: 100, isGroup: false, subtasks: [] },
  { id: 'd12', courseId: 'c5', title: 'Viết User Story Sprint 1', taskType: 'group_project', dueDate: at(3), priority: 'high', status: 'todo', progressPercent: 10, isGroup: true, subtasks: [] },
  { id: 'd13', courseId: 'c6', title: 'Essay outline', taskType: 'assignment', dueDate: at(-5), priority: 'medium', status: 'done', progressPercent: 100, isGroup: false, subtasks: [] },
]

export const mockDeadlines: Deadline[] = rawDeadlines.map((d) => ({
  ...d,
  userId: mockUser.id,
  groupId: d.isGroup ? `g-${d.courseId}` : null,
}))

export const mockExams: Exam[] = [
  { id: 'e1', courseId: 'c1', examType: 'PE', examDate: at(12, 7, 30), durationMinutes: 90, room: 'DE-LAB2', examFormat: 'Thực hành trên máy', weightPercentage: 30, notes: 'Mang thẻ sinh viên' },
  { id: 'e2', courseId: 'c1', examType: 'FE', examDate: at(19, 9, 30), durationMinutes: 60, room: 'DE-201', examFormat: 'Trắc nghiệm trên máy', weightPercentage: 40, notes: '' },
  { id: 'e3', courseId: 'c2', examType: 'FE', examDate: at(21, 13, 0), durationMinutes: 60, room: 'DE-305', examFormat: 'Trắc nghiệm trên máy', weightPercentage: 40, notes: '' },
  { id: 'e4', courseId: 'c3', examType: 'FE', examDate: at(2, 7, 30), durationMinutes: 60, room: 'AL-L104', examFormat: 'Trắc nghiệm trên máy', weightPercentage: 50, notes: '' },
  { id: 'e5', courseId: 'c6', examType: 'PE', examDate: at(-6, 9, 0), durationMinutes: 90, room: 'DE-102', examFormat: 'Viết luận', weightPercentage: 30, notes: '' },
]

const friends = [
  { userId: 'u2', role: 'member' as const, fullName: 'Trần Minh Khoa', email: 'khoatm@fpt.edu.vn' },
  { userId: 'u3', role: 'member' as const, fullName: 'Lê Thảo Vy', email: 'vylt@fpt.edu.vn' },
]

export const mockGroups: Group[] = [
  {
    id: 'g-c2', name: 'MKT202 - Nhóm 4', description: 'Bài tập lớn Marketing Plan', courseId: 'c2', ownerId: mockUser.id,
    members: [{ userId: mockUser.id, role: 'owner', fullName: mockUser.fullName, email: mockUser.email }, ...friends],
  },
  {
    id: 'g-c5', name: 'SWE201c - Team Sprint', description: '', courseId: 'c5', ownerId: mockUser.id,
    members: [{ userId: mockUser.id, role: 'owner', fullName: mockUser.fullName, email: mockUser.email }, friends[0]],
  },
]

export const mockAssignments: Assignment[] = [
  { id: 'a1', groupId: 'g-c2', deadlineId: 'd4', assigneeId: mockUser.id, title: 'Phân tích thị trường & đối thủ', status: 'in_progress', dueDate: at(2) },
  { id: 'a2', groupId: 'g-c2', deadlineId: 'd4', assigneeId: 'u2', title: 'Chiến lược 4P', status: 'todo', dueDate: at(3) },
  { id: 'a3', groupId: 'g-c2', deadlineId: 'd4', assigneeId: 'u3', title: 'Thiết kế slide thuyết trình', status: 'done', dueDate: at(3) },
]

function slot(dayOffset: number, hour: number, minute: number, durationMin: number) {
  const start = new Date()
  start.setDate(start.getDate() + dayOffset)
  start.setHours(hour, minute, 0, 0)
  return { startAt: start.toISOString(), endAt: new Date(start.getTime() + durationMin * 60_000).toISOString() }
}

export const mockStudySessions: StudySession[] = [
  { id: 'ss1', courseId: 'c3', deadlineId: null, examId: 'e4', title: 'Ôn thi FE MAD101 - Đồ thị', ...slot(-1, 19, 30, 90), isDone: true, notes: 'Làm lại đề cũ 2024' },
  { id: 'ss2', courseId: 'c1', deadlineId: 'd1', examId: null, title: 'Làm Lab 4', ...slot(0, 19, 0, 120), isDone: false, notes: '' },
  { id: 'ss3', courseId: 'c2', deadlineId: 'd4', examId: null, title: 'Họp nhóm Marketing Plan', ...slot(1, 9, 0, 90), isDone: false, notes: 'Online qua Meet' },
  { id: 'ss4', courseId: 'c1', deadlineId: null, examId: 'e1', title: 'Ôn PE PRO192 - Collections', ...slot(2, 14, 0, 120), isDone: false, notes: '' },
]
