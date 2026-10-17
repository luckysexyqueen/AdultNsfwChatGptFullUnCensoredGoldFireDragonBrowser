const number = (value, fallback, min, max) => Number.isFinite(Number(value)) ? Math.max(min, Math.min(Number(value), max)) : fallback;

const initial = () => ({ ready: false, loading: false, generating: false, webGpuAvailable: false, modelFiles: 0 });
export class LocalGGUFEngine {
  constructor() { this.runtime = null; this.status = initial(); }
  getStatus() { return { ...this.status }; }

  // Helper: fetch an ArrayBuffer from an http(s) URL
  async _fetchArrayBuffer(url, signal) {
    const res = await fetch(url, { signal, cache: 'no-store' });
    if (!res.ok) throw Error(`Network error ${res.status}`);
    return await res.arrayBuffer();
  }

  // Helper: attempt to read a content:// or file:// path via Android bridge if available
  async _readBase64FromAndroidBridge(uri) {
    try {
      if (typeof window !== 'undefined' && window.AndroidBridge) {
        const fn = window.AndroidBridge.readContentUriBase64 || window.AndroidBridge.readFilePathBase64;
        if (typeof fn === 'function') {
          const b64 = fn(uri);
          if (!b64) throw Error('Android bridge returned empty');
          const bin = atob(b64);
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

  // Load model bytes from various path types (http(s), relative, blob/File, content://, file://)
  async _loadBytesFromPath(path, signal) {
    if (!path) throw Error('No model path provided');
    if (typeof path === 'object' && (path instanceof Blob || path instanceof ArrayBuffer || ArrayBuffer.isView(path))) {
      if (path instanceof ArrayBuffer) return path;
      if (ArrayBuffer.isView(path)) return path.buffer;
      // Blob -> arrayBuffer
      return await path.arrayBuffer();
    }
    const str = String(path);
    const lower = str.toLowerCase();
    if (lower.startsWith('http://') || lower.startsWith('https://')) {
      return await this._fetchArrayBuffer(str, signal);
    }
    if (lower.startsWith('content://') || lower.startsWith('file://')) {
      // Browsers cannot access content/file URIs directly; try Android bridge if present
      try { return await this._readBase64FromAndroidBridge(str); } catch (e) { throw e; }
    }
    // Treat as relative path
    try {
      const resolved = new URL(str, typeof location !== 'undefined' ? location.href : 'https://example.com/').href;
      return await this._fetchArrayBuffer(resolved, signal);
    } catch (e) {
      throw Error('Failed to resolve or fetch model path: ' + e.message);
    }
  }

  // Accepts: array of Files/Blobs/ArrayBuffers OR array of path strings OR mixed
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
      // Delegate to underlying runtime loader if present
      // Here we assume a global packed model loader or LocalGGUF API exists
      if (typeof window !== 'undefined' && window.LocalGGUF && typeof window.LocalGGUF.load === 'function') {
        await window.LocalGGUF.load(parts, options);
        this.status.modelFiles = parts.length;
        this.status.ready = true;
        return true;
      }
      // Otherwise, keep files ready for external loader
      this._loadedBlobs = parts;
      this.status.modelFiles = parts.length;
      this.status.ready = true;
      return true;
    } finally {
      this.status.loading = false;
    }
  }

  // Generate text using the loaded model. If a LocalGGUF runtime is present, use it.
  // maxTokens default raised to 4096, clamp to 8192 for safety
  async generate(messagesOrPrompt, { maxTokens = 4096, temperature = 0.7, topP = 0.95, onToken, signal } = {}) {
    if (!this.status.ready && !this._loadedBlobs) throw Error('Model not loaded');
    const useMax = number(maxTokens, 4096, 1, 8192);
    const opts = { maxTokens: useMax, temperature: number(temperature, 0.7, 0, 2), topP: number(topP, 0.95, 0, 1), signal };
    // If window.LocalGGUF.generate exposed, call it
    if (typeof window !== 'undefined' && window.LocalGGUF && typeof window.LocalGGUF.generate === 'function') {
      // Support both messages array and plain prompt
      try {
        const text = await window.LocalGGUF.generate({ messages: Array.isArray(messagesOrPrompt) ? messagesOrPrompt : [{ role: 'user', content: String(messagesOrPrompt) }], maxTokens: opts.maxTokens, temperature: opts.temperature, topP: opts.topP, signal });
        // onToken may be used for streaming; LocalGGUF.generate may not support streaming here
        if (onToken) onToken(text);
        return text;
      } catch (e) {
        throw e;
      }
    }
    // Fallback: if no runtime, and we have blobs, attempt to call a generic packed-model loader
    if (this._loadedBlobs && typeof window !== 'undefined' && typeof window.loadPackedModel === 'function') {
      const modelFile = this._loadedBlobs[0];
      const loader = window.loadPackedModel; // expected to return runtime with generate
      const runtime = await loader(modelFile, { onProgress: options?.onProgress });
      if (runtime && typeof runtime.generate === 'function') {
        const text = await runtime.generate(Array.isArray(messagesOrPrompt) ? messagesOrPrompt : [{ role: 'user', content: String(messagesOrPrompt) }], opts);
        if (onToken) onToken(text);
        return text;
      }
    }
    throw Error('No local runtime available to generate text');
  }
}

export default new LocalGGUFEngine();
