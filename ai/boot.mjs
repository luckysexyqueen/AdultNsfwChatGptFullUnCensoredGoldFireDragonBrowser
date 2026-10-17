import './local-gguf.mjs';
import { freeChat, prepareMessages } from './providers.mjs';
import { koreanInstructions } from './language.mjs';
import { loadPackedModel } from './packed-model.mjs';
let mode = 'existing';
try { mode = localStorage.getItem('gfd-ai-mode') || mode; } catch { /* private browsing */ }
if (!['existing', 'free', 'local'].includes(mode)) mode = 'existing';
const configReady = fetch(new URL('./config.json', import.meta.url), { credentials: 'omit', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(4000) })
  .then(async r => { if (!r.ok) throw Error('AI 설정을 불러오지 못했습니다.'); return r.json(); });
configReady.catch(() => {});
window.GFDAI = Object.freeze({
  extendInstructions: koreanInstructions,
  async loadKoreanModel(options = {}) {
    const config = await configReady;
    if (config.schemaVersion !== 1 || !config.koreanModel?.manifest) throw Error('한국어 모델 설정을 불러오지 못했습니다.');
    const file = await loadPackedModel(new URL(config.koreanModel.manifest, import.meta.url).href, config.koreanModel.sha256, options);
    return window.LocalGGUF.load([file], options);
  },
  getMode: () => mode,
  setMode(value) {
    if (!['existing', 'free', 'local'].includes(value)) return false;
    mode = value;
    try { localStorage.setItem('gfd-ai-mode', mode); } catch { /* in memory */ }
    window.dispatchEvent(new CustomEvent('gfd:ai-mode-changed', { detail: mode }));
    return true;
  },
  async generate({ messages, systemPrompt, instructions, onToken, signal, maxTokens = 4096 }) {
    const config = await configReady;
    if (config.schemaVersion !== 1) throw Error('지원하지 않는 AI 설정입니다.');
    const local = window.LocalGGUF;
    const localMessages = [
      ...(systemPrompt || instructions ? [{ role: 'system', content: koreanInstructions([systemPrompt, instructions].filter(Boolean).join('\n\n')) }] : []),
      ...messages,
    ];
    const runLocal = async () => {
      if (!local?.getStatus?.().ready) throw Error('로컬 GGUF 모델이 준비되지 않았습니다. 먼저 로컬 모델 관리에서 모델을 불러오세요.');
      return local.generate(localMessages, { maxTokens, onToken, signal, temperature: 0.7 });
    };
    if (mode === 'local') return runLocal();
    if (mode === 'existing') throw Error('기존 API 모드에서는 기존 채팅 연결을 사용하세요.');
    try {
      const text = await freeChat(config.freeEndpoint, prepareMessages(messages, systemPrompt, instructions), { signal, maxTokens });
      onToken?.(text);
      return text;
    } catch (error) {
      if (signal?.aborted) throw error;
      if (local?.getStatus?.().ready) return runLocal();
      throw new Error('무료 API 요청에 실패했고 준비된 로컬 모델이 없습니다: ' + (error?.message || error));
    }
  },
});
function mount() {
  if (document.getElementById('gfd-ai-mode')) return;
  const host = document.createElement('aside'); host.id = 'gfd-ai-mode';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = ':host{position:fixed;right:12px;bottom:120px;z-index:1000;font:14px system-ui;color:#eee}details{padding:10px;background:#202528;border:1px solid #607078;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.3)}summary{cursor:pointer;font-weight:700}p{margin-top:8px;line-height:1.4;color:#dfe8ee}button{margin-top:8px;padding:8px 12px;border:1px solid #607078;border-radius:8px;background:#2a2f34;color:#fff;cursor:pointer}button:hover{background:#303840}';
  const details = document.createElement('details');
  const summary = document.createElement('summary'); summary.textContent = 'AI 연결';
  const select = document.createElement('select'); select.setAttribute('aria-label', 'AI 응답 방식');
  for (const [value, label] of [['existing','기존 API 유지'],['free','무료 API (공유 한도)'],['local','로컬 모델 (서버 전송 없음)']]) {
    const option = document.createElement('option'); option.value = value; option.textContent = label; select.append(option);
  }
  select.value = mode; select.addEventListener('change', () => window.GFDAI.setMode(select.value));
  window.addEventListener('gfd:ai-mode-changed', () => { select.value = mode; });
  const note = document.createElement('p');
  note.textContent = '무료 API는 Cloudflare 공유 예산을 사용하며, 응답 길이를 더 크게 늘려 4096토큰까지 허용합니다. 사용량 한도 초과 또는 실패 시 자동으로 로컬 GGUF 모델로 전환됩니다.';
  const button = document.createElement('button'); button.textContent = '로컬 모델 관리';
  button.addEventListener('click', () => { details.open = false; window.dispatchEvent(new CustomEvent('gfd:open-local-models')); });
  details.append(summary, select, note, button); shadow.append(style, details); document.documentElement.append(host);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true }); else mount();
