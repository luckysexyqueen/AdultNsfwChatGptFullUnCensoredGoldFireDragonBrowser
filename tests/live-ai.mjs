// Explicit, opt-in smoke test. Calls the deployed free endpoint and real local WASM.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.GFD_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(process.env.GFD_STATIC_ROOT || fileURLToPath(new URL('../', import.meta.url)));
const korean = process.env.GFD_TEST_KOREAN === '1';
const prefix = '/AdultNsfwChatGptFullUnCensoredGoldFireDragonBrowser/';
const types = { '.mjs': 'text/javascript', '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.wasm': 'application/wasm', '.gguf': 'application/octet-stream' };
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    const relative = decodeURIComponent(url.pathname.startsWith(prefix) ? url.pathname.slice(prefix.length) : url.pathname.slice(1));
    const file = path.resolve(root, relative || 'index.html');
    if (!file.startsWith(root + path.sep)) throw Error('outside root');
    const info = await stat(file);
    if (!info.isFile()) throw Error('missing');
    response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Content-Length': info.size });
    if (request.method === 'HEAD') response.end(); else createReadStream(file).pipe(response);
  } catch { response.writeHead(404); response.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, ...(process.env.GFD_BROWSER_CHANNEL ? { channel: process.env.GFD_BROWSER_CHANNEL } : {}) });
const report = { generatedAt: new Date().toISOString(), remote: null, local: null };
try {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const externalRequests = [];
  await context.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith(origin)) return route.continue();
    if (url.startsWith('https://goldfire-free-ai.huiwon0621-mcp.workers.dev/')) { externalRequests.push(url); return route.continue(); }
    return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', error => console.log('Page error:', error.message.slice(0, 180)));
  await page.goto(origin + prefix, { waitUntil: 'domcontentloaded' });
  console.log('Homepage document loaded');
  await page.waitForFunction(() => window.__bootReady === true && window.GFDAI && window.LocalGGUF);
  console.log('Application boot ready');
  if (await page.locator('#btn-guest').count()) await page.locator('#btn-guest').click();
  await page.locator('#msg-input').waitFor();
  await page.locator('#gfd-ai-mode summary').click();
  await page.locator('#gfd-ai-mode select').selectOption('free');
  await page.locator('#gfd-ai-mode summary').click();
  console.log('Testing real Cloudflare inference through the chat send button…');
  await page.locator('#msg-input').fill(korean ? '안녕하세요. 한국어로 짧게 인사해 주세요.' : 'What is 2 + 2? Reply with the number only.');
  await page.locator('#btn-send').click();
  await page.waitForFunction(() => !S.isStreaming && S.messages.some(m => m.role === 'assistant'), null, { timeout: 90000 });
  report.remote = await page.evaluate(() => ({ reply: S.messages.filter(m => m.role === 'assistant').at(-1).content, mode: window.GFDAI.getMode() }));
  assert.ok(report.remote.reply.trim());
  if (korean) assert.match(report.remote.reply, /[가-힣]{2}/);
  console.log('Remote reply:', report.remote.reply);
  const remoteCount = externalRequests.length;

  console.log('Loading the actual bundled GGUF through the model-management UI…');
  await page.locator('#gfd-ai-mode summary').click();
  await page.locator('#gfd-ai-mode button').click();
  await page.locator(korean ? '#local-model-korean' : '#local-model-bundled').click();
  await page.waitForFunction(() => window.LocalGGUF.getStatus().ready || !!window.LocalGGUF.getStatus().error, null, { timeout: 180000 });
  const status = await page.evaluate(() => window.LocalGGUF.getStatus());
  assert.equal(status.ready, true, JSON.stringify(status));
  console.log('Local model ready:', status.modelName);
  await page.waitForFunction(() => !document.getElementById('local-model-modal'));
  await page.evaluate(isKorean => {
    localStorage.setItem('gfd-gguf-max-tokens', isKorean ? '96' : '24');
    localStorage.setItem('gfd-gguf-temperature', '0');
    S.currentConvId = null; S.messages = []; S.currentGPT = null; S.currentGPTFiles = [];
    setState({ messages: [], currentConvId: null });
  }, korean);
  console.log('Testing actual local CPU/WASM inference through the chat send button…');
  await page.locator('#msg-input').fill(korean ? '안녕하세요. 한국어로 한 문장만 인사해 주세요.' : 'Once upon a time, there was a little');
  await page.locator('#btn-send').click();
  await page.waitForFunction(() => !S.isStreaming && S.messages.some(m => m.role === 'assistant'), null, { timeout: 180000 });
  report.local = await page.evaluate(() => ({ reply: S.messages.filter(m => m.role === 'assistant').at(-1).content, mode: window.GFDAI.getMode(), status: window.LocalGGUF.getStatus(), crossOriginIsolated }));
  assert.ok(report.local.reply.trim());
  if (korean) assert.match(report.local.reply, /[가-힣]{2}/);
  assert.equal(report.local.mode, 'local');
  assert.equal(report.local.crossOriginIsolated, false);
  assert.equal(externalRequests.length, remoteCount, 'Local chat must not call a remote inference API');
  console.log('Local reply:', report.local.reply);
  if (process.env.GFD_REPORT_PATH) {
    await mkdir(path.dirname(process.env.GFD_REPORT_PATH), { recursive: true });
    await writeFile(process.env.GFD_REPORT_PATH, JSON.stringify(report, null, 2));
  }
  await context.close();
  console.log('PASS: real free API and real local GGUF inference through existing UI');
} catch (error) { console.log('Live verification failed:', error.message); throw error; }
finally { await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
