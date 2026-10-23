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
                H.push({ time: b.time, value: v + dev, color: rgba(p[key], .4 * Math.max(0, Math.min(100, +(p[key + 'Opacity'] ?? 100)) / 100)) });
                Lo.push({ time: b.time, value: v - dev, color: rgba(p[key], .4 * Math.max(0, Math.min(100, +(p[key + 'Opacity'] ?? 100)) / 100)) });
            }
            if (!isNaN(a2)) {
                if (buy)
                    mk.push({ time: b.time, position: 'belowBar', color: colorAlpha(p, 'up'), shape: 'arrowUp', text: 'Buy' });
                if (sell)
                    mk.push({ time: b.time, position: 'aboveBar', color: colorAlpha(p, 'dn'), shape: 'arrowDown', text: 'Sell' });
            }
        }
        ind.mk = p.ar ? mk : [];
        return [L, H, Lo];
    }
    return {
        name: 'HalfTrend', markers: true,
        fields: [{ k: 'amp', l: 'Amplitude', t: 'n', min: 1, max: 100, step: 1 }, { k: 'dev', l: 'Channel deviation', t: 'n', min: 0.1, max: 20, step: 0.1 }, WID, { k: 'up', l: 'Up color', t: 'c' }, { k: 'dn', l: 'Down color', t: 'c' }, { k: 'ar', l: 'Buy/Sell arrows', t: 'b' }, { k: 'ch', l: 'Channels', t: 'b' }],
        defaults: { amp: 2, dev: 2, w: 1, up: '#2962ff', dn: '#f23645', ar: false, ch: false },
        create: () => [line(), line(), line()],
        calc: (d, p, ind) => ht(d, p, ind),
        style(ind) {
            const p = ind.p;
            ind.s[0].applyOptions({ color: colorAlpha(p, 'up'), lineWidth: p.w, visible: ind.v });
            ind.s[1].applyOptions({ color: rgba(p.up, .4 * opac(p, 'up')), lineWidth: p.w, visible: ind.v && p.ch });
            ind.s[2].applyOptions({ color: rgba(p.dn, .4 * opac(p, 'dn')), lineWidth: p.w, visible: ind.v && p.ch });
        },
        label: ind => `HalfTrend ${ind.p.amp} ${ind.p.dev}`,
        color: p => p.up,
        fmt: (ind, g) => { const a = g(0); return a == null ? '' : INDKIT.fv(a); },
        need: () => 150
    };
})());
