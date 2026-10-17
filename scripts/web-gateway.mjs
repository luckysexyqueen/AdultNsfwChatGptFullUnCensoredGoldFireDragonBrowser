// Node.js same-origin web gateway. Not an OS-level VPN.
// Restrict destinations to configured HTTPS origins to prevent an open proxy.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const port = Number(process.env.GFD_WEB_GATEWAY_PORT || 8787);
const host = process.env.GFD_WEB_GATEWAY_HOST || '127.0.0.1';
const allowed = new Set((process.env.GFD_PROXY_ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean));
const token = process.env.GFD_GATEWAY_TOKEN || '';
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.wasm':'application/wasm','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
const server = http.createServer(async (req,res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/gateway/status') {
      res.writeHead(200, {'Content-Type':'application/json','Cache-Control':'no-store'});
      return res.end(JSON.stringify({available:true, mode:'web-proxy', tunnel:false, configured:allowed.size>0}));
    }
    if (url.pathname === '/api/gateway/fetch') {
      if (req.method !== 'GET') {res.writeHead(405);return res.end();}
      if (token && req.headers['x-gfd-gateway-token'] !== token) {res.writeHead(401);return res.end('Unauthorized');}
      const destination = new URL(url.searchParams.get('url') || 'about:blank');
      if (destination.protocol !== 'https:' || !allowed.has(destination.origin) || destination.username || destination.password) {res.writeHead(403);return res.end('Destination not allowed');}
      const response = await fetch(destination, {redirect:'manual',signal:AbortSignal.timeout(15000),headers:{'Accept':req.headers.accept || '*/*'}});
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
    const data = await readFile(file);
    res.writeHead(200, {'Content-Type':mime[path.extname(file)] || 'application/octet-stream','X-Content-Type-Options':'nosniff'});
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch(e) {res.writeHead(e.code === 'ENOENT' ? 404 : 502);res.end('Gateway error');}
});
server.listen(port,host,()=>console.log('GoldFireDragon web gateway: http://'+host+':'+port));
