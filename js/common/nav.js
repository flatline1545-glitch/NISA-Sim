// グローバル開閉関数（重複発火を防止）
window.toggleNavMenu = function(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  const menuEl = document.getElementById('navMenu');
  if (menuEl) {
    menuEl.classList.toggle('open');
  }
};

(function() {
  const NAV_ITEMS = [
    { name: '📈 新NISA', href: 'index.html' },
    { name: '🛡️ iDeCo', href: 'ideco.html' },
    { name: '📚 初心者ガイド', href: 'guide.html' }
  ];

  function initNav() {
    const nav = document.querySelector('.global-nav');
    if (!nav) return;

    let currentPath = window.location.pathname.split('/').pop() || 'index.html';
    if (!currentPath.endsWith('.html')) currentPath = 'index.html';

    const menuHtml = NAV_ITEMS.map(item => {
      const isActive = (item.href === currentPath) || (currentPath === '' && item.href === 'index.html');
      return `<a href="${item.href}" class="nav-item ${isActive ? 'active' : ''}">${item.name}</a>`;
    }).join('');

    nav.innerHTML = `
      <div class="nav-inner">
        <a href="index.html" class="nav-logo">⚡ NISA-Sim</a>
        <button class="nav-toggle" id="navToggle" onclick="window.toggleNavMenu(event)" aria-label="メニュー開閉">☰</button>
        <div class="nav-menu" id="navMenu">
          ${menuHtml}
        </div>
      </div>
    `;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNav);
  } else {
    initNav();
  }
})();