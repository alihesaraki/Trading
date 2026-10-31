/* ---------- Apply one candle (new or still forming) to the chart ---------- */
function applyBar(b) {
    if (window.RP && RP.intercept(b))
        return; /* bar replay running: real-time candles are parked */
    const n = data.length;
    if (!n)
        return;
    const l = data[n - 1].time;
    if (b.time === l) {
        data[n - 1] = b;
        validatePriceScaleForData();
        updateBar(b);
        return;
    }
    if (b.time < l)
        return; /* older candles are ignored */
    /* new candle: if the newest candle is on screen, scroll along with it (the future points would otherwise stop the auto-scroll) */
    const ts = chart.timeScale(), rg = ts.getVisibleLogicalRange(), follow = !!rg && rg.from <= n - 1 && rg.to >= n - 1;
    data.push(b);
    validatePriceScaleForData();
    updateBar(b);
    syncFut();
    if (follow)
        ts.setVisibleLogicalRange({ from: rg.from + 1, to: rg.to + 1 });
}
