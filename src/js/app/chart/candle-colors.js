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
