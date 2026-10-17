// Self-hosted GGUF helper: tolerate app/Android content URIs, URL strings, Blob/ArrayBuffer inputs and large model parts.
const MAX_FILE = 2 * 1024 ** 3; // 2 GiB per part (safety)
const number = (value, fallback, min, max) => Number.isFinite(Number(value)) ? Math.max(min, Math.min(Number(value), max)) : fallback;

export function validateFiles(files) {
  const arr = Array.from(files || []);
  if (!arr.length) throw Error('유효한 GGUF 파일을 선택하세요.');
  const sorted = arr.sort((a, b) => (a.name || String(a)).localeCompare(b.name || String(b), undefined, { numeric: true }));
  if (sorted.some(f => typeof f === 'string')) return sorted; // URLs are allowed here
  if (sorted.some(f => !(f instanceof Blob) || !f.size || f.size > MAX_FILE || !/\.gguf(?:\.part\d+)?$/i.test(f.name))) {
    throw Error('유효한 GGUF 파일을 선택하세요. 개별 파일은 2GB 이하이고 `.gguf` 또는 `.gguf.partN` 이어야 합니다.');
  }
  return sorted;
}

const initial = () => ({ ready: false, loading: false, generating: false, webGpuAvailable: false, modelFiles: 0 });

export class LocalGGUFEngine {
  constructor() {
    this.runtime = null;
    this.status = initial();
    this._loadedBlobs = null;
  }

  getStatus() { return { ...this.status }; }

  update(values) {
    Object.assign(this.status, values);
    globalThis.dispatchEvent?.(new CustomEvent('gfd:local-model-status', { detail: this.getStatus() }));
  }

  async _fetchArrayBuffer(url, signal) {
    const res = await fetch(url, { signal, cache: 'no-store' });
    if (!res.ok) throw Error(`Network error ${res.status}`);
    return await res.arrayBuffer();
  }

  async _fetchBlob(url, signal) {
    const res = await fetch(url, { signal, cache: 'no-store' });
    if (!res.ok) throw Error(`Network error ${res.status}`);
    return await res.blob();
  }

  async _readBase64FromAndroidBridge(uri) {
    try {
      if (typeof window !== 'undefined' && window.AndroidBridge) {
        const fn = window.AndroidBridge.readContentUriBase64 || window.AndroidBridge.readFilePathBase64;
        if (typeof fn === 'function') {
          const encoded = fn(uri);
          if (!encoded) throw Error('Android bridge returned empty');
          const bin = atob(encoded);
          const len = bin.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
          return bytes.buffer;
        }
      }
      throw Error('Android bridge not available');
    } catch (e) {
      throw Error('Native bridge read failed: ' + (e && e.message ? e.message : String(e)));
    }
  }

  async _loadBytesFromPath(path, signal) {
    if (!path) throw Error('No model path provided');

    // Accept Blob / File / ArrayBuffer / TypedArray directly
    if (typeof path === 'object' && (path instanceof Blob || path instanceof ArrayBuffer || ArrayBuffer.isView(path))) {
      if (path instanceof ArrayBuffer) return path;
      if (ArrayBuffer.isView(path)) return path.buffer;
      return await path.arrayBuffer();
    }

    const str = String(path);
    const lower = str.toLowerCase();

    // Remote HTTP(S)
    if (lower.startsWith('http://') || lower.startsWith('https://')) {
      // Try to fetch as blob to avoid holding whole array buffer when possible
      try {
        const blob = await this._fetchBlob(str, signal);
        return await blob.arrayBuffer();
      } catch (e) {
        // fallback to arrayBuffer fetch if blob fails
        return await this._fetchArrayBuffer(str, signal);
      }
    }

    // Android content URI or file path the app provided
    if (lower.startsWith('content://') || lower.startsWith('file://')) {
      try { return await this._readBase64FromAndroidBridge(str); } catch (e) { throw e; }
    }

    // Try to resolve as relative/absolute URL
    try {
      const resolved = new URL(str, typeof location !== 'undefined' ? location.href : 'https://example.com/').href;
      const blob = await this._fetchBlob(resolved, signal);
      return await blob.arrayBuffer();
    } catch (e) {
      throw Error('Failed to resolve or fetch model path: ' + (e && e.message ? e.message : String(e)));
    }
  }

  // Convenience: accept a single URL string
  async loadFromUrl(value, options = {}) {
    return this.load([value], options);
  }

  async load(files, options = {}) {
    if (!files) throw Error('No model files provided');

    this.update({ ready: false, loading: true, error: '' });
    try {
      // Validate files where possible (skip URL strings)
      const validated = validateFiles(files);

      const parts = [];
      for (const f of validated) {
        if (typeof f === 'string') {
          // For remote URLs, prefer to hand a URL string to the runtime if supported; otherwise fetch blob
          // If the runtime supports loadModelFromUrl, the global loader will use the string directly.
          parts.push(f);
        } else if (f instanceof Blob) {
          parts.push(f);
        } else if (ArrayBuffer.isView(f) || f instanceof ArrayBuffer) {
          parts.push(new Blob([f instanceof ArrayBuffer ? f : f.buffer]));
        } else {
          // As a last resort, try to interpret as path/URL and fetch
          try {
            const ab = await this._loadBytesFromPath(f, options.signal);
            parts.push(new Blob([ab]));
          } catch (err) {
            throw Error('Unsupported model file type or could not fetch: ' + (err && err.message ? err.message : String(err)));
          }
        }
      }

      // If available, perform a lightweight header check on the first blob to detect obvious non-GGUF files.
      try {
        const first = parts.find(p => p && typeof p !== 'string');
        if (first instanceof Blob) {
          const head = new TextDecoder().decode(await first.slice(0, 4).arrayBuffer());
          if (head !== 'GGUF') {
            // Not fatal: warn via status but allow runtime to attempt loading (some split parts may not start with GGUF header)
            this.update({ error: '첫 번째 파일 헤더가 GGUF가 아닙니다. 계속 시도합니다.' });
          }
        }
      } catch (e) {
        // ignore header probe failures
      }

      // If a global LocalGGUF runtime exists and accepts URL strings/blobs, use it directly.
      if (typeof window !== 'undefined' && window.LocalGGUF && typeof window.LocalGGUF.load === 'function') {
        // Prefer passing URLs directly when we have them; many runtimes can fetch them themselves.
        const runtimeArg = parts.length === 1 ? parts[0] : parts;
        await window.LocalGGUF.load(runtimeArg, options);
        this.status.modelFiles = parts.length;
        this.update({ ready: true, loading: false, generating: false });
        return this.getStatus();
      }

      // Otherwise keep blobs for a later runtime loader
      this._loadedBlobs = parts.map(p => (typeof p === 'string' ? p : p));
      this.status.modelFiles = parts.length;
      this.update({ ready: true, loading: false, generating: false });
      return this.getStatus();
    } catch (error) {
      this.update({ error: error.message });
      throw Error('로컬 모델 준비 실패: ' + (error && error.message ? error.message : String(error)));
    } finally {
      // ensure loading flag cleared (update above already clears on success)
      if (this.status.loading) this.update({ loading: false });
    }
  }

  async generate(messagesOrPrompt, options = {}) {
    if (!this.status.ready && !this._loadedBlobs) throw Error('모델을 먼저 불러오세요.');

    const safeMaxTokens = number(options.maxTokens, 4096, 1, 8192);
    const safeTemperature = number(options.temperature, 0.7, 0, 2);
    const safeTopP = number(options.topP, 0.95, 0, 1);

    // Prefer existing runtime API if present
    if (typeof window !== 'undefined' && window.LocalGGUF && typeof window.LocalGGUF.generate === 'function') {
      const text = await window.LocalGGUF.generate({
        messages: Array.isArray(messagesOrPrompt)
          ? messagesOrPrompt
          : [{ role: 'user', content: String(messagesOrPrompt) }],
        maxTokens: safeMaxTokens,
        temperature: safeTemperature,
        topP: safeTopP,
        signal: options.signal,
        onToken: options.onToken
      });
      return text;
    }

    // Fallback: if we have blobs/URLs stored and a helper loader exists, try to use it
    if (this._loadedBlobs && typeof window !== 'undefined' && typeof window.loadPackedModel === 'function') {
      // use first model file/URL
      const modelFile = this._loadedBlobs[0];
      const runtime = await window.loadPackedModel(modelFile, { onProgress: options.onProgress });
      if (runtime && typeof runtime.generate === 'function') {
        const text = await runtime.generate(
          Array.isArray(messagesOrPrompt) ? messagesOrPrompt : [{ role: 'user', content: String(messagesOrPrompt) }],
          { maxTokens: safeMaxTokens, temperature: safeTemperature, topP: safeTopP, signal: options.signal, onToken: options.onToken }
        );
        return text;
      }
    }

    throw Error('로컬 GGUF 실행 엔진이 사용할 수 없습니다.');
  }

  async unload() {
    try {
      if (typeof this.runtime?.exit === 'function') await this.runtime.exit();
    } catch (e) {
      // ignore
    }
    this.runtime = null;
    this._loadedBlobs = null;
    this.status = initial();
    this.update({});
  }
}

if (typeof window !== 'undefined' && !window.LocalGGUF) window.LocalGGUF = new LocalGGUFEngine();
