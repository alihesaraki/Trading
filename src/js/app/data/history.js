/* ---------- Load candles for the current symbol / timeframe ---------- */
let tok = 0; /* request token: stale responses are dropped */
async function loadChart(first, force) {
    const my = ++tok;
    ctl && ctl.abort();
    ctl = new AbortController();
    const sig = ctl.signal, key = sym + '|' + tf, c = !first && !force && cache.get(key);
    const s = map[sym];
    if (s)
        applyPrec(s.dec);
    if (c) { /* from cache: show instantly, then fetch only the missing candles */
        data = c.d;
        noMore = c.nm;
        loadingOld = false;
        curKey = key;
        $('ld').style.display = 'none';
        window.RP && RP.afterData(); /* replay carried over a symbol / timeframe switch */
        validatePriceScaleForData();
        setBars(data);
        syncFut();
        const l = data[data.length - 1];
        lastClose = l.close;
        lastUp = l.close >= l.open;
        closeAt = l.time * 1000 + (TFMS[tf] || 0);
        if (pend) {
            applyBar(pend);
            pend = null;
        }
        window.IND && IND.full();
        fitSoon();
        catchUp(true);
        ensureDrawingsCovered();
        return;
    }
    /* enough candles for the active indicators (e.g. EMA 250) in the very first request -> no second load / redraw */
    const lim = Math.max(LIM, Math.min(1500, window.IND ? IND.need() : 0));
    const url = `${API}/fapi/v1/klines?symbol=${sym}&interval=${tf}&limit=${lim}`;
    let k;
    try {
        /* first load reuses the request started in index.html before the chart library was ready */
        const early = first && sym === SYM0 && tf === TF0 && lim === LIM;
        k = await (early ? P_K : getJ(url, sig));
        if (!Array.isArray(k) && early)
            k = await getJ(url, sig);
    }
    catch (e) {
        if (e.name !== 'AbortError' && my === tok)
            setTimeout(() => {
                if (my === tok)
                    loadChart(false, true);
            }, 3000);
        return;
    } /* retry after 3s */
    if (my !== tok)
        return;
    if (!Array.isArray(k) || !k.length) {
        setTimeout(() => {
            if (my === tok)
                loadChart(false, true);
        }, 3000);
        return;
    }
    data = k.map(candle);
    noMore = k.length < lim;
    loadingOld = false;
    curKey = key;
    $('ld').style.display = 'none';
    window.RP && RP.afterData();
    validatePriceScaleForData();
    setBars(data);
    syncFut();
    const l = k[k.length - 1];
    lastClose = +l[4];
    lastUp = +l[4] >= +l[1];
    closeAt = l[6] + 1;
    if (pend && pend.time >= data[data.length - 1].time) { /* candle that came over WebSocket while downloading */
        applyBar(pend);
        lastClose = pend.close;
        lastUp = pend.close >= pend.open;
        closeAt = pend.T + 1;
    }
    pend = null;
    window.IND && IND.full();
    fitSoon();
    ensureDrawingsCovered();
}
