import { DurableObject } from 'cloudflare:workers';
const MODEL = '@cf/meta/llama-3.2-1b-instruct';
const KOREAN_DEFAULT = '기본 응답 언어는 한국어입니다. 사용자가 다른 언어를 명시적으로 요청하지 않는 한 자연스럽고 간결한 한국어로 답변하세요. Answer in Korean by default; use another language only when the user explicitly requests it.';
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
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health' && request.method === 'GET') return Response.json({ ok: true, provider: 'Cloudflare Workers AI', model: MODEL, dailySharedLimit: 100, maxOutputTokens: 128 });
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
      // Read a bounded body; Content-Length is not trusted.
      const reader = request.body?.getReader();
      if (!reader) return json({ error: 'Empty request' }, 400);
      let size = 0; const chunks = [];
      for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength;
        if (size > 20000) { await reader.cancel(); return json({ error: 'Request too large' }, 413); } chunks.push(value); }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      let body;
      try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { return json({ error: 'Invalid JSON' }, 400); }
      if (!Array.isArray(body?.messages) || !body.messages.length || body.messages.length > 16 || body.messages.some(m => !m || !['system', 'user', 'assistant'].includes(m.role) || typeof m.content !== 'string')) return json({ error: 'Invalid text messages' }, 400);
      if (body.messages.reduce((sum, m) => sum + m.content.length, 0) > 4000) return json({ error: 'Input exceeds 4000 characters' }, 413);
      const messages = body.messages.map(({ role, content }) => ({ role, content }));
      if (!messages.some(m => m.role === 'system' && m.content.includes(KOREAN_DEFAULT))) {
        if (messages[0].role === 'system') messages[0].content = KOREAN_DEFAULT + '\n\n' + messages[0].content;
        else messages.unshift({ role: 'system', content: KOREAN_DEFAULT });
      }
      if (!await env.BUDGET.getByName('daily-free-inference').reserve()) return json({ error: 'Free quota or cooldown reached. Use a local model.', retryAfter: 3 }, 429);
      // Fixed inexpensive model and strict output cap. No paid fallback or API credentials.
      const result = await env.AI.run(MODEL, { messages, max_tokens: 128, temperature: 0.7, stream: false });
      if (typeof result?.response !== 'string' || !result.response.trim()) return json({ error: 'Empty model response' }, 502);
      return json({ model: MODEL, choices: [{ index: 0, message: { role: 'assistant', content: result.response } }], usage: result.usage });
    } catch {
      // Do not expose provider diagnostics, request text or account information.
      return json({ error: 'Free inference unavailable. Use a local model.' }, 503);
    }
  },
};
