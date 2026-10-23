  // TOOLS: Long / short positions
  function positionInput(d2, side) {
    return {
      side,
      entry: d2.points[0].price,
      stop: d2.points[2].price,
      target: d2.points[1].price,
      account: d2.props.account,
      riskPct: d2.props.riskPct,
      leverage: d2.props.leverage,
      feePct: d2.props.feePct
    };
  }
  function positionResult(d2, side) {
    return calcPosition(positionInput(d2, side));
  }
  var GREEN = "#089981";
  var RED = "#f23645";
  /* Anchor model (identical on every timeframe, like TradingView):
       points[0] = entry  {time, price}      points[1] = target {price}      points[2] = stop {price}
       points[3] = right edge {time}         (its price always equals the entry price)
     Only the TIMES of points[0] and points[3] place the box horizontally; both are absolute UTC seconds, so the box
     covers the same real period whether the chart shows 1m, 5m, 15m, 1h ... Prices are never touched by a timeframe change.
     The box is never forced wider than its real time span, only kept at least MIN_W pixels so it can still be grabbed. */
  var MIN_W = 6;
  function posGeom(d2, fallbackSec) {
    const P = d2.points, et = P[0].time;
    const rt = P[3] && P[3].time > et ? P[3].time : et + (fallbackSec || 60);
    return { et, rt, ep: P[0].price, tp: P[1].price, sp: P[2].price };
  }
  /** keep the four points consistent: target/stop share the entry time, the right edge shares the entry price */
  function posSync(d2) {
    const P = d2.points;
    P[1].time = P[0].time;
    P[2].time = P[0].time;
    P[3].price = P[0].price;
  }
  var tickOf = (m) => Math.pow(10, -(m && m.decimals ? m.decimals() : 2));
  var clean = (v) => +Number(v).toFixed(10);
  var mk = (side) => ({
    type: side,
    label: side === "long" ? "Long position" : "Short position",
    group: "position",
    icon: side,
    points: 1,
    hotkey: side === "long" ? "Ctrl+Alt+Shift+L" : "Ctrl+Alt+Shift+S",
    hideCoords: true,
    fields: [
      { key: "points.0.price", label: "Entry price", type: "number", step: "any", get: (d2) => clean(d2.points[0].price), set: (d2, v, m) => {
        const dir = side === "long" ? 1 : -1, tick = tickOf(m), P = d2.points;
        const lo = (dir > 0 ? P[2].price : P[1].price) + tick, hi = (dir > 0 ? P[1].price : P[2].price) - tick;
        P[0].price = Math.min(Math.max(v, lo), Math.max(lo, hi));
        P[3].price = P[0].price;
      } },
      { key: "points.1.price", label: "Target price", type: "number", step: "any", get: (d2) => clean(d2.points[1].price), set: (d2, v, m) => {
        const dir = side === "long" ? 1 : -1, lim = d2.points[0].price + dir * tickOf(m);
        d2.points[1].price = dir > 0 ? Math.max(v, lim) : Math.min(v, lim);
      } },
      { key: "points.2.price", label: "Stop price", type: "number", step: "any", get: (d2) => clean(d2.points[2].price), set: (d2, v, m) => {
        const dir = side === "long" ? 1 : -1, lim = d2.points[0].price - dir * tickOf(m);
        d2.points[2].price = dir > 0 ? Math.min(v, lim) : Math.max(v, lim);
      } },
      { key: "points.rr", label: "Risk/Reward", type: "number", min: 0.01, step: 0.1, get: (d2) => {
        const k = Math.abs(d2.points[0].price - d2.points[2].price);
        return k > 0 ? +(Math.abs(d2.points[1].price - d2.points[0].price) / k).toFixed(2) : 0;
      }, set: (d2, v) => {
        const k = Math.abs(d2.points[0].price - d2.points[2].price);
        if (k > 0) d2.points[1].price = clean(d2.points[0].price + (side === "long" ? 1 : -1) * k * Math.max(0.01, v));
      } },
      { key: "props.account", label: "Account size", type: "number", min: 1, max: 1e12, step: 100 },
      { key: "props.riskPct", label: "Risk %", type: "number", min: 0.01, max: 100, step: 0.25 },
      { key: "props.leverage", label: "Leverage", type: "number", min: 1, max: 1e3, step: 1 },
      { key: "props.feePct", label: "Fee % per side", type: "number", min: 0, max: 5, step: 0.01 },
      { key: "props.qtyDec", label: "Qty decimals", type: "number", min: 0, max: 8, step: 1 },
      { key: "props.currency", label: "Currency", type: "text" },
      { key: "props.profitColor", label: "Profit color", type: "color", get: (d2) => d2.props.profitColor || GREEN },
      { key: "props.stopColor", label: "Stop color", type: "color", get: (d2) => d2.props.stopColor || RED },
      F.textColor,
      F.fontSize
    ],
    props: { account: 1e4, riskPct: 1, leverage: 1, feePct: 0, qtyDec: 3, currency: "USDT", profitColor: GREEN, stopColor: RED },
    style: { fontSize: 12 },
    /** Default geometry: stop 3% away, target 3% away (R/R 1); width = up to 20 bars of the creation timeframe, kept inside the visible plot. */
    init(d2, m) {
      const e = d2.points[0], dir = side === "long" ? 1 : -1, sec = m.barSec();
      const xe = m.timeToX(e.time), xn = m.timeToX(e.time + sec), pl = m.plot();
      const px = xe == null || xn == null ? null : xn - xe;
      let n = 20;
      if (xe != null && px > 0) n = Math.max(5, Math.min(20, Math.floor((pl.x + pl.w - 24 - xe) / px)));
      d2.points = [e, { time: e.time, price: e.price * (1 + dir * 0.03) }, { time: e.time, price: e.price * (1 - dir * 0.03) }, { time: e.time + sec * n, price: e.price }];
      posSync(d2);
    },
    /** Handle drag: entry moves alone (stays between stop and target), target/stop never cross the entry, right handle sets the width and also moves the entry up/down. */
    dragHandle(d2, idx, a, m) {
      const P = d2.points, e = P[0], tick = tickOf(m), dir = side === "long" ? 1 : -1, sec = m.barSec();
      const clampEntry = (price) => {
        const lo = (dir > 0 ? P[2].price : P[1].price) + tick, hi = (dir > 0 ? P[1].price : P[2].price) - tick;
        return Math.min(Math.max(price, lo), Math.max(lo, hi));
      };
      if (idx === 0) {
        P[0].price = clampEntry(a.price);
        P[0].time = Math.min(a.time, P[3].time - sec);
      } else if (idx === 1) {
        const lim = e.price + dir * tick;
        P[1].price = dir > 0 ? Math.max(a.price, lim) : Math.min(a.price, lim);
      } else if (idx === 2) {
        const lim = e.price - dir * tick;
        P[2].price = dir > 0 ? Math.min(a.price, lim) : Math.max(a.price, lim);
      } else {
        P[0].price = clampEntry(a.price);
        P[3].time = Math.max(a.time, e.time + sec);
      }
      posSync(d2);
    },
    handles(c, d2) {
      const g = posGeom(d2, c.barSec);
      const x0 = c.m.timeToX(g.et), x1r = c.m.timeToX(g.rt), ey = c.m.priceToY(g.ep), ty = c.m.priceToY(g.tp), sy = c.m.priceToY(g.sp);
      if (x0 == null || x1r == null || ey == null || ty == null || sy == null) return [null, null, null, null];
      const right = c.plot.x + c.plot.w, x1 = Math.max(x1r, x0 + MIN_W), xr = Math.max(Math.min(x1, right - 12), x0 + MIN_W);
      const xm = Math.max(x0 + 6, Math.min((x0 + x1) / 2, right - 40, xr - 24));
      return [{ x: x0, y: ey }, { x: xm, y: ty }, { x: xm, y: sy }, { x: xr, y: ey }];
    },
    build(c, d2) {
      const g = posGeom(d2, c.barSec);
      const X0 = c.m.timeToX(g.et), X1 = c.m.timeToX(g.rt), ey = c.m.priceToY(g.ep), ty = c.m.priceToY(g.tp), sy = c.m.priceToY(g.sp);
      if (X0 == null || X1 == null || ey == null || ty == null || sy == null) return [];
      const x0 = X0, x1 = Math.max(X1, X0 + MIN_W);
      const r = positionResult(d2, side), cur = d2.props.currency || "", gc = d2.props.profitColor || GREEN, rc = d2.props.stopColor || RED;
      const after = c.bars.filter((b) => b.time > g.et && b.time <= g.rt);
      const out = r.valid ? positionOutcome(side, g.sp, g.tp, after) : "open";
      const prims = [
        { k: "rect", r: { x: x0, y: Math.min(ey, ty), w: x1 - x0, h: Math.abs(ty - ey) }, fill: gc, fo: out === "tp" ? 0.3 : 0.12, hit: "fill" },
        { k: "rect", r: { x: x0, y: Math.min(ey, sy), w: x1 - x0, h: Math.abs(sy - ey) }, fill: rc, fo: out === "sl" ? 0.3 : 0.12, hit: "fill" },
      ];
      const mainLines = [
        { k: "line", a: { x: x0, y: ey }, b: { x: x1, y: ey }, stroke: "#b2b5be", w: 2 },
        { k: "line", a: { x: x0, y: ty }, b: { x: x1, y: ty }, stroke: gc, w: 2 },
        { k: "line", a: { x: x0, y: sy }, b: { x: x1, y: sy }, stroke: rc, w: 2 }
      ];
      if (r.valid && r.rr >= 1) {
        /* RR levels are PRICE multiples of the risk (entry +/- k * |entry - stop|), converted to pixels afterwards.
           Measuring them in pixels is only correct on a linear scale: on a logarithmic one it puts levels beyond the target. */
        const e0 = d2.points[0].price, riskP = Math.abs(e0 - d2.points[2].price), dirP = side === "long" ? 1 : -1, tgt = d2.points[1].price;
        let lastY = ey;
        for (let k = 1; k <= Math.min(5e3, Math.floor(r.rr + 1e-9)); k++) {
          const pr = e0 + dirP * riskP * k;
          if (!(pr > 0) || (dirP > 0 ? pr >= tgt : pr <= tgt)) continue; /* the target line itself already marks the last level */
          const y = c.m.priceToY(pr);
          if (y == null || Math.abs(y - ty) < 1 || Math.abs(y - ey) < 1) continue;
          if (y < Math.min(ey, ty) - 0.5 || y > Math.max(ey, ty) + 0.5) continue; /* never draw outside the profit box */
          if (Math.abs(y - lastY) < 12 || Math.abs(y - ty) < 12) continue; /* high R/R: skip levels that would overlap */
          lastY = y;
          prims.push({ k: "line", a: { x: x0, y }, b: { x: x1, y }, stroke: gc, w: 1, op: 0.55, hit: "none" });
          prims.push({ k: "text", at: { x: x1 - 4, y: y - 2 }, text: `RR${k}`, size: 10, color: gc, anchor: "end", vAlign: "bottom", hit: "none" });
        }
      }
      /* Only the price, fixed just right of the line's own end (inside the end when the plot has no room). */
      const room = c.plot.x + c.plot.w - x1, inside = room < 56, visible = x1 >= c.plot.x && x0 <= c.plot.x + c.plot.w;
      const num = (y, price, col) => {
        if (visible) prims.push(label(c, { x: inside ? x1 - 4 : x1 + 6, y: inside ? y - 2 : y }, c.price(price), d2.style, { anchor: inside ? "end" : "start", vAlign: inside ? "bottom" : "middle", size: 10, color: col, hit: "none" }));
      };
      num(ey, d2.points[0].price, "#d1d4dc");
      num(ty, d2.points[1].price, gc);
      num(sy, d2.points[2].price, rc);
      prims.push(...mainLines);
      return prims;
    }
  });
  var long = mk("long");
  var short = mk("short");
  var POSITION_TOOLS = [long, short];
