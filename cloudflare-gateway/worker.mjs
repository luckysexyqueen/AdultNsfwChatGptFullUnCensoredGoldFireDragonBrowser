// Cloudflare edge gateway; unlike server.js this runs without a persistent Node process.
// Never treat this as an OS VPN or a verified Japanese exit IP.
const allowed = new Set(['https://www.google.co.jp']);
export default {
 async fetch(request, env) {
  const u = new URL(request.url);
  const headers = {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':env.ALLOWED_WEB_ORIGIN || 'https://luckysexyqueen.github.io','Vary':'Origin'};
  if (request.method === 'OPTIONS') return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'GET,OPTIONS','Access-Control-Allow-Headers':'Authorization'}});
  if (u.pathname === '/api/gateway/status') return Response.json({available:true,mode:'cloudflare-edge-proxy',regionTarget:'JP',japanEgressVerified:false,tunnel:false,configured:true},{headers});
  // The gateway's public URL also opens the original browser web frontend.
  // Keep gateway API routes intact and forward only document/static requests.
  if (u.pathname !== '/api/gateway/fetch') {
   if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed',{status:405});
   const site = new URL('https://goldfiredragon-browser-web.pages.dev');
   site.pathname = u.pathname === '/' ? '/index.html' : u.pathname;
   site.search = u.search;
   try {
    const response = await fetch(site.toString(), {method:request.method,redirect:'follow',signal:AbortSignal.timeout(15000)});
    const h = new Headers(response.headers);
    h.delete('set-cookie');
    h.set('X-Content-Type-Options','nosniff');
    h.set('Cache-Control',u.pathname === '/' || u.pathname.endsWith('.html') ? 'no-cache' : 'public, max-age=300');
    return new Response(response.body,{status:response.status,headers:h});
   } catch {return new Response('GoldFireDragon website upstream unavailable',{status:502});}
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
