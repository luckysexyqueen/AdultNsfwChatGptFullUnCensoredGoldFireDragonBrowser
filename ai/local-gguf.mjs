const number = (value, fallback, min, max) => Number.isFinite(Number(value)) ? Math.max(min, Math.min(Number(value), max)) : fallback;

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
      throw Error('Native bridge read failed: ' + e.message);
    }
  }

  async _loadBytesFromPath(path, signal) {
    if (!path) throw Error('No model path provided');

    if (typeof path === 'object' && (path instanceof Blob || path instanceof ArrayBuffer || ArrayBuffer.isView(path))) {
      if (path instanceof ArrayBuffer) return path;
      if (ArrayBuffer.isView(path)) return path.buffer;
      return await path.arrayBuffer();
    }

    const str = String(path);
    const lower = str.toLowerCase();

    if (lower.startsWith('http://') || lower.startsWith('https://')) return await this._fetchArrayBuffer(str, signal);
    if (lower.startsWith('content://') || lower.startsWith('file://')) {
      try { return await this._readBase64FromAndroidBridge(str); } catch (e) { throw e; }
    }

    try {
      const resolved = new URL(str, typeof location !== 'undefined' ? location.href : 'https://example.com/').href;
      return await this._fetchArrayBuffer(resolved, signal);
    } catch (e) {
      throw Error('Failed to resolve or fetch model path: ' + e.message);
    }
  }

  async load(files, options = {}) {
    if (!files) throw Error('No model files provided');

    this.status.loading = true;
    try {
      const parts = [];
      for (const f of files) {
        if (typeof f === 'string') {
          const ab = await this._loadBytesFromPath(f, options.signal);
          parts.push(new Blob([ab]));
        } else if (f instanceof Blob) {
          parts.push(f);
        } else if (ArrayBuffer.isView(f) || f instanceof ArrayBuffer) {
          parts.push(new Blob([f instanceof ArrayBuffer ? f : f.buffer]));
        } else {
          throw Error('Unsupported model file type');
        }
      }

      if (typeof window !== 'undefined' && window.LocalGGUF && typeof window.LocalGGUF.load === 'function') {
        await window.LocalGGUF.load(parts, options);
        this.status.modelFiles = parts.length;
        this.status.ready = true;
        return true;
      }

      this._loadedBlobs = parts;
      this.status.modelFiles = parts.length;
      this.status.ready = true;
      return true;
    } finally {
      this.status.loading = false;
    }
  }

  async generate(messagesOrPrompt, options = {}) {
    if (!this.status.ready && !this._loadedBlobs) throw Error('모델을 먼저 불러오세요.');

    const safeMaxTokens = number(options.maxTokens, 4096, 1, 8192);
    const safeTemperature = number(options.temperature, 0.7, 0, 2);
    const safeTopP = number(options.topP, 0.95, 0, 1);

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

    if (this._loadedBlobs && typeof window !== 'undefined' && typeof window.loadPackedModel === 'function') {
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
}

if (typeof window !== 'undefined' && !window.LocalGGUF) window.LocalGGUF = new LocalGGUFEngine();
