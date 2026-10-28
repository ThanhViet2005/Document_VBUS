import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../store/Auth'

/** Đăng xuất rồi về trang đăng nhập (dùng chung cho Sidebar và trang Cài đặt) */
export function useSignOut() {
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)

  const run = useCallback(async () => {
    setBusy(true)
    try {
      await signOut()
    } finally {
      setBusy(false)
      // Không giữ trang cũ trong lịch sử (máy có thể được người khác dùng tiếp)
      navigate('/login', { replace: true })
    }
  }, [signOut, navigate])

  return { signOut: run, busy }
}
