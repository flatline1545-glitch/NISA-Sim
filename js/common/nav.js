(function () {
    const NAV_ITEMS = [
        { name: '📈 新NISA', path: 'index.html' },
        { name: '🛡️ iDeCo', path: 'ideco.html' }
    ];

    function initNav() {
        const nav = document.querySelector('.global-nav');
        if (!nav) return;

        const isInsideGuide = /(?:^|\/|\\)guide(?:$|\/|\\)/i.test(window.location.pathname);
        const currentFileName = window.location.pathname.split('/').pop() || 'index.html';

        const menuHtml = NAV_ITEMS.map(item => {
            let targetHref = item.path;
            if (isInsideGuide) {
                targetHref = item.path.startsWith('guide/')
                    ? item.path.replace(/^guide\//, '')
                    : '../' + item.path;
            }

            let isActive = false;
            if (isInsideGuide) {
                isActive = (item.path === 'guide/' + currentFileName);
            } else {
                isActive = (item.path === currentFileName) || (currentFileName === '' && item.path === 'index.html');
            }

            return `<a href="${targetHref}" class="nav-item ${isActive ? 'active' : ''}">${item.name}</a>`;
        }).join('');

        const logoHref = isInsideGuide ? '../index.html' : 'index.html';

        nav.innerHTML = `
      <div class="nav-inner">
        <a href="${logoHref}" class="nav-logo">⚡ NISA-Sim</a>
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