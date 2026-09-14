/* GoldFire Offline GGUF Runtime Adapter
 * 로컬 Wllama 파일을 앱이 사용하는 window.LocalGGUF 인터페이스로 연결합니다.
 */
(function () {
  "use strict";
  if (window.LocalGGUF) return;

  const state = {
    ready: false,
    loading: false,
    generating: false,
    modelFiles: 0,
    modelName: "",
    savedModelId: "",
  };
  let engine = null;
  let loadedFiles = [];

  function emit(name, detail) {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }
  function status() {
    return { ...state, modelFiles: loadedFiles.length };
  }
  function getEngine() {
    return window.Wllama || window.wllama || window.WLLAMA || engine;
  }

  async function getInstance(options) {
    const candidate = getEngine();
    if (!candidate && window.GoldFireWllamaReady) engine = await window.GoldFireWllamaReady;
    const source = engine || candidate;
    if (!source) throw new Error("로컬 Wllama 엔진을 찾을 수 없습니다.");
    if (typeof source === "function") {
      return new source({
        default: new URL("./offline/wllama/esm/wasm/wllama.wasm", document.baseURI).href,
      }, options);
    }
    return source;
  }

  window.LocalGGUF = {
    getStatus: status,
    async load(files, options = {}) {
      if (!files?.length) throw new Error("GGUF 파일이 없습니다.");
      state.loading = true;
      state.modelName = files[0].name || "GGUF";
      emit("goldfire-local-progress", "GGUF 엔진 준비 중...");
      try {
        engine = await getInstance(options);

        if (typeof engine.loadModel === "function") {
          await engine.loadModel(files, options);
        } else if (typeof engine.load === "function") {
          await engine.load(files, options);
        } else if (typeof engine.create === "function") {
          engine = await engine.create({ ...options, files });
        } else {
          throw new Error("Wllama 로컬 엔진에 loadModel/load/create API가 없습니다.");
        }
        loadedFiles = Array.from(files);
        state.ready = true;
        state.loading = false;
        emit("goldfire-local-ready", status());
        return status();
      } catch (error) {
        state.loading = false;
        state.ready = false;
        emit("goldfire-local-error", String(error?.message || error));
        throw error;
      }
    },
    async unload() {
      try {
        if (engine?.unload) await engine.unload();
        else if (engine?.dispose) await engine.dispose();
      } finally {
        loadedFiles = [];
        state.ready = false;
        state.modelFiles = 0;
        state.modelName = "";
      }
    },
    async generate(prompt, options = {}) {
      if (!state.ready) throw new Error("GGUF 모델이 아직 로드되지 않았습니다.");
      const local = getEngine();
      state.generating = true;
      try {
        const fn = local?.generate || local?.infer || local?.chat;
        if (typeof fn !== "function") throw new Error("Wllama 생성 API를 찾을 수 없습니다.");
        return await fn.call(local, prompt, options);
      } finally {
        state.generating = false;
      }
    },
  };
})();
