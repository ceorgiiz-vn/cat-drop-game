// Viewport sizing — fills any screen while keeping 9:16 game aspect (Fold, split-screen, tablets)
(function () {
    const DESIGN_W = 720;
    const DESIGN_H = 1280;
    const ASPECT = DESIGN_W / DESIGN_H;

    function setAppSize() {
        const vv = window.visualViewport;
        const w = Math.round(vv ? vv.width : window.innerWidth);
        const h = Math.round(vv ? vv.height : window.innerHeight);

        document.documentElement.style.setProperty('--app-width', `${w}px`);
        document.documentElement.style.setProperty('--app-height', `${h}px`);

        const viewportAspect = w / h;
        let gw, gh;
        if (viewportAspect >= ASPECT) {
            gh = h;
            gw = h * ASPECT;
        } else {
            gw = w;
            gh = w / ASPECT;
        }

        document.documentElement.style.setProperty('--gw', `${gw}px`);
        document.documentElement.style.setProperty('--gh', `${gh}px`);
        document.documentElement.style.setProperty('--gs', String(gw / DESIGN_W));

        const rotHint = document.getElementById('rotate-hint');
        if (rotHint) {
            // Phone/tablet landscape only — not desktop browser windows
            const landscape = w > h;
            const shortViewport = h < 520;
            const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
            const narrowWindow = w < 960;
            rotHint.classList.toggle('visible', landscape && shortViewport && (coarsePointer || narrowWindow));
        }
    }

    window.addEventListener('resize', setAppSize);
    window.addEventListener('orientationchange', setAppSize);
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', setAppSize);
        window.visualViewport.addEventListener('scroll', setAppSize);
    }
    setAppSize();
})();
