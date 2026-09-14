/* LocalMode offline module loader
 * Built from LocalMode-AI/LocalMode packages/core and packages/wllama.
 */
(async () => {
  try {
    const mod = await import(new URL("./localmode/wllama/index.js", document.baseURI).href);
    const settings = {
      wasmPath: new URL("./wllama/esm/wasm/wllama.wasm", document.baseURI).href,
      modelPath: new URL("./models", document.baseURI).href,
    };
    window.LocalMode = mod;
    window.LocalModeWllama = mod.createWllama?.(settings) || mod.wllama;
    window.dispatchEvent(new CustomEvent("goldfire-localmode-ready", { detail: mod }));
  } catch (error) {
    console.error("[LocalMode] 오프라인 모듈 로드 실패:", error);
    window.dispatchEvent(new CustomEvent("goldfire-localmode-error", { detail: String(error?.message || error) }));
  }
})();
