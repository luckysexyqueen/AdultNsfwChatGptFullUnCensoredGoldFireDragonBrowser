import { spawn } from 'node:child_process';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { timingSafeEqual } from 'node:crypto';

const directory = path.resolve(process.env.GFD_OVPN_PROFILE_DIR || '/etc/gfd/ovpn');
const secret = process.env.GFD_VPN_CONTROL_TOKEN || '';
let child = null;
let current = null;
let lastError = null;
let tunnelReady = false;
let egressVerified = false;
let egressIp = null;
let verificationError = null;
async function verifyEgress() {
  egressVerified = false; egressIp = null; verificationError = null;
  if (!tunnelReady) return;
  try {
    const response = await fetch('https://ipwho.is/', { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw Error('IP lookup HTTP ' + response.status);
    const result = await response.json();
    if (result.success !== true || !result.ip) throw Error('Invalid IP lookup response');
    egressIp = result.ip;
    egressVerified = result.country_code === 'JP';
    if (!egressVerified) verificationError = 'Server public egress is not Japan: ' + (result.country_code || 'unknown');
  } catch (error) { verificationError = error.message; }
}
function markReady(data) {
  if (String(data).includes('Initialization Sequence Completed') && !tunnelReady) {
    tunnelReady = true;
    void verifyEgress();
  }
}


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
    send(res, 200, { controlAvailable: true, connected: Boolean(child && child.exitCode === null && tunnelReady && egressVerified), tunnelReady, egressVerified, egressIp, verificationError, starting: Boolean(child && child.exitCode === null && !tunnelReady), profile: current, lastError });
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
      tunnelReady = false; egressVerified = false; egressIp = null;
      const proc = spawn('openvpn', ['--config', full, '--script-security', '1'], { stdio: ['ignore', 'pipe', 'pipe'] });
      child = proc; current = name;
      proc.stdout.on('data', data => { markReady(data); });
      proc.stderr.on('data', data => {
        const line = String(data);
        markReady(line);
        if (/AUTH_FAILED|Options error|ERROR:|Exiting due to fatal error/i.test(line)) lastError = line.slice(-300);
      });
      proc.on('error', error => { lastError = error.message; if (child === proc) { child = null; current = null; tunnelReady = false; egressVerified = false; egressIp = null; } });
      proc.on('exit', code => { if (child === proc) { child = null; current = null; tunnelReady = false; egressVerified = false; egressIp = null; } if (code) lastError = 'OpenVPN exited: ' + code; });
      send(res, 202, { status: 'starting', profile: name });
    } catch (e) { send(res, 400, { error: e.message }); }
    return true;
  }
  send(res, 404, { error: 'Unknown VPN control action' });
  return true;
}

export function publicVpnState() {
  return { connected: Boolean(child && child.exitCode === null && tunnelReady && egressVerified), tunnelReady, egressVerified, egressIp, verificationError, starting: Boolean(child && child.exitCode === null && !tunnelReady), engine: 'openvpn', profile: current };
}
export async function startManagedVpn() {
  const name = process.env.GFD_OVPN_AUTOSTART_PROFILE;
  if (!name) return;
  if (!(await profiles()).includes(name)) throw Error('GFD_OVPN_AUTOSTART_PROFILE not installed');
  const full = path.join(directory, name);
  if (!(await stat(full)).isFile()) throw Error('Profile unavailable');
  if (child && child.exitCode === null) return;
  tunnelReady = false; egressVerified = false; egressIp = null; lastError = null;
  const proc = spawn('openvpn', ['--config', full, '--script-security', '1'], { stdio: ['ignore', 'pipe', 'pipe'] });
  child = proc; current = name;
  const log = data => {
    const line = String(data);
    markReady(line);
    if (/AUTH_FAILED|Options error|ERROR:|Exiting due to fatal error/i.test(line)) lastError = line.slice(-300);
  };
  proc.stdout.on('data', log);
  proc.stderr.on('data', log);
  proc.on('error', error => { lastError = error.message; if (child === proc) { child = null; current = null; tunnelReady = false; egressVerified = false; egressIp = null; } });
  proc.on('exit', code => { if (child === proc) { child = null; current = null; tunnelReady = false; egressVerified = false; egressIp = null; } if (code) lastError = 'OpenVPN exited: ' + code; });
}
