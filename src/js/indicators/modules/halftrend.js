/* HalfTrend: trend line + optional ATR channels, buy/sell arrows go to ind.mk (merged onto the candles by the engine) */
INDREG.register('halftrend', (function () {
    const { rgba, opac, colorAlpha, WID, line } = INDKIT;
    function ht(d, p, ind) {
        const n = d.length, A = Math.max(1, p.amp | 0), L = [], H = [], Lo = [], mk = [];
        /* Rolling extrema and sums avoid rescanning up to A candles for every point. */
        const maxQ = [], minQ = [];
        let maxHead = 0, minHead = 0, rollHigh = 0, rollLow = 0;
        ind.mk = [];
        if (!n)
            return [L, H, Lo];
        let trend = 0, next = 0, maxLow = d[0].low, minHigh = d[0].high, up = NaN, down = NaN, prev = null, atr = NaN, trSum = 0;
        for (let i = 0; i < n; i++) {
            const b = d[i], pl = i ? d[i - 1].low : b.low, ph = i ? d[i - 1].high : b.high;
            const tr = i ? Math.max(b.high - b.low, Math.abs(b.high - d[i - 1].close), Math.abs(b.low - d[i - 1].close)) : b.high - b.low;
            if (i < 100) {
                trSum += tr;
                if (i === 99)
                    atr = trSum / 100;
            }
            else
                atr = (atr * 99 + tr) / 100;
            const a2 = atr / 2;
            rollHigh += b.high;
            rollLow += b.low;
            if (i >= A) { rollHigh -= d[i - A].high; rollLow -= d[i - A].low; }
            while (maxQ.length > maxHead && d[maxQ[maxQ.length - 1]].high <= b.high) maxQ.pop();
            while (minQ.length > minHead && d[minQ[minQ.length - 1]].low >= b.low) minQ.pop();
            maxQ.push(i); minQ.push(i);
            const first = i - A + 1;
            while (maxQ[maxHead] < first) maxHead++;
            while (minQ[minHead] < first) minHead++;
            /* Periodically compact queue storage so head offsets do not grow unbounded. */
            if (maxHead > 1024) { maxQ.splice(0, maxHead); maxHead = 0; }
            if (minHead > 1024) { minQ.splice(0, minHead); minHead = 0; }
            const hh = d[maxQ[maxHead]].high, ll = d[minQ[minHead]].low;
            const hma = i >= A - 1 ? rollHigh / A : NaN, lma = i >= A - 1 ? rollLow / A : NaN;
            if (next === 1) {
                maxLow = Math.max(ll, maxLow);
                if (hma < maxLow && b.close < pl) {
                    trend = 1;
                    next = 0;
                    minHigh = hh;
                }
            }
            else {
                minHigh = Math.min(hh, minHigh);
                if (lma > minHigh && b.close > ph) {
                    trend = 0;
                    next = 1;
                    maxLow = ll;
                }
            }
            let v, buy = false, sell = false;
            if (trend === 0) {
                if (prev !== null && prev !== 0) {
                    up = down;
                    buy = true;
                }
                else
                    up = isNaN(up) ? maxLow : Math.max(maxLow, up);
                v = up;
            }
            else {
                if (prev !== null && prev !== 1) {
                    down = up;
                    sell = true;
                }
                else
                    down = isNaN(down) ? minHigh : Math.min(minHigh, down);
                v = down;
            }
            prev = trend;
            const key = trend === 0 ? 'up' : 'dn', col = colorAlpha(p, key), dev = p.dev * a2;
            L.push({ time: b.time, value: v, color: col });
            if (!isNaN(dev)) {
                H.push({ time: b.time, value: v + dev });
                Lo.push({ time: b.time, value: v - dev });
            }
            if (!isNaN(a2)) {
                if (buy)
                    mk.push({ time: b.time, position: 'belowBar', color: colorAlpha(p, 'up'), shape: 'arrowUp', text: 'Buy' });
                if (sell)
                    mk.push({ time: b.time, position: 'aboveBar', color: colorAlpha(p, 'dn'), shape: 'arrowDown', text: 'Sell' });
            }
        }
        ind.mk = p.ar ? mk : [];
        ind.fx = { L, H, Lo };
        return [L, H, Lo];
    }
    /* Ribbons: the area between the HalfTrend line and each ATR band (upper band = sell colour, lower band = buy colour). */
    function makePrimitive(ind) {
        let request = null;
        const ts = () => chart.timeScale();
        const ribbon = (c, line, band, s, color) => {
            const r = ts().getVisibleRange();
            if (!r || !line.length || !band.length) return;
            const bm = new Map(band.map(q => [q.time, q.value])), pts = [];
            for (const q of line) {
                const bv = bm.get(q.time);
                if (bv == null) continue;
                const x = ts().timeToCoordinate(q.time), y1 = s.priceToCoordinate(q.value), y2 = s.priceToCoordinate(bv);
                if (x != null && y1 != null && y2 != null) pts.push({ x, y1, y2 });
            }
            if (pts.length < 2) return;
            c.beginPath();
            pts.forEach((q, i) => i ? c.lineTo(q.x, q.y1) : c.moveTo(q.x, q.y1));
            for (let i = pts.length - 1; i >= 0; i--) c.lineTo(pts[i].x, pts[i].y2);
            c.closePath();
            c.fillStyle = color; c.fill();
        };
        const view = {
            zOrder: () => 'bottom',
            renderer: () => ({
                draw: target => target.useMediaCoordinateSpace(({ context: c }) => {
                    const fx = ind.fx, p = ind.p, s = ind.s && ind.s[0];
                    if (!ind.v || !p.ch || !fx || !s) return;
                    c.save();
                    ribbon(c, fx.L, fx.H, s, rgba(p.dn, .12 * opac(p, 'dn')));
                    ribbon(c, fx.L, fx.Lo, s, rgba(p.up, .12 * opac(p, 'up')));
                    c.restore();
                })
            })
        };
        return {
            attached: params => { request = params.requestUpdate; },
            detached: () => { request = null; },
            updateAllViews: () => {},
            paneViews: () => [view],
            requestUpdate: () => { if (request) request(); }
        };
    }
    return {
        name: 'HalfTrend', markers: true,
        fields: [{ k: 'amp', l: 'Amplitude', t: 'n', min: 1, max: 100, step: 1 }, { k: 'dev', l: 'Channel deviation', t: 'n', min: 0.1, max: 20, step: 0.1 }, WID, { k: 'up', l: 'Up color', t: 'c' }, { k: 'dn', l: 'Down color', t: 'c' }, { k: 'ar', l: 'Show arrows', t: 'b', tab: 'inputs' }, { k: 'ch', l: 'Show channels', t: 'b', tab: 'inputs' }],
        defaults: { amp: 2, dev: 2, w: 1, up: '#2962ff', dn: '#f23645', ar: true, ch: true },
        create: ind => {
            const s = [line(), line(), line()];
            if (typeof s[0].attachPrimitive === 'function') { ind.prim = makePrimitive(ind); s[0].attachPrimitive(ind.prim); }
            return s;
        },
        calc: (d, p, ind) => ht(d, p, ind),
        clear(ind) { ind.fx = null; ind.mk = []; if (ind.prim) ind.prim.requestUpdate(); },
        destroy(ind) { if (ind.prim) { try { ind.s[0].detachPrimitive(ind.prim); } catch (e) { /* series already removed */ } ind.prim = null; } },
        style(ind) {
            const p = ind.p;
            ind.s[0].applyOptions({ color: colorAlpha(p, 'up'), lineWidth: p.w, visible: ind.v });
            /* upper band = sell colour, lower band = buy colour (as in the TradingView script) */
            ind.s[1].applyOptions({ color: rgba(p.dn, .6 * opac(p, 'dn')), lineWidth: p.w, visible: ind.v && p.ch });
            ind.s[2].applyOptions({ color: rgba(p.up, .6 * opac(p, 'up')), lineWidth: p.w, visible: ind.v && p.ch });
            if (ind.prim) ind.prim.requestUpdate();
        },
        label: ind => `HalfTrend ${ind.p.amp} ${ind.p.dev}`,
        color: p => p.up,
        fmt: (ind, g) => { const a = g(0); return a == null ? '' : INDKIT.fv(a); },
        need: () => 150
    };
})());
