// Cloudflare Pages advanced-mode Worker: serves static browser assets and the Node gateway-compatible API.
// This is request-driven serverless execution, not a permanently running Node.js process.
const allowedOrigins = new Set(['https://www.google.co.jp']);
const json = (value, status = 200) => Response.json(value, {status, headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
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
