/* ---------- Toolbar ---------- */
$('tfs').innerHTML = Object.keys(TFS).map(t => `<button data-t="${t}" class="${TFS[t] === tf ? 'on' : ''}">${t}</button>`).join('');
/* Phones: one timeframe button (shows the active timeframe) that opens a picker with every timeframe. */
const btnTf = $('btnTf'), tfMenu = $('tfmenu');
const tfName = () => Object.keys(TFS).find(k => TFS[k] === tf) || tf;
function syncTfUi() {
    const n = tfName();
    [...$('tfs').children].forEach(b => b.classList.toggle('on', b.dataset.t === n));
    btnTf.innerHTML = `<span>${n}</span><svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true"><path d="M3.5 6 8 10.5 12.5 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    tfMenu.innerHTML = Object.keys(TFS).map(t => `<button type="button" role="menuitemradio" data-t="${t}" aria-checked="${t === n}" class="${t === n ? 'on' : ''}">${t}</button>`).join('');
}
function closeTfMenu() { tfMenu.hidden = true; btnTf.setAttribute('aria-expanded', 'false'); }
function pickTf(t) {
    if (!t || TFS[t] === tf) return;
    tf = TFS[t];
    store.set(SAVED_TIMEFRAME_KEY, tf);
    syncTfUi();
    // Keep the active timeframe visible in the horizontally scrollable toolbar.
    $('tfs').querySelector('button.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
    resetState();
    loadChart();
    syncWS();
    header();
}
$('tfs').onclick = e => pickTf(e.target.dataset.t);
tfMenu.onclick = e => { const b = e.target.closest('button[data-t]'); if (!b) return; closeTfMenu(); pickTf(b.dataset.t); };
btnTf.onclick = e => {
    e.stopPropagation();
    if (!tfMenu.hidden) return closeTfMenu();
    const r = btnTf.getBoundingClientRect();
    tfMenu.hidden = false;
    tfMenu.style.top = Math.round(r.bottom + 6) + 'px';
    tfMenu.style.left = Math.max(6, Math.min(Math.round(r.left), innerWidth - tfMenu.offsetWidth - 6)) + 'px';
    btnTf.setAttribute('aria-expanded', 'true');
};
document.addEventListener('pointerdown', e => { if (!tfMenu.hidden && !tfMenu.contains(e.target) && !btnTf.contains(e.target)) closeTfMenu(); });
addEventListener('keydown', e => { if (e.key === 'Escape') closeTfMenu(); });
addEventListener('resize', closeTfMenu);
syncTfUi();
/* Clear everything tied to the current symbol/timeframe (current data goes to the cache first) */
function resetState() {
    window.RP && RP.beforeSwitch(); /* un-hide replayed candles so the cache keeps the full list */
    stash();
    tok++;
    loadTry = 0; /* new symbol / timeframe: start the retry back-off from the beginning */
    $('ld').textContent = 'Loading history…';
    ctl && ctl.abort();
    setBars([]);
    fut.setData([]);
    data = [];
    noMore = false;
    loadingOld = false;
    lastClose = null;
    closeAt = 0;
    pend = null;
    curKey = '';
    window.IND && IND.clear();
}
