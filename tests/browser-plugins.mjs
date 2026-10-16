// Optional real-browser checks: install Playwright and a browser, then run this file.
// GFD_PLAYWRIGHT_MODULE can point at an existing Playwright installation.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.GFD_PLAYWRIGHT_MODULE || 'playwright');
const root = process.env.GFD_STATIC_ROOT || fileURLToPath(new URL('../site-dist/', import.meta.url));
const prefix = '/AdultNsfwChatGptFullUnCensoredGoldFireDragonBrowser/';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    const relative = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : pathname.slice(1);
    const file = path.resolve(root, relative || 'index.html');
    if (!file.startsWith(root) || !(await stat(file)).isFile()) throw Error('missing');
    response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    response.end(await readFile(file));
  } catch { response.writeHead(404); response.end('missing'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, ...(process.env.GFD_BROWSER_CHANNEL ? { channel: process.env.GFD_BROWSER_CHANNEL } : {}) });
try {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  // No real AI calls, credentials or remote code during these integration tests.
  const requests = [];
  await context.route('**/*', route => {
    requests.push(route.request().url());
    if (!route.request().url().startsWith(origin)) return route.abort();
    return route.continue();
  });
  const page = await context.newPage();
  for (const base of ['/', prefix]) {
    await page.goto(origin + base);
    await page.waitForFunction(() => window.GFDPlugins?.list().length === 3);
    assert.equal(await page.locator('#gfd-plugin-controls summary').innerText(), '플러그인 3개');
    await page.locator('#gfd-plugin-controls summary').click();
    const checkbox = page.locator('#gfd-plugin-controls input').first();
    await checkbox.check();
    assert.match(await page.evaluate(() => window.GFDPlugins.extendInstructions('Original')), /^Original\n\n\[Website plugin:/);
    await page.reload();
    await page.waitForFunction(() => window.GFDPlugins?.list().length === 3);
    assert.equal(await page.evaluate(() => window.GFDPlugins.list()[0].enabled), true);
    await page.locator('#gfd-plugin-controls summary').click();
    await checkbox.uncheck();
    assert.equal(await page.evaluate(() => window.GFDPlugins.extendInstructions('Original')), 'Original');
  }
  // Exercise the actual standalone sendMessage function with controlled model/API stubs.
  await page.waitForFunction(() => window.__bootReady === true);
  const inference = await page.evaluate(async () => {
    const manager = window.GFDPlugins;
    manager.setEnabled(manager.list()[0].id, true);
    const captured = { local: [], remote: null, fallback: [] };
    S.user = { id: 'test-guest', isAnonymous: true };
    S.currentGPT = { id: 'test-gpt', system_prompt: 'Original system', instructions: 'Original instructions' };
    S.currentGPTFiles = [];
    S.isOnline = true;
    S.ggufAutoFallback = false;
    S.localModel = { ready: true };
    window.LocalGGUF = { generate: async messages => { captured.local = messages; return 'Local fixture reply'; }, getStatus: () => ({ ready: true }) };
    await sendMessage('Local fixture message');
    S.localModel = { ready: false };
    sb.auth.getSession = async () => ({ data: { session: { access_token: 'test-session-token' } } });
    const originalFetch = window.fetch;
    window.fetch = async (url, options) => {
      captured.remote = JSON.parse(options.body);
      return new Response('data: {"choices":[{"delta":{"content":"Remote fixture reply"}}]}\n\ndata: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
    };
    await sendMessage('Remote fixture message');
    S.localModel = { ready: false };
    S.ggufAutoFallback = true;
    window.fetch = async () => { S.localModel = { ready: true }; throw Error('controlled API failure'); };
    window.LocalGGUF.generate = async messages => { captured.fallback = messages; return 'Fallback fixture reply'; };
    await sendMessage('Fallback fixture message');
    window.fetch = originalFetch;
    captured.original = S.currentGPT.instructions;
    manager.setEnabled(manager.list()[0].id, false);
    return captured;
  });
  assert.equal(inference.original, 'Original instructions');
  assert.match(inference.local.find(m => m.content.startsWith('Original instructions')).content, /Website plugin:/);
  assert.match(inference.remote.instructions, /Website plugin:/);
  assert.match(inference.fallback.find(m => m.content.startsWith('Original instructions')).content, /Website plugin:/);

  await page.goto(origin + prefix + 'GoldFireDragonBrowser.html');
  await page.waitForFunction(() => window.GFDPlugins?.list().length === 3);
  assert.equal(await page.locator('#search-btn').count(), 1);
  assert.equal(await page.locator('#vpn-server-selector').count(), 1);

  // Test a hostile display name as text, including on a narrow screen.
  const registry = JSON.parse(await readFile(path.join(root, 'plugins/registry.json'), 'utf8'));
  registry.plugins[0].name = '<img src=x onerror="window.pwned=true">';
  await page.route('**/plugins/registry.json', route => route.fulfill({ json: registry }));
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(origin + prefix);
  await page.waitForFunction(() => window.GFDPlugins?.list().length === 3);
  await page.locator('#gfd-plugin-controls summary').click();
  assert.equal(await page.locator('#gfd-plugin-controls img').count(), 0);
  assert.equal(await page.evaluate(() => window.pwned), undefined);
  assert.ok((await page.locator('#gfd-plugin-controls details').boundingBox()).x >= 0);

  for (const failure of ['missing', 'malformed', 'timeout']) {
    await page.unroute('**/plugins/registry.json');
    await page.route('**/plugins/registry.json', route => failure === 'missing'
      ? route.fulfill({ status: 404, body: 'missing' })
      : failure === 'malformed' ? route.fulfill({ contentType: 'application/json', body: '{broken' })
      : new Promise(resolve => setTimeout(() => { route.abort().catch(() => {}); resolve(); }, 4500)));
    await page.goto(origin + prefix);
    await page.waitForFunction(() => window.GFDPluginsReady);
    await page.evaluate(() => window.GFDPluginsReady);
    assert.equal(await page.evaluate(() => window.GFDPlugins.list().length), 0);
    assert.equal(await page.evaluate(() => window.GFDPlugins.extendInstructions('Original')), 'Original');
  }
  assert.ok(!requests.some(url => /\/(?:\.env|plugin\.json|web-plugin\.json|SKILL\.md)(?:$|\?)/.test(url)));
  console.log('PASS: root/subpath, both pages, toggle/persistence/disable, actual chat local/remote/fallback with stubs, mobile/XSS, 404/malformed/timeout, no package/secret fetches');
  await context.close();
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
