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
