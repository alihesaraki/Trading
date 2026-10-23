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
