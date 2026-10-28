// Áp giao diện sáng / tối TRƯỚC khi trình duyệt vẽ trang (tránh nháy trắng khi dùng chế độ tối).
// Phải là file riêng, tải đồng bộ ở <head>: CSP của trang không cho script nhúng trực tiếp (script-src 'self').
// Logic giống src/lib/theme.ts, sửa cả hai nơi khi đổi.
;(function () {
  var pref = 'system'
  try {
    var saved = localStorage.getItem('uniplan.theme')
    if (saved === 'light' || saved === 'dark' || saved === 'system') pref = saved
  } catch (e) {}
  var dark = pref === 'dark' || (pref === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
  var root = document.documentElement
  root.classList.toggle('dark', dark)
  root.style.colorScheme = dark ? 'dark' : 'light'
  var meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', dark ? '#070c19' : '#f97316')
  // Thanh điều hướng thu gọn (giống src/lib/navCollapse.ts): đặt trước khi vẽ để nội dung không bị nhảy lề
  try {
    if (localStorage.getItem('uniplan.nav-collapsed') === '1') root.setAttribute('data-nav-collapsed', '')
  } catch (e) {}
})()
