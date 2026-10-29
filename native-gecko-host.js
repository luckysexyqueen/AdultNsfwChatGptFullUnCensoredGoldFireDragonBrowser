(function () {
  'use strict';
  if (location.origin !== 'http://127.0.0.1:18735') return;
  const open = function (options) {
    const url = new URL(options.url, location.href);
    if (!['http:', 'https:'].includes(url.protocol)) return Promise.reject(new Error('지원하지 않는 주소'));
    document.dispatchEvent(new CustomEvent('gfd-native-open', { detail: url.href }));
    return Promise.resolve({ opened: true, engine: 'gecko' });
  };
  window.GoldFireWebViews = { gecko: { open } };
  window.GoldFireNative = { engine: 'gecko', inAppOpen: url => open({ url }) };
})();