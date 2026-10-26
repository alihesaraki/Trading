/* ---------- Chart ---------- */
const chart = LightweightCharts.createChart($('chart'), {
    autoSize: true,
    layout: { background: { type: 'solid', color: '#09101c' }, textColor: '#d1d4dc', fontFamily: '-apple-system,BlinkMacSystemFont,Trebuchet MS,Roboto,Ubuntu,sans-serif', fontSize: 12 },
    grid: { vertLines: { color: 'rgba(42,46,57,.25)' }, horzLines: { color: 'rgba(42,46,57,.25)' } },
    crosshair: { mode: 0, vertLine: { color: '#5d606b', labelBackgroundColor: '#2a2e39' }, horzLine: { color: '#5d606b', labelBackgroundColor: '#2a2e39' } },
    rightPriceScale: { borderColor: '#2a2e39', scaleMargins: { top: .08, bottom: .12 } },
    timeScale: { borderColor: '#2a2e39', timeVisible: true, secondsVisible: false, barSpacing: 9, rightOffset: 6, tickMarkFormatter: tickFmt },
    localization: { timeFormatter: crossFmt }
});
const series = chart.addCandlestickSeries({ priceLineStyle: 1, priceLineColor: '#089981', lastValueVisible: false, priceLineVisible: true });
/* Invisible helper series extends the time axis three years beyond the latest candle.
   To keep low-timeframe charts responsive, intraday timeframes use one future anchor per day;
   daily/weekly/monthly charts use their natural calendar interval. These are axis-only points. */
const FUTURE_YEARS = 3;
const FUTURE_HORIZON = FUTURE_YEARS * 365 * 24 * 60 * 60;
const fut = chart.addLineSeries({ color: 'rgba(0,0,0,0)', lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false, autoscaleInfoProvider: () => null });
function futTimes(last) {
    const o = [];
    const intervalMs = TFMS[tf] || 60000;
    const interval = intervalMs / 1000;
    const end = last + FUTURE_HORIZON;

    if (tf === '1M') {
        const d = new Date(last * 1000);
        let y = d.getUTCFullYear(), m = d.getUTCMonth();
        while (Date.UTC(y, m + 1, 1) / 1000 <= end) {
            m++;
            if (m > 11) { y++; m = 0; }
            o.push({ time: Date.UTC(y, m, 1) / 1000 });
        }
        return o;
    }

    // Keep the near-future axis aligned to the selected intraday timeframe.
    // Daily anchors farther away avoid creating millions of points on 1m charts.
    if (intervalMs < 86400000) {
        const nearHorizon = Math.min(end, last + 48 * 60 * 60);
        for (let t = last + interval; t <= nearHorizon; t += interval) {
            o.push({ time: t });
        }
        const firstDaily = Math.floor(nearHorizon / 86400) * 86400 + 86400;
        for (let t = firstDaily; t <= end; t += 86400) {
            if (t > (o.length ? o[o.length - 1].time : last)) o.push({ time: t });
        }
        return o;
    }

    const step = intervalMs >= 604800000 ? interval : 86400;
    for (let t = last + step; t <= end; t += step) {
        o.push({ time: t });
    }
    return o;
}
const syncFut = () => fut.setData(data.length ? futTimes(data[data.length - 1].time) : []);
/* Bridge for the drawing tools (drawings.js, built from src/js/drawings): gives them the chart, the candle series and the current candles. */
window.TVDR = { chart, series, bars: () => data, sym: () => sym, dec: () => map[sym] ? map[sym].dec : 2, store };
/* REST kline array -> chart candle (v = volume, used by the Volume indicator) */
const candle = k => ({ time: k[0] / 1000, open: +k[1], high: +k[2], low: +k[3], close: +k[4], v: +k[5] });
/* WebSocket kline object -> chart candle (T = close time, used for the countdown) */
const bar = k => ({ time: k.t / 1000, open: +k.o, high: +k.h, low: +k.l, close: +k.c, v: +k.v, T: k.T });
/* chartAlts: helper series that draw the non-candle chart types (line, area, bars ...), see chart/chart-type.js */
let chartAlts = [];
const applyPrec = d => { const pf = { priceFormat: { type: 'price', precision: d, minMove: 1 / Math.pow(10, d) } }; series.applyOptions(pf); chartAlts.forEach(s => { try { s.applyOptions(pf); } catch (_) { } }); };
