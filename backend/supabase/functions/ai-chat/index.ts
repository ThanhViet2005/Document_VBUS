// POST /functions/v1/ai-chat  { messages: [{ role: "user" | "assistant", content: string }], context?: string }
//   → { reply: string, actions: { type, args }[], model }
// AI agent trên Groq (API dạng OpenAI-compatible, có tool calling). Key nằm trong Edge Function secret GROQ_API_KEY
// (lập trình viên đặt bằng `supabase secrets set`), không bao giờ trả về client. Giới hạn 20 request/phút/người dùng.
//
// Vòng lặp agent: mô hình gọi công cụ → máy chủ kiểm tra từng lần gọi → trả kết quả (đúng / lỗi) cho mô hình để
// tự sửa → vòng cuối buộc trả lời bằng chữ. Công cụ chỉ tạo ĐỀ XUẤT (actions); app hiện thẻ để người dùng duyệt.
import { json, preflight, rateLimit, requireUser } from '../_shared/http.ts'
import { SYSTEM_PROMPT } from './knowledge.ts'
import { TOOLS, validateToolCall, type AgentAction } from './tools.ts'

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
// Đã thử trên Groq (10/2026): qwen gọi công cụ đúng và tính ngày đúng; llama-3.3-70b-versatile đã bị Groq gỡ.
// Đổi model bằng secret GROQ_MODEL (xem danh sách: GET https://api.groq.com/openai/v1/models).
const DEFAULT_MODEL = 'qwen/qwen3.8-27b'
const MAX_MESSAGES = 20
const MAX_CHARS = 4000
/** Bối cảnh do app gửi kèm (ngày giờ, môn học, lịch, deadline, kỳ thi, buổi tự học) */
const MAX_CONTEXT_CHARS = 10_000
/** Số lượt gọi mô hình tối đa trong 1 request (lượt cuối buộc trả lời bằng chữ) */
const MAX_ROUNDS = 3
const MAX_ACTIONS = 12
const TIMEOUT_MS = 25_000
/** Groq báo quá giới hạn token/phút: chờ tối đa chừng này rồi thử lại 1 lần, lâu hơn thì báo người dùng */
const MAX_RETRY_WAIT_S = 12

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface ToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

/** Tin nhắn gửi Groq: thêm system, assistant có tool_calls và kết quả công cụ */
type GroqMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string }

function parseMessages(body: unknown): ChatMessage[] | null {
  const messages = (body as { messages?: unknown })?.messages
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) return null
  const out: ChatMessage[] = []
  for (const m of messages) {
    const role = (m as ChatMessage)?.role
    const content = (m as ChatMessage)?.content
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string') return null
    if (content.length === 0 || content.length > MAX_CHARS) return null
    out.push({ role, content })
  }
  return out
}

type GroqResult =
  | { ok: true; message: { content: string | null; tool_calls?: ToolCall[] }; model: string }
  | { ok: false; status: number; error: string; retryAfter?: string; toolFailed?: boolean }

async function callGroq(apiKey: string, model: string, messages: GroqMessage[], tools: 'auto' | 'none' | 'off'): Promise<GroqResult> {
  let res: Response
  try {
    res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.3,
        // Gói miễn phí: Qwen chỉ cho ~1.000 token đầu ra / phút và TỪ CHỐI luôn request có max_tokens lớn hơn mức đó.
        // 800 đủ cho câu trả lời + ~4–5 lệnh gọi công cụ (đã đo: kế hoạch ôn thi 4 buổi ≈ 800 token gồm phần suy nghĩ).
        max_tokens: 800,
        ...(tools !== 'off' && { tools: TOOLS, tool_choice: tools, parallel_tool_calls: true }),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (e) {
    const timeout = e instanceof DOMException && e.name === 'TimeoutError'
    return { ok: false, status: timeout ? 504 : 502, error: timeout ? 'Groq phản hồi quá lâu, thử lại sau' : 'Không kết nối được tới Groq' }
  }

  if (!res.ok) {
    const text = await res.text()
    // Không trả nội dung lỗi gốc cho client (có thể chứa thông tin tài khoản); chỉ ghi log máy chủ
    console.error('Groq error', res.status, text.slice(0, 500))
    if (res.status === 429) {
      const wait = Math.ceil(Number(res.headers.get('retry-after') ?? '') || 0)
      return { ok: false, status: 429, error: wait ? `AI đang bận (giới hạn lượt dùng), thử lại sau khoảng ${wait} giây` : 'AI đang bận, thử lại sau ít giây', retryAfter: wait ? String(wait) : undefined }
    }
    if (text.includes('model_not_found') || text.includes('model_decommissioned')) return { ok: false, status: 502, error: `Groq không còn model "${model}", hãy đổi GROQ_MODEL` }
    if (res.status === 401 || res.status === 403) return { ok: false, status: 502, error: 'Groq API key không hợp lệ' }
    // Mô hình sinh lệnh gọi công cụ sai định dạng → cho phép thử lại không dùng công cụ
    if (res.status === 400 && text.includes('tool_use_failed')) return { ok: false, status: 502, error: 'AI tạo lệnh không hợp lệ', toolFailed: true }
    if (res.status === 404 || res.status === 400) return { ok: false, status: 502, error: `Groq không nhận yêu cầu (model "${model}")` }
    return { ok: false, status: 502, error: `Groq trả lỗi ${res.status}` }
  }

  const data = (await res.json().catch(() => null)) as { choices?: { message?: { content?: string | null; tool_calls?: ToolCall[] } }[]; model?: string } | null
  const message = data?.choices?.[0]?.message
  if (!message) return { ok: false, status: 502, error: 'Groq không trả về nội dung' }
  // Một số model (vd Qwen) có thể trả phần suy nghĩ trong <think>...</think> → bỏ đi
  const content = message.content?.replace(/<think>[\s\S]*?<\/think>/g, '').trim() ?? null
  return { ok: true, message: { content, tool_calls: message.tool_calls }, model: data?.model ?? model }
}

/** Gọi Groq; bị giới hạn token/phút mà chỉ phải chờ ngắn thì chờ rồi thử lại 1 lần */
async function callGroqWithRetry(apiKey: string, model: string, messages: GroqMessage[], tools: 'auto' | 'none' | 'off'): Promise<GroqResult> {
  const first = await callGroq(apiKey, model, messages, tools)
  if (first.ok || first.status !== 429) return first
  const wait = Number(first.retryAfter ?? '0')
  if (!wait || wait > MAX_RETRY_WAIT_S) return first
  await new Promise((r) => setTimeout(r, wait * 1000 + 300))
  return callGroq(apiKey, model, messages, tools)
}

Deno.serve(async (req) => {
  const early = preflight(req)
  if (early) return early

  const auth = await requireUser(req)
  if (auth instanceof Response) return auth

  const limited = await rateLimit(req, auth.client, 'ai_chat', 20)
  if (limited) return limited

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return json(req, { error: 'Body phải là JSON' }, 400)
  }
  const messages = parseMessages(body)
  if (!messages) return json(req, { error: `messages không hợp lệ (tối đa ${MAX_MESSAGES} tin, mỗi tin ≤ ${MAX_CHARS} ký tự)` }, 400)

  const rawContext = (body as { context?: unknown }).context
  if (rawContext !== undefined && (typeof rawContext !== 'string' || rawContext.length > MAX_CONTEXT_CHARS)) {
    return json(req, { error: `context phải là chuỗi ≤ ${MAX_CONTEXT_CHARS} ký tự` }, 400)
  }
  const system = rawContext ? `${SYSTEM_PROMPT}\n\n# DỮ LIỆU CỦA SINH VIÊN (cập nhật lúc gửi)\n${rawContext}` : SYSTEM_PROMPT

  const apiKey = Deno.env.get('GROQ_API_KEY')
  if (!apiKey) return json(req, { error: 'Máy chủ chưa cấu hình Groq API key' }, 503)
  const model = Deno.env.get('GROQ_MODEL') || DEFAULT_MODEL

  const convo: GroqMessage[] = [{ role: 'system', content: system }, ...messages]
  const actions: AgentAction[] = []
  let usedModel = model
  let toolsMode: 'auto' | 'none' | 'off' = 'auto'

  for (let round = 0; round < MAX_ROUNDS; round++) {
    if (round === MAX_ROUNDS - 1 && toolsMode === 'auto') toolsMode = 'none' // lượt cuối: chỉ trả lời bằng chữ
    let result = await callGroqWithRetry(apiKey, model, convo, toolsMode)
    if (!result.ok && result.toolFailed && toolsMode !== 'off') {
      // Groq không dựng được lệnh gọi công cụ → trả lời thường, giữ các đề xuất đã có
      toolsMode = 'off'
      result = await callGroqWithRetry(apiKey, model, convo, 'off')
    }
    if (!result.ok) {
      // Đã có đề xuất từ lượt trước thì vẫn trả về, kèm lời nhắn ngắn
      if (actions.length) return json(req, { reply: 'Mình đã chuẩn bị các mục dưới đây, bạn kiểm tra rồi bấm Thêm nhé.', actions, model: usedModel })
      const res = json(req, { error: result.error }, result.status)
      if (result.retryAfter) res.headers.set('Retry-After', result.retryAfter)
      return res
    }

    usedModel = result.model
    const { content, tool_calls } = result.message
    if (!tool_calls?.length) {
      const reply = content?.trim() || (actions.length ? 'Mình đã chuẩn bị các mục dưới đây, bạn kiểm tra rồi bấm Thêm nhé.' : '')
      return json(req, { reply, actions, model: usedModel })
    }

    // Kiểm tra từng lần gọi công cụ; kết quả (đúng / lỗi) gửi lại để mô hình tóm tắt hoặc tự sửa
    convo.push({ role: 'assistant', content: content ?? '', tool_calls })
    let failed = 0
    for (const call of tool_calls) {
      const checked = validateToolCall(call.function?.name ?? '', call.function?.arguments ?? '')
      let note: string
      if (!checked.ok) {
        failed++
        note = `LỖI: ${checked.error}. Sửa tham số rồi gọi lại.`
      } else if (actions.length >= MAX_ACTIONS) note = `LỖI: đã đủ ${MAX_ACTIONS} đề xuất trong 1 lượt, không thêm nữa.`
      else {
        actions.push(checked.action)
        note = `OK: đã tạo bản nháp ${checked.summary}. Chưa lưu, chờ người dùng bấm "Thêm".`
      }
      convo.push({ role: 'tool', tool_call_id: call.id, content: note })
    }
    // Mọi lần gọi đều hợp lệ và mô hình đã viết lời nhắn kèm theo → xong, không tốn thêm 1 lượt gọi Groq
    // (gói miễn phí chỉ ~7.000 token đầu vào / phút)
    if (!failed && content) return json(req, { reply: content, actions, model: usedModel })
  }

  // Hết lượt mà mô hình vẫn chỉ gọi công cụ (hiếm)
  return json(req, { reply: 'Mình đã chuẩn bị các mục dưới đây, bạn kiểm tra rồi bấm Thêm nhé.', actions, model: usedModel })
})
