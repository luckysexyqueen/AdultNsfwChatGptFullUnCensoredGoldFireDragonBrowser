/* GoldFireDragon — universal in-app browser navigation layer.
 * Keeps normal HTTP(S) navigation inside the application's WebView/Electron window.
 * No external browser is opened for ordinary web navigation.
 */
(function () {
  'use strict';

  function isWebUrl(url) {
    try {
      const u = new URL(String(url || ''), window.location.href);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch (_) {
      return false;
    }
  }

  function open(url) {
    if (!url) return null;
    const target = new URL(String(url), window.location.href).href;
    if (isWebUrl(target)) {
      window.location.assign(target);
      return target;
    }
    // Non-web schemes are intentionally not routed through the webview.
    return null;
  }

  window.GFDInAppBrowser = Object.freeze({ open, isWebUrl });

  // Replace popup-style navigation with same-window navigation.
  const nativeOpen = window.open;
  window.open = function (url) {
    if (isWebUrl(url)) return open(url);
    return nativeOpen ? nativeOpen.apply(window, arguments) : null;
  };

  // Force ordinary target=_blank web links back into this app window.
  document.addEventListener('click', function (event) {
    const anchor = event.target && event.target.closest ? event.target.closest('a[href]') : null;
    if (!anchor) return;
    const href = anchor.getAttribute('href');
    if (!href || !isWebUrl(href)) return;
    if (anchor.target === '_blank' || anchor.target === '_new' || anchor.target === '_external') {
      event.preventDefault();
      event.stopPropagation();
      open(href);
    }
  }, true);

  // Make dynamically-created target=_blank links in the current document internal too.
  const normalizeTargets = () => {
    document.querySelectorAll('a[target="_blank"],a[target="_new"],a[target="_external"]').forEach((a) => {
      if (isWebUrl(a.href)) a.target = '_self';
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', normalizeTargets, { once: true });
  else normalizeTargets();
  new MutationObserver(normalizeTargets).observe(document.documentElement, { childList: true, subtree: true });
})();
