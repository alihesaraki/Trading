/* ---------- Load candles for the current symbol / timeframe ---------- */
let tok = 0; /* request token: stale responses are dropped */
let loadTry = 0; /* consecutive failed loads of the current chart: drives the retry back-off */
const LOAD_RETRY_BASE = 3000, LOAD_RETRY_MAX = 60000;
function showLoadError(msg) {
    const ld = $('ld');
    ld.textContent = msg;
    ld.style.display = 'block';
}
/* Retry a failed chart load with exponential back-off (3s, 6s, 12s ... max 60s) and tell the user what is happening.
   A rate-limited request waits at least 30s so we do not make a Binance ban longer. */
function retryLoad(my, msg, slow) {
    const wait = Math.min(LOAD_RETRY_MAX, Math.max(slow ? 30000 : 0, LOAD_RETRY_BASE * 2 ** loadTry++));
    showLoadError(`${msg} in ${Math.round(wait / 1000)}s…`);
    setTimeout(() => {
        if (my === tok)
            loadChart(false, true);
    }, wait);
}
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
            retryLoad(my, 'Network error. Retrying');
        return;
    }
    if (my !== tok)
        return;
    if (!Array.isArray(k) || !k.length) {
        /* Binance error object ({code, msg}): a bad symbol will never succeed, a rate limit needs a longer wait */
        const code = k && k.code;
        if (code === -1121 || code === -1120)
            showLoadError('This symbol is not available.');
        else
            retryLoad(my, code === -1003 || code === -1015 ? 'Rate limited by Binance. Retrying' : 'Could not load candles. Retrying', code === -1003 || code === -1015);
        return;
    }
    loadTry = 0;
    $('ld').textContent = 'Loading history…';
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
