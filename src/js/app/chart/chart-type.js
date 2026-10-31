/* ---------- Chart type (TradingView "Chart type" menu) ----------
   The candlestick `series` always stays on the chart: drawings, the countdown, the price line, markers and every
   coordinate helper depend on it. Candle-like types (Candles, Hollow, Heikin Ashi, High-low) only change the data and the
   per-bar colours that are sent to it. Every other type (Bars, Line, Area, Baseline, Columns ...) hides the candles and draws
   an extra helper series (chartAlts) from the same data. All writes go through setBars() / updateBar(). */
const CLEAR = 'rgba(0,0,0,0)';
const TYPE_ICONS = {
    bars: '<path d="M6 3v14M6 6H3.5M6 13h2.5M14 2v13M14 5h-2.5M14 11h2.5"/>',
    candles: '<path d="M6 2.5v3M6 14v3.5M14 4v2M14 15v2.5"/><rect x="4" y="5.5" width="4" height="8.5" rx=".6"/><rect x="12" y="6" width="4" height="9" rx=".6"/>',
    hollow: '<path d="M6 2.5v3M6 14v3.5M14 4v2M14 15v2.5"/><rect x="4" y="5.5" width="4" height="8.5" rx=".6" fill="none"/><rect x="12" y="6" width="4" height="9" rx=".6" class="solid"/>',
    line: '<path d="m2.5 14 4.5-5 3.5 3.5 6.5-8" fill="none"/>',
    linemk: '<path d="m2.5 14 4.5-5 3.5 3.5 6.5-8" fill="none"/><circle cx="2.5" cy="14" r="1.4" class="solid"/><circle cx="7" cy="9" r="1.4" class="solid"/><circle cx="10.5" cy="12.5" r="1.4" class="solid"/><circle cx="17" cy="4.5" r="1.4" class="solid"/>',
    step: '<path d="M2.5 14h4V9h4v4h3V5h3.5" fill="none"/>',
    area: '<path d="m2.5 14 4.5-5 3.5 3.5 6.5-8V17h-14z" class="soft"/><path d="m2.5 14 4.5-5 3.5 3.5 6.5-8" fill="none"/>',
    hlcarea: '<path d="m2.5 8 4.5-3 3.5 3 6.5-4M2.5 15l4.5-3 3.5 3 6.5-4" fill="none"/><path d="m2.5 11.5 4.5-3.5 3.5 3.5 6.5-5" fill="none" stroke-dasharray="2 1.6"/>',
    baseline: '<path d="M2.5 10h15" stroke-dasharray="2 2" fill="none"/><path d="m2.5 14 4.5-5 3.5 4 6.5-8" fill="none"/>',
    columns: '<path d="M4.5 17V9M8.5 17V5M12.5 17v-6M16.5 17V7" stroke-width="3" fill="none"/>',
    hilo: '<rect x="3.5" y="4" width="3" height="11" rx=".6" class="solid"/><rect x="8.5" y="7" width="3" height="9" rx=".6" class="solid"/><rect x="13.5" y="3" width="3" height="10" rx=".6" class="solid"/>',
    ha: '<path d="M6 2.5v2M6 15v2.5M14 4v1.5M14 15v2"/><rect x="4" y="4.5" width="4" height="10.5" rx=".6" class="solid"/><rect x="12" y="5.5" width="4" height="9.5" rx=".6" fill="none"/>'
};
const CHART_TYPES = [
    ['bars', 'Bars'], ['candles', 'Candles'], ['hollow', 'Hollow candles'],
    ['line', 'Line'], ['linemk', 'Line with markers'], ['step', 'Step line'],
    ['area', 'Area'], ['hlcarea', 'HLC area'], ['baseline', 'Baseline'], ['columns', 'Columns'],
    ['hilo', 'High-low'], ['ha', 'Heikin Ashi']
];
const CANDLE_BASED = new Set(['candles', 'hollow', 'hilo', 'ha']);
const typeIcon = (id, size = 20) => `<svg class="ct-ico" viewBox="0 0 20 20" width="${size}" height="${size}" aria-hidden="true">${TYPE_ICONS[id] || TYPE_ICONS.candles}</svg>`;
const typeName = id => (CHART_TYPES.find(t => t[0] === id) || CHART_TYPES[1])[1];

let chartType = store.get('chartType', 'candles');
if (!CHART_TYPES.some(t => t[0] === chartType)) chartType = 'candles';
/* colour / thickness of the single-colour types (Line, Area, Baseline, High-low ...) */
const LINE_DEFAULT = { color: '#2962FF', width: 2 };
const lineCfg = Object.assign({}, LINE_DEFAULT, store.get('lineCfg', {}));

let haArr = []; /* Heikin Ashi candles aligned with `data` */
const haOf = (prev, b) => {
    const close = (b.open + b.high + b.low + b.close) / 4, open = prev ? (prev.open + prev.close) / 2 : (b.open + b.close) / 2;
    return { time: b.time, open, close, high: Math.max(b.high, open, close), low: Math.min(b.low, open, close) };
};

/* colour of one candle-like bar: each of body / border / wick has its own up and down colour (+ opacity, + on/off) */
function barColors(b, prev) {
    const cfg = window.candleCfg;
    const up = cfg.prevClose && prev ? b.close >= prev.close : b.close >= b.open;
    const pick = k => { const c = cfg[k]; return c.on ? rgbaC(up ? c.up : c.dn, up ? c.upO : c.dnO) : CLEAR; };
    return { up, color: pick('body'), borderColor: pick('border'), wickColor: pick('wick') };
}
function candlePoint(b, prev, i) {
    if (!CANDLE_BASED.has(chartType)) return { time: b.time, open: b.open, high: b.high, low: b.low, close: b.close, color: CLEAR, borderColor: CLEAR, wickColor: CLEAR };
    if (chartType === 'hilo') {
        const c = rgbaC(lineCfg.color, 100);
        return { time: b.time, open: b.low, high: b.high, low: b.low, close: b.high, color: c, borderColor: c, wickColor: c };
    }
    if (chartType === 'ha') {
        const h = haArr[i] || haOf(null, b), k = barColors(h, haArr[i - 1]);
        return { time: b.time, open: h.open, high: h.high, low: h.low, close: h.close, color: k.color, borderColor: k.borderColor, wickColor: k.wickColor };
    }
    const k = barColors(b, prev);
    if (chartType === 'hollow') {
        /* hollow = rising bars are empty, falling bars are filled; the outline follows the previous close */
        const filled = b.close < b.open, cfg = window.candleCfg, o = barColors(Object.assign({}, b, { open: prev ? prev.close : b.open }), null);
        return { time: b.time, open: b.open, high: b.high, low: b.low, close: b.close, color: filled ? (cfg.body.on ? rgbaC(cfg.body.dn, cfg.body.dnO) : CLEAR) : CLEAR, borderColor: o.borderColor, wickColor: o.wickColor };
    }
    return { time: b.time, open: b.open, high: b.high, low: b.low, close: b.close, color: k.color, borderColor: k.borderColor, wickColor: k.wickColor };
}
/* points for the helper series of the non-candle types, in the same order as chartAlts */
function altPoints(b, prev) {
    const up = b.close >= (prev ? prev.close : b.open), cu = rgbaC(cUp, 100), cd = rgbaC(cDn, 100);
    switch (chartType) {
        case 'bars': return [{ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close }];
        case 'columns': return [{ time: b.time, value: b.close, color: up ? rgbaC(cUp, cUpOpacity) : rgbaC(cDn, cDnOpacity) }];
        case 'hlcarea': return [{ time: b.time, value: b.close }, { time: b.time, value: b.high }, { time: b.time, value: b.low }];
        case 'line': case 'linemk': case 'step': case 'area': case 'baseline': return [{ time: b.time, value: b.close }];
    }
    return [];
}
function buildAlts() {
    chartAlts.forEach(s => { try { chart.removeSeries(s); } catch (_) { } });
    chartAlts = [];
    const pf = series.options().priceFormat, c = lineCfg.color, w = lineCfg.width, LT = LightweightCharts.LineType || {};
    const base = { priceFormat: pf, priceLineVisible: false, lastValueVisible: false };
    const line = (o) => chart.addLineSeries(Object.assign({ crosshairMarkerVisible: true }, base, o));
    switch (chartType) {
        case 'bars': chartAlts = [chart.addBarSeries(Object.assign({ upColor: rgbaC(cUp, cUpOpacity), downColor: rgbaC(cDn, cDnOpacity), thinBars: false }, base))]; break;
        case 'line': chartAlts = [line({ color: c, lineWidth: w })]; break;
        case 'linemk': chartAlts = [line({ color: c, lineWidth: w, pointMarkersVisible: true })]; break;
        case 'step': chartAlts = [line({ color: c, lineWidth: w, lineType: LT.WithSteps ?? 1 })]; break;
        case 'area': chartAlts = [chart.addAreaSeries(Object.assign({ lineColor: c, lineWidth: w, topColor: rgbaC(c, 28), bottomColor: rgbaC(c, 0), crosshairMarkerVisible: true }, base))]; break;
        case 'hlcarea': chartAlts = [
            chart.addAreaSeries(Object.assign({ lineColor: c, lineWidth: w, topColor: rgbaC(c, 18), bottomColor: rgbaC(c, 0), crosshairMarkerVisible: false }, base)),
            line({ color: rgbaC(cUp, 100), lineWidth: 1, crosshairMarkerVisible: false }), line({ color: rgbaC(cDn, 100), lineWidth: 1, crosshairMarkerVisible: false })]; break;
        case 'baseline': chartAlts = [chart.addBaselineSeries(Object.assign({
            baseValue: { type: 'price', price: baselineMid() }, lineWidth: w,
            topLineColor: rgbaC(cUp, 100), bottomLineColor: rgbaC(cDn, 100),
            topFillColor1: rgbaC(cUp, 28), topFillColor2: rgbaC(cUp, 5), bottomFillColor1: rgbaC(cDn, 5), bottomFillColor2: rgbaC(cDn, 28)
        }, base))]; break;
        case 'columns': chartAlts = [chart.addHistogramSeries(Object.assign({}, base, {
            priceFormat: pf,
            /* columns start at the bottom of the pane; scale to the visible closes so the price axis is not stretched down to 0 */
            autoscaleInfoProvider: () => {
                const r = chart.timeScale().getVisibleLogicalRange(); let lo = Infinity, hi = -Infinity;
                for (let i = Math.max(0, Math.floor(r ? r.from : 0)); i <= Math.min(data.length - 1, Math.ceil(r ? r.to : data.length)); i++) { const v = data[i].close; if (v < lo) lo = v; if (v > hi) hi = v; }
                if (!(hi >= lo)) return null;
                const pad = (hi - lo) * 0.1 || hi * 0.01;
                return { priceRange: { minValue: Math.max(0, lo - pad * 4), maxValue: hi + pad } };
            }
        }))]; break;
    }
    /* the candles stay on the chart (price line, drawings, markers) but are invisible and do not take part in auto-scaling */
    series.applyOptions({ autoscaleInfoProvider: CANDLE_BASED.has(chartType) ? base0 => base0() : () => null });
}
function baselineMid() {
    const tail = data.slice(-200); if (!tail.length) return 0;
    let lo = Infinity, hi = -Infinity; for (const b of tail) { if (b.close < lo) lo = b.close; if (b.close > hi) hi = b.close; }
    return (lo + hi) / 2;
}
function setBars(d) {
    if (chartType === 'ha') { haArr = []; for (let i = 0; i < d.length; i++) haArr.push(haOf(haArr[i - 1], d[i])); } else haArr = [];
    series.setData(d.map((b, i) => candlePoint(b, d[i - 1], i)));
    if (typeof scheduleHeaderValues === 'function') scheduleHeaderValues();
    if (!chartAlts.length) return;
    if (chartType === 'baseline') chartAlts[0].applyOptions({ baseValue: { type: 'price', price: baselineMid() } });
    const cols = chartAlts.map(() => []);
    d.forEach((b, i) => altPoints(b, d[i - 1]).forEach((pt, k) => cols[k] && cols[k].push(pt)));
    chartAlts.forEach((s, k) => s.setData(cols[k]));
}
function updateBar(b) {
    const n = data.length, i = n - 1;
    if (!n || data[i].time !== b.time) return setBars(data);
    const prev = data[i - 1];
    if (chartType === 'ha') {
        if (haArr.length !== n && haArr.length !== n - 1) return setBars(data);
        haArr[i] = haOf(haArr[i - 1], b);
    }
    series.update(candlePoint(b, prev, i));
    if (typeof scheduleHeaderValues === 'function') scheduleHeaderValues();
    altPoints(b, prev).forEach((pt, k) => chartAlts[k] && chartAlts[k].update(pt));
}
/* rebuild after a colour / type change */
function restyleChart() {
    buildAlts();
    setBars(data);
    window.IND && IND.colors();
}
function setChartType(id) {
    if (!CHART_TYPES.some(t => t[0] === id)) return;
    chartType = id;
    store.set('chartType', id);
    restyleChart();
    syncTypeUi();
    window.dispatchEvent(new Event('charttypechange'));
}

/* ---------- Toolbar button + menu (next to Indicators) ---------- */
const btnType = $('btnType'), typeMenu = $('typemenu');
function syncTypeUi() {
    btnType.innerHTML = typeIcon(chartType, 20);
    btnType.title = 'Chart type: ' + typeName(chartType);
    btnType.setAttribute('aria-label', 'Chart type: ' + typeName(chartType));
    typeMenu.innerHTML = CHART_TYPES.map(([id, name]) => `<button type="button" role="menuitemradio" data-type="${id}" aria-checked="${id === chartType}" class="${id === chartType ? 'on' : ''}">${typeIcon(id, 20)}<span>${name}</span></button>`).join('');
}
function closeTypeMenu() { typeMenu.hidden = true; btnType.setAttribute('aria-expanded', 'false'); }
function positionTypeMenu() {
    const main = $('main'), b = btnType.getBoundingClientRect(), m = main.getBoundingClientRect(), w = typeMenu.offsetWidth || 200, h = typeMenu.offsetHeight || 300;
    const left = Math.max(8, Math.min(b.left - m.left, main.clientWidth - w - 8));
    const below = b.bottom - m.top + 3;
    typeMenu.style.left = left + 'px';
    typeMenu.style.top = (below + h <= main.clientHeight - 8 ? below : Math.max(8, b.top - m.top - h - 3)) + 'px';
}
btnType.onclick = e => {
    e.stopPropagation();
    if (!typeMenu.hidden) return closeTypeMenu();
    $('imenu').hidden = true; $('btnInd').setAttribute('aria-expanded', 'false'); $('pop').hidden = true;
    typeMenu.hidden = false; positionTypeMenu();
    btnType.setAttribute('aria-expanded', 'true');
};
typeMenu.onclick = e => { const b = e.target.closest('button[data-type]'); if (!b) return; closeTypeMenu(); setChartType(b.dataset.type); };
document.addEventListener('pointerdown', e => { if (!typeMenu.hidden && !typeMenu.contains(e.target) && !btnType.contains(e.target)) closeTypeMenu(); });
addEventListener('keydown', e => { if (e.key === 'Escape') closeTypeMenu(); });
addEventListener('resize', () => { if (!typeMenu.hidden) positionTypeMenu(); });
syncTypeUi();
/* the helper series are created by applyCandleCfg() -> restyleChart() at startup (needs the candle colour settings) */
