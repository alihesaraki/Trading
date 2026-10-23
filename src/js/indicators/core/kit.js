/* Indicator kit: shared helpers + the module registry.
   Every indicator lives in its own file under modules/ and registers itself with INDREG.register().
   A module is a plain object:
     name, fields (settings form), defaults,
     osc / vol / markers   flags (oscillator band, volume overlay, buy/sell markers)
     create(ind)           -> array of chart series
     calc(data, p, ind)    -> array of point arrays (one per series)
     tail(data, p, ind)    -> optional O(1) update of the live candle: array of points (or null = use calc)
     style(ind)            -> apply colors / visibility
     label(ind), color(p), fmt(ind, get) -> legend text / color / value html
     need(p)               -> candles needed before the last value is stable (used to pre-load history)
     frame(ind, ctx)       -> optional per-animation-frame hook (value badges) */
var INDREG = (function () {
    const mods = {};
    return { register(t, m) { mods[t] = m; }, get: t => mods[t], types: () => Object.keys(mods) };
})();
var INDKIT = (function () {
    const SRCS = ['close', 'open', 'high', 'low', 'hl2', 'hlc3', 'ohlc4'];
    const LEN = { k: 'len', l: 'Length', t: 'n', min: 1, max: 500, step: 1 }, SRCF = { k: 'src', l: 'Source', t: 's', o: SRCS }, COL = { k: 'color', l: 'Color', t: 'c' }, WID = { k: 'w', l: 'Line width', t: 'n', min: 1, max: 5, step: 1 };
    const rgba = (h, a) => { const hex = /^#[0-9a-f]{6}$/i.test(String(h)) ? String(h) : '#888888'; const n = parseInt(hex.slice(1), 16); const alpha = Math.max(0, Math.min(1, Number(a) || 0)); return alpha === 0 ? 'rgba(0,0,0,0)' : `rgba(${n >> 16},${n >> 8 & 255},${n & 255},${alpha})`; };
    const opac = (p, k) => Math.max(0, Math.min(100, +(p[k + 'Opacity'] ?? 100))) / 100;
    const colorAlpha = (p, k) => rgba(p[k], opac(p, k));
    const srcv = (b, s) => s === 'open' ? b.open : s === 'high' ? b.high : s === 'low' ? b.low : s === 'hl2' ? (b.high + b.low) / 2 : s === 'hlc3' ? (b.high + b.low + b.close) / 3 : s === 'ohlc4' ? (b.open + b.high + b.low + b.close) / 4 : b.close;
    const cmp = v => v >= 1e9 ? (v / 1e9).toFixed(2) + 'B' : v >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(2) + 'K' : v.toFixed(2);
    const fv = v => v.toFixed(map[sym] ? map[sym].dec : 2);
    const line = o => chart.addLineSeries(Object.assign({ priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }, o));
    /* Anchored recursion (EMA / SMMA): once enough history is loaded, the value at one candle is frozen ("anchor").
       Later prepends of older candles can then never change any value from the anchor onward, so the live value stays constant. */
    const findTime = (d, t) => { let lo = 0, hi = d.length - 1; while (lo <= hi) { const m = (lo + hi) >> 1; if (d[m].time === t) return m; d[m].time < t ? lo = m + 1 : hi = m - 1; } return -1; };
    const anchorAt = (ind, d) => { const a = ind.anchor; if (!a) return -1; const i = findTime(d, a.time); if (i < 0) ind.anchor = null; return i; };
    const setAnchor = (ind, d, idx, value) => { if (ind.settled && !ind.anchor && idx >= 0 && idx < d.length) ind.anchor = { time: d[idx].time, value }; };
    return { anchorAt, setAnchor, SRCS, LEN, SRCF, COL, WID, rgba, opac, colorAlpha, srcv, cmp, fv, line };
})();
