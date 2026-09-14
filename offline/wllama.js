/* GoldFire Offline Wllama Loader
 * 모든 의존성은 같은 offline 폴더의 로컬 파일만 사용합니다.
 * 지원 파일명: wllama-core.mjs, wllama-core.js, wllama.bundle.js
 */
(function () {
  "use strict";
  if (window.__goldfireWllamaLoader) return;
  window.__goldfireWllamaLoader = true;

  const candidates = [
    "./offline/wllama-core.mjs",
    "./offline/wllama-core.js",
    "./offline/wllama.bundle.js",
  ];

  window.GoldFireWllamaReady = (async function loadLocalWllama() {
    if (window.Wllama || window.wllama || window.WLLAMA) return window.Wllama || window.wllama || window.WLLAMA;
    for (const path of candidates) {
      try {
        const mod = await import(new URL(path, document.baseURI).href);
        const engine = mod.default || mod.Wllama || mod.wllama || mod.WLLAMA || window.Wllama || window.wllama;
        if (engine) {
          window.Wllama = engine;
          window.wllama = engine;
          return engine;
        }
      } catch (error) {
        console.warn("[Offline GGUF] local Wllama file skipped:", path, error?.message || error);
      }
    }
    throw new Error("오프라인 Wllama 엔진 파일을 찾을 수 없습니다. offline/wllama-core.mjs를 추가하세요.");
  })();
})();
