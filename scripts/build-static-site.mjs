// Package the existing standalone site without publishing the repository itself.
import { readdir, mkdir, copyFile, readFile, writeFile, lstat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildCatalog } from './build-plugin-catalog.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const files = ['index.html', 'GoldFireDragonBrowser.html', 'boot-guard.js', 'inapp-browser.js',
  'vpn-index-control.js', 'vpn-control.js', 'vpn-profiles.json', 'native-bridge.js', 'cordova.js',
  'cordova_plugins.js', 'capacitor.plugins.json', 'aionspace-vip.js', 'hdr.js',
  'vr_360_enhanced patch script.js', 'icon.png', 'favicon.ico', 'placeholder.svg', 'robots.txt',
  'manifest.json', 'sw.js', 'full_licenses.html', 'PublicSuffixDatabase.list'];
const directories = ['plugins', 'ai', 'vendor', 'fonts', 'icon', 'images', 'img', 'lib', 'offline', 'models'];
const extensions = new Set(['.js', '.mjs', '.css', '.html', '.json', '.png', '.jpg', '.jpeg', '.gif',
  '.webp', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.wasm', '.bin', '.data', '.gguf', '.so']);
async function copyAssets(source, target) {
  await mkdir(target, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || /(?:secret|credential|token|private|^env$)/i.test(entry.name)) continue;
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) await copyAssets(from, to);
    else if (entry.isFile() && (extensions.has(path.extname(entry.name).toLowerCase()) || entry.name === 'LICENCE' || entry.name === 'NOTICE.md')) await copyFile(from, to);
  }
}
export async function buildStatic(output = path.join(root, 'site-dist')) {
  // Require a fresh destination so stale, previously copied secrets cannot survive a build.
  try { await lstat(output); throw new Error('Output exists; choose a new empty destination'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  await buildCatalog();
  await mkdir(output, { recursive: true });
  for (const file of files) await copyFile(path.join(root, file), path.join(output, file));
  for (const directory of directories) await copyAssets(path.join(root, directory), path.join(output, directory));
  // Environment is public client configuration only. Never copy .env or raw env-config.js.
  const sourceConfig = await readFile(path.join(root, 'env-config.js'), 'utf8');
  const publicConfig = {};
  const urlMatch = sourceConfig.match(/SUPABASE_URL\s*=\s*"([^"\r\n]+)"/);
  const keyMatch = sourceConfig.match(/SUPABASE_ANON_KEY\s*=\s*"([^"\r\n]+)"/);
  if (urlMatch) {
    const url = new URL(urlMatch[1]);
    if (url.protocol === 'https:' && !url.username && !url.password) publicConfig.SUPABASE_URL = url.href.replace(/\/$/, '');
  }
  if (keyMatch) {
    try {
      const payload = JSON.parse(Buffer.from(keyMatch[1].split('.')[1], 'base64url').toString());
      if (payload.role === 'anon') publicConfig.SUPABASE_ANON_KEY = keyMatch[1];
    } catch { /* Never publish a non-anonymous or unrecognized credential. */ }
  }
  await writeFile(path.join(output, 'env-config.js'), '// Public Supabase client configuration only.\nwindow.__ENV__ = Object.assign(window.__ENV__ || {}, ' + JSON.stringify(publicConfig) + ');\n');
  const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
  manifest.start_url = './';
  for (const icon of manifest.icons || []) icon.src = './' + icon.src.replace(/^\/+/, '');
  for (const shortcut of manifest.shortcuts || []) {
    shortcut.url = './';
    for (const icon of shortcut.icons || []) icon.src = './' + icon.src.replace(/^\/+/, '');
  }
  await writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  await writeFile(path.join(output, '.nojekyll'), '');
  console.log(`Static site prepared: ${output}`);
  return output;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await buildStatic(process.argv[2] && path.resolve(process.argv[2]));
