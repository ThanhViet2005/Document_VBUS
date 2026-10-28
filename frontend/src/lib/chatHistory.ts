// Lịch sử trò chuyện với trợ lý AI: nhiều cuộc trò chuyện, lưu trên thiết bị (localStorage) theo từng tài khoản.
// Xóa toàn bộ khi đăng xuất (máy có thể được người khác dùng tiếp), xem clearAllChatHistory().

export interface StoredConversation<M> {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messages: M[]
}

const PREFIX = 'uniplan.chats.'
/** Khóa cũ (1 cuộc trò chuyện, sessionStorage) để chuyển sang lịch sử mới */
const LEGACY_PREFIX = 'uniplan.chat.'
export const MAX_CONVERSATIONS = 30
export const MAX_MESSAGES = 40

const keyOf = (userId: string) => PREFIX + (userId || 'anon')

/** Tiêu đề = câu hỏi đầu tiên, rút gọn */
export function titleFrom(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length > 60 ? `${t.slice(0, 57)}…` : t || 'Cuộc trò chuyện mới'
}

export function loadConversations<M extends { role: string; content: string }>(userId: string): StoredConversation<M>[] {
  try {
    const raw = localStorage.getItem(keyOf(userId))
    if (raw) {
      const list = JSON.parse(raw) as StoredConversation<M>[]
      if (Array.isArray(list)) return list.filter((c) => c && typeof c.id === 'string' && Array.isArray(c.messages))
    }
    // Lần đầu dùng lịch sử: đưa cuộc trò chuyện cũ (nếu có) vào danh sách
    const legacyKey = LEGACY_PREFIX + (userId || 'anon')
    const legacy = sessionStorage.getItem(legacyKey)
    sessionStorage.removeItem(legacyKey)
    const messages = legacy ? (JSON.parse(legacy) as M[]) : []
    if (!Array.isArray(messages) || messages.length === 0) return []
    const now = Date.now()
    const first = messages.find((m) => m.role === 'user')
    return [{ id: crypto.randomUUID(), title: titleFrom(first?.content ?? ''), createdAt: now, updatedAt: now, messages }]
  } catch {
    return []
  }
}

export function saveConversations<M>(userId: string, list: StoredConversation<M>[]) {
  try {
    const trimmed = [...list]
      .filter((c) => c.messages.length > 0)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_CONVERSATIONS)
      .map((c) => ({ ...c, messages: c.messages.slice(-MAX_MESSAGES) }))
    localStorage.setItem(keyOf(userId), JSON.stringify(trimmed))
  } catch {
    // storage đầy / bị chặn → chỉ giữ trong bộ nhớ
  }
}

/** Gọi khi đăng xuất: xóa lịch sử chat của mọi tài khoản trên thiết bị */
export function clearAllChatHistory() {
  try {
    for (const store of [localStorage, sessionStorage]) {
      for (let i = store.length - 1; i >= 0; i--) {
        const k = store.key(i)
        if (k && (k.startsWith(PREFIX) || k.startsWith(LEGACY_PREFIX))) store.removeItem(k)
      }
    }
  } catch {
    // storage bị chặn → không có gì để xóa
  }
}

/** Nhóm theo thời gian cho danh sách lịch sử */
export function historyGroup(ts: number, now = new Date()): string {
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  if (ts >= day) return 'Hôm nay'
  if (ts >= day - 86_400_000) return 'Hôm qua'
  if (ts >= day - 7 * 86_400_000) return '7 ngày qua'
  return 'Cũ hơn'
}
