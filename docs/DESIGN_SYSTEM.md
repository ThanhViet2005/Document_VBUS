# Hệ thống thiết kế UniPlan – "Năng động & Phiêu lưu"

Tài liệu cho người mới vào dự án: đọc 10 phút là làm được giao diện đồng bộ với app.
Toàn bộ token nằm trong `frontend/src/index.css` (Tailwind v4, không có `tailwind.config`).

## 1. Tinh thần thiết kế

Sinh viên FPT: trẻ, nhanh, thích thử thách. Giao diện coi việc học như một **hành trình**:
mỗi deadline là một chặng, tiến độ là đường lên đỉnh, trạng thái trống là "vùng đất chưa khám phá".

| Nguyên tắc | Nghĩa là |
|---|---|
| **Cam là nhân vật chính** | Hành động chính (nút "Thêm", tab đang chọn) luôn màu cam. Mỗi màn hình chỉ 1 nút cam nổi bật nhất |
| **Bộ ba FPT làm điểm nhấn** | Cam + xanh dương + xanh lá (màu logo FPT) cho biểu tượng, thẻ số liệu, họa tiết. Không dùng thêm màu lạ |
| **Có chuyển động, nhưng ngắn** | Nhấc thẻ khi rê chuột, nảy nút khi bấm, khối hiện lần lượt. Mọi hiệu ứng ≤ 0,5 giây và tự tắt khi bật "Giảm chuyển động" |
| **Chữ đậm, gọn** | Tiêu đề `font-extrabold tracking-tight`, số liệu lớn `font-black`. Câu chữ ngắn, giọng thân thiện ("chặng", "chinh phục") |

## 2. Token (dùng như class Tailwind thường)

### Màu
| Class | Giá trị | Dùng cho |
|---|---|---|
| `bg-cta` / `hover:bg-cta-hover` | `#f97316` / `#ea580c` | Nền nút, tab, chip có **chữ trắng** |
| `brand-50 … brand-700` | thang cam | Nền nhạt (`bg-brand-50`), chữ / biểu tượng cam (`text-brand-600`) |
| `fpt-blue` | `#0b6bcb` | Điểm nhấn phụ: thẻ số liệu, họa tiết. Chữ trắng trên nền này đọc tốt |
| `fpt-green` | `#3fae49` | Hoàn thành, thành công, điểm nhấn thứ ba |
| `slate-*` | thang xám | Chữ, viền, nền. **Tự đảo ở giao diện tối** |

> ⚠️ `brand-*` và `slate-*` đổi màu ở giao diện tối. Phần cần **giữ nguyên** màu ở cả sáng / tối (thanh điều hướng, banner cam)
> thì viết mã hex: `bg-[#f97316]`, `from-[#fb923c] to-[#ea580c]`.

### Bo góc, bóng, chuyển động
| Class | Dùng cho |
|---|---|
| `rounded-card` (20px) | Thẻ, khối nội dung |
| `rounded-hero` (28px) | Banner lớn đầu trang |
| `rounded-xl` (12px) | Nút, ô nhập, ô biểu tượng |
| `shadow-card` | Thẻ lúc nghỉ (đã có sẵn trong `surface-card`) |
| `shadow-pop` | Thẻ nổi bật (đã có sẵn khi rê chuột với `lift`) |
| `shadow-cta` | Nút cam, ô biểu tượng cam |
| `animate-rise` | Khối trượt lên khi xuất hiện |
| `group-hover:animate-wiggle` | Biểu tượng lắc nhẹ khi rê vào thẻ cha có class `group` |

## 3. Tiện ích có sẵn (viết 1 class thay vì 5–6 class)

| Class | Tác dụng | Ví dụ |
|---|---|---|
| `surface-card` | Nền thẻ + viền + bo góc + bóng | `<div className="surface-card p-5">` |
| `lift` | Nhấc lên, bóng cam khi rê chuột, ấn xuống khi bấm. Chỉ dùng cho thẻ **bấm được** | `<a className="surface-card lift p-5">` |
| `stagger` | Các con trực tiếp hiện lần lượt | `<div className="stagger grid gap-4">` |
| `bg-trail` | Họa tiết lưới chấm "bản đồ" (màu = `text-*`) | `<div className="bg-trail text-white/15 absolute inset-0" />` |
| `text-data` | MSSV, số điện thoại, mã môn, giờ: chữ số cùng độ rộng + giãn nhẹ, **thay cho `font-mono`** (Consolas mảnh, khó đọc) | `<span className="text-data font-semibold">` |
| `text-gradient` | Chữ gradient cam cho 1–2 từ khóa | `Môn học của <span className="text-gradient">bạn</span>` |

## 4. Component dùng chung (ưu tiên dùng lại, đừng tự viết)

| Component | File | Khi nào dùng |
|---|---|---|
| `Card` | `components/ui/Card.tsx` | Mọi khối nội dung có tiêu đề. Prop: `title`, `icon`, `action`, `interactive` |
| `Button` | `components/ui/Form.tsx` | Mọi nút. `variant`: `primary` (cam), `secondary`, `ghost`, `danger`, `dangerOutline`, `destructive`; `busy` hiện vòng xoay |
| `Field`, `inputClass` | `components/ui/Form.tsx` | Ô nhập trong form. Placeholder dạng **"Nhập [tên trường]"** |
| `EmptyState` | `components/ui/Form.tsx` | Danh sách trống. **Luôn truyền `action`** (nút làm bước tiếp theo) |
| `Modal` | `components/ui/Modal.tsx` | Hộp thoại, form thêm / sửa. Tự lo focus, phím Esc / Tab |
| `useConfirm()` | `components/ui/ConfirmDialog.tsx` | Xác nhận xóa / rời nhóm. **Không dùng `window.confirm`** |
| `useToast()` | `components/ui/Toast.tsx` | Báo "Đã lưu", "Đã xóa", lỗi |
| `StatTile` | `components/ui/StatTile.tsx` | Ô số liệu (Tổng quan, Kế hoạch học). `tone`: `orange`, `blue`, `green`, `amber`, `teal`, `red`; `unit`, `progress` (thanh tiến độ), `to` (bấm để chuyển trang) |
| `ProgressBar` | `components/ui/ProgressBar.tsx` | Thanh tiến độ |

## 5. Công thức nhanh

### Thêm một trang mới
```tsx
// src/pages/ViduPage.tsx – nhớ khai báo route (tải lười) trong App.tsx và mục trong components/layout/nav.ts
import { Compass, Plus } from 'lucide-react'
import Card from '../components/ui/Card'
import { Button, EmptyState } from '../components/ui/Form'

export default function ViduPage() {
  const items: string[] = []
  return (
    <div className="stagger space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-extrabold tracking-tight text-slate-900">Khám phá</h2>
        <Button><Plus className="h-4 w-4" /> Thêm mới</Button>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<Compass className="h-6 w-6" />}
          title="Chưa có gì ở đây"
          text="Bắt đầu chặng đầu tiên bằng cách thêm một mục mới."
          action={<Button><Plus className="h-4 w-4" /> Thêm mới</Button>}
        />
      ) : (
        <Card title="Danh sách" icon={<Compass className="h-4 w-4" />}>…</Card>
      )}
    </div>
  )
}
```

### Thẻ bấm được (danh sách môn, nhóm…)
```tsx
<button className="surface-card lift group w-full p-5 text-left">
  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-500">
    <BookOpen className="h-5 w-5 group-hover:animate-wiggle" />
  </span>
  <p className="mt-3 font-extrabold tracking-tight text-slate-900">PRF192</p>
</button>
```

### Nền bầu trời (`components/ui/SkyBackdrop.tsx`)

| Nơi dùng | Giao diện sáng | Giao diện tối |
|---|---|---|
| `<SkyBackdrop variant="hero" />` – Đăng nhập / Đăng ký | Mặt trời có 2 quỹ đạo + 4 hành tinh trôi | Trăng khuyết phát sáng, hành tinh → sao 4 cánh, sao nền, sao băng |
| `<SkyBackdrop variant="ambient" />` – mọi trang trong app (đặt sẵn trong `AppLayout`) | Hành tinh nhạt (40%) ở lề phải / đáy | Sao nhạt |

- Chỉ là trang trí: `aria-hidden`, không bắt chuột, nằm **sau** thẻ nội dung (thẻ phải có nền đặc `bg-surface` để không lộ sao sau chữ).
- Người dùng tắt nền ở trang app tại **Cài đặt → Giao diện → Nền bầu trời** (`useSkyEnabled()` trong `lib/sky.ts`).
- Thêm thiên thể: sửa mảng `HERO_ANCHORS` / `AMBIENT_ANCHORS` (cùng vị trí cho hành tinh ban ngày và sao ban đêm).
- Đổi trang: nội dung hiện dần bằng `animate-page-in` (`AppLayout`, chỉ opacity, fill `backwards`, đừng đổi thành `both`: modal sẽ bị kẹt dưới thanh tiêu đề).

## 6. Nên / Không nên

| ✅ Nên | ❌ Không nên |
|---|---|
| `bg-cta text-white` cho nút cam | `bg-brand-500 text-white` (sau này không đổi màu nút toàn app ở 1 chỗ được) |
| 1 nút cam chính mỗi khu vực, còn lại `secondary` / `ghost` | 3–4 nút cam cạnh nhau |
| Thẻ tự viết (`bg-surface` + `border` + bo góc) luôn kèm `shadow-card` (hoặc dùng `surface-card` / `<Card>`): nền trang `#eef2f7` (tối `#070c19`) nên thẻ không có bóng sẽ chìm | Thẻ nền trắng không bóng trên nền trang |
| `lift` chỉ cho thẻ bấm được | `lift` cho khối tĩnh (người dùng tưởng bấm được) |
| Biểu tượng `lucide-react`, cỡ `h-4 w-4` (trong chữ) / `h-5 w-5` (nút) / `h-6 w-6` (ô lớn) | Emoji thay biểu tượng trong nút |
| Chữ ≥ `text-xs` (đã nâng lên **13px** trong `index.css`); `text-[11px]` chỉ cho nhãn rất phụ | `text-[9px]`, `text-[10px]` cho chữ cần đọc |
| Nút chỉ có biểu tượng: `aria-label` + vùng bấm ≥ 44px (`h-11 w-11`) | Nút biểu tượng 24–28px không có nhãn |
| Thanh điều hướng hẹp dùng biến thể `nav-compact:` | `md:max-xl:` |

## 7. Trước khi gửi code

1. Xem ở **giao diện sáng và tối** (nút mặt trăng trên thanh tiêu đề).
2. Xem ở **điện thoại (375px)**, iPad (768px), laptop (1280px) bằng DevTools.
3. Thử dùng **chỉ bàn phím**: Tab tới được mọi nút, thấy viền focus.
4. `cd frontend && npx tsc -p tsconfig.app.json --noEmit && npx vite build`.
