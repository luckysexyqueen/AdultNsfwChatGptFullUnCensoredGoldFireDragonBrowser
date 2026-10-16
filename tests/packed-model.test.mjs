import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { loadPackedModel } from '../ai/packed-model.mjs';
const digest = value => createHash('sha256').update(value).digest('hex');
test('packed model verifies each data part and reassembles an actual file', async () => {
  const bytes = Buffer.from('GGUF-example');
  const hash = digest(bytes);
  const manifest = { schemaVersion: 1, filename: 'example.gguf', size: bytes.length, sha256: hash, parts: [{ name: 'example.gguf.part01', size: bytes.length, sha256: hash }] };
  const file = await loadPackedModel('https://example.test/models/manifest.json', hash, {
    cacheStorage: null,
    fetcher: async url => url.endsWith('manifest.json') ? Response.json(manifest) : new Response(bytes),
  });
  assert.equal(file.name, 'example.gguf');
  assert.equal(await file.text(), 'GGUF-example');
  await assert.rejects(loadPackedModel('https://example.test/models/manifest.json', hash, {
    cacheStorage: null,
    fetcher: async url => url.endsWith('manifest.json') ? Response.json(manifest) : new Response('tampered'),
  }), /무결성/);
  manifest.parts[0].name = '../secret.env';
  await assert.rejects(loadPackedModel('https://example.test/models/manifest.json', hash, { fetcher: async () => Response.json(manifest) }), /조각/);
});
test('vendored lightweight uncensored model matches pinned source SHA-256 and static file limits', async () => {
  const config = JSON.parse(await readFile(new URL('../ai/config.json', import.meta.url)));
  const manifestUrl = new URL('../models/korean-uncensored/manifest.json', import.meta.url);
  const manifest = JSON.parse(await readFile(manifestUrl));
  assert.match(config.koreanModel.name, /abliterated/);
  assert.equal(manifest.sha256, config.koreanModel.sha256);
  const full = createHash('sha256'); let total = 0;
  for (const part of manifest.parts) {
    const url = new URL(part.name, manifestUrl);
    assert.equal((await stat(url)).size, part.size);
    assert.ok(part.size <= 20 * 1024 ** 2);
    const hash = createHash('sha256');
    for await (const bytes of createReadStream(url)) { hash.update(bytes); full.update(bytes); total += bytes.length; }
    assert.equal(hash.digest('hex'), part.sha256);
  }
  assert.equal(total, config.koreanModel.size);
  assert.equal(full.digest('hex'), config.koreanModel.sha256);
});
