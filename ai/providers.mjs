import { koreanInstructions } from './language.mjs';
const MAX_FREE_MESSAGES = 32;
const MAX_FREE_INPUT_CHARS = 20000;
const DEFAULT_MAX_TOKENS = 4096;
export function prepareMessages(messages, systemPrompt, instructions) {
  if (!Array.isArray(messages) || !messages.length) throw Error('대화 메시지가 필요합니다.');
  const result = [];
  const system = koreanInstructions([systemPrompt, instructions].filter(Boolean).join('\n\n'));
  if (system) result.push({ role: 'system', content: system });
  for (const message of messages) {
    if (!['user', 'assistant', 'system'].includes(message.role) || typeof message.content !== 'string') throw Error('텍스트 대화만 사용할 수 있습니다.');
    result.push({ role: message.role, content: message.content });
  }
  const totalChars = result.reduce((sum, m) => sum + String(m.content || '').length, 0);
  if (result.length > MAX_FREE_MESSAGES || totalChars > MAX_FREE_INPUT_CHARS) {
    throw Error(`무료 API의 입력 한도(최근 대화와 지침 합계 ${MAX_FREE_INPUT_CHARS}자, ${MAX_FREE_MESSAGES}개 메시지)를 초과했습니다. 로컬 모델을 사용하세요.`);
  }
  return result;
}
export async function freeChat(endpoint, messages, { signal, fetcher = fetch, maxTokens = DEFAULT_MAX_TOKENS } = {}) {
  const url = new URL(endpoint);
  if (url.protocol !== 'https:' || url.username || url.password) throw Error('유효한 HTTPS AI 서버 주소가 필요합니다.');
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(abort, 60000);
  try {
    const response = await fetcher(url.href, { method: 'POST', credentials: 'omit', redirect: 'error', signal: controller.signal,
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages, max_tokens: Number.isFinite(Number(maxTokens)) ? Math.min(Math.max(Math.round(Number(maxTokens)), 64), DEFAULT_MAX_TOKENS) : DEFAULT_MAX_TOKENS }) });
    if (!response.ok) {
      if (response.status === 429) throw Error('무료 API 사용량 한도에 도달했습니다. 잠시 후 다시 시도하거나 로컬 모델을 사용하세요.');
      throw Error(`무료 AI 서버 오류 (${response.status}). 로컬 모델을 선택할 수 있습니다.`);
    }
    if (!/application\/json/i.test(response.headers.get('content-type') || '')) throw Error('AI 서버 응답 형식이 올바르지 않습니다.');
    const reader = response.body.getReader();
    const chunks = []; let length = 0;
    for (;;) { const { done, value } = await reader.read(); if (done) break; length += value.length;
      if (length > 131072) { await reader.cancel(); throw Error('AI 서버 응답이 너무 큽니다.'); } chunks.push(value); }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const data = JSON.parse(new TextDecoder().decode(bytes));
    const text = data.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text.trim()) throw Error('AI가 빈 응답을 반환했습니다.');
    return text;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}
