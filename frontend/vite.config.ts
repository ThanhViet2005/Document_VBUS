import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * Bản BẢO TRÌ (npm run deploy:maintenance → build với VITE_MAINTENANCE=1): index.html chạy src/maintenance.tsx thay cho
 * src/main.tsx → mọi đường dẫn chỉ hiện màn hình tạm ngưng. Service Worker vẫn build như thường nên ghi đè cache cũ trên
 * máy người dùng; rollback trên Vercel về bản thường là app tự chạy lại.
 */
function maintenanceEntry(): Plugin {
  return {
    name: 'uniplan-maintenance-entry',
    // order 'pre': đổi điểm vào TRƯỚC khi Vite đọc index.html, để bản bảo trì không đóng gói cả app
    transformIndexHtml: {
      order: 'pre',
      handler: (html) =>
        html
          .replace('/src/main.tsx', '/src/maintenance.tsx')
          .replace('<title>UniPlan</title>', '<title>UniPlan – Tạm ngưng hoạt động</title>\n    <meta name="robots" content="noindex" />'),
    },
  }
}

export default defineConfig(({ mode }) => ({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Tách thư viện ít đổi ra file riêng: cập nhật app không bắt người dùng tải lại các thư viện này
          react: ['react', 'react-dom', 'react-dom/client', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
  plugins: [
    // Vercel: vercel deploy --build-env VITE_MAINTENANCE=1 (loadEnv(..., '') đọc cả biến của tiến trình).
    // Máy cá nhân: npm run build:maintenance (--mode maintenance, không cần đặt biến môi trường)
    (mode === 'maintenance' || loadEnv(mode, '.', '').VITE_MAINTENANCE === '1') && maintenanceEntry(),
    react(),
    tailwindcss(),
    VitePWA({
      // injectManifest: dùng Service Worker tự viết (src/sw.ts) để xử lý Web Push
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: false,
      // SW chỉ chạy ở bản production (xem src/lib/pwa.ts)
      devOptions: { enabled: false },
      includeAssets: ['favicon.svg', 'apple-touch-icon.svg'],
      manifest: {
        name: 'UniPlan - FPT University Đà Nẵng',
        short_name: 'UniPlan',
        description: 'Quản lý deadline, lịch học và kỳ thi cho sinh viên Đại học FPT',
        lang: 'vi',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#ffffff',
        theme_color: '#f97316',
        icons: [
          { src: 'pwa-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'pwa-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
      },
    }),
  ],
}))
