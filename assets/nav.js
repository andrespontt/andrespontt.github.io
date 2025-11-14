/**
 * Shared site navigation
 * Usage in each page:
 *   <nav id="site-nav"></nav>
 *   <script src="assets/nav.js" defer></script>
 */
(function(){
  function buildNav(){
    var nav = document.getElementById('site-nav');
    if (!nav) return;

    // Determine where we are (root, pages/, apps/)
    var path = (location.pathname || '/').replace(/\\+/g,'/');
    var parts = path.split('/').filter(Boolean);
    var dir = parts.length > 1 ? parts[parts.length-2] : '';
    var scope = (dir === 'pages') ? 'pages' : (dir === 'apps' ? 'apps' : 'root');

    function toHome(){ return scope === 'root' ? 'index.html' : '../index.html'; }
    function toPage(file){
      if (scope === 'root') return 'pages/' + file;
      if (scope === 'pages') return file;
      return '../pages/' + file; // from apps
    }
    function toApp(file){
      if (scope === 'root') return 'apps/' + file;
      if (scope === 'pages') return '../apps/' + file;
      return file; // already in apps
    }
    function toAppsIndex(){
      if (scope === 'root') return 'apps/index.html';
      if (scope === 'pages') return '../apps/index.html';
      return 'index.html'; // already in apps
    }

    var links = [
      { href: toHome(), label: 'Home', key: 'home' },
      { href: toPage('experiments.html'), label: 'Experiments', key: 'experiments' },
      { href: toPage('music.html'), label: 'Music', key: 'music' },
      { href: toPage('bio.html'), label: 'About Me', key: 'bio' },
      { href: toAppsIndex(), label: 'Apps', key: 'apps' }
    ];

    // Determine current file to set aria-current
    var here = parts[parts.length-1] || 'index.html';
    var isInApps = scope === 'apps';

    var ul = document.createElement('ul');
    ul.setAttribute('role', 'list');

    links.forEach(function(item){
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = item.href;
      a.textContent = item.label;
      // For current page highlighting
      var target = item.href.split('/').pop();
      if (item.key === 'apps') {
        // Apps link is current if we're in apps directory and on index.html
        if (isInApps && here === 'index.html') {
          a.setAttribute('aria-current', 'page');
        }
      } else if (here === target) {
        a.setAttribute('aria-current', 'page');
      }
      li.appendChild(a);
      ul.appendChild(li);
    });

    // Clear any fallback and insert fresh list
    nav.innerHTML = '';
    nav.appendChild(ul);
  }

  function init(){
    buildNav();
    try {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js');
      }
    } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
