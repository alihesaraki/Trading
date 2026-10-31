  // coords: time <-> x and price <-> y conversion (TimeAxis also covers the empty future area beyond the last candle)
  var TimeAxis = class {
    constructor(times, barSec) {
      this.times = times;
      this.barSec = barSec;
    }
    toLogical(t) {
      const n = this.times.length, ts = this.times;
      if (!n) return 0;
      if (t <= ts[0]) return (t - ts[0]) / this.barSec;
      if (t >= ts[n - 1]) return n - 1 + (t - ts[n - 1]) / this.barSec;
      let lo = 0, hi = n - 1;
      while (hi - lo > 1) {
        const mid = lo + hi >> 1;
        if (ts[mid] <= t) lo = mid;
        else hi = mid;
      }
      return lo + (t - ts[lo]) / (ts[hi] - ts[lo]);
    }
    fromLogical(l) {
      const n = this.times.length, ts = this.times;
      if (!n) return 0;
      if (l <= 0) return ts[0] + l * this.barSec;
      if (l >= n - 1) return ts[n - 1] + (l - (n - 1)) * this.barSec;
      const i = Math.floor(l);
      return ts[i] + (l - i) * (ts[i + 1] - ts[i]);
    }
  };
  /* Time <-> pixel mapping shared by every drawing.
     Drawings are stored in absolute UTC seconds, so they sit on the same moment on every timeframe.
     Lightweight Charts addresses x by "logical index" over ALL points of ALL series (candles + the invisible
     future-axis series + indicators). The candle index is therefore calibrated against the chart itself
     (offset), instead of assuming candle 0 is logical 0. */
  var LwcMapper = class {
    constructor(chart, series, getBars, container, getDecimals) {
      this.chart = chart;
      this.series = series;
      this.getBars = getBars;
      this.container = container;
      this.getDecimals = getDecimals;
      this.axis = new TimeAxis([], 60);
      this.key = "";
    }
    sync() {
      const b = this.getBars(), n = b.length;
      const key = n + ":" + (n ? b[0].time + ":" + b[n - 1].time : "");
      if (key === this.key) return;
      this.key = key;
      const sec = n > 1 ? Math.max(1, b[n - 1].time - b[n - 2].time) : 60;
      this.axis = new TimeAxis(b.map((x) => x.time), sec);
    }
    /** logical index of candle 0 as the chart sees it (0 unless another series has earlier points) */
    offset() {
      const ts = this.axis.times, n = ts.length, sc = this.chart.timeScale();
      if (!n) return null;
      for (const i of [n - 1, n >> 1, 0]) {
        const x = sc.timeToCoordinate(ts[i]);
        if (x == null) continue;
        const l = sc.coordinateToLogical(x);
        if (l != null && Number.isFinite(l)) return Math.round(l) - i;
      }
      return 0;
    }
    bars() {
      return this.getBars();
    }
    barSec() {
      this.sync();
      return this.axis.barSec;
    }
    decimals() {
      return this.getDecimals();
    }
    /** pixel x of candle i, taken straight from the chart by its real time (no logical-index assumptions) */
    cx(i) {
      const x = this.chart.timeScale().timeToCoordinate(this.axis.times[i]);
      return x == null || !Number.isFinite(x) ? null : x;
    }
    /** Time -> x using only the chart's own coordinate of real candle times:
        inside the loaded candles it interpolates linearly in REAL TIME between the two neighbouring candles,
        outside (older than the first / newer than the last candle, e.g. the blank future area) it extrapolates with
        the pixel width of one candle. So any timeframe places the same UTC moment at the same horizontal moment. */
    timeToX(t) {
      this.sync();
      const ts = this.axis.times, n = ts.length;
      if (!n || !Number.isFinite(t)) return null;
      let a, b, ta, tb;
      if (t <= ts[0] || n === 1) { a = 0; b = n > 1 ? 1 : null; }
      else if (t >= ts[n - 1]) { a = n - 2; b = n - 1; }
      else {
        let lo = 0, hi = n - 1;
        while (hi - lo > 1) {
          const mid = lo + hi >> 1;
          if (ts[mid] <= t) lo = mid; else hi = mid;
        }
        a = lo; b = lo + 1;
      }
      const xa = this.cx(a);
      if (xa == null) return this.timeToXLogical(t);
      if (b == null) {
        const sp = this.chart.timeScale().options().barSpacing || 6;
        return xa + (t - ts[a]) / this.axis.barSec * sp;
      }
      const xb = this.cx(b);
      if (xb == null) return this.timeToXLogical(t);
      return xa + (xb - xa) * (t - ts[a]) / (ts[b] - ts[a]);
    }
    /** x -> time, exact inverse of timeToX */
    xToTime(x) {
      this.sync();
      const ts = this.axis.times, n = ts.length;
      if (!n || !Number.isFinite(x)) return null;
      const x0 = this.cx(0), xl = this.cx(n - 1);
      if (x0 == null || xl == null) return this.xToTimeLogical(x);
      if (n === 1) {
        const sp = this.chart.timeScale().options().barSpacing || 6;
        return ts[0] + (x - x0) / sp * this.axis.barSec;
      }
      let a, b;
      if (x <= x0) { a = 0; b = 1; }
      else if (x >= xl) { a = n - 2; b = n - 1; }
      else {
        let lo = 0, hi = n - 1;
        while (hi - lo > 1) {
          const mid = lo + hi >> 1, xm = this.cx(mid);
          if (xm == null) return this.xToTimeLogical(x);
          if (xm <= x) lo = mid; else hi = mid;
        }
        a = lo; b = lo + 1;
      }
      const xa = this.cx(a), xb = this.cx(b);
      if (xa == null || xb == null || xb === xa) return this.xToTimeLogical(x);
      return ts[a] + (ts[b] - ts[a]) * (x - xa) / (xb - xa);
    }
    /* fallbacks through logical indices (only used if the chart cannot give a candle's coordinate) */
    timeToXLogical(t) {
      const off = this.offset();
      if (off == null || !Number.isFinite(t)) return null;
      const x = this.chart.timeScale().logicalToCoordinate(this.axis.toLogical(t) + off);
      return x == null ? null : x;
    }
    xToTimeLogical(x) {
      const off = this.offset();
      if (off == null) return null;
      const l = this.chart.timeScale().coordinateToLogical(x);
      return l == null ? null : this.axis.fromLogical(l - off);
    }
    priceToY(p) {
      const y = this.series.priceToCoordinate(p);
      return y == null ? null : y;
    }
    yToPrice(y) {
      const p = this.series.coordinateToPrice(y);
      return p == null ? null : p;
    }
    plot() {
      const ts = this.chart.timeScale();
      const w2 = ts.width ? ts.width() : this.container.clientWidth - this.chart.priceScale("right").width();
      const th = ts.height ? ts.height() : 28;
      return { x: 0, y: 0, w: Math.max(0, w2), h: Math.max(0, this.container.clientHeight - th) };
    }
    signature() {
      const b = this.getBars(), n = b.length, last = n ? b[n - 1] : null, r = this.chart.timeScale().getVisibleLogicalRange();
      const ref = last ? last.close : 1;
      const y0 = this.series.priceToCoordinate(ref), y1 = this.series.priceToCoordinate(ref * 1.1 + 1);
      return [
        r ? r.from.toFixed(3) + "," + r.to.toFixed(3) : "",
        y0 == null ? "" : (+y0).toFixed(2),
        y1 == null ? "" : (+y1).toFixed(2),
        this.container.clientWidth,
        this.container.clientHeight,
        n,
        n ? b[0].time : 0,
        last ? last.time + ":" + last.high + ":" + last.low + ":" + last.close : "",
        this.getDecimals()
      ].join("|");
    }
    barAtX(x) {
      this.sync();
      const off = this.offset();
      const l = this.chart.timeScale().coordinateToLogical(x);
      if (l == null || off == null) return -1;
      const i = Math.round(l - off), n = this.axis.times.length;
      return i < 0 || i >= n ? -1 : i;
    }
  };
  function pointToAnchor(m, x, y) {
    const time = m.xToTime(x), price = m.yToPrice(y);
    if (time == null || price == null) return null;
    return { time, price };
  }
