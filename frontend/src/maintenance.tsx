// Điểm vào của BẢN BẢO TRÌ (build với VITE_MAINTENANCE=1, xem vite.config.ts → index.html trỏ sang file này thay cho main.tsx).
// Không nạp App / Supabase: chỉ hiện màn hình tạm ngưng. Vẫn đăng ký Service Worker để:
//   - SW của bản bảo trì thay hẳn SW + cache của bản cũ trên máy người dùng (mọi đường dẫn đều ra màn hình này, kể cả offline);
//   - khi rollback về bản thường trên Vercel, SW bản thường quay lại → trang tự tải lại vào app (pwa.ts kiểm tra bản mới định kỳ).
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { setupPWA } from './lib/pwa'
import MaintenancePage from './pages/MaintenancePage'
import './index.css'

setupPWA()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MaintenancePage />
  </StrictMode>,
)
