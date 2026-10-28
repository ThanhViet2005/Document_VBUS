import { BookOpen, CalendarDays, GraduationCap, LayoutDashboard, ListTodo, Settings, ShieldCheck, Users, type LucideIcon } from 'lucide-react'
import type { UserRole } from '../../types'

export interface NavItem {
  to: string
  label: string
  /** Nhãn ngắn cho chỗ hẹp (thanh biểu tượng 80px, thanh dưới điện thoại); không có thì dùng label */
  shortLabel?: string
  icon: LucideIcon
  title: string
  subtitle: string
  showTaskBadge?: boolean
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Tổng quan', icon: LayoutDashboard, title: 'Tổng quan', subtitle: 'Xem nhanh tiến độ học tập của bạn' },
  { to: '/tasks', label: 'Nhiệm vụ', icon: ListTodo, title: 'Nhiệm vụ', subtitle: 'Quản lý deadline, bài tập và subtask', showTaskBadge: true },
  { to: '/calendar', label: 'Lịch', icon: CalendarDays, title: 'Lịch', subtitle: 'Thời khóa biểu và lịch thi PE / FE' },
  { to: '/courses', label: 'Môn học', icon: BookOpen, title: 'Môn học', subtitle: 'Các môn trong Block 1, 2 & 3' },
  { to: '/groups', label: 'Nhóm', icon: Users, title: 'Nhóm', subtitle: 'Bài tập lớn, chia việc và tiến độ nhóm' },
  { to: '/plan', label: 'Kế hoạch học', shortLabel: 'Kế hoạch', icon: GraduationCap, title: 'Kế hoạch học', subtitle: 'Lên lịch tự học, ôn thi và làm deadline trong tuần' },
]

export const SETTINGS_ITEM: NavItem = {
  to: '/settings',
  label: 'Cài đặt',
  icon: Settings,
  title: 'Cài đặt',
  subtitle: 'Hồ sơ cá nhân, ảnh đại diện, thông báo và tài khoản',
}

/** Chỉ hiện với admin; trang /admin còn được chặn ở route và máy chủ kiểm tra lại quyền ở mọi thao tác */
export const ADMIN_ITEM: NavItem = {
  to: '/admin',
  label: 'Quản trị',
  icon: ShieldCheck,
  title: 'Quản trị',
  subtitle: 'Quản lý tài khoản người dùng: thêm, sửa, phân quyền, khóa',
}

/** Toàn bộ mục điều hướng theo vai trò (admin có thêm Quản trị, mọi chức năng khác như người dùng thường) */
export function navItemsFor(role: UserRole): NavItem[] {
  return [...NAV_ITEMS, SETTINGS_ITEM, ...(role === 'admin' ? [ADMIN_ITEM] : [])]
}
