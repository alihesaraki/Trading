/* ---------- Catch up on missed candles (after disconnect, sleeping tab, or a missed candle close) ---------- */
async function catchUp(force) {
    if (cuBusy || !data.length || (window.RP && RP.on()))
        return;
    const now = Date.now();
    if (!force && now - cuT < 4000)
        return; /* throttle automatic runs */
    cuT = now;
    const my = tok, last = data[data.length - 1].time * 1000;
    if (now - last > 900 * (TFMS[tf] || 6e4)) {
        loadChart(false, true);
        return;
    } /* gap too large -> full reload */
    cuBusy = true;
    try {
        /* startTime = last candle open, so the response is tiny (usually 1-2 candles) */
        const k = await getJ(`${API}/fapi/v1/klines?symbol=${sym}&interval=${tf}&startTime=${last}&limit=1000`, ctl && ctl.signal);
        if (my !== tok || !Array.isArray(k) || !k.length)
            return;
        for (const r of k)
            applyBar(candle(r));
        const e = k[k.length - 1];
        lastClose = +e[4];
        lastUp = +e[4] >= +e[1];
        closeAt = e[6] + 1;
        window.IND && IND.tick();
    }
    catch (_) { }
    finally {
        cuBusy = false;
    }
}
