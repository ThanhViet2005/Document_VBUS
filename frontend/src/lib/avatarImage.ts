// Chuẩn bị ảnh đại diện trước khi tải lên:
//  - cắt vuông ở giữa, thu về 256×256 → file nhỏ (vài chục KB), tải nhanh cho cả nhóm
//  - vẽ lại qua canvas → bỏ toàn bộ metadata EXIF (vị trí GPS, thiết bị chụp...) của ảnh gốc
//  - xoay đúng chiều ảnh chụp từ điện thoại (imageOrientation: 'from-image')

export const AVATAR_SIZE = 256
export const AVATAR_ACCEPT = 'image/png,image/jpeg,image/webp'
const MAX_INPUT_BYTES = 10 * 1024 * 1024

export interface PreparedAvatar {
  blob: Blob
  type: 'image/webp' | 'image/jpeg'
  ext: 'webp' | 'jpg'
}

export function checkAvatarFile(file: File): string | null {
  if (!AVATAR_ACCEPT.split(',').includes(file.type)) return 'Chỉ nhận ảnh PNG, JPG hoặc WebP'
  if (file.size > MAX_INPUT_BYTES) return 'Ảnh quá lớn (tối đa 10 MB)'
  return null
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality))

export async function prepareAvatar(file: File): Promise<PreparedAvatar> {
  const invalid = checkAvatarFile(file)
  if (invalid) throw new Error(invalid)

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new Error('Không đọc được ảnh. Hãy thử ảnh khác.')
  }
  const side = Math.min(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = AVATAR_SIZE
  canvas.height = AVATAR_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Trình duyệt không xử lý được ảnh')
  ctx.imageSmoothingQuality = 'high'
  // Nền trắng cho ảnh PNG trong suốt khi xuất JPEG
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE)
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE)
  bitmap.close()

  const webp = await toBlob(canvas, 'image/webp', 0.85)
  // Safari cũ không xuất được WebP (trả về PNG) → dùng JPEG
  if (webp && webp.type === 'image/webp') return { blob: webp, type: 'image/webp', ext: 'webp' }
  const jpeg = await toBlob(canvas, 'image/jpeg', 0.88)
  if (!jpeg) throw new Error('Không xử lý được ảnh')
  return { blob: jpeg, type: 'image/jpeg', ext: 'jpg' }
}
