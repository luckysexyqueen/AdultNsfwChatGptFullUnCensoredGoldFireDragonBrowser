import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseRegistry, createManager, loadRegistry, createPreferenceStorage, LIMIT } from '../plugins/runtime.mjs';
import { discover, buildCatalog } from '../scripts/build-plugin-catalog.mjs';
import { buildStatic } from '../scripts/build-static-site.mjs';

const plugin = { id: 'sample', name: 'Sample <img onerror=alert(1)>', version: '1.0', description: 'Example', context: 'Preserve character continuity.' };
const registry = (...plugins) => ({ schemaVersion: 1, plugins });
test('catalog metadata is not executable and bad entries are isolated', () => {
  const parsed = parseRegistry(registry(plugin, { ...plugin, id: '../env' }, plugin));
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].name, plugin.name);
  assert.equal('script' in parsed[0], false);
  assert.throws(() => parseRegistry({ schemaVersion: 2, plugins: [] }));
});
test('contexts default off, preserve original instructions, disable and persist per version', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const plugins = parseRegistry(registry(plugin));
  const manager = createManager(plugins, storage);
  assert.equal(manager.extendInstructions('Original'), 'Original');
  assert.equal(manager.setEnabled('sample', true), true);
  assert.match(manager.extendInstructions('Original'), /^Original\n\n\[Website plugin:/);
  assert.equal(createManager(plugins, storage).list()[0].enabled, true);
  assert.equal(createManager(parseRegistry(registry({ ...plugin, version: '2' })), storage).list()[0].enabled, false);
  manager.setEnabled('sample', false);
  assert.equal(manager.extendInstructions('Original'), 'Original');
  assert.equal(manager.setEnabled('missing', true), false);
});
test('blocked storage does not break plugins and context size is bounded', () => {
  const manager = createManager(parseRegistry(registry({ ...plugin, autoEnable: true })), {
    getItem() { throw Error('denied'); }, setItem() { throw Error('denied'); },
  });
  assert.equal(manager.list()[0].enabled, true);
  manager.setEnabled('sample', false);
  assert.equal(manager.extendInstructions(), '');
});
test('secrets are rejected and unknown executable fields are never projected', () => {
  assert.equal(parseRegistry(registry({ ...plugin, description: 'hf_' + 'A'.repeat(30) })).length, 0);
  const [projected] = parseRegistry(registry({ ...plugin, script: 'evil.js', api_key: 'private' }));
  assert.equal('script' in projected, false);
  assert.equal('api_key' in projected, false);
});
test('fetch uses no credentials, refuses errors, HTML, oversize and redirects', async () => {
  let options;
  const fetcher = async (url, config) => {
    assert.equal(url, 'https://example.test/project/plugins/registry.json');
    options = config;
    return Response.json(registry(plugin));
  };
  const manager = await loadRegistry('https://example.test/project/plugins/registry.json', { fetcher });
  assert.equal(manager.list().length, 1);
  assert.equal(options.credentials, 'omit');
  assert.equal(options.redirect, 'error');
  await assert.rejects(loadRegistry('x', { fetcher: async () => new Response('missing', { status: 404 }) }));
  await assert.rejects(loadRegistry('x', { fetcher: async () => new Response('<html>fallback</html>') }));
  await assert.rejects(loadRegistry('x', { fetcher: async () => new Response(' '.repeat(LIMIT + 1), { headers: { 'content-type': 'application/json' } }) }));
  await assert.rejects(loadRegistry('x', { timeout: 5, fetcher: async (url, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(Error('aborted')))) }));
});
test('discovery finds nested packages, skips secrets and dot directories, rejects executable adapters', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'gfd-plugins-'));
  try {
    await mkdir(path.join(temp, 'nested/package'), { recursive: true });
    await mkdir(path.join(temp, '.hidden'), { recursive: true });
    await writeFile(path.join(temp, '.env'), 'PRIVATE=never-publish');
    await writeFile(path.join(temp, '.hidden/plugin.json'), JSON.stringify({ name: 'hidden' }));
    await writeFile(path.join(temp, 'nested/package/plugin.json'), JSON.stringify({ name: 'nested', version: '1', description: 'Safe', api_key: 'never-publish' }));
    const found = await discover(temp);
    assert.equal(found.length, 1);
    assert.equal(found[0].id, 'nested');
    assert.equal(JSON.stringify(found).includes('never-publish'), false);
    await writeFile(path.join(temp, 'nested/package/web-plugin.json'), JSON.stringify({ schemaVersion: 1, script: './evil.js' }));
    await assert.rejects(discover(temp), /no data published/);
  } finally { await rm(temp, { recursive: true, force: true }); }
});
test('repository catalog is deterministic and contains all three existing plugins', async () => {
  const plugins = await buildCatalog();
  const before = await readFile(new URL('../plugins/registry.json', import.meta.url), 'utf8');
  const boot = await readFile(new URL('../plugins/boot.js', import.meta.url), 'utf8');
  await buildCatalog();
  assert.equal(await readFile(new URL('../plugins/registry.json', import.meta.url), 'utf8'), before);
  assert.equal(await readFile(new URL('../public/plugins/registry.json', import.meta.url), 'utf8'), before);
  assert.equal(await readFile(new URL('../plugins/boot.js', import.meta.url), 'utf8'), boot);
  assert.equal(await readFile(new URL('../public/plugins/boot.js', import.meta.url), 'utf8'), boot);
  assert.ok(!/\bimport\s*\(/.test(boot));
  for (const id of ['lovebound-zeta-roleplay', 'lovebound-ai-model-studio', 'spec-direct-auto-inject']) {
    assert.ok(plugins.some(p => p.id === id && p.context && !p.autoEnable));
  }
});
test('static artifact preserves website entrypoints and excludes private source/configuration', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'gfd-static-'));
  const output = path.join(temp, 'site');
  try {
    await buildStatic(output);
    for (const file of ['index.html', 'GoldFireDragonBrowser.html', 'plugins/boot.js', 'plugins/runtime.mjs', 'plugins/registry.json', 'webviews/gecko/adapter.js', 'webviews/chromium/adapter.js', 'webviews/custom/adapter.js']) {
      assert.deepEqual(await readFile(path.join(output, file)), await readFile(new URL('../' + file, import.meta.url)));
    }
    for (const file of ['.env', '.git/config', 'server.js', 'ONLY-MY-AI-API-MCP-PLUGINS/plugin.json', 'Japan/Configs/FOV_Japan_219.100.37.170_tcp.ovpn']) {
      await assert.rejects(readFile(path.join(output, file)), { code: 'ENOENT' });
    }
    const manifest = JSON.parse(await readFile(path.join(output, 'manifest.json')));
    assert.equal(manifest.start_url, './');
    assert.ok(manifest.icons.every(icon => icon.src.startsWith('./')));
    await assert.rejects(buildStatic(output), /Output exists/);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('preference storage probes persistence and falls back without losing current choices', async () => {
  const memory = await createPreferenceStorage({storage:{setItem(){throw Error('denied');}}});
  memory.setItem('gfd-plugin:sample:1','1');
  await memory.flush();
  assert.equal(memory.getItem('gfd-plugin:sample:1'),'1');
  const values = new Map();
  const persistent = {getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
  assert.equal(await createPreferenceStorage({storage:persistent}),persistent);
  assert.equal(values.size,0);
});
