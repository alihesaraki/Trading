/* ---------- Instant candle rollover ----------
   Binance only creates a new candle on its first trade, which can take many seconds on quiet coins.
   At the close time we immediately draw the new (flat) candle locally; the real one replaces it when it arrives. */
function rollover() {
    const l = data[data.length - 1];
    if (l.time * 1000 >= closeAt)
        return; /* new candle already exists */
    const b = { time: closeAt / 1000, open: l.close, high: l.close, low: l.close, close: l.close, v: 0 }, d = new Date(closeAt);
    b.T = tf === '1M' ? Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - 1 : closeAt + TFMS[tf] - 1;
    applyBar(b);
    lastClose = b.close;
    lastUp = true;
    closeAt = b.T + 1;
    window.IND && IND.tick();
}
