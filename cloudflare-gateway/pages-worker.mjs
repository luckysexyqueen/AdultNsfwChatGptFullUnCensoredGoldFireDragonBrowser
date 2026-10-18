// Cloudflare Pages advanced-mode Worker: serves static browser assets and the Node gateway-compatible API.
// This is request-driven serverless execution, not a permanently running Node.js process.
const allowedOrigins = new Set(['https://www.google.co.jp']);
const json = (value, status = 200) => Response.json(value, {status, headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/ai/chat') {
      if (request.method !== 'POST') return new Response('Method not allowed', {status:405});
      const contentLength = Number(request.headers.get('content-length') || 0);
      if (contentLength > 16000) return json({error:'Request too large'},413);
      let payload;
      try { const raw = await request.text(); if (raw.length > 16000) return json({error:'Request too large'},413); payload = JSON.parse(raw); }
      catch { return json({error:'Invalid JSON'},400); }
      if (!Array.isArray(payload.messages) || !payload.messages.length || payload.messages.length > 16 ||
          payload.messages.some(m => !['system','user','assistant'].includes(m.role) || typeof m.content !== 'string') ||
          payload.messages.reduce((n,m) => n + m.content.length,0) > 4000) return json({error:'Invalid or oversized messages'},400);
      const messages = payload.messages.map(m => ({role:m.role,content:m.content}));
      try {
        let result;
        if (env.AI) {
          const aiResult = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {messages,max_tokens:Math.min(512,Math.max(1,Number(payload.max_tokens)||256))});
          result = aiResult?.response;
        } else {
          const upstream = await fetch('https://goldfire-free-ai.huiwon0621-mcp.workers.dev/v1/chat/completions',{
            method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages,max_tokens:Math.min(256,Math.max(1,Number(payload.max_tokens)||128))}),signal:AbortSignal.timeout(25000)
          });
          if (!upstream.ok) return json({error:'Free AI provider unavailable',status:upstream.status},502);
          const data = await upstream.json();
          result = data?.choices?.[0]?.message?.content;
        }
        if (typeof result !== 'string' || !result.trim()) return json({error:'AI returned an empty answer'},502);
        return json({choices:[{message:{role:'assistant',content:result}}]});
      } catch { return json({error:'AI service temporarily unavailable'},503); }
    }
    if (url.pathname === '/api/gateway/status') {
      if (request.method !== 'GET') return new Response('Method not allowed', {status:405});
      return json({available:true,mode:'cloudflare-pages-worker',tunnel:false,configured:Boolean(env.GATEWAY_TOKEN),region:'JP',language:'ko-KR',expectedEgressCountry:'JP',deploymentRegion:'cloudflare-edge',japanEgressVerified:false});
    }
    if (url.pathname === '/api/gateway/fetch') {
      if (request.method !== 'GET') return new Response('Method not allowed', {status:405});
      if (!env.GATEWAY_TOKEN || request.headers.get('Authorization') !== 'Bearer ' + env.GATEWAY_TOKEN) return new Response('Unauthorized', {status:401});
      let target;
      try { target = new URL(url.searchParams.get('url') || ''); }
      catch { return new Response('Invalid URL', {status:400}); }
      if (target.protocol !== 'https:' || !allowedOrigins.has(target.origin) || target.username || target.password) return new Response('Destination not allowed', {status:403});
      try {
        const upstream = await fetch(target, {redirect:'manual',signal:AbortSignal.timeout(12000),headers:{'Accept':request.headers.get('Accept') || '*/*','Accept-Language':'ko-KR,ko;q=0.9,ja-JP;q=0.8'}});
        if (upstream.status >= 300 && upstream.status < 400) return new Response('Redirect blocked',{status:502});
        const bytes = await upstream.arrayBuffer();
        if (bytes.byteLength > 8 * 1024 * 1024) return new Response('Response too large',{status:413});
        return new Response(bytes,{status:upstream.status,headers:{'Content-Type':upstream.headers.get('Content-Type') || 'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
      } catch { return new Response('Upstream unavailable',{status:502}); }
    }
    return env.ASSETS.fetch(request);
  }
};
