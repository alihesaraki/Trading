/* Indicator engine: owns the list of active indicators, their chart series, legend, settings panel and menu.
   All indicator-specific logic lives in modules/*.js (see 00-kit.js for the module contract). */
var IND = (function () {
    const { colorAlpha } = INDKIT;
    const M = t => INDREG.get(t);
    let inds = [], uid = 0, mkSig = '', tt = 0, setId = 0, wt = 0, lastIndicatorTap = null, lastChartIndicatorTap = null;
    const save = () => store.set('inds', inds.map(i => ({ t: i.t, p: i.p, v: i.v })));
    /* ---------- Remembered settings ----------
       The last settings the user chose for an indicator type are stored under 'indDef:<type>' and used by every new instance
       (also after a restart) until the user presses "Reset to Default" in that indicator's settings panel. */
    const defKey = t => 'indDef:' + t;
    const copyP = p => JSON.parse(JSON.stringify(p));
    /* Only keys the module knows, and only values of the same type as the factory default, are accepted from storage. */
    function remembered(t) {
        const def = M(t).defaults, saved = store.get(defKey(t), null), out = copyP(def);
        if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return out;
        for (const k of Object.keys(def))
            if (k in saved && typeof saved[k] === typeof def[k] && (typeof saved[k] !== 'number' || Number.isFinite(saved[k]))) out[k] = saved[k];
        return out;
    }
    const remember = ind => store.set(defKey(ind.t), copyP(ind.p));
    const forget = t => store.set(defKey(t), null);
    const MAXNEED = 5000;
    const needOf = i => Math.min(MAXNEED, M(i.t).need(i.p));
    /* full recalculation; "settled" = enough history is loaded for the recursive averages to be anchored */
    function applyFull(i) { i.settled = data.length >= needOf(i); apply(i, true); }
    /* ---------- Calculation ---------- */
    function compute(ind) { return M(ind.t).calc(data, ind.p, ind); }
    /* Merge buy/sell markers of all visible HalfTrends onto the candle series */
    function markers(force) {
        const m = [].concat(...inds.filter(i => i.v && i.mk).map(i => i.mk)).sort((a, b) => a.time - b.time), l = m[m.length - 1];
        const sig = m.length + ':' + (l ? l.time + l.shape : '');
        if (!force && sig === mkSig)
            return;
        mkSig = sig;
        series.setMarkers(m);
    }
    /* Push results to chart series.
       full: setData with every point.
       live: only the forming candle changed -> O(1) update through the module's tail() (or a full calc as fallback, last point only). */
    function apply(ind, full) {
        const m = M(ind.t);
        if (!full) {
            const tl = m.tail && data.length ? m.tail(data, ind.p, ind) : null;
            if (tl) {
                tl.forEach((pt, i) => { if (pt) ind.s[i].update(pt); });
                ind.last = tl.map((pt, i) => pt ? pt.value : (ind.last ? ind.last[i] : null));
                axis(ind);
                return;
            }
        }
        const res = compute(ind);
        ind.s.forEach((s, i) => {
            const a = res[i] || [];
            if (full)
                s.setData(a);
            else if (a.length)
                s.update(a[a.length - 1]);
        });
        ind.last = res.map(a => a.length ? a[a.length - 1].value : null);
        axis(ind);
        if (m.markers)
            markers(full);
    }
    /* Price-axis label of the live value. The built-in last-value label follows the rightmost *visible* candle,
       so scrolling left would change it; a price line pinned to the live value does not. */
    function axis(ind) {
        const m = M(ind.t), s = ind.s[0], v = ind.last ? ind.last[0] : null;
        if (!m.axis) {
            if (ind.pln) { s.removePriceLine(ind.pln); ind.pln = null; }
            return;
        }
        if (!ind.v || v == null) {
            if (ind.pln) { s.removePriceLine(ind.pln); ind.pln = null; }
            return;
        }
        const o = { price: v, color: m.color(ind.p), lineVisible: false, axisLabelVisible: true, title: '' };
        if (ind.pln)
            ind.pln.applyOptions(o);
        else
            ind.pln = s.createPriceLine(o);
    }
    /* ---------- Create / style ---------- */
    function create(ind) {
        const m = M(ind.t);
        ind.id = ++uid;
        if (m.osc)
            ind.sid = 'o' + ind.id;
        ind.s = m.create(ind);
        style(ind);
    }
    /* Vertical layout: price on top, volume overlaid at its bottom, oscillator bands (RSI/DMI) at the very bottom */
    /* Margins of the main (candle) scale. Reset / fit ask for their own breathing room through setMainMargins();
       it is always applied above the volume and oscillator panes, so candles never run into RSI / DMI. */
    let mainTop = .08, mainBottom = .12;
    function setMainMargins(top, bottom) { mainTop = top; mainBottom = bottom; margins(); }
    function margins() {
        const os = inds.filter(i => M(i.t).osc && i.v), n = os.length, v = inds.find(i => M(i.t).vol && i.v);
        const savedPane = Math.max(12, Math.min(45, Number(store.get('rsiPaneHeight', 22)))) / 100;
        const h = n ? Math.min(savedPane, .45 / n) : 0, tot = h * n, vh = v ? Math.min(v.p.ht / 100, .8 - tot) : 0;
        os.forEach((o, k) => { const t = 1 - tot + k * h; o.pane = [t, t + h]; chart.priceScale(o.sid).applyOptions({ scaleMargins: { top: t + .02, bottom: 1 - t - h + .02 } }); });
        if (v)
            chart.priceScale('vol').applyOptions({ scaleMargins: { top: Math.max(.05, 1 - tot - vh), bottom: tot } });
        chart.priceScale('right').applyOptions({ scaleMargins: { top: mainTop, bottom: tot + (v ? vh + .04 : mainBottom) } });
        const th = (chart.timeScale().height && chart.timeScale().height()) || 28;
        $('osep').innerHTML = os.map((o, k) => `<i class="osc-resize" data-osc-id="${o.id}" role="separator" aria-orientation="horizontal" aria-label="Resize ${M(o.t).name} pane" title="Drag to resize ${M(o.t).name}" style="top:calc((100% - ${th}px)*${1 - tot + k * h})"></i>`).join('');
    }
    function style(ind) {
        const m = M(ind.t);
        m.style(ind);
        axis(ind);
        if (m.osc || m.vol)
            margins();
    }
    /* ---------- Crosshair price label ----------
       The native label always shows the main price scale, even over an oscillator pane. Draw our own on the right axis:
       the oscillator's value (e.g. RSI 57.32) inside its pane, the price everywhere else - like TradingView. */
    chart.applyOptions({ crosshair: { horzLine: { labelVisible: false } } });
    const axMask = document.createElement('div');
    axMask.className = 'axmask';
    axMask.hidden = true;
    $('cw').appendChild(axMask);
    const chl = document.createElement('div');
    chl.className = 'chl';
    chl.hidden = true;
    $('cw').appendChild(chl);
    chart.subscribeCrosshairMove(param => {
        const pt = param && param.point, H = $('cw').clientHeight - ((chart.timeScale().height && chart.timeScale().height()) || 28);
        if (!pt || pt.y < 0 || pt.y > H) { chl.hidden = true; return; }
        const f = pt.y / H, os = inds.find(i => i.v && M(i.t).osc && i.pane && f >= i.pane[0] && f <= i.pane[1]);
        const v = os ? os.s[0].coordinateToPrice(pt.y) : series.coordinateToPrice(pt.y);
        if (v == null || !Number.isFinite(v)) { chl.hidden = true; return; }
        chl.textContent = os ? v.toFixed(2) : INDKIT.fv(v);
        chl.style.width = chart.priceScale('right').width() + 'px';
        chl.style.top = Math.round(pt.y - 9) + 'px';
        chl.hidden = false;
    });
    /* ---------- Legend (top-left list with live values) ---------- */
    let lgCollapsed = !!store.get('lgc', false);
    const lgHead = () => inds.length ? `<div class="lh"><button data-a="c" type="button" aria-label="${lgCollapsed ? 'Show' : 'Collapse'} indicator list" title="${lgCollapsed ? 'Show' : 'Collapse'} indicator list"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="${lgCollapsed ? 'M3.5 5.5 8 10l4.5-4.5' : 'M3.5 10.5 8 6l4.5 4.5'}"/></svg></button></div>` : '';
    function legend() {
        $('lg').innerHTML = lgHead() + (lgCollapsed ? '' : inds.map(i => `<div class="lr${i.v ? '' : ' off'}" data-id="${i.id}"><b style="color:${M(i.t).color(i.p) || '#d1d4dc'}">${M(i.t).label(i)}</b><span class="lv" data-v="${i.id}"></span><span class="lb"><button data-a="v" title="Show / hide">👁</button><button data-a="s" title="Settings" aria-label="Settings"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></button><button data-a="x" title="Remove">✕</button></span></div>`).join(''));
        vals();
        window.dispatchEvent(new Event('indchange')); /* lets the drawing toolbar refresh its eye button */
    }
    /* The legend always shows the values of the live (latest) candle: it deliberately ignores the crosshair,
       so scrolling / hovering never changes the numbers. */
    function vals() {
        for (const i of inds) {
            const el = document.querySelector(`[data-v="${i.id}"]`);
            if (!el)
                continue;
            const g = k => i.last && i.last[k];
            el.innerHTML = g(0) == null ? '' : M(i.t).fmt(i, g);
        }
    }
    // Double-click a legend row to edit it; support the same gesture as two taps on touch screens.
    $('lg').addEventListener('dblclick', e => {
        const row = e.target.closest('.lr');
        if (!row || e.target.closest('button')) return;
        const ind = inds.find(i => i.id === +row.dataset.id);
        if (ind) { e.preventDefault(); openSet(ind, row); }
    });
    $('lg').addEventListener('pointerup', e => {
        if (e.pointerType !== 'touch') return;
        const row = e.target.closest('.lr');
        if (!row || e.target.closest('button')) { lastIndicatorTap = null; return; }
        const now = Date.now(), id = +row.dataset.id, last = lastIndicatorTap;
        if (last && last.id === id && now - last.time <= 380 && Math.hypot(e.clientX - last.x, e.clientY - last.y) <= 26) {
            lastIndicatorTap = null;
            const ind = inds.find(i => i.id === id);
            if (ind) openSet(ind, row);
        } else lastIndicatorTap = { id, time: now, x: e.clientX, y: e.clientY };
    });
    // Desktop browsers may deliver native dblclick without a second usable chart.subscribeClick
    // event. Hit-test the actual plotted line from the DOM dblclick coordinates as a fallback.
    const chartEl = $('chart');
    if (chartEl) chartEl.addEventListener('dblclick', e => {
        const rect = chartEl.getBoundingClientRect();
        const x = e.clientX - rect.left, y = e.clientY - rect.top;
        const time = chart.timeScale().coordinateToTime(x);
        if (time == null) return;
        let hit = null, bestDistance = Infinity;
        for (const ind of inds) {
            if (!ind.v) continue;
            for (const line of ind.s) {
                if (typeof line.data !== 'function' || typeof line.priceToCoordinate !== 'function') continue;
                const points = line.data();
                // Exact time is preferred; nearby visible points handle fractional pixel coordinates.
                let datum = points.find(pt => pt.time === time);
                if (!datum && typeof time === 'object') {
                    const key = time.year * 10000 + time.month * 100 + time.day;
                    datum = points.find(pt => {
                        const t = pt.time;
                        return typeof t === 'object' && t.year * 10000 + t.month * 100 + t.day === key;
                    });
                }
                if (!datum && points.length) {
                    let nearest = null, nearestX = Infinity;
                    for (const pt of points) {
                        const px = chart.timeScale().timeToCoordinate(pt.time);
                        if (px == null) continue;
                        const dx = Math.abs(px - x);
                        if (dx < nearestX) { nearestX = dx; nearest = pt; }
                    }
                    if (nearest && nearestX <= 12) datum = nearest;
                }
                if (!datum || typeof datum.value !== 'number') continue;
                const lineY = line.priceToCoordinate(datum.value);
                if (lineY == null || !Number.isFinite(lineY)) continue;
                const distance = Math.abs(y - lineY);
                if (distance < bestDistance) { bestDistance = distance; hit = ind; }
            }
        }
        if (hit && bestDistance <= 18) {
            e.preventDefault();
            e.stopPropagation();
            openSet(hit, document.querySelector(`.lr[data-id="${hit.id}"]`) || $('lg'));
        }
    }, true);

    // Detect a double-click / double-tap on the actual plotted indicator stroke.
    // seriesData alone is NOT a hit test: Lightweight Charts returns values for many series
    // at the same time coordinate, even when the pointer is nowhere near their line.
    if (typeof chart.subscribeClick === 'function') chart.subscribeClick(param => {
        if (!param || !param.point || !param.seriesData) return;
        const { x, y } = param.point;
        let hit = null, bestDistance = Infinity;
        const tolerance = param.sourceEvent && param.sourceEvent.pointerType === 'touch' ? 24 : 16;
        for (const ind of inds) {
            if (!ind.v) continue;
            for (const series of ind.s) {
                const datum = param.seriesData.get(series);
                if (!datum || typeof datum.value !== 'number' || typeof series.priceToCoordinate !== 'function') continue;
                const lineY = series.priceToCoordinate(datum.value);
                if (lineY == null || !Number.isFinite(lineY)) continue;
                const distance = Math.abs(y - lineY);
                if (distance < bestDistance) { bestDistance = distance; hit = ind; }
            }
        }
        // Do not treat a candle / blank chart click as an indicator click.
        if (!hit || bestDistance > tolerance) { lastChartIndicatorTap = null; return; }
        const now = Date.now(), last = lastChartIndicatorTap;
        // Keep chart gestures separate from legend taps so a tap in one area cannot complete a double-tap in another.
        if (last && last.id === hit.id && now - last.time <= 600 && Math.hypot(x - last.x, y - last.y) <= 32) {
            lastChartIndicatorTap = null;
            openSet(hit, document.querySelector(`.lr[data-id="${hit.id}"]`) || $('lg'));
        } else lastChartIndicatorTap = { id: hit.id, time: now, x, y };
    });
    $('lg').onclick = e => {
        const b = e.target.closest('button'), r = e.target.closest('.lr');
        if (b && !r && b.dataset.a === 'c') {
            lgCollapsed = !lgCollapsed;
            store.set('lgc', lgCollapsed);
            legend();
            return;
        }
        if (b && !r && b.dataset.a === 'h') {
            const show = !inds.some(i => i.v);
            inds.forEach(i => { i.v = show; style(i); });
            markers(true);
            legend();
            save();
            return;
        }
        if (!b || !r)
            return;
        const ind = inds.find(i => i.id === +r.dataset.id);
        if (!ind)
            return;
        if (b.dataset.a === 's')
            openSet(ind, r);
        else if (b.dataset.a === 'v') {
            ind.v = !ind.v;
            style(ind);
            markers(true);
            legend();
            save();
        }
        else if (b.dataset.a === 'x') {
            ind.s.forEach(s => chart.removeSeries(s));
            M(ind.t).destroy && M(ind.t).destroy(ind);
            inds = inds.filter(i => i !== ind);
            if (setId === ind.id)
                $('iset').hidden = true;
            margins();
            markers(true);
            legend();
            save();
        }
    };
    /* ---------- Settings panel ---------- */
    function field(ind, f) {
        const v = ind.p[f.k];
        let inp;
        if (f.t === 'n')
            inp = `<input type="number" data-k="${f.k}" min="${f.min}" max="${f.max}" step="${f.step}" value="${v}">`;
        else if (f.t === 'c') {
            const opacity = ind.p[f.k + 'Opacity'] ?? 100;
            inp = `<div class="icolor"><div class="icolor-top"><button type="button" class="icolor-toggle" data-color-toggle="${f.k}" aria-expanded="false"><span class="icolor-swatch" style="background:${/^#[0-9a-f]{6}$/i.test(v) ? v : '#888888'}"></span>Color</button></div><div class="icolor-panel" data-color-panel="${f.k}" hidden>${ColorPalette.html(c => `data-palette="${c}" data-k="${f.k}"`)}<div class="icolor-hex"><label>HEX <input type="text" class="ihex" data-k="${f.k}" value="${v}" maxlength="7" aria-label="HEX color"></label></div><div class="iopacity"><span>Opacity</span><input type="range" min="0" max="100" step="1" data-opacity="${f.k}" value="${opacity}"><output data-opacity-value="${f.k}">${opacity}%</output></div></div></div>`;
        }
        else if (f.t === 'b')
            inp = `<input type="checkbox" data-k="${f.k}" ${v ? 'checked' : ''}>`;
        else
            inp = `<select data-k="${f.k}">${f.o.map(o => `<option${o === v ? ' selected' : ''}>${o}</option>`).join('')}</select>`;
        return `<label>${f.l}${inp}</label>`;
    }
    /* Settings panel can be repositioned by dragging any indicator's title bar. */
    let settingsDrag = null;
    $('iset').addEventListener('pointerdown', e => {
        const head = e.target.closest('.ih');
        if (!head || e.target.closest('button')) return;
        const panel = $('iset'), rect = panel.getBoundingClientRect();
        settingsDrag = { x: e.clientX, y: e.clientY, left: rect.left, top: rect.top };
        head.setPointerCapture?.(e.pointerId);
        e.preventDefault();
    });
    addEventListener('pointermove', e => {
        if (!settingsDrag || $('iset').hidden) return;
        const panel = $('iset'), area = $('cw').getBoundingClientRect();
        const w = panel.offsetWidth, h = panel.offsetHeight;
        const left = Math.max(0, Math.min(area.width - w, settingsDrag.left - area.left + e.clientX - settingsDrag.x));
        const top = Math.max(0, Math.min(area.height - Math.min(h, area.height), settingsDrag.top - area.top + e.clientY - settingsDrag.y));
        panel.style.left = left + 'px'; panel.style.top = top + 'px';
    });
    addEventListener('pointerup', () => { settingsDrag = null; });
    addEventListener('pointercancel', () => { settingsDrag = null; });
    /* TradingView layout: one window with an Inputs tab (calculation) and a Style tab (colours, lines, plots) */
    let setTab = store.get('isTab', 'inputs') === 'style' ? 'style' : 'inputs';
    function openSet(ind, row) {
        setId = ind.id;
        const D = M(ind.t), { tabOf } = INDKIT, inputs = D.fields.filter(f => tabOf(f) === 'inputs'), style = D.fields.filter(f => tabOf(f) === 'style');
        const tabs = [['inputs', 'Inputs', inputs], ['style', 'Style', style]].filter(t => t[2].length);
        if (!tabs.some(t => t[0] === setTab)) setTab = tabs[0][0];
        $('iset').innerHTML = `<div class="ih"><b>${D.name}</b><button type="button" data-a="close" title="Close settings" aria-label="Close ${D.name} settings">✕</button></div>`
            + (tabs.length > 1 ? `<div class="itabs" role="tablist">${tabs.map(t => `<button type="button" role="tab" data-itab="${t[0]}" class="${t[0] === setTab ? 'on' : ''}" aria-selected="${t[0] === setTab}">${t[1]}</button>`).join('')}</div>` : '')
            + tabs.map(t => `<div class="ipane" data-ipane="${t[0]}"${t[0] === setTab ? '' : ' hidden'}>${t[2].map(f => field(ind, f)).join('')}</div>`).join('')
            + `<div class="if"><button type="button" data-a="def">Reset to Default</button></div>`;
        $('iset').hidden = false;
        const area = $('cw').getBoundingClientRect(), rr = row.getBoundingClientRect();
        $('iset').style.left = Math.max(0, Math.min(area.width - $('iset').offsetWidth, rr.left - area.left)) + 'px';
        $('iset').style.top = Math.max(0, Math.min(area.height - $('iset').offsetHeight, rr.bottom - area.top + 4)) + 'px';
    }
    function changed(ind, keep = true) { ind.anchor = null; style(ind); applyFull(ind); markers(true); legend(); save(); if (keep) remember(ind); warm(); }
    $('iset').addEventListener('input', e => {
        const el = e.target, k = el.dataset.k, ind = inds.find(i => i.id === setId);
        if ((!k && !el.dataset.opacity) || !ind)
            return;
        let v;
        if (el.dataset.opacity) {
            const key = el.dataset.opacity + 'Opacity';
            ind.p[key] = Math.max(0, Math.min(100, +el.value));
            const out = $('iset').querySelector(`[data-opacity-value="${el.dataset.opacity}"]`); if (out) out.textContent = ind.p[key] + '%';
            changed(ind); return;
        }
        if (el.type === 'color' && k) {
            v = el.value; const hex = $('iset').querySelector(`.ihex[data-k="${k}"]`); if (hex) hex.value = v;
        }
        else if (el.classList.contains('ihex')) {
            if (!/^#[0-9a-f]{6}$/i.test(el.value)) return;
            v = el.value; const swatch = $('iset').querySelector(`[data-color-toggle="${k}"] .icolor-swatch`); if (swatch) swatch.style.background = v;
        }
        else if (el.type === 'checkbox')
            v = el.checked;
        else if (el.type === 'number') {
            v = parseFloat(el.value);
            if (isNaN(v))
                return;
            v = Math.min(+el.max, Math.max(+el.min, v));
            if (+el.step === 1)
                v = Math.round(v);
        }
        else
            v = el.value;
        ind.p[k] = v;
        if (M(ind.t).edited) M(ind.t).edited(ind, k);
        changed(ind);
    });
    $('iset').addEventListener('click', e => {
        const tabBtn = e.target.closest('[data-itab]');
        if (tabBtn) {
            setTab = tabBtn.dataset.itab; store.set('isTab', setTab);
            $('iset').querySelectorAll('[data-itab]').forEach(b => { const on = b === tabBtn; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
            $('iset').querySelectorAll('[data-ipane]').forEach(p => { p.hidden = p.dataset.ipane !== setTab; p.querySelectorAll('.icolor-panel').forEach(x => { x.hidden = true; }); });
            return;
        }
        const toggle = e.target.closest('[data-color-toggle]');
        if (toggle) { const k = toggle.dataset.colorToggle, panel = $('iset').querySelector(`[data-color-panel="${k}"]`), wasOpen = panel && !panel.hidden; $('iset').querySelectorAll('.icolor-panel').forEach(p => { p.hidden = true; p.style.position = ''; }); $('iset').querySelectorAll('[data-color-toggle]').forEach(b => b.setAttribute('aria-expanded', 'false')); if (panel && !wasOpen) { const tr = toggle.getBoundingClientRect(), pr = $('iset').getBoundingClientRect(); panel.hidden = false; panel.style.position = 'fixed'; panel.style.zIndex = '1000'; panel.style.left = Math.max(8, Math.min(window.innerWidth - 190, pr.left + Math.max(0, Math.min(pr.width - 190, tr.right - pr.left - 190)))) + 'px'; panel.style.top = (tr.bottom + 4 + 150 < window.innerHeight ? tr.bottom + 4 : Math.max(8, tr.top - 154)) + 'px'; toggle.setAttribute('aria-expanded', 'true'); } return; }
        const target = e.target.closest('[data-palette]');
        if (target) { const ind = inds.find(i => i.id === setId), k = target.dataset.k, v = target.dataset.palette; if (ind && k) { ind.p[k] = v; if (M(ind.t).edited) M(ind.t).edited(ind, k); const hex = $('iset').querySelector(`.ihex[data-k="${k}"]`), swatch = $('iset').querySelector(`[data-color-toggle="${k}"] .icolor-swatch`); if (hex) hex.value = v; if (swatch) swatch.style.background = v; changed(ind); } return; }
        const action = e.target.closest('button')?.dataset.a, ind = inds.find(i => i.id === setId);
        if (action === 'close') {
            $('iset').hidden = true;
            setId = 0;
        } else if (action === 'def' && ind) {
            /* Reset only this indicator type: factory settings for this instance, and forget the remembered ones. */
            forget(ind.t);
            ind.p = copyP(M(ind.t).defaults);
            changed(ind, false);
            openSet(ind, document.querySelector(`.lr[data-id="${ind.id}"]`) || $('lg'));
        }
    });
    /* Drag the RSI value scale at the right edge to zoom its vertical range. */
    let rsiScaleDrag = null;
    $('cw').addEventListener('pointerdown', e => {
        if (e.button !== 0 || $('iset').contains(e.target)) return;
        const rect = $('cw').getBoundingClientRect();
        const ind = inds.find(i => i.v && i.t === 'rsi' && i.pane && e.clientY >= rect.top + i.pane[0] * rect.height && e.clientY <= rect.top + i.pane[1] * rect.height);
        if (!ind || e.clientX < rect.right - Math.max(52, chart.priceScale('right').width() + 8)) return;
        const range = ind.scaleRange || { min: 0, max: 100 };
        rsiScaleDrag = { id: ind.id, y: e.clientY, min: range.min, max: range.max };
        document.body.classList.add('resizing-oscillator-scale');
        e.preventDefault();
    });
    addEventListener('pointermove', e => {
        if (!rsiScaleDrag) return;
        const ind = inds.find(i => i.id === rsiScaleDrag.id);
        if (!ind) return;
        const rect = $('cw').getBoundingClientRect();
        const delta = (e.clientY - rsiScaleDrag.y) / Math.max(40, rect.height * ((ind.pane[1] - ind.pane[0]))) ;
        const center = (rsiScaleDrag.min + rsiScaleDrag.max) / 2;
        const span = Math.max(10, Math.min(200, (rsiScaleDrag.max - rsiScaleDrag.min) * Math.exp(delta * 2.5)));
        const min = Math.max(0, Math.min(100 - span, center - span / 2));
        ind.scaleRange = { min, max: Math.min(100, min + span) };
        style(ind);
    });
    addEventListener('pointerup', () => { rsiScaleDrag = null; document.body.classList.remove('resizing-oscillator-scale'); });
    addEventListener('pointercancel', () => { rsiScaleDrag = null; document.body.classList.remove('resizing-oscillator-scale'); });
    /* Drag the oscillator separator to resize its pane, like TradingView. */
    let paneDrag = null;
    $('osep').addEventListener('pointerdown', e => {
        const handle = e.target.closest('.osc-resize');
        if (!handle) return;
        const ind = inds.find(i => i.id === +handle.dataset.oscId && M(i.t).osc && i.v);
        if (!ind) return;
        paneDrag = { y: e.clientY, height: Math.max(12, Math.min(45, Number(store.get('rsiPaneHeight', 22)))), id: ind.id };
        handle.setPointerCapture?.(e.pointerId);
        document.body.classList.add('resizing-oscillator');
        e.preventDefault();
    });
    addEventListener('pointermove', e => {
        if (!paneDrag) return;
        const rect = $('cw').getBoundingClientRect();
        const delta = (paneDrag.y - e.clientY) / Math.max(1, rect.height) * 100;
        const height = Math.max(12, Math.min(45, paneDrag.height + delta));
        store.set('rsiPaneHeight', height);
        margins();
    });
    addEventListener('pointerup', () => { if (paneDrag) { paneDrag = null; document.body.classList.remove('resizing-oscillator'); } });
    addEventListener('pointercancel', () => { paneDrag = null; document.body.classList.remove('resizing-oscillator'); });
    /* Mouse-wheel resizing on an oscillator pane; Shift+wheel remains available for normal chart navigation. */
    $('cw').addEventListener('wheel', e => {
        if (e.shiftKey || e.ctrlKey || e.metaKey) return;
        const rect = $('cw').getBoundingClientRect(), H = Math.max(1, rect.height - ((chart.timeScale().height && chart.timeScale().height()) || 28));
        const f = (e.clientY - rect.top) / H;
        const ind = inds.find(i => i.v && M(i.t).osc && i.pane && f >= i.pane[0] && f <= i.pane[1]);
        if (!ind) return;
        e.preventDefault();
        const current = Math.max(12, Math.min(45, Number(store.get('rsiPaneHeight', 22))));
        store.set('rsiPaneHeight', Math.max(12, Math.min(45, current + (e.deltaY < 0 ? 1 : -1))));
        margins();
    }, { passive: false });
    /* ---------- Indicators menu ---------- */
    $('imenu').innerHTML = INDREG.types().map(t => `<button data-t="${t}"><b>${M(t).name}</b></button>`).join('');
    function positionIndicatorMenu() {
        const button = $('btnInd'), menu = $('imenu'), main = $('main');
        const b = button.getBoundingClientRect(), m = main.getBoundingClientRect();
        menu.style.left = '8px';
        menu.style.right = 'auto';
        menu.style.top = '8px';
        const width = menu.offsetWidth || 220, height = menu.offsetHeight || 260;
        const safeRight = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-right')) || 0;
        const safeLeft = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-left')) || 0;
        const left = Math.max(8 + safeLeft, Math.min(b.left - m.left, main.clientWidth - width - 8 - safeRight));
        const below = b.bottom - m.top + 3;
        const top = below + height <= main.clientHeight - 8 ? below : Math.max(8, b.top - m.top - height - 3);
        menu.style.left = left + 'px';
        menu.style.top = top + 'px';
    }
    $('btnInd').onclick = () => {
        const open = $('imenu').hidden;
        $('imenu').hidden = !open;
        $('btnInd').setAttribute('aria-expanded', String(open));
        $('pop').hidden = true;
        if (typeof closeTypeMenu === 'function') closeTypeMenu();
        if (open)
            positionIndicatorMenu();
    };
    addEventListener('resize', () => {
        if (!$('imenu').hidden)
            positionIndicatorMenu();
    });
    addEventListener('keydown', e => {
        if (e.key === 'Escape' && !$('imenu').hidden) {
            $('imenu').hidden = true;
            $('btnInd').setAttribute('aria-expanded', 'false');
        }
    });
    $('imenu').onclick = e => {
        const t = e.target.closest('button')?.dataset.t;
        if (!t)
            return;
        $('imenu').hidden = true;
        $('btnInd').setAttribute('aria-expanded', 'false');
        add(t);
    };
    document.addEventListener('click', e => {
        if (e.target !== $('btnInd') && !$('imenu').contains(e.target)) {
            $('imenu').hidden = true;
            $('btnInd').setAttribute('aria-expanded', 'false');
        }
        if (!$('iset').contains(e.target) && !e.target.closest('#lg'))
            $('iset').hidden = true;
    });
    function add(t) {
        if (M(t).vol && inds.some(i => i.t === t))
            return;
        const ind = { t, p: remembered(t), v: true };
        create(ind);
        inds.push(ind);
        margins();
        applyFull(ind);
        legend();
        save();
        warm();
    }
    /* ---------- History warm-up ----------
       Long averages (e.g. EMA 250) need far more candles than the first request returns.
       Pre-load older candles right away, so the line is complete and its last value is final before the user scrolls. */
    const need = () => Math.min(MAXNEED, inds.reduce((a, i) => Math.max(a, M(i.t).need(i.p)), 0));
    function warm() {
        clearTimeout(wt);
        wt = setTimeout(() => {
            if (inds.length && data.length < need() && typeof loadOlder === 'function')
                loadOlder(); /* loadOlder -> IND.full() -> warm() again until enough candles or no more history */
        }, 0);
    }
    /* ---------- API used by app.js ---------- */
    let tn = 0; /* candle count at the last calculation (a change means a new candle -> full recalc) */
    function full() {
        tn = data.length;
        inds.forEach(applyFull);
        if (inds.length)
            markers(true);
        vals();
        warm();
    }
    function tick() {
        if (tt || !inds.length)
            return;
        tt = setTimeout(() => { tt = 0; const n = data.length, f = n !== tn; tn = n; inds.forEach(i => f ? applyFull(i) : apply(i, false)); vals(); }, 100);
    }
    /* Called every animation frame: per-indicator hooks (e.g. the RSI value badge on the right edge) */
    function frame() {
        /* The main price axis keeps drawing its ticks through the oscillator panes; cover that part of the axis
           (the panes show their own labels), so coin prices never appear next to RSI / DMI. */
        const vis = inds.filter(i => i.v && M(i.t).osc && i.pane);
        if (vis.length) {
            const H = $('cw').clientHeight - ((chart.timeScale().height && chart.timeScale().height()) || 28), top = Math.round(Math.min(...vis.map(i => i.pane[0])) * H);
            axMask.hidden = false;
            axMask.style.top = top + 'px';
            axMask.style.height = Math.max(0, H - top) + 'px';
            axMask.style.width = chart.priceScale('right').width() + 'px';
        } else axMask.hidden = true;
        const ctx = { H: $('cw').clientHeight, W: chart.priceScale('right').width() + 'px' };
        for (const i of inds) {
            const m = M(i.t);
            m.frame && m.frame(i, ctx);
        }
    }
    function clear() { tn = 0; inds.forEach(i => { i.s.forEach(s => s.setData([])); i.last = null; if (i.pln) { i.s[0].removePriceLine(i.pln); i.pln = null; } i.st = null; i.anchor = null; i.settled = false; const m = M(i.t); if (m.clear) m.clear(i); }); markers(true); vals(); }
    function colors() { inds.filter(i => i.t === 'volume').forEach(i => apply(i, true)); }
    /* Restore saved indicators */
    const migrate = store.get('indsV', 0) < 2; /* one-time: line width defaults to 1 for every indicator */
    store.set('indsV', 2);
    store.get('inds', []).filter(x => M(x.t)).forEach(x => {
        const ind = { t: x.t, p: Object.assign({}, M(x.t).defaults, x.p), v: x.v !== false };
        /* DMI: earlier default colours (green / red / blue) -> TradingView's (blue / orange / red) */
        if (x.t === 'dmi' && (ind.p.ca === '#ff9800' || (ind.p.cp === '#26a69a' && ind.p.cm === '#ef5350' && /^#2962ff$/i.test(ind.p.ca)))) Object.assign(ind.p, { cp: '#2962FF', cm: '#FF6D00', ca: '#F23645' });
        if (migrate && 'w' in ind.p)
            ind.p.w = 1;
        create(ind);
        inds.push(ind);
    });
    margins();
    legend();
    /* Remove every indicator at once (no confirmation) */
    function removeAll() {
        inds.forEach(i => { i.s.forEach(s => chart.removeSeries(s)); M(i.t).destroy && M(i.t).destroy(i); });
        inds = [];
        $('iset').hidden = true;
        setId = 0;
        margins();
        markers(true);
        legend();
        save();
    }
    /* Show / hide every indicator at once (used by the drawing toolbar's eye menu) */
    function setVisible(show) {
        inds.forEach(i => { i.v = show; style(i); });
        markers(true);
        legend();
        save();
    }
    const count = () => inds.length;
    const allHidden = () => inds.length > 0 && inds.every(i => !i.v);
    return { setMainMargins, full, tick, clear, colors, frame, removeAll, need, setVisible, count, allHidden };
})();
