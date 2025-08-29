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

    var links = [
      { href: 'index.html', label: 'Home' },
      { href: 'experiments.html', label: 'Experiments' },
      { href: 'music.html', label: 'Music' },
      { href: 'bio.html', label: 'About Me' },
      { href: 'type-quest.html', label: 'Games' },
      { href: 'perfect-pitch.html', label: 'Perfect Pitch' }
    ];

    // Normalize current path for index route
    var here = (location.pathname || '').split('/').pop() || 'index.html';
    if (here === '') here = 'index.html';

    var ul = document.createElement('ul');
    ul.setAttribute('role', 'list');

    links.forEach(function(item){
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = item.href;
      a.textContent = item.label;
      // mark current page for a11y; sites may add styles for [aria-current]
      if (here === item.href) a.setAttribute('aria-current', 'page');
      li.appendChild(a);
      ul.appendChild(li);
    });

    // Clear any fallback and insert fresh list
    nav.innerHTML = '';
    nav.appendChild(ul);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildNav);
  } else {
    buildNav();
  }
})();

