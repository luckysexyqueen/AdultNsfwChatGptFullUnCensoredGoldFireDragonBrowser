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
    const local = window.LocalGGUF;
    const localMessages = [
      ...(systemPrompt || instructions ? [{ role: 'system', content: koreanInstructions([systemPrompt, instructions].filter(Boolean).join('\n\n')) }] : []),
      ...messages,
    ];
    const runLocal = async () => {
      if (!local?.getStatus?.().ready) throw Error('로컬 GGUF 모델이 준비되지 않았습니다. 먼저 로컬 모델 관리에서 모델을 불러오세요.');
      const generateReliable = async (input, opts) => {
        let lastError;
        for (let attempt = 0; attempt < 2; attempt++) {
          if (signal?.aborted) throw new DOMException('취소되었습니다.', 'AbortError');
          try { return await local.generate(input, { ...opts, maxTokens: attempt ? Math.min(opts.maxTokens || 512, 512) : opts.maxTokens }); }
          catch (error) { lastError = error; if (!local.getStatus?.().ready || signal?.aborted) throw error; }
        }
        throw lastError;
      };
      const total = localMessages.reduce((n, m) => n + m.content.length, 0);
      if (total <= 6000) return generateReliable(localMessages, { maxTokens, onToken, signal, temperature: 0.7 });
      // Keep every source chunk under a conservative character budget; a model's
      // actual token/context limits still apply independently of character count.
      const source = localMessages.map(m => '[' + m.role + ']\n' + m.content).join('\n\n');
      const chunks = [];
      for (let i = 0; i < source.length; i += 2500) chunks.push(source.slice(i, i + 2500));
      let notes = '';
      for (let i = 0; i < chunks.length; i++) {
        if (signal?.aborted) throw new DOMException('취소되었습니다.', 'AbortError');
        const summary = await generateReliable([
          { role: 'system', content: '다음 입력 조각의 사실, 지시, 핵심 문맥을 한국어로 압축하세요. 이전 메모와 충돌하면 충돌을 명시하세요. 추측하지 마세요.' },
          { role: 'user', content: '이전 메모:\\n' + notes.slice(-2000) + '\\n\\n조각 ' + (i + 1) + '/' + chunks.length + ':\\n' + chunks[i] }
        ], { maxTokens: 384, signal, temperature: 0.2 });
        notes = (notes + '\n' + summary).slice(-4000);
      }
      return generateReliable([
        { role: 'system', content: '긴 원문을 순차 분석한 요약 메모입니다. 메모에 없는 내용은 확인할 수 없다고 설명하고, 한국어로 최종 응답하세요.' },
        { role: 'user', content: '요약 메모:\\n' + notes + '\\n\\n최종 요청:\\n' + localMessages.filter(m => m.role === 'user').at(-1)?.content.slice(-1200) }
      ], { maxTokens, onToken, signal, temperature: 0.7 });
    };
    if (mode === 'local') return runLocal();
    const inputChars = localMessages.reduce((sum, message) => sum + message.content.length, 0);
    if (mode === 'free' && (inputChars > 4000 || localMessages.length > 16)) {
      return runLocal();
    }
    if (mode === 'existing') throw Error('기존 API 모드에서는 기존 채팅 연결을 사용하세요.');
    let config;
    try { config = await configReady; }
    catch (error) { if (local?.getStatus?.().ready) return runLocal(); throw error; }
    if (config.schemaVersion !== 1) throw Error('지원하지 않는 AI 설정입니다.');
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
  note.textContent = '무료 API에는 서버 입력·출력 및 사용량 제한이 있습니다. 긴 입력은 준비된 로컬 GGUF 모델로 분할 분석하며, 실패 시 한 번 재시도합니다.';
  const button = document.createElement('button'); button.textContent = '로컬 모델 관리';
  button.addEventListener('click', () => { details.open = false; window.dispatchEvent(new CustomEvent('gfd:open-local-models')); });
  details.append(summary, select, note, button); shadow.append(style, details); document.documentElement.append(host);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true }); else mount();
