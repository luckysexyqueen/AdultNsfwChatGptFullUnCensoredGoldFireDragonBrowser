import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
export async function verifyVpnEgress({ route = async () => (await exec('ip', ['-4','route','get','1.1.1.1'], { timeout: 5000 })).stdout, lookup = async () => {
  const response = await fetch('https://ipwho.is/', { signal: AbortSignal.timeout(7000), cache: 'no-store' });
  if (!response.ok) throw Error('Egress lookup HTTP ' + response.status);
  return response.json();
} } = {}) {
  const routeText = await route();
  if (!/\bdev\s+(?:tun\d+|tap\d+)\b/.test(routeText)) return { verified: false, reason: 'Default outbound route does not use VPN tunnel' };
  const data = await lookup();
  if (data.success !== true || data.country_code !== 'JP') return { verified: false, reason: 'VPN exit country is not verified as Japan' };
  return { verified: true, country: 'JP', ip: data.ip };
}
