/* ---------- Multi-chart: pane mode ----------
   A pane is this same app running inside an iframe of the main page (index.html?pane=N). It has its own chart, indicators, drawings,
   replay and live stream, but no watchlist and no top bar: the main page drives it (coin, timeframe, indicators, drawing toolbar).
   Everything below is inert on the main page (PANE = 0). */
let paneTries = 0, paneT = 0;
/* the coin table (decimals, prices) is the main page's; panes share its entries instead of downloading the 24h list again */
function paneCopyMap() {
    let pm = null;
    try {
        pm = parent.MC && parent.MC.getMap && parent.MC.getMap();
    }
    catch (_) { }
    if (!pm)
        return;
    for (const k in pm)
        if (!map[k])
            map[k] = pm[k];
}
function paneRefresh() {
    clearTimeout(paneT);
    paneCopyMap();
    const s = map[sym];
    if (s) {
        paneTries = 0;
        applyPrec(s.dec);
        header();
        return Promise.resolve();
    }
    if (++paneTries < 120)
        paneT = setTimeout(paneRefresh, 500); /* the main page is still loading its list */
    return Promise.resolve();
}
if (PANE) {
    window.mcInactive = true; /* the main page marks the active chart; the others skip the 100ms trade stream (less data) */
    window.MCP = {
        sym: () => sym,
        /* the main page's watchlist picked a coin for this chart */
        setSym(s, kb) {
            if (!s || s === sym)
                return;
            paneCopyMap();
            sym = s;
            store.set(SAVED_SYMBOL_KEY, sym);
            resetState();
            header();
            clearTimeout(selT);
            selT = setTimeout(() => { loadChart(); syncWS(); }, kb ? 140 : 0);
        },
    };
    /* the timeframe is the main page's: when it changes (storage event) every chart follows */
    addEventListener('storage', e => {
        if (e.key !== SAVED_TIMEFRAME_KEY)
            return;
        const v = store.get(SAVED_TIMEFRAME_KEY, tf), name = Object.keys(TFS).find(k => TFS[k] === v);
        if (name)
            pickTf(name);
    });
    /* touching this chart makes it the active one (the left drawing toolbar and the watchlist now act on it) */
    addEventListener('pointerdown', () => { try { parent.MC && parent.MC.activate(PANE); } catch (_) { } }, true);
}
