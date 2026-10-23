/* Indicator kit: shared helpers + the module registry.
   Every indicator lives in its own file under modules/ and registers itself with INDREG.register().
   A module is a plain object:
     name, fields (settings form), defaults,
     osc / vol / markers   flags (oscillator band, volume overlay, buy/sell markers)
     create(ind)           -> array of chart series
     calc(data, p, ind)    -> array of point arrays (one per series)
     tail(data, p, ind)    -> optional O(1) update of the live candle: array of points (or null = use calc)
     style(ind)            -> apply colors / visibility
     label(ind), color(p), fmt(ind, get) -> legend text / color / value html
     need(p)               -> candles needed before the last value is stable (used to pre-load history)
     frame(ind, ctx)       -> optional per-animation-frame hook (value badges) */
var INDREG = (function () {
    const mods = {};
    return { register(t, m) { mods[t] = m; }, get: t => mods[t], types: () => Object.keys(mods) };
})();
var INDKIT = (function () {
    const SRCS = ['close', 'open', 'high', 'low', 'hl2', 'hlc3', 'ohlc4'];
    const LEN = { k: 'len', l: 'Length', t: 'n', min: 1, max: 500, step: 1 }, SRCF = { k: 'src', l: 'Source', t: 's', o: SRCS }, COL = { k: 'color', l: 'Color', t: 'c' }, WID = { k: 'w', l: 'Line width', t: 'n', min: 1, max: 5, step: 1 };
    const rgba = (h, a) => { const hex = /^#[0-9a-f]{6}$/i.test(String(h)) ? String(h) : '#888888'; const n = parseInt(hex.slice(1), 16); const alpha = Math.max(0, Math.min(1, Number(a) || 0)); return alpha === 0 ? 'rgba(0,0,0,0)' : `rgba(${n >> 16},${n >> 8 & 255},${n & 255},${alpha})`; };
    const opac = (p, k) => Math.max(0, Math.min(100, +(p[k + 'Opacity'] ?? 100))) / 100;
    const colorAlpha = (p, k) => rgba(p[k], opac(p, k));
    const srcv = (b, s) => s === 'open' ? b.open : s === 'high' ? b.high : s === 'low' ? b.low : s === 'hl2' ? (b.high + b.low) / 2 : s === 'hlc3' ? (b.high + b.low + b.close) / 3 : s === 'ohlc4' ? (b.open + b.high + b.low + b.close) / 4 : b.close;
    const cmp = v => v >= 1e9 ? (v / 1e9).toFixed(2) + 'B' : v >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(2) + 'K' : v.toFixed(2);
    const fv = v => v.toFixed(map[sym] ? map[sym].dec : 2);
    const line = o => chart.addLineSeries(Object.assign({ priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }, o));
    /* Anchored recursion (EMA / SMMA): once enough history is loaded, the value at one candle is frozen ("anchor").
       Later prepends of older candles can then never change any value from the anchor onward, so the live value stays constant. */
    const findTime = (d, t) => { let lo = 0, hi = d.length - 1; while (lo <= hi) { const m = (lo + hi) >> 1; if (d[m].time === t) return m; d[m].time < t ? lo = m + 1 : hi = m - 1; } return -1; };
    const anchorAt = (ind, d) => { const a = ind.anchor; if (!a) return -1; const i = findTime(d, a.time); if (i < 0) ind.anchor = null; return i; };
    const setAnchor = (ind, d, idx, value) => { if (ind.settled && !ind.anchor && idx >= 0 && idx < d.length) ind.anchor = { time: d[idx].time, value }; };
    return { anchorAt, setAnchor, SRCS, LEN, SRCF, COL, WID, rgba, opac, colorAlpha, srcv, cmp, fv, line };
})();

/* Shared factory for the moving-average family (SMA / EMA / SMMA). Each type has its own module file. */
function makeMAModule(name, def, algo) {
    const { LEN, SRCF, COL, WID, colorAlpha, srcv, line, fv } = INDKIT;
    return {
        name,
        fields: [LEN, SRCF, COL, WID],
        defaults: def,
        create: () => [line()],
        calc: (d, p, ind) => algo.calc(d, p.len, p.src, ind),
        tail: (d, p, ind) => algo.tail ? algo.tail(d, p.len, p.src, ind) : null,
        style: ind => ind.s[0].applyOptions({ color: colorAlpha(ind.p, 'color'), lineWidth: ind.p.w, visible: ind.v }),
        label: ind => `${name} ${ind.p.len} ${ind.p.src}`,
        color: p => p.color,
        fmt: (ind, g) => { const a = g(0); return a == null ? '' : fv(a); },
        need: p => algo.warm ? p.len * algo.warm : p.len
    };
}

/* Pure RSI calculation core, identical to TradingView's ta.rsi (which Binance's chart uses):
   change -> RMA(gain, len) / RMA(loss, len), RMA seeded by the SMA of the first `len` changes, alpha = 1/len,
   RSI = avgLoss == 0 ? 100 : avgGain == 0 ? 0 : 100 - 100 / (1 + avgGain / avgLoss). */
var RSI_CORE = (function () {
  const SOURCES = ['close','open','high','low','hl2','hlc3','ohlc4'];
  function sourceValue(bar, source) {
    if (!bar || !['open','high','low','close'].every(k => Number.isFinite(Number(bar[k])))) return null;
    switch (source) {
      case 'open': return Number(bar.open);
      case 'high': return Number(bar.high);
      case 'low': return Number(bar.low);
      case 'hl2': return (Number(bar.high) + Number(bar.low)) / 2;
      case 'hlc3': return (Number(bar.high) + Number(bar.low) + Number(bar.close)) / 3;
      case 'ohlc4': return (Number(bar.open) + Number(bar.high) + Number(bar.low) + Number(bar.close)) / 4;
      default: return Number(bar.close);
    }
  }
  const normLen = length => Math.max(1, Math.min(500, Math.trunc(Number(length) || 14)));
  const freshState = () => ({ previous: null, gainSum: 0, lossSum: 0, changes: 0, avgGain: null, avgLoss: null });
  /* Advance the state by one source value; returns the RSI (or null while warming up). Mutates `st`. */
  function step(st, value, length) {
    if (value == null) { Object.assign(st, freshState()); return null; }
    if (st.previous == null) { st.previous = value; return null; }
    const change = value - st.previous; st.previous = value;
    const gain = Math.max(change, 0), loss = Math.max(-change, 0);
    if (st.avgGain == null) {
      st.gainSum += gain; st.lossSum += loss; st.changes++;
      if (st.changes < length) return null;
      st.avgGain = st.gainSum / length; st.avgLoss = st.lossSum / length;
    } else {
      st.avgGain = (st.avgGain * (length - 1) + gain) / length;
      st.avgLoss = (st.avgLoss * (length - 1) + loss) / length;
    }
    const rsi = st.avgLoss === 0 ? 100 : st.avgGain === 0 ? 0 : 100 - 100 / (1 + st.avgGain / st.avgLoss);
    return Number.isFinite(rsi) ? Math.max(0, Math.min(100, rsi)) : null;
  }
  /* Returns the RSI points. When `snap` (an object) is passed, it receives the state as it was *before* the newest bar,
     so the live candle can be re-evaluated in O(1) with tail(). */
  function calculate(bars, length = 14, source = 'close', snap) {
    length = normLen(length);
    if (!Array.isArray(bars) || bars.length < 2) return [];
    const ordered = bars.filter(b => b && Number.isFinite(Number(b.time))).slice().sort((a,b) => Number(a.time)-Number(b.time));
    const unique = ordered.filter((b,i) => i === 0 || Number(b.time) !== Number(ordered[i-1].time));
    const out = [], st = freshState(), last = unique.length - 1;
    unique.forEach((bar, i) => {
      if (snap && i === last) { snap.state = Object.assign({}, st); snap.time = bar.time; snap.n = unique.length; }
      const rsi = step(st, sourceValue(bar, source), length);
      if (rsi != null) out.push({ time: bar.time, value: rsi });
    });
    return out;
  }
  /* O(1) value for the newest (still forming) candle from a calculate() snapshot. */
  function tail(snap, bar, length = 14, source = 'close') {
    if (!snap || !snap.state || !bar || bar.time !== snap.time) return null;
    const rsi = step(Object.assign({}, snap.state), sourceValue(bar, source), normLen(length));
    return rsi == null ? null : { time: bar.time, value: rsi };
  }
  /* ---- Smoothing group of TradingView's RSI: a moving average of the RSI line (+ optional Bollinger Bands) ---- */
  const MA_TYPES = ['None', 'SMA', 'SMA + Bollinger Bands', 'EMA', 'SMMA (RMA)', 'WMA', 'VWMA'];
  /* vals = RSI values, vols = volumes aligned with them (VWMA only). Returns { ma, sd } (sd = biased stdev * mult, like ta.stdev),
     NaN wherever Pine would return na. EMA is seeded with the first value, RMA with the SMA of the first `len` values. */
  function smooth(type, vals, vols, len, mult) {
    const n = vals.length, ma = new Array(n).fill(NaN), sd = new Array(n).fill(NaN);
    len = normLen(len);
    if (!n || !MA_TYPES.includes(type) || type === 'None') return { ma, sd };
    if (type === 'EMA') {
      const a = 2 / (len + 1); let e = vals[0]; ma[0] = e;
      for (let i = 1; i < n; i++) { e = a * vals[i] + (1 - a) * e; ma[i] = e; }
    } else if (type === 'SMMA (RMA)') {
      let sum = 0, m = NaN;
      for (let i = 0; i < n; i++) {
        if (i < len - 1) { sum += vals[i]; continue; }
        if (i === len - 1) { sum += vals[i]; m = sum / len; } else m = (m * (len - 1) + vals[i]) / len;
        ma[i] = m;
      }
    } else {
      const mu = Number.isFinite(Number(mult)) ? Number(mult) : 2, den = len * (len + 1) / 2;
      let s = 0, s2 = 0, w = 0, pv = 0, vs = 0;
      for (let i = 0; i < n; i++) {
        const v = vals[i], vol = vols ? Number(vols[i]) || 0 : 0;
        if (type === 'WMA') {
          if (i < len) { s += v; w += (i + 1) * v; } else { w = w - s + len * v; s += v - vals[i - len]; }
          if (i >= len - 1) ma[i] = w / den;
        } else if (type === 'VWMA') {
          pv += v * vol; vs += vol;
          if (i >= len) { pv -= vals[i - len] * (vols ? Number(vols[i - len]) || 0 : 0); vs -= vols ? Number(vols[i - len]) || 0 : 0; }
          if (i >= len - 1 && vs > 0) ma[i] = pv / vs;
        } else { /* SMA and SMA + Bollinger Bands */
          s += v; s2 += v * v;
          if (i >= len) { s -= vals[i - len]; s2 -= vals[i - len] * vals[i - len]; }
          if (i >= len - 1) {
            ma[i] = s / len;
            if (type === 'SMA + Bollinger Bands') sd[i] = Math.sqrt(Math.max(0, s2 / len - ma[i] * ma[i])) * mu;
          }
        }
      }
    }
    return { ma, sd };
  }
  /* ---- Regular bullish / bearish divergence (pivots 5 left / 5 right, previous pivot 5..60 bars back), as in TradingView's RSI.
     pts = RSI points, lows / highs = price lows / highs aligned with them. Each pivot is reported at its own bar;
     `cond` is true when it completes a divergence. ---- */
  function divergence(pts, lows, highs) {
    const L = 5, R = 5, LO = 5, HI = 60, n = pts.length, v = pts.map(p => p.value), bull = [], bear = [];
    let pl = null, ph = null;
    for (let i = L + R; i < n; i++) {
      const c = i - R, x = v[c];
      let isLow = true, isHigh = true;
      for (let k = 1; k <= L; k++) { if (v[c - k] < x) isLow = false; if (v[c - k] > x) isHigh = false; }
      for (let k = 1; k <= R; k++) { if (v[c + k] <= x) isLow = false; if (v[c + k] >= x) isHigh = false; }
      if (isLow) {
        const gap = pl ? i - pl.i - 1 : -1;
        bull.push({ time: pts[c].time, value: x, cond: !!pl && gap >= LO && gap <= HI && x > pl.rsi && lows[c] < pl.price });
        pl = { i, rsi: x, price: lows[c] };
      }
      if (isHigh) {
        const gap = ph ? i - ph.i - 1 : -1;
        bear.push({ time: pts[c].time, value: x, cond: !!ph && gap >= LO && gap <= HI && x < ph.rsi && highs[c] > ph.price });
        ph = { i, rsi: x, price: highs[c] };
      }
    }
    return { bull, bear };
  }
  return { calculate, tail, sourceValue, smooth, divergence, MA_TYPES, SOURCES };
})();

/* DMI: +DI, -DI, ADX (Wilder) in its own band under the chart */
INDREG.register('dmi', (function () {
    const { WID, colorAlpha, line } = INDKIT;
    /* DMI: +DI, -DI, ADX (Wilder) */
    function dmi(d, L, A) {
        const P = [], M = [], X = [];
        let tr = 0, pS = 0, mS = 0, dxS = 0, adx = 0, dn = 0;
        for (let i = 1; i < d.length; i++) {
            const b = d[i], q = d[i - 1], up = b.high - q.high, dw = q.low - b.low;
            const t = Math.max(b.high - b.low, Math.abs(b.high - q.close), Math.abs(b.low - q.close));
            const pd = up > dw && up > 0 ? up : 0, md = dw > up && dw > 0 ? dw : 0;
            if (i <= L) {
                tr += t;
                pS += pd;
                mS += md;
                if (i < L)
                    continue;
                tr /= L;
                pS /= L;
                mS /= L;
            }
            else {
                tr = (tr * (L - 1) + t) / L;
                pS = (pS * (L - 1) + pd) / L;
                mS = (mS * (L - 1) + md) / L;
            }
            const pl = tr ? 100 * pS / tr : 0, mi = tr ? 100 * mS / tr : 0, sum = pl + mi, dx = 100 * Math.abs(pl - mi) / (sum || 1);
            P.push({ time: b.time, value: pl });
            M.push({ time: b.time, value: mi });
            dn++;
            if (dn <= A) {
                dxS += dx;
                if (dn < A)
                    continue;
                adx = dxS / A;
            }
            else
                adx = (adx * (A - 1) + dx) / A;
            X.push({ time: b.time, value: adx });
        }
        return [P, M, X];
    }
    return {
        name: 'DMI', osc: true,
        fields: [{ k: 'len', l: 'DI length', t: 'n', min: 1, max: 200, step: 1 }, { k: 'adx', l: 'ADX smoothing', t: 'n', min: 1, max: 200, step: 1 }, WID, { k: 'showP', l: 'Show +DI', t: 'b' }, { k: 'showM', l: 'Show −DI', t: 'b' }, { k: 'showA', l: 'Show ADX', t: 'b' }, { k: 'cp', l: '+DI color', t: 'c' }, { k: 'cm', l: '−DI color', t: 'c' }, { k: 'ca', l: 'ADX color', t: 'c' }],
        defaults: { len: 14, adx: 14, w: 1, showP: true, showM: true, showA: true, cp: '#26a69a', cm: '#ef5350', ca: '#2962FF' },
        create: ind => {
            const o = { priceScaleId: ind.sid };
            /* one value badge per line on the right edge (same as RSI) */
            ind.lbs = [0, 1, 2].map(() => { const e = document.createElement('div'); e.className = 'olb'; $('olb').appendChild(e); return e; });
            return [line(o), line(o), line(o)];
        },
        calc: (d, p) => dmi(d, p.len, p.adx),
        style: ind => ['cp', 'cm', 'ca'].forEach((k, i) => ind.s[i].applyOptions({ color: colorAlpha(ind.p, k), lineWidth: ind.p.w, visible: !!ind.v && [ind.p.showP, ind.p.showM, ind.p.showA][i] !== false })),
        label: ind => `DMI ${ind.p.len} ${ind.p.adx}`,
        color: p => p.cp,
        fmt: (ind, g) => [0, 1, 2].map(k => { const v = g(k); return `<span style="color:${[ind.p.cp, ind.p.cm, ind.p.ca][k]}">${v == null ? '' : v.toFixed(2)}</span>`; }).join(' '),
        need: p => (p.len + p.adx) * 4,
        frame(ind, ctx) {
            const items = [];
            ind.lbs.forEach((e, k) => {
                const visible = [ind.p.showP, ind.p.showM, ind.p.showA][k] !== false;
                const v = ind.v && visible && ind.last ? ind.last[k] : null, y = v == null ? null : ind.s[k].priceToCoordinate(v);
                if (y == null || y < 0 || y > ctx.H) { e.style.display = 'none'; return; }
                items.push({ e, k, y, v });
            });
            /* keep badges from overlapping: spread them at least 17px apart */
            items.sort((a, b) => a.y - b.y);
            for (let i = 1; i < items.length; i++) items[i].y = Math.max(items[i].y, items[i - 1].y + 17);
            for (const { e, k, y, v } of items) {
                e.style.display = 'block';
                e.style.width = ctx.W;
                e.style.background = [ind.p.cp, ind.p.cm, ind.p.ca][k];
                e.textContent = v.toFixed(2);
                e.style.transform = `translateY(${Math.round(y - 8)}px)`;
            }
        },
        destroy: ind => (ind.lbs || []).forEach(e => e.remove())
    };
})());

/* EMA: seeded with the first source value, then anchored (see INDKIT.setAnchor) so the live value never drifts when older
   candles are loaded. Keeps the value at the last *closed* candle so a live tick is O(1). */
INDREG.register('ema', makeMAModule('EMA', { len: 20, src: 'close', color: '#5050FF', w: 1 }, {
    warm: 6, /* ~6*len candles make the seed's influence negligible */
    calc(d, len, s, ind) {
        const n = d.length, o = new Array(n), a = 2 / (len + 1), { srcv } = INDKIT, ai = INDKIT.anchorAt(ind, d), idx = Math.min(len * 6, 5000) - 1;
        let e = 0, prev = NaN, av;
        for (let i = 0; i < n; i++) {
            if (i === n - 1)
                prev = e;
            e = i === ai ? ind.anchor.value : i ? a * srcv(d[i], s) + (1 - a) * e : srcv(d[0], s);
            if (i === idx)
                av = e;
            o[i] = { time: d[i].time, value: e };
        }
        INDKIT.setAnchor(ind, d, idx, av);
        ind.st = { n, prev };
        return [o];
    },
    tail(d, len, s, ind) {
        const n = d.length, st = ind.st;
        if (n < 2 || !st || st.n !== n)
            return null;
        const a = 2 / (len + 1);
        return [{ time: d[n - 1].time, value: a * INDKIT.srcv(d[n - 1], s) + (1 - a) * st.prev }];
    }
}));

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

/* SMA: running sum, O(n) full calc, O(len) live update */
INDREG.register('sma', makeMAModule('SMA', { len: 7, src: 'close', color: '#B6B6B6', w: 1 }, {
    calc(d, len, s) {
        const n = d.length, o = [], { srcv } = INDKIT;
        let sum = 0;
        const v = new Array(n);
        for (let i = 0; i < n; i++) {
            v[i] = srcv(d[i], s);
            sum += v[i];
            if (i >= len)
                sum -= v[i - len];
            if (i >= len - 1)
                o.push({ time: d[i].time, value: sum / len });
        }
        return [o];
    },
    tail(d, len, s) {
        const n = d.length;
        if (n < len)
            return null;
        let sum = 0;
        for (let i = n - len; i < n; i++)
            sum += INDKIT.srcv(d[i], s);
        return [{ time: d[n - 1].time, value: sum / len }];
    }
}));

/* SMMA / RMA: like EMA (anchored, remembers the value at the last closed candle for O(1) live updates). */
INDREG.register('smma', makeMAModule('SMMA', { len: 200, src: 'close', color: '#C880FF', w: 1 }, {
    warm: 12, /* alpha is 1/len, so it needs about twice the history of an EMA */
    calc(d, len, s, ind) {
        const n = d.length, o = [], { srcv } = INDKIT, ai = INDKIT.anchorAt(ind, d), idx = Math.min(len * 12, 5000) - 1;
        let sum = 0, m = 0, prev = NaN, av;
        for (let i = 0; i < n; i++) {
            const v = srcv(d[i], s);
            if (i < len - 1) {
                sum += v;
                continue;
            }
            if (i === n - 1)
                prev = m;
            if (i === ai)
                m = ind.anchor.value;
            else if (i === len - 1) {
                sum += v;
                m = sum / len;
            }
            else
                m = (m * (len - 1) + v) / len;
            if (i === idx)
                av = m;
            o.push({ time: d[i].time, value: m });
        }
        INDKIT.setAnchor(ind, d, idx, av);
        ind.st = { n, prev };
        return [o];
    },
    tail(d, len, s, ind) {
        const n = d.length, st = ind.st;
        if (n < len + 1 || !st || st.n !== n || st.prev !== st.prev)
            return null;
        return [{ time: d[n - 1].time, value: (st.prev * (len - 1) + INDKIT.srcv(d[n - 1], s)) / len }];
    }
}));

/* Volume histogram (overlaid at the bottom of the price pane) */
INDREG.register('volume', (function () {
    const { rgba, cmp } = INDKIT;
    const base = (b, p) => p.custom ? (b.close >= b.open ? p.upColor : p.dnColor) : (b.close >= b.open ? cUp : cDn);
    const pt = (b, p) => ({ time: b.time, value: b.v || 0, color: rgba(base(b, p), p.op / 100) });
    return {
        name: 'Volume', vol: true,
        fields: [{ k: 'upColor', l: 'Up color', t: 'c' }, { k: 'dnColor', l: 'Down color', t: 'c' }, { k: 'op', l: 'Opacity %', t: 'n', min: 10, max: 100, step: 5 }, { k: 'ht', l: 'Height %', t: 'n', min: 5, max: 60, step: 5 }],
        defaults: { op: 55, ht: 20, custom: false, upColor: '#0f9d7a', dnColor: '#f7e21f' },
        create: () => [chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: 'vol', lastValueVisible: false, priceLineVisible: false })],
        calc: (d, p) => [d.map(b => pt(b, p))],
        tail: (d, p) => d.length ? [pt(d[d.length - 1], p)] : null,
        style: ind => ind.s[0].applyOptions({ visible: ind.v }),
        label: () => 'Volume',
        color: p => p.custom ? p.upColor : '#d1d4dc',
        fmt: (ind, g) => { const a = g(0); return a == null ? '' : cmp(a); },
        /* picking a colour switches the bars from "follow the candle colours" to the chosen colours */
        edited: (ind, k) => { if (k === 'upColor' || k === 'dnColor') ind.p.custom = true; },
        need: () => 1
    };
})());

/* Indicator engine: owns the list of active indicators, their chart series, legend, settings panel and menu.
   All indicator-specific logic lives in modules/*.js (see core/kit.js for the module contract). */
var IND = (function () {
    const { colorAlpha } = INDKIT;
    const M = t => INDREG.get(t);
    let inds = [], uid = 0, mkSig = '', tt = 0, setId = 0, wt = 0, lastIndicatorTap = null, lastChartIndicatorTap = null;
    const save = () => store.set('inds', inds.map(i => ({ t: i.t, p: i.p, v: i.v })));
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
    function openSet(ind, row) {
        setId = ind.id;
        const D = M(ind.t);
        $('iset').innerHTML = `<div class="ih"><b>${D.name}</b><button type="button" data-a="close" title="Close settings" aria-label="Close ${D.name} settings">✕</button></div>${[...D.fields.filter(f => f.t !== 'c'), ...D.fields.filter(f => f.t === 'c')].map(f => field(ind, f)).join('')}<div class="if"><button data-a="def">Defaults</button></div>`;
        $('iset').hidden = false;
        const area = $('cw').getBoundingClientRect(), rr = row.getBoundingClientRect();
        $('iset').style.left = Math.max(0, Math.min(area.width - $('iset').offsetWidth, rr.left - area.left)) + 'px';
        $('iset').style.top = Math.max(0, Math.min(area.height - $('iset').offsetHeight, rr.bottom - area.top + 4)) + 'px';
    }
    function changed(ind) { ind.anchor = null; style(ind); applyFull(ind); markers(true); legend(); save(); warm(); }
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
        const toggle = e.target.closest('[data-color-toggle]');
        if (toggle) { const k = toggle.dataset.colorToggle, panel = $('iset').querySelector(`[data-color-panel="${k}"]`), wasOpen = panel && !panel.hidden; $('iset').querySelectorAll('.icolor-panel').forEach(p => { p.hidden = true; p.style.position = ''; }); $('iset').querySelectorAll('[data-color-toggle]').forEach(b => b.setAttribute('aria-expanded', 'false')); if (panel && !wasOpen) { const tr = toggle.getBoundingClientRect(), pr = $('iset').getBoundingClientRect(); panel.hidden = false; panel.style.position = 'fixed'; panel.style.zIndex = '1000'; panel.style.left = Math.max(8, Math.min(window.innerWidth - 190, pr.left + Math.max(0, Math.min(pr.width - 190, tr.right - pr.left - 190)))) + 'px'; panel.style.top = (tr.bottom + 4 + 150 < window.innerHeight ? tr.bottom + 4 : Math.max(8, tr.top - 154)) + 'px'; toggle.setAttribute('aria-expanded', 'true'); } return; }
        const target = e.target.closest('[data-palette]');
        if (target) { const ind = inds.find(i => i.id === setId), k = target.dataset.k, v = target.dataset.palette; if (ind && k) { ind.p[k] = v; if (M(ind.t).edited) M(ind.t).edited(ind, k); const hex = $('iset').querySelector(`.ihex[data-k="${k}"]`), swatch = $('iset').querySelector(`[data-color-toggle="${k}"] .icolor-swatch`); if (hex) hex.value = v; if (swatch) swatch.style.background = v; changed(ind); } return; }
        const action = e.target.closest('button')?.dataset.a, ind = inds.find(i => i.id === setId);
        if (action === 'close') {
            $('iset').hidden = true;
            setId = 0;
        } else if (action === 'def' && ind) {
            ind.p = Object.assign({}, M(ind.t).defaults);
            changed(ind);
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
        const ind = { t, p: Object.assign({}, M(t).defaults), v: true };
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
        if (x.t === 'dmi' && ind.p.ca === '#ff9800') ind.p.ca = '#2962FF'; /* ADX default colour is now blue */
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
