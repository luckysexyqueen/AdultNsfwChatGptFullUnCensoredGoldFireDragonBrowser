// Cloudflare edge gateway; unlike server.js this runs without a persistent Node process.
// Never treat this as an OS VPN or a verified Japanese exit IP.
const allowed = new Set(['https://www.google.co.jp']);
export default {
 async fetch(request, env) {
  const u = new URL(request.url);
  const headers = {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':env.ALLOWED_WEB_ORIGIN || 'https://luckysexyqueen.github.io','Vary':'Origin'};
  if (request.method === 'OPTIONS') return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'GET,OPTIONS','Access-Control-Allow-Headers':'Authorization'}});
  // Japan server is opt-in: set JP_SERVER_ORIGIN to a verified HTTPS origin hosted in Japan.
  // Merely setting this variable does not prove the server's egress location.
  let jpOrigin = null;
  try {
   const configured = new URL(env.JP_SERVER_ORIGIN || '');
   if (configured.protocol === 'https:' && !configured.username && !configured.password && configured.pathname === '/' && !configured.search && !configured.hash && configured.hostname !== u.hostname) jpOrigin = configured.origin;
  } catch {}
  if (u.pathname === '/api/gateway/status') return Response.json({available:true,mode:'cloudflare-edge-proxy',regionTarget:'JP',japanEgressVerified:false,japanServerConfigured:!!jpOrigin,tunnel:false,configured:true},{headers});
  if (u.pathname === '/api/jp/status') return Response.json({configured:!!jpOrigin,region:'JP',egressVerified:false,mode:jpOrigin?'https-upstream':'not-configured'},{headers});
  if (u.pathname === '/api/jp/proxy') {
   if (!jpOrigin) return Response.json({error:'Japan server not configured',required:'JP_SERVER_ORIGIN'},{status:503,headers});
   if (request.method !== 'GET') return new Response('Method not allowed',{status:405});
   if (!env.GATEWAY_TOKEN || request.headers.get('Authorization') !== 'Bearer '+env.GATEWAY_TOKEN) return new Response('Unauthorized',{status:401});
   const route = u.searchParams.get('path') || '/';
   if (!route.startsWith('/') || route.startsWith('//') || route.includes('\\\\')) return new Response('Invalid path',{status:400});
   const upstream = new URL(route,jpOrigin);
   if (upstream.origin !== jpOrigin) return new Response('Forbidden',{status:403});
   try {
    const result = await fetch(upstream.toString(),{redirect:'manual',signal:AbortSignal.timeout(12000)});
    if (result.status >= 300 && result.status < 400) return new Response('Redirect blocked',{status:502});
    return new Response(result.body,{status:result.status,headers:{'Content-Type':result.headers.get('Content-Type') || 'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
   } catch {return new Response('Japan server unavailable',{status:502});}
  }
  // The gateway's public URL also opens the original browser web frontend.
  // Keep gateway API routes intact and forward only document/static requests.
  if (u.pathname !== '/api/gateway/fetch') {
   if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed',{status:405});
   if (!env.ASSETS) return new Response('Static website assets not deployed',{status:503});
   // Cloudflare assets canonicalizes /index.html to /. Do not rewrite / back to /index.html.
   return env.ASSETS.fetch(request);
  }
  if (request.method !== 'GET') return new Response('Method not allowed',{status:405});
  if (!env.GATEWAY_TOKEN || request.headers.get('Authorization') !== 'Bearer '+env.GATEWAY_TOKEN) return new Response('Unauthorized',{status:401});
  let target;
  try {target = new URL(u.searchParams.get('url') || '');} catch {return new Response('Invalid URL',{status:400});}
  if (target.protocol !== 'https:' || !allowed.has(target.origin) || target.username || target.password) return new Response('Forbidden',{status:403});
  try {
   const response = await fetch(target.toString(),{redirect:'manual',headers:{'Accept-Language':'ko-KR,ko;q=0.9,ja-JP;q=0.8'},signal:AbortSignal.timeout(12000)});
   if (response.status >= 300 && response.status < 400) return new Response('Redirect blocked',{status:502});
   const length = Number(response.headers.get('content-length') || 0);
   if (length > 2*1024*1024) return new Response('Too large',{status:413});
   const body = await response.arrayBuffer();
   if (body.byteLength > 2*1024*1024) return new Response('Too large',{status:413});
   return new Response(body,{status:response.status,headers:{'Content-Type':response.headers.get('content-type') || 'application/octet-stream','Cache-Control':'no-store','Access-Control-Allow-Origin':headers['Access-Control-Allow-Origin'],'X-Content-Type-Options':'nosniff'}});
  } catch {return new Response('Upstream unavailable',{status:502});}
 }
};
