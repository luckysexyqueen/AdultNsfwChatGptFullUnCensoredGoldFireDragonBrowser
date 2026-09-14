(() => {
  const hideLoading = () => {
    const loading = document.getElementById('loading-screen');
    if (loading && !loading.classList.contains('hidden')) {
      loading.classList.add('hidden');
      loading.setAttribute('aria-hidden', 'true');
    }
  };
  const start = () => {
    window.setTimeout(hideLoading, 3000);
    const timer = window.setInterval(() => {
      hideLoading();
      if (window.__bootReady) window.clearInterval(timer);
    }, 1000);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
