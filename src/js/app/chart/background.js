/* ---------- Canvas tab of the Settings window: background, grid lines, crosshair ----------
   The window itself (and the Symbol tab) lives in candle-colors.js; this file renders / applies the Canvas tab. */
const BG_DEFAULT = { bg: '#09101c', grid: '#2a2e39', gridOp: 25, gridMode: 'Vert and horz', cross: '#5d606b', crossStyle: 'Dashed' };
const GRID_MODES = ['Vert and horz', 'Vert only', 'Horz only', 'None'];
const LINE_STYLES = { Solid: 0, Dotted: 1, Dashed: 2, 'Large dashed': 3 };
const bgCfg = Object.assign({}, BG_DEFAULT);
try {
    const saved = store.get('bg');
    if (saved && typeof saved === 'object') {
        if (/^#[0-9a-f]{6}$/i.test(saved.bg)) bgCfg.bg = saved.bg.toLowerCase() === '#131722' ? BG_DEFAULT.bg : saved.bg;
        if (/^#[0-9a-f]{6}$/i.test(saved.grid)) bgCfg.grid = saved.grid;
        if (Number.isFinite(+saved.gridOp)) bgCfg.gridOp = Math.max(0, Math.min(100, +saved.gridOp));
        if (GRID_MODES.includes(saved.gridMode)) bgCfg.gridMode = saved.gridMode;
        if (/^#[0-9a-f]{6}$/i.test(saved.cross)) bgCfg.cross = saved.cross;
        if (saved.crossStyle in LINE_STYLES) bgCfg.crossStyle = saved.crossStyle;
    }
} catch (_) { }

function bgLuma(hex) {
    const n = parseInt(hex.slice(1), 16);
    return (0.299 * (n >> 16) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) / 255;
}
function applyBackground(save = true) {
    const gridCol = rgbaC(bgCfg.grid, bgCfg.gridOp), light = bgLuma(bgCfg.bg) > 0.6, clear = 'rgba(0,0,0,0)';
    const vert = bgCfg.gridMode === 'Vert and horz' || bgCfg.gridMode === 'Vert only', horz = bgCfg.gridMode === 'Vert and horz' || bgCfg.gridMode === 'Horz only';
    const xh = { color: bgCfg.cross, style: LINE_STYLES[bgCfg.crossStyle] ?? 2 };
    chart.applyOptions({
        layout: { background: { type: 'solid', color: bgCfg.bg }, textColor: light ? '#131722' : '#d1d4dc' },
        grid: { vertLines: { color: vert ? gridCol : clear, visible: vert }, horzLines: { color: horz ? gridCol : clear, visible: horz } },
        crosshair: { vertLine: xh, horzLine: xh }
    });
    document.documentElement.style.setProperty('--chart-bg', bgCfg.bg);
    if (save) store.set('bg', bgCfg);
}
/* colour popover targets for the Canvas tab (the popover itself is in candle-colors.js) */
PAL.bg = { hex: () => bgCfg.bg, op: null, set: v => { bgCfg.bg = v; }, commit: () => { applyBackground(); } };
PAL.grid = { hex: () => bgCfg.grid, op: () => bgCfg.gridOp, set: (v, o) => { bgCfg.grid = v; if (o != null) bgCfg.gridOp = o; }, commit: () => applyBackground() };
PAL.cross = { hex: () => bgCfg.cross, op: null, set: v => { bgCfg.cross = v; }, commit: () => applyBackground() };
function renderCanvas() {
    const row = (label, ctl) => `<div class="st-row"><span class="st-l">${label}</span><span class="st-c">${ctl}</span></div>`;
    const sel = (k, opts) => `<select data-cv="${k}">${opts.map(o => `<option${o === bgCfg[k] ? ' selected' : ''}>${o}</option>`).join('')}</select>`;
    return `<div class="st-sec">CHART BASIC STYLES</div>
        ${row('Background', swatch('bg'))}
        ${row('Grid lines', sel('gridMode', GRID_MODES) + swatch('grid'))}
        <div class="st-sec">CROSSHAIR</div>
        ${row('Crosshair', sel('crossStyle', Object.keys(LINE_STYLES)) + swatch('cross'))}`;
}
/* <select> changes inside the Canvas tab (called from the dialog's input handler) */
function canvasInput(el) {
    const k = el.dataset.cv;
    if (!k) return false;
    bgCfg[k] = el.value;
    applyBackground();
    return true;
}
function resetCanvas() { Object.assign(bgCfg, BG_DEFAULT); applyBackground(); }
// On touch phones, double-tapping the empty plotting area opens Background Settings.
// Candle double-taps remain reserved for Candle Settings in 04-candle-colors.js.
let lastBackgroundTap = null;
$('cw').addEventListener('pointerup', e => {
    if (e.pointerType !== 'touch' || !matchMedia('(pointer: coarse) and (max-width: 820px)').matches) return;
    if (!e.target.closest('#chart') || e.target.closest('#lg,#iset,#pop,#tl,.dr-tb,.dr-fly,.dr-fb,.dr-set,.dr-ta,.dr-svg,[data-dr-ui],#scaleModes,#jumpNow')) {
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
applyBackground(false);
