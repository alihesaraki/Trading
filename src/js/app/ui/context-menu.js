/* ---------- Context menu (shared by chart and watchlist) ---------- */
const ctx = $('ctx');
let ctxFn = [];
function showMenu(x, y, items) {
    ctxFn = items.map(i => i[1]);
    ctx.innerHTML = items.map((i, n) => `<button data-n="${n}">${i[0]}</button>`).join('');
    ctx.hidden = false;
    ctx.style.left = Math.max(0, Math.min(x, innerWidth - ctx.offsetWidth - 4)) + 'px';
    ctx.style.top = Math.max(0, Math.min(y, innerHeight - ctx.offsetHeight - 4)) + 'px';
}
ctx.onclick = e => {
    const b = e.target.closest('button');
    if (!b)
        return;
    const f = ctxFn[+b.dataset.n];
    ctx.hidden = true;
    f && f();
};
document.addEventListener('pointerdown', e => {
    if (!ctx.contains(e.target))
        ctx.hidden = true;
}, true);
document.addEventListener('keydown', e => {
    if (e.key === 'Escape')
        ctx.hidden = true;
});
addEventListener('blur', () => { ctx.hidden = true; });
addEventListener('wheel', () => { ctx.hidden = true; }, { passive: true });
/* Copy text to the clipboard (with a fallback for non-secure contexts) */
function copyText(t) {
    const fb = () => {
        const a = document.createElement('textarea');
        a.value = t;
        a.style.cssText = 'position:fixed;opacity:0';
        document.body.appendChild(a);
        a.select();
        try {
            document.execCommand('copy');
        }
        catch (_) { }
        a.remove();
    };
    if (navigator.clipboard && navigator.clipboard.writeText)
        navigator.clipboard.writeText(t).catch(fb);
    else
        fb();
}
/* Chart right-click: reset chart / copy the price under the cursor */
$('cw').addEventListener('contextmenu', e => {
    if (e.target.closest('#lg,#iset'))
        return; /* keep native menu on indicator legend / settings */
    e.preventDefault();
    const p = series.coordinateToPrice(e.clientY - $('chart').getBoundingClientRect().top);
    const items = [];
    items.push(['Reset chart', () => resetChartView()]);
    if (p != null) {
        const t = p.toFixed(map[sym] ? map[sym].dec : 2);
        items.push([`Copy price ${t}`, () => copyText(t)]);
    }
    items.push(['Settings…', () => setTimeout(openCandleSet, 0)]);
    showMenu(e.clientX, e.clientY, items);
});
