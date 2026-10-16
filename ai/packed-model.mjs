// Reassemble verified static data parts; never import model-provided code.
export async function loadPackedModel(url, expectedHash, { fetcher = fetch, cacheStorage = globalThis.caches, onProgress } = {}) {
  const manifestUrl = new URL(url);
  const response = await fetcher(manifestUrl.href, { credentials: 'omit', redirect: 'error', cache: 'no-store' });
  if (!response.ok) throw Error('내장 한국어 모델 목록을 불러오지 못했습니다.');
  const manifest = await response.json();
  if (manifest.schemaVersion !== 1 || manifest.sha256 !== expectedHash || !Array.isArray(manifest.parts) || !manifest.parts.length || manifest.parts.length > 100 || manifest.size > 2 * 1024 ** 3) throw Error('모델 목록 검증에 실패했습니다.');
  let cache; try { cache = await cacheStorage?.open('gfd-korean-model-v1'); } catch { /* storage may be unavailable */ }
  const chunks = []; let total = 0;
  for (const part of manifest.parts) {
    if (!/^[a-zA-Z0-9_.-]+\.gguf\.part\d+$/.test(part.name) || !Number.isSafeInteger(part.size) || part.size <= 0 || part.size > 25 * 1024 ** 2 || !/^[a-f0-9]{64}$/.test(part.sha256)) throw Error('올바르지 않은 모델 조각입니다.');
    const partUrl = new URL(part.name, manifestUrl);
    partUrl.searchParams.set('sha256', part.sha256);
    let stored; try { stored = await cache?.match(partUrl.href); } catch { /* network fallback */ }
    const data = stored || await fetcher(partUrl.href, { credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(120000) });
    if (!data.ok) throw Error(`모델 파일을 불러오지 못했습니다: ${part.name}`);
    const reader = data.body.getReader(); const blocks = []; let size = 0;
    for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length;
      if (size > part.size) { await reader.cancel(); throw Error('모델 조각 크기가 올바르지 않습니다.'); } blocks.push(value); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const block of blocks) { bytes.set(block, offset); offset += block.length; }
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(b => b.toString(16).padStart(2, '0')).join('');
    if (size !== part.size || digest !== part.sha256) { try { await cache?.delete(partUrl.href); } catch {} throw Error('모델 파일 무결성 검사에 실패했습니다.'); }
    if (!stored) { try { await cache?.put(partUrl.href, new Response(bytes)); } catch { /* inference still works without caching */ } }
    chunks.push(new Blob([bytes])); total += size;
    onProgress?.(`무검열 계열·한국어 모델 준비 ${Math.floor(total * 100 / manifest.size)}%`);
  }
  if (total !== manifest.size || !/^[a-zA-Z0-9_.-]+\.gguf$/.test(manifest.filename)) throw Error('전체 모델 크기가 올바르지 않습니다.');
  return new File(chunks, manifest.filename, { type: 'application/octet-stream' });
}
