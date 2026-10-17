import './local-gguf.mjs';
import { freeChat, prepareMessages } from './providers.mjs';
import { koreanInstructions } from './language.mjs';
import { loadPackedModel } from './packed-model.mjs';
let mode = 'existing';
try { mode = localStorage.getItem('gfd-ai-mode') || mode; } catch { /* private browsing */ }
if (!['existing', 'free', 'local'].includes(mode)) mode = 'existing';
const configReady = fetch(new URL('./config.json', import.meta.url), { credentials: 'omit', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(4000) })
  .then(async r => { if (!r.ok) throw Error('AI 설정을 불러오지 못했습니다.'); return r.json(); });
// Keep a missing optional configuration from creating an unhandled rejection.
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
  async generate({ messages, systemPrompt, instructions, onToken, signal, maxTokens } = {}) {
    const config = await configReady;
    if (config.schemaVersion !== 1) throw Error('지원하지 않는 AI 설정입니다.');

    // Prepare and validate messages first
    const prepared = prepareMessages(messages, systemPrompt, instructions);

    // Helper: try free/existing endpoint
    const callRemote = async (endpoint) => {
      const cap = Number.isFinite(Number(maxTokens)) ? Math.max(1, Math.min(4096, Math.floor(Number(maxTokens)))) : (config.defaultMaxTokens || 4096);
      const text = await freeChat(endpoint, prepared, { signal, maxTokens: cap });
      onToken?.(text);
      return text;
    };

    // Local model path: prefer local when selected
    if (mode === 'local') {
      if (typeof window !== 'undefined' && window.LocalGGUF && typeof window.LocalGGUF.generate === 'function') {
        try {
          // Allow caller to pass maxTokens, otherwise use a generous default
          const localMax = Number.isFinite(Number(maxTokens)) ? Math.max(1, Math.min(8192, Math.floor(Number(maxTokens)))) : (config.localDefaultMaxTokens || 4096);
          const text = await window.LocalGGUF.generate(prepared, { signal, onToken, maxTokens: localMax });
          return text;
        } catch (err) {
          console.warn('Local model generation failed:', err);
          // Fall through to remote endpoint if fallback is enabled (default true)
          if (config?.allowLocalFallback === false) throw err;
          // otherwise continue to call remote
        }
      } else {
        throw Error('로컬 모델 런타임을 찾을 수 없습니다. 로컬 모델을 먼저 불러오세요.');
      }
    }

    // For 'existing' mode prefer config.existingEndpoint if present, otherwise use freeEndpoint
    if (mode === 'existing') {
      if (config.existingEndpoint) return await callRemote(config.existingEndpoint);
      return await callRemote(config.freeEndpoint);
    }

    // mode === 'free'
    return await callRemote(config.freeEndpoint);
  },
});
function mount() {
  if (document.getElementById('gfd-ai-mode')) return;
  const host = document.createElement('aside'); host.id = 'gfd-ai-mode';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = ':host{position:fixed;right:12px;bottom:120px;z-index:1000;font:14px system-ui;color:#eee}details{padding:10px;background:#202528;border:1px solid #607078;border-radius:12px;box-shadow:rgba(0,0,0,.4) 0 6px 18px}summary{cursor:pointer}select{margin-top:6px;width:100%}p{margin:8px 0 12px 0;font-size:12px;color:#cfe7ff}button{display:block;width:100%}';
  const details = document.createElement('details');
  const summary = document.createElement('summary'); summary.textContent = 'AI 연결';
  const select = document.createElement('select'); select.setAttribute('aria-label', 'AI 응답 방식');
  for (const [value, label] of [['existing','기존 API 유지'],['free','무료 API (공유 한도)'],['local','로컬 모델 (서버 전송 없음)']]) {
    const option = document.createElement('option'); option.value = value; option.textContent = label; select.append(option);
  }
  select.value = mode; select.addEventListener('change', () => window.GFDAI.setMode(select.value));
  window.addEventListener('gfd:ai-mode-changed', () => { select.value = mode; });
  const note = document.createElement('p');
  note.textContent = '무료 API 선택 시 대화가 Cloudflare로 전송됩니다. 하루 공유 100회(동일 계정 전체), 3초 전역 쿨다운, 출력 토큰 한도 4096토큰. 로컬 모델은 서버로 전송되지 않습니다.';
  const button = document.createElement('button'); button.textContent = '로컬 모델 관리';
  button.addEventListener('click', () => { details.open = false; window.dispatchEvent(new CustomEvent('gfd:open-local-models')); });
  details.append(summary, select, note, button); shadow.append(style, details); document.documentElement.append(host);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true }); else mount();
