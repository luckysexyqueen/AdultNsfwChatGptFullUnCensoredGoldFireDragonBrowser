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
 const page = await browser.newPage();
 const external = [];
 await page.route('**/*', route => { if (route.request().url().startsWith(origin)) return route.continue(); external.push(route.request().url()); return route.abort(); });
 await page.goto(origin + prefix + 'LoveBound-AI-Model-Studio-v1.35.9-FULL-VERSION-LOCKED/index.html');
 await page.locator('#load').click();
 await page.waitForFunction(() => !document.getElementById('send').disabled, null, {timeout:240000});
 await page.locator('#prompt').fill('안녕하세요. 한국어로 짧게 인사해 주세요.');
 await page.locator('#send').click();
 await page.waitForFunction(() => document.getElementById('status').textContent.includes('응답 완료'), null, {timeout:180000});
 const reply = await page.locator('#reply').innerText();
 assert.match(reply, /[가-힣]{2}/); assert.equal(external.length,0);
 const result = {reply, externalRequests:external, status:await page.evaluate(()=>window.LocalGGUF.getStatus()), testedAt:new Date().toISOString()};
 await writeFile(process.env.GFD_REPORT_PATH, JSON.stringify(result,null,2)); console.log(JSON.stringify(result));
} finally {await browser.close(); await new Promise(resolve=>server.close(resolve));}
