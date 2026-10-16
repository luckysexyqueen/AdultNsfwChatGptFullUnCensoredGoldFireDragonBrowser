import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { prepareMessages, freeChat } from '../ai/providers.mjs';
import { validateFiles, LocalGGUFEngine } from '../ai/local-gguf.mjs';

// Exercise Worker logic in Node; deployed Durable Objects/AI are additionally covered
// by the opt-in live smoke test. This shim supplies only the platform base class.
const workerSource = (await readFile(new URL('../cloudflare-ai/worker.mjs', import.meta.url), 'utf8'))
  .replace("import { DurableObject } from 'cloudflare:workers';", 'class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }');
const { default: worker, FreeBudget } = await import('data:text/javascript;base64,' + Buffer.from(workerSource).toString('base64'));
const endpoint = 'https://example.workers.dev/v1/chat/completions';
const origin = 'https://luckysexyqueen.github.io';
const request = (body, options = {}) => new Request(endpoint, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...options.headers }, body: JSON.stringify(body) });
const message = { role: 'user', content: 'What is 2+2?' };

test('free API includes instructions, preserves callers, rejects excess and invalid data', () => {
  const messages = [message];
  const result = prepareMessages(messages, 'Original system', 'Plugin instructions');
  assert.equal(result[0].content, 'Original system\n\nPlugin instructions');
  assert.equal(messages.length, 1);
  assert.throws(() => prepareMessages([{ role: 'tool', content: 'execute' }]));
  assert.throws(() => prepareMessages([{ role: 'user', content: 'x'.repeat(4001) }]));
  assert.throws(() => prepareMessages(Array.from({ length: 17 }, () => message)));
});
test('free API makes a credential-free bounded request and rejects empty, failed and oversized responses', async () => {
  let config;
  const fetcher = async (url, options) => { config = options; return Response.json({ choices: [{ message: { content: '4' } }] }); };
  assert.equal(await freeChat(endpoint, [message], { fetcher }), '4');
  assert.equal(config.credentials, 'omit'); assert.equal(config.redirect, 'error');
  assert.equal('Authorization' in config.headers, false);
  assert.equal(JSON.parse(config.body).max_tokens, 128);
  await assert.rejects(freeChat('http://example.test/api', [message]));
  await assert.rejects(freeChat('https://user:pass@example.test/api', [message]));
  await assert.rejects(freeChat(endpoint, [message], { fetcher: async () => new Response('', { status: 429 }) }), /한도/);
  await assert.rejects(freeChat(endpoint, [message], { fetcher: async () => Response.json({ choices: [] }) }), /빈 응답/);
  await assert.rejects(freeChat(endpoint, [message], { fetcher: async () => new Response(' '.repeat(65537), { headers: { 'Content-Type': 'application/json' } }) }), /너무 큽니다/);
});
test('local models require real GGUF files and cannot generate without loading', async () => {
  assert.throws(() => validateFiles([]));
  assert.throws(() => validateFiles([new File(['fake'], 'model.js')]));
  await assert.rejects(new LocalGGUFEngine().load([new File(['fake'], 'model.gguf')]), /헤더/);
  await assert.rejects(new LocalGGUFEngine().generate([message]), /먼저/);
  await assert.rejects(new LocalGGUFEngine().loadFromUrl('https://name:secret@example.test/model.gguf'));
});
test('worker validates origins, method, JSON, body size, input shape before consuming quota', async () => {
  const env = { BUDGET: { getByName() { throw Error('should not consume quota'); } } };
  assert.equal((await worker.fetch(new Request(endpoint), env)).status, 403);
  assert.equal((await worker.fetch(new Request(endpoint, { method: 'OPTIONS', headers: { Origin: origin } }), env)).status, 204);
  assert.equal((await worker.fetch(request({ messages: [] }), env)).status, 400);
  assert.equal((await worker.fetch(request({ messages: [{ role: 'tool', content: 'execute' }] }), env)).status, 400);
  assert.equal((await worker.fetch(request({ messages: [{ role: 'user', content: 'a'.repeat(4001) }] }), env)).status, 413);
  assert.equal((await worker.fetch(request({ messages: [{ role: 'user', content: 'a'.repeat(21000) }] }), env)).status, 413);
});
test('worker has no model override, paid fallback or quota bypass', async () => {
  let argumentsUsed;
  const env = { BUDGET: { getByName: () => ({ reserve: async () => true }) }, AI: { run: async (...args) => { argumentsUsed = args; return { response: '4' }; } } };
  const response = await worker.fetch(request({ messages: [message], model: 'expensive', max_tokens: 50000 }), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
  assert.equal(argumentsUsed[0], '@cf/meta/llama-3.2-1b-instruct');
  assert.equal(argumentsUsed[1].max_tokens, 128);
  env.BUDGET.getByName = () => ({ reserve: async () => false });
  env.AI.run = () => { throw Error('must not call AI after quota'); };
  assert.equal((await worker.fetch(request({ messages: [message] }), env)).status, 429);
});
test('daily budget persists count, applies cooldown and resets at UTC midnight', async () => {
  const values = new Map();
  const tx = { get: async key => values.get(key), put: async (key, value) => values.set(key, value) };
  const ctx = { storage: { transaction: async callback => callback(tx) } };
  const budget = new FreeBudget(ctx, {});
  assert.equal(await budget.reserve(), true);
  assert.equal(await budget.reserve(), false);
  values.get('budget').last = 0;
  assert.equal(await new FreeBudget(ctx, {}).reserve(), true);
  values.get('budget').last = 0; values.get('budget').count = 100;
  assert.equal(await budget.reserve(), false);
  values.get('budget').day = '2000-01-01';
  assert.equal(await budget.reserve(), true);
  assert.equal(values.get('budget').count, 1);
});
