import './ai/local-gguf.mjs';
if (location.origin === 'http://127.0.0.1:18735') {
  let serial = 0;
  const pending = new Map();
  document.addEventListener('gfd-model-response', event => {
    try {
      const reply = JSON.parse(event.detail);
      const item = pending.get(reply.requestId);
      if (!item) return;
      pending.delete(reply.requestId); clearTimeout(item.timer);
      if (reply.result?.error) item.reject(new Error(reply.result.error)); else item.resolve(reply.result);
    } catch (_) {}
  });
  const request = (action, extra = {}) => new Promise((resolve, reject) => {
    const requestId = `${Date.now()}-${++serial}`;
    const timer = setTimeout(() => { pending.delete(requestId); reject(new Error('앱 모델 저장소가 응답하지 않아요.')); }, 15000);
    pending.set(requestId, { resolve, reject, timer });
    document.dispatchEvent(new CustomEvent('gfd-model-request', { detail: JSON.stringify({ requestId, action, ...extra }) }));
  });
  const models = window.GFDNativeModels = Object.freeze({
    list: () => request('models.list'),
    download: url => request('models.download', { url }),
    remove: id => request('models.delete', { id }),
  });
  const originalLoad = window.LocalGGUF.loadFromUrl.bind(window.LocalGGUF);
  window.LocalGGUF.loadFromUrl = async (value, options = {}) => {
    const target = new URL(value, location.href);
    if (target.protocol !== 'https:' || !target.pathname.toLowerCase().endsWith('.gguf')) return originalLoad(value, options);
    const job = await models.download(target.href);
    for (;;) {
      if (options.signal?.aborted) throw new DOMException('모델 불러오기를 취소했어요. 다운로드 상태는 앱 모델 관리에서 확인할 수 있어요.', 'AbortError');
      const current = (await models.list()).find(model => model.id === job.id);
      if (!current) throw new Error('다운로드 기록을 찾을 수 없어요.');
      options.onProgress?.(current.total > 0 ? `앱에 모델 저장 ${Math.floor(current.downloaded * 100 / current.total)}%` : current.state);
      if (current.ready) {
        localStorage.setItem('gfd-native-selected-model', current.id);
        return originalLoad(current.url, options);
      }
      if (current.state.startsWith('실패') || current.state.startsWith('유효하지') || current.state === '기록 없음') throw new Error(current.state);
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  };
  // 홈페이지에서 모델을 선택하면 다음 실행에서도 저장된 파일을 재사용한다.
  if (location.pathname.endsWith('index.html') || location.pathname === '/') {
    const selected = new URLSearchParams(location.search).get('nativeModel') || localStorage.getItem('gfd-native-selected-model');
    if (selected) {
      try {
        const model = (await models.list()).find(item => item.id === selected && item.ready);
        if (model) {
          await import('./ai/boot.mjs');
          localStorage.setItem('gfd-native-selected-model', model.id);
          await originalLoad(model.url, { onProgress: message => window.dispatchEvent(new CustomEvent('gfd:native-model-progress', { detail: message })) });
          window.GFDAI?.setMode('local');
        }
      } catch (error) { console.warn('저장된 모델 불러오기:', error.message); }
    }
  }
}
