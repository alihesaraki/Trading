/* ---------- Chart header (TradingView-style status line, top-left of the chart) ----------
   Row: [Symbol name] [Chart value: O H L C of the selected candle] [Bar change: +x (+y%)].
   "Selected candle" = the candle under the crosshair, or the latest candle while the crosshair is off the chart.
   Each part has its own show/hide toggle in Settings -> Symbol -> Status line. */
const HEADER_DEFAULT = { name: true, values: true, change: false };
const headerCfg = Object.assign({}, HEADER_DEFAULT);
(() => {
    const saved = store.get('hdr');
    if (saved && typeof saved === 'object') for (const k of Object.keys(HEADER_DEFAULT)) if (typeof saved[k] === 'boolean') headerCfg[k] = saved[k];
})();
function setHeaderOpt(key, on) {
    if (!(key in HEADER_DEFAULT)) return;
    headerCfg[key] = !!on;
    store.set('hdr', headerCfg);
    headerValues();
}
function resetHeaderCfg() {
    Object.assign(headerCfg, HEADER_DEFAULT);
    store.set('hdr', headerCfg);
    headerValues();
}

/* which prices each chart type reports (TradingView: line-like types show only the close) */
const HEADER_FIELDS = { line: 'c', linemk: 'c', step: 'c', area: 'c', baseline: 'c', columns: 'c', hlcarea: 'hlc', hilo: 'hl' };
const HEADER_LABELS = { o: 'O', h: 'H', l: 'L', c: 'C' };
let hdrTime = null, hdrHtml = null, hdrRaf = 0;

/* index of the candle with exactly this time (data is sorted ascending), -1 when there is none */
function hdrIndex(t) {
    let lo = 0, hi = data.length - 1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1, v = data[mid].time;
        if (v === t) return mid;
        if (v < t) lo = mid + 1; else hi = mid - 1;
    }
    return -1;
}
const hdrNum = (v, dec) => v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });

function headerValues() {
    hdrRaf = 0;
    const tl = $('tl'), ttl = $('ttl'), hv = $('hv');
    let html = '';
    const n = data.length;
    if (n && (headerCfg.values || headerCfg.change)) {
        let i = hdrTime == null ? -1 : hdrIndex(hdrTime);
        if (i < 0) i = n - 1; /* crosshair off the chart or over the empty future area -> latest candle */
        const ha = chartType === 'ha' && haArr.length === n, src = ha ? haArr : data, b = src[i], prev = src[i - 1];
        if (b) {
            const dec = map[sym] ? map[sym].dec : Math.min(8, (String(b.close).split('.')[1] || '').length);
            const kind = typeKind();
            const up = window.candleCfg.prevClose && prev ? b.close >= prev.close : b.close >= b.open;
            const col = kind === 'line' ? lineCfg.color : up ? cUp : cDn;
            if (headerCfg.values)
                for (const f of (HEADER_FIELDS[chartType] || 'ohlc'))
                    html += `<span class="hv-i"><span class="hv-l">${HEADER_LABELS[f]}</span><span class="hv-v">${hdrNum(b[{ o: 'open', h: 'high', l: 'low', c: 'close' }[f]], dec)}</span></span>`;
            if (headerCfg.change && prev && prev.close) {
                const d = b.close - prev.close, sg = d >= 0 ? '+' : '−';
                html += `<span class="hv-i hv-chg">${sg}${hdrNum(Math.abs(d), dec)} (${sg}${Math.abs(d / prev.close * 100).toFixed(2)}%)</span>`;
            }
            if (html) html = `<span class="hv-wrap" style="color:${col}">${html}</span>`;
        }
    }
    if (html !== hdrHtml) { hdrHtml = html; hv.innerHTML = html; }
    hv.hidden = !html;
    ttl.hidden = !headerCfg.name;
    tl.hidden = ttl.hidden && hv.hidden;
    $('cw').classList.toggle('hdr-off', tl.hidden);
    placeLegend();
}
/* coalesce bursts (crosshair moves, live ticks) into one render per frame */
function scheduleHeaderValues() { if (!hdrRaf) hdrRaf = requestAnimationFrame(headerValues); }

/* the indicator legend sits right under the header, wherever it wraps to (TradingView stacks them the same way) */
function placeLegend() {
    const tl = $('tl'), top = tl.hidden ? 8 : tl.offsetTop + tl.offsetHeight + 4;
    $('cw').style.setProperty('--lg-top', top + 'px');
}
if (window.ResizeObserver) new ResizeObserver(placeLegend).observe($('tl'));

chart.subscribeCrosshairMove(p => {
    const t = p && p.point && p.time != null ? p.time : null;
    if (t === hdrTime) return;
    hdrTime = t;
    scheduleHeaderValues();
});
addEventListener('charttypechange', scheduleHeaderValues);

/* Title + document title of the selected coin (the daily price stays in the browser tab title) */
function header() {
    const s = map[sym], b = sym.replace(/USDT$/, ''), tl = Object.keys(TFS).find(k => TFS[k] === tf);
    $('ttl').textContent = `${b} / TetherUS PERPETUAL CONTRACT · ${tl} · Binance`;
    headerValues();
    if (!s || !s.o) return;
    const t = `${fmt(s)} ${b} · Binance Futures`;
    if (document.title !== t) document.title = t;
}
