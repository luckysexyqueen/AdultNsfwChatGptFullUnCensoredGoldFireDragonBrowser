// Node.js same-origin web gateway. Not an OS-level VPN.
// Restrict destinations to configured HTTPS origins to prevent an open proxy.
import http from 'node:http';
import { handleFirecrawl } from '../lib/firecrawl-handler.mjs';
import { verifyVpnEgress } from './vpn-egress.mjs';
import { handleVpnControl, publicVpnState, startManagedVpn, enableManagedVpnRecovery } from './vpn-control.mjs';
import { readFile, stat, readdir, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const projectRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const root = path.resolve(process.env.GFD_STATIC_ROOT || projectRoot);
const port = Number(process.env.PORT || process.env.GFD_WEB_GATEWAY_PORT || 8787);
const host = process.env.GFD_WEB_GATEWAY_HOST || (process.env.PORT ? '0.0.0.0' : '127.0.0.1');
const allowed = new Set((process.env.GFD_PROXY_ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean));
const token = process.env.GFD_GATEWAY_TOKEN || '';
const region = 'JP';
const language = 'ko-KR';
const expectedEgressCountry = 'JP';
const deploymentRegion = process.env.GFD_DEPLOYMENT_REGION || 'unverified';
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.wasm':'application/wasm','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.webp':'image/webp','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf','.txt':'text/plain; charset=utf-8'};
async function verifiedEgress() {
  // Remote Linux VPN node can be reached only through an explicitly configured
  // HTTPS endpoint with a private bearer token. Never trust browser-supplied URLs.
  const remote = process.env.GFD_VPN_NODE_URL;
  const secret = process.env.GFD_VPN_NODE_TOKEN;
  if (remote) {
    if (!secret) return { verified:false, reason:'VPN node token not configured' };
    try {
      const endpoint = new URL('/api/vpn/status', remote);
      if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password)
        return { verified:false, reason:'VPN node must use authenticated HTTPS' };
      const response = await fetch(endpoint, {
        headers: { Authorization: 'Bearer ' + secret },
        signal: AbortSignal.timeout(7000), cache:'no-store'
      });
      if (!response.ok) return { verified:false, reason:'VPN node status HTTP ' + response.status };
      const state = await response.json();
      return state.connected === true && state.egressVerified === true && state.egressCountry === 'JP'
        ? { verified:true, country:'JP', ip:state.egressIp || null, remote:true }
        : { verified:false, reason:state.message || 'Remote Japan VPN not verified' };
    } catch(error) { return { verified:false, reason:'VPN node unavailable: ' + error.message }; }
  }
  // The persistent systemd OpenVPN runs independently of this Node process.
  // Verify the host route and public IP directly instead of requiring a child PID.
  try { return await verifyVpnEgress(); }
  catch (error) { return { verified: false, reason: error.message }; }
}
const server = http.createServer(async (req,res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/vpn-dashboard') {
      if (req.method !== 'GET') { res.writeHead(405); return res.end(); }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'", 'X-Content-Type-Options': 'nosniff' });
      return res.end(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GoldFireDragon VPN 제어</title><style>body{background:#0c0c10;color:#eee;font:16px system-ui;margin:2rem auto;max-width:800px;padding:0 1rem}section{background:#171720;padding:1.4rem;border-radius:12px;margin:1rem 0}button,input,select{padding:.7rem;margin:.4rem;background:#292936;color:white;border:1px solid #555;border-radius:6px}input{width:90%}a{color:#9cf}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style></head><body><h1>🛰️ GoldFireDragon 일본 VPN 대시보드</h1><p>서버에서 설치한 OVPN 프로필만 선택할 수 있습니다. 연결은 서버의 OpenVPN에서 실행되며 GitHub Pages 단독으로는 VPN을 실행할 수 없습니다.</p><section><h2>🔒 VPN 상태</h2><pre id="status">확인 중…</pre><button id="refresh">상태 갱신</button></section><section><h2>⚙️ 서버 VPN 제어</h2><label>관리 토큰 (서버의 GFD_VPN_CONTROL_TOKEN)<input id="token" type="password" autocomplete="off"></label><p><button id="profiles">설치된 프로필 조회</button><select id="profile"></select></p><button id="connect">연결 요청</button><button id="stop">연결 해제</button><pre id="result" role="status"></pre></section><section><h2>🔍 일본 검색</h2><form id="search"><input id="query" aria-label="검색어" placeholder="검색어"><button>검색</button></form><p>검색은 기존 GoldFireDragonBrowser 화면에서 수행합니다. 비밀번호 및 로그인 쿠키는 서버로 전송하지 않습니다.</p></section><script>
      const byId=id=>document.getElementById(id);
      async function status(){try{const r=await fetch('/api/vpn/status',{cache:'no-store'});const d=await r.json();byId('status').textContent=JSON.stringify({connected:d.connected,egressVerified:d.egressVerified,egressCountry:d.egressCountry,egressIp:d.egressIp,profile:d.profile,message:d.message},null,2);}catch(e){byId('status').textContent=e.message;}}
      async function control(action,body){const headers={'x-gfd-vpn-token':byId('token').value};if(body)headers['Content-Type']='application/json';try{const r=await fetch('/api/vpn/control/'+action,{method:action==='profiles'?'GET':'POST',headers,body:body?JSON.stringify(body):undefined});const d=await r.json();byId('result').textContent=JSON.stringify(d,null,2);if(action==='profiles'&&r.ok){byId('profile').replaceChildren();for(const name of d.profiles||[]){const option=document.createElement('option');option.value=name;option.textContent=name;byId('profile').append(option);}}await status();}catch(e){byId('result').textContent=e.message;}}
      byId('refresh').onclick=status;byId('profiles').onclick=()=>control('profiles');byId('connect').onclick=()=>control('start',{profile:byId('profile').value});byId('stop').onclick=()=>control('stop');byId('search').onsubmit=e=>{e.preventDefault();const q=byId('query').value.trim();if(q)location.href='/GoldFireDragonBrowser.html?q='+encodeURIComponent(q);};status();setInterval(status,10000);
      </script></body></html>`);
    }
    if (url.pathname === '/api/firecrawl') {
      res.setHeader('Content-Type','application/json; charset=utf-8');
      res.setHeader('Cache-Control','no-store');
      if(req.method!=='POST'){res.writeHead(405);return res.end(JSON.stringify({error:'Method not allowed'}));}
      if(process.env.GFD_FIRECRAWL_TOKEN && req.headers['x-gfd-firecrawl-token']!==process.env.GFD_FIRECRAWL_TOKEN){res.writeHead(401);return res.end(JSON.stringify({error:'Unauthorized'}));}
      try{let raw='';for await(const part of req){raw+=part;if(raw.length>4096){res.writeHead(413);return res.end(JSON.stringify({error:'Too large'}));}}
        const result=await handleFirecrawl(JSON.parse(raw));res.writeHead(200);return res.end(JSON.stringify(result));
      }catch(e){res.writeHead(400);return res.end(JSON.stringify({error:e.message||'Firecrawl failed'}));}
    }
    if (await handleVpnControl(req, res, url.pathname)) return;
    // Only the public VPN metadata/status endpoints support cross-origin reads.
    const origin = req.headers.origin || '';
    const trustedOrigins = new Set([
      'https://luckysexyqueen.github.io',
      'https://goldfiredragon-browser-web.pages.dev',
      'https://goldfiredragon-jp-web-gateway.choluckyhexsexyqueen.workers.dev'
    ]);
    if ((url.pathname === '/api/vpn/profiles' || url.pathname === '/api/vpn/status') && trustedOrigins.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    if (url.pathname === '/api/vpn/profiles' || url.pathname === '/api/vpn/status') {
      if (req.method === 'OPTIONS') {res.writeHead(204);return res.end();}
    }
    if (url.pathname === '/api/vpn/profiles' || url.pathname === '/api/vpn/status') {
      if (req.method !== 'GET') {res.writeHead(405);return res.end();}
      res.setHeader('Content-Type','application/json; charset=utf-8');
      res.setHeader('Cache-Control','no-store');
      if (url.pathname === '/api/vpn/status') {
        let tunAvailable = false;
        try { await access('/dev/net/tun'); tunAvailable = true; } catch {}
        const egress = await verifiedEgress();
        return res.end(JSON.stringify({available:true,...publicVpnState(),connected:egress.verified,trafficForwardingVerified:egress.verified && !egress.remote,remoteNodeVerified:Boolean(egress.remote),egressVerified:egress.verified,egressIp:egress.ip || null,egressCountry:egress.country || null,tunAvailable,hosting:'node-linux',message:egress.verified?'Japan VPN egress verified':egress.reason}));
      }
      const base = path.join(projectRoot,'Japan','Configs');
      const files = [];
      async function scan(dir, depth=0) {
        if (depth>2) return;
        for (const entry of await readdir(dir,{withFileTypes:true})) {
          if (entry.isDirectory()) { if (entry.name !== 'Private') await scan(path.join(dir,entry.name),depth+1); continue; }
          if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.ovpn')) continue;
          const full=path.join(dir,entry.name);
          const contents=await readFile(full,'utf8');
          const remote=contents.match(/^\s*remote\s+(\S+)\s+(\d+)/m);
          const proto=contents.match(/^\\s*proto\\s+(\\S+)/m);
          if (remote) files.push({name:entry.name,host:remote[1],port:Number(remote[2]),protocol:proto?.[1]||'unknown'});
        }
      }
      try { await scan(base); } catch(e) { if(e.code!=='ENOENT') throw e; }
      return res.end(JSON.stringify({profiles:files,connected:false,source:'Japan/Configs',privateProfilesExcluded:true}));
    }
    if (url.pathname === '/api/jp/egress-status') {
      if (req.method !== 'GET') { res.writeHead(405); return res.end(); }
      const probe = 'https://zuhevuyotcigibupboaz.supabase.co/functions/v1/goldfiredragon-jp-gateway?action=status';
      try {
        const response = await fetch(probe, {signal:AbortSignal.timeout(9000),cache:'no-store'});
        const result = await response.json();
        res.writeHead(response.ok ? 200 : 503, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
        return res.end(JSON.stringify({ ...result, japanEgressVerified:response.ok && result.japanEgressVerified === true, vpnConnected:false, vpnVerified:false, source:'supabase-edge-probe' }));
      } catch (error) {
        res.writeHead(503, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
        return res.end(JSON.stringify({japanEgressVerified:false,vpnConnected:false,vpnVerified:false,error:'Supabase egress probe unavailable',source:'supabase-edge-probe'}));
      }
    }
    if (url.pathname === '/api/gateway/status') {
      res.writeHead(200, {'Content-Type':'application/json','Cache-Control':'no-store'});
      const egress = await verifiedEgress();
      return res.end(JSON.stringify({available:true, mode:'web-proxy', tunnel:egress.verified, configured:allowed.size>0, region, language, expectedEgressCountry, deploymentRegion, japanEgressVerified:egress.verified,trafficForwardingVerified:egress.verified && !egress.remote,remoteNodeVerified:Boolean(egress.remote),reason:egress.reason || null}));
    }
    if (url.pathname === '/api/gateway/fetch') {
      if (req.method !== 'GET') {res.writeHead(405);return res.end();}
      if (token && req.headers['x-gfd-gateway-token'] !== token) {res.writeHead(401);return res.end('Unauthorized');}
      const egress = await verifiedEgress();
      if (!egress.verified) {res.writeHead(503, {'Content-Type':'application/json'});return res.end(JSON.stringify({error:'VPN egress not verified',reason:egress.reason}));}
      const destination = new URL(url.searchParams.get('url') || 'about:blank');
      if (destination.protocol !== 'https:' || !allowed.has(destination.origin) || destination.username || destination.password) {res.writeHead(403);return res.end('Destination not allowed');}
      if (egress.remote) {
        const endpoint = new URL('/api/vpn/fetch',process.env.GFD_VPN_NODE_URL);
        endpoint.searchParams.set('url',destination.href);
        const relay = await fetch(endpoint,{redirect:'manual',signal:AbortSignal.timeout(20000),headers:{Authorization:'Bearer '+process.env.GFD_VPN_NODE_TOKEN,Accept:req.headers.accept||'*/*'}});
        const bytes=Buffer.from(await relay.arrayBuffer());
        if(bytes.length>8*1024*1024){res.writeHead(413);return res.end('Response too large');}
        res.writeHead(relay.status,{'Content-Type':relay.headers.get('content-type')||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
        return res.end(bytes);
      }
      const response = await fetch(destination, {redirect:'manual',signal:AbortSignal.timeout(15000),headers:{'Accept':req.headers.accept || '*/*', 'Accept-Language':'ko-KR,ko;q=0.9,ja-JP;q=0.8'}});
      const contentType = response.headers.get('content-type') || 'application/octet-stream';
      if (response.status >= 300 && response.status < 400) {res.writeHead(502);return res.end('Redirect blocked');}
      const body = Buffer.from(await response.arrayBuffer());
      if (body.length > 8*1024*1024) {res.writeHead(413);return res.end('Response too large');}
      res.writeHead(response.status,{'Content-Type':contentType,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
      return res.end(body);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {res.writeHead(405);return res.end();}
    const file = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(root + path.sep)) {res.writeHead(403);return res.end();}
    // Never serve raw OVPN profiles, certificates, keys or internal folders as static assets.
    const relative = path.relative(root, file).split(path.sep).join('/');
    if (/\\.(?:ovpn|pem|key|p12|pfx)$/i.test(relative) ||
        /(?:^|\/)(?:Private|\.git|\.github)(?:\/|$)/i.test(relative)) {
      res.writeHead(403);return res.end('Forbidden');
    }
    if (!(await stat(file)).isFile()) {res.writeHead(404);return res.end('Not found');}
    const data = await readFile(file);
    res.writeHead(200, {'Content-Type':mime[path.extname(file)] || 'application/octet-stream','X-Content-Type-Options':'nosniff'});
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch(e) {res.writeHead(e.code === 'ENOENT' ? 404 : 502);res.end('Gateway error');}
});
server.listen(port,host,()=>console.log('GoldFireDragon web gateway: http://'+host+':'+port));

enableManagedVpnRecovery();
startManagedVpn().catch(error => console.error('Managed VPN startup failed:', error.message));
