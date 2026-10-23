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
