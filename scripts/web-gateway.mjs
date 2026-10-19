// Node.js same-origin web gateway. Not an OS-level VPN.
// Restrict destinations to configured HTTPS origins to prevent an open proxy.
import http from 'node:http';
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
      const probe = 'https://zuhevuyotcigibupboaz.supabase.co/functions/v1/goldfiredragon-jp-egress-status';
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
