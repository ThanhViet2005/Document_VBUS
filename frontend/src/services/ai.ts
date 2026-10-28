import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

/** Đề xuất thô của AI agent (máy chủ đã kiểm tra kiểu; app kiểm tra lại trong lib/aiAgent.ts) */
export interface RawAgentAction {
  type: 'create_task' | 'create_course' | 'create_class_schedule' | 'create_study_session' | string
  args: Record<string, unknown>
}

export type AiMode = 'server' | 'unavailable'

/**
 * server: gọi Edge Function `ai-chat` (AI agent trên Groq). API key nằm trong Supabase secrets (lập trình viên cấu hình),
 *         không bao giờ xuống trình duyệt; có rate limit theo người dùng.
 * unavailable: chế độ demo (chưa có Supabase) → AI Chat chỉ dùng bộ hiểu câu tiếng Việt trên máy.
 */
export function aiMode(): AiMode {
  return supabase ? 'server' : 'unavailable'
}

/** Bối cảnh tối đa gửi kèm (khớp giới hạn của Edge Function ai-chat) */
export const MAX_CONTEXT_CHARS = 10_000

/**
 * Gửi hội thoại, trả về câu trả lời và các đề xuất (thêm deadline / môn / lịch học / buổi tự học) của AI agent.
 * context: dữ liệu của sinh viên (ngày giờ, môn học, lịch, deadline...) được nối vào sau system prompt.
 */
export async function chat(messages: ChatMessage[], opts: { context?: string } = {}): Promise<{ reply: string; actions: RawAgentAction[] }> {
  if (!supabase) throw new Error('AI chưa sẵn sàng ở chế độ demo')
  const context = opts.context?.slice(0, MAX_CONTEXT_CHARS)
  const { data, error } = await supabase.functions.invoke<{ reply: string; actions?: RawAgentAction[] }>('ai-chat', { body: { messages, context } })
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const body = (await error.context.json().catch(() => null)) as { error?: string } | null
      throw new Error(body?.error ?? 'AI trên máy chủ đang lỗi')
    }
    throw new Error('Không gọi được AI trên máy chủ')
  }
  return { reply: data?.reply ?? '', actions: Array.isArray(data?.actions) ? data.actions : [] }
}
