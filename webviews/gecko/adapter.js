/* GeckoView adapter. Native engine implementation belongs to the host app. */
(function () {
  'use strict';
  const adapters = window.GFDEngineAdapters = window.GFDEngineAdapters || {};
  adapters.gecko = function (hosts, options) {
    const routes = [];
    for (const host of hosts) {
      const custom = host.GoldFireWebViews && host.GoldFireWebViews.gecko;
      if (custom && typeof custom.open === 'function') routes.push(() => custom.open(options));
      const plugins = host.Capacitor && host.Capacitor.Plugins;
      if (plugins && plugins.GeckoView && typeof plugins.GeckoView.open === 'function') {
        routes.push(() => plugins.GeckoView.open(options));
      }
    }
    return routes;
  };
})();
