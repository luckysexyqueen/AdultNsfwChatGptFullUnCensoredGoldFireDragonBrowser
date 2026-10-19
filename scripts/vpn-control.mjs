import { spawn } from 'node:child_process';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { timingSafeEqual } from 'node:crypto';

const directory = path.resolve(process.env.GFD_OVPN_PROFILE_DIR || '/etc/gfd/ovpn');
const secret = process.env.GFD_VPN_CONTROL_TOKEN || '';
let child = null;
let current = null;
let lastError = null;

function send(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}
function authorized(req) {
  const supplied = req.headers['x-gfd-vpn-token'];
  if (!secret || typeof supplied !== 'string') return false;
  const a = Buffer.from(secret), b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}
async function profiles() {
  const entries = await readdir(directory, { withFileTypes: true });
  return entries.filter(e => e.isFile() && /^[\w.-]+\.ovpn$/i.test(e.name)).map(e => e.name);
}
export async function handleVpnControl(req, res, pathname) {
  if (!pathname.startsWith('/api/vpn/control/')) return false;
  if (req.method !== 'POST' && req.method !== 'GET') { send(res, 405, { error: 'Method not allowed' }); return true; }
  if (!authorized(req)) { send(res, 401, { error: 'VPN controller authorization required' }); return true; }
  if (req.headers.origin) {
    try {
      const origin = new URL(req.headers.origin);
      const host = req.headers.host;
      if (origin.host !== host || !['http:', 'https:'].includes(origin.protocol)) {
        send(res, 403, { error: 'Cross-origin VPN control denied' }); return true;
      }
    } catch { send(res, 403, { error: 'Invalid Origin' }); return true; }
  }
  const action = pathname.slice('/api/vpn/control/'.length);
  if (action === 'status' && req.method === 'GET') {
    send(res, 200, { controlAvailable: true, connected: Boolean(child && child.exitCode === null), profile: current, lastError });
    return true;
  }
  if (action === 'profiles' && req.method === 'GET') {
    try { send(res, 200, { profiles: await profiles() }); }
    catch (e) { send(res, 503, { error: e.message }); }
    return true;
  }
  if (action === 'stop' && req.method === 'POST') {
    if (child) child.kill('SIGTERM');
    send(res, 200, { status: child ? 'disconnect-requested' : 'disconnected' });
    return true;
  }
  if (action === 'start' && req.method === 'POST') {
    let raw = '';
    try {
      for await (const part of req) { raw += part; if (raw.length > 2048) throw Error('Request too large'); }
      const name = JSON.parse(raw).profile;
      if (typeof name !== 'string' || !(await profiles()).includes(name)) {
        send(res, 400, { error: 'Choose an installed OVPN profile' }); return true;
      }
      if (child && child.exitCode === null) { send(res, 409, { error: 'VPN already running', profile: current }); return true; }
      const full = path.join(directory, name);
      if (!(await stat(full)).isFile()) throw Error('Profile unavailable');
      lastError = null;
      const proc = spawn('openvpn', ['--config', full, '--script-security', '1'], { stdio: ['ignore', 'ignore', 'pipe'] });
      child = proc; current = name;
      proc.stderr.on('data', data => { lastError = String(data).slice(-300); });
      proc.on('error', error => { lastError = error.message; if (child === proc) { child = null; current = null; } });
      proc.on('exit', code => { if (child === proc) { child = null; current = null; } if (code) lastError = 'OpenVPN exited: ' + code; });
      send(res, 202, { status: 'starting', profile: name });
    } catch (e) { send(res, 400, { error: e.message }); }
    return true;
  }
  send(res, 404, { error: 'Unknown VPN control action' });
  return true;
}
