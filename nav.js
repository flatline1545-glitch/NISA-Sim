(function() {
  // メニュー項目一覧（増やしたい時はここに追加するだけ）
  const NAV_ITEMS = [
    { name: '📈 新NISA', href: 'index.html' },
    { name: '🛡️ iDeCo', href: 'ideco.html' },
    { name: '📚 初心者ガイド', href: 'guide.html' }
  ];

  function initNav() {
    const nav = document.querySelector('.global-nav');
    if (!nav) return;

    // 現在のファイル名を取得してアクティブ判定
    let currentPath = window.location.pathname.split('/').pop() || 'index.html';
    if (!currentPath.endsWith('.html')) currentPath = 'index.html';

    const menuHtml = NAV_ITEMS.map(item => {
      const isActive = (item.href === currentPath) || (currentPath === '' && item.href === 'index.html');
      return `<a href="${item.href}" class="nav-item ${isActive ? 'active' : ''}">${item.name}</a>`;
    }).join('');

    nav.innerHTML = `
      <div class="nav-inner">
        <a href="index.html" class="nav-logo">⚡ NISA-Sim</a>
        <button class="nav-toggle" id="navToggle" aria-label="メニュー開閉">☰</button>
        <div class="nav-menu" id="navMenu">
          ${menuHtml}
        </div>
      </div>
    `;

    // スマホ用ハンバーガーメニューの開閉イベント
    const toggleBtn = document.getElementById('navToggle');
    const menuEl = document.getElementById('navMenu');
    if (toggleBtn && menuEl) {
      toggleBtn.onclick = () => menuEl.classList.toggle('open');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNav);
  } else {
    initNav();
  }
})();