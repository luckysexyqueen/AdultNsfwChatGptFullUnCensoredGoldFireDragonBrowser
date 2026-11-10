import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const file = await readFile(new URL('../offline/gguf-runtime.js', import.meta.url), 'utf8');
const changes = [];
let loaded = false;
let exited = false;
let lastInput;
class MockWllama {
  constructor(paths) { assert.match(paths.default, /wllama\.wasm$/); }
  async loadModel(files) { loaded = true; assert.equal(files.length, 1); }
  async exit() { exited = true; }
  isSupportWebGPU() { return false; }
  getModelMetadata() { return { meta: { 'general.architecture': 'llama' } }; }
  async createChatCompletion(input) {
    lastInput = input;
    return (async function* () { yield { choices: [{ delta: { content: '안녕' } }] }; })();
  }
}
const context = {
  window: { Wllama: MockWllama, crossOriginIsolated: false, dispatchEvent: e => changes.push(e.type) },
  document: { baseURI: 'https://example.test/' },
  navigator: { hardwareConcurrency: 2 },
  URL, TextDecoder, CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
};
context.window.window = context.window;
vm.runInNewContext(file, context);
test('offline bridge loads valid GGUF and streams through createChatCompletion', async () => {
  const file = { name: 'model.gguf', size: 4, slice: () => ({ arrayBuffer: async () => Uint8Array.from([71,71,85,70]).buffer }) };
  const engine = context.window.LocalGGUF;
  await engine.load([file]);
  assert.equal(loaded, true);
  assert.equal(engine.getStatus().ready, true);
  const tokens = [];
  assert.equal(await engine.generate([{ role: 'user', content: '안녕' }], { onToken: t => tokens.push(t) }), '안녕');
  assert.equal(lastInput.messages[0].content, '안녕');
  assert.deepEqual(tokens, ['안녕']);
  await engine.unload();
  assert.equal(exited, true);
  assert.equal(engine.getStatus().ready, false);
  assert.ok(changes.includes('goldfire-local-ready'));
});
test('offline bridge rejects invalid header and missing loaded engine', async () => {
  const engine = context.window.LocalGGUF;
  await assert.rejects(engine.generate('안녕'), /먼저/);
  await assert.rejects(engine.load([{ name: 'bad.gguf', size: 4, slice: () => ({ arrayBuffer: async () => Uint8Array.from([1,2,3,4]).buffer }) }]), /헤더/);
});
