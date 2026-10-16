/* Custom host facade: one bridge can control both native WebView engines. */
(function () {
  'use strict';
  const adapters = window.GFDEngineAdapters = window.GFDEngineAdapters || {};
  adapters.custom = function (hosts, options, engine) {
    const routes = [];
    for (const host of hosts) {
      const custom = host.GoldFireWebViews && host.GoldFireWebViews.custom;
      if (custom && typeof custom.open === 'function') {
        routes.push(() => custom.open(Object.assign({}, options, { engine })));
      }
    }
    return routes;
  };
})();
