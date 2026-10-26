/* ---------- Watchlist ---------- */
/* Price with thousands separators */
const fmt = s => { const n = (+s.p).toFixed(+s.p > 10 ? 2 : s.dec), [i, d] = n.split('.'); return i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (d ? '.' + d : ''); };
const FLAG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M6 2h2v2h11l-2.5 5 2.5 5H8v8H6z"/></svg>';
let flags = store.get('flags', {}), flt = '';
/* Flag colors: picked from a small palette popup (like TradingView), not cycled */
const FLAG_COLORS = [['r', 'Red'], ['g', 'Green'], ['b', 'Blue']];
function setFlag(k, c) {
    if (c)
        flags[k] = c;
    else
        delete flags[k];
    store.set('flags', flags);
    buildView();
    sched();
}
let flPick = null;
function closeFlagPicker() {
    if (flPick) {
        flPick.remove();
        flPick = null;
    }
}
function toggleFlag(k, anchor) {
    closeFlagPicker();
    const el = document.createElement('div');
    el.id = 'flpick';
    el.innerHTML = FLAG_COLORS.map(([c, n]) => `<button class="sw ${c}${flags[k] === c ? ' on' : ''}" data-c="${c}" title="${n}">${FLAG}</button>`).join('')
        + `<button class="sw x" data-c="" title="Remove flag">&#10005;</button>`;
    document.body.appendChild(el);
    const r = anchor.getBoundingClientRect();
    el.style.left = Math.max(4, Math.min(r.left, innerWidth - el.offsetWidth - 4)) + 'px';
    el.style.top = Math.max(4, Math.min(r.bottom + 4, innerHeight - el.offsetHeight - 4)) + 'px';
    el.onclick = e => {
        const b = e.target.closest('button');
        if (!b)
            return;
        closeFlagPicker();
        setFlag(k, b.dataset.c);
    };
    flPick = el;
}
document.addEventListener('pointerdown', e => {
    if (flPick && !flPick.contains(e.target))
        closeFlagPicker();
}, true);
document.addEventListener('keydown', e => { if (e.key === 'Escape')
    closeFlagPicker(); });
addEventListener('wheel', closeFlagPicker, { passive: true });
addEventListener('blur', closeFlagPicker);
$('flt').onclick = e => {
    const b = e.target.closest('button');
    if (!b)
        return;
    flt = b.dataset.f;
    [...$('flt').children].forEach(x => x.classList.toggle('on', x === b));
    buildView();
    $('list').scrollTop = 0;
    sched();
};
