/* ---------- Settings dialog (TradingView "Settings": Symbol + Canvas tabs in ONE window) ----------
   This file owns the dialog shell, the Symbol tab (candle body / borders / wick colours) and the colour popover.
   The Canvas tab (background, grid, crosshair) is rendered by chart/background.js into the same window. */
const PRE = [['#089981', '#F23645'], ['#26a69a', '#ef5350'], ['#ffffff', '#d4af37'], ['#089981', '#ffeb3b']];
const HEX_RE = /^#[0-9a-f]{6}$/i;
const CANDLE_DEFAULT = {
    prevClose: false,
    body: { on: true, up: DEFAULT_CANDLE_COLORS[0], dn: DEFAULT_CANDLE_COLORS[1], upO: 100, dnO: 100 },
    border: { on: true, up: DEFAULT_CANDLE_COLORS[0], dn: DEFAULT_CANDLE_COLORS[1], upO: 100, dnO: 100 },
    wick: { on: true, up: DEFAULT_CANDLE_COLORS[0], dn: DEFAULT_CANDLE_COLORS[1], upO: 100, dnO: 100 }
};
const clampOp = v => Math.max(0, Math.min(100, Number.isFinite(+v) ? +v : 100));
function loadCandleCfg() {
    const cfg = JSON.parse(JSON.stringify(CANDLE_DEFAULT)), saved = store.get('cs');
    if (saved && typeof saved === 'object') {
        for (const g of ['body', 'border', 'wick']) {
            const s = saved[g] || {};
            cfg[g].on = s.on !== false;
            if (HEX_RE.test(s.up)) cfg[g].up = s.up;
            if (HEX_RE.test(s.dn)) cfg[g].dn = s.dn;
            cfg[g].upO = clampOp(s.upO); cfg[g].dnO = clampOp(s.dnO);
        }
        cfg.prevClose = !!saved.prevClose;
    } else { /* settings saved by the previous version: one up / down colour + opacity for the whole candle */
        const cc = store.get('cc'), co = store.get('cco');
        for (const g of ['body', 'border', 'wick']) {
            if (Array.isArray(cc) && HEX_RE.test(cc[0]) && HEX_RE.test(cc[1])) { cfg[g].up = cc[0]; cfg[g].dn = cc[1]; }
            if (Array.isArray(co)) { cfg[g].upO = clampOp(co[0]); cfg[g].dnO = clampOp(co[1]); }
        }
    }
    return cfg;
}
const candleCfg = window.candleCfg = loadCandleCfg();
let cUpOpacity = candleCfg.body.upO, cDnOpacity = candleCfg.body.dnO;
cUp = candleCfg.body.up; cDn = candleCfg.body.dn;

/* colour + opacity (0-100) -> rgba() string */
function rgbaC(hex, opacity) { const n = parseInt(String(hex).slice(1), 16); return `rgba(${n >> 16},${n >> 8 & 255},${n & 255},${clampOp(opacity) / 100})`; }
/* Push the candle settings to the chart, header, volume, countdown ... and persist them */
function applyCandleCfg(save = true) {
    const b = candleCfg.body;
    cUp = b.up; cDn = b.dn; cUpOpacity = b.upO; cDnOpacity = b.dnO;
    cdCol = '';
    header();
    if (save) { store.set('cs', candleCfg); store.set('cc', [cUp, cDn]); store.set('cco', [cUpOpacity, cDnOpacity]); }
    restyleChart();
}
/* one up / down pair for body, borders and wick together (presets) */
function setColors(u, d) {
    for (const g of ['body', 'border', 'wick']) { candleCfg[g].up = u; candleCfg[g].dn = d; }
    applyCandleCfg();
}

/* ---------- Dialog shell ---------- */
const pop = $('pop');
pop.innerHTML = `
    <div class="st-head"><b>Settings</b><button type="button" id="popX" title="Close" aria-label="Close settings">✕</button></div>
    <div class="st-main">
        <div class="st-tabs" role="tablist" aria-label="Settings sections">
            <button type="button" role="tab" data-st-tab="symbol"><svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">${TYPE_ICONS.candles}</svg><span>Symbol</span></button>
            <button type="button" role="tab" data-st-tab="canvas"><svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M3 3h14v14H3zM3 8h14M3 13h14M8 3v14M13 3v14"/></svg><span>Canvas</span></button>
        </div>
        <div class="st-pane" id="stPane"></div>
    </div>
    <div class="st-foot"><button type="button" id="stReset">Reset settings</button><button type="button" id="stOk" class="pri">Ok</button></div>
    <div class="st-pal" id="stPal" hidden></div>`;
let stTab = store.get('stTab', 'symbol') === 'canvas' ? 'canvas' : 'symbol';

/* ---------- Colour popover (palette + HEX + opacity) shared by every colour swatch in the dialog ---------- */
const PAL = {};
for (const g of ['body', 'border', 'wick']) for (const k of ['up', 'dn']) {
    PAL[g + '.' + k] = { hex: () => candleCfg[g][k], op: () => candleCfg[g][k + 'O'], set: (v, o) => { candleCfg[g][k] = v; if (o != null) candleCfg[g][k + 'O'] = o; }, commit: () => applyCandleCfg() };
}
PAL.line = { hex: () => lineCfg.color, op: null, set: v => { lineCfg.color = v; }, commit: () => { store.set('lineCfg', lineCfg); restyleChart(); } };
const swatch = key => {
    const t = PAL[key], op = t.op ? t.op() : 100;
    return `<button type="button" class="st-sw" data-pal="${key}" aria-expanded="false" aria-label="Color"><i style="background:${rgbaC(t.hex(), op)}"></i></button>`;
};
let palKey = null;
function closePal() { $('stPal').hidden = true; palKey = null; pop.querySelectorAll('[data-pal]').forEach(b => b.setAttribute('aria-expanded', 'false')); }
function openPal(btn) {
    const key = btn.dataset.pal, t = PAL[key];
    if (!t) return;
    if (palKey === key) return closePal();
    closePal();
    palKey = key;
    const hasOp = !!t.op, op = hasOp ? t.op() : 100, pal = $('stPal');
    pal.innerHTML = `${ColorPalette.html(c => `data-pal-color="${c}"`)}<div class="candle-hex"><label>HEX <input type="text" class="ihex" id="stHex" value="${t.hex()}" maxlength="7" aria-label="HEX color"></label></div>${hasOp ? `<div class="iopacity"><span>Opacity</span><input type="range" id="stOp" min="0" max="100" step="1" value="${op}"><output id="stOpOut">${op}%</output></div>` : ''}`;
    pal.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    const pr = pop.getBoundingClientRect(), br = btn.getBoundingClientRect();
    const w = pal.offsetWidth, h = pal.offsetHeight;
    let left = br.right - pr.left - w, top = br.bottom - pr.top + 6;
    if (left < 8) left = 8;
    if (left + w > pr.width - 8) left = Math.max(8, pr.width - w - 8);
    if (top + h > pr.height - 8) top = Math.max(8, br.top - pr.top - h - 6);
    pal.style.left = left + 'px'; pal.style.top = top + 'px';
}
function palCommit(hex, op) {
    const t = PAL[palKey];
    if (!t) return;
    t.set(hex, op);
    t.commit();
    const btn = pop.querySelector(`[data-pal="${palKey}"] i`);
    if (btn) btn.style.background = rgbaC(t.hex(), t.op ? t.op() : 100);
}
pop.addEventListener('input', e => {
    const t = e.target;
    if (t.id === 'stHex') { if (HEX_RE.test(t.value)) palCommit(t.value, null); return; }
    if (t.id === 'stOp') { const v = clampOp(t.value); $('stOpOut').textContent = v + '%'; palCommit(PAL[palKey].hex(), v); return; }
    if (t.dataset.stCandle) { /* checkboxes: Body / Borders / Wick / previous-close colouring */
        if (t.dataset.stCandle === 'prevClose') candleCfg.prevClose = t.checked; else candleCfg[t.dataset.stCandle].on = t.checked;
        applyCandleCfg();
        return;
    }
    if (t.dataset.stHdr) { setHeaderOpt(t.dataset.stHdr, t.checked); return; } /* Status line: Symbol name / Chart value / Bar change */
    if (t.dataset.stLine === 'width') { lineCfg.width = clamp(+t.value || 2, 1, 4); store.set('lineCfg', lineCfg); restyleChart(); return; }
    if (typeof canvasInput === 'function' && canvasInput(t)) return;
});
pop.addEventListener('click', e => {
    const tab = e.target.closest('[data-st-tab]');
    if (tab) { stTab = tab.dataset.stTab; store.set('stTab', stTab); renderSettings(); return; }
    const sw = e.target.closest('[data-pal]');
    if (sw) { openPal(sw); return; }
    const pc = e.target.closest('[data-pal-color]');
    if (pc) { palCommit(pc.dataset.palColor, null); closePal(); return; }
    const pre = e.target.closest('[data-pre]');
    if (pre) { setColors(...PRE[+pre.dataset.pre]); renderSettings(); return; }
    if (e.target.closest('#stOk') || e.target.closest('#popX')) { pop.hidden = true; closePal(); return; }
    if (e.target.closest('#stReset')) {
        if (stTab === 'symbol') { Object.assign(lineCfg, LINE_DEFAULT); store.set('lineCfg', lineCfg); const d = JSON.parse(JSON.stringify(CANDLE_DEFAULT)); for (const k of Object.keys(d)) candleCfg[k] = d[k]; applyCandleCfg(); resetHeaderCfg(); }
        else if (typeof resetCanvas === 'function') resetCanvas();
        renderSettings();
        return;
    }
    if (palKey && !e.target.closest('#stPal')) closePal();
});

/* ---------- Symbol tab ---------- */
const typeKind = () => CANDLE_BASED.has(chartType) && chartType !== 'hilo' ? 'candle' : ['bars', 'columns', 'baseline'].includes(chartType) ? 'updn' : 'line';
function renderSymbol() {
    const kind = typeKind(), row = (label, ctl) => `<div class="st-row"><span class="st-l">${label}</span><span class="st-c">${ctl}</span></div>`;
    const grp = (g, label) => row(`<label class="st-chk"><input type="checkbox" data-st-candle="${g}" ${candleCfg[g].on ? 'checked' : ''}><span>${label}</span></label>`, swatch(g + '.up') + swatch(g + '.dn'));
    let h = `<div class="st-sec">${typeName(chartType).toUpperCase()}</div>`;
    if (kind === 'candle') {
        h += row(`<label class="st-chk"><input type="checkbox" data-st-candle="prevClose" ${candleCfg.prevClose ? 'checked' : ''}><span>Color bars based on previous close</span></label>`, '');
        h += grp('body', 'Body') + grp('border', 'Borders') + grp('wick', 'Wick');
    } else if (kind === 'updn') {
        h += row('Up color', swatch('body.up')) + row('Down color', swatch('body.dn'));
    } else {
        h += row('Color', swatch('line'));
        if (chartType !== 'hilo') h += row('Line thickness', `<select data-st-line="width">${[1, 2, 3, 4].map(w => `<option value="${w}"${w === lineCfg.width ? ' selected' : ''}>${w}px</option>`).join('')}</select>`);
        if (chartType === 'hlcarea') h += row('High / Low lines', swatch('body.up') + swatch('body.dn'));
    }
    h += `<div class="st-sec">STATUS LINE</div>`;
    h += [['name', 'Symbol name'], ['values', 'Chart value'], ['change', 'Bar change']].map(([k, l]) => row(`<label class="st-chk"><input type="checkbox" data-st-hdr="${k}" ${headerCfg[k] ? 'checked' : ''}><span>${l}</span></label>`, '')).join('');
    h += `<div class="st-sec">PRESETS</div><div class="st-row"><div id="pre">${PRE.map((p, i) => `<button type="button" data-pre="${i}" title="${p[0]} / ${p[1]}" style="background:linear-gradient(90deg,${p[0]} 50%,${p[1]} 50%)"></button>`).join('')}</div></div>`;
    h += `<p class="st-note">Chart type is changed from the button next to Indicators.</p>`;
    return h;
}
function renderSettings() {
    closePal();
    pop.querySelectorAll('[data-st-tab]').forEach(b => { const on = b.dataset.stTab === stTab; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
    $('stPane').innerHTML = stTab === 'canvas' && typeof renderCanvas === 'function' ? renderCanvas() : renderSymbol();
}
function openSettings(tab) {
    pop.style.left = pop.style.top = pop.style.transform = ''; /* re-centre every time it opens */
    if (tab) { stTab = tab; store.set('stTab', tab); }
    $('imenu').hidden = true;
    $('btnInd').setAttribute('aria-expanded', 'false');
    if (typeof closeTypeMenu === 'function') closeTypeMenu();
    renderSettings();
    pop.hidden = false;
}
/* Movable window: drag the title bar (desktop only; phones show it as a fixed centred dialog). */
(() => {
    const head = pop.querySelector('.st-head'), phone = matchMedia('(max-width: 820px), (pointer: coarse) and (max-height: 500px)');
    let drag = null;
    head.addEventListener('pointerdown', e => {
        if (phone.matches || e.button > 0 || e.target.closest('button')) return;
        const box = pop.getBoundingClientRect(), par = (pop.offsetParent || document.body).getBoundingClientRect();
        drag = { x: e.clientX, y: e.clientY, left: box.left - par.left, top: box.top - par.top, w: box.width, h: Math.min(box.height, par.height), pw: par.width, ph: par.height };
        pop.style.transform = 'none';
        pop.style.left = drag.left + 'px'; pop.style.top = drag.top + 'px';
        head.setPointerCapture?.(e.pointerId);
        e.preventDefault();
    });
    head.addEventListener('pointermove', e => {
        if (!drag) return;
        pop.style.left = Math.max(0, Math.min(drag.pw - drag.w, drag.left + e.clientX - drag.x)) + 'px';
        pop.style.top = Math.max(0, Math.min(drag.ph - drag.h, drag.top + e.clientY - drag.y)) + 'px';
    });
    const end = () => { drag = null; };
    head.addEventListener('pointerup', end);
    head.addEventListener('pointercancel', end);
})();
const openCandleSet = () => openSettings('symbol');
const openBgSet = () => openSettings('canvas');
window.addEventListener('charttypechange', () => { if (!pop.hidden && stTab === 'symbol') renderSettings(); });

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
/* Desktop: double-click a candle -> Symbol tab, double-click empty chart area -> Canvas tab (both live in the same window) */
function plotPoint(e) {
    if (e.target.closest('#lg,#iset,#pop,#tl,#scaleModes,#jumpNow,.dr-tb,.dr-fly,.dr-fb,.dr-set,.dr-ta,.dr-svg,[data-dr-ui],#rpBar,.chl'))
        return false;
    if (!e.target.closest('#chart')) return false;
    const r = $('chart').getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    return !(x < 0 || y < 0 || x >= r.width - chart.priceScale('right').width() || y >= r.height - chart.timeScale().height());
}
$('cw').addEventListener('dblclick', e => {
    if (candleAt(e)) openCandleSet();
    else if (plotPoint(e)) openBgSet();
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
/* close on outside press (pointerdown: the clicked control may be re-rendered before a click event arrives) */
document.addEventListener('pointerdown', e => {
    if (!pop.hidden && !pop.contains(e.target)) { pop.hidden = true; closePal(); }
});
addEventListener('keydown', e => {
    if (e.key === 'Escape' && !pop.hidden) { if (palKey) closePal(); else pop.hidden = true; }
});
