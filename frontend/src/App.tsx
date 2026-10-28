import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import AppLayout from './components/layout/AppLayout'
import DashboardPage from './pages/DashboardPage'
import { AppDataProvider, useAppData } from './store/AppData'
import { useAuth } from './store/Auth'

// Tách bundle theo trang: tải Dashboard nhanh, các trang khác tải khi cần
const TasksPage = lazy(() => import('./pages/TasksPage'))
const CalendarPage = lazy(() => import('./pages/CalendarPage'))
const CoursesPage = lazy(() => import('./pages/CoursesPage'))
const GroupsPage = lazy(() => import('./pages/GroupsPage'))
const PlanPage = lazy(() => import('./pages/PlanPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const AdminPage = lazy(() => import('./pages/AdminPage'))
const SharePage = lazy(() => import('./pages/SharePage'))
const UnsubscribePage = lazy(() => import('./pages/UnsubscribePage'))
const RegisterPage = lazy(() => import('./pages/RegisterPage'))
const LoginPage = lazy(() => import('./pages/LoginPage'))

function Spinner() {
  return (
    <div className="flex h-full min-h-40 items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
    </div>
  )
}

/** Chỉ cho vào khi đã đăng nhập (hoặc đang ở chế độ demo) */
function RequireAuth() {
  const { loading, userId } = useAuth()
  const location = useLocation()

  if (loading) return <Spinner />
  if (!userId) return <Navigate to="/login" replace state={{ from: location }} />

  return (
    // key: đổi tài khoản thì dựng lại toàn bộ dữ liệu
    <AppDataProvider key={userId}>
      <Outlet />
    </AppDataProvider>
  )
}

/** Trang chỉ dành cho admin. Chỉ là lớp giao diện: máy chủ (Edge Function admin-users) kiểm tra lại quyền ở mọi thao tác */
function RequireAdmin({ children }: { children: ReactNode }) {
  const { status, user } = useAppData()
  if (status === 'loading') return <Spinner />
  if (user.role !== 'admin') return <Navigate to="/" replace />
  return children
}

export default function App() {
  return (
    <Suspense fallback={<Spinner />}>
      <Routes>
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="s/:code" element={<SharePage />} />
        <Route path="unsubscribe" element={<UnsubscribePage />} />
        <Route element={<RequireAuth />}>
          <Route element={<AppLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="tasks" element={<TasksPage />} />
            <Route path="calendar" element={<CalendarPage />} />
            <Route path="courses" element={<CoursesPage />} />
            <Route path="groups" element={<GroupsPage />} />
            <Route path="plan" element={<PlanPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="admin" element={<RequireAdmin><AdminPage /></RequireAdmin>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  )
}
