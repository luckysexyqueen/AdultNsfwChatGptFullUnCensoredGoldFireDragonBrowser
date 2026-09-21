// WebLLM is loaded on demand so the browser build remains valid even when the
// optional package is not bundled locally. The worker module uses the same CDN.
const WEB_LLM_CDN = 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.46/dist/index.js';
let modulePromise;

function loadWebLLM() {
  modulePromise ??= import(WEB_LLM_CDN);
  return modulePromise;
}

export async function CreateWebWorkerMLCEngine(...args) {
  const module = await loadWebLLM();
  if (typeof module.CreateWebWorkerMLCEngine !== 'function') {
    throw new Error('WebLLM CDN 모듈에서 CreateWebWorkerMLCEngine을 찾지 못했습니다.');
  }
  return module.CreateWebWorkerMLCEngine(...args);
}

export async function CreateMLCEngine(...args) {
  const module = await loadWebLLM();
  if (typeof module.CreateMLCEngine !== 'function') {
    throw new Error('WebLLM CDN 모듈에서 CreateMLCEngine을 찾지 못했습니다.');
  }
  return module.CreateMLCEngine(...args);
}

export { loadWebLLM };
