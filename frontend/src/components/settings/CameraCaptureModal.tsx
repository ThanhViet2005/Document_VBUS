import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, CircleAlert, Loader2, RefreshCw, SwitchCamera } from 'lucide-react'
import { cn } from '../../lib/cn'
import Modal from '../ui/Modal'
import { Button } from '../ui/Form'

interface Props {
  open: boolean
  onClose: () => void
  /** Nhận ảnh đã chụp (JPEG, vuông). Modal tự đóng khi onCapture xong. */
  onCapture: (file: File) => Promise<void>
  /** Dự phòng khi không mở được camera trong trình duyệt: chọn ảnh từ máy / camera hệ thống */
  onPickFile: () => void
}

/** Chụp ảnh đại diện bằng camera của thiết bị (webcam hoặc camera trước / sau của điện thoại) */
export default function CameraCaptureModal({ open, onClose, onCapture, onPickFile }: Props) {
  return (
    <Modal open={open} title="Chụp ảnh đại diện" onClose={onClose}>
      {/* Chỉ gắn khi modal mở → mở camera khi vào, tắt camera ngay khi đóng */}
      <CameraBody onClose={onClose} onCapture={onCapture} onPickFile={onPickFile} />
    </Modal>
  )
}

type Phase = 'starting' | 'live' | 'captured' | 'error'
type Facing = 'user' | 'environment'

function describeError(e: unknown): string {
  const name = e instanceof DOMException ? e.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return 'Bạn chưa cho phép dùng camera. Bấm biểu tượng ổ khóa cạnh thanh địa chỉ → cho phép Camera, rồi thử lại.'
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'Không tìm thấy camera trên thiết bị này.'
  if (name === 'NotReadableError' || name === 'AbortError') return 'Camera đang được ứng dụng khác sử dụng. Hãy đóng ứng dụng đó rồi thử lại.'
  return 'Không mở được camera. Hãy thử lại hoặc chọn ảnh từ máy.'
}

const CAPTURE_SIZE = 640

function CameraBody({ onClose, onCapture, onPickFile }: Omit<Props, 'open'>) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const requestRef = useRef(0)
  const [phase, setPhase] = useState<Phase>('starting')
  const [error, setError] = useState<string | null>(null)
  const [facing, setFacing] = useState<Facing>('user')
  const [canSwitch, setCanSwitch] = useState(false)
  const [shot, setShot] = useState<{ blob: Blob; url: string } | null>(null)
  const [saving, setSaving] = useState(false)

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  const start = useCallback(
    async (wanted: Facing) => {
      const id = ++requestRef.current
      stopStream()
      setPhase('starting')
      setError(null)
      if (!navigator.mediaDevices?.getUserMedia) {
        setError(window.isSecureContext ? 'Trình duyệt này không hỗ trợ camera.' : 'Camera chỉ hoạt động khi mở UniPlan qua HTTPS.')
        setPhase('error')
        return
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: wanted }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        })
        // Người dùng đóng modal / bấm đổi camera trong lúc chờ cấp quyền → bỏ luồng này
        if (id !== requestRef.current) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        const video = videoRef.current
        if (video) {
          video.srcObject = stream
          await video.play().catch(() => {})
        }
        setFacing(wanted)
        setPhase('live')
        const devices = await navigator.mediaDevices.enumerateDevices().catch(() => [])
        if (id === requestRef.current) setCanSwitch(devices.filter((d) => d.kind === 'videoinput').length > 1)
      } catch (e) {
        if (id !== requestRef.current) return
        setError(describeError(e))
        setPhase('error')
      }
    },
    [stopStream],
  )

  useEffect(() => {
    void start('user')
    return () => {
      requestRef.current++ // huỷ mọi yêu cầu đang chờ
      stopStream()
    }
  }, [start, stopStream])

  // Giải phóng URL xem trước khi chụp lại / đóng
  useEffect(() => () => void (shot && URL.revokeObjectURL(shot.url)), [shot])

  function capture() {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const side = Math.min(video.videoWidth, video.videoHeight)
    const canvas = document.createElement('canvas')
    canvas.width = CAPTURE_SIZE
    canvas.height = CAPTURE_SIZE
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    // Camera trước hiển thị như gương → ảnh lưu giống đúng những gì người dùng thấy
    if (facing === 'user') {
      ctx.translate(CAPTURE_SIZE, 0)
      ctx.scale(-1, 1)
    }
    ctx.drawImage(video, (video.videoWidth - side) / 2, (video.videoHeight - side) / 2, side, side, 0, 0, CAPTURE_SIZE, CAPTURE_SIZE)
    canvas.toBlob(
      (blob) => {
        if (!blob) return
        stopStream() // tắt đèn camera ngay sau khi chụp
        setShot({ blob, url: URL.createObjectURL(blob) })
        setPhase('captured')
      },
      'image/jpeg',
      0.92,
    )
  }

  function retake() {
    setShot(null)
    void start(facing)
  }

  async function use() {
    if (!shot) return
    setSaving(true)
    try {
      await onCapture(new File([shot.blob], 'camera.jpg', { type: 'image/jpeg' }))
      onClose()
    } catch {
      // Lỗi đã được báo bằng toast ở nơi gọi; cho người dùng thử lại hoặc chụp lại
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-2xl bg-black">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          aria-label="Xem trước camera"
          className={cn('h-full w-full object-cover', facing === 'user' && '-scale-x-100', phase !== 'live' && 'invisible')}
        />
        {phase === 'captured' && shot && <img src={shot.url} alt="Ảnh vừa chụp" className="absolute inset-0 h-full w-full object-cover" />}

        {/* Khung tròn gợi ý vùng sẽ hiển thị làm avatar */}
        {(phase === 'live' || phase === 'captured') && (
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="absolute inset-[7%] rounded-full border-2 border-white/90 shadow-[0_0_0_999px_rgba(15,23,42,0.5)]" />
          </div>
        )}

        {phase === 'starting' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-white/90" role="status">
            <Loader2 className="h-7 w-7 animate-spin" />
            Đang mở camera… hãy bấm "Cho phép" nếu trình duyệt hỏi
          </div>
        )}

        {phase === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-5 text-center text-white" role="alert">
            <CircleAlert className="h-8 w-8 text-amber-300" />
            <p className="text-sm">{error}</p>
          </div>
        )}
      </div>

      {phase === 'live' && (
        <div className="flex items-center justify-center gap-3">
          {canSwitch && (
            <Button variant="secondary" onClick={() => void start(facing === 'user' ? 'environment' : 'user')} aria-label="Đổi camera trước / sau">
              <SwitchCamera className="h-4 w-4" />
            </Button>
          )}
          <button
            type="button"
            onClick={capture}
            aria-label="Chụp ảnh"
            className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-brand-200 bg-cta text-white shadow-lg transition hover:bg-cta-hover active:scale-95"
          >
            <Camera className="h-6 w-6" />
          </button>
          {canSwitch && <span className="w-[42px]" aria-hidden />}
        </div>
      )}

      {phase === 'captured' && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button variant="secondary" onClick={retake} disabled={saving}>
            <RefreshCw className="h-4 w-4" /> Chụp lại
          </Button>
          <Button onClick={() => void use()} busy={saving}>
            Dùng ảnh này
          </Button>
        </div>
      )}

      {phase === 'error' && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button variant="secondary" onClick={() => void start(facing)}>
            <RefreshCw className="h-4 w-4" /> Thử lại
          </Button>
          <Button
            onClick={() => {
              onClose()
              onPickFile()
            }}
          >
            Chọn ảnh từ máy
          </Button>
        </div>
      )}

      <p className="text-center text-xs text-slate-500">Ảnh chỉ được xử lý trên máy bạn và gửi đi khi bạn bấm "Dùng ảnh này".</p>
    </div>
  )
}
