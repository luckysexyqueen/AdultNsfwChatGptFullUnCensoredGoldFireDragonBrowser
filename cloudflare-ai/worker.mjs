const MODEL = '@cf/meta/llama-3.2-1b-instruct';
const KOREAN_DEFAULT = '기본 응답 언어는 한국어입니다. 사용자가 다른 언어를 명시적으로 요청하지 않는 한 자연스럽고 간결한 한국어로 답변하세요.';
const DEFAULT_ALLOWED = new Set([
  'https://luckysexyqueen.github.io',
  'https://luckysexyqueen.github.io/',
  'http://localhost:8000',
  'http://127.0.0.1:8000',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost',
  'http://127.0.0.1',
  'https://localhost',
  'https://127.0.0.1'
]);
const MAX_INPUT_CHARS = 20000;
const MAX_MESSAGES = 32;
const MAX_OUTPUT_TOKENS = 4096;

function parseExtraAllowedOrigins(input) {
  if (!input) return [];
  return String(input)
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);
}

function validOrigin(origin, env) {
  const extra = [...parseExtraAllowedOrigins(env?.ALLOWED_ORIGINS), ...parseExtraAllowedOrigins(globalThis.__GFD_ALLOWED_ORIGINS)];
  const allowed = new Set([...DEFAULT_ALLOWED, ...extra]);

  // Empty/absent origin is common under VPN/proxy or curl-based direct probes; allow it.
  if (!origin) return true;
  if (allowed.has(origin)) return true;

  try {
    const url = new URL(origin);
    const host = url.hostname.toLowerCase();
    const isLocal = ['localhost', '127.0.0.1', '0.0.0.0', '[::1]', '::1'].includes(host) || host.endsWith('.local') || host.endsWith('.internal');
    const isPrivateIp = /^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(host) || host === 'localhost';
    const isGithubPages = host.endsWith('.github.io') || host.endsWith('.pages.dev') || host.endsWith('.workers.dev');
    const isVpnish = host.includes('vpn') || host.includes('proxy') || host.includes('corp') || host.includes('intranet');
    const isHttpLocal = url.protocol === 'http:' && isLocal;
    const isHttpsLocal = url.protocol === 'https:' && (isLocal || isGithubPages || isVpnish || isPrivateIp);
    return url.protocol === 'https:' && (isHttpsLocal || isGithubPages || isPrivateIp || isVpnish) || isHttpLocal;
  } catch {
    return false;
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health' && request.method === 'GET') {
      return Response.json({ ok: true, provider: 'Cloudflare Workers AI', model: MODEL, dailySharedLimit: 100, maxOutputTokens: MAX_OUTPUT_TOKENS });
    }

    const origin = request.headers.get('Origin') || '';
    if (!validOrigin(origin, env)) return Response.json({ error: 'Origin not allowed' }, { status: 403 });

    const allowOrigin = origin || '*';
    const headers = {
      'Access-Control-Allow-Origin': allowOrigin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
      'Cache-Control': 'no-store',
      'Vary': 'Origin',
      'X-Content-Type-Options': 'nosniff'
    };

    const json = (value, status = 200) => Response.json(value, { status, headers });

    if (url.pathname !== '/v1/chat/completions') return json({ error: 'Not found' }, 404);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    if (!/^application\/(?:json|x-www-form-urlencoded)(?:;|$)/i.test(request.headers.get('Content-Type') || '')) {
      return json({ error: 'JSON body required' }, 415);
    }

    try {
      const reader = request.body?.getReader();
      if (!reader) return json({ error: 'Empty request' }, 400);

      const chunks = [];
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_INPUT_CHARS) {
          await reader.cancel();
          return json({ error: 'Request too large' }, 413);
        }
        chunks.push(value);
      }

      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }

      let body;
      try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { return json({ error: 'Invalid JSON' }, 400); }

      if (!Array.isArray(body?.messages) || !body.messages.length || body.messages.length > MAX_MESSAGES || body.messages.some(m => !m || !['system', 'user', 'assistant'].includes(m.role) || typeof m.content !== 'string')) {
        return json({ error: 'Invalid messages' }, 400);
      }

      const totalChars = body.messages.reduce((sum, m) => sum + (m.content?.length || 0), 0);
      if (totalChars > MAX_INPUT_CHARS) return json({ error: 'Input exceeds allowed characters' }, 413);

      const messages = body.messages.map(({ role, content }) => ({ role, content }));
      if (!messages.some(m => m.role === 'system' && m.content.includes(KOREAN_DEFAULT))) {
        if (messages[0].role === 'system') messages[0].content = KOREAN_DEFAULT + '\n\n' + messages[0].content;
        else messages.unshift({ role: 'system', content: KOREAN_DEFAULT });
      }

      if (!env?.BUDGET || typeof env.BUDGET.getByName !== 'function') {
        return json({ error: 'Budget service unavailable. Use a local model.', fallback: true }, 503);
      }

      if (!await env.BUDGET.getByName('daily-free-inference').reserve()) {
        return json({ error: 'Free quota or cooldown reached. Use a local model.', retryAfter: 3, fallback: true, code: 'quota_exhausted' }, 429);
      }

      const requested = Number.isFinite(Number(body.max_tokens))
        ? Math.max(1, Math.min(MAX_OUTPUT_TOKENS, Math.floor(Number(body.max_tokens))))
        : MAX_OUTPUT_TOKENS;

      const result = await env.AI.run(MODEL, {
        messages,
        max_tokens: requested,
        temperature: Number.isFinite(Number(body.temperature)) ? Number(body.temperature) : 0.7,
        stream: false
      });

      if (typeof result?.response !== 'string' || !result.response.trim()) {
        return json({ error: 'Empty model response', fallback: true, code: 'empty_response' }, 502);
      }

      return json({
        model: MODEL,
        choices: [{ index: 0, message: { role: 'assistant', content: result.response } }],
        usage: result.usage,
        maxOutputTokens: requested,
        fallback: false
      });
    } catch (err) {
      return json({ error: 'Free inference unavailable. Use a local model.', fallback: true, code: 'provider_error' }, 503);
    }
  }
};
