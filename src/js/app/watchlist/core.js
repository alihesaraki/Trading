/* ---------- Watchlist ---------- */
/* Price with thousands separators */
const fmt = s => { const n = (+s.p).toFixed(+s.p > 10 ? Math.min(4, Math.max(2, s.dec)) : s.dec), [i, d] = n.split('.'); return i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (d ? '.' + d : ''); };
const FLAG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M6 2h2v2h11l-2.5 5 2.5 5H8v8H6z"/></svg>';
let flags = store.get('flags', {}), flt = '';
/* Flag colors: picked from a small palette popup (like TradingView), not cycled */
const FLAG_COLORS = [['r', 'Red'], ['g', 'Green']];
function setFlag(k, c) {
    if (c)
        flags[k] = c;
    else
        delete flags[k];
    store.set('flags', flags);
    buildView();
    sched();
}
/* Favorites: a second watchlist view (the star tab next to All). Empty by default; coins are added from the right-click menu. */
let favs = store.get('favs', {});
if (!favs || typeof favs !== 'object' || Array.isArray(favs))
    favs = {};
/* Legacy blue flags become favorites now that the blue-flag category is replaced by the star. */
for (const k of Object.keys(flags)) {
    if (flags[k] === 'b') { favs[k] = 1; delete flags[k]; }
}
store.set('flags', flags);
store.set('favs', favs);
function toggleFav(k) {
    if (favs[k])
        delete favs[k];
    else
        favs[k] = 1;
    store.set('favs', favs);
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
        + `<button class="sw star${favs[k] ? ' on' : ''}" data-c="fav" title="${favs[k] ? 'Remove from favorites' : 'Add to favorites'}"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 2.5l2.9 6.1 6.6.9-4.8 4.6 1.2 6.6L12 17.5l-5.9 3.2 1.2-6.6L2.5 9.5l6.6-.9z"/></svg></button>`
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
        if (b.dataset.c === 'fav') toggleFav(k);
        else setFlag(k, b.dataset.c);
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
