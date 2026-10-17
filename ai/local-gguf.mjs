// Local GGUF loader with network/connectivity checks and AndroidBridge network fallback
const MAX_FILE = 2 * 1024 ** 3; // 2 GiB per part (safety)
const number = (value, fallback, min, max) => Number.isFinite(Number(value)) ? Math.max(min, Math.min(Number(value), max)) : fallback;

export function validateFiles(files) {
  // Accept FileList, array of Blobs, single Blob, string URLs
  if (!files) throw Error('No files provided');
  const arr = Array.isArray(files) ? Array.from(files) : (files instanceof FileList ? Array.from(files) : [files]);
  if (!arr.length) throw Error('유효한 GGUF 파일을 선택하세요.');

  // If any are strings (URLs), allow them immediately
  if (arr.some(f => typeof f === 'string')) return arr;

  // Accept blobs even without .gguf extension; prefer .gguf but be permissive
  const invalid = arr.filter(f => !(f instanceof Blob) || !f.size || f.size > MAX_FILE);
  if (invalid.length) throw Error('유효한 GGUF 파일을 선택하세요. 파일이 Blob/File인지, 2GB 이하인지 확인하세요.');

  return arr;
}

const initial = () => ({ ready: false, loading: false, generating: false, webGpuAvailable: false, modelFiles: 0, error: '' });

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

  async _fetchUrlViaAndroidBridge(url) {
    try {
      if (typeof window !== 'undefined' && window.AndroidBridge) {
        // Prefer fetchUrlToFile if available (prevents huge base64 in memory)
        if (typeof window.AndroidBridge.fetchUrlToFile === 'function') {
          const path = window.AndroidBridge.fetchUrlToFile(url);
          if (path) {
            const b64 = typeof window.AndroidBridge.readFilePathBase64 === 'function'
              ? window.AndroidBridge.readFilePathBase64(path)
              : (typeof window.AndroidBridge.readContentUriBase64 === 'function' ? window.AndroidBridge.readContentUriBase64(path) : null);
            if (!b64) throw Error('Android bridge returned empty file content');
            const bin = atob(b64);
            const arr = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
            return arr.buffer;
          }
        }
        if (typeof window.AndroidBridge.fetchUrlBase64 === 'function') {
          const b64 = window.AndroidBridge.fetchUrlBase64(url);
          if (!b64) throw Error('Android bridge fetch returned empty');
          const bin = atob(b64);
          const arr = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          return arr.buffer;
        }
      }
    } catch (e) {
      console.warn('Android bridge fetch failed', e);
    }
    throw Error('Android bridge does not support fetchUrlToFile/fetchUrlBase64 or it failed');
  }

  async _isNetworkAvailable({ url = 'https://www.gstatic.com/generate_204', timeout = 3000 } = {}) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
    try {
      const ac = new AbortController();
      const id = setTimeout(() => ac.abort(), timeout);
      try {
        await fetch(url, { method: 'GET', mode: 'no-cors', cache: 'no-store', signal: ac.signal });
        return true;
      } finally { clearTimeout(id); }
    } catch (e) { return false; }
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

    if (lower.startsWith('http://') || lower.startsWith('https://')) {
      const netOk = await this._isNetworkAvailable();
      if (!netOk) {
        try { return await this._fetchUrlViaAndroidBridge(str); } catch (e) { throw Error('네트워크에 연결되어 있지 않거나 Android 브릿지로도 가져올 수 없습니다. ' + e.message); }
      }

      const maxAttempts = 2;
      let lastErr;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const blob = await this._fetchBlob(str, signal);
          return await blob.arrayBuffer();
        } catch (e) {
          lastErr = e;
          if (attempt === maxAttempts) break;
        }
      }

      try { return await this._fetchUrlViaAndroidBridge(str); } catch (e) { /* ignore */ }
      throw lastErr || Error('원격 모델을 가져오지 못했습니다.');
    }

    if (lower.startsWith('content://') || lower.startsWith('file://')) {
      try { return await this._readBase64FromAndroidBridge(str); } catch (e) { throw e; }
    }

    try {
      const resolved = new URL(str, typeof location !== 'undefined' ? location.href : 'https://example.com/').href;
      const netOk = await this._isNetworkAvailable();
      if (!netOk) {
        try { return await this._fetchUrlViaAndroidBridge(resolved); } catch (e) { throw Error('네트워크에 연결되어 있지 않습니다. ' + e.message); }
      }
      const blob = await this._fetchBlob(resolved, signal);
      return await blob.arrayBuffer();
    } catch (e) {
      throw Error('Failed to resolve or fetch model path: ' + (e && e.message ? e.message : String(e)));
    }
  }

  async loadFromUrl(value, options = {}) { return this.load([value], options); }

  async load(files, options = {}) {
    if (!files) throw Error('No model files provided');

    this.update({ ready: false, loading: true, error: '' });
    try {
      const validated = validateFiles(files);
      const parts = [];

      for (const f of validated) {
        if (typeof f === 'string') { parts.push(f); }
        else if (f instanceof Blob) { parts.push(f); }
        else if (ArrayBuffer.isView(f) || f instanceof ArrayBuffer) { parts.push(new Blob([f instanceof ArrayBuffer ? f : f.buffer])); }
        else {
          try {
            const ab = await this._loadBytesFromPath(f, options.signal);
            parts.push(new Blob([ab]));
          } catch (err) {
            const msg = err && err.message ? err.message : String(err);
            throw Error('Unsupported model file type or could not fetch: ' + msg);
          }
        }
      }

      try {
        const first = parts.find(p => p && typeof p !== 'string');
        if (first instanceof Blob) {
          const head = new TextDecoder().decode(await first.slice(0, 4).arrayBuffer());
          if (head !== 'GGUF') { this.update({ error: '첫 번째 파일 헤더가 GGUF가 아닙니다. 계속 시도합니다.' }); }
        }
      } catch (e) { /* ignore */ }

      if (typeof window !== 'undefined' && window.LocalGGUF && typeof window.LocalGGUF.load === 'function') {
        const runtimeArg = parts.length === 1 ? parts[0] : parts;
        await window.LocalGGUF.load(runtimeArg, options);
        this.status.modelFiles = parts.length;
        this.update({ ready: true, loading: false, generating: false });
        return this.getStatus();
      }

      this._loadedBlobs = parts.map(p => (typeof p === 'string' ? p : p));
      this.status.modelFiles = parts.length;
      this.update({ ready: true, loading: false, generating: false });
      return this.getStatus();
    } catch (error) {
      // Avoid double-wrapping messages that already indicate failure
      const raw = error && error.message ? String(error.message) : String(error);
      if (raw.startsWith('로컬 모델 준비 실패')) throw error; // already wrapped
      this.update({ error: raw });
      throw Error('로컬 모델 준비 실패: ' + raw);
    } finally {
      if (this.status.loading) this.update({ loading: false });
    }
  }

  async generate(messagesOrPrompt, options = {}) {
    if (!this.status.ready && !this._loadedBlobs) throw Error('모델을 먼저 불러오세요.');

    const safeMaxTokens = number(options.maxTokens, 4096, 1, 8192);
    const safeTemperature = number(options.temperature, 0.7, 0, 2);
    const safeTopP = number(options.topP, 0.95, 0, 1);

    if (typeof window !== 'undefined' && window.LocalGGUF && typeof window.LocalGGUF.generate === 'function') {
      const messages = Array.isArray(messagesOrPrompt) ? messagesOrPrompt : typeof messagesOrPrompt === 'string' ? [{ role: 'user', content: messagesOrPrompt }] : (messagesOrPrompt && messagesOrPrompt.messages) || [{ role: 'user', content: String(messagesOrPrompt || '') }];
      const text = await window.LocalGGUF.generate({ messages, maxTokens: safeMaxTokens, temperature: safeTemperature, topP: safeTopP, signal: options.signal, onToken: options.onToken });
      return text;
    }

    if (this._loadedBlobs && typeof window !== 'undefined' && typeof window.loadPackedModel === 'function') {
      const modelFile = this._loadedBlobs[0];
      const runtime = await window.loadPackedModel(modelFile, { onProgress: options.onProgress });
      if (runtime && typeof runtime.generate === 'function') {
        const messages = Array.isArray(messagesOrPrompt) ? messagesOrPrompt : typeof messagesOrPrompt === 'string' ? [{ role: 'user', content: messagesOrPrompt }] : (messagesOrPrompt && messagesOrPrompt.messages) || [{ role: 'user', content: String(messagesOrPrompt || '') }];
        const text = await runtime.generate(messages, { maxTokens: safeMaxTokens, temperature: safeTemperature, topP: safeTopP, signal: options.signal, onToken: options.onToken });
        return text;
      }
    }

    throw Error('로컬 GGUF 실행 엔진이 사용할 수 없습니다.');
  }

  async unload() {
    try { if (typeof this.runtime?.exit === 'function') await this.runtime.exit(); } catch (e) { }
    this.runtime = null; this._loadedBlobs = null; this.status = initial(); this.update({});
  }
}

if (typeof window !== 'undefined' && !window.LocalGGUF) window.LocalGGUF = new LocalGGUFEngine();
