/**
 * Shared site navigation
 * Usage in each page:
 *   <nav id="site-nav"></nav>
 *   <script src="assets/nav.js" defer></script>
 */
(function(){
  function setupPullToRefresh(){
    if (!('ontouchstart' in window) || window.__apPullToRefreshReady) return;
    window.__apPullToRefreshReady = true;

    var threshold = 82;
    var maxPull = 120;
    var startY = 0;
    var startScrollTop = 0;
    var pull = 0;
    var pulling = false;
    var indicator = document.createElement('div');

    indicator.className = 'pull-refresh-indicator';
    indicator.setAttribute('aria-hidden', 'true');
    indicator.textContent = 'Pull to refresh';
    document.body.appendChild(indicator);

    function getScrollTop(){
      var scroller = document.scrollingElement || document.documentElement || document.body;
      return Math.max(window.pageYOffset || 0, window.scrollY || 0, scroller.scrollTop || 0, document.body.scrollTop || 0);
    }

    function canStart(target){
      return getScrollTop() <= 1 &&
        target.closest &&
        !target.closest('input, textarea, select, button, a, [data-no-pull-refresh]');
    }

    function setPull(distance){
      pull = Math.min(maxPull, Math.max(0, distance));
      indicator.style.setProperty('--pull-progress', String(Math.min(1, pull / threshold)));
      document.body.style.setProperty('--pull-distance', Math.round(pull) + 'px');
      indicator.textContent = pull >= threshold ? 'Release to refresh' : 'Pull to refresh';
      document.body.classList.toggle('is-pulling-refresh', pull > 0);
    }

    window.addEventListener('touchstart', function(event){
      if (event.touches.length !== 1 || !canStart(event.target)) return;
      startY = event.touches[0].clientY;
      startScrollTop = getScrollTop();
      pulling = true;
      setPull(0);
    }, { passive: true });

    window.addEventListener('touchmove', function(event){
      if (!pulling || event.touches.length !== 1) return;
      if (startScrollTop > 1 || getScrollTop() > 1) {
        pulling = false;
        setPull(0);
        document.body.classList.remove('is-pulling-refresh');
        document.body.style.removeProperty('--pull-distance');
        return;
      }
      var distance = event.touches[0].clientY - startY;
      if (distance <= 0) {
        setPull(0);
        return;
      }
      event.preventDefault();
      setPull(distance * 0.72);
    }, { passive: false });

    window.addEventListener('touchend', function(){
      if (!pulling) return;
      pulling = false;
      if (pull >= threshold) {
        indicator.textContent = 'Refreshing...';
        indicator.classList.add('is-refreshing');
        document.body.style.setProperty('--pull-distance', '82px');
        window.location.reload();
        return;
      }
      setPull(0);
      document.body.classList.remove('is-pulling-refresh');
      document.body.style.removeProperty('--pull-distance');
    }, { passive: true });

    window.addEventListener('touchcancel', function(){
      pulling = false;
      setPull(0);
      document.body.classList.remove('is-pulling-refresh');
      document.body.style.removeProperty('--pull-distance');
    }, { passive: true });
  }

  function buildNav(){
    var nav = document.getElementById('site-nav');
    if (!nav) return;

    // Determine where we are (root, pages/, apps/)
    var path = (location.pathname || '/').replace(/\\+/g,'/');
    var parts = path.split('/').filter(Boolean);
    var dir = parts.length > 1 ? parts[parts.length-2] : '';
    var scope = (dir === 'pages') ? 'pages' : (dir === 'apps' ? 'apps' : 'root');

    function toHome(){ return scope === 'root' ? 'index.html' : '../index.html'; }
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
    setupPullToRefresh();
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
