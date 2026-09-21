const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const nodeExe = process.execPath;
const nodeDir = path.dirname(nodeExe);
const candidates = [
  path.join(nodeDir, 'npm.cmd'),
  process.env.NPM_CMD,
  process.env.ComSpec ? null : null,
  process.env.ProgramFiles ? path.join(process.env.ProgramFiles, 'nodejs', 'npm.cmd') : null,
  process.env['ProgramFiles(x86)'] ? path.join(process.env['ProgramFiles(x86)'], 'nodejs', 'npm.cmd') : null,
].filter(Boolean);

const npmCmd = candidates.find(p => fs.existsSync(p));
if (!npmCmd) {
  console.error('[GoldFireDragon] npm.cmd not found.');
  console.error('[GoldFireDragon] Node:', nodeExe);
  process.exit(1);
}

const cache = process.env.NPM_CONFIG_CACHE || path.join(os.tmpdir(), 'GoldFireDragon-npm-cache');
fs.mkdirSync(cache, { recursive: true });

console.log('[GoldFireDragon] npm =>', npmCmd);
console.log('[GoldFireDragon] cwd =>', process.cwd());

/*
 * Windows .cmd files must be launched through cmd.exe.
 * shell:false + spawnSync(npm.cmd) causes EINVAL on some Node/Windows combinations.
 */
const comspec = process.env.ComSpec || process.env.COMSPEC || 'C:\\Windows\\System32\\cmd.exe';
const command = `"${npmCmd}" install --no-audit --no-fund`;

const result = spawnSync(comspec, ['/d', '/s', '/c', command], {
  cwd: process.cwd(),
  stdio: 'inherit',
  windowsHide: false,
  shell: false,
  env: {
    ...process.env,
    PATH: `${nodeDir};${process.env.PATH || ''}`,
    NPM_CONFIG_CACHE: cache,
    npm_config_cache: cache,
  },
});

if (result.error) {
  console.error('[GoldFireDragon] npm launcher error:', result.error.message);
  process.exit(1);
}
process.exit(result.status == null ? 1 : result.status);
