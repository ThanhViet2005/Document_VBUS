import { useConfirm } from '../ui/ConfirmDialog'
import type { Deadline, TaskStatus } from '../../types'

/**
 * Bấm nút trạng thái trên thẻ nhiệm vụ. Chọn "Chưa bắt đầu" khi đã tick bước nào → hỏi trước,
 * vì các bước sẽ bị bỏ tick để thẻ không hiện "Chưa bắt đầu" mà vẫn "3/3 bước" (xem applyStatus trong lib/tasks.ts).
 */
export function useStatusPicker(task: Deadline, onStatusChange: (status: TaskStatus) => void) {
  const confirm = useConfirm()
  return async (next: TaskStatus) => {
    if (next === task.status) return
    const ticked = task.subtasks.filter((s) => s.isCompleted).length
    if (
      next === 'todo' &&
      ticked > 0 &&
      !(await confirm({
        title: 'Đặt lại về "Chưa bắt đầu"?',
        message: `${ticked}/${task.subtasks.length} bước đã tick sẽ được bỏ tick và tiến độ về 0%.`,
        confirmLabel: 'Đặt lại',
        destructive: false,
      }))
    )
      return
    onStatusChange(next)
  }
}
