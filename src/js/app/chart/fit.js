/* ---------- Initial fit and fast Reset Chart viewport ---------- */
function fit() {
    if (!data.length) return;
    // Every newly selected coin/timeframe opens on the latest 300 candles by default.
    chart.priceScale('right').applyOptions({ autoScale: true });
    // Margins are measured from the top of the RSI / DMI / volume panes, so candles never overlap them.
    if (window.IND) window.IND.setMainMargins(RESET_SCALE_MARGIN, RESET_SCALE_MARGIN);
    else chart.priceScale('right').applyOptions({ scaleMargins: { top: RESET_SCALE_MARGIN, bottom: RESET_SCALE_MARGIN } });
    chart.timeScale().applyOptions({ rightOffset: RESET_RIGHT_OFFSET });
    const from = Math.max(0, data.length - RESET_VISIBLE_BARS);
    const to = data.length - 1 + RESET_RIGHT_OFFSET;
    chart.timeScale().setVisibleLogicalRange({ from, to });
}
const fitSoon = () => { fit(); requestAnimationFrame(fit); };

const RESET_VISIBLE_BARS = 300;
const RESET_RIGHT_OFFSET = 16; // Leave 16 empty bar slots to the right after Reset Chart.
const RESET_SCALE_MARGIN = 0.15; // Keep 15% breathing room above and below price action.
let resettingViewport = false;
let resetHistoryJob = null;

function applyResetViewport() {
    const count = data.length;
    if (!count) return false;

    // Native autoscaling follows the currently visible logical range and respects the
    // active Normal/Logarithmic mode, including visible indicator series on this scale.
    chart.priceScale('right').applyOptions({ autoScale: true });
    // Margins are measured from the top of the RSI / DMI / volume panes, so candles never overlap them.
    if (window.IND) window.IND.setMainMargins(RESET_SCALE_MARGIN, RESET_SCALE_MARGIN);
    else chart.priceScale('right').applyOptions({ scaleMargins: { top: RESET_SCALE_MARGIN, bottom: RESET_SCALE_MARGIN } });
    chart.timeScale().applyOptions({ rightOffset: RESET_RIGHT_OFFSET });
    const from = Math.max(0, count - RESET_VISIBLE_BARS);
    const to = count - 1 + RESET_RIGHT_OFFSET;
    resettingViewport = true;
    try {
        chart.timeScale().setVisibleLogicalRange({ from, to });
    } finally {
        resettingViewport = false;
    }
    return true;
}

async function resetChartView() {
    const token = tok;
    const key = `${sym}|${tf}`;
    applyResetViewport(); // Never wait on network for the immediate viewport reset.

    if (data.length >= RESET_VISIBLE_BARS || noMore || !data.length) return;
    if (resetHistoryJob?.key === key && resetHistoryJob?.token === token) return; // Coalesce rapid clicks for the same chart generation.

    // Ask only for the deficit, ending immediately before the oldest loaded candle.
    const needed = RESET_VISIBLE_BARS - data.length;
    const oldestTime = data[0].time;
    const signal = ctl?.signal;
    const job = { key, token, promise: null };
    job.promise = (async () => {
        try {
            const rows = await getJ(
                `${API}/fapi/v1/klines?symbol=${encodeURIComponent(sym)}&interval=${encodeURIComponent(tf)}&limit=${needed}&endTime=${oldestTime * 1000 - 1}`,
                signal
            );
            // Do not let a late response mutate a newly selected symbol/timeframe.
            if (token !== tok || key !== `${sym}|${tf}` || !Array.isArray(rows)) return;
            const older = rows.map(candle).filter(b => Number.isFinite(b.time) && b.time < data[0].time);
            if (rows.length < needed) noMore = true;
            if (!older.length) {
                noMore = true;
                return;
            }
            data = older.concat(data);
            validatePriceScaleForData();
            setBars(data);
            window.IND && IND.full();
            // Reapply only after the missing bars are available; this still targets the newest bars.
            applyResetViewport();
        } catch (e) {
            if (e?.name !== 'AbortError') {
                // Keep the already-applied viewport; a later click can retry.
            }
        } finally {
            if (resetHistoryJob === job) resetHistoryJob = null;
        }
    })();
    resetHistoryJob = job;
    await job.promise;
}
