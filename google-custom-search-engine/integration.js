(function () {
  'use strict';
  const DEFAULT_ENGINE = 'd93a0416b22728c28';
  const KEY = 'gfd-google-custom-search-cx';
  const valid = value => /^[A-Za-z0-9:_-]{5,160}$/.test(value || '');
  let engine = DEFAULT_ENGINE;
  try { const saved = localStorage.getItem(KEY); if (valid(saved)) engine = saved; } catch (_) {}
  const params = new URLSearchParams(location.search);
  const query = (params.get('q') || '').trim();
  const jpUrl = text => 'https://www.google.co.jp/search?' + new URLSearchParams({q:text, gl:'jp', hl:'ko', safe:'off', nfpr:'1', filter:'0', pws:'0', desktop:'true'});
  const nativeOpen = url => {
    if (location.origin === 'http://127.0.0.1:18735') {
      document.dispatchEvent(new CustomEvent('gfd-native-open', {detail:url}));
    } else { location.assign(url); }
  };
  const input = document.querySelector('input[name="q"]');
  if (input) input.value = query;
  const settings = document.getElementById('engine-settings');
  if (settings) {
    const field = document.getElementById('engine-id');
    field.value = engine;
    settings.addEventListener('submit', event => {
      event.preventDefault();
      const value = field.value.trim();
      const status = document.getElementById('engine-status');
      if (!valid(value)) { status.textContent = '올바른 검색엔진 ID를 입력하세요.'; return; }
      try { localStorage.setItem(KEY, value); engine=value; status.textContent='저장했습니다.'; }
      catch (_) { status.textContent='설정을 저장하지 못했습니다. 저장공간을 확인하세요.'; }
    });
  }
  const direct = document.getElementById('jp-search');
  if (direct) direct.addEventListener('click', () => {
    const text = (input ? input.value : query).trim();
    if (text) nativeOpen(jpUrl(text)); else if(input) input.focus();
  });
  const result = document.getElementById('custom-results');
  if (!result) return;
  const status = document.getElementById('search-status');
  if (!query) { status.textContent = '검색어를 입력하세요.'; return; }
  status.textContent = 'Google 맞춤검색을 불러오는 중입니다.';
  let ready = false;
  let timer;
  const failed = () => { if (!ready) status.textContent = '맞춤검색을 불러오지 못했습니다. 위의 일본 Google 검색 버튼을 이용하세요.'; };
  window.__gcse = {
    parsetags:'explicit',
    initializationCallback:function () {
      try {
        google.search.cse.element.render({div:result.id, tag:'searchresults-only', gname:'gfd-custom', attributes:{linkTarget:'_top'}});
        const control = google.search.cse.element.getElement('gfd-custom');
        if (!control) throw new Error('검색 구성 실패');
        control.execute(query);
        ready=true; clearTimeout(timer); status.textContent='';
      } catch (_) { failed(); }
    }
  };
  const script=document.createElement('script');
  script.src='https://cse.google.com/cse.js?cx='+encodeURIComponent(engine)+'&hl=ko';
  script.async=true; script.onerror=failed;
  timer=setTimeout(failed,15000);
  document.head.appendChild(script);
})();
