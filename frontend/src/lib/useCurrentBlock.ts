import { useCallback, useState } from 'react'
import type { BlockName } from '../types'
import { BLOCKS } from './labels'

const KEY = 'uniplan.currentBlock'

function read(): BlockName {
  try {
    const saved = localStorage.getItem(KEY)
    return BLOCKS.find((b) => b === saved) ?? 'Block 1'
  } catch {
    return 'Block 1'
  }
}

/** Block đang học (người dùng tự chuyển khi sang Block mới), nhớ trên thiết bị */
export function useCurrentBlock(): [BlockName, (b: BlockName) => void] {
  const [block, setBlock] = useState<BlockName>(read)
  const update = useCallback((b: BlockName) => {
    setBlock(b)
    try {
      localStorage.setItem(KEY, b)
    } catch {
      // Trình duyệt chặn storage → chỉ nhớ trong phiên
    }
  }, [])
  return [block, update]
}
