// Self-hosted Wllama 3.8.1. No CDN, account, GPU or cross-origin isolation required.
import { koreanMessages } from './language.mjs';
const MAX_FILE = 2 * 1024 ** 3;
const number = (value, fallback, min, max) => Number.isFinite(Number(value)) ? Math.max(min, Math.min(Number(value), max)) : fallback;
export function validateFiles(files) {
  const sorted = Array.from(files || []).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  if (!sorted.length || sorted.some(f => !/\.gguf(?:\.part\d+)?$/i.test(f.name) || !f.size || f.size > MAX_FILE)) throw Error('유효한 GGUF 파일을 선택하세요. 개별 파일은 2GB 이하이어야 합니다.');
  return sorted;
}
const initial = () => ({ ready: false, loading: false, generating: false, webGpuAvailable: false, modelFiles: 0 });
export class LocalGGUFEngine {
  constructor() { this.runtime = null; this.status = initial(); }
  getStatus() { return { ...this.status }; }
  update(values) {
    Object.assign(this.status, values);
    globalThis.dispatchEvent?.(new CustomEvent('gfd:local-model-status', { detail: this.getStatus() }));
  }
  async load(files, options = {}) {
    const sorted = validateFiles(files);
    if (new TextDecoder().decode(await sorted[0].slice(0, 4).arrayBuffer()) !== 'GGUF') throw Error('GGUF 헤더가 올바르지 않습니다.');
    return this.loadInternal(sorted, options, sorted[0].name, sorted.reduce((total, f) => total + f.size, 0));
  }
  async loadFromUrl(value, options = {}) {
    const url = new URL(value, globalThis.location?.href);
    if (url.username || url.password || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.origin === globalThis.location?.origin))) throw Error('HTTPS 또는 같은 출처의 http URL만 허용됩니다.');
    return this.loadInternal(url.href, options, decodeURIComponent(url.pathname.split('/').pop()), 0);
  }
  async loadInternal(source, options, name, size) {
    if (this.status.loading || this.status.generating) throw Error('현재 로컬 모델 작업이 진행 중입니다.');
    this.update({ ready: false, loading: true, error: '' });
    let runtime;
    try {
      if (this.runtime) { await this.runtime.exit(); this.runtime = null; }
      options.onProgress?.('기기 내 GGUF 추론 엔진을 준비하는 중…');
      const { Wllama } = await import('../vendor/wllama/index.mjs');
      runtime = new Wllama({ default: new URL('../vendor/wllama/wllama.wasm', import.meta.url).href }, {
        suppressNativeLog: true, allowOffline: true,
        logger: { debug() {}, log() {}, warn() {}, error() {} },
      });
      const contextLength = number(options.contextLength, 2048, 512, 32768);
      const params = { n_ctx: contextLength, n_threads: globalThis.crossOriginIsolated ? Math.min(navigator.hardwareConcurrency || 2, 4) : 1,
        n_gpu_layers: options.useGpu === true ? 99999 : 0, jinja: true,
        progressCallback: ({ loaded, total }) => options.onProgress?.(total ? `모델 다운로드 ${Math.floor(100 * loaded / total)}%` : `모델 다운로드 ${Math.floor(loaded / 1048576)}MB`),
      };
      if (typeof source === 'string') await runtime.loadModelFromUrl(source, params);
      else await runtime.loadModel(source, params);
      this.runtime = runtime;
      this.update({ ready: true, loading: false, generating: false, modelName: name, modelSize: size, modelFiles: typeof source === 'string' ? 1 : source.length,
        contextLength, webGpuAvailable: typeof runtime.isSupportWebGPU === 'function' ? runtime.isSupportWebGPU() : false });
      options.onProgress?.('로컬 모델 준비 완료. 대화가 서버로 전송되지 않습니다.');
      return this.getStatus();
    } catch (error) {
      try { await runtime?.exit(); } catch { /* release best effort */ }
      this.runtime = null;
      this.status = initial();
      this.update({ error: error.message });
      throw Error(`로컬 모델 준비 실패: ${error.message}`);
    }
  }
  async generate(messages, options = {}) {
    if (!this.status.ready || !this.runtime) throw Error('먼저 로컬 GGUF 모델을 불러오세요.');
    if (this.status.generating || this.status.loading) throw Error('현재 로컬 모델 작업이 진행 중입니다.');
    if (!Array.isArray(messages) || !messages.length || messages.some(m => !['system', 'user', 'assistant'].includes(m.role) || typeof m.content !== 'string')) throw Error('올바른 대화 메시지 배열이 필요합니다.');
    messages = koreanMessages(messages);
    this.update({ generating: true });
    let full = '';
    try {
      const meta = this.runtime.getModelMetadata()?.meta || {};
      const common = { stream: true, max_tokens: number(options.maxTokens, 512, 1, Math.max(1, Math.min(2048, (this.status.contextLength || 4096) - 512))), temperature: number(options.temperature, 0.7, 0, 2),
        seed: options.seed, abortSignal: options.signal };
      const stream = meta['general.architecture'] === 'gpt2'
        ? await this.runtime.createCompletion({ ...common, prompt: messages.map(m => `${m.role === 'user' ? 'User' : m.role === 'assistant' ? 'Assistant' : 'System'}: ${m.content}`).join('\n') + '\nAssistant:' })
        : await this.runtime.createChatCompletion({ ...common, messages, chat_template_kwargs: { enable_thinking: false } });
      // Some Wllama builds return a complete response instead of an async stream.
      if (typeof stream?.[Symbol.asyncIterator] !== 'function') {
        const text = stream?.choices?.[0]?.message?.content ?? stream?.choices?.[0]?.text ?? '';
        if (typeof text !== 'string' || !text.trim()) throw Error('모델이 빈 응답을 반환했습니다.');
        options.onToken?.(text);
        return text;
      }
      for await (const chunk of stream) {
        const token = chunk.choices?.[0]?.delta?.content ?? chunk.choices?.[0]?.text ?? '';
        if (token) { full += token; options.onToken?.(token); }
      }
      if (!full.trim()) throw Error('모델이 빈 응답을 반환했습니다.');
      return full;
    } finally { this.update({ generating: false }); }
  }
  async unload() {
    if (this.status.loading || this.status.generating) throw Error('진행 중인 로컬 작업이 끝난 후 해제하세요.');
    await this.runtime?.exit();
    this.runtime = null;
    this.status = initial();
    this.update({});
  }
}

if (typeof window !== 'undefined' && !window.LocalGGUF) window.LocalGGUF = new LocalGGUFEngine();
