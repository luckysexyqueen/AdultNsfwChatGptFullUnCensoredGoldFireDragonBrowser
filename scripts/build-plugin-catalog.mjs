import { readdir, readFile, writeFile, mkdir, copyFile, lstat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { normalizePlugin, LIMIT } from '../plugins/runtime.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const excluded = new Set(['node_modules', 'dist', 'site-dist', 'vendor', 'public', 'plugins', 'models', 'model_uploads', 'originals', 'env', 'Japan']);
async function json(file) {
  const stat = await lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > LIMIT) throw new Error('Invalid plugin data file');
  return JSON.parse(await readFile(file, 'utf8'));
}
export async function discover(directory, depth = 0) {
  if (depth > 5) return [];
  const entries = await readdir(directory, { withFileTypes: true });
  const plugins = [];
  if (entries.some(e => e.isFile() && e.name === 'plugin.json')) {
    try {
      const meta = await json(path.join(directory, 'plugin.json'));
      let adapter = {};
      if (entries.some(e => e.isFile() && e.name === 'web-plugin.json')) {
        adapter = await json(path.join(directory, 'web-plugin.json'));
        if (adapter.schemaVersion !== 1) throw new Error('Unsupported adapter');
        const allowed = new Set(['schemaVersion', 'context', 'autoEnable']);
        if (Object.keys(adapter).some(k => !allowed.has(k))) throw new Error('Unsupported adapter capability');
      }
      plugins.push(normalizePlugin({ id: meta.name, name: meta.extensions?.['com.openai']?.interface?.displayName || meta.name,
        version: meta.version, description: meta.description, context: adapter.context, autoEnable: adapter.autoEnable }));
    } catch { throw new Error(`Invalid plugin or adapter in ${path.basename(directory)}; no data published`); }
  }
  for (const entry of entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || excluded.has(entry.name)) continue;
    plugins.push(...await discover(path.join(directory, entry.name), depth + 1));
  }
  return plugins;
}
export async function buildCatalog(directory = root) {
  const plugins = await discover(directory);
  if (plugins.length > 100 || new Set(plugins.map(p => p.id)).size !== plugins.length) throw new Error('Too many or duplicate plugins');
  const text = JSON.stringify({ schemaVersion: 1, plugins }, null, 2) + '\n';
  if (Buffer.byteLength(text) > LIMIT) throw new Error('Plugin registry too large');
  await mkdir(path.join(directory, 'plugins'), { recursive: true });
  await mkdir(path.join(directory, 'public/plugins'), { recursive: true });
  await writeFile(path.join(directory, 'plugins/registry.json'), text);
  await writeFile(path.join(directory, 'public/plugins/registry.json'), text);
  for (const file of ['runtime.mjs', 'boot.js']) await copyFile(path.join(directory, 'plugins', file), path.join(directory, 'public/plugins', file));
  // Vite's public directory receives the same trusted assets as branch-hosted Pages.
  for (const [folder, files] of [['ai', ['boot.mjs', 'providers.mjs', 'local-gguf.mjs', 'config.json']], ['vendor/wllama', ['index.mjs', 'wllama.wasm', 'LICENCE', 'NOTICE.md']]]) {
    await mkdir(path.join(directory, 'public', folder), { recursive: true });
    for (const file of files) await copyFile(path.join(directory, folder, file), path.join(directory, 'public', folder, file));
  }
  return plugins;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  console.log(`Published ${(await buildCatalog()).length} data-only plugins`);
}
