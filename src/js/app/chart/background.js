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
