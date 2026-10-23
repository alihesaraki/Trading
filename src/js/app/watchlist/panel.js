/* ---------- Watchlist panel: drag to resize, button to move it to the other side ---------- */
const side = $('side'), rs = $('rs');
let sw = store.get('sw2', 0), /* 0 = default: a quarter of the window */ sh = store.get('sh', 0), sf = store.get('sf', false), drag = false;
const watchToggle = $('btnWatch');
let watchHidden = store.get('watchlistHidden', false);
function applyWatchlistVisibility() {
    document.body.classList.toggle('watchlist-hidden', watchHidden);
    if (watchToggle) {
        watchToggle.title = watchHidden ? 'Show watchlist' : 'Hide watchlist';
        watchToggle.setAttribute('aria-label', watchHidden ? 'Show watchlist' : 'Hide watchlist');
        watchToggle.setAttribute('aria-pressed', String(!watchHidden)); /* pressed = watchlist is shown */
    }
}
if (watchToggle) {
    watchToggle.addEventListener('click', () => {
        watchHidden = !watchHidden;
        store.set('watchlistHidden', watchHidden);
        applyWatchlistVisibility();
        requestAnimationFrame(() => {
            if (typeof sched === 'function') sched();
        });
    });
}
applyWatchlistVisibility();
const narrow = () => innerWidth <= 820; /* narrow screens: panel sits below the chart, resize changes its height */
function applySide() {
    document.body.classList.toggle('flip', sf);
    side.style.width = narrow() ? '' : clamp(sw || innerWidth * .25, 300, Math.max(300, innerWidth * .7)) + 'px';
    side.style.height = narrow() && sh ? clamp(sh, 160, innerHeight - 200) + 'px' : '';
}
rs.onpointerdown = e => { rs.setPointerCapture(e.pointerId); drag = true; document.body.classList.add('drag'); };
rs.onpointermove = e => {
    if (!drag)
        return;
    if (narrow())
        sh = innerHeight - e.clientY;
    else
        sw = sf ? e.clientX : innerWidth - e.clientX;
    applySide();
};
rs.onpointerup = rs.onpointercancel = () => {
    if (!drag)
        return;
    drag = false;
    document.body.classList.remove('drag');
    store.set('sw2', sw);
    store.set('sh', sh);
    sched();
};
$('mv').onclick = () => { sf = !sf; store.set('sf', sf); applySide(); };
addEventListener('resize', () => { applySide(); sched(); });
applySide();
