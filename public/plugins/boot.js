(function () {
  'use strict';
  if (window.GFDPluginsReady) return;
  const base = new URL('.', document.currentScript.src);
  const fallback = Object.freeze({ list: () => [], setEnabled: () => false, extendInstructions: value => value || '' });
  window.GFDPlugins = fallback;
  window.GFDPluginsReady = import(new URL('runtime.mjs', base).href).then(async runtime => {
    let storage;
    try { storage = window.localStorage; } catch { /* unavailable */ }
    return runtime.loadRegistry(new URL('registry.json', base).href, { storage });
  }).catch(() => fallback).then(manager => {
    window.GFDPlugins = manager;
    window.dispatchEvent(new CustomEvent('gfd:plugins-ready'));
    mount(manager);
    return manager;
  });
  function mount(manager) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => mount(manager), { once: true });
      return;
    }
    if (document.getElementById('gfd-plugin-controls')) return;
    // A separate shadow root survives the existing app's repeated innerHTML renders.
    const host = document.createElement('aside');
    host.id = 'gfd-plugin-controls';
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = ':host{position:fixed;right:12px;bottom:72px;z-index:1000;font:14px system-ui;color:#eee}details{background:#202528;border:1px solid #607078;border-radius:12px;padding:10px;max-width:min(340px,85vw)}summary{cursor:pointer}section{max-height:50vh;overflow:auto}article{border-top:1px solid #607078;margin-top:10px;padding-top:10px}p{font-size:12px;line-height:1.5}label{display:block;padding:8px 0}input{margin-right:8px}';
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    const section = document.createElement('section');
    details.append(summary, section);
    function render() {
      const plugins = manager.list();
      summary.textContent = `플러그인 ${plugins.length}개`;
      section.replaceChildren();
      const note = document.createElement('p');
      note.textContent = plugins.length ? '플러그인은 자동 등록됩니다. 추가 채팅 지침은 직접 켜세요. 서버 도구는 별도 연결이 필요합니다.' : '플러그인 목록을 불러오지 못했습니다. 기존 기능은 계속 사용할 수 있습니다.';
      section.append(note);
      for (const plugin of plugins) {
        const article = document.createElement('article');
        const title = document.createElement('strong');
        title.textContent = `${plugin.name} (${plugin.version})`;
        const description = document.createElement('p');
        description.textContent = plugin.description;
        article.append(title, description);
        if (plugin.context) {
          const label = document.createElement('label');
          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.checked = plugin.enabled;
          checkbox.addEventListener('change', () => {
            manager.setEnabled(plugin.id, checkbox.checked);
            window.dispatchEvent(new CustomEvent('gfd:plugins-changed'));
          });
          label.append(checkbox, document.createTextNode('추가 채팅 지침 적용'));
          const preview = document.createElement('p');
          preview.textContent = plugin.context;
          article.append(label, preview);
        }
        section.append(article);
      }
    }
    render();
    shadow.append(style, details);
    document.documentElement.append(host);
  }
})();
