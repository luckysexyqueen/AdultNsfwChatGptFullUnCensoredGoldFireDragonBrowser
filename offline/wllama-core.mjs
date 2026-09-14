/* GoldFire Offline Wllama MJS Entry
 * @wllama/wllama 공식 ESM과 같은 폴더의 WASM을 로컬에서 사용합니다.
 */
const mod = await import(new URL("./wllama/esm/index.js", import.meta.url));
const WllamaClass = mod.Wllama || mod.default;
if (!WllamaClass) throw new Error("공식 Wllama ESM에서 Wllama 클래스를 찾지 못했습니다.");

export const Wllama = WllamaClass;
export const wllama = WllamaClass;
export default WllamaClass;

if (typeof window !== "undefined") {
  window.Wllama = WllamaClass;
  window.wllama = WllamaClass;
}
