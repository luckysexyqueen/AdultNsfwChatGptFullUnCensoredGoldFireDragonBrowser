import './local-gguf.mjs';
import { freeChat, prepareMessages } from './providers.mjs';
let mode = 'existing';
try { mode = localStorage.getItem('gfd-ai-mode') || mode; } catch { /* private browsing */ }
if (!['existing', 'free', 'local'].includes(mode)) mode = 'existing';
const configReady = fetch(new URL('./config.json', import.meta.url), { credentials: 'omit', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(4000) })
  .then(async r => { if (!r.ok) throw Error('AI 설정을 불러오지 못했습니다.'); return r.json(); });
// Keep a missing optional configuration from creating an unhandled rejection.
configReady.catch(() => {});
window.GFDAI = Object.freeze({
  getMode: () => mode,
  setMode(value) {
    if (!['existing', 'free', 'local'].includes(value)) return false;
    mode = value;
    try { localStorage.setItem('gfd-ai-mode', mode); } catch { /* in memory */ }
    window.dispatchEvent(new CustomEvent('gfd:ai-mode-changed', { detail: mode }));
    return true;
  },
  async generate({ messages, systemPrompt, instructions, onToken, signal }) {
    const config = await configReady;
    if (config.schemaVersion !== 1) throw Error('지원하지 않는 AI 설정입니다.');
    const text = await freeChat(config.freeEndpoint, prepareMessages(messages, systemPrompt, instructions), { signal });
    onToken?.(text);
    return text;
  },
});
function mount() {
  if (document.getElementById('gfd-ai-mode')) return;
  const host = document.createElement('aside'); host.id = 'gfd-ai-mode';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = ':host{position:fixed;right:12px;bottom:120px;z-index:1000;font:14px system-ui;color:#eee}details{padding:10px;background:#202528;border:1px solid #607078;border-radius:12px;max-width:min(340px,85vw)}summary{cursor:pointer}select,button{display:block;min-height:38px;margin-top:8px;max-width:100%}p{line-height:1.5;font-size:12px}';
  const details = document.createElement('details');
  const summary = document.createElement('summary'); summary.textContent = 'AI 연결';
  const select = document.createElement('select'); select.setAttribute('aria-label', 'AI 응답 방식');
  for (const [value, label] of [['existing','기존 API 유지'],['free','무료 API (공유 한도)'],['local','로컬 모델 (서버 전송 없음)']]) {
    const option = document.createElement('option'); option.value = value; option.textContent = label; select.append(option);
  }
  select.value = mode; select.addEventListener('change', () => window.GFDAI.setMode(select.value));
  window.addEventListener('gfd:ai-mode-changed', () => { select.value = mode; });
  const note = document.createElement('p');
  note.textContent = '무료 API 선택 시 대화가 Cloudflare로 전송됩니다. 하루 공유 100회, 최대 128토큰 응답이며 소진 후 유료 전환하지 않습니다. 로컬 모델은 이 기기에서 실행됩니다.';
  const button = document.createElement('button'); button.textContent = '로컬 모델 관리';
  button.addEventListener('click', () => { details.open = false; window.dispatchEvent(new CustomEvent('gfd:open-local-models')); });
  details.append(summary, select, note, button); shadow.append(style, details); document.documentElement.append(host);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true }); else mount();
