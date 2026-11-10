(function () {
  'use strict';
  const button = document.getElementById('gfd-custom-search-btn');
  if (!button) return;
  button.addEventListener('click', function (event) {
    event.preventDefault();
    const input = document.getElementById('search-input');
    const query = input ? input.value.trim() : '';
    const destination = new URL(query ? './google-custom-search-engine/search-result.html' : './google-custom-search-engine/index.html', location.href);
    if(query) destination.searchParams.set('q',query);
    location.assign(destination.href);
  });
})();
