// Explicitly download and vendor the pinned public model as ordinary static assets.
import { mkdir, open, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const config = JSON.parse(await readFile(path.join(root, 'ai/config.json'), 'utf8'));
const model = config.koreanModel;
const destination = path.join(root, 'models/korean-uncensored');
await mkdir(destination, { recursive: true });
const response = await fetch(model.sourceUrl || model.url, { signal: AbortSignal.timeout(600000) });
if (!response.ok || !response.body) throw Error(`Model download failed: ${response.status}`);
const hash = createHash('sha256');
const partLimit = 20 * 1024 * 1024;
const parts = []; let handle; let partHash; let partBytes = 0; let total = 0; let progress = 0;
async function startPart() {
  const name = `qwen3-0.6b-abliterated-q4_k_m.gguf.part${String(parts.length + 1).padStart(2, '0')}`;
  handle = await open(path.join(destination, name), 'wx');
  partHash = createHash('sha256'); partBytes = 0; parts.push({ name });
}
async function finishPart() {
  await handle.close(); handle = null;
  Object.assign(parts.at(-1), { size: partBytes, sha256: partHash.digest('hex') });
}
try {
  for await (const bytes of response.body) {
    hash.update(bytes); total += bytes.length;
    if (total > model.size) throw Error('Model exceeds pinned size');
    for (let offset = 0; offset < bytes.length;) {
      if (!handle) await startPart();
      const slice = bytes.subarray(offset, offset + Math.min(bytes.length - offset, partLimit - partBytes));
      for (let written = 0; written < slice.length;) {
        const result = await handle.write(slice.subarray(written));
        if (!result.bytesWritten) throw Error('Unable to write model data');
        written += result.bytesWritten;
      }
      partHash.update(slice); partBytes += slice.length; offset += slice.length;
      if (partBytes === partLimit) await finishPart();
    }
    const percent = Math.floor(total * 100 / model.size / 10) * 10;
    if (percent > progress) { progress = percent; console.log(`Download ${percent}%`); }
  }
  if (handle) await finishPart();
} finally { if (handle) await handle.close(); }
if (total !== model.size || hash.digest('hex') !== model.sha256) throw Error('Pinned model hash/size mismatch; do not commit downloaded files');
await writeFile(path.join(destination, 'manifest.json'), JSON.stringify({ schemaVersion: 1, name: model.name, filename: 'qwen3-0.6b-abliterated-q4_k_m.gguf', size: total, sha256: model.sha256, source: model.sourceUrl || model.url, parts }, null, 2) + '\n');
const license = await fetch('https://huggingface.co/Qwen/Qwen3-0.6B/raw/main/LICENSE');
if (!license.ok) throw Error('Model license download failed');
await writeFile(path.join(destination, 'LICENCE'), await license.text());
console.log(`Verified SHA-256; prepared ${parts.length} static parts (${total} bytes)`);
