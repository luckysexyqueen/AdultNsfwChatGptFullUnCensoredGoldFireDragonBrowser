/* Chromium WebView adapter; independent from the GeckoView adapter. */
(function () {
  'use strict';
  const adapters = window.GFDEngineAdapters = window.GFDEngineAdapters || {};
  adapters.chromium = function (hosts, options) {
    const routes = [];
    for (const host of hosts) {
      const custom = host.GoldFireWebViews && host.GoldFireWebViews.chromium;
      if (custom && typeof custom.open === 'function') routes.push(() => custom.open(options));
      const plugins = host.Capacitor && host.Capacitor.Plugins;
      if (plugins && plugins.ChromiumWebView && typeof plugins.ChromiumWebView.open === 'function') {
        routes.push(() => plugins.ChromiumWebView.open(options));
      }
      const native = host.GoldFireNative;
      // Only explicitly identified Chromium hosts may satisfy a Chromium request.
      // Legacy untyped bridges remain available through auto mode in the router.
      if (native && native.engine === 'chromium' && typeof native.inAppOpen === 'function') {
        routes.push(() => native.inAppOpen(options.url, options));
      }
    }
    return routes;
  };
})();
