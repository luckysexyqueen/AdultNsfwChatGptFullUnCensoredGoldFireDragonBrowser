/* GoldFire offline GGUF adapter — matches Wllama's actual API.
 * Reuses the existing LocalGGUF bridge if a newer engine is already installed.
 */
(function () {
  "use strict";
  if (window.LocalGGUF) return;
  let engine = null;
  let busy = false;
  let generating = false;
  let status = { ready: false, loading: false, generating: false, modelFiles: 0, webGpuAvailable: false };
  const report = (name, detail) => window.dispatchEvent(new CustomEvent(name, { detail }));
  const snapshot = () => ({ ...status });
  const errorText = e => e instanceof Error ? e.message : String(e);
  const clamp = (value, fallback, min, max) => Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Number(value))) : fallback;
  const magic = async file => new TextDecoder().decode(await file.slice(0, 4).arrayBuffer()) === "GGUF";

  async function getConstructor() {
    let ctor = window.Wllama || window.wllama || window.WLLAMA;
    if (!ctor && window.GoldFireWllamaReady) ctor = await window.GoldFireWllamaReady;
    if (!ctor) {
      const module = await import(new URL("./offline/wllama-core.mjs", document.baseURI).href);
      ctor = module.Wllama || module.default;
    }
    if (typeof ctor !== "function") throw Error("Wllama 실행 클래스를 찾지 못했습니다.");
    return ctor;
  }

  const bridge = {
    getStatus: snapshot,
    async load(files, options = {}) {
      if (busy || generating) throw Error("다른 로컬 모델 작업이 실행 중입니다.");
      const list = Array.from(files || []).sort((x, y) => x.name.localeCompare(y.name, undefined, { numeric: true }));
      if (!list.length || list.some(f => !f.size || !/\.gguf(?:\.part\d+)?$/i.test(f.name))) throw Error("유효한 GGUF 파일이 필요합니다.");
      if (!(await magic(list[0]))) throw Error("GGUF 파일 헤더가 올바르지 않습니다.");
      busy = true;
      status = { ...status, ready: false, loading: true, modelFiles: list.length };
      try {
        await engine?.exit();
        engine = null;
        const Wllama = await getConstructor();
        const wasm = new URL("./offline/wllama/esm/wasm/wllama.wasm", document.baseURI).href;
        engine = new Wllama({ default: wasm }, { allowOffline: true, suppressNativeLog: true });
        const contextLength = clamp(options.contextLength, 2048, 512, 8192);
        const nThreads = window.crossOriginIsolated ? Math.min(navigator.hardwareConcurrency || 2, 4) : 1;
        options.onProgress?.("로컬 추론 엔진과 GGUF 모델을 불러오는 중…");
        await engine.loadModel(list, { n_ctx: contextLength, n_threads: nThreads, jinja: true, n_gpu_layers: options.useGpu === true ? 99999 : 0 });
        status = { ready: true, loading: false, generating: false, modelFiles: list.length, modelName: list[0].name, modelSize: list.reduce((n, f) => n + f.size, 0), contextLength, webGpuAvailable: engine.isSupportWebGPU?.() ?? false };
        report("goldfire-local-ready", snapshot());
        return snapshot();
      } catch (error) {
        try { await engine?.exit(); } catch { /* best effort cleanup */ }
        engine = null;
        status = { ready: false, loading: false, generating: false, modelFiles: 0, webGpuAvailable: false, error: errorText(error) };
        report("goldfire-local-error", errorText(error));
        throw error;
      } finally { busy = false; }
    },
    async loadFromUrl(value, options = {}) {
      const url = new URL(value, document.baseURI);
      if (!["https:", "http:"].includes(url.protocol) || (url.protocol === "http:" && url.origin !== location.origin) || url.username || url.password) throw Error("안전한 모델 URL만 사용할 수 있습니다.");
      const response = await fetch(url.href, { credentials: "omit" });
      if (!response.ok) throw Error("GGUF 다운로드 실패: " + response.status);
      const blob = await response.blob();
      return bridge.load([new File([blob], decodeURIComponent(url.pathname.split("/").pop() || "model.gguf"))], options);
    },
    async generate(input, options = {}) {
      if (!engine || !status.ready) throw Error("먼저 로컬 GGUF 모델을 불러오세요.");
      if (generating || busy) throw Error("로컬 모델이 이미 작업 중입니다.");
      const messages = typeof input === "string" ? [{ role: "user", content: input }] : input;
      if (!Array.isArray(messages) || !messages.length || messages.some(m => !["system", "user", "assistant"].includes(m.role) || typeof m.content !== "string")) throw Error("올바른 메시지를 입력하세요.");
      generating = true; status.generating = true;
      try {
        const max_tokens = clamp(options.maxTokens, 512, 1, 2048);
        const common = { stream: true, max_tokens, temperature: clamp(options.temperature, 0.7, 0, 2), abortSignal: options.signal };
        const architecture = engine.getModelMetadata?.()?.meta?.["general.architecture"];
        const output = architecture === "gpt2"
          ? await engine.createCompletion({ ...common, prompt: messages.map(m => m.role.toUpperCase() + ": " + m.content).join("\n") + "\nASSISTANT:" })
          : await engine.createChatCompletion({ ...common, messages, chat_template_kwargs: { enable_thinking: false } });
        let text = "";
        for await (const chunk of output) {
          const token = chunk.choices?.[0]?.delta?.content ?? chunk.choices?.[0]?.text ?? "";
          if (token) { text += token; options.onToken?.(token); }
        }
        if (!text.trim()) throw Error("GGUF 모델이 빈 응답을 생성했습니다.");
        return text;
      } finally { generating = false; status.generating = false; }
    },
    async unload() {
      if (busy || generating) throw Error("모델 작업 중에는 해제할 수 없습니다.");
      try { await engine?.exit(); }
      finally { engine = null; status = { ready: false, loading: false, generating: false, modelFiles: 0, webGpuAvailable: false }; }
    },
  };
  window.LocalGGUF = bridge;
  report("goldfire-local-runtime-ready", snapshot());
})();
