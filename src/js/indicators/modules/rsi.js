/* RSI (Wilder), styled and calculated like TradingView's built-in "Relative Strength Index" (Pine v6) - without alerts:
   purple 1px line, dashed grey 70 / 50 / 30 levels, translucent band between 70 and 30, green / red gradient fills beyond
   the overbought / oversold levels, optional smoothing MA (SMA, EMA, SMMA, WMA, VWMA) and optional
   regular bullish / bearish divergence lines + labels. Auto-fitted scale and coloured value badges on the right edge. */
INDREG.register('rsi', (function () {
    const { LEN, SRCF, COL, WID, colorAlpha, opac, line } = INDKIT;
    const LEVEL = '#787B86', LEVEL_MID = 'rgba(120,123,134,.55)', BAND = 'rgba(126,87,194,.1)', CLEAR = 'rgba(0,0,0,0)';
    const MA_SHORT = { 'SMA': 'SMA', 'EMA': 'EMA', 'SMMA (RMA)': 'SMMA', 'WMA': 'WMA', 'VWMA': 'VWMA' };
    const hasMA = p => !!p.maType && p.maType !== 'None';
    /* colour with alpha; unlike INDKIT.rgba it keeps the hue at alpha 0 (needed for gradient stops) */
    const col = (hex, a) => { const m = /^#([0-9a-f]{6})$/i.exec(String(hex)), n = m ? parseInt(m[1], 16) : 0x888888; return `rgba(${n >> 16},${n >> 8 & 255},${n & 255},${Math.max(0, Math.min(1, a))})`; };
    const last = a => a.length ? a[a.length - 1] : null;
    /* replace the newest point (same candle) or append a new one */
    const put = (arr, q) => { const l = arr.length - 1; if (l >= 0 && arr[l].time === q.time) arr[l] = q; else if (l < 0 || arr[l].time < q.time) arr.push(q); };

    /* ---- smoothing moving average over RSI points ---- */
    function smoothNum(d, rsi, p) {
        const vals = rsi.map(x => x.value);
        let vols = null;
        if (p.maType === 'VWMA') { const m = new Map(d.map(b => [b.time, Number(b.v) || 0])); vols = rsi.map(x => m.get(x.time) || 0); }
        return RSI_CORE.smooth(p.maType, vals, vols, p.maLen);
    }
    function smoothPts(d, rsi, p) {
        if (!hasMA(p) || !rsi.length) return [[], [], []];
        const { ma } = smoothNum(d, rsi, p), mid = [];
        for (let i = 0; i < rsi.length; i++) {
            if (!Number.isFinite(ma[i])) continue;
            mid.push({ time: rsi[i].time, value: ma[i] });

        }
        return [mid, [], []];
    }
    function divPts(d, rsi, p) {
        if (!p.div || rsi.length < 11) return { bull: [], bear: [] };
        const m = new Map(d.map(b => [b.time, b])), pick = (x, k) => { const b = m.get(x.time); return b ? Number(b[k]) : NaN; };
        return RSI_CORE.divergence(rsi, rsi.map(x => pick(x, 'low')), rsi.map(x => pick(x, 'high')));
    }

    /* ---- custom drawing under / over the lines (Lightweight Charts series primitive) ---- */
    function makePrimitive(ind) {
        let request = null;
        const ts = () => chart.timeScale();
        /* the on-screen slice of `arr` (+1 point each side), projected to pixels */
        function project(arr, s) {
            const r = ts().getVisibleRange();
            if (!r || !arr.length) return [];
            let a = 0, b = arr.length;
            while (a < b) { const m = (a + b) >> 1; arr[m].time < r.from ? a = m + 1 : b = m; }
            const lo = Math.max(0, a - 1);
            a = lo; b = arr.length;
            while (a < b) { const m = (a + b) >> 1; arr[m].time <= r.to ? a = m + 1 : b = m; }
            const hi = Math.min(arr.length - 1, a), out = [];
            for (let i = lo; i <= hi; i++) {
                const x = ts().timeToCoordinate(arr[i].time), y = s.priceToCoordinate(arr[i].value);
                if (x != null && y != null) out.push({ x, y });
            }
            return out;
        }
        /* fill `poly`, but only between price levels vTop and vBot, with a vertical colour gradient (alpha aTop -> aBot) */
        function gradient(c, W, poly, s, vTop, vBot, aTop, aBot, color) {
            const yT = s.priceToCoordinate(vTop), yB = s.priceToCoordinate(vBot);
            if (yT == null || yB == null || Math.abs(yB - yT) < 1) return;
            c.save();
            c.beginPath(); c.rect(0, Math.min(yT, yB), W, Math.abs(yB - yT)); c.clip();
            const g = c.createLinearGradient(0, yT, 0, yB);
            g.addColorStop(0, col(color, aTop)); g.addColorStop(1, col(color, aBot));
            c.fillStyle = g; c.fill(poly);
            c.restore();
        }
        function clipPane(c, mediaSize) {
            const f = ind.pane;
            if (!f) return false;
            c.beginPath(); c.rect(0, f[0] * mediaSize.height, mediaSize.width, (f[1] - f[0]) * mediaSize.height); c.clip();
            return true;
        }
        function roundRect(c, x, y, w, h, r) {
            c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
        }
        /* TradingView "label up / label down": a filled box with a pointer touching the value */
        function label(c, x, y, text, bg, up) {
            const w = c.measureText(text).width + 12, h = 16, tip = 5, by = up ? y + tip : y - tip - h;
            c.beginPath();
            roundRect(c, x - w / 2, by, w, h, 3);
            if (up) { c.moveTo(x - 4, by); c.lineTo(x, y); c.lineTo(x + 4, by); } else { c.moveTo(x - 4, by + h); c.lineTo(x, y); c.lineTo(x + 4, by + h); }
            c.fillStyle = bg; c.fill();
            c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
            c.fillText(text, x, by + h / 2 + .5);
        }
        const fills = {
            zOrder: () => 'bottom',
            renderer: () => ({
                draw: target => target.useMediaCoordinateSpace(({ context: c, mediaSize }) => {
                    const fx = ind.fx, p = ind.p, s = ind.s && ind.s[0];
                    if (!ind.v || !fx || !s) return;
                    c.save();
                    if (!clipPane(c, mediaSize)) { c.restore(); return; }
                    const W = mediaSize.width, yMid = s.priceToCoordinate(Number(p.mid)), pts = project(fx.rsi, s);
                    if (yMid != null && pts.length > 1) {
                        /* area between the RSI line and the middle level, coloured only beyond the upper / lower level */
                        const poly = new Path2D();
                        poly.moveTo(pts[0].x, yMid); pts.forEach(q => poly.lineTo(q.x, q.y)); poly.lineTo(pts[pts.length - 1].x, yMid); poly.closePath();
                        gradient(c, W, poly, s, 100, Number(p.ob), opac(p, 'obColor'), 0, p.obColor);
                        gradient(c, W, poly, s, Number(p.os), 0, 0, opac(p, 'osColor'), p.osColor);
                    }
                    c.restore();
                })
            })
        };
        const divergence = {
            zOrder: () => 'top',
            renderer: () => ({
                draw: target => target.useMediaCoordinateSpace(({ context: c, mediaSize }) => {
                    const fx = ind.fx, p = ind.p, s = ind.s && ind.s[0];
                    if (!ind.v || !p.div || !fx || !s) return;
                    c.save();
                    if (!clipPane(c, mediaSize)) { c.restore(); return; }
                    c.font = '600 11px -apple-system, "Segoe UI", Roboto, sans-serif';
                    c.lineWidth = 2; c.lineJoin = 'round'; c.lineCap = 'round';
                    const pass = (pivots, key, text, up) => {
                        const q = pivots.map(pt => ({ x: ts().timeToCoordinate(pt.time), y: s.priceToCoordinate(pt.value), cond: pt.cond }));
                        c.strokeStyle = colorAlpha(p, key);
                        /* the line joins consecutive pivots; only a segment that ends on a divergence is visible */
                        for (let i = 1; i < q.length; i++) {
                            if (!q[i].cond || q[i].x == null || q[i - 1].x == null || q[i].y == null || q[i - 1].y == null) continue;
                            c.beginPath(); c.moveTo(q[i - 1].x, q[i - 1].y); c.lineTo(q[i].x, q[i].y); c.stroke();
                        }
                        for (const t of q) if (t.cond && t.x != null && t.y != null) label(c, t.x, t.y, text, colorAlpha(p, key), up);
                    };
                    pass(fx.bull, 'bullColor', 'Bull', true);
                    pass(fx.bear, 'bearColor', 'Bear', false);
                    c.restore();
                })
            })
        };
        return {
            attached: params => { request = params.requestUpdate; },
            detached: () => { request = null; },
            updateAllViews: () => {},
            paneViews: () => [fills, divergence],
            requestUpdate: () => { if (request) request(); }
        };
    }

    return {
        name: 'RSI', shortName: 'RSI', osc: true,
        fields: [
            LEN, SRCF, Object.assign({}, COL, { l: 'RSI color' }), WID,
            { k: 'ob', l: 'Upper level', t: 'n', min: 1, max: 100, step: 1 }, { k: 'mid', l: 'Middle level', t: 'n', min: 0, max: 100, step: 1 }, { k: 'os', l: 'Lower level', t: 'n', min: 0, max: 99, step: 1 },
            { k: 'showRsi', l: 'Show RSI line', t: 'b' }, { k: 'rsiStyle', l: 'RSI line style', t: 's', o: ['Solid', 'Dotted', 'Dashed', 'Large dashed'] },
            { k: 'showOb', l: 'Show upper level', t: 'b' }, { k: 'obStyle', l: 'Upper line style', t: 's', o: ['Solid', 'Dotted', 'Dashed', 'Large dashed'] },
            { k: 'showMid', l: 'Show middle level', t: 'b' }, { k: 'midStyle', l: 'Middle line style', t: 's', o: ['Solid', 'Dotted', 'Dashed', 'Large dashed'] },
            { k: 'showOs', l: 'Show lower level', t: 'b' }, { k: 'osStyle', l: 'Lower line style', t: 's', o: ['Solid', 'Dotted', 'Dashed', 'Large dashed'] },
            { k: 'showLevels', l: 'Show reference levels', t: 'b' },
            { k: 'maType', l: 'Smoothing type', t: 's', o: RSI_CORE.MA_TYPES.filter(x => x !== 'SMA + Bollinger Bands') }, { k: 'maLen', l: 'Smoothing length', t: 'n', min: 1, max: 500, step: 1 }, { k: 'showMA', l: 'Show smoothing line', t: 'b' }, { k: 'maStyle', l: 'Smoothing line style', t: 's', o: ['Solid', 'Dotted', 'Dashed', 'Large dashed'] },
            { k: 'div', l: 'Calculate divergence', t: 'b' },
            { k: 'maColor', l: 'Smoothing color', t: 'c' },
            { k: 'obColor', l: 'Overbought fill color', t: 'c' }, { k: 'osColor', l: 'Oversold fill color', t: 'c' },
            { k: 'bullColor', l: 'Bullish divergence color', t: 'c' }, { k: 'bearColor', l: 'Bearish divergence color', t: 'c' }
        ],
        defaults: {
            len: 14, src: 'close', color: '#7E57C2', w: 1, ob: 70, mid: 50, os: 30, showRsi: true, rsiStyle: 'Solid', showOb: true, obStyle: 'Dashed', showMid: true, midStyle: 'Dashed', showOs: true, osStyle: 'Dashed', showLevels: true,
            maType: 'SMA', maLen: 14, div: false, showMA: false, maStyle: 'Solid',
            maColor: '#FFEB3B', obColor: '#4CAF50', osColor: '#FF5252', bullColor: '#4CAF50', bearColor: '#FF5252'
        },
        create(ind) {
            /* Keep legacy smoothing selections compatible without retaining the removed Bollinger UI. */
            if (ind.p.maType === 'SMA + Bollinger Bands') ind.p.maType = 'SMA';
            const none = { autoscaleInfoProvider: () => null };
            /* The band between the lower and upper level: a Baseline series whose base is `os` and whose data is a constant `ob`,
               so only the 30-70 range is filled (an Area series ignores baseValue and would fill down to the pane bottom). Added before the RSI line so it is painted under it. */
            ind.fillS = chart.addBaselineSeries(Object.assign({
                priceScaleId: ind.sid, baseValue: { type: 'price', price: Number(ind.p.os ?? 30) },
                lineVisible: false, topLineColor: CLEAR, bottomLineColor: CLEAR,
                topFillColor1: BAND, topFillColor2: BAND, bottomFillColor1: CLEAR, bottomFillColor2: CLEAR,
                priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false
            }, none));
            /* value badges on the right edge: RSI and its smoothing MA */
            ind.lb = document.createElement('div');
            ind.lb.className = 'olb';
            $('olb').appendChild(ind.lb);
            ind.lb2 = document.createElement('div');
            ind.lb2.className = 'olb';
            $('olb').appendChild(ind.lb2);
            /* 70 / 30 scale labels are DOM (like the value badge): native axis labels would sit on the covered price axis. */
            ind.lv = ['ob', 'os'].map(k => { const e = document.createElement('div'); e.className = 'olb olb-level'; e.dataset.level = k; $('olb').appendChild(e); return e; });
            const o = { priceScaleId: ind.sid };
            /* Scale fits the visible RSI values but always keeps the reference levels in view (like TradingView). Series order = paint order: RSI, then the MA on top. */
            const s = [
                line({
                    priceScaleId: ind.sid,
                    autoscaleInfoProvider: base => {
                        const r = typeof base === 'function' ? base() : null, p = ind.p;
                        let lo = Number(p.os), hi = Number(p.ob);
                        if (r && r.priceRange) { lo = Math.min(lo, r.priceRange.minValue); hi = Math.max(hi, r.priceRange.maxValue); }
                        const autoLo = Math.max(0, lo - 2), autoHi = Math.min(100, hi + 2);
                        const range = ind.scaleRange;
                        return { priceRange: range ? { minValue: Math.max(0, range.min), maxValue: Math.min(100, range.max) } : { minValue: autoLo, maxValue: autoHi } };
                    }
                }),
                line(o), line(o), line(o)
            ];
            if (typeof s[0].attachPrimitive === 'function') {
                ind.prim = makePrimitive(ind);
                s[0].attachPrimitive(ind.prim);
            }
            return s;
        },
        calc(d, p, ind) {
            const snap = {}, rsi = RSI_CORE.calculate(d, p.len, p.src, snap), [mid, up, lo] = smoothPts(d, rsi, p), dv = divPts(d, rsi, p);
            if (ind) { ind.st = snap; ind.fx = { rsi, bu: up, bl: lo, bull: dv.bull, bear: dv.bear }; }
            /* Band covers every candle plus the chart's future axis (same times as the app's `fut` helper series), so it reaches the right edge. */
            if (ind && ind.fillS && d.length) {
                const lastTime = d[d.length - 1].time;
                const sig = d.length + ':' + d[0].time + ':' + lastTime + ':' + p.ob + ':' + p.os + ':' + (typeof tf !== 'undefined' ? tf : '');
                if (ind.bandSig !== sig) {
                    ind.bandSig = sig;
                    const times = d.map(b => b.time).concat(typeof futTimes === 'function' ? futTimes(lastTime).map(x => x.time) : []);
                    ind.fillS.setData(times.map(time => ({ time, value: Number(p.ob) })));
                }
            }
            return [rsi, mid, up, lo];
        },
        /* O(1) RSI update of the forming candle (re-evaluates only the newest bar from the snapshot taken before it); the smoothing is
           cheap to redo. Divergence needs a full pass, so it falls back to calc(). */
        tail(d, p, ind) {
            const n = d.length, st = ind.st, fx = ind.fx;
            if (n < 2 || !st || st.n !== n || !fx || p.div) return null;
            const pt = RSI_CORE.tail(st, d[n - 1], p.len, p.src);
            if (!pt) return null;
            put(fx.rsi, pt);
            if (!hasMA(p)) return [pt];
            const { ma } = smoothNum(d, fx.rsi, p), i = fx.rsi.length - 1;
            if (!Number.isFinite(ma[i])) return [pt, null, null, null];
            const m = { time: pt.time, value: ma[i] };
            return [pt, m, null, null];
        },
        style(ind) {
            const p = ind.p, s = ind.s, show = !!ind.v && !!p.showLevels;
            /* Reference-level default: lineStyle: 2 (dashed). */
            const lineStyles = { 'Solid': 0, 'Dotted': 1, 'Dashed': 2, 'Large dashed': 3 };
            s[0].applyOptions({ color: colorAlpha(p, 'color'), lineWidth: p.w, lineStyle: lineStyles[p.rsiStyle] ?? 0, visible: !!ind.v && p.showRsi !== false });
            s[1].applyOptions({ color: colorAlpha(p, 'maColor'), lineWidth: 1, lineStyle: lineStyles[p.maStyle] ?? 0, visible: !!ind.v && hasMA(p) && p.showMA !== false });
            s[2].applyOptions({ visible: false });
            s[3].applyOptions({ visible: false });
            (ind.pl || []).forEach(l => s[0].removePriceLine(l));
            /* Dashed grey levels; the 70 / 30 ones carry a scale label, the optional middle one does not. */
            ind.pl = show ? [[p.ob, 'ob'], [p.mid, 'mid'], [p.os, 'os']].filter(([, k]) => k === 'ob' ? p.showOb !== false : k === 'mid' ? p.showMid : p.showOs !== false).map(([price, k]) => s[0].createPriceLine({ price: Number(price), color: k === 'mid' ? LEVEL_MID : LEVEL, lineWidth: 1, lineStyle: ({ Solid: 0, Dotted: 1, Dashed: 2, 'Large dashed': 3 })[p[k + 'Style']] ?? 2, axisLabelVisible: false, title: '' })) : [];
            if (ind.fillS) ind.fillS.applyOptions({ visible: show && p.showOb !== false && p.showOs !== false, baseValue: { type: 'price', price: Number(p.os) } });
            if (ind.prim) ind.prim.requestUpdate();
        },
        label: ind => `RSI ${ind.p.len} ${ind.p.src}` + (hasMA(ind.p) && ind.p.showMA !== false ? ` ${MA_SHORT[ind.p.maType]} ${ind.p.maLen}` : ''),
        color: p => p.color,
        fmt: (ind, g) => {
            const p = ind.p, f = (k, c) => { const v = g(k); return v == null ? '' : `<span style="color:${c}">${v.toFixed(2)}</span>`; };
            let h = f(0, p.color);
            if (hasMA(p) && p.showMA !== false) h += ' ' + f(1, p.maColor);
            return h;
        },
        /* Wilder's seed influence falls below 0.005 RSI points; EMA / RMA smoothing needs its own warm-up on top */
        need: p => p.len * 10 + (p.maType === 'EMA' || p.maType === 'SMMA (RMA)' ? p.maLen * 12 : hasMA(p) ? p.maLen : 0) + (p.div ? 70 : 0),
        clear(ind) { ind.fx = null; if (ind.prim) ind.prim.requestUpdate(); },
        /* keep the value badges level with their lines, on the right edge */
        frame(ind, ctx) {
            const p = ind.p, items = [], pane = ind.pane;
            const top = pane ? Math.max(0, pane[0] * ctx.H) : 0;
            const bottom = pane ? Math.min(ctx.H, pane[1] * ctx.H) : ctx.H;
            const add = (e, y, v, bg, fg, level = false) => {
                if (y == null || !Number.isFinite(y) || y < top || y > bottom || v == null || !Number.isFinite(v)) { e.style.display = 'none'; return; }
                items.push({ e, y, v, bg, fg, level });
            };
            if (ind.lv) for (const e of ind.lv) {
                const lvl = Number(p[e.dataset.level]), ly = ind.v && p.showLevels ? ind.s[0].priceToCoordinate(lvl) : null;
                add(e, ly, ind.v && p.showLevels ? lvl : null, e.dataset.level === 'ob' ? LEVEL : LEVEL, '#fff', true);
            }
            for (const [k, e, bg, fg] of [[0, ind.lb, p.color, '#fff'], [1, ind.lb2, p.maColor, '#131722']]) {
                const v = ind.v && ind.last && (k === 0 ? p.showRsi !== false : hasMA(p) && p.showMA !== false) ? ind.last[k] : null;
                const y = v == null ? null : ind.s[k].priceToCoordinate(v);
                add(e, y, v, bg, fg);
            }
            items.sort((a, b) => a.y - b.y);
            const gap = 17, usable = Math.max(0, bottom - top - 16);
            for (let i = 0; i < items.length; i++) items[i].y = Math.max(items[i].y, top + 8 + i * gap);
            for (let i = items.length - 1; i >= 0; i--) {
                const maxY = bottom - 8 - (items.length - 1 - i) * gap;
                items[i].y = Math.min(items[i].y, maxY);
            }
            for (const { e, y, v, bg, fg, level } of items) {
                e.style.display = 'block'; e.style.width = ctx.W; e.style.background = bg; e.style.color = fg;
                e.textContent = Number(v).toFixed(2);
                e.style.transform = `translateY(${Math.round(y - 8)}px)`;
            }
        },
        destroy: ind => {
            if (ind.lb) ind.lb.remove();
            if (ind.lb2) ind.lb2.remove();
            (ind.lv || []).forEach(e => e.remove());
            if (ind.prim) { try { ind.s[0].detachPrimitive(ind.prim); } catch (e) { /* the series is already removed */ } ind.prim = null; }
            if (ind.fillS) { chart.removeSeries(ind.fillS); ind.fillS = null; }
        }
    };
})());
