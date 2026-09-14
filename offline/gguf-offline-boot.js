/* GoldFire Offline GGUF Boot
 * 네트워크/API 없이 models/*.gguf를 LocalGGUF에 자동 로드합니다.
 */
(function () {
  "use strict";
  if (window.__goldfireOfflineGGUFBoot) return;
  window.__goldfireOfflineGGUFBoot = true;

  const modelName = "sexygpt-uncensored-q3_k_m.gguf";
  const modelUrl = new URL("./models/" + modelName, document.baseURI).href;
  let started = false;

  async function boot() {
    if (started || !window.LocalGGUF) return;
    started = true;
    try {
      if (window.LocalGGUF.getStatus?.().ready) return;
      const response = await fetch(modelUrl, { cache: "no-store" });
      if (!response.ok && response.status !== 0) {
        throw new Error("내장 GGUF 모델을 읽을 수 없습니다: HTTP " + response.status);
      }
      const blob = await response.blob();
      const file = new File([blob], modelName, { type: "application/octet-stream" });
      await window.LocalGGUF.load([file], {
        contextLength: 1024,
        useGpu: false,
        onProgress: (progress) => window.dispatchEvent(
          new CustomEvent("goldfire-local-progress", { detail: String(progress) }),
        ),
      });
      window.dispatchEvent(new CustomEvent("goldfire-bundled-model-ready", {
        detail: window.LocalGGUF.getStatus?.(),
      }));
    } catch (error) {
      started = false;
      console.error("[Offline GGUF] 자동 로드 실패:", error);
      window.dispatchEvent(new CustomEvent("goldfire-local-error", {
        detail: String(error?.message || error),
      }));
    }
  }

  const wait = setInterval(() => {
    if (window.LocalGGUF) {
      clearInterval(wait);
      boot();
    }
  }, 250);
  window.addEventListener("goldfire-local-runtime-ready", boot, { once: true });
  window.addEventListener("load", () => setTimeout(boot, 0), { once: true });
})();
