/* ---------- Watchlist ---------- */
/* Price with thousands separators */
const fmt = s => { const n = (+s.p).toFixed(+s.p > 10 ? 2 : s.dec), [i, d] = n.split('.'); return i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (d ? '.' + d : ''); };
const FLAG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M6 2h2v2h11l-2.5 5 2.5 5H8v8H6z"/></svg>';
let flags = store.get('flags', {}), flt = '';
/* Flag cycle: none -> green -> red -> none */
function toggleFlag(k) {
    const n = { '': 'g', g: 'r', r: '' }[flags[k] || ''];
    if (n)
        flags[k] = n;
    else
        delete flags[k];
    store.set('flags', flags);
    buildView();
    sched();
}
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
