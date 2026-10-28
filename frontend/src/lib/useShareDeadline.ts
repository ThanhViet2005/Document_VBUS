import { useCallback, useState } from 'react'
import { useAppData } from '../store/AppData'
import { useToast } from '../components/ui/Toast'
import { errorMessage } from '../components/ui/Form'

export function shareUrl(code: string): string {
  return `${window.location.origin}/s/${code}`
}

/**
 * "Gửi cho bạn" 1-click: tạo mã chia sẻ → mở menu chia sẻ của điện thoại (Web Share API)
 * hoặc sao chép link vào clipboard trên máy tính.
 */
export function useShareDeadline() {
  const { createShareLink, deadlines } = useAppData()
  const toast = useToast()
  const [sharingId, setSharingId] = useState<string | null>(null)

  const share = useCallback(
    async (deadlineId: string) => {
      setSharingId(deadlineId)
      try {
        const url = shareUrl(await createShareLink(deadlineId))
        const title = deadlines.find((d) => d.id === deadlineId)?.title ?? 'Deadline'
        if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
          await navigator.share({ title: `UniPlan: ${title}`, text: `Thêm deadline "${title}" vào lịch của bạn`, url }).catch(() => {})
        } else {
          await navigator.clipboard.writeText(url)
          toast.success('Đã sao chép link. Gửi cho bạn bè để họ thêm vào lịch (link hết hạn sau 30 ngày).')
        }
      } catch (e) {
        toast.error(errorMessage(e))
      } finally {
        setSharingId(null)
      }
    },
    [createShareLink, deadlines, toast],
  )

  return { share, sharingId }
}
