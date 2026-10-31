/* ---------- Watchlist columns: drag the dividers in the header to resize Symbol / Last / Chg% ----------
   Widths are kept as proportions of the panel (CSS vars --c1..--c3), so they scale when the panel is resized.
   Dragging a divider moves space between its two neighbours; double-click a divider to reset. */
const CW0 = [1, 1, 1], CMIN = 52;
let cw = store.get('cw2', CW0), cr = null;
if (!Array.isArray(cw) || cw.length !== 3 || !cw.every(v => v > 0))
    cw = CW0.slice();
const applyCols = () => cw.forEach((v, i) => document.documentElement.style.setProperty('--c' + (i + 1), v + 'fr'));
applyCols();
$('cols').addEventListener('pointerdown', e => {
    const h = e.target.closest('.gr');
    if (!h || e.button)
        return;
    e.preventDefault();
    cr = { i: +h.dataset.i, x: e.clientX, h, ws: [...$('cols').children].slice(1).map(c => c.getBoundingClientRect().width) }; /* current pixel widths */
    try {
        h.setPointerCapture(e.pointerId);
    }
    catch (_) { }
    h.classList.add('on');
    document.body.classList.add('crs');
});
$('cols').addEventListener('pointermove', e => {
    if (!cr)
        return;
    const { i, ws } = cr, tot = ws[i] + ws[i + 1];
    if (tot < 2 * CMIN)
        return;
    const a = clamp(ws[i] + e.clientX - cr.x, CMIN, tot - CMIN);
    cw = ws.slice();
    cw[i] = a;
    cw[i + 1] = tot - a;
    cw = cw.map(v => Math.round(v * 10) / 10);
    applyCols();
});
const crEnd = () => {
    if (!cr)
        return;
    cr.h.classList.remove('on');
    cr = null;
    document.body.classList.remove('crs');
    store.set('cw2', cw);
};
$('cols').addEventListener('pointerup', crEnd);
$('cols').addEventListener('pointercancel', crEnd);
$('cols').addEventListener('dblclick', e => {
    if (e.target.closest('.gr')) {
        cw = CW0.slice();
        applyCols();
        store.set('cw2', cw);
    }
});

/* The list's scrollbar narrows the rows but not the header. Reserve the same width in the header (--sbw)
   so every header label, e.g. "Chg%", sits exactly above the values below it. */
const syncSbw = () => { const l = $('list'); document.documentElement.style.setProperty('--sbw', Math.max(0, l.offsetWidth - l.clientWidth) + 'px'); };
new ResizeObserver(syncSbw).observe($('list'));
syncSbw();
