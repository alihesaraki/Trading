/* ---------- Mobile navigation: bottom tab bar (Watchlist / Chart / Draw) ----------
   Phones show one page at a time. The tab bar is only displayed by the mobile CSS layout;
   on desktop it is hidden and the classes set here have no visual effect. */
const mnav = $('mnav');
if (mnav) {
    let mView = 'chart', mTools = store.get('mobileTools', false);
    const mobileNavOn = () => getComputedStyle(mnav).display !== 'none';
    function applyMobileView() {
        const toolsOn = mTools && mView === 'chart';
        document.body.classList.toggle('mview-watch', mView === 'watch');
        document.body.classList.toggle('m-tools', toolsOn);
        mnav.querySelectorAll('button').forEach(b => {
            const k = b.dataset.view, on = k === 'draw' ? toolsOn : k === mView;
            b.classList.toggle('on', on);
            b.setAttribute('aria-pressed', String(on));
        });
        requestAnimationFrame(() => sched());
    }
    mnav.addEventListener('click', e => {
        const b = e.target.closest('button[data-view]');
        if (!b)
            return;
        if (b.dataset.view === 'draw') {
            mTools = mView === 'watch' ? true : !mTools;
            mView = 'chart';
            store.set('mobileTools', mTools);
        }
        else
            mView = b.dataset.view;
        applyMobileView();
    });
    /* Picking a coin in the watchlist jumps to the chart (select() itself already ran) */
    $('list').addEventListener('click', e => {
        if (!mobileNavOn() || Date.now() < noClick || e.target.closest('.sec,.fl,.row-remove,.sni'))
            return;
        if (e.target.closest('.row')) {
            mView = 'chart';
            applyMobileView();
        }
    });
    applyMobileView();
}
