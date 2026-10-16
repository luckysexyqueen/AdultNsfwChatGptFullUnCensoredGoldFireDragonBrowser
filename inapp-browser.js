/* Shared Gecko-first adapter; classic script for file:// APK shells. */
(function () {
  'use strict';
  if (window.GFDInAppBrowser) return;
  function resolve(value) {
    try {
      if (typeof value !== 'string' || !value.trim()) return null;
      return new URL(value, document.baseURI || window.location.href);
    } catch (_) { return null; }
  }
  function isWebUrl(value) {
    const url = resolve(value);
    return !!url && /^(https?:)$/.test(url.protocol);
  }
  function hosts() {
    const result = [window];
    try {
      if (window.parent !== window && window.parent.document) result.push(window.parent);
    } catch (_) { /* Cross-origin parent: no bridge access. */ }
    return result;
  }
  async function open(value) {
    const url = resolve(value);
    if (!url || !isWebUrl(url.href)) return null;
    const owners = hosts();
    const candidates = [];
    // Search all accessible hosts for Gecko before any generic native adapter.
    for (const host of owners) {
      const plugins = host.Capacitor && host.Capacitor.Plugins;
      if (plugins && plugins.GeckoView && typeof plugins.GeckoView.open === 'function') {
        candidates.push(() => plugins.GeckoView.open({ url: url.href }));
      }
    }
    for (const host of owners) {
      const native = host.GoldFireNative;
      if (native && typeof native.inAppOpen === 'function') candidates.push(() => native.inAppOpen(url.href));
      const plugins = host.Capacitor && host.Capacitor.Plugins;
      if (plugins && plugins.GoldFireInAppBrowser && typeof plugins.GoldFireInAppBrowser.open === 'function') {
        candidates.push(() => plugins.GoldFireInAppBrowser.open({ url: url.href }));
      }
    }
    for (const invoke of candidates) {
      try {
        const result = await invoke();
        if (result === false || (result && (result.opened === false || result.error))) continue;
        return url.href;
      } catch (error) {
        console.warn('[GFD navigation] Native route failed:', error && error.message);
      }
    }
    // Search sites can reject iframe embedding. Use the accessible shell window.
    // This fallback uses the wrapper's engine; it cannot install Gecko itself.
    owners[owners.length - 1].location.assign(url.href);
    return url.href;
  }
  window.GFDInAppBrowser = Object.freeze({ open, isWebUrl });
  const originalOpen = window.open;
  window.open = function (value, target) {
    const url = resolve(value);
    const local = url && /^(file:|capacitor:|app:)$/.test(url.protocol) &&
      new URL('.', url).href === new URL('.', window.location.href).href;
    if (url && isWebUrl(url.href)) {
      if (target && !/^_(blank|new|external)$/i.test(target)) {
        return originalOpen ? originalOpen.apply(window, arguments) : null;
      }
      void open(url.href);
      return null;
    }
    if (local) { window.location.assign(url.href); return null; }
    return originalOpen ? originalOpen.apply(window, arguments) : null;
  };
  document.addEventListener('click', function (event) {
    if (event.defaultPrevented || event.button > 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const node = event.target && (event.target.closest ? event.target : event.target.parentElement);
    const anchor = node && node.closest('a[href]');
    if (!anchor || anchor.hasAttribute('download')) return;
    const href = anchor.getAttribute('href');
    if (!href || href.charAt(0) === '#' || !isWebUrl(href)) return;
    if (!/^_(blank|new|external)$/i.test(anchor.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void open(anchor.href);
  }, true);
})();
