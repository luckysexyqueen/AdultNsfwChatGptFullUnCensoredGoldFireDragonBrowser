import { DurableObject } from 'cloudflare:workers';
const MODEL = '@cf/meta/llama-3.2-1b-instruct';
const KOREAN_DEFAULT = '기본 응답 언어는 한국어입니다. 사용자가 다른 언어를 명시적으로 요청하지 않는 한 자연스럽고 간결한 한국어로 답변하세요. 사용자의 메시지와 문맥을 유지하며, 사실 확인이 어려운 내용은 추측 대신 불확실성을 드러내세요.';
const MAX_OUTPUT_TOKENS = 4096;
const MAX_INPUT_CHARS = 20000;
const MAX_MESSAGES = 32;
const ALLOWED = new Set(['https://luckysexyqueen.github.io']);
export class FreeBudget extends DurableObject {
  async reserve() {
    const now = Date.now();
    const day = new Date(now).toISOString().slice(0, 10);
    return this.ctx.storage.transaction(async tx => {
      let budget = await tx.get('budget');
      if (!budget || budget.day !== day) budget = { day, count: 0, last: 0 };
      if (budget.count >= 100 || now - budget.last < 3000) return false;
      await tx.put('budget', { day, count: budget.count + 1, last: now });
      return true;
    });
  }
}
function validOrigin(origin) {
  if (ALLOWED.has(origin)) return true;
  try { const url = new URL(origin); return url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname); } catch { return false; }
}
function normalizeMaxTokens(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return MAX_OUTPUT_TOKENS;
  return Math.min(Math.max(Math.round(n), 64), MAX_OUTPUT_TOKENS);
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health' && request.method === 'GET') return Response.json({ ok: true, provider: 'Cloudflare Workers AI', model: MODEL, dailySharedLimit: 100, maxOutputTokens: MAX_OUTPUT_TOKENS });
    const origin = request.headers.get('Origin') || '';
    if (!validOrigin(origin)) return Response.json({ error: 'Origin not allowed' }, { status: 403 });
    const headers = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type',
      'Cache-Control': 'no-store', 'Vary': 'Origin', 'X-Content-Type-Options': 'nosniff' };
    const json = (value, status = 200) => Response.json(value, { status, headers });
    if (url.pathname !== '/v1/chat/completions') return json({ error: 'Not found' }, 404);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    if (!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type') || '')) return json({ error: 'JSON required' }, 415);
    try {
      const reader = request.body?.getReader();
      if (!reader) return json({ error: 'Empty request' }, 400);
      let size = 0; const chunks = [];
      for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength;
        if (size > 20000) { await reader.cancel(); return json({ error: 'Request too large' }, 413); } chunks.push(value); }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      let body;
      try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { return json({ error: 'Invalid JSON' }, 400); }
      if (!Array.isArray(body?.messages) || !body.messages.length || body.messages.length > MAX_MESSAGES || body.messages.some(m => !m || !['system', 'user', 'assistant'].includes(m.role) || typeof m.content !== 'string')) return json({ error: 'Invalid text messages' }, 400);
      const totalInputChars = body.messages.reduce((sum, m) => sum + String(m.content || '').length, 0);
      if (totalInputChars > MAX_INPUT_CHARS) return json({ error: 'Input exceeds 20000 characters', fallback: true }, 413);
      const requestedMaxTokens = normalizeMaxTokens(body.max_tokens ?? MAX_OUTPUT_TOKENS);
      const messages = body.messages.map(({ role, content }) => ({ role, content }));
      if (!messages.some(m => m.role === 'system' && m.content.includes(KOREAN_DEFAULT))) {
        if (messages[0].role === 'system') messages[0].content = KOREAN_DEFAULT + '\n\n' + messages[0].content;
        else messages.unshift({ role: 'system', content: KOREAN_DEFAULT });
      }
      const budget = env.BUDGET?.getByName?.('daily-free-inference');
      if (!budget || typeof budget.reserve !== 'function') {
        return json({ error: 'Free inference unavailable. Use a local model.', fallback: true, code: 'provider_unavailable' }, 503);
      }
      if (!(await budget.reserve())) return json({ error: 'Free quota or cooldown reached. Use a local model.', retryAfter: 3, fallback: true, code: 'quota_exhausted' }, 429);
      const result = await env.AI.run(MODEL, { messages, max_tokens: requestedMaxTokens, temperature: 0.7, stream: false });
      if (typeof result?.response !== 'string' || !result.response.trim()) return json({ error: 'Empty model response', fallback: true, code: 'empty_response' }, 502);
      return json({ model: MODEL, choices: [{ index: 0, message: { role: 'assistant', content: result.response } }], usage: result.usage, fallback: false, maxOutputTokens: requestedMaxTokens });
    } catch {
      return json({ error: 'Free inference unavailable. Use a local model.', fallback: true, code: 'provider_error' }, 503);
    }
  },
};
