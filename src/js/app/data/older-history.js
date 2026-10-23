/* ---------- Load older history when scrolling left (down to the coin's first candle) ---------- */
async function loadOlder() {
    if (loadingOld || noMore || !data.length)
        return;
    loadingOld = true;
    $('ld').style.display = 'block';
    const my = tok;
    try {
        const k = await getJ(`${API}/fapi/v1/klines?symbol=${sym}&interval=${tf}&limit=1500&endTime=${data[0].time * 1000 - 1}`, ctl && ctl.signal);
        if (my !== tok || !Array.isArray(k))
            return;
        if (k.length < 1500)
            noMore = true;
        if (!k.length)
            return;
        const add = k.map(candle), rg = chart.timeScale().getVisibleLogicalRange();
        data = add.concat(data);
        validatePriceScaleForData();
        series.setData(data);
        window.IND && IND.full();
        if (rg)
            chart.timeScale().setVisibleLogicalRange({ from: rg.from + add.length, to: rg.to + add.length }); /* keep the view where it was */
    }
    catch (e) { }
    finally {
        if (my === tok) {
            loadingOld = false;
            $('ld').style.display = 'none';
        }
    }
}
chart.timeScale().subscribeVisibleLogicalRangeChange(r => {
    if (r && r.from < 40 && !resettingViewport)
        loadOlder();
});

/* Drawings are stored in absolute time, so a drawing made on a lower timeframe (e.g. a position on 5m) may start before the
   candles loaded for the new timeframe. Load older candles until every drawing of this symbol is covered (capped). */
async function ensureDrawingsCovered() {
    const my = tok;
    for (let i = 0; i < 6; i++) {
        const st = window.DR && window.DR.store;
        if (!st || !data.length || noMore || my !== tok)
            return;
        let min = Infinity;
        for (const d of st.items)
            for (const p of d.points)
                if (p.time < min)
                    min = p.time;
        if (!(min < data[0].time))
            return;
        if (loadingOld) {
            await new Promise(r => setTimeout(r, 150));
            continue;
        }
        await loadOlder();
    }
}
