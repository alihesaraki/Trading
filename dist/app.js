/* =====================================================================
   Binance Futures chart - main app
   (chart, watchlist, live data via WebSocket, candle auto-update)
   ===================================================================== */
const API = 'https://fapi.binance.com', WSU = 'wss://fstream.binance.com/stream', ROW = 36, LIM = 300;
/* Timeframe label -> Binance interval, and interval length in ms (1M is approximate, only used as a fallback) */
const TFS = { '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1h', '4h': '4h', '1D': '1d', '1W': '1w', '1M': '1M' };
const TFMS = { '1m': 6e4, '5m': 3e5, '15m': 9e5, '1h': 36e5, '4h': 144e5, '1d': 864e5, '1w': 6048e5, '1M': 26784e5 };
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
/* localStorage wrapper that never throws */
const store = { get(k, d) {
        try {
            const v = JSON.parse(localStorage.getItem(k));
            return v == null ? d : v;
        }
        catch (_) {
            return d;
        }
    }, set(k, v) {
        try {
            localStorage.setItem(k, JSON.stringify(v));
        }
        catch (_) { }
    } };
const getJ = (u, sig) => fetch(u, { signal: sig }).then(r => r.json());
/* ---------- ColorPalette: reusable 8 x 8 colour picker palette ----------
   ColorPalette.html(attrsFor)  -> markup (attrsFor(hex) returns the data-* attributes that tell the caller's own click handler what the swatch does)
   ColorPalette.mount(el, attrsFor) -> same markup injected into an element
   Clicking any swatch ALSO copies its HEX code to the clipboard (one delegated listener, installed once). */
const colorPalette = [
  ["#000000", "#242424", "#484848", "#6D6D6D", "#919191", "#B6B6B6", "#DADADA", "#FFFFFF"],
  ["#800000", "#A00000", "#C00000", "#E00000", "#FF2020", "#FF5050", "#FF8080", "#FFB0B0"],
  ["#803000", "#A04000", "#C05000", "#E06000", "#FF7000", "#FF9030", "#FFB060", "#FFD0A0"],
  ["#807000", "#A08C00", "#C0A800", "#E0C400", "#FFE000", "#FFE830", "#FFF060", "#FFF8A0"],
  ["#004000", "#006000", "#008000", "#00A000", "#00C000", "#30D030", "#70E070", "#B0F0B0"],
  ["#000060", "#000080", "#0000A0", "#0000C0", "#2020E0", "#5050FF", "#8080FF", "#B0B0FF"],
  ["#300060", "#480080", "#6000A0", "#7800C0", "#9020E0", "#B050F0", "#C880FF", "#E0B0FF"],
  ["#600030", "#800040", "#A00050", "#C00060", "#E02080", "#F050A0", "#FF80C0", "#FFB0D8"]
];
const ColorPalette = (function () {
    const flat = colorPalette.flat();
    function copyText(text) {
        if (navigator.clipboard && window.isSecureContext)
            return navigator.clipboard.writeText(text).then(() => true, () => legacy(text));
        return Promise.resolve(legacy(text)); /* file:// and http pages have no async clipboard API */
    }
    function legacy(text) {
        const ta = document.createElement('textarea');
        ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
        document.body.appendChild(ta); ta.select();
        let ok = false;
        try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
        ta.remove();
        return ok;
    }
    function html(attrsFor) {
        return `<div class="ipal cp" role="group" aria-label="Color palette">${colorPalette.map(row => row.map(c => `<button type="button" class="cp-sw" ${attrsFor ? attrsFor(c) : ''} data-cp-hex="${c}" title="${c} (click to apply and copy)" aria-label="${c}"><span class="cp-box" style="background:${c}"></span></button>`).join('')).join('')}</div>`;
    }
    function mount(el, attrsFor) { el.innerHTML = html(attrsFor); return el; }
    document.addEventListener('click', e => {
        const b = e.target.closest && e.target.closest('.cp-sw');
        if (!b) return;
        const hex = b.dataset.cpHex;
        Promise.resolve(copyText(hex)).then(ok => {
            if (!ok) return;
            b.classList.add('cp-copied'); /* brief highlight; the HEX is still in the tooltip */
            setTimeout(() => b.classList.remove('cp-copied'), 600);
        });
    });
    return { colors: colorPalette, flat, html, mount, copy: copyText };
})();
window.COLOR_PALETTE = ColorPalette.flat; /* flat list kept for older callers */
/* ---------- Tehran time (Asia/Tehran) for the time axis + crosshair label ----------
   Intl handles Iran's historical DST too, so old candles are labelled correctly as well. */
const TZ = 'Asia/Tehran', DAILY = new Set(['1d', '1w', '1M']);
const tzf = o => new Intl.DateTimeFormat('en-GB', Object.assign({ timeZone: TZ, hourCycle: 'h23' }, o));
const FT = { hm: tzf({ hour: '2-digit', minute: '2-digit' }), d: tzf({ day: 'numeric' }), m: tzf({ month: 'short' }), y: tzf({ year: 'numeric' }),
    f: tzf({ weekday: 'short', day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }) };
/* time-axis tick: 0 = year, 1 = month, 2 = day, 3+ = time of day */
const tickFmt = (t, type) => { const d = new Date(t * 1000); return type === 0 ? FT.y.format(d) : type === 1 ? FT.m.format(d) : type === 2 ? FT.d.format(d) : FT.hm.format(d); };
/* label shown on the time axis under the crosshair */
const crossFmt = t => {
    if (typeof t !== 'number')
        return '';
    const p = {};
    for (const x of FT.f.formatToParts(new Date(t * 1000)))
        p[x.type] = x.value;
    const day = `${p.weekday} ${p.day} ${p.month} '${p.year}`;
    return DAILY.has(tf) ? day : `${day}  ${p.hour}:${p.minute}`;
};
/* ---------- State ---------- */
const SAVED_SYMBOL_KEY = 'chartSelectedSymbol';
const SAVED_TIMEFRAME_KEY = 'chartSelectedTimeframe';
const validTimeframes = new Set(Object.values(TFS));
const savedSymbol = store.get(SAVED_SYMBOL_KEY, 'BTCUSDT');
const savedTimeframe = store.get(SAVED_TIMEFRAME_KEY, '1d');
let sym = typeof savedSymbol === 'string' && /^[^_\s]{2,30}USDT$/.test(savedSymbol) ? savedSymbol : 'BTCUSDT', tf = validTimeframes.has(savedTimeframe) ? savedTimeframe : '1d', all = [], map = {}, view = [], sortKey = 's', sortDir = -1, query = '';
store.set(SAVED_SYMBOL_KEY, sym);
store.set(SAVED_TIMEFRAME_KEY, tf);
let data = [], noMore = false, loadingOld = false, lastClose = null, lastUp = true, closeAt = 0, skew = 0, skewOk = false, cdCol = '';
/* pend: live candle that arrived before history finished loading; curKey: sym|tf of the data on screen;
   ctl: AbortController of in-flight chart requests; cuBusy/cuT: catch-up lock and last run time */
let pend = null, curKey = '', ctl = null, cuBusy = false, cuT = 0;
const DEFAULT_CANDLE_COLORS = ['#26a69a', '#ef5350'];
let savedCandleColors = store.get('cc', DEFAULT_CANDLE_COLORS);
// Migrate the former built-in default, but preserve any custom colors saved by the user.
if (Array.isArray(savedCandleColors) && savedCandleColors[0]?.toLowerCase() === '#0f9d7a' && savedCandleColors[1]?.toLowerCase() === '#f7e21f') {
  savedCandleColors = DEFAULT_CANDLE_COLORS;
  store.set('cc', savedCandleColors);
}
let [cUp, cDn] = Array.isArray(savedCandleColors) && savedCandleColors.length >= 2 ? savedCandleColors : DEFAULT_CANDLE_COLORS;
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
const applyPrec = d => series.applyOptions({ priceFormat: { type: 'price', precision: d, minMove: 1 / Math.pow(10, d) } });
/* ---------- Candle colors ---------- */
const PRE = [['#26a69a', '#ef5350'], ['#ffffff', '#d4af37'], ['#089981', '#ffeb3b']];
let cUpOpacity = 100, cDnOpacity = 100;
try { const savedOpacity = store.get('cco'); if (Array.isArray(savedOpacity)) { cUpOpacity = +savedOpacity[0] || 0; cDnOpacity = +savedOpacity[1] || 0; } } catch (_) {}
for (const [key, panel] of [['up', 'cUpPanel'], ['dn', 'cDnPanel']]) {
    $(panel).innerHTML = `${ColorPalette.html(c => `data-candle-color="${key}" data-color="${c}"`)}<label class="candle-hex">HEX <input type="text" id="${key === 'up' ? 'cUp' : 'cDn'}" class="ihex" value="${key === 'up' ? cUp : cDn}" maxlength="7" aria-label="${key} candle HEX"></label><div class="iopacity"><span>Opacity</span><input type="range" min="0" max="100" step="1" data-candle-opacity="${key}" value="${key === 'up' ? cUpOpacity : cDnOpacity}"><output data-candle-opacity-value="${key}">${key === 'up' ? cUpOpacity : cDnOpacity}%</output></div>`;
}
/* Pick black/white text that is readable on the given background color */
function rgbaC(hex, opacity) { const n = parseInt(String(hex).slice(1), 16); return `rgba(${n >> 16},${n >> 8 & 255},${n & 255},${Math.max(0, Math.min(100, opacity)) / 100})`; }
function setColors(u, d) {
    cUp = u;
    cDn = d;
    const upHex = $('cUp'), dnHex = $('cDn'); if (upHex) upHex.value = u; if (dnHex) dnHex.value = d;
    $('cUpSwatch').style.background = u;
    $('cDnSwatch').style.background = d;
    series.applyOptions({ upColor: rgbaC(u, cUpOpacity), borderUpColor: rgbaC(u, cUpOpacity), wickUpColor: rgbaC(u, cUpOpacity), downColor: rgbaC(d, cDnOpacity), borderDownColor: rgbaC(d, cDnOpacity), wickDownColor: rgbaC(d, cDnOpacity) });
    cdCol = '';
    header();
    store.set('cc', [u, d]); store.set('cco', [cUpOpacity, cDnOpacity]);
    window.IND && IND.colors();
}
$('pre').innerHTML = PRE.map((p, i) => `<button data-i="${i}" style="background:linear-gradient(90deg,${p[0]} 50%,${p[1]} 50%)"></button>`).join('');
$('pre').onclick = e => {
    const i = e.target.dataset.i;
    if (i != null)
        setColors(...PRE[i]);
};
document.querySelector('#pop').addEventListener('input', e => { const key = e.target.dataset.candleOpacity; if (key) { const v = Math.max(0, Math.min(100, +e.target.value)); if (key === 'up') cUpOpacity = v; else cDnOpacity = v; const out = document.querySelector(`[data-candle-opacity-value="${key}"]`); if (out) out.textContent = v + '%'; setColors(cUp, cDn); return; } if (e.target.id === 'cUp' || e.target.id === 'cDn') { const value = e.target.value; if (/^#[0-9a-f]{6}$/i.test(value)) e.target.id === 'cUp' ? setColors(value, cDn) : setColors(cUp, value); } });
document.querySelector('#pop').addEventListener('click', e => {
    const toggle = e.target.closest('[data-candle-toggle]');
    if (toggle) {
        const key = toggle.dataset.candleToggle, panel = $(key === 'up' ? 'cUpPanel' : 'cDnPanel'), wasOpen = !panel.hidden;
        $('cUpPanel').hidden = true; $('cDnPanel').hidden = true; document.querySelectorAll('[data-candle-toggle]').forEach(b => b.setAttribute('aria-expanded', 'false')); panel.hidden = wasOpen; toggle.setAttribute('aria-expanded', String(!wasOpen));
        return;
    }
    const swatch = e.target.closest('[data-candle-color]');
    if (swatch) {
        if (swatch.dataset.candleColor === 'up') setColors(swatch.dataset.color, cDn); else setColors(cUp, swatch.dataset.color);
        $('cUpPanel').hidden = true; $('cDnPanel').hidden = true; document.querySelectorAll('[data-candle-toggle]').forEach(b => b.setAttribute('aria-expanded', 'false'));
    }
});
$('popX').onclick = () => { $('pop').hidden = true; };
/* Candle Settings window: opened by double-click or right-click on a candle */
function openCandleSet() { $('imenu').hidden = true;
    $('btnInd').setAttribute('aria-expanded', 'false'); const bg = document.getElementById('bgset'); if (bg) bg.hidden = true; $('pop').hidden = false; }
function candleAt(e) {
    if (e.target.closest('#lg,#iset,#pop,#tl,.dr-tb,.dr-fly,.dr-fb,.dr-set,.dr-ta,.dr-svg,[data-dr-ui]'))
        return null;
    const r = $('chart').getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (x < 0 || y < 0 || x > r.width - chart.priceScale('right').width() || y > r.height - chart.timeScale().height())
        return null;
    const t = chart.timeScale().coordinateToTime(x);
    if (t == null)
        return null;
    const i = data.findIndex(b => b.time === t);
    if (i < 0)
        return null;
    const hi = series.priceToCoordinate(data[i].high), lo = series.priceToCoordinate(data[i].low);
    if (hi == null || lo == null)
        return null;
    return y >= hi - 4 && y <= lo + 4 ? data[i] : null;
}
$('cw').addEventListener('dblclick', e => {
    if (candleAt(e)) openCandleSet();
});
// Touch screens often omit dblclick, so treat two quick taps on a candle as a double-click.
let lastCandleTap = null;
$('cw').addEventListener('pointerup', e => {
    if (e.pointerType !== 'touch') return;
    const candle = candleAt(e);
    if (!candle) { lastCandleTap = null; return; }
    const now = Date.now(), last = lastCandleTap;
    if (last && last.time && now - last.time <= 380 && Math.hypot(e.clientX - last.x, e.clientY - last.y) <= 26) {
        lastCandleTap = null;
        openCandleSet();
    } else lastCandleTap = { time: now, x: e.clientX, y: e.clientY };
}, true);
document.addEventListener('click', e => {
    if (!$('pop').contains(e.target))
        $('pop').hidden = true;
});
addEventListener('keydown', e => {
    if (e.key === 'Escape')
        $('pop').hidden = true;
});
/* ---------- Chart background settings (right-click on chart -> Background Settings) ---------- */
const BG_DEFAULT = { bg: '#09101c', grid: '#2a2e39', gridOp: 25 };
const bgCfg = Object.assign({}, BG_DEFAULT);
try {
    const saved = store.get('bg');
    if (saved && typeof saved === 'object') {
        if (/^#[0-9a-f]{6}$/i.test(saved.bg)) bgCfg.bg = saved.bg.toLowerCase() === '#131722' ? BG_DEFAULT.bg : saved.bg;
        if (/^#[0-9a-f]{6}$/i.test(saved.grid)) bgCfg.grid = saved.grid;
        if (Number.isFinite(+saved.gridOp)) bgCfg.gridOp = Math.max(0, Math.min(100, +saved.gridOp));
    }
} catch (_) { }
const BG_KEYS = { bg: ['bgSwatch', 'bgPanel', 'bgHex'], grid: ['gridSwatch', 'gridPanel', 'gridHex'] };
const bgPop = document.createElement('div');
bgPop.id = 'bgset';
bgPop.hidden = true;
bgPop.innerHTML = `
    <div class="ph"><b>Background Settings</b><button id="bgX" title="Close">✕</button></div>
    ${[['bg', 'Background'], ['grid', 'Grid lines']].map(([k, label]) => `
    <label class="candle-color-row">${label} <div class="candle-color-control"><button type="button" class="candle-color-toggle" data-bg-toggle="${k}" aria-expanded="false"><span id="${BG_KEYS[k][0]}" class="icolor-swatch"></span>Color</button></div></label>
    <div class="candle-palette" id="${BG_KEYS[k][1]}" hidden>
        ${ColorPalette.html(c => `data-bg-color="${k}" data-color="${c}"`)}
        <label class="candle-hex">HEX <input type="text" id="${BG_KEYS[k][2]}" class="ihex" maxlength="7" aria-label="${label} HEX"></label>
    </div>`).join('')}
    <div class="iopacity"><span>Grid opacity</span><input type="range" id="gridOp" min="0" max="100" step="1"><output id="gridOpOut"></output></div>
    <div id="bgBtns"><button type="button" id="bgReset">Reset to default</button></div>`;
$('pop').after(bgPop);

function bgLuma(hex) {
    const n = parseInt(hex.slice(1), 16);
    return (0.299 * (n >> 16) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) / 255;
}
function applyBackground(save = true) {
    const gridCol = rgbaC(bgCfg.grid, bgCfg.gridOp), light = bgLuma(bgCfg.bg) > 0.6;
    chart.applyOptions({
        layout: { background: { type: 'solid', color: bgCfg.bg }, textColor: light ? '#131722' : '#d1d4dc' },
        grid: { vertLines: { color: gridCol }, horzLines: { color: gridCol } }
    });
    document.documentElement.style.setProperty('--chart-bg', bgCfg.bg);
    for (const k of ['bg', 'grid']) {
        $(BG_KEYS[k][0]).style.background = bgCfg[k];
        const hex = $(BG_KEYS[k][2]);
        if (document.activeElement !== hex) hex.value = bgCfg[k];
    }
    $('gridOp').value = bgCfg.gridOp;
    $('gridOpOut').textContent = bgCfg.gridOp + '%';
    if (save) store.set('bg', bgCfg);
}
function closeBgPanels() {
    for (const k of ['bg', 'grid']) $(BG_KEYS[k][1]).hidden = true;
    bgPop.querySelectorAll('[data-bg-toggle]').forEach(b => b.setAttribute('aria-expanded', 'false'));
}
bgPop.addEventListener('click', e => {
    const toggle = e.target.closest('[data-bg-toggle]');
    if (toggle) {
        const panel = $(BG_KEYS[toggle.dataset.bgToggle][1]), wasOpen = !panel.hidden;
        closeBgPanels();
        panel.hidden = wasOpen;
        toggle.setAttribute('aria-expanded', String(!wasOpen));
        return;
    }
    const swatch = e.target.closest('[data-bg-color]');
    if (swatch) {
        bgCfg[swatch.dataset.bgColor] = swatch.dataset.color;
        closeBgPanels();
        applyBackground();
    }
});
bgPop.addEventListener('input', e => {
    if (e.target.id === 'gridOp') {
        bgCfg.gridOp = Math.max(0, Math.min(100, +e.target.value));
        applyBackground();
        return;
    }
    for (const k of ['bg', 'grid']) {
        if (e.target.id === BG_KEYS[k][2] && /^#[0-9a-f]{6}$/i.test(e.target.value)) {
            bgCfg[k] = e.target.value;
            applyBackground();
        }
    }
});
$('bgReset').onclick = () => {
    Object.assign(bgCfg, BG_DEFAULT);
    closeBgPanels();
    applyBackground();
};
$('bgX').onclick = () => { bgPop.hidden = true; };
function openBgSet() {
    $('imenu').hidden = true;
    $('btnInd').setAttribute('aria-expanded', 'false');
    $('pop').hidden = true;
    closeBgPanels();
    bgPop.hidden = false;
}
// On touch phones, double-tapping the empty plotting area opens Background Settings.
// Candle double-taps remain reserved for Candle Settings in 04-candle-colors.js.
let lastBackgroundTap = null;
$('cw').addEventListener('pointerup', e => {
    if (e.pointerType !== 'touch' || !matchMedia('(pointer: coarse) and (max-width: 820px)').matches) return;
    if (!e.target.closest('#chart') || e.target.closest('#lg,#iset,#pop,#bgset,#tl,.dr-tb,.dr-fly,.dr-fb,.dr-set,.dr-ta,.dr-svg,[data-dr-ui],#scaleModes,#jumpNow')) {
        lastBackgroundTap = null;
        return;
    }
    const rect = $('chart').getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const plotRight = rect.width - chart.priceScale('right').width();
    const plotBottom = rect.height - chart.timeScale().height();
    if (x < 0 || y < 0 || x >= plotRight || y >= plotBottom || candleAt(e)) {
        lastBackgroundTap = null;
        return;
    }
    const now = Date.now(), last = lastBackgroundTap;
    if (last && now - last.time <= 380 && Math.hypot(e.clientX - last.x, e.clientY - last.y) <= 28) {
        lastBackgroundTap = null;
        openBgSet();
    } else lastBackgroundTap = { time: now, x: e.clientX, y: e.clientY };
}, true);
document.addEventListener('click', e => {
    if (!bgPop.contains(e.target)) bgPop.hidden = true;
});
addEventListener('keydown', e => {
    if (e.key === 'Escape') bgPop.hidden = true;
});
applyBackground(false);
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
const RESET_RIGHT_OFFSET = 16; // Leave 12 empty bar slots to the right after Reset Chart.
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
            series.setData(data);
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
/* ---------- In-memory cache: going back to a recent coin/timeframe is instant, no full download ---------- */
const cache = new Map();
function stash() {
    if (!curKey || !data.length)
        return;
    cache.delete(curKey);
    cache.set(curKey, { d: data, nm: noMore });
    if (cache.size > 12)
        cache.delete(cache.keys().next().value); /* keep the 12 most recent */
}
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
        series.update(b);
        return;
    }
    if (b.time < l)
        return; /* older candles are ignored */
    /* new candle: if the newest candle is on screen, scroll along with it (the future points would otherwise stop the auto-scroll) */
    const ts = chart.timeScale(), rg = ts.getVisibleLogicalRange(), follow = !!rg && rg.from <= n - 1 && rg.to >= n - 1;
    data.push(b);
    validatePriceScaleForData();
    series.update(b);
    syncFut();
    if (follow)
        ts.setVisibleLogicalRange({ from: rg.from + 1, to: rg.to + 1 });
}
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
        series.setData(data);
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
    series.setData(data);
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
/* ---------- Countdown label on the price scale + per-frame work ---------- */
const cd = $('cd'), cdPrice = $('cdPrice'), cdTime = $('cdTime');
let cdTxt = '', livePriceTxt = '', cdY = -1;
const p2 = n => String(n).padStart(2, '0');
function fmtCD(ms) {
    let s = Math.floor(Math.max(0, ms) / 1000);
    const d = Math.floor(s / 86400);
    s %= 86400;
    const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), longFrame = (TFMS[tf] || 0) > 86400000;
    return (d ? d + 'd ' : '') + (d || h ? p2(h) + ':' : '') + p2(m) + (longFrame ? '' : ':' + p2(s % 60));
}
function loop() {
    requestAnimationFrame(loop);
    const jump = $('jumpNow'), jumpRight = chart.priceScale('right').width() + 8;
    /* Keep the shortcut above the time axis instead of overlapping its labels. */
    const timeAxisH = (chart.timeScale().height && chart.timeScale().height()) || 28;
    const jumpBottom = timeAxisH + 6;
    if (jump && jump.dataset.right !== String(jumpRight)) {
        jump.style.right = jumpRight + 'px';
        jump.dataset.right = String(jumpRight);
    }
    if (jump && jump.dataset.bottom !== String(jumpBottom)) {
        jump.style.bottom = jumpBottom + 'px';
        jump.dataset.bottom = String(jumpBottom);
    }
    window.IND && IND.frame(); /* keeps the RSI value label glued to the line */
    const replaying = !!(window.RP && RP.on());
    if (skewOk && closeAt && data.length && !replaying) { /* 300ms grace so the final tick of the old candle can arrive first */
        const late = Date.now() + skew - closeAt;
        if (late >= 300 && late < 5000)
            rollover();
    }
    if (replaying || lastClose == null || !closeAt) {
        cd.style.display = 'none';
        return;
    }
    const y = series.priceToCoordinate(lastClose), H = $('cw').clientHeight;
    if (y == null || y < 12 || y > H - 50) {
        cd.style.display = 'none';
        return;
    }
    const txt = fmtCD(closeAt - (Date.now() + skew)), col = lastUp ? cUp : cDn;
    if (cd.style.display !== 'flex')
        cd.style.display = 'flex';
    if (txt !== cdTxt) {
        cdTxt = txt;
        cdTime.textContent = txt;
    }
    const live = map[sym], priceTxt = live ? fmt(live) : String(lastClose);
    if (priceTxt !== livePriceTxt) {
        livePriceTxt = priceTxt;
        cdPrice.textContent = priceTxt;
    }
    if (col !== cdCol) {
        cdCol = col;
        series.applyOptions({ priceLineVisible: true, lastValueVisible: false, priceLineColor: col });
        cd.style.background = `color-mix(in srgb, ${col} 16%, rgba(13,16,23,.96))`;
        cd.style.borderColor = `color-mix(in srgb, ${col} 48%, #343b4b)`;
        cd.style.color = col;
    }
    /* Match the countdown badge exactly to the live right price-scale width. */
    const priceBoxW = chart.priceScale('right').width();
    if (priceBoxW > 0 && cd.style.width !== priceBoxW + 'px')
        cd.style.width = priceBoxW + 'px';
    const yy = Math.round(y + 10);
    if (yy !== cdY) {
        cdY = yy;
        cd.style.transform = `translateY(${yy}px)`;
    }
}
$('jumpNow').addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); resetChartView(); });
requestAnimationFrame(loop);
/* ---------- Context menu (shared by chart and watchlist) ---------- */
const ctx = $('ctx');
let ctxFn = [];
function showMenu(x, y, items) {
    ctxFn = items.map(i => i[1]);
    ctx.innerHTML = items.map((i, n) => `<button data-n="${n}">${i[0]}</button>`).join('');
    ctx.hidden = false;
    ctx.style.left = Math.max(0, Math.min(x, innerWidth - ctx.offsetWidth - 4)) + 'px';
    ctx.style.top = Math.max(0, Math.min(y, innerHeight - ctx.offsetHeight - 4)) + 'px';
}
ctx.onclick = e => {
    const b = e.target.closest('button');
    if (!b)
        return;
    const f = ctxFn[+b.dataset.n];
    ctx.hidden = true;
    f && f();
};
document.addEventListener('pointerdown', e => {
    if (!ctx.contains(e.target))
        ctx.hidden = true;
}, true);
document.addEventListener('keydown', e => {
    if (e.key === 'Escape')
        ctx.hidden = true;
});
addEventListener('blur', () => { ctx.hidden = true; });
addEventListener('wheel', () => { ctx.hidden = true; }, { passive: true });
/* Copy text to the clipboard (with a fallback for non-secure contexts) */
function copyText(t) {
    const fb = () => {
        const a = document.createElement('textarea');
        a.value = t;
        a.style.cssText = 'position:fixed;opacity:0';
        document.body.appendChild(a);
        a.select();
        try {
            document.execCommand('copy');
        }
        catch (_) { }
        a.remove();
    };
    if (navigator.clipboard && navigator.clipboard.writeText)
        navigator.clipboard.writeText(t).catch(fb);
    else
        fb();
}
/* Chart right-click: reset chart / copy the price under the cursor */
$('cw').addEventListener('contextmenu', e => {
    if (e.target.closest('#lg,#iset'))
        return; /* keep native menu on indicator legend / settings */
    e.preventDefault();
    const p = series.coordinateToPrice(e.clientY - $('chart').getBoundingClientRect().top);
    const items = [];
    items.push(['Reset chart', () => resetChartView()]);
    if (p != null) {
        const t = p.toFixed(map[sym] ? map[sym].dec : 2);
        items.push([`Copy price ${t}`, () => copyText(t)]);
    }
    items.push(['Candle Settings', () => setTimeout(openCandleSet, 0)]);
    items.push(['Background Settings', () => setTimeout(openBgSet, 0)]);
    showMenu(e.clientX, e.clientY, items);
});
/* ---------- Linear / logarithmic price scale ----------
   Use Lightweight Charts' native price-scale mode so candles, crosshair coordinates,
   drawing anchors, hit-testing, and price-axis labels share the same transformation.
   Linear is the default; the selected mode is persisted independently of chart layout.
*/
const PRICE_SCALE_STORAGE_KEY = 'tview-price-scale-mode';
const PRICE_SCALE_API = LightweightCharts.PriceScaleMode || {};
const PRICE_SCALE_MODES = {
    linear: PRICE_SCALE_API.Normal ?? 0,
    log: PRICE_SCALE_API.Logarithmic
};
let priceScaleMode = store.get(PRICE_SCALE_STORAGE_KEY, 'linear') === 'log' ? 'log' : 'linear';
let scaleWarningTimer = 0;

function hasOnlyPositiveOhlc(bars) {
    return bars.every(b => [b.open, b.high, b.low, b.close].every(v => Number.isFinite(v) && v > 0));
}

function showPriceScaleWarning(message) {
    const el = $('scaleWarning');
    if (!el) return;
    el.textContent = message;
    el.hidden = false;
    clearTimeout(scaleWarningTimer);
    scaleWarningTimer = setTimeout(() => { el.hidden = true; }, 5500);
}

function updatePriceScaleButtons() {
    const group = $('scaleModes');
    if (!group) return;
    for (const button of group.querySelectorAll('[data-price-scale]')) {
        const active = button.dataset.priceScale === priceScaleMode;
        button.classList.toggle('on', active);
        button.setAttribute('aria-pressed', String(active));
    }
}

function setPriceScaleMode(nextMode, { persist = true, warn = true } = {}) {
    if (!(nextMode in PRICE_SCALE_MODES)) return false;
    if (nextMode === 'log' && data.length && !hasOnlyPositiveOhlc(data)) {
        if (warn) showPriceScaleWarning('Log scale requires positive OHLC prices. Linear scale remains active for this dataset.');
        return false;
    }
    const mode = PRICE_SCALE_MODES[nextMode];
    if (mode == null || !chart.priceScale('right')?.applyOptions) {
        if (warn) showPriceScaleWarning('This chart library version does not expose logarithmic price scaling.');
        return false;
    }
    priceScaleMode = nextMode;
    chart.priceScale('right').applyOptions({ mode });
    updatePriceScaleButtons();
    if (persist) store.set(PRICE_SCALE_STORAGE_KEY, priceScaleMode);
    return true;
}

function validatePriceScaleForData() {
    if (priceScaleMode === 'log' && data.length && !hasOnlyPositiveOhlc(data)) {
        setPriceScaleMode('linear', { persist: true, warn: false });
        showPriceScaleWarning('Log scale was switched off because this dataset contains non-positive or invalid OHLC prices.');
    }
}

$('scaleModes')?.addEventListener('click', e => {
    const button = e.target.closest('[data-price-scale]');
    if (!button) return;
    setPriceScaleMode(button.dataset.priceScale);
});

// Capture the shortcut before the drawing controller sees it. Alt+L belongs to Log scale;
// Long Position remains available through Ctrl+Alt+Shift+L / Cmd+Option+Shift+L.
document.addEventListener('keydown', e => {
    const target = e.target;
    if (target && (target.isContentEditable || target.closest?.('input, textarea, select, [contenteditable="true"], [role="textbox"]'))) return;
    if (e.repeat || !e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.code !== 'KeyL') return;
    e.preventDefault();
    e.stopImmediatePropagation();
    setPriceScaleMode(priceScaleMode === 'log' ? 'linear' : 'log');
}, true);

// Restore saved preference. Data validation runs after each candle batch is loaded.
setPriceScaleMode(priceScaleMode, { persist: false, warn: false });
updatePriceScaleButtons();
/* ---------- Toolbar ---------- */
$('tfs').innerHTML = Object.keys(TFS).map(t => `<button data-t="${t}" class="${TFS[t] === tf ? 'on' : ''}">${t}</button>`).join('');
/* Phones: one timeframe button (shows the active timeframe) that opens a picker with every timeframe. */
const btnTf = $('btnTf'), tfMenu = $('tfmenu');
const tfName = () => Object.keys(TFS).find(k => TFS[k] === tf) || tf;
function syncTfUi() {
    const n = tfName();
    [...$('tfs').children].forEach(b => b.classList.toggle('on', b.dataset.t === n));
    btnTf.innerHTML = `<span>${n}</span><svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true"><path d="M3.5 6 8 10.5 12.5 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    tfMenu.innerHTML = Object.keys(TFS).map(t => `<button type="button" role="menuitemradio" data-t="${t}" aria-checked="${t === n}" class="${t === n ? 'on' : ''}">${t}</button>`).join('');
}
function closeTfMenu() { tfMenu.hidden = true; btnTf.setAttribute('aria-expanded', 'false'); }
function pickTf(t) {
    if (!t || TFS[t] === tf) return;
    tf = TFS[t];
    store.set(SAVED_TIMEFRAME_KEY, tf);
    syncTfUi();
    // Keep the active timeframe visible in the horizontally scrollable toolbar.
    $('tfs').querySelector('button.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
    resetState();
    loadChart();
    syncWS();
    header();
}
$('tfs').onclick = e => pickTf(e.target.dataset.t);
tfMenu.onclick = e => { const b = e.target.closest('button[data-t]'); if (!b) return; closeTfMenu(); pickTf(b.dataset.t); };
btnTf.onclick = e => {
    e.stopPropagation();
    if (!tfMenu.hidden) return closeTfMenu();
    const r = btnTf.getBoundingClientRect();
    tfMenu.hidden = false;
    tfMenu.style.top = Math.round(r.bottom + 6) + 'px';
    tfMenu.style.left = Math.max(6, Math.min(Math.round(r.left), innerWidth - tfMenu.offsetWidth - 6)) + 'px';
    btnTf.setAttribute('aria-expanded', 'true');
};
document.addEventListener('pointerdown', e => { if (!tfMenu.hidden && !tfMenu.contains(e.target) && !btnTf.contains(e.target)) closeTfMenu(); });
addEventListener('keydown', e => { if (e.key === 'Escape') closeTfMenu(); });
addEventListener('resize', closeTfMenu);
syncTfUi();
/* Clear everything tied to the current symbol/timeframe (current data goes to the cache first) */
function resetState() {
    window.RP && RP.beforeSwitch(); /* un-hide replayed candles so the cache keeps the full list */
    stash();
    tok++;
    ctl && ctl.abort();
    series.setData([]);
    fut.setData([]);
    data = [];
    noMore = false;
    loadingOld = false;
    lastClose = null;
    closeAt = 0;
    pend = null;
    curKey = '';
    window.IND && IND.clear();
}
/* ---------- Header (title + daily change of the selected coin) ---------- */
function header() {
    const s = map[sym], b = sym.replace(/USDT$/, ''), tl = Object.keys(TFS).find(k => TFS[k] === tf);
    $('ttl').textContent = `${b} / TetherUS PERPETUAL CONTRACT · ${tl} · Binance`;
    if (!s || !s.o) {
        $('chg').textContent = '';
        return;
    }
    const p = +s.p, d = p - s.o, sg = d >= 0 ? '+' : '−';
    $('chg').textContent = `${sg}${Math.abs(d).toFixed(s.dec)} (${sg}${Math.abs(s.c).toFixed(2)}%)`;
    $('chg').style.color = d >= 0 ? cUp : cDn;
    document.title = `${fmt(s)} ${b} · Binance Futures`;
}
/* ---------- Bar Replay (TradingView style) ----------
   Pick a start bar -> every candle after it is hidden and is revealed again one update at a time.
   Model: `data` (the global the chart, indicators and drawings already read) holds only the revealed candles;
   `arr` holds the real candles after the cut and `ai` of them are already revealed. `ph` (0..3) counts the updates
   of the candle that is still forming: open -> first extreme -> second extreme -> close (a path built from the real OHLC).
   Live WebSocket candles are redirected into `arr` (see applyBar), so nothing real-time leaks into the replay. */
var RP = (function () {
    const SPEEDS = [10, 7, 5, 3, 1, 0.5, 0.3, 0.1]; /* updates per second, same list as TradingView */
    const SUB = 4;                                  /* updates per candle */
    let mode = 'off';                               /* 'off' | 'pick' (choosing the start bar) | 'active' */
    let arr = [], ai = 0, ph = 0, cutT = 0;
    let pending = null;                             /* replay carried over a symbol / timeframe switch: { t } */
    let playing = false, timer = 0, feeding = false, rePickFrom = null, hoverIdx = -1, hoverY = 0, toastT = 0;
    let speed = +store.get('rpSpeed', 3);
    if (!SPEEDS.includes(speed)) speed = 3;

    const ICON = {
        play: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 4.2v11.6L16 10z"/></svg>',
        pause: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5.5 4h3.2v12H5.5zM11.3 4h3.2v12h-3.2z"/></svg>',
    };
    const stepSec = () => (TFMS[tf] || 6e4) / 1000;
    const endOf = b => { if (tf === '1M') { const d = new Date(b.time * 1000); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / 1000; } return b.time + stepSec(); };
    /* index of the last candle that opens before T (-1 if none) */
    function idxBefore(T) {
        let lo = 0, hi = data.length - 1, r = -1;
        while (lo <= hi) { const m = (lo + hi) >> 1; if (data[m].time < T) { r = m; lo = m + 1; } else hi = m - 1; }
        return r;
    }
    function toast(msg) {
        const t = $('rpToast');
        t.textContent = msg; t.hidden = false;
        clearTimeout(toastT);
        toastT = setTimeout(() => { t.hidden = true; }, 3200);
    }
    function redraw() {
        const ts = chart.timeScale(), rg = ts.getVisibleLogicalRange();
        validatePriceScaleForData();
        series.setData(data);
        syncFut();
        window.IND && IND.full();
        if (rg) ts.setVisibleLogicalRange(rg);
    }
    function showBar(idx) {
        const ts = chart.timeScale(), rg = ts.getVisibleLogicalRange(), span = rg ? Math.max(60, rg.to - rg.from) : 120;
        ts.setVisibleLogicalRange({ from: idx - span * 0.7, to: idx + span * 0.3 });
    }
    function setCut() {
        const l = data[data.length - 1];
        cutT = l ? (ph > 0 ? l.time : endOf(l)) : 0;
    }

    /* ---------- UI state ---------- */
    function ui() {
        const shown = mode !== 'off' || !!pending, act = mode === 'active';
        $('rpBar').hidden = !shown;
        const b = $('btnReplay');
        b.setAttribute('aria-pressed', String(shown));
        b.classList.toggle('on', shown);
        $('rpPlay').disabled = $('rpStep').disabled = !act;
        $('rpPlay').innerHTML = playing ? ICON.pause : ICON.play;
        $('rpPlay').title = playing ? 'Pause (Shift+↓)' : 'Play (Shift+↓)';
        $('rpPlay').setAttribute('aria-label', playing ? 'Pause' : 'Play');
        $('rpSpeed').firstElementChild.textContent = speed + 'x';
        $('rpSel').classList.toggle('on', mode === 'pick');
        $('rpSel').querySelector('span').textContent = mode === 'pick' ? 'Click a bar…' : 'Select bar';
    }

    /* ---------- Start-bar picking (vertical cut line, the area to its right is dimmed) ---------- */
    function idxAtX(x) {
        const l = chart.timeScale().coordinateToLogical(x);
        return l == null ? -1 : clamp(Math.round(l), 0, Math.max(0, data.length - 2));
    }
    function placeCut() {
        const cut = $('rpCut'), dim = $('rpDim');
        const x = mode === 'pick' && hoverIdx >= 0 && data.length > 1 ? chart.timeScale().logicalToCoordinate(hoverIdx) : null;
        if (x == null) { cut.hidden = dim.hidden = true; return; }
        const left = Math.round($('chart').getBoundingClientRect().left - $('cw').getBoundingClientRect().left + x);
        const th = (chart.timeScale().height && chart.timeScale().height()) || 28;
        cut.hidden = dim.hidden = false;
        cut.style.left = left + 'px'; cut.style.bottom = th + 'px'; cut.style.setProperty('--y', Math.round(hoverY) + 'px');
        dim.style.left = left + 'px'; dim.style.right = chart.priceScale('right').width() + 'px'; dim.style.bottom = th + 'px';
    }
    function setPick(on) {
        $('cw').classList.toggle('rp-pick', on);
        if (!on) { hoverIdx = -1; placeCut(); }
    }
    function enterPick() {
        if (data.length < 2) { toast('Chart is still loading'); return; }
        stopPlay();
        if (mode === 'active') { rePickFrom = cutT; fullView(); }
        else rePickFrom = null;
        mode = 'pick';
        setPick(true);
        ui();
    }
    function cancelPick() {
        if (mode !== 'pick') return;
        setPick(false);
        const T = rePickFrom;
        rePickFrom = null;
        if (T != null && data.length > 1) { mode = 'off'; startAt(Math.max(0, idxBefore(T)), true); }
        else exit();
    }
    chart.subscribeCrosshairMove(p => {
        if (mode !== 'pick') return;
        if (!p.point) hoverIdx = -1;
        else { hoverIdx = idxAtX(p.point.x); hoverY = p.point.y; }
        placeCut();
    });
    chart.subscribeClick(p => {
        if (mode !== 'pick' || !p.point) return;
        const idx = idxAtX(p.point.x);
        if (idx < 0) return;
        rePickFrom = null;
        setPick(false);
        startAt(idx, true);
        const rg = chart.timeScale().getVisibleLogicalRange();
        if (!rg || idx < rg.from || idx > rg.to) showBar(idx);
    });
    chart.timeScale().subscribeVisibleLogicalRangeChange(() => { if (mode === 'pick') placeCut(); });

    /* ---------- Starting / stopping ---------- */
    function startAt(idx, draw) {
        idx = Math.min(idx, data.length - 2);
        if (idx < 0) { toast('Not enough candles to start a replay here'); return false; }
        stopPlay();
        arr = data.slice(idx + 1); ai = 0; ph = 0;
        data = data.slice(0, idx + 1);
        mode = 'active'; pending = null;
        setCut();
        setPick(false);
        ui();
        if (draw) redraw();
        return true;
    }
    /* put every real candle back into `data` (the caller redraws) */
    function restore() {
        stopPlay();
        if (mode !== 'active' || !arr.length) return false;
        const base = data.length - ai - (ph > 0 ? 1 : 0);
        data = data.slice(0, Math.max(0, base)).concat(arr);
        arr = []; ai = 0; ph = 0;
        return true;
    }
    function fullView() { if (restore()) redraw(); }
    function exit() {
        const was = mode === 'active';
        stopPlay(); closeDate(); setPick(false);
        if (was) restore();
        pending = null; rePickFrom = null; mode = 'off';
        ui();
        if (was && data.length) {
            series.setData(data);
            syncFut();
            const l = data[data.length - 1];
            lastClose = l.close; lastUp = l.close >= l.open;
            closeAt = l.T ? l.T + 1 : l.time * 1000 + (TFMS[tf] || 0);
            validatePriceScaleForData();
            window.IND && IND.full();
            fitSoon();
            catchUp(true);
        }
    }

    /* ---------- Playback ---------- */
    const path = t => t.close >= t.open ? [t.open, t.low, t.high, t.close] : [t.open, t.high, t.low, t.close];
    function partial(t, k) {
        const P = path(t).slice(0, k);
        return { time: t.time, open: t.open, high: Math.max(...P), low: Math.min(...P), close: P[k - 1], v: (t.v || 0) * k / SUB };
    }
    function feed(b) { feeding = true; try { applyBar(b); } finally { feeding = false; } }
    function tickOnce() {
        if (mode !== 'active') return false;
        if (ai >= arr.length) { toast('Reached the latest candle'); return false; }
        const t = arr[ai], k = ph + 1;
        feed(k >= SUB ? t : partial(t, k));
        if (k >= SUB) { ai++; ph = 0; } else ph = k;
        setCut();
        window.IND && IND.tick();
        return true;
    }
    function stepBar() { stopPlay(); if (mode !== 'active') return; ph = SUB - 1; tickOnce(); } /* finish the forming candle, or reveal the next one */
    function back() {
        if (mode !== 'active') return;
        stopPlay();
        if (ph > 0) { data.pop(); ph = 0; }
        else if (ai > 0) { data.pop(); ai--; }
        else { toast('This is where the replay started'); return; }
        setCut();
        redraw();
    }
    function schedule() {
        clearTimeout(timer);
        timer = setTimeout(() => {
            if (!playing) return;
            if (!tickOnce()) { stopPlay(); return; }
            schedule();
        }, 1000 / speed);
    }
    function play() {
        if (mode !== 'active' || playing) return;
        if (ai >= arr.length) { toast('Reached the latest candle'); return; }
        playing = true; ui(); schedule();
    }
    function stopPlay() { if (playing || timer) { playing = false; clearTimeout(timer); timer = 0; ui(); } }
    const togglePlay = () => playing ? stopPlay() : play();

    /* ---------- Real-time candles while replaying ---------- */
    function live(b) {
        const tail = arr[arr.length - 1];
        if (!tail) return;
        if (b.time === tail.time) arr[arr.length - 1] = b;
        else if (b.time > tail.time && b.time - tail.time <= stepSec() * 1.6) arr.push(b); /* ignore gaps: exit() catches up */
    }

    /* ---------- Loading older candles (Select date / First available date) ---------- */
    async function ensureBack(T, cap) {
        if (!data.length || data[0].time <= T || noMore) return true;
        const my = tok;
        let first = data[0].time, add = [], n = 0, ok = true;
        loadingOld = true;
        $('ld').style.display = 'block';
        try {
            while (first > T && !noMore && n++ < (cap || 30)) {
                const k = await getJ(`${API}/fapi/v1/klines?symbol=${sym}&interval=${tf}&limit=1500&endTime=${first * 1000 - 1}`, ctl && ctl.signal);
                if (my !== tok) return false;
                if (!Array.isArray(k)) throw 0;
                if (k.length < 1500) noMore = true;
                if (!k.length) break;
                add = k.map(candle).concat(add);
                first = add[0].time;
            }
        } catch (_) { ok = false; }
        finally { if (my === tok) { loadingOld = false; $('ld').style.display = 'none'; } }
        if (my !== tok) return false;
        if (add.length) data = add.concat(data);
        if (!ok) toast("Couldn't load older candles");
        return ok;
    }
    /* start the replay so that `T` (unix seconds) is the first candle to be revealed */
    async function startFromTime(T, cap) {
        if (data.length < 2) return;
        stopPlay();
        if (mode === 'active') { rePickFrom = null; fullView(); }
        mode = 'pick'; setPick(false); ui();
        if (T >= data[data.length - 1].time) { toast('Choose a date before the latest candle'); setPick(true); return; }
        if (T < data[0].time) {
            const my = tok;
            await ensureBack(T, cap);
            if (my !== tok) return;
            if (!noMore && data[0].time > T && cap) toast(`Loaded the latest ${data.length.toLocaleString('en-US')} candles only`);
        }
        const idx = Math.max(0, idxBefore(T));
        if (startAt(idx, true)) showBar(idx);
        else { redraw(); }
    }

    /* ---------- Replay kept across a symbol / timeframe switch ---------- */
    function beforeSwitch() {
        if (mode === 'pick') return;
        if (mode !== 'active') return;
        const t = cutT;
        restore();            /* so the in-memory cache stores the full candle list */
        mode = 'off';
        pending = { t };
    }
    function afterData() {
        if (mode === 'active' && !pending) { restore(); mode = 'off'; pending = { t: cutT }; } /* data was replaced under us */
        if (!pending || !data.length) return;
        const p = pending;
        if (p.t < data[0].time && !noMore) { loadBackThen(p); return; }
        pending = null;
        if (!startAt(Math.max(0, idxBefore(p.t)), false)) exit();
    }
    async function loadBackThen(p) {
        const my = tok;
        await ensureBack(p.t, 30);
        if (pending !== p || my !== tok) return;
        pending = null;
        const idx = Math.max(0, idxBefore(p.t));
        if (startAt(idx, true)) showBar(idx);
        else { redraw(); exit(); }
    }

    /* ---------- Date picker (chart time zone) ---------- */
    const OFF = tzf({ year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
    function tehranToUnix(y, mo, d, h, mi) {
        const off = ms => { const p = {}; for (const x of OFF.formatToParts(new Date(ms))) p[x.type] = x.value; return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000; };
        const local = Date.UTC(y, mo - 1, d, h, mi);
        return (local - off(local - off(local))) / 1000;
    }
    const isoDay = ms => { const p = {}; for (const x of tzf({ year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(ms))) p[x.type] = x.value; return `${p.year}-${p.month}-${p.day}`; };
    function openDate() {
        const l = data[data.length - 1];
        if (!l) return;
        $('rpD').max = isoDay(l.time * 1000);
        if (!$('rpD').value) $('rpD').value = isoDay((l.time - 86400 * 7) * 1000);
        $('rpDate').hidden = false;
        $('rpD').focus();
    }
    function closeDate() { $('rpDate').hidden = true; }
    function goDate() {
        const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec($('rpD').value), t = /^(\d{2}):(\d{2})$/.exec($('rpT').value || '00:00');
        if (!d || !t) { toast('Enter a valid date'); return; }
        closeDate();
        startFromTime(tehranToUnix(+d[1], +d[2], +d[3], +t[1], +t[2]), 0);
    }

    /* ---------- Wiring ---------- */
    function menuAt(btn, items) { const r = btn.getBoundingClientRect(); showMenu(r.left, r.bottom + 4, items); }
    $('btnReplay').onclick = () => { if (mode === 'off' && !pending) enterPick(); else exit(); };
    $('rpSel').onclick = () => menuAt($('rpSel'), [
        ['Select bar', () => enterPick()],
        ['Select date…', openDate],
        ['First available date', () => startFromTime(0, 40)],
        ['Random bar', startAtRandom],
    ]);
    function startAtRandom() {
        if (data.length < 2) return;
        stopPlay();
        if (mode === 'active') { rePickFrom = null; fullView(); }
        mode = 'pick'; setPick(false);
        const lo = Math.min(50, data.length - 2), idx = lo + Math.floor(Math.random() * (data.length - 1 - lo));
        if (startAt(idx, true)) showBar(idx);
    }
    $('rpPlay').onclick = togglePlay;
    $('rpStep').onclick = stepBar;
    $('rpSpeed').onclick = () => menuAt($('rpSpeed'), SPEEDS.map(s => [`${s === speed ? '✓ ' : '&nbsp;&nbsp;&nbsp;'}${s}x`, () => {
        speed = s; store.set('rpSpeed', s); ui();
        if (playing) schedule();
    }]));
    $('rpLive').onclick = exit;
    $('rpExit').onclick = exit;
    $('rpDateGo').onclick = goDate;
    $('rpDateX').onclick = closeDate;
    $('rpDate').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); goDate(); } else if (e.key === 'Escape') closeDate(); });
    document.addEventListener('keydown', e => {
        if (mode === 'off' || isTypingTarget(e.target)) return;
        if (e.key === 'Escape' && mode === 'pick') { cancelPick(); return; }
        if (!e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
        if (e.key === 'ArrowRight') { e.preventDefault(); stepBar(); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); back(); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); togglePlay(); }
    }, true);
    /* draggable toolbar */
    $('rpGrip').addEventListener('pointerdown', e => {
        const bar = $('rpBar'), cw = $('cw').getBoundingClientRect(), r = bar.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
        bar.style.cssText += `;left:${r.left - cw.left}px;top:${r.top - cw.top}px;bottom:auto;transform:none`;
        const mv = ev => {
            bar.style.left = clamp(ev.clientX - dx - cw.left, 0, Math.max(0, cw.width - r.width)) + 'px';
            bar.style.top = clamp(ev.clientY - dy - cw.top, 0, Math.max(0, cw.height - r.height)) + 'px';
        };
        const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); };
        addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('pointercancel', up);
        e.preventDefault();
    });
    addEventListener('resize', () => {
        const bar = $('rpBar');
        if (!bar.style.left || bar.hidden) return;
        const cw = $('cw').getBoundingClientRect(), r = bar.getBoundingClientRect();
        bar.style.left = clamp(r.left - cw.left, 0, Math.max(0, cw.width - r.width)) + 'px';
        bar.style.top = clamp(r.top - cw.top, 0, Math.max(0, cw.height - r.height)) + 'px';
    });
    ui();

    return {
        on: () => mode === 'active',
        /* applyBar hook: real-time candles are parked while a replay runs */
        intercept(b) { if (mode !== 'active' || feeding) return false; live(b); return true; },
        beforeSwitch, afterData,
    };
})();
/* ---------- Watchlist ---------- */
/* Price with thousands separators */
const fmt = s => { const n = (+s.p).toFixed(+s.p > 10 ? 2 : s.dec), [i, d] = n.split('.'); return i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (d ? '.' + d : ''); };
const FLAG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M6 2h2v2h11l-2.5 5 2.5 5H8v8H6z"/></svg>';
let flags = store.get('flags', {}), flt = '';
/* Flag cycle: none -> green -> red -> none */
function toggleFlag(k) {
    const n = { '': 'g', g: 'r', r: '' }[flags[k] || ''];
    if (n)
        flags[k] = n;
    else
        delete flags[k];
    store.set('flags', flags);
    buildView();
    sched();
}
$('flt').onclick = e => {
    const b = e.target.closest('button');
    if (!b)
        return;
    flt = b.dataset.f;
    [...$('flt').children].forEach(x => x.classList.toggle('on', x === b));
    buildView();
    $('list').scrollTop = 0;
    sched();
};
/* ---------- Daily open prices: Chg% = change of the current daily candle (since 00:00 UTC open) ----------
   Binance has no bulk endpoint for this, so each coin's daily open is fetched once per day (tiny
   requests, busiest coins first), cached in localStorage and reused on reload. */
const dayStart = () => { const d = new Date(); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); };
let dayMs = dayStart(), opBusy = false, opRetry = 0;
const OP_WORKERS = 24; /* parallel kline requests (HTTP/2): ~500 coins load in a few seconds instead of a minute */
let opens = (() => { const o = store.get('dopen', {}); return o.day === dayMs ? o.m : {}; })();
const calc = s => s.o ? (+s.p - s.o) / s.o * 100 : 0;
async function loadOpens() {
    if (opBusy)
        return;
    opBusy = true;
    const day = dayMs, shown = new Set(vis.map(s => s.s)), todo = all.filter(s => !s.o && s.nk !== day).sort((a, b) => (shown.has(b.s) - shown.has(a.s)) || b.qv - a.qv); /* rows on screen first, then busiest coins */
    const i = todo.findIndex(s => s.s === sym);
    if (i > 0)
        todo.unshift(todo.splice(i, 1)[0]); /* selected coin first */
    let stop = false, t = 0;
    const worker = async () => {
        while (todo.length && !stop) {
            const s = todo.shift();
            try {
                const k = await getJ(`${API}/fapi/v1/klines?symbol=${s.s}&interval=1d&limit=1`);
                if (day !== dayMs)
                    return;
                if (!Array.isArray(k)) {
                    stop = true;
                    return;
                } /* rate limit / error: retry on next refresh */
                if (k[0] && k[0][0] >= day) {
                    s.o = +k[0][1];
                    opens[s.s] = s.o;
                    s.c = calc(s);
                }
                else
                    s.nk = day; /* no candle today: don't ask again until tomorrow */
            }
            catch (_) {
                stop = true;
            }
            if (Date.now() - t > 400) {
                t = Date.now();
                buildView();
                sched();
                if (day === dayMs)
                    store.set('dopen', { day, m: opens }); /* keep progress: a reload mid-way doesn't restart from zero */
            } /* update the list while loading */
        }
    };
    await Promise.all(Array.from({ length: OP_WORKERS }, worker));
    opBusy = false;
    buildView();
    sched();
    if (day === dayMs)
        store.set('dopen', { day, m: opens });
    if (stop && day === dayMs)
        setTimeout(loadOpens, Math.min(60000, 6000 * 2 ** opRetry++)); /* rate limit / network error: retry soon, with back-off */
    else
        opRetry = 0;
}
/* New UTC day: drop yesterday's opens and fetch fresh ones */
function checkDay() {
    const d = dayStart();
    if (d === dayMs)
        return;
    dayMs = d;
    opens = {};
    all.forEach(s => { s.o = 0; s.c = 0; });
    header();
    loadOpens();
}
/* ---------- Sections (like TradingView watchlist sections) ----------
   A section is a collapsible header that spaces coins apart. Coins keep their own sort order inside each
   group. secs = ordered headers [{id,n:name,c:collapsed}], secOf = coin -> section id (no entry = top group).
   Sections are shown only when no search / flag filter is active. */
let secs = store.get('secs', []), secOf = store.get('secOf', {}), editing = null, rows = [];
const saveSecs = () => { store.set('secs', secs); store.set('secOf', secOf); };
const esc = t => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/* Section id a coin belongs to (0 = ungrouped top group) */
const gidOf = sy => secs.some(x => x.id === secOf[sy]) ? secOf[sy] : 0;
/* Manual order (set by drag & drop): list of symbols, saved in localStorage. Empty = default order (24h volume). */
let ord = store.get('ord', []), ordIx = new Map();
if (!Array.isArray(ord))
    ord = [];
const reIx = () => { ordIx = new Map(ord.map((x, i) => [x, i])); };
reIx();
function resetOrder() { ord = []; reIx(); store.set('ord', ord); buildView(); sched(); }
/* Sort a coin array in place by the active column (default: manual order, else 24h quote volume) */
function sortList(a) {
    if (sortKey) {
        const k = sortKey, d = sortDir;
        a.sort((x, y) => k === 's' ? d * ((x.mc || 0) - (y.mc || 0)) : d * (x[k] - y[k]));
    }
    else if (ord.length) {
        const ix = z => ordIx.has(z) ? ordIx.get(z) : 1e9;
        a.sort((x, y) => ix(x.s) - ix(y.s) || y.qv - x.qv);
    } /* coins not in the manual list go last */
    else
        a.sort((x, y) => y.qv - x.qv);
    return a;
}
function addSection(sx) {
    const id = 's' + Date.now().toString(36);
    if (sx) {
        const gid = gidOf(sx), grp = sortList(all.slice()).filter(s => gidOf(s.s) === gid), i = grp.findIndex(s => s.s === sx);
        secs.splice(gid === 0 ? 0 : secs.findIndex(x => x.id === gid) + 1, 0, { id, n: 'New section', c: false });
        for (const s of grp.slice(i))
            secOf[s.s] = id;
    }
    else
        secs.push({ id, n: 'New section', c: false }); /* right-click on empty space: add at the end */
    saveSecs();
    editing = id;
    buildView();
    sched();
}
function delSection(id) {
    const i = secs.findIndex(x => x.id === id);
    if (i < 0)
        return;
    const prev = i ? secs[i - 1].id : 0;
    for (const k in secOf)
        if (secOf[k] === id) {
            if (prev)
                secOf[k] = prev;
            else
                delete secOf[k];
        }
    secs.splice(i, 1);
    saveSecs();
    buildView();
    sched();
}
function toggleSec(id) {
    const x = secs.find(s => s.id === id);
    if (!x)
        return;
    x.c = !x.c;
    saveSecs();
    buildView();
    sched();
}
function renameSec(id) { editing = id; buildView(); sched(); }
function endEdit(inp, ok) {
    if (editing === null)
        return;
    const x = secs.find(s => s.id === editing);
    editing = null;
    if (x && ok) {
        x.n = inp.value.trim() || x.n;
        saveSecs();
    }
    buildView();
    sched();
}
const secHtml = x => `<div class="row sec" data-sec="${x.sec}"><span class="sc">${x.closed ? '▸' : '▾'}</span>${editing === x.sec ? `<input class="sni" maxlength="40" value="${esc(x.name)}">` : `<span class="sn">${esc(x.name)}</span>`}<span class="sk">${x.n}</span></div>`;
/* Shown name: the 1000 / 1000000 prefix of Binance's multiplied contracts is dropped (1000PEPE -> PEPE); long names get a smaller font. */
const coinName = b => b.replace(/^10{3,}(?=[A-Z])/, '');
const nmCls = b => { const n = coinName(b).length; return n > 8 ? ' xlong' : n > 5 ? ' long' : ''; };
let ver = 0;
/* Filter + sort the list, build grouped rows, set the scroll height, mark the sorted column header.
   view = selectable coins only (keyboard navigation); rows = coins + section headers (rendering) */
function buildView() {
    const q = query.trim().toUpperCase();
    const matches = all.filter(s => (!q || s.b.startsWith(q) || coinName(s.b).startsWith(q)) && (!flt || flags[s.s] === flt));
    // Search results prioritize the shortest matching ticker (e.g. S before SOL).
    const items = q
        ? matches.sort((a, b) => a.b.length - b.b.length || a.b.localeCompare(b.b) || a.s.localeCompare(b.s))
        : sortList(matches);
    if (secs.length && !q && !flt) { /* top group first, then each section; collapsed sections hide their coins */
        const g = { 0: [] };
        secs.forEach(x => g[x.id] = []);
        for (const s of items)
            g[gidOf(s.s)].push(s);
        view = [...g[0]];
        rows = [...g[0]];
        for (const x of secs) {
            rows.push({ sec: x.id, name: x.n, closed: x.c, n: g[x.id].length });
            if (!x.c) {
                view.push(...g[x.id]);
                rows.push(...g[x.id]);
            }
        }
    }
    else {
        view = items;
        rows = items;
    }
    ver++;
    $('msg').style.display = rows.length ? 'none' : 'block';
    $('msg').textContent = all.length ? (flt ? 'No flagged coins' : 'No results') : 'Loading…';
    $('sp').style.height = rows.length * ROW + 'px';
    [...$('cols').children].forEach(c => { const on = c.dataset.k === sortKey; c.className = on ? 'a' + (sortDir > 0 ? ' asc' : '') : ''; });
}
/* Virtualized list: only the visible rows (+2 buffer) exist in the DOM */
let raf = 0, vis = [], lastKey = '';
const sched = () => { raf || (raf = requestAnimationFrame(render)); };
const cTxt = s => s.o ? `${s.c >= 0 ? '' : '−'}${Math.abs(s.c).toFixed(2)}%` : '–';
const cCls = s => s.o ? (s.c >= 0 ? 'g' : 'r') : '';
function render() {
    raf = 0;
    const l = $('list'), a = Math.max(0, Math.floor(l.scrollTop / ROW) - 2), b = Math.min(rows.length, Math.ceil((l.scrollTop + l.clientHeight) / ROW) + 2);
    vis = rows.slice(a, b);
    $('in').style.transform = `translateY(${a * ROW}px)`;
    const key = a + '|' + b + '|' + ver + '|' + sym;
    if (key !== lastKey) { /* rows changed -> rebuild */
        lastKey = key;
        $('in').innerHTML = vis.map(s => s.sec ? secHtml(s) : `<div class="row${s.s === sym ? ' act' : ''}${s.s === dragS ? ' dim' : ''}" data-s="${s.s}"><button class="fl ${flags[s.s] || ''}" data-f="${s.s}" title="Flag: green / red / none">${FLAG}</button><span class="nm${nmCls(s.b)}">${coinName(s.b)}</span><b class="p ${s.d}">${fmt(s)}</b><b class="c ${cCls(s)}">${cTxt(s)}</b></div>`).join('');
        if (editing) {
            const i = $('in').querySelector('.sni');
            if (i) {
                i.focus();
                i.select();
            }
        } /* inline rename box */
    }
    else { /* same rows -> only patch changed texts */
        for (const r of $('in').children) {
            const s = map[r.dataset.s], p = r.children[2], c = r.children[3];
            if (!s)
                continue;
            const t = fmt(s);
            if (p.textContent !== t)
                p.textContent = t;
            p.className = 'p ' + s.d;
            const ct = cTxt(s);
            if (c.textContent !== ct)
                c.textContent = ct;
            c.className = 'c ' + cCls(s);
        }
    }
    if (map[sym])
        header();
    /* subscribe to the rows now visible. Throttle (not debounce): live ticks re-render constantly, and a debounce
       would never fire, leaving old rows streaming (wasted data) and newly visible rows without a live price. */
    if (!render.t)
        render.t = setTimeout(() => { render.t = 0; syncWS(); }, 250);
}
$('list').addEventListener('scroll', sched, { passive: true });
$('list').onclick = e => {
    if (Date.now() < noClick)
        return; /* the click that ends a drag */
    const h = e.target.closest('.sec');
    if (h) {
        if (!e.target.closest('input'))
            toggleSec(h.dataset.sec);
        return;
    } /* section header: collapse / expand */
    const f = e.target.closest('.fl');
    if (f) {
        toggleFlag(f.dataset.f);
        return;
    }
    const r = e.target.closest('.row');
    if (r)
        select(r.dataset.s);
};
$('list').ondblclick = e => {
    const h = e.target.closest('.sec');
    if (h && !e.target.closest('input'))
        renameSec(h.dataset.sec);
};
$('list').addEventListener('focusout', e => {
    if (e.target.classList.contains('sni'))
        endEdit(e.target, true);
});
$('list').addEventListener('keydown', e => {
    if (!e.target.classList.contains('sni'))
        return;
    if (e.key === 'Enter')
        e.target.blur();
    else if (e.key === 'Escape')
        endEdit(e.target, false);
});
/* Watchlist right-click: coin / empty space -> add section; section header -> rename / delete */
$('list').oncontextmenu = e => {
    e.preventDefault();
    if (dg && dg.on)
        return;
    const h = e.target.closest('.sec'), r = e.target.closest('.row:not(.sec)'), rst = ord.length ? [['Reset order (by volume)', resetOrder]] : [];
    if (h)
        showMenu(e.clientX, e.clientY, [['Rename section', () => renameSec(h.dataset.sec)], ['Delete section', () => delSection(h.dataset.sec)], ...rst]);
    else
        showMenu(e.clientX, e.clientY, [['Add section', () => addSection(r && r.dataset.s)], ...rst]);
};
/* Header click: sort cycle (first direction -> opposite -> default order) */
$('cols').onclick = e => {
    if (e.target.closest('.gr'))
        return;
    const k = e.target.closest('span')?.dataset.k;
    if (!k)
        return;
    const first = -1;
    if (sortKey !== k) {
        sortKey = k;
        sortDir = first;
    }
    else if (sortDir === first)
        sortDir = -first;
    else
        sortKey = null;
    buildView();
    $('list').scrollTop = 0;
    sched();
};
/* Convert Persian-layout keystrokes to their English key positions in Search.
   This lets symbol searches work even when the system keyboard is set to Persian. */
const faKeyMap = {
    'ض': 'q', 'ص': 'w', 'ث': 'e', 'ق': 'r', 'ف': 't', 'غ': 'y', 'ع': 'u', 'ه': 'i', 'خ': 'o', 'ح': 'p', 'ج': '[', 'چ': ']', 'پ': '\\',
    'ش': 'a', 'س': 's', 'ی': 'd', 'ي': 'd', 'ب': 'f', 'ل': 'g', 'ا': 'h', 'آ': 'h', 'ت': 'j', 'ن': 'k', 'م': 'l', 'ک': ';', 'ك': ';', 'گ': "'",
    'ظ': 'z', 'ط': 'x', 'ز': 'c', 'ر': 'v', 'ذ': 'b', 'د': 'n', 'ئ': 'm', 'ء': 'm', 'ؤ': ',', 'و': ',', '،': ',', '؟': '?', 'ژ': 'C'
};
const englishSearchText = value => Array.from(value, ch => faKeyMap[ch] ?? ch).join('');
$('q').oninput = e => {
    const converted = englishSearchText(e.target.value);
    if (converted !== e.target.value) {
        const pos = e.target.selectionStart;
        e.target.value = converted;
        try {
            e.target.setSelectionRange(pos, pos);
        }
        catch (_) { }
    }
    query = converted;
    buildView();
    $('list').scrollTop = 0;
    sched();
};
/* Type-to-search: letters typed anywhere on the chart/watchlist focus the search box.
   Keep normal typing intact in inputs, textareas, menus, and editable controls. */
const isSearchTypingTarget = t => !!(t && (t.isContentEditable || t.closest?.('input,textarea,select,[contenteditable="true"]')));
document.addEventListener('keydown', e => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || isSearchTypingTarget(e.target))
        return;
    const typedKey = englishSearchText(e.key).toUpperCase();
    if (!/^[A-Z]$/.test(typedKey))
        return;
    const search = $('q');
    if (!search || search.disabled)
        return;
    e.preventDefault();
    search.focus({ preventScroll: true });
    search.value += typedKey;
    search.dispatchEvent(new Event('input', { bubbles: true }));
}, true);
let selT = 0;
/* Select a coin (kb = keyboard navigation, slightly debounced) */
function select(s, kb) {
    // Choosing a search result returns to the full watchlist and brings the coin into view.
    const fromSearch = !!(query || $('q').value);
    if (fromSearch) {
        query = '';
        $('q').value = '';
        // A coin inside a collapsed section cannot be scrolled to until that section is expanded.
        const sectionId = gidOf(s);
        const section = secs.find(x => x.id === sectionId);
        if (section && section.c) {
            section.c = false;
            saveSecs();
        }
        buildView();
        const targetIndex = rows.findIndex(row => row && row.s === s);
        if (targetIndex >= 0) {
            const list = $('list');
            // Set the scroll position after the view is rebuilt, then render the virtual rows.
            list.scrollTop = Math.max(0, targetIndex * ROW);
            sched();
            requestAnimationFrame(() => {
                const currentIndex = rows.findIndex(row => row && row.s === s);
                if (currentIndex >= 0) {
                    list.scrollTop = currentIndex * ROW;
                    sched();
                }
            });
        } else {
            sched();
        }
    }
    if (s === sym)
        return;
    sym = s;
    store.set(SAVED_SYMBOL_KEY, sym);
    history.replaceState(null, '', '#' + s);
    resetState();
    header();
    sched();
    clearTimeout(selT);
    selT = setTimeout(() => { loadChart(); syncWS(); }, kb ? 140 : 0);
}
/* Arrow Up / Down: previous / next coin in the list */
document.addEventListener('keydown', e => {
    if ((e.key !== 'ArrowUp' && e.key !== 'ArrowDown') || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey)
        return;
    const t = e.target, tag = t.tagName;
    if ((tag === 'INPUT' && t.id !== 'q') || tag === 'SELECT' || tag === 'TEXTAREA' || !view.length)
        return;
    e.preventDefault();
    const i = view.findIndex(s => s.s === sym), d = e.key === 'ArrowDown' ? 1 : -1;
    const n = i < 0 ? (d > 0 ? 0 : view.length - 1) : Math.min(view.length - 1, Math.max(0, i + d));
    if (n === i)
        return;
    select(view[n].s, true);
    const l = $('list'), top = rows.indexOf(view[n]) * ROW;
    if (top < l.scrollTop)
        l.scrollTop = top;
    else if (top + ROW > l.scrollTop + l.clientHeight)
        l.scrollTop = top + ROW - l.clientHeight;
    sched();
});
/* Chart shortcuts: activate drawing tools immediately, with no extra toolbar click. */
const isTypingTarget = t => !!(t && (t.isContentEditable || t.closest?.('input,textarea,select,[contenteditable="true"]')));
function activateDrawingTool(type) {
    if (window.DR?.ctl?.setTool)
        window.DR.ctl.setTool(type);
}
function nextCoin() {
    if (!view.length)
        return;
    const i = view.findIndex(s => s.s === sym), n = i < 0 ? 0 : (i + 1) % view.length;
    select(view[n].s, true);
    const l = $('list'), top = rows.indexOf(view[n]) * ROW;
    if (top < l.scrollTop)
        l.scrollTop = top;
    else if (top + ROW > l.scrollTop + l.clientHeight)
        l.scrollTop = top + ROW - l.clientHeight;
    sched();
}
document.addEventListener('keydown', e => {
    if (isTypingTarget(e.target))
        return;
    if (e.code === 'Space' && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        e.preventDefault();
        nextCoin();
        return;
    }
    // TradingView-compatible chart reset. Rectangle has moved to Alt+Shift+R.
    if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.code === 'KeyR') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (typeof resetChartView === 'function') resetChartView();
    }
}, true);
addEventListener('hashchange', () => {
    const h = location.hash.slice(1).toUpperCase();
    if (h && map[h])
        select(h);
});
/* ---------- Drag & drop: reorder coins (and move them between sections) ----------
   Mouse: press a row and drag. Touch: long-press a row, then drag. The first drop switches the list to a
   manual order (saved); right-click -> "Reset order" goes back to sorting by volume. */
let dg = null, dragS = '', noClick = 0;
$('list').addEventListener('pointerdown', e => {
    if (dg || e.button || (e.pointerType === 'mouse' && e.buttons !== 1))
        return;
    const r = e.target.closest('.row');
    if (!r || !r.dataset.s || e.target.closest('.fl,input'))
        return;
    dg = { s: r.dataset.s, x: e.clientX, y: e.clientY, px: e.clientX, py: e.clientY, id: e.pointerId, on: false, touch: e.pointerType === 'touch', slot: -1, t: 0, raf: 0, dy: 0, g: null };
    if (dg.touch)
        dg.t = setTimeout(() => {
            if (dg && !dg.on)
                dgStart();
        }, 320); /* long-press = start dragging */
    document.addEventListener('pointermove', dgMove);
    document.addEventListener('pointerup', dgEnd);
    document.addEventListener('pointercancel', dgEnd);
});
function dgMove(e) {
    if (!dg || e.pointerId !== dg.id)
        return;
    dg.px = e.clientX;
    dg.py = e.clientY;
    if (dg.on)
        return; /* the animation-frame loop follows the pointer */
    if (Math.hypot(dg.px - dg.x, dg.py - dg.y) > (dg.touch ? 10 : 5)) {
        if (dg.touch)
            dgStop(false);
        else
            dgStart();
    } /* touch moved early = the user is scrolling */
}
function dgStart() {
    const d = dg, row = $('in').querySelector(`[data-s="${d.s}"]`);
    if (!row) {
        dgStop(false);
        return;
    }
    d.on = true;
    dragS = d.s;
    const rc = row.getBoundingClientRect(), g = row.cloneNode(true);
    g.className = 'row gh';
    g.style.width = rc.width + 'px';
    g.style.height = rc.height + 'px';
    g.style.left = rc.left + 'px';
    d.dy = d.y - rc.top;
    d.g = g;
    document.body.appendChild(g);
    row.classList.add('dim');
    document.body.classList.add('dnd');
    try {
        $('list').setPointerCapture(d.id);
    }
    catch (_) { }
    d.raf = requestAnimationFrame(dgTick);
}
/* Move the floating row, work out the drop slot (0..rows.length = "before rows[slot]") and show the blue line */
function dgUpd() {
    const d = dg, l = $('list'), rc = l.getBoundingClientRect();
    d.g.style.transform = `translateY(${d.py - d.dy}px)`;
    const out = d.px < rc.left - 40 || d.px > rc.right + 40; /* pointer far outside the list = cancel */
    const y = d.py - d.dy + ROW / 2 - rc.top + l.scrollTop; /* centre of the floating row, in list coordinates */
    const s = clamp(Math.round(y / ROW), 0, rows.length), pv = rows[s - 1], nx = rows[s];
    d.slot = out ? -1 : s;
    const dl = $('dl');
    dl.hidden = out || !!((pv && pv.s === d.s) || (nx && nx.s === d.s)); /* no line when it would stay where it is */
    if (!dl.hidden)
        dl.style.transform = `translateY(${s * ROW}px)`;
}
function dgTick() {
    const d = dg;
    if (!d || !d.on)
        return;
    const l = $('list'), rc = l.getBoundingClientRect(), z = 48;
    const v = d.py < rc.top + z ? -clamp((rc.top + z - d.py) / z, 0, 1) : d.py > rc.bottom - z ? clamp((d.py - rc.bottom + z) / z, 0, 1) : 0;
    if (v && d.px >= rc.left - 40 && d.px <= rc.right + 40)
        l.scrollTop += Math.round(v * 16); /* auto-scroll near the top / bottom edge */
    dgUpd();
    d.raf = requestAnimationFrame(dgTick);
}
function dgStop(drop) {
    const d = dg;
    if (!d)
        return;
    dg = null;
    clearTimeout(d.t);
    cancelAnimationFrame(d.raf);
    document.removeEventListener('pointermove', dgMove);
    document.removeEventListener('pointerup', dgEnd);
    document.removeEventListener('pointercancel', dgEnd);
    if (!d.on)
        return;
    if (drop && d.slot >= 0)
        dropCoin(d.s, d.slot);
    d.g.remove();
    $('dl').hidden = true;
    document.body.classList.remove('dnd');
    dragS = '';
    noClick = Date.now() + 300;
    lastKey = '';
    sched();
}
function dgEnd(e) {
    if (!dg || e.pointerId !== dg.id)
        return;
    if (dg.on) {
        dg.px = e.clientX;
        dg.py = e.clientY;
        dgUpd();
    }
    dgStop(e.type === 'pointerup');
}
/* Put coin `sy` at slot `s` of the current rows: updates the manual order and, with sections, its section */
function dropCoin(sy, s) {
    const pv = rows[s - 1], nx = rows[s];
    if (!map[sy] || (pv && pv.s === sy) || (nx && nx.s === sy))
        return; /* dropped where it already is */
    const grouped = secs.length && !query.trim() && !flt;
    ord = sortList(all.slice()).map(x => x.s).filter(x => x !== sy); /* freeze the order currently shown (minus the moved coin) */
    let g = gidOf(sy), anchor = null, before = true;
    if (grouped)
        g = !pv ? 0 : pv.sec ? pv.sec : gidOf(pv.s); /* section of the row above the slot (a header = top of that section) */
    if (nx && nx.s)
        anchor = nx.s;
    else if (pv && pv.s) {
        anchor = pv.s;
        before = false;
    }
    else if (grouped && pv && pv.sec)
        anchor = ord.find(x => gidOf(x) === g) || null; /* empty / collapsed section: first coin of it */
    const i = anchor ? ord.indexOf(anchor) : -1;
    if (i < 0)
        ord.push(sy);
    else
        ord.splice(before ? i : i + 1, 0, sy);
    if (grouped) {
        if (g)
            secOf[sy] = g;
        else
            delete secOf[sy];
        const x = secs.find(z => z.id === g);
        if (x && x.c)
            x.c = false; /* dropping into a collapsed section opens it */
        saveSecs();
    }
    sortKey = null;
    reIx();
    store.set('ord', ord);
    buildView();
    sched();
}
document.addEventListener('touchmove', e => {
    if (dg && dg.on && e.cancelable)
        e.preventDefault();
}, { passive: false }); /* no page scroll while dragging (touch) */
document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && dg)
        dgStop(false);
});
addEventListener('blur', () => dgStop(false));
/* ---------- Watchlist columns: drag the dividers in the header to resize Symbol / Last / Chg% ----------
   Widths are kept as proportions of the panel (CSS vars --c1..--c3), so they scale when the panel is resized.
   Dragging a divider moves space between its two neighbours; double-click a divider to reset. */
const CW0 = [1, 1, 1], CMIN = 52;
let cw = store.get('cw2', CW0), cr = null;
if (!Array.isArray(cw) || cw.length !== 3 || !cw.every(v => v > 0))
    cw = CW0.slice();
const applyCols = () => cw.forEach((v, i) => document.documentElement.style.setProperty('--c' + (i + 1), v + 'fr'));
applyCols();
$('cols').addEventListener('pointerdown', e => {
    const h = e.target.closest('.gr');
    if (!h || e.button)
        return;
    e.preventDefault();
    cr = { i: +h.dataset.i, x: e.clientX, h, ws: [...$('cols').children].slice(1).map(c => c.getBoundingClientRect().width) }; /* current pixel widths */
    try {
        h.setPointerCapture(e.pointerId);
    }
    catch (_) { }
    h.classList.add('on');
    document.body.classList.add('crs');
});
$('cols').addEventListener('pointermove', e => {
    if (!cr)
        return;
    const { i, ws } = cr, tot = ws[i] + ws[i + 1];
    if (tot < 2 * CMIN)
        return;
    const a = clamp(ws[i] + e.clientX - cr.x, CMIN, tot - CMIN);
    cw = ws.slice();
    cw[i] = a;
    cw[i + 1] = tot - a;
    cw = cw.map(v => Math.round(v * 10) / 10);
    applyCols();
});
const crEnd = () => {
    if (!cr)
        return;
    cr.h.classList.remove('on');
    cr = null;
    document.body.classList.remove('crs');
    store.set('cw2', cw);
};
$('cols').addEventListener('pointerup', crEnd);
$('cols').addEventListener('pointercancel', crEnd);
$('cols').addEventListener('dblclick', e => {
    if (e.target.closest('.gr')) {
        cw = CW0.slice();
        applyCols();
        store.set('cw2', cw);
    }
});

/* The list's scrollbar narrows the rows but not the header. Reserve the same width in the header (--sbw)
   so every header label, e.g. "Chg%", sits exactly above the values below it. */
const syncSbw = () => { const l = $('list'); document.documentElement.style.setProperty('--sbw', Math.max(0, l.offsetWidth - l.clientWidth) + 'px'); };
new ResizeObserver(syncSbw).observe($('list'));
syncSbw();
/* ---------- Watchlist panel: drag to resize, button to move it to the other side ---------- */
const side = $('side'), rs = $('rs');
let sw = store.get('sw2', 0), /* 0 = default: a quarter of the window */ sh = store.get('sh', 0), sf = store.get('sf', false), drag = false;
const watchToggle = $('btnWatch');
let watchHidden = store.get('watchlistHidden', false);
function applyWatchlistVisibility() {
    document.body.classList.toggle('watchlist-hidden', watchHidden);
    if (watchToggle) {
        watchToggle.title = watchHidden ? 'Show watchlist' : 'Hide watchlist';
        watchToggle.setAttribute('aria-label', watchHidden ? 'Show watchlist' : 'Hide watchlist');
        watchToggle.setAttribute('aria-pressed', String(!watchHidden)); /* pressed = watchlist is shown */
    }
}
if (watchToggle) {
    watchToggle.addEventListener('click', () => {
        watchHidden = !watchHidden;
        store.set('watchlistHidden', watchHidden);
        applyWatchlistVisibility();
        requestAnimationFrame(() => {
            if (typeof sched === 'function') sched();
        });
    });
}
applyWatchlistVisibility();
const narrow = () => innerWidth <= 820; /* narrow screens: panel sits below the chart, resize changes its height */
function applySide() {
    document.body.classList.toggle('flip', sf);
    side.style.width = narrow() ? '' : clamp(sw || innerWidth * .25, 300, Math.max(300, innerWidth * .7)) + 'px';
    side.style.height = narrow() && sh ? clamp(sh, 160, innerHeight - 200) + 'px' : '';
}
rs.onpointerdown = e => { rs.setPointerCapture(e.pointerId); drag = true; document.body.classList.add('drag'); };
rs.onpointermove = e => {
    if (!drag)
        return;
    if (narrow())
        sh = innerHeight - e.clientY;
    else
        sw = sf ? e.clientX : innerWidth - e.clientX;
    applySide();
};
rs.onpointerup = rs.onpointercancel = () => {
    if (!drag)
        return;
    drag = false;
    document.body.classList.remove('drag');
    store.set('sw2', sw);
    store.set('sh', sh);
    sched();
};
$('mv').onclick = () => { sf = !sf; store.set('sf', sf); applySide(); };
addEventListener('resize', () => { applySide(); sched(); });
applySide();
/* ---------- Market-cap ranking (CoinGecko; keyed by ticker symbol) ---------- */
const marketCaps = new Map();
const MCAP_TTL = 24 * 36e5; /* ranking changes slowly: one ~600 KB download per day instead of one per page load */
const mcapCache = store.get('mcap', null);
if (mcapCache && mcapCache.m)
    for (const k in mcapCache.m)
        marketCaps.set(k, mcapCache.m[k]); /* instant, no network */
async function loadMarketCaps() {
    if (mcapCache && mcapCache.m && Date.now() - mcapCache.t < MCAP_TTL)
        return;
    try {
        const pages = await Promise.all([1, 2].map(page => fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=${page}&sparkline=false`).then(r => r.ok ? r.json() : [])));
        for (const coin of pages.flat()) {
            const k = String(coin.symbol || '').toUpperCase(), cap = Number(coin.market_cap) || 0;
            if (k && cap > 0 && cap > (marketCaps.get(k) || 0))
                marketCaps.set(k, cap);
        }
        if (marketCaps.size)
            store.set('mcap', { t: Date.now(), m: Object.fromEntries(marketCaps) });
        for (const x of all)
            x.mc = marketCaps.get(x.b) || 0;
        if (sortKey === 's') {
            buildView();
            sched();
        }
    }
    catch (_) { }
}
loadMarketCaps();
/* ---------- Ticker data ---------- */
/* Merge REST 24h ticker data into the symbol table (USDT perpetuals only) */
const HIDDEN_COINS = new Set(['USDCUSDT', 'BTCDOMUSDT']); /* not shown in the watchlist */
/* Counters for the last ticker list: total contracts returned by Binance vs. what the watchlist shows.
   Run coinStats() in the browser console to see them. */
let coinStatsInfo = { total: 0, shown: 0, dated: 0, notUsdt: 0, hidden: 0 };
window.coinStats = () => ({ ...coinStatsInfo, inWatchlist: all.length });
function ingest(arr) {
    const st = { total: arr.length, shown: 0, dated: 0, notUsdt: 0, hidden: 0 };
    for (const t of arr) {
        const n = t.symbol;
        if (n.includes('_')) { /* dated delivery futures (BTCUSDT_261225) are not perpetuals */
            st.dated++;
            continue;
        }
        if (!n.endsWith('USDT')) { /* USDC-margined perpetuals duplicate the USDT coins */
            st.notUsdt++;
            continue;
        }
        if (HIDDEN_COINS.has(n) || /[\x00-\x20]/.test(n)) {
            st.hidden++;
            continue;
        }
        st.shown++;
        let s = map[n];
        const p = t.lastPrice;
        if (!s) {
            s = map[n] = { s: n, b: n.slice(0, -4), p, c: 0, o: opens[n] || 0, qv: 0, mc: marketCaps.get(n.slice(0, -4)) || 0, d: '', dec: (p.split('.')[1] || '').length };
            all.push(s);
        }
        s.d = +p > +s.p ? 'up' : +p < +s.p ? 'dn' : s.d;
        s.p = p;
        s.qv = +t.quoteVolume;
        s.c = calc(s);
    }
    /* contracts Binance no longer lists (delisted) leave the watchlist; the list is edited in place */
    if (arr.length > 100) {
        const live = new Set(arr.map(t => t.symbol)), keep = all.filter(s => live.has(s.s));
        if (keep.length !== all.length) {
            all.length = 0;
            all.push(...keep);
            for (const k in map)
                if (!live.has(k))
                    delete map[k];
        }
    }
    if (st.shown !== coinStatsInfo.shown)
        console.info('[coins] Binance returned', st.total, 'contracts; watchlist shows', st.shown, '(dated', st.dated, '| non-USDT', st.notUsdt, '| hidden', st.hidden + ')');
    coinStatsInfo = st;
}
let lastRef = 0;
async function refresh(first, force) {
    /* the full 24h list is ~0.5k symbols; skip it if one was fetched moments ago (tab switches, reconnects) */
    if (!first && !force && Date.now() - lastRef < 45000)
        return;
    lastRef = Date.now();
    checkDay();
    try {
        const arr = await (first ? P_T : fetch(API + '/fapi/v1/ticker/24hr').then(r => r.json()));
        if (!Array.isArray(arr))
            throw 0;
        ingest(arr);
        buildView();
        if (first && !map[sym])
            sym = 'BTCUSDT';
        header();
        sched();
        if (all.some(s => !s.o && s.nk !== dayMs))
            loadOpens();
    } /* fetch any missing daily opens */
    catch (e) {
        if (!all.length)
            $('msg').textContent = 'Failed to load (check network / VPN)';
    }
}
/* ---------- WebSocket (live prices + live candle) ---------- */
let ws, subs = new Set(), mid = 1, lastMsg = 0, hadWS = false, idle = false, idleT = 0, ciT = 0;
/* Streams we need: the selected coin (price + candle) and, while the tab is visible, the visible rows */
function wanted() {
    const w = new Set();
    if (idle)
        return w; /* tab in the background for a while: no live data at all (it is caught up on return) */
    if (!document.hidden)
        vis.filter(s => s.s).forEach(s => w.add(s.s.toLowerCase() + '@miniTicker'));
    w.add(sym.toLowerCase() + '@miniTicker');
    w.add(`${sym.toLowerCase()}@kline_${tf}`);
    return w;
}
/* Send only the SUBSCRIBE / UNSUBSCRIBE difference */
function syncWS() {
    if (!ws || ws.readyState !== 1)
        return;
    const w = wanted();
    const add = [...w].filter(x => !subs.has(x)), del = [...subs].filter(x => !w.has(x));
    if (add.length && !subs.size)
        lastMsg = Date.now(); /* fresh start after a pause: don't let the watchdog judge the socket by old traffic */
    if (add.length)
        ws.send(JSON.stringify({ method: 'SUBSCRIBE', params: add, id: mid++ }));
    if (del.length)
        ws.send(JSON.stringify({ method: 'UNSUBSCRIBE', params: del, id: mid++ }));
    subs = w;
}
function connect() {
    ws = new WebSocket(WSU);
    /* on reconnect, fill any candles / prices missed while offline */
    ws.onopen = () => {
        subs = new Set();
        lastMsg = Date.now();
        syncWS();
        /* Binance pushes a message whenever a contract is added / changed: reload the coin list right away */
        ws.send(JSON.stringify({ method: 'SUBSCRIBE', params: ['!contractInfo'], id: mid++ }));
        if (hadWS && !idle) {
            catchUp(true);
            refresh(false, true);
        }
        hadWS = true;
    };
    ws.onclose = () => setTimeout(connect, 2000);
    ws.onmessage = e => {
        lastMsg = Date.now();
        const m = JSON.parse(e.data), x = m.data;
        if (!x)
            return;
        if (x.e === '24hrMiniTicker') {
            const s = map[x.s];
            if (!s)
                return;
            s.d = +x.c > +s.p ? 'up' : +x.c < +s.p ? 'dn' : s.d;
            s.p = x.c;
            s.c = calc(s);
            sched();
        }
        else if (x.e === 'contractInfo') {
            clearTimeout(ciT);
            ciT = setTimeout(() => refresh(false, true), 4000);
        }
        else if (x.e === 'kline' && x.s === sym && x.k.i === tf) {
            const k = x.k, b = bar(k);
            skew = x.E - Date.now();
            skewOk = true; /* server-vs-local clock offset for an accurate countdown */
            lastClose = b.close;
            lastUp = b.close >= b.open;
            closeAt = k.T + 1;
            if (data.length) {
                applyBar(b);
                window.IND && IND.tick();
            }
            else
                pend = b; /* history not loaded yet -> keep it */
        }
    };
}
/* ---------- Watchdog: dead socket, missed candle close, tab/network coming back ---------- */
setInterval(() => {
    checkDay();
    if (document.hidden)
        return;
    const t = Date.now();
    if (ws && ws.readyState === 1 && t - lastMsg > 12000)
        ws.close(); /* silently dead socket -> reconnect */
    if (skewOk && closeAt && t + skew > closeAt + 1500)
        catchUp(); /* candle closed but the next one never arrived -> fetch it */
}, 1000);
document.addEventListener('visibilitychange', () => {
    clearTimeout(idleT);
    if (document.hidden) {
        syncWS(); /* drops the row streams right away */
        idleT = setTimeout(() => { idle = true; syncWS(); }, 30000); /* ...and every stream after 30s in the background */
        return;
    }
    const wasIdle = idle;
    idle = false;
    if (!wasIdle && ws && ws.readyState === 1 && Date.now() - lastMsg > 5000)
        ws.close();
    refresh();
    syncWS();
    catchUp(true);
});
addEventListener('online', () => { refresh(false, true); catchUp(true); });
/* Full 24h list: every 60s only while the socket is down; with live streams running the visible rows already update
   themselves, so a refresh every 3 minutes (volume ranking, new listings) is enough. */
setInterval(() => {
    if (document.hidden)
        return;
    const live = ws && ws.readyState === 1 && Date.now() - lastMsg < 12000;
    if (Date.now() - lastRef >= (live ? 180000 : 60000))
        refresh(false, true);
}, 15000);
/* ---------- Start ---------- */
setColors(cUp, cDn);
refresh(true).then(() => { loadChart(true); connect(); });
/* ---------- Mobile navigation: bottom tab bar (Watchlist / Chart / Draw) ----------
   Phones show one page at a time. The tab bar is only displayed by the mobile CSS layout;
   on desktop it is hidden and the classes set here have no visual effect. */
const mnav = $('mnav');
if (mnav) {
    let mView = 'chart', mTools = store.get('mobileTools', false);
    const mobileNavOn = () => getComputedStyle(mnav).display !== 'none';
    function applyMobileView() {
        const toolsOn = mTools && mView === 'chart';
        document.body.classList.toggle('mview-watch', mView === 'watch');
        document.body.classList.toggle('m-tools', toolsOn);
        mnav.querySelectorAll('button').forEach(b => {
            const k = b.dataset.view, on = k === 'draw' ? toolsOn : k === mView;
            b.classList.toggle('on', on);
            b.setAttribute('aria-pressed', String(on));
        });
        requestAnimationFrame(() => sched());
    }
    mnav.addEventListener('click', e => {
        const b = e.target.closest('button[data-view]');
        if (!b)
            return;
        if (b.dataset.view === 'draw') {
            mTools = mView === 'watch' ? true : !mTools;
            mView = 'chart';
            store.set('mobileTools', mTools);
        }
        else
            mView = b.dataset.view;
        applyMobileView();
    });
    /* Picking a coin in the watchlist jumps to the chart (select() itself already ran) */
    $('list').addEventListener('click', e => {
        if (!mobileNavOn() || Date.now() < noClick || e.target.closest('.sec,.fl,.sni'))
            return;
        if (e.target.closest('.row')) {
            mView = 'chart';
            applyMobileView();
        }
    });
    applyMobileView();
}
