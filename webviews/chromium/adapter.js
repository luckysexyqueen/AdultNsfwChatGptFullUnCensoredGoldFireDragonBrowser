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
      // Standard Capacitor InAppBrowser is declared in this project's native
      // plugin list. On Android its openInWebView route is a Chromium WebView.
      // It has no named-session API, so never consume a session-bound request.
      const cap = host.Capacitor;
      if (options.sessionId === undefined && plugins && plugins.InAppBrowser &&
          typeof plugins.InAppBrowser.openInWebView === 'function' &&
          cap && typeof cap.getPlatform === 'function' && cap.getPlatform() === 'android') {
        routes.push(() => plugins.InAppBrowser.openInWebView({
          url: options.url,
          options: {
            showToolbar: true, showURL: true, clearCache: false,
            clearSessionCache: false, mediaPlaybackRequiresUserAction: true,
            closeButtonText: '닫기', toolbarPosition: 0,
            showNavigationButtons: true, leftToRight: false,
            customWebViewUserAgent: null,
            android: { allowZoom: true, hardwareBack: true, pauseMedia: true,
              isIsolated: true, successUrlPatterns: [] },
            iOS: { allowOverScroll: true, enableViewportScale: false,
              allowInLineMediaPlayback: false, surpressIncrementalRendering: false,
              viewStyle: 2, animationEffect: 2, allowsBackForwardNavigationGestures: true }
          }
        }));
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
