"use strict";
(() => {
  // types
  var DEFAULT_STYLE = {
    color: "#2962ff",
    width: 2,
    dash: "solid",
    fill: "#2962ff",
    fillOpacity: 0.15,
    textColor: "#d1d4dc",
    fontSize: 12,
    extL: false,
    extR: false
  };

  // math
  /* Adaptive price text. Never fewer decimals than the symbol's own (dec); small prices get up to 8 decimals,
     large prices only as many as keep the value readable. Zeros beyond the symbol's decimals are trimmed. */
  function fmtPrice(p, dec = 2) {
    const v = +p;
    if (!Number.isFinite(v)) return "";
    const a = Math.abs(v);
    const want = a >= 1e3 ? 2 : a >= 100 ? 3 : a >= 1 ? 4 : a >= 0.1 ? 5 : a >= 0.01 ? 6 : a >= 0.001 ? 7 : 8;
    const keep = Math.max(0, Math.min(8, dec | 0));
    const places = Math.min(8, Math.max(keep, want));
    let t = v.toFixed(places);
    if (places > keep) {
      t = t.replace(/0+$/, "");
      const i = t.indexOf(".");
      const have = i < 0 ? 0 : t.length - i - 1;
      if (have < keep) t = v.toFixed(keep);
      else if (t.endsWith(".")) t = t.slice(0, -1);
    }
    return t;
  }
  var dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  function distToSegment(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
    if (l2 === 0) return dist(p, a);
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  }
  function clipLine(a, b, r, mode2) {
    const dx = b.x - a.x, dy = b.y - a.y;
    if (dx === 0 && dy === 0) return null;
    let t0 = mode2 === "line" ? -Infinity : 0, t1 = mode2 === "segment" ? 1 : Infinity;
    const p = [-dx, dx, -dy, dy], q = [a.x - r.x, r.x + r.w - a.x, a.y - r.y, r.y + r.h - a.y];
    for (let i = 0; i < 4; i++) {
      if (p[i] === 0) {
        if (q[i] < 0) return null;
        continue;
      }
      const t = q[i] / p[i];
      if (p[i] < 0) {
        if (t > t1) return null;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return null;
        if (t < t1) t1 = t;
      }
    }
    if (t0 > t1) return null;
    return [{ x: a.x + t0 * dx, y: a.y + t0 * dy }, { x: a.x + t1 * dx, y: a.y + t1 * dy }];
  }
  function pointInPolygon(p, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if (a.y > p.y !== b.y > p.y && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  }
  function normRect(a, b) {
    return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
  }
  function distToPolyline(p, pts2, closed = false) {
    let m = Infinity;
    for (let i = 0; i < pts2.length - 1; i++) m = Math.min(m, distToSegment(p, pts2[i], pts2[i + 1]));
    if (closed && pts2.length > 2) m = Math.min(m, distToSegment(p, pts2[pts2.length - 1], pts2[0]));
    return m;
  }
  function simplify(pts2, eps) {
    const n = pts2.length;
    if (n < 3) return pts2.slice();
    const keep = new Uint8Array(n);
    keep[0] = keep[n - 1] = 1;
    const stack = [0, n - 1];
    while (stack.length) {
      const hi = stack.pop(), lo = stack.pop();
      let idx = -1, dmax = eps;
      for (let i = lo + 1; i < hi; i++) {
        const d2 = distToSegment(pts2[i], pts2[lo], pts2[hi]);
        if (d2 > dmax) {
          dmax = d2;
          idx = i;
        }
      }
      if (idx > 0) {
        keep[idx] = 1;
        stack.push(lo, idx, idx, hi);
      }
    }
    const out = [];
    for (let i = 0; i < n; i++) if (keep[i]) out.push(pts2[i]);
    return out;
  }
  function arrowHead(from, tip, size) {
    const ang = Math.atan2(tip.y - from.y, tip.x - from.x), s = Math.PI / 7;
    return [
      tip,
      { x: tip.x - size * Math.cos(ang - s), y: tip.y - size * Math.sin(ang - s) },
      { x: tip.x - size * Math.cos(ang + s), y: tip.y - size * Math.sin(ang + s) }
    ];
  }

  // shared helpers for every tab
  var F = {
    color: { key: "style.color", label: "Color", type: "color" },
    width: { key: "style.width", label: "Line width", type: "number", min: 1, max: 8, step: 1 },
    dash: { key: "style.dash", label: "Line style", type: "select", options: ["solid", "dashed", "dotted"] },
    fill: { key: "style.fill", label: "Fill color", type: "color" },
    fillOp: { key: "style.fillOpacity", label: "Fill opacity", type: "number", min: 0, max: 1, step: 0.05 },
    textColor: { key: "style.textColor", label: "Text color", type: "color" },
    fontSize: { key: "style.fontSize", label: "Font size", type: "number", min: 8, max: 48, step: 1 },
    extL: { key: "style.extL", label: "Extend left", type: "bool" },
    extR: { key: "style.extR", label: "Extend right", type: "bool" }
  };
  var LINE_F = [F.color, F.width, F.dash];
  var FILL_F = [F.color, F.width, F.dash, F.fill, F.fillOp];
  function pts(c, d2) {
    const out = [];
    for (const a of d2.points) {
      const p = c.px(a);
      if (!p) return null;
      out.push(p);
    }
    return out;
  }
  var strokeOf = (s) => ({ stroke: s.color, w: s.width, dash: s.dash });
  var fillOf = (s) => ({ fill: s.fill, fo: s.fillOpacity });
  var label = (c, at, text2, s, extra = {}) => ({ k: "text", at, text: text2, size: s.fontSize - 1, color: s.textColor, hit: "none", ...extra });
  function lineThrough(c, a, b, mode2, s) {
    const r = { x: c.plot.x - 5, y: c.plot.y - 5, w: c.plot.w + 10, h: c.plot.h + 10 };
    const seg = clipLine(a, b, r, mode2);
    return seg ? [{ k: "line", a: seg[0], b: seg[1], ...s }] : [];
  }
  var hLine = (c, y, x0, s) => ({ k: "line", a: { x: x0 == null ? c.plot.x : Math.max(c.plot.x, x0), y }, b: { x: c.plot.x + c.plot.w, y }, ...s });
  var lerpPt = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

  // finance (position sizing, time formatting)
  function calcPosition(i) {
    const dir = i.side === "long" ? 1 : -1;
    const riskPerUnit = (i.entry - i.stop) * dir;
    const rewardPerUnit = (i.target - i.entry) * dir;
    const valid = riskPerUnit > 0 && rewardPerUnit > 0;
    const riskAmount = i.account * i.riskPct / 100;
    const lev = i.leverage && i.leverage > 0 ? i.leverage : 1;
    const fee = (i.feePct ?? 0) / 100;
    const qty = riskPerUnit > 0 ? riskAmount / (riskPerUnit + fee * (i.entry + i.stop)) : 0;
    const notional = qty * i.entry;
    const feeIn = notional * fee, feeOutStop = qty * i.stop * fee, feeOutTp = qty * i.target * fee;
    return {
      valid,
      riskPerUnit,
      rewardPerUnit,
      rr: riskPerUnit > 0 ? rewardPerUnit / riskPerUnit : 0,
      riskAmount,
      qty,
      notional,
      margin: notional / lev,
      stopPct: (i.stop - i.entry) / i.entry * 100,
      targetPct: (i.target - i.entry) / i.entry * 100,
      lossAtStop: -(qty * riskPerUnit) - feeIn - feeOutStop,
      profitAtTarget: qty * rewardPerUnit - feeIn - feeOutTp,
      breakevenPct: fee * 2 * 100
    };
  }
  function positionOutcome(side, stop, target, bars) {
    for (const b of bars) {
      const hitSl = side === "long" ? b.low <= stop : b.high >= stop;
      const hitTp = side === "long" ? b.high >= target : b.low <= target;
      if (hitSl) return "sl";
      if (hitTp) return "tp";
    }
    return "open";
  }
  function measure(p1, p2, barSeconds, decimals) {
    const priceDiff = p2.price - p1.price;
    const pct = p1.price !== 0 ? priceDiff / p1.price * 100 : 0;
    const seconds = p2.time - p1.time;
    const bars = barSeconds > 0 ? Math.round(seconds / barSeconds) : 0;
    const sg = priceDiff >= 0 ? "+" : "\u2212";
    return { priceDiff, pct, bars, seconds, text: `${sg}${Math.abs(priceDiff).toFixed(decimals)} (${sg}${Math.abs(pct).toFixed(2)}%)  ${bars} bars, ${fmtDuration(seconds)}` };
  }
  function fmtDuration(sec) {
    let s = Math.abs(Math.round(sec));
    const d2 = Math.floor(s / 86400);
    s -= d2 * 86400;
    const h = Math.floor(s / 3600);
    s -= h * 3600;
    const m = Math.floor(s / 60);
    const parts = [];
    if (d2) parts.push(`${d2}d`);
    if (h) parts.push(`${h}h`);
    if (m || !parts.length) parts.push(`${m}m`);
    return parts.join(" ");
  }
  var FIB_RETRACE = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
  function fibPrice(p1, p2, level, logScale = false) {
    if (logScale && p1 > 0 && p2 > 0) return Math.exp(Math.log(p2) + (Math.log(p1) - Math.log(p2)) * level);
    return p2 + (p1 - p2) * level;
  }
  // TAB "Lines": every line-type tool
  var mode = (d2) => d2.style.extL && d2.style.extR ? "line" : d2.style.extL || d2.style.extR ? "ray" : "segment";
  function trendPrims(c, d2) {
    const p = pts(c, d2);
    if (!p) return [];
    const [a, b] = p, m = mode(d2), s = strokeOf(d2.style);
    const out = m === "ray" && d2.style.extL ? lineThrough(c, b, a, "ray", s) : lineThrough(c, a, b, m, s);
    return out;
  }
  var trendFields = [...LINE_F, F.extL, F.extR, { key: "props.labels", label: "Show label", type: "bool" }];
  var trend = {
    type: "trend",
    label: "Trend line",
    group: "lines",
    icon: "trend",
    points: 2,
    hotkey: "Alt+T",
    fields: trendFields,
    props: { labels: false },
    build(c, d2) {
      const out = trendPrims(c, d2), p = pts(c, d2);
      if (p && d2.props.labels) {
        const m = measure(d2.points[0], d2.points[1], c.barSec, c.dec);
        out.push(label(c, { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 - 10 }, m.text, d2.style, { anchor: "middle" }));
      }
      return out;
    }
  };
  var arrow = {
    type: "arrow",
    label: "Arrow",
    group: "lines",
    icon: "arrow",
    points: 2,
    fields: LINE_F,
    build(c, d2) {
      const p = pts(c, d2);
      if (!p) return [];
      const h = arrowHead(p[0], p[1], 8 + d2.style.width * 2);
      return [
        { k: "line", a: p[0], b: p[1], ...strokeOf(d2.style) },
        { k: "poly", pts: h, closed: true, stroke: d2.style.color, w: 1, fill: d2.style.color, fo: 1, hit: "none" }
      ];
    }
  };
  var priceTxt = (c, d2) => c.price(d2.points[0].price);
  var hline = {
    type: "hline",
    label: "Horizontal line",
    group: "lines",
    icon: "hline",
    points: 1,
    hotkey: "Alt+H",
    fields: [
      ...LINE_F,
      F.textColor,
      { key: "props.text", label: "Label", type: "text" }
    ],
    props: { text: "" },
    build(c, d2) {
      const p = pts(c, d2);
      if (!p) return [];
      const out = [hLine(c, p[0].y, null, strokeOf(d2.style))];
      out.push(label(c, { x: c.plot.x + c.plot.w - 6, y: p[0].y - 9 }, (d2.props.text ? d2.props.text + "  " : "") + priceTxt(c, d2), d2.style, { anchor: "end" }));
      return out;
    }
  };
  var hray = {
    type: "hray",
    label: "Horizontal ray",
    hotkey: "Alt+J",
    group: "lines",
    icon: "hray",
    points: 1,
    fields: [...LINE_F, F.textColor],
    build(c, d2) {
      const p = pts(c, d2);
      if (!p) return [];
      return [
        hLine(c, p[0].y, p[0].x, strokeOf(d2.style)),
        label(c, { x: c.plot.x + c.plot.w - 6, y: p[0].y - 9 }, priceTxt(c, d2), d2.style, { anchor: "end" })
      ];
    }
  };
  var vline = {
    type: "vline",
    label: "Vertical line",
    group: "lines",
    icon: "vline",
    points: 1,
    hotkey: "Alt+V",
    fields: LINE_F,
    build(c, d2) {
      const p = pts(c, d2);
      if (!p) return [];
      return [{ k: "line", a: { x: p[0].x, y: c.plot.y }, b: { x: p[0].x, y: c.plot.y + c.plot.h }, ...strokeOf(d2.style) }];
    }
  };
  function vOffset(a, b, p) {
    if (b.x === a.x) return 0;
    return p.y - (a.y + (b.y - a.y) * (p.x - a.x) / (b.x - a.x));
  }
  var pchannel = {
    type: "pchannel",
    label: "Parallel channel",
    group: "channels",
    icon: "pchannel",
    points: 3,
    fields: [
      ...FILL_F,
      F.extL,
      F.extR,
      { key: "props.median", label: "Median line", type: "bool" }
    ],
    props: { median: true },
    style: { fillOpacity: 0.1 },
    build(c, d2) {
      const p = pts(c, d2);
      if (!p) return [];
      const [a, b, q] = p, off = vOffset(a, b, q);
      const a2 = { x: a.x, y: a.y + off }, b2 = { x: b.x, y: b.y + off };
      const far = 1e4, dx = b.x - a.x || 1e-6, k = (b.y - a.y) / dx;
      const L = d2.style.extL ? a.x - far : a.x, R = d2.style.extR ? b.x + far : b.x;
      const at = (base, x) => ({ x, y: base.y + k * (x - base.x) });
      const A = at(a, L), B = at(a, R), A2 = at(a2, L), B2 = at(a2, R);
      const out = [{ k: "poly", pts: [A, B, B2, A2], closed: true, ...fillOf(d2.style), hit: "fill" }];
      const st = strokeOf(d2.style);
      out.push(...lineThrough(c, A, B, "segment", st), ...lineThrough(c, A2, B2, "segment", st));
      if (d2.props.median) out.push(...lineThrough(c, lerpPt(A, A2, 0.5), lerpPt(B, B2, 0.5), "segment", { ...st, dash: "dashed", w: 1 }));
      return out;
    }
  };
  var LINE_TOOLS = [trend, hline, hray, vline, arrow, pchannel];

  // TOOLS: Fibonacci retracement
  var PALETTE = ["#787b86", "#f23645", "#ff9800", "#4caf50", "#089981", "#00bcd4", "#787b86", "#2962ff", "#9c27b0", "#e91e63", "#f23645", "#ff9800", "#4caf50", "#089981"];
  var mkLevels = (vals) => vals.map((v, i) => ({ v, on: true, color: PALETTE[i % PALETTE.length] }));
  var lv = (d2) => d2.props.levels.filter((l) => l.on);
  var fmtL = (v) => (+v.toFixed(3)).toString();
  var LV_F = { key: "props.levels", label: "Levels", type: "levels" };
  var bgFields = [
    F.color,
    F.width,
    F.dash,
    F.extL,
    F.extR,
    { key: "props.bg", label: "Background", type: "bool" },
    { key: "props.price", label: "Show prices", type: "bool" },
    F.textColor,
    LV_F
  ];
  function bands(c, d2, rows, x0, x1) {
    const out = [];
    const ys = rows.map((r) => c.px({ time: d2.points[0].time, price: r.price })?.y);
    if (ys.some((y) => y == null)) return out;
    let L = x0, R = x1;
    if (d2.style.extL) L = c.plot.x;
    if (d2.style.extR) R = c.plot.x + c.plot.w;
    if (d2.props.bg) for (let i = 0; i < rows.length - 1; i++) {
      const ya = ys[i], yb = ys[i + 1];
      out.push({ k: "rect", r: { x: L, y: Math.min(ya, yb), w: R - L, h: Math.abs(yb - ya) }, fill: rows[i + 1].color, fo: 0.08, hit: "none" });
    }
    rows.forEach((r, i) => {
      out.push({ k: "line", a: { x: L, y: ys[i] }, b: { x: R, y: ys[i] }, stroke: r.color, w: d2.style.width, dash: d2.style.dash });
      out.push(label(c, { x: L + 4, y: ys[i] - 8 }, `${fmtL(r.v)}${d2.props.price ? " (" + c.price(r.price) + ")" : ""}`, d2.style, { color: r.color }));
    });
    return out;
  }
  var fibret = {
    type: "fibret",
    label: "Fib retracement",
    group: "fib",
    icon: "fibret",
    points: 2,
    hotkey: "Alt+F",
    fields: bgFields,
    props: { levels: mkLevels(FIB_RETRACE), bg: true, price: true, reverse: false },
    style: { color: "#787b86", width: 1 },
    build(c, d2) {
      const p = pts(c, d2);
      if (!p) return [];
      const [a, b] = d2.points, rows = lv(d2).map((l) => ({ v: l.v, price: fibPrice(a.price, b.price, d2.props.reverse ? 1 - l.v : l.v), color: l.color }));
      const x0 = Math.min(p[0].x, p[1].x), x1 = Math.max(p[0].x, p[1].x);
      return [...bands(c, d2, rows, x0, x1), { k: "line", a: p[0], b: p[1], stroke: "#787b86", w: 1, dash: "dashed" }];
    }
  };
  var FIB_TOOLS = [fibret];

  // TOOLS: Brush, rectangle
  var rect = {
    type: "rect",
    label: "Rectangle",
    group: "shapes",
    icon: "rect",
    points: 2,
    fields: FILL_F,
    hotkey: "Alt+Shift+R",
    build(c, d2) {
      const p = pts(c, d2);
      if (!p) return [];
      return [{ k: "rect", r: normRect(p[0], p[1]), ...strokeOf(d2.style), ...fillOf(d2.style) }];
    }
  };
  var brush = {
    type: "brush",
    label: "Brush",
    group: "shapes",
    icon: "brush",
    points: "free",
    minPoints: 2,
    fields: LINE_F,
    style: { width: 2 },
    build(c, d2) {
      const p = pts(c, d2);
      if (!p) return [];
      return [{ k: "poly", pts: p, ...strokeOf(d2.style) }];
    }
  };
  var SHAPE_TOOLS = [brush, rect];

  // TOOLS: Text, price label, arrows, flag
  var TXT = [
    { key: "props.text", label: "Text", type: "textarea" },
    F.textColor,
    F.fontSize,
    { key: "props.bold", label: "Bold", type: "bool" }
  ];
  var text = {
    type: "text",
    label: "Text",
    group: "annot",
    icon: "text",
    points: 1,
    editsText: true,
    hotkey: "Alt+X",
    fields: [...TXT, { key: "props.bg", label: "Background", type: "bool" }, F.fill],
    props: { text: "Text", bold: false, bg: false },
    build(c, d2) {
      const p = pts(c, d2);
      if (!p) return [];
      return [label(c, p[0], d2.props.text || " ", { ...d2.style, fontSize: d2.style.fontSize + 1 }, { hit: "both", bold: d2.props.bold, bg: d2.props.bg ? d2.style.fill : void 0, vAlign: "middle" })];
    }
  };
  var pricelabel = {
    type: "pricelabel",
    label: "Price label",
    group: "annot",
    icon: "pricelabel",
    points: 1,
    fields: [F.color, F.textColor, F.fontSize],
    style: { color: "#2962ff", textColor: "#ffffff" },
    build(c, d2) {
      const p = pts(c, d2);
      if (!p) return [];
      return [
        { k: "poly", pts: [p[0], { x: p[0].x + 8, y: p[0].y - 8 }, { x: p[0].x + 8, y: p[0].y + 8 }], closed: true, fill: d2.style.color, fo: 1, stroke: d2.style.color, w: 1, hit: "both" },
        label(c, { x: p[0].x + 8, y: p[0].y }, c.price(d2.points[0].price), d2.style, { bg: d2.style.color, hit: "both", bold: true })
      ];
    }
  };
  var flag = {
    type: "flag",
    label: "Flag mark",
    group: "annot",
    icon: "flag",
    points: 1,
    fields: [F.color, { key: "props.text", label: "Text", type: "text" }, F.textColor],
    props: { text: "" },
    style: { color: "#f7a600" },
    build(c, d2) {
      const p = pts(c, d2);
      if (!p) return [];
      const { x, y } = p[0];
      const out = [
        { k: "line", a: { x, y }, b: { x, y: y - 26 }, stroke: d2.style.color, w: 2 },
        { k: "poly", pts: [{ x, y: y - 26 }, { x: x + 18, y: y - 21 }, { x, y: y - 14 }], closed: true, fill: d2.style.color, fo: 1, stroke: d2.style.color, w: 1, hit: "both" }
      ];
      if (d2.props.text) out.push(label(c, { x: x + 22, y: y - 20 }, d2.props.text, d2.style));
      return out;
    }
  };
  var arrowMark = (type, up) => ({
    type,
    label: up ? "Arrow marker up" : "Arrow marker down",
    group: "annot",
    icon: up ? "arrowup" : "arrowdown",
    points: 1,
    fields: [F.color, { key: "props.text", label: "Text", type: "text" }, F.textColor],
    props: { text: "" },
    style: { color: up ? "#089981" : "#f23645", fillOpacity: 1 },
    build(c, d2) {
      const p = pts(c, d2);
      if (!p) return [];
      const { x, y } = p[0], s = up ? 1 : -1, h = 26;
      const out = [{
        k: "poly",
        closed: true,
        fill: d2.style.color,
        fo: 1,
        stroke: d2.style.color,
        w: 1,
        hit: "both",
        pts: [{ x, y: y + 2 * s * 0 }, { x: x + 9, y: y + s * 11 }, { x: x + 3.5, y: y + s * 11 }, { x: x + 3.5, y: y + s * h }, { x: x - 3.5, y: y + s * h }, { x: x - 3.5, y: y + s * 11 }, { x: x - 9, y: y + s * 11 }]
      }];
      if (d2.props.text) out.push(label(c, { x, y: y + s * (h + 10) }, d2.props.text, d2.style, { anchor: "middle" }));
      return out;
    }
  });
  var arrowup = arrowMark("arrowup", true);
  var arrowdown = arrowMark("arrowdown", false);
  var ANNOT_TOOLS = [text, pricelabel, arrowup, arrowdown, flag];

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
      { key: "points.0.price", label: "Entry price", type: "number", step: "any", get: (d2, m) => fmtPrice(d2.points[0].price, m.decimals()), set: (d2, v, m) => {
        const dir = side === "long" ? 1 : -1, tick = tickOf(m), P = d2.points;
        const lo = (dir > 0 ? P[2].price : P[1].price) + tick, hi = (dir > 0 ? P[1].price : P[2].price) - tick;
        P[0].price = Math.min(Math.max(v, lo), Math.max(lo, hi));
        P[3].price = P[0].price;
      } },
      { key: "points.2.price", label: "Stop loss", type: "number", step: "any", get: (d2, m) => fmtPrice(d2.points[2].price, m.decimals()), set: (d2, v, m) => {
        const dir = side === "long" ? 1 : -1, lim = d2.points[0].price - dir * tickOf(m);
        d2.points[2].price = dir > 0 ? Math.min(v, lim) : Math.max(v, lim);
      } },
      { key: "points.1.price", label: "Take profit", type: "number", step: "any", get: (d2, m) => fmtPrice(d2.points[1].price, m.decimals()), set: (d2, v, m) => {
        const dir = side === "long" ? 1 : -1, lim = d2.points[0].price + dir * tickOf(m);
        d2.points[1].price = dir > 0 ? Math.max(v, lim) : Math.min(v, lim);
      } },
      { key: "points.rr", label: "Risk/Reward ratio", type: "number", min: 0.01, step: "any", get: (d2) => {
        const k = Math.abs(d2.points[0].price - d2.points[2].price);
        return k > 0 ? +(Math.abs(d2.points[1].price - d2.points[0].price) / k).toFixed(2) : 0;
      }, set: (d2, v) => {
        const k = Math.abs(d2.points[0].price - d2.points[2].price);
        if (k > 0) d2.points[1].price = clean(d2.points[0].price + (side === "long" ? 1 : -1) * k * Math.max(0.01, v));
      } },
      { key: "props.profitColor", label: "Profit color", type: "color", get: (d2) => d2.props.profitColor || GREEN },
      { key: "props.stopColor", label: "Stop color", type: "color", get: (d2) => d2.props.stopColor || RED }
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

  // TOOLS: Measure
  var UP = "#2962ff";
  var DN = "#f23645";
  var colorOf = (up) => up ? UP : DN;
  var mfields = [F.textColor, F.fontSize, { key: "props.up", label: "Up color", type: "color" }, { key: "props.dn", label: "Down color", type: "color" }];
  var cols = (d2, up) => (up ? d2.props.up : d2.props.dn) || colorOf(up);
  var fmtVol = (v) => v >= 1e9 ? (v / 1e9).toFixed(2) + "B" : v >= 1e6 ? (v / 1e6).toFixed(2) + "M" : v >= 1e3 ? (v / 1e3).toFixed(2) + "K" : v.toFixed(0);
  var measureTool = {
    type: "measure",
    label: "Measure (price, % and time)",
    group: "measure",
    icon: "measure",
    points: 2,
    hotkey: "Alt+M",
    fields: mfields,
    props: { up: UP, dn: DN },
    build(c, d2) {
      const p = pts(c, d2);
      if (!p) return [];
      const m = measure(d2.points[0], d2.points[1], c.barSec, c.dec), col = cols(d2, m.priceDiff >= 0), r = normRect(p[0], p[1]);
      const mx = (p[0].x + p[1].x) / 2, my = (p[0].y + p[1].y) / 2, h = arrowHead({ x: mx, y: p[0].y }, { x: mx, y: p[1].y }, 8), hx = arrowHead({ x: p[0].x, y: my }, { x: p[1].x, y: my }, 8);
      const sg = m.priceDiff >= 0 ? "+" : "\u2212", t0 = Math.min(d2.points[0].time, d2.points[1].time), t1 = Math.max(d2.points[0].time, d2.points[1].time);
      let vol = 0;
      for (const b of c.bars) { if (b.time > t1) break; if (b.time >= t0) vol += b.v || 0; }
      const txt = `${sg}${Math.abs(m.priceDiff).toFixed(c.dec)} (${sg}${Math.abs(m.pct).toFixed(2)}%)\n${m.bars} bars, ${fmtDuration(m.seconds)}` + (vol ? `\nVol ${fmtVol(vol)}` : "");
      return [
        { k: "rect", r, fill: col, fo: 0.2, stroke: col, w: 1 },
        { k: "line", a: { x: mx, y: p[0].y }, b: { x: mx, y: p[1].y }, stroke: col, w: 1, hit: "none" },
        { k: "line", a: { x: p[0].x, y: my }, b: { x: p[1].x, y: my }, stroke: col, w: 1, hit: "none" },
        { k: "poly", pts: h, closed: true, fill: col, fo: 1, stroke: col, w: 1, hit: "none" },
        { k: "poly", pts: hx, closed: true, fill: col, fo: 1, stroke: col, w: 1, hit: "none" },
        label(c, { x: mx, y: p[1].y + (p[1].y <= p[0].y ? -8 : 8) }, txt, d2.style, { anchor: "middle", bg: col, color: "#fff", vAlign: p[1].y <= p[0].y ? "bottom" : "top" })
      ];
    }
  };
  var MEASURE_TOOLS = [measureTool];

  // Fixed Range Volume Profile. OHLCV bars are distributed across their traded
  // range (uniformly by price); this is an approximation when intrabar data is unavailable.
  // bars/price extent covered by the two time anchors (price anchors are ignored, as in TradingView)
  function vpRange(c, d2) {
    if (!d2.points || d2.points.length < 2 || !c.bars?.length) return null;
    const t0 = Math.min(d2.points[0].time, d2.points[1].time), t1 = Math.max(d2.points[0].time, d2.points[1].time);
    const selected = c.bars.filter((bar) => bar.time >= t0 && bar.time <= t1 && Number.isFinite(bar.high) && Number.isFinite(bar.low) && (bar.v || bar.volume || 0) > 0);
    if (!selected.length) return null;
    const lo = Math.min(...selected.map((x) => x.low)), hi = Math.max(...selected.map((x) => x.high));
    return hi > lo ? { t0, t1, lo, hi, selected } : null;
  }
  var volumeProfile = {
    type: "volumeprofile",
    label: "Fixed Range Volume Profile",
    group: "measure",
    icon: "volumeprofile",
    points: 2,
    hotkey: "Ctrl+Alt+Shift+P",
    fields: [
      F.color,
      { key: "props.rows", label: "Rows", type: "number", min: 12, max: 120, step: 4 },
      { key: "props.valueArea", label: "Value area (%)", type: "number", min: 50, max: 90, step: 1 },
      { key: "props.width", label: "Width (% of the box)", type: "number", min: 1, max: 100, step: 1 },
      { key: "props.showPoc", label: "Show POC", type: "bool" },
      { key: "props.showValueArea", label: "Show value area", type: "bool" }
    ],
    props: { rows: 24, valueArea: 70, width: 30, showPoc: true, showValueArea: true },
    style: { color: "#2962ff", fillOpacity: 0.62 },
    handles(c, d2) {
      const r = vpRange(c, d2);
      if (!r) return d2.points.map((a) => c.px(a));
      const y = c.m.priceToY((r.lo + r.hi) / 2);
      return y == null ? [null, null] : d2.points.map((a) => { const x = c.m.timeToX(a.time); return x == null ? null : { x, y }; });
    },
    // handles slide along time only, like TradingView
    dragHandle(d2, idx, a) { d2.points[idx] = { time: a.time, price: d2.points[idx].price }; },
    build(c, d2) {
      const r = vpRange(c, d2);
      if (!r) return [];
      const { t0, t1, lo, hi, selected } = r;
      const rows = Math.max(12, Math.min(120, Math.round(Number(d2.props?.rows) || 24)));
      const step = (hi - lo) / rows, bins = Array(rows).fill(0), up = Array(rows).fill(0), down = Array(rows).fill(0);
      for (const bar of selected) {
        const vol = Number(bar.v ?? bar.volume) || 0, low = Math.max(lo, bar.low), high = Math.min(hi, bar.high);
        if (high <= low) { const i = Math.max(0, Math.min(rows - 1, Math.floor(((bar.close ?? low) - lo) / step))); bins[i] += vol; (bar.close >= bar.open ? up : down)[i] += vol; continue; }
        const first = Math.max(0, Math.floor((low - lo) / step)), last = Math.min(rows - 1, Math.floor((high - lo - Number.EPSILON) / step));
        const per = vol / Math.max(1, last - first + 1);
        for (let i = first; i <= last; i++) { bins[i] += per; (bar.close >= bar.open ? up : down)[i] += per; }
      }
      const total = bins.reduce((s, v) => s + v, 0), max = Math.max(...bins);
      if (!(total > 0) || !(max > 0)) return [];
      const xa = c.m.timeToX(t0), xb = c.m.timeToX(t1);
      if (xa == null || xb == null) return [];
      const left = Math.min(xa, xb), right = Math.max(xa, xb);
      const widthPct = Math.max(1, Math.min(100, Number(d2.props?.width) || 30)), profileW = (right - left) * widthPct / 100, out = [];
      const yTop = c.m.priceToY(hi), yBot = c.m.priceToY(lo);
      // value area
      const poc = bins.indexOf(max), pocPrice = lo + (poc + 0.5) * step;
      const target = total * Math.max(0.5, Math.min(0.9, (Number(d2.props?.valueArea) || 70) / 100));
      let lowI = poc, highI = poc, acc = bins[poc];
      while (acc < target && (lowI > 0 || highI < rows - 1)) {
        const lv = lowI > 0 ? bins[lowI - 1] : -1, hv = highI < rows - 1 ? bins[highI + 1] : -1;
        if (hv >= lv && highI < rows - 1) acc += bins[++highI]; else if (lowI > 0) acc += bins[--lowI]; else break;
      }
      const useVA = d2.props?.showValueArea !== false, fo = d2.style.fillOpacity ?? 0.62;
      // range boundaries: always while drawing, and while selected (TradingView hides them afterwards)
      if ((d2.draft || c.selected) && yTop != null && yBot != null) {
        const edge = { stroke: d2.style.color, w: 1, dash: "dashed", hit: "none" };
        out.push({ k: "line", a: { x: xa, y: yTop }, b: { x: xa, y: yBot }, ...edge }, { k: "line", a: { x: xb, y: yTop }, b: { x: xb, y: yBot }, ...edge });
        if (d2.draft) { const e = { ...edge, dash: "solid", w: 1.5 }; out.push({ k: "line", a: { x: xa, y: c.plot.y }, b: { x: xa, y: c.plot.y + c.plot.h }, ...e }); }
      }
      for (let i = 0; i < rows; i++) {
        const yHi = c.m.priceToY(lo + (i + 1) * step), yLo = c.m.priceToY(lo + i * step);
        if (yHi == null || yLo == null) continue;
        const y = Math.min(yHi, yLo), h = Math.max(1, Math.abs(yLo - yHi) - 0.4), w = profileW * bins[i] / max;
        if (!(w > 0)) continue;
        const f = useVA && (i < lowI || i > highI) ? fo * 0.5 : fo, upW = w * up[i] / (bins[i] || 1);
        out.push({ k: "rect", r: { x: left, y, w: upW, h }, fill: "#26a69a", fo: f, stroke: "none", hit: "fill" });
        if (w - upW > 0.1) out.push({ k: "rect", r: { x: left + upW, y, w: w - upW, h }, fill: "#ef5350", fo: f, stroke: "none", hit: "fill" });
      }
      const line = (price, color, dash) => { const y = c.m.priceToY(price); return y == null ? null : { k: "line", a: { x: left, y }, b: { x: right, y }, stroke: color, w: 1.5, dash, hit: "stroke" }; };
      const tag = (p, text, color) => label(c, { x: right - 5, y: p.a.y - 8 }, text, d2.style, { anchor: "end", color });
      if (d2.props?.showPoc !== false) { const p = line(pocPrice, "#ff9800", "solid"); if (p) out.push(p, tag(p, "POC " + c.price(pocPrice), "#ff9800")); }
      if (useVA) for (const [price, name] of [[lo + lowI * step, "VAL"], [lo + (highI + 1) * step, "VAH"]]) { const p = line(price, "#8c9eff", "dashed"); if (p) out.push(p, tag(p, name + " " + c.price(price), "#8c9eff")); }
      out.push(label(c, { x: left, y: c.plot.y + 12 }, "Fixed Range Volume Profile · " + fmtVol(bins.reduce((a, b) => a + b, 0)), d2.style, { color: d2.style.textColor }));
      return out;
    }
  };
  var VOLUME_PROFILE_TOOLS = [volumeProfile];

  // tool registry: exactly two toolbar tabs.
  //   "Lines"  = line tools plus Rectangle
  //   "Tools"  = positions first, followed by the remaining tools
  var TABS = [
    { group: { id: "lines", label: "Lines", icon: "hline" }, tools: [LINE_TOOLS.find((x) => x.type === "hline"), ...LINE_TOOLS.filter((x) => x.type !== "hline"), rect] },
    { group: { id: "other", label: "Tools", icon: "fibret" }, tools: [...POSITION_TOOLS, ...FIB_TOOLS, ...SHAPE_TOOLS.filter((x) => x.type !== "rect"), ...ANNOT_TOOLS, ...MEASURE_TOOLS, ...VOLUME_PROFILE_TOOLS] }
  ];
  var TOOLS = TABS.flatMap((t) => t.tools.map((x) => (x.group = t.group.id, x)));
  var TOOL_MAP = Object.fromEntries(TOOLS.map((t) => [t.type, t]));
  var GROUPS = TABS.map((t) => t.group);

  // store
  var VERSION = 1;
  var seq = 0;
  var newId = () => "d" + Date.now().toString(36) + (seq++).toString(36) + Math.random().toString(36).slice(2, 5);
  var clone = (x) => JSON.parse(JSON.stringify(x));
  function makeDrawing(type, points, defaults) {
    const t = TOOL_MAP[type];
    return {
      id: newId(),
      type,
      points: clone(points),
      style: { ...DEFAULT_STYLE, ...t?.style ?? {}, ...defaults?.style ?? {} },
      props: clone({ ...t?.props ?? {}, ...defaults?.props ?? {} }),
      locked: false,
      hidden: false,
      z: 0
    };
  }
  function validDrawing(x) {
    return x && typeof x.id === "string" && TOOL_MAP[x.type] && Array.isArray(x.points) && x.style && x.props && x.points.every((p) => p && Number.isFinite(p.time) && Number.isFinite(p.price));
  }
  var DrawingStore = class {
    constructor(storage, limit = 100) {
      this.storage = storage;
      this.limit = limit;
      this.items = [];
      this.rev = 0;
      this.undo = [];
      this.redo = [];
      this.pending = null;
      this.listeners = /* @__PURE__ */ new Set();
      this.symbol = "";
      this.clipboard = [];
    }
    on(fn) {
      this.listeners.add(fn);
      return () => this.listeners.delete(fn);
    }
    emit() {
      this.rev++;
      this.listeners.forEach((f) => f());
    }
    key(s) {
      return `dr:v${VERSION}:${s}`;
    }
    snap() {
      return JSON.stringify(this.items);
    }
    load(symbol) {
      this.symbol = symbol;
      this.undo = [];
      this.redo = [];
      this.pending = null;
      const raw = this.storage.get(this.key(symbol), []);
      this.items = Array.isArray(raw) ? raw.filter(validDrawing) : [];
      this.emit();
    }
    save() {
      if (this.symbol) this.storage.set(this.key(this.symbol), this.items);
    }
    /** Per-tool remembered style (TradingView-like "default settings"). */
    toolDefaults(type) {
      const raw = this.storage.get(`dr:def:${type}`, null);
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
      const props = raw.props && typeof raw.props === "object" ? { ...raw.props } : {};
      delete props.text; /* the text of one drawing is content, not a setting */
      return { style: raw.style && typeof raw.style === "object" ? raw.style : {}, props };
    }
    /** Remember a drawing's look as the default for every future drawing of the same tool (saved on every change). */
    saveToolDefaults(d2) {
      if (!d2 || !TOOL_MAP[d2.type]) return;
      const props = clone(d2.props || {});
      delete props.text;
      this.storage.set(`dr:def:${d2.type}`, { style: clone(d2.style || {}), props });
    }
    /** Reset one tool: forget its remembered settings and restore this drawing to the tool's original defaults
        (geometry, text and lock state are kept). */
    resetTool(d2) {
      this.storage.set(`dr:def:${d2.type}`, null);
      const fresh = makeDrawing(d2.type, d2.points);
      d2.style = fresh.style;
      d2.props = { ...fresh.props, ...(d2.props && "text" in d2.props ? { text: d2.props.text } : {}) };
      this.touch();
    }
    get(id) {
      return this.items.find((d2) => d2.id === id);
    }
    /** Run a mutation as one undo step (no-op if nothing changed). */
    mutate(fn) {
      const before = this.snap();
      fn();
      this.finish(before);
    }
    begin() {
      if (this.pending == null) this.pending = this.snap();
    }
    /** live change during a drag: repaint + persist, but no history entry until end() */
    touch() {
      this.save();
      this.emit();
    }
    end() {
      const b = this.pending;
      this.pending = null;
      if (b != null) this.finish(b);
    }
    finish(before) {
      const after = this.snap();
      if (after !== before) {
        this.undo.push(before);
        if (this.undo.length > this.limit) this.undo.shift();
        this.redo = [];
      }
      this.save();
      this.emit();
    }
    add(d2) {
      this.mutate(() => {
        d2.z = this.items.reduce((m, x) => Math.max(m, x.z), 0) + 1;
        this.items.push(d2);
      });
      return d2;
    }
    remove(ids) {
      this.mutate(() => {
        this.items = this.items.filter((d2) => !ids.includes(d2.id));
      });
    }
    /** remove every drawing, or only those matching `pred` */
    clear(pred) {
      this.mutate(() => {
        this.items = pred ? this.items.filter((d2) => !pred(d2)) : [];
      });
    }
    update(id, fn) {
      this.mutate(() => {
        const d2 = this.get(id);
        if (d2) fn(d2);
      });
    }
    duplicate(ids, dt, dp) {
      const out = [];
      this.mutate(() => {
        for (const id of ids) {
          const s = this.get(id);
          if (!s) continue;
          const c = clone(s);
          c.id = newId();
          c.locked = false;
          c.points = c.points.map((p) => ({ time: p.time + dt, price: p.price + dp }));
          c.z = this.items.reduce((m, x) => Math.max(m, x.z), 0) + 1;
          this.items.push(c);
          out.push(c);
        }
      });
      return out;
    }
    copy(ids) {
      this.clipboard = ids.map((i) => this.get(i)).filter(Boolean).map((d2) => clone(d2));
      return this.clipboard.length;
    }
    paste(dt, dp) {
      const out = [];
      this.mutate(() => {
        for (const s of this.clipboard) {
          const c = clone(s);
          c.id = newId();
          c.locked = false;
          c.points = c.points.map((p) => ({ time: p.time + dt, price: p.price + dp }));
          c.z = this.items.reduce((m, x) => Math.max(m, x.z), 0) + 1;
          this.items.push(c);
          out.push(c);
        }
      });
      return out;
    }
    bringToFront(id) {
      this.mutate(() => {
        const d2 = this.get(id);
        if (d2) d2.z = this.items.reduce((m, x) => Math.max(m, x.z), 0) + 1;
      });
    }
    sendToBack(id) {
      this.mutate(() => {
        const d2 = this.get(id);
        if (d2) d2.z = this.items.reduce((m, x) => Math.min(m, x.z), 0) - 1;
      });
    }
    /** set a property on every drawing, or only on those matching `pred` */
    setAll(prop, v, pred) {
      this.mutate(() => {
        this.items.forEach((d2) => {
          if (!pred || pred(d2)) d2[prop] = v;
        });
      });
    }
    canUndo() {
      return this.undo.length > 0;
    }
    canRedo() {
      return this.redo.length > 0;
    }
    doUndo() {
      const s = this.undo.pop();
      if (s == null) return false;
      this.redo.push(this.snap());
      this.items = JSON.parse(s);
      this.save();
      this.emit();
      return true;
    }
    doRedo() {
      const s = this.redo.pop();
      if (s == null) return false;
      this.undo.push(this.snap());
      this.items = JSON.parse(s);
      this.save();
      this.emit();
      return true;
    }
    sorted() {
      return [...this.items].sort((a, b) => a.z - b.z);
    }
  };

  // coords
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

  // prims
  var esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  var num = (n) => Number.isFinite(n) ? +n.toFixed(2) : 0;
  var textWidth = (t, size, bold) => t.length * size * (bold ? 0.62 : 0.57);
  var DASH = { solid: "", dashed: "8 5", dotted: "2 4" };
  function strokeAttrs(p) {
    if (!p.stroke) return ' stroke="none"';
    const d2 = DASH[p.dash || "solid"];
    return ` stroke="${p.stroke}" stroke-width="${p.w ?? 1}"${d2 ? ` stroke-dasharray="${d2}"` : ""} stroke-linejoin="round" stroke-linecap="round"`;
  }
  function fillAttrs(p) {
    return p.fill ? ` fill="${p.fill}" fill-opacity="${p.fo ?? 0.15}"` : ' fill="none"';
  }
  function textBox(p) {
    const size = p.size ?? 12, lines = p.text.split("\n"), pad = 4;
    const w2 = Math.max(...lines.map((l) => textWidth(l, size, p.bold))) + pad * 2, h = lines.length * (size + 3) + pad * 2 - 3;
    const anchor = p.anchor ?? "start", v = p.vAlign ?? "middle";
    const x = anchor === "start" ? p.at.x - pad : anchor === "end" ? p.at.x - w2 + pad : p.at.x - w2 / 2;
    const y = v === "top" ? p.at.y - pad : v === "bottom" ? p.at.y - h + pad : p.at.y - h / 2;
    return { x, y, w: w2, h, size, lines, pad };
  }
  function primToSvg(p) {
    const o = p.op != null ? ` opacity="${p.op}"` : "";
    switch (p.k) {
      case "line":
        return `<line x1="${num(p.a.x)}" y1="${num(p.a.y)}" x2="${num(p.b.x)}" y2="${num(p.b.y)}"${strokeAttrs(p)}${o}/>`;
      case "poly":
        return `<${p.closed ? "polygon" : "polyline"} points="${p.pts.map((q) => num(q.x) + "," + num(q.y)).join(" ")}"${strokeAttrs(p)}${fillAttrs(p)}${o}/>`;
      case "rect":
        return `<rect x="${num(p.r.x)}" y="${num(p.r.y)}" width="${num(p.r.w)}" height="${num(p.r.h)}"${strokeAttrs(p)}${fillAttrs(p)}${o}/>`;
      case "ell":
        return `<ellipse cx="${num(p.c.x)}" cy="${num(p.c.y)}" rx="${num(Math.abs(p.rx))}" ry="${num(Math.abs(p.ry))}"${p.rot ? ` transform="rotate(${num(p.rot)} ${num(p.c.x)} ${num(p.c.y)})"` : ""}${strokeAttrs(p)}${fillAttrs(p)}${o}/>`;
      case "path":
        return `<path d="${p.d}"${strokeAttrs(p)}${fillAttrs(p)}${o}/>`;
      case "text": {
        const b = textBox(p);
        let s = "";
        if (p.bg) s += `<rect x="${num(b.x)}" y="${num(b.y)}" width="${num(b.w)}" height="${num(b.h)}" rx="3" fill="${p.bg}"${p.stroke ? ` stroke="${p.stroke}" stroke-width="${p.w ?? 1}"` : ""}${o}/>`;
        const tx = (p.anchor ?? "start") === "start" ? b.x + b.pad : p.anchor === "end" ? b.x + b.w - b.pad : b.x + b.w / 2;
        s += `<text x="${num(tx)}" text-anchor="${p.anchor ?? "start"}" fill="${p.color ?? "#d1d4dc"}" font-size="${b.size}"${p.bold ? ' font-weight="700"' : ""}${o}>` + b.lines.map((l, i) => `<tspan x="${num(tx)}" y="${num(b.y + b.pad + b.size * 0.85 + i * (b.size + 3))}">${esc(l)}</tspan>`).join("") + "</text>";
        return s;
      }
    }
  }
  function hitPrim(p, q, tol) {
    const mode2 = p.hit ?? (p.fill ? "both" : "stroke");
    if (mode2 === "none") return false;
    const stroke = mode2 === "stroke" || mode2 === "both", fill = mode2 === "fill" || mode2 === "both";
    switch (p.k) {
      case "line":
        return stroke && distToSegment(q, p.a, p.b) <= tol;
      case "poly": {
        if (stroke && distToPolyline(q, p.pts, !!p.closed) <= tol) return true;
        return fill && p.pts.length > 2 && pointInPolygon(q, p.pts);
      }
      case "path": {
        if (stroke && distToPolyline(q, p.pts, false) <= tol) return true;
        return fill && p.pts.length > 2 && pointInPolygon(q, p.pts);
      }
      case "rect": {
        const { x, y, w: w2, h } = p.r;
        const inside = q.x >= x && q.x <= x + w2 && q.y >= y && q.y <= y + h;
        if (fill && inside) return true;
        if (!stroke) return false;
        const near = q.x >= x - tol && q.x <= x + w2 + tol && q.y >= y - tol && q.y <= y + h + tol;
        return near && (Math.min(Math.abs(q.x - x), Math.abs(q.x - x - w2)) <= tol || Math.min(Math.abs(q.y - y), Math.abs(q.y - y - h)) <= tol);
      }
      case "ell": {
        const c = Math.cos(-(p.rot || 0) * Math.PI / 180), s = Math.sin(-(p.rot || 0) * Math.PI / 180);
        const dx = q.x - p.c.x, dy = q.y - p.c.y, lx = dx * c - dy * s, ly = dx * s + dy * c;
        const rx = Math.max(Math.abs(p.rx), 0.5), ry = Math.max(Math.abs(p.ry), 0.5);
        const n = Math.hypot(lx / rx, ly / ry);
        if (fill && n <= 1) return true;
        return stroke && Math.abs(n - 1) * Math.min(rx, ry) <= tol;
      }
      case "text": {
        const b = textBox(p);
        return q.x >= b.x && q.x <= b.x + b.w && q.y >= b.y && q.y <= b.y + b.h && (p.hit !== void 0 || !!p.bg);
      }
    }
  }

  // controller
  var HIT_TOL = 6;
  var HANDLE_R = 8;
  var HANDLE_TOUCH_R = 30;
  var COARSE = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  var Controller = class {
    constructor(host, m, store, hooks = {}) {
      this.host = host;
      this.m = m;
      this.store = store;
      this.hooks = hooks;
      this.tool = null;
      this.mode = "cursor";
      this.stay = false;
      this.selection = /* @__PURE__ */ new Set();
      this.draft = null;
      this.sig = "";
      this.lastRev = -1;
      this.dirty = true;
      this.gesture = null;
      this.swallow = false;
      this.raf = 0;
      this.lastPointer = null;
      this.hold = null; /* Ctrl-held temporary Brush: { tool, mode } to restore on release */
      this.holdPending = false;
      this.draftDirty = false;
      this.lastDrawingTap = null;
      this.qm = null;
      this.qmDirty = false;
      this.onCompat = (e) => {
        if (this.swallow) {
          e.stopPropagation();
        }
      };
      this.onDown = (e) => {
        this.swallow = false;
        if (e.button !== 0 || this.ignoreTarget(e)) return;
        const p = this.local(e);
        this.lastPointer = p;
        if (!this.inPlot(p)) return;
        // Mobile browsers do not consistently dispatch dblclick; recognize a quick second tap on the same drawing.
        if (e.pointerType === "touch" && this.mode === "cursor" && !this.tool && !this.draft) {
          const now = Date.now(), d2 = this.hitTest(p), last = this.lastDrawingTap;
          if (d2 && last && last.id === d2.id && now - last.time <= 380 && Math.hypot(p.x - last.x, p.y - last.y) <= 26) {
            this.lastDrawingTap = null;
            this.select([d2.id]);
            if (TOOL_MAP[d2.type].editsText) this.hooks.editText?.(d2);
            else this.hooks.openSettings?.(d2);
            this.swallow = true;
            e.stopPropagation();
            e.preventDefault();
            return;
          }
          this.lastDrawingTap = d2 ? { id: d2.id, time: now, x: p.x, y: p.y } : null;
        }
        if (this.qm?.waiting) {
          this.qmSecond(p, e);
          this.swallow = true;
          e.stopPropagation();
          e.preventDefault();
          return;
        }
        if (this.qm) this.clearQM();
        if (this.mode === "cursor" && (this.tool === "measure" || !this.tool && e.shiftKey)) {
          if (this.startQM(p, e)) {
            this.swallow = true;
            e.stopPropagation();
            e.preventDefault();
            window.addEventListener("pointermove", this.onMove);
            window.addEventListener("pointerup", this.onUp);
            window.addEventListener("pointercancel", this.onUp);
          }
          return;
        }
        let handled = false;
        if (this.mode === "eraser") {
          handled = this.startErase(p);
        } else if (this.tool) {
          this.drawDown(p, e);
          handled = true;
        } else handled = this.selectDown(p, e);
        if (handled) {
          this.swallow = true;
          e.stopPropagation();
          e.preventDefault();
          window.addEventListener("pointermove", this.onMove);
          window.addEventListener("pointerup", this.onUp);
          window.addEventListener("pointercancel", this.onUp);
        }
      };
      this.onHover = (e) => {
        if (this.ignoreTarget(e)) return;
        const p = this.local(e);
        this.lastPointer = p;
        if (this.qm?.waiting) {
          this.qmTo(p, e);
          return;
        }
        if (this.gesture) return;
        if (this.draft) {
          this.updatePreview(p, e);
          return;
        }
        if (this.tool || this.mode === "eraser") return;
        if (!this.inPlot(p)) {
          this.setHoverCursor("");
          return;
        }
        const hd = this.handleAt(p);
        if (hd) {
          this.setHoverCursor("dr-handle");
          return;
        }
        this.setHoverCursor(this.hitTest(p) ? "dr-move" : "");
      };
      // Do not reuse a stale chart coordinate when the pointer has left the drawing surface.
      this.onLeave = () => { this.lastPointer = null; };
      this.hoverClass = "";
      this.onMove = (e) => {
        const p = this.local(e);
        this.lastPointer = p;
        const g = this.gesture;
        if (g?.k === "move") {
          const dx = p.x - g.start.x, dy = p.y - g.start.y;
          if (!g.moved && Math.hypot(dx, dy) < 3) return;
          g.moved = true;
          const t0 = this.m.xToTime(g.start.x), t1 = this.m.xToTime(p.x), p0 = this.m.yToPrice(g.start.y), p1 = this.m.yToPrice(p.y);
          if (t0 == null || t1 == null || p0 == null || p1 == null) return;
          const dt = t1 - t0;
          let dp = p1 - p0;
          /* Never push a price to zero / negative (breaks the logarithmic scale and the risk maths). */
          let minP = Infinity;
          for (const [, pts2] of g.orig) for (const q of pts2) minP = Math.min(minP, q.price);
          if (minP > 0 && minP + dp <= 0) dp = -minP * 0.999;
          for (const [id, pts2] of g.orig) {
            const d2 = this.store.get(id);
            if (d2) d2.points = pts2.map((a) => ({ time: a.time + dt, price: a.price + dp }));
          }
          this.store.touch();
        } else if (g?.k === "handle") {
          const d2 = this.store.get(g.id);
          if (!d2) return;
          const t = TOOL_MAP[d2.type];
          const prev = d2.points[g.idx > 0 ? g.idx - 1 : 0];
          const from = this.ctx().px(prev) ?? void 0;
          const pp = g.off ? { x: p.x + g.off.x, y: p.y + g.off.y } : p;
          let a = this.anchorAt(pp, e, d2.points.length > 1 && !t.dragHandle ? from : void 0, d2.points.length > 1 && !t.dragHandle ? prev : void 0);
          if (!a) return;
          if (t.dragHandle) {
            t.dragHandle(d2, g.idx, a, this.m);
            g.moved = true;
            this.store.touch();
            return;
          }
          if (t.constrain) a = t.constrain(d2, g.idx, a);
          d2.points[g.idx] = a;
          g.moved = true;
          this.store.touch();
        } else if (g?.k === "erase") {
          const d2 = this.hitTest(p);
          if (d2) {
            this.store.remove([d2.id]);
          }
        } else if (g?.k === "draw") this.drawMove(p, e);
        else if (g?.k === "qm") this.qmTo(p, e);
      };
      this.onUp = (e) => {
        window.removeEventListener("pointermove", this.onMove);
        window.removeEventListener("pointerup", this.onUp);
        window.removeEventListener("pointercancel", this.onUp);
        const g = this.gesture;
        this.gesture = null;
        if (g?.k === "move" || g?.k === "handle") {
          this.store.end();
        } else if (g?.k === "draw") this.drawUp(this.local(e), e);
        else if (g?.k === "qm") this.qmUp(this.local(e), e);
        else if (g?.k === "erase") {
          this.store.end();
        }
        if (this.holdPending) {
          this.holdPending = false;
          this.endHoldBrush();
        }
      };
      this.onDbl = (e) => {
        if (this.ignoreTarget(e)) return;
        const p = this.local(e);
        if (this.draft && TOOL_MAP[this.draft.d.type].points === "multi") {
          const pts2 = this.draft.d.points;
          if (pts2.length > 1) pts2.pop();
          e.stopPropagation();
          e.preventDefault();
          this.finishDraft();
          return;
        }
        if (this.tool || this.mode === "eraser" || !this.inPlot(p)) return;
        const d2 = this.hitTest(p);
        if (d2) {
          e.stopPropagation();
          e.preventDefault();
          this.select([d2.id]);
          if (TOOL_MAP[d2.type].editsText) this.hooks.editText?.(d2);
          else this.hooks.openSettings?.(d2);
        }
      };
      this.onCtx = (e) => {
        if (this.ignoreTarget(e)) return;
        const p = this.local(e);
        if (!this.inPlot(p) || this.tool) return;
        const d2 = this.hitTest(p);
        if (!d2) return;
        e.stopPropagation();
        e.preventDefault();
        if (!this.selection.has(d2.id)) this.select([d2.id]);
        this.hooks.menu?.(e.clientX, e.clientY, this.menuItems(d2));
      };
      /* Arrow keys nudge the selected drawings: left/right = one bar, up/down = a few pixels of price. */
      this.onArrow = (e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
        if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || this.tool || this.draft || this.gesture) return;
        const t = e.target;
        if (t && (t.isContentEditable || t.closest?.('input, textarea, select, [contenteditable="true"], [role="textbox"]'))) return;
        const pos = this.selected().filter((d2) => !d2.locked && !d2.hidden);
        if (!pos.length) return;
        e.preventDefault();
        e.stopPropagation();
        const sec = this.m.barSec(), dt = e.key === "ArrowLeft" ? -sec : e.key === "ArrowRight" ? sec : 0;
        this.store.begin();
        for (const d2 of pos) {
          let dp = 0;
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            const y0 = this.m.priceToY(d2.points[0].price);
            const p1 = y0 == null ? null : this.m.yToPrice(y0 + (e.key === "ArrowUp" ? -4 : 4));
            if (p1 == null) continue;
            dp = p1 - d2.points[0].price;
            let minP = Infinity;
            for (const q of d2.points) minP = Math.min(minP, q.price);
            if (minP > 0 && minP + dp <= 0) continue;
          }
          d2.points = d2.points.map((a) => ({ ...a, time: a.time + dt, price: a.price + dp }));
        }
        this.store.touch();
        clearTimeout(this.arrowT);
        this.arrowT = setTimeout(() => this.store.end(), 500);
      };
      /* Pressing / releasing Shift while a line is being drawn re-evaluates the straight-line snap without a mouse move. */
      this.onShift = (e) => {
        if (e.key === "Shift" && this.draft && !this.draft.free && this.lastPointer) this.updatePreview(this.lastPointer, { shiftKey: e.type === "keydown" });
      };
      this.onKey = (e) => {
        const t = e.target;
        if (t && (t.isContentEditable || t.closest?.('input, textarea, select, [contenteditable="true"], [role="textbox"]'))) return;
        const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
        if (mod && k === "z") {
          e.preventDefault();
          e.shiftKey ? this.store.doRedo() : this.store.doUndo();
          this.pruneSelection();
          return;
        }
        if (mod && k === "y") {
          e.preventDefault();
          this.store.doRedo();
          this.pruneSelection();
          return;
        }
        if (mod && k === "c" && this.selection.size) {
          e.preventDefault();
          this.copy();
          return;
        }
        if (mod && k === "v") {
          e.preventDefault();
          this.paste();
          return;
        }
        if (mod && k === "d" && this.selection.size) {
          e.preventDefault();
          this.duplicateSelection();
          return;
        }
        if (mod && k === "a" && (!this.tool || this.hold)) {
          e.preventDefault();
          this.select(this.store.items.filter((d2) => !d2.hidden).map((d2) => d2.id));
          return;
        }
        if ((e.key === "Delete" || e.key === "Backspace") && !this.draft) {
          if (this.selection.size) {
            e.preventDefault();
            this.deleteSelection();
          }
          return;
        }
        if (e.key === "Backspace" && this.draft && this.draft.d.points.length > 1) {
          this.draft.d.points.pop();
          this.dirty = true;
          return;
        }
        if (e.key === "Enter" && this.draft) {
          this.finishDraft();
          return;
        }
        if (e.key === "Escape") {
          if (this.qm) {
            this.clearQM();
            if (this.tool === "measure") this.setTool(null);
            return;
          }
          if (this.draft) {
            const def = TOOL_MAP[this.draft.d.type];
            if (def.points === "multi" && this.draft.d.points.length >= 2) this.finishDraft();
            else this.cancelDraft();
          } else if (this.tool || this.mode === "eraser") this.setTool(null), this.setMode("cursor");
          else if (this.selection.size) {
            this.selection.clear();
            this.dirty = true;
            this.hooks.changed?.();
          }
          return;
        }
        // Match the complete modifier combination. This prevents Alt+R (chart reset)
        // from accidentally activating Rectangle, which intentionally uses Alt+Shift+R.
        if (e.repeat) return;
        const keyName = e.code?.startsWith("Key") ? e.code.slice(3).toUpperCase() : e.key.toUpperCase();
        const isMac = /Mac|iPhone|iPad/.test(navigator.platform || "");
        const pressed = {
          // Treat Ctrl-based custom shortcuts as the platform's primary modifier.
          CTRL: e.ctrlKey || (isMac && e.metaKey),
          ALT: e.altKey,
          SHIFT: e.shiftKey,
          META: e.metaKey && !isMac
        };
        const normalize = (part) => part.toUpperCase() === "CMD" || part.toUpperCase() === "META" ? "META" : part.toUpperCase();
        const t2 = Object.values(TOOL_MAP).find((toolDef) => {
          if (!toolDef.hotkey) return false;
          const parts = toolDef.hotkey.split("+").map(normalize);
          const expectedKey = parts.pop();
          if (expectedKey !== keyName) return false;
          return ["CTRL", "ALT", "SHIFT", "META"].every((modifier) =>
            !!pressed[modifier] === parts.includes(modifier));
        });
        if (t2) {
          e.preventDefault();
          e.stopPropagation();
          // Single-anchor line tools should place immediately at the pointer, like a chart hotkey
          // action, instead of requiring a second click to finish the drawing.
          if (["hline", "hray", "vline"].includes(t2.type) && this.placeSinglePointAtPointer(t2.type)) return;
          this.setTool(t2.type);
        }
      };
      /* Hold Ctrl = temporary Brush (left button draws); releasing Ctrl restores the previous tool / mode. */
      this.onCtrlDown = (e) => {
        if (e.key !== "Control" || e.repeat) return;
        const t = e.target;
        if (t && (t.isContentEditable || t.closest?.('input, textarea, select, [contenteditable="true"], [role="textbox"]'))) return;
        this.beginHoldBrush();
      };
      this.onCtrlUp = (e) => {
        if (e.key === "Control") this.endHoldBrush();
      };
      this.onBlur = () => this.endHoldBrush();
      const NS = "http://www.w3.org/2000/svg";
      this.svg = document.createElementNS(NS, "svg");
      this.svg.setAttribute("class", "dr-svg");
      this.svg.setAttribute("font-family", "Trebuchet MS,Roboto,sans-serif");
      this.layer = document.createElementNS(NS, "g");
      this.draftLayer = document.createElementNS(NS, "g");
      this.handlesLayer = document.createElementNS(NS, "g");
      this.qmLayer = document.createElementNS(NS, "g");
      this.svg.append(this.layer, this.draftLayer, this.qmLayer, this.handlesLayer);
      host.appendChild(this.svg);
      store.on(() => {
        this.dirty = true;
      });
      const h = host;
      h.addEventListener("pointerdown", this.onDown, true);
      h.addEventListener("pointermove", this.onHover, true);
      h.addEventListener("pointerleave", this.onLeave, true);
      for (const t of ["mousedown", "touchstart"]) h.addEventListener(t, this.onCompat, true);
      h.addEventListener("dblclick", this.onDbl, true);
      h.addEventListener("contextmenu", this.onCtx, true);
      document.addEventListener("keydown", this.onKey);
      document.addEventListener("keydown", this.onArrow, true);
      document.addEventListener("keydown", this.onShift);
      document.addEventListener("keyup", this.onShift);
      document.addEventListener("keydown", this.onCtrlDown);
      document.addEventListener("keyup", this.onCtrlUp);
      window.addEventListener("blur", this.onBlur);
      const loop = () => {
        this.raf = requestAnimationFrame(loop);
        this.frame();
      };
      this.raf = requestAnimationFrame(loop);
    }
    destroy() {
      cancelAnimationFrame(this.raf);
      document.removeEventListener("keydown", this.onKey);
      document.removeEventListener("keydown", this.onArrow, true);
      document.removeEventListener("keydown", this.onShift);
      document.removeEventListener("keyup", this.onShift);
      document.removeEventListener("keydown", this.onCtrlDown);
      document.removeEventListener("keyup", this.onCtrlUp);
      window.removeEventListener("blur", this.onBlur);
      this.host.removeEventListener("pointerdown", this.onDown, true);
      this.host.removeEventListener("pointermove", this.onHover, true);
      this.host.removeEventListener("pointerleave", this.onLeave, true);
      for (const type of ["mousedown", "touchstart"]) this.host.removeEventListener(type, this.onCompat, true);
      this.host.removeEventListener("dblclick", this.onDbl, true);
      this.host.removeEventListener("contextmenu", this.onCtx, true);
      window.removeEventListener("pointermove", this.onMove);
      window.removeEventListener("pointerup", this.onUp);
      window.removeEventListener("pointercancel", this.onUp);
      this.svg.remove();
    }
    /* ---------- state setters ---------- */
    /** Place a one-point drawing at the current pointer without entering click-to-place mode. */
    placeSinglePointAtPointer(type) {
      const p = this.lastPointer;
      const def = TOOL_MAP[type];
      if (!p || !def || def.points !== 1 || !this.inPlot(p)) return false;
      const anchor = pointToAnchor(this.m, p.x, p.y);
      if (!anchor) return false;
      this.clearQM();
      if (this.draft) this.cancelDraft();
      const drawing = makeDrawing(type, [anchor], this.store.toolDefaults(type));
      def.init?.(drawing, this.m);
      this.store.add(drawing);
      this.tool = null;
      this.mode = "cursor";
      this.selection.clear();
      this.selection.add(drawing.id);
      this.dirty = true;
      this.updateCursor();
      this.hooks.changed?.();
      return true;
    }
    beginHoldBrush() {
      if (this.hold || this.draft || this.gesture || this.qm || !TOOL_MAP.brush) return;
      this.hold = { tool: this.tool, mode: this.mode };
      this.tool = "brush";
      this.mode = "cursor";
      this.dirty = true;
      this.updateCursor();
      this.hooks.changed?.();
    }
    endHoldBrush() {
      if (!this.hold) return;
      if (this.gesture?.k === "draw") {
        this.holdPending = true;
        return;
      }
      const h = this.hold;
      this.hold = null;
      this.holdPending = false;
      if (this.draft) this.cancelDraft();
      this.tool = h.tool;
      this.mode = h.mode;
      this.dirty = true;
      this.updateCursor();
      this.hooks.changed?.();
    }
    setTool(t) {
      this.hold = null;
      this.clearQM();
      if (this.draft) this.cancelDraft();
      this.tool = t;
      if (t) {
        this.mode = "cursor";
        this.selection.clear();
      }
      this.dirty = true;
      this.updateCursor();
      this.hooks.changed?.();
    }
    setMode(m) {
      this.hold = null;
      this.clearQM();
      this.cancelDraft();
      this.tool = null;
      this.mode = m;
      this.selection.clear();
      this.dirty = true;
      this.updateCursor();
      this.hooks.changed?.();
    }
    select(ids, additive = false) {
      if (!additive) this.selection.clear();
      ids.forEach((i) => this.selection.add(i));
      this.dirty = true;
      this.hooks.changed?.();
    }
    selected() {
      return [...this.selection].map((i) => this.store.get(i)).filter(Boolean);
    }
    /* ---------- context / geometry ---------- */
    ctx() {
      const m = this.m, dec = m.decimals();
      return {
        m,
        plot: m.plot(),
        bars: m.bars(),
        dec,
        barSec: m.barSec(),
        selected: false,
        draft: false,
        px: (a) => {
          const x = m.timeToX(a.time), y = m.priceToY(a.price);
          return x == null || y == null ? null : { x, y };
        },
        price: (p) => fmtPrice(p, dec)
      };
    }
    primsOf(d2, c = this.ctx()) {
      try {
        return TOOL_MAP[d2.type].build({ ...c, selected: this.selection.has(d2.id) }, d2);
      } catch {
        return [];
      }
    }
    handlePts(d2, c = this.ctx()) {
      const t = TOOL_MAP[d2.type];
      if (t.handles) return t.handles(c, d2);
      return d2.points.map((a) => c.px(a));
    }
    hitTest(p, onlyId, touchTol) {
      const c = this.ctx(), tol = touchTol ?? HIT_TOL;
      const list = this.store.sorted().filter((d2) => !d2.hidden && (!onlyId || d2.id === onlyId)).reverse();
      for (const d2 of list) {
        if (d2.type === "brush" || d2.type === "highlighter") {
        }
        for (const pr of this.primsOf(d2, c)) if (hitPrim(pr, p, Math.max(tol, (pr.w ?? 1) / 2 + 3))) return d2;
      }
      return null;
    }
    handleAt(p, radius = HANDLE_R + 2) {
      const c = this.ctx();
      let best = null, bd = Infinity;
      for (const d2 of this.selected()) {
        if (d2.locked || d2.hidden) continue;
        const hs = this.handlePts(d2, c);
        for (let i = 0; i < hs.length; i++) {
          const q = hs[i], k = q ? dist(q, p) : Infinity;
          if (k <= radius && k < bd) {
            bd = k;
            best = { d: d2, idx: i };
          }
        }
      }
      return best;
    }
    local(e) {
      const r = this.svg.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    inPlot(p) {
      const r = this.m.plot();
      return p.x >= 0 && p.y >= 0 && p.x <= r.w && p.y <= r.h;
    }
    /* `from` = pixel of the previous point, `fromA` = its exact anchor. Shift snaps the segment to the nearest 45 degrees;
       horizontal / vertical results copy the price / time of `fromA` so the line is exactly level / plumb. */
    anchorAt(p, e, from, fromA) {
      let q = p, snap = 0;
      if (e.shiftKey && from) {
        const dx = p.x - from.x, dy = p.y - from.y, r = Math.hypot(dx, dy), k = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)), a = k * (Math.PI / 4);
        q = { x: from.x + r * Math.cos(a), y: from.y + r * Math.sin(a) };
        snap = k % 4 === 0 ? 1 : Math.abs(k) % 4 === 2 ? 2 : 0;
      }
      const an = pointToAnchor(this.m, q.x, q.y);
      if (an && fromA) {
        if (snap === 1) an.price = fromA.price;
        else if (snap === 2) an.time = fromA.time;
      }
      return an;
    }
    /* ---------- event handlers ---------- */
    ignoreTarget(e) {
      return !!e.target?.closest?.("[data-dr-ui]");
    }
    setHoverCursor(c) {
      if (c === this.hoverClass) return;
      this.host.classList.remove("dr-move", "dr-handle");
      if (c) this.host.classList.add(c);
      this.hoverClass = c;
    }
    updateCursor() {
      this.host.classList.toggle("dr-draw", !!this.tool);
      this.host.classList.toggle("dr-erase", this.mode === "eraser");
      if (this.tool || this.mode === "eraser") this.setHoverCursor("");
    }
    /* --- selection / dragging --- */
    selectDown(p, e) {
      const touch = e.pointerType === "touch", pen = e.pointerType === "pen";
      const hd = this.handleAt(p, touch ? HANDLE_TOUCH_R : pen ? 16 : void 0);
      if (hd) {
        this.store.begin();
        const q = this.handlePts(hd.d)[hd.idx];
        /* keep the grab offset: the handle follows the finger without jumping under it */
        this.gesture = { k: "handle", id: hd.d.id, idx: hd.idx, moved: false, off: q ? { x: q.x - p.x, y: q.y - p.y } : null };
        return true;
      }
      const d2 = this.hitTest(p, void 0, touch ? 14 : pen ? 9 : void 0);
      if (!d2) {
        if (this.selection.size) {
          this.selection.clear();
          this.dirty = true;
          this.hooks.changed?.();
        }
        return false;
      }
      if (e.shiftKey) {
        this.selection.has(d2.id) ? this.selection.delete(d2.id) : this.selection.add(d2.id);
      } else if (!this.selection.has(d2.id)) {
        this.selection.clear();
        this.selection.add(d2.id);
      }
      this.dirty = true;
      this.hooks.changed?.();
      if (d2.locked) return true;
      const orig = /* @__PURE__ */ new Map();
      for (const s of this.selected()) if (!s.locked) orig.set(s.id, s.points.map((a) => ({ ...a })));
      this.store.begin();
      this.gesture = { k: "move", start: p, orig, moved: false };
      return true;
    }
    /* --- eraser --- */
    startErase(p) {
      this.store.begin();
      this.gesture = { k: "erase" };
      const d2 = this.hitTest(p);
      if (d2) this.store.remove([d2.id]);
      return true;
    }
    /* --- drawing --- */
    drawDown(p, e) {
      const def = TOOL_MAP[this.tool];
      const a = this.anchorAt(p, e, this.draft ? this.ctx().px(this.draft.d.points[this.draft.d.points.length - 1]) ?? void 0 : void 0, this.draft ? this.draft.d.points[this.draft.d.points.length - 1] : void 0);
      this.gesture = { k: "draw" };
      if (!a) return;
      if (!this.draft) {
        const d2 = makeDrawing(def.type, [a], this.store.toolDefaults(def.type));
        this.draft = { d: d2, preview: a, down: p, moved: false, free: def.points === "free", px: def.points === "free" ? [{ x: p.x, y: p.y }] : null };
        if (def.points === 1) {
          this.finishDraft();
          return;
        }
      } else {
        this.draft.d.points.push(a);
        this.draft.down = p;
        this.draft.moved = false;
        if (def.points !== "multi" && def.points !== "free" && this.draft.d.points.length >= def.points) {
          this.finishDraft();
          return;
        }
      }
      this.dirty = true;
    }
    updatePreview(p, e) {
      if (!this.draft) return;
      const pts2 = this.draft.d.points, last = this.ctx().px(pts2[pts2.length - 1]) ?? void 0;
      const a = this.anchorAt(p, e, last, pts2[pts2.length - 1]);
      if (a) {
        this.draft.preview = a;
        this.draftDirty = true;
      }
    }
    drawMove(p, e) {
      const dr = this.draft;
      if (!dr) return;
      if (Math.hypot(p.x - dr.down.x, p.y - dr.down.y) > 4) dr.moved = true;
      if (dr.free) {
        /* pixel-space stroke: cheap distance test, no per-move chart lookups; anchors are stored for the final drawing */
        const px = dr.px || (dr.px = []), last = px[px.length - 1];
        if (!last || Math.hypot(p.x - last.x, p.y - last.y) >= 2) {
          if (px.length >= 6000) return;
          const a = pointToAnchor(this.m, p.x, p.y);
          if (a) {
            px.push({ x: p.x, y: p.y });
            dr.d.points.push(a);
            this.draftDirty = true;
          }
        }
      } else this.updatePreview(p, e);
    }
    drawUp(p, e) {
      const dr = this.draft;
      if (!dr) return;
      const def = TOOL_MAP[dr.d.type];
      if (dr.free) {
        this.finishDraft();
        return;
      }
      if (dr.moved && dr.d.points.length === 1 && typeof def.points === "number" && def.points >= 2) {
        this.updatePreview(p, e);
        dr.d.points.push(dr.preview);
        dr.moved = false;
        if (dr.d.points.length >= def.points) this.finishDraft();
        this.dirty = true;
      }
    }
    cancelDraft() {
      this.draft = null;
      this.gesture = null;
      this.dirty = true;
    }
    finishDraft() {
      const dr = this.draft;
      if (!dr) return;
      this.draft = null;
      const d2 = dr.d, def = TOOL_MAP[d2.type], need = typeof def.points === "number" ? def.points : def.minPoints ?? 2;
      if (d2.points.length < need) {
        this.dirty = true;
        return;
      }
      if (need >= 2) {
        const c = this.ctx(), ps = d2.points.map((a) => c.px(a));
        if (ps.every((q) => q && ps[0] && dist(q, ps[0]) < 2)) {
          this.dirty = true;
          return;
        }
      }
      if (def.points === "free") {
        const c = this.ctx(), px = d2.points.map((a) => c.px(a)).filter(Boolean);
        if (px.length === d2.points.length) {
          const keep = simplify(px, 0.8);
          d2.points = keep.map((q) => ({ time: this.m.xToTime(q.x), price: this.m.yToPrice(q.y) }));
        }
      }
      def.init?.(d2, this.m);
      this.store.add(d2);
      this.gesture = null;
      if (!this.stay && !this.hold) {
        this.tool = null;
        this.updateCursor();
      }
      this.selection.clear();
      this.selection.add(d2.id);
      this.hooks.changed?.();
      if (def.editsText) this.hooks.editText?.(d2);
    }
    menuItems(d2) {
      return [
        ["Settings\u2026", () => this.hooks.openSettings?.(d2)],
        ["Clone", () => this.duplicateSelection()],
        [d2.locked ? "Unlock" : "Lock", () => this.store.mutate(() => {
          const v = !d2.locked;
          this.selected().forEach((x) => {
            x.locked = v;
          });
        })],
        ["Hide", () => {
          this.store.mutate(() => {
            this.selected().forEach((x) => {
              x.hidden = true;
            });
          });
          this.selection.clear();
          this.hooks.changed?.();
        }],
        ["Bring to front", () => this.store.bringToFront(d2.id)],
        ["Send to back", () => this.store.sendToBack(d2.id)],
        ["Delete", () => this.deleteSelection(true)]
      ];
    }
    /* ---------- commands ---------- */
    deleteSelection(force = false) {
      const ids = this.selected().filter((d2) => force || !d2.locked).map((d2) => d2.id);
      if (!ids.length) return;
      this.store.remove(ids);
      this.selection.clear();
      this.hooks.changed?.();
    }
    duplicateSelection() {
      const ids = [...this.selection];
      if (!ids.length) return;
      const dt = this.m.barSec() * 3, p = this.lastClose(), dp = p * -0.01;
      const out = this.store.duplicate(ids, dt, dp);
      this.selection = new Set(out.map((d2) => d2.id));
      this.hooks.changed?.();
    }
    lastClose() {
      const b = this.m.bars();
      return b.length ? b[b.length - 1].close : 0;
    }
    copy() {
      return this.store.copy([...this.selection]);
    }
    paste() {
      const dt = this.m.barSec() * 3, p = this.lastClose();
      const out = this.store.paste(dt, p * -0.01);
      if (out.length) {
        this.selection = new Set(out.map((d2) => d2.id));
        this.hooks.changed?.();
      }
    }
    pruneSelection() {
      for (const id of [...this.selection]) if (!this.store.get(id)) this.selection.delete(id);
      this.dirty = true;
      this.hooks.changed?.();
    }
    /* ---------- quick measure (Shift+drag / Measure tool) ----------
       Lives outside the drawing store: no undo entries, no full re-render while dragging. */
    qmAnchor(p, e) {
      return pointToAnchor(this.m, p.x, p.y);
    }
    startQM(p, e) {
      const a = this.qmAnchor(p, e);
      if (!a) return false;
      const d2 = makeDrawing("measure", [a, a], this.store.toolDefaults("measure"));
      this.qm = { d: d2, a, down: p, moved: false, viaTool: this.tool === "measure", waiting: false, frozen: false };
      this.gesture = { k: "qm" };
      this.qmDirty = true;
      this.host.classList.add("dr-draw");
      return true;
    }
    qmTo(p, e) {
      const q = this.qm;
      if (!q) return;
      if (Math.hypot(p.x - q.down.x, p.y - q.down.y) > 3) q.moved = true;
      const b = this.qmAnchor(p, e);
      if (b) {
        q.d.points = [q.a, b];
        this.qmDirty = true;
      }
    }
    qmUp(p, e) {
      const q = this.qm;
      if (!q) return;
      this.qmTo(p, e);
      if (q.moved) {
        if (q.viaTool) this.qmFreeze();
        else this.clearQM();
        return;
      }
      if (q.viaTool) {
        q.waiting = true;
        return;
      }
      this.clearQM();
      const d2 = this.hitTest(p);
      if (d2) {
        this.selection.has(d2.id) ? this.selection.delete(d2.id) : this.selection.add(d2.id);
        this.dirty = true;
        this.hooks.changed?.();
      }
    }
    qmSecond(p, e) {
      this.qmTo(p, e);
      this.qm.moved = true;
      this.qmFreeze();
    }
    qmFreeze() {
      const q = this.qm;
      q.waiting = false;
      q.frozen = true;
      this.qmDirty = true;
      if (!this.stay) {
        this.tool = null;
        this.updateCursor();
        this.hooks.changed?.();
      }
    }
    clearQM() {
      if (!this.qm) return;
      this.qm = null;
      this.qmDirty = true;
      if (this.gesture?.k === "qm") this.gesture = null;
      this.updateCursor();
    }
    renderQM() {
      const q = this.qm;
      this.qmLayer.innerHTML = q ? this.primsOf(q.d, this.ctx()).map(primToSvg).join("") : "";
    }
    /* ---------- rendering ---------- */
    invalidate() {
      this.dirty = true;
    }
    frame() {
      const s = this.m.signature();
      if (this.dirty || s !== this.sig || this.store.rev !== this.lastRev) {
        this.sig = s;
        this.lastRev = this.store.rev;
        this.dirty = false;
        this.draftDirty = false;
        this.render();
        this.qmDirty = !!this.qm || this.qmDirty;
      } else if (this.draftDirty) {
        /* a stroke / preview changed: repaint only the draft layer, not every drawing */
        this.draftDirty = false;
        this.renderDraft(this.ctx());
      }
      if (this.qmDirty) {
        this.qmDirty = false;
        this.renderQM();
      }
    }
    render() {
      const pl = this.m.plot();
      this.svg.style.width = pl.w + "px";
      this.svg.style.height = pl.h + "px";
      const c = this.ctx(), parts = [];
      for (const d2 of this.store.sorted()) {
        if (d2.hidden) continue;
        const prims = this.primsOf(d2, c);
        parts.push(`<g data-id="${d2.id}"${d2.locked ? ' class="dr-locked"' : ""}>${prims.map(primToSvg).join("")}</g>`);
      }
      this.layer.innerHTML = parts.join("");
      this.renderDraft(c);
      const hp = [];
      for (const d2 of this.selected()) {
        if (d2.hidden) continue;
        for (const q of this.handlePts(d2, c)) if (q) hp.push(`<circle cx="${q.x.toFixed(1)}" cy="${q.y.toFixed(1)}" r="${COARSE ? 9 : 5}" class="dr-h${d2.locked ? " lk" : ""}"/>`);
      }
      this.handlesLayer.innerHTML = hp.join("");
      this.hooks.changed?.();
    }
    renderDraft(c) {
      if (!this.draft) {
        if (this.draftLayer.firstChild) this.draftLayer.innerHTML = "";
        return;
      }
      const dr = this.draft, t = TOOL_MAP[dr.d.type];
      if (dr.free && dr.px) {
        /* live stroke straight from pixels */
        const prim = { k: "poly", pts: dr.px, ...strokeOf(dr.d.style) };
        this.draftLayer.innerHTML = `<g opacity="0.9">${primToSvg(prim)}</g>`;
        return;
      }
      const need = typeof t.points === "number" ? t.points : dr.d.points.length + 1;
      const pts2 = [...dr.d.points];
      if (!dr.free) while (pts2.length < need) pts2.push(dr.preview);
      if (t.points === "multi") pts2.push(dr.preview);
      const tmp = { ...dr.d, points: pts2, draft: true };
      this.draftLayer.innerHTML = `<g opacity="0.9">${this.primsOf(tmp, c).map(primToSvg).join("")}</g>`;
    }
    /** bounding box (svg-local px) of the current selection's handles, for the floating toolbar */
    selectionBox() {
      const c = this.ctx(), xs = [], ys = [];
      for (const d2 of this.selected()) {
        if (d2.hidden) continue;
        for (const pr of this.primsOf(d2, c)) {
          if (pr.k === "line") xs.push(pr.a.x, pr.b.x), ys.push(pr.a.y, pr.b.y);
          else if (pr.k === "poly" || pr.k === "path") pr.pts.forEach((q) => (xs.push(q.x), ys.push(q.y)));
          else if (pr.k === "rect") xs.push(pr.r.x, pr.r.x + pr.r.w), ys.push(pr.r.y, pr.r.y + pr.r.h);
          else if (pr.k === "ell") xs.push(pr.c.x - pr.rx, pr.c.x + pr.rx), ys.push(pr.c.y - pr.ry, pr.c.y + pr.ry);
        }
        this.handlePts(d2, c).forEach((q) => q && (xs.push(q.x), ys.push(q.y)));
      }
      if (!xs.length) return null;
      const x = Math.min(...xs), y = Math.min(...ys);
      return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
    }
  };

  // tools/icons
  var d = (p) => `<path d="${p}" fill="none"/>`;
  var dot = (x, y) => `<circle cx="${x}" cy="${y}" r="1.8" fill="currentColor" stroke="none"/>`;
  var circ = (x, y) => `<circle cx="${x}" cy="${y}" r="2" fill="none"/>`;
  /* Long/Short position icon (TradingView style): green profit box + red stop box split by the entry line, with a bold L (long) or S (short) letter in the profit box. */
  var posIcon = (side) => {
    const long = side === "long", g = "#089981", r = "#f23645";
    const top = long ? g : r, bot = long ? r : g;
    const letter = long
      ? '<path d="M10 5.300v4.500h4" fill="none" stroke="' + g + '" stroke-width="1.800"/>'
      : '<path d="M14 14.800c-.5-.8-1.200-1.100-2-1.100-1.100 0-1.900.5-1.900 1.300 0 1.700 4 .8 4 2.600 0 .9-.9 1.400-2.100 1.400-1 0-1.800-.3-2.300-1" fill="none" stroke="' + g + '" stroke-width="1.500"/>';
    return '<rect x="3.500" y="3" width="17" height="9" rx="1.500" fill="' + top + '" fill-opacity=".22" stroke="' + top + '"/>'
      + '<rect x="3.500" y="12" width="17" height="9" rx="1.500" fill="' + bot + '" fill-opacity=".22" stroke="' + bot + '"/>'
      + '<path d="M3.500 12h17" stroke="currentColor" stroke-width="1.300"/>'
      + letter;
  };
  var IC = {
    cursor: d("M5 3l13 8-6 1.5L9.5 19z"),
    trend: d("M4 19L20 5") + circ(4, 19) + circ(20, 5),
    hline: d("M2 12h20") + dot(12, 12),
    hray: d("M4 12h18") + circ(4, 12),
    vline: d("M12 2v20") + dot(12, 12),
    arrow: d("M4 20L19 5M19 5h-7M19 5v7"),
    pchannel: d("M3 17L19 7M3 23L19 13") + d("M3 17v6M19 7v6"),
    volumeprofile: d("M3 4h18M3 8h13M3 12h18M3 16h10M3 20h15"),
    fibret: d("M3 5h18M3 10h18M3 15h18M3 20h18") + d("M6 5v15"),
    long: posIcon("long"),
    short: posIcon("short"),
    brush: d("M4 20c3 0 4-2 4-3.500L18 4l2 2L10 16.500c0 2-2 3.500-6 3.500z"),
    rect: d("M4 6h16v12H4z"),
    text: d("M5 6V4h14v2M12 4v16M9 20h6"),
    pricelabel: d("M3 12l5-5h13v10H8z") + dot(9, 12),
    flag: d("M6 21V4M6 4h12l-3 4 3 4H6"),
    arrowup: d("M12 20V5M5 11l7-7 7 7"),
    arrowdown: d("M12 4v15M5 13l7 7 7-7"),
    measure: d("M4 20L20 4M4 20h6M4 20v-6M20 4h-6M20 4v6"),
    stay: d("M12 3l9 4-9 4-9-4zM3 12l9 4 9-4M3 17l9 4 9-4"),
    lock: d("M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3"),
    unlock: d("M6 11h12v9H6zM8 11V8a4 4 0 0 1 7-2.500"),
    eye: d("M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z") + circ(12, 12),
    eyeoff: d("M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM3 3l18 18"),
    trash: d("M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13"),
    undo: d("M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3"),
    redo: d("M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3"),
    copy: d("M8 8h11v13H8zM5 16V3h11"),
    gear: d("M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z") + `<circle cx="12" cy="12" r="3" fill="none"/>`
  };
  /* Warm the browser cache (fetch + decode) as soon as the script runs so the Long/Short icons are ready on first paint. */
  if (typeof Image === "function") for (const src of ["assets/images/long-position.png", "assets/images/short-position.png"]) {
    const im = new Image();
    im.decoding = "sync";
    im.src = src;
    im.decode?.().catch(() => {});
  }
  var icon = (k, s = 20) => {
    if (k === "long" || k === "short") {
      const src = k === "long" ? "assets/images/long-position.png" : "assets/images/short-position.png";
      return `<img class="dr-position-icon" src="${src}" alt="" aria-hidden="true" loading="eager" decoding="sync" draggable="false" width="${s}" height="${s}" style="width:${s}px;height:${s}px;object-fit:contain;vertical-align:middle;display:inline-block" />`;
    }
    return `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${IC[k] ?? IC.trend}</svg>`;
  };

  // ui
  var el = (tag, cls = "", html = "") => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html) e.innerHTML = html;
    e.setAttribute("data-dr-ui", "");
    return e;
  };
  var getPath = (d2, path) => path.split(".").reduce((o, k) => o == null ? o : o[k], d2);
  function setPath(d2, path, v) {
    const ks = path.split(".");
    let o = d2;
    for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]];
    o[ks[ks.length - 1]] = v;
  }
  var esc2 = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  var hexOf = (c) => /^#[0-9a-f]{6}$/i.test(c) ? c : "#888888";
  /* time zone of the chart's time axis (Tehran, see src/js/app/core/time-format.js); falls back to UTC */
  var TZNAME = typeof TZ === "string" ? TZ : "UTC";
  var wallFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZNAME, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  var wallParts = (t) => { const o = {}; for (const x of wallFmt.formatToParts(new Date(t * 1e3))) o[x.type] = x.value; return o; };
  /* epoch seconds -> "YYYY-MM-DDTHH:MM:SS" wall clock in TZNAME */
  var toWall = (t) => { const o = wallParts(t); return `${o.year}-${o.month}-${o.day}T${o.hour}:${o.minute}:${o.second}`; };
  /* wall clock string -> epoch seconds (two passes so DST offsets are resolved for that date) */
  var fromWall = (str) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(str || "");
    if (!m) return NaN;
    const asUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) / 1e3;
    let t = asUtc;
    for (let k = 0; k < 2; k++) { const o = wallParts(t); t += asUtc - Date.UTC(+o.year, +o.month - 1, +o.day, +o.hour, +o.minute, +o.second) / 1e3; }
    return t;
  };
  /* last selected tab of the drawing settings window ("style" | "coords") */
  var drTab = "style";
  var inGroup = (g) => (d2) => TOOL_MAP[d2.type]?.group === g;
  var DrawingUI = class {
    constructor(host, c, store) {
      this.host = host;
      this.c = c;
      this.store = store;
      this.bar = el("div", "dr-tb");
      this.fly = el("div", "dr-fly");
      this.fb = el("div", "dr-fb");
      this.hint = el("div", "dr-hint");
      this.settings = null;
      this.settingsId = "";
      this.lastTool = {};
      this.flyGroup = "";
      this.btns = /* @__PURE__ */ new Map();
      /* ---------- floating contextual toolbar ---------- */
      this.fbKey = "";
      this.fly.hidden = true;
      this.fb.hidden = true;
      this.hint.hidden = true;
      host.append(this.bar, this.fly, this.fb, this.hint);
      for (const g of GROUPS) this.lastTool[g.id] = TOOLS.find((t) => t.group === g.id).type;
      this.buildBar();
      document.addEventListener("pointerdown", (e) => {
        if (!e.target.closest(".dr-fly,.dr-tb")) this.closeFly();
      }, true);
      c.hooks.changed = () => this.refresh();
      c.hooks.editText = (d2) => this.editText(d2);
      c.hooks.openSettings = (d2) => this.openSettings(d2);
      c.hooks.menu = (x, y, items) => this.menu(x, y, items);
      store.on(() => this.refresh());
      window.addEventListener("indchange", () => this.refresh());
    }
    btn(id, ic, title, fn, cls = "") {
      const b = el("button", "dr-b " + cls, icon(ic));
      b.title = title;
      b.dataset.id = id;
      b.onclick = (e) => {
        e.stopPropagation();
        fn();
      };
      this.btns.set(id, b);
      return b;
    }
    sep() {
      return el("div", "dr-sep");
    }
    buildBar() {
      const c = this.c, bar = this.bar;
      bar.append(
        this.btn("cursor", "cursor", "Cursor / select (Esc)", () => {
          c.setTool(null);
          c.setMode("cursor");
        }),
        this.sep()
      );
      for (const g of GROUPS) {
        const b = this.btn("g:" + g.id, g.icon, g.label, () => this.openFly(g.id, b), "dr-grp");
        const caret = el("span", "dr-caret", "\u25B8");
        b.appendChild(caret);
        b.oncontextmenu = (e) => {
          e.preventDefault();
          this.openFly(g.id, b);
        };
        bar.appendChild(b);
      }
      bar.append(
        this.sep(),
        this.btn("lockall", "lock", "Lock / unlock all drawings", () => {
          const v = !store(this).items.every((d2) => d2.locked);
          store(this).setAll("locked", v);
        }),
        this.btn("hideall", "eye", "Hide / show\u2026", () => {
          const b = this.btns.get("hideall").getBoundingClientRect(), st = this.hideState();
          const lHide = st.l !== true, tHide = st.t !== true, iHide = st.i !== true;
          this.menu(b.right + 4, b.top, [
            [lHide ? "Hide lines" : "Show lines", () => this.setGroupHidden("lines", lHide)],
            [tHide ? "Hide tools" : "Show tools", () => this.setGroupHidden("other", tHide)],
            [iHide ? "Hide indicators" : "Show indicators", () => this.setIndicatorsHidden(iHide)]
          ]);
        }),
        this.btn("clear", "trash", "Delete\u2026", () => {
          const b = this.btns.get("clear").getBoundingClientRect();
          const drop = (pred) => () => {
            store(this).clear(pred);
            c.selection.clear();
            c.hooks.changed?.();
          };
          this.menu(b.right + 4, b.top, [
            ["Delete Lines", drop(inGroup("lines"))],
            ["Delete Tools", drop(inGroup("other"))],
            ["Delete Indicators", () => {
              window.IND?.removeAll?.();
            }]
          ]);
        }),
        this.sep(),
        this.btn("undo", "undo", "Undo (Ctrl+Z)", () => {
          store(this).doUndo();
        }),
        this.btn("redo", "redo", "Redo (Ctrl+Shift+Z)", () => {
          store(this).doRedo();
        })
      );
      function store(u) {
        return u.store;
      }
    }
    /* Hidden state per category: true = everything hidden, false = something visible, null = nothing to hide.
       l = lines, t = tools, d = all drawings (lines + tools), i = indicators. */
    hideState() {
      const items = this.store.items, ind = window.IND;
      const of = (g) => {
        const xs = items.filter(inGroup(g));
        return xs.length ? xs.every((d2) => d2.hidden) : null;
      };
      return {
        l: of("lines"),
        t: of("other"),
        d: items.length ? items.every((d2) => d2.hidden) : null,
        i: ind && ind.count && ind.count() ? ind.allHidden() : null
      };
    }
    setDrawingsHidden(v) {
      this.store.setAll("hidden", v);
      if (v) this.c.selection.clear();
      this.refresh();
    }
    /* Hide / show only the drawings of one toolbar tab ("lines" or "other" = Tools), independent of the other tab. */
    setGroupHidden(g, v) {
      this.store.setAll("hidden", v, inGroup(g));
      if (v) for (const id of [...this.c.selection]) if (this.store.get(id)?.hidden) this.c.selection.delete(id);
      this.refresh();
    }
    setIndicatorsHidden(v) {
      window.IND?.setVisible?.(!v);
      this.refresh();
    }
    openFly(gid, anchor) {
      if (this.flyGroup === gid && !this.fly.hidden) {
        this.closeFly();
        return;
      }
      this.flyGroup = gid;
      const tools = TOOLS.filter((t) => t.group === gid);
      this.fly.innerHTML = `<div class="dr-fh">${esc2(GROUPS.find((g) => g.id === gid).label)}</div>` + tools.map((t) => `<button data-t="${t.type}" data-dr-ui>${icon(t.icon, 18)}<span>${esc2(t.label)}</span><em>${t.hotkey ?? ""}</em></button>`).join("");
      this.fly.querySelectorAll("button").forEach((b) => b.onclick = () => {
        const t = b.dataset.t;
        this.lastTool[gid] = t;
        this.closeFly();
        this.c.setTool(t);
      });
      const r = anchor.getBoundingClientRect(), h = this.host.getBoundingClientRect();
      this.fly.hidden = false;
      this.fly.style.left = r.right - h.left + 4 + "px";
      this.fly.style.top = Math.max(4, Math.min(r.top - h.top, h.height - this.fly.offsetHeight - 4)) + "px";
    }
    closeFly() {
      this.fly.hidden = true;
      this.flyGroup = "";
    }
    /* ---------- refresh (toolbar state, floating bar, hint) ---------- */
    refresh() {
      const c = this.c, cur = c.tool ? TOOL_MAP[c.tool] : null;
      if (cur && !c.hold) this.lastTool[cur.group] = cur.type;
      const on = (id, v) => this.btns.get(id)?.classList.toggle("on", v);
      on("cursor", !c.tool && c.mode === "cursor");
      for (const g of GROUPS) {
        const b = this.btns.get("g:" + g.id);
        const t = TOOL_MAP[this.lastTool[g.id]];
        b.classList.toggle("on", cur?.group === g.id);
        const caret = b.querySelector(".dr-caret");
        b.innerHTML = icon(t.icon);
        b.appendChild(caret);
        b.title = `${g.label}: ${t.label}`;
      }
      const items = this.store.items;
      this.btns.get("lockall").innerHTML = icon(items.length && items.every((d2) => d2.locked) ? "lock" : "unlock");
      on("lockall", !!items.length && items.every((d2) => d2.locked));
      const hs = this.hideState(), hAny = hs.d === true || hs.i === true || hs.l === true || hs.t === true, hAll = hAny && hs.d !== false && hs.i !== false;
      this.btns.get("hideall").innerHTML = icon(hAll ? "eyeoff" : "eye");
      on("hideall", hAny);
      this.btns.get("undo").disabled = !this.store.canUndo();
      this.btns.get("redo").disabled = !this.store.canRedo();
      if (cur) {
        const n = c.draft ? c.draft.d.points.length : 0, need = typeof cur.points === "number" ? cur.points : 0;
        this.hint.hidden = false;
        this.hint.textContent = cur.points === "free" ? `${cur.label}: press and drag` : cur.points === "multi" ? `${cur.label}: click to add points \xB7 double-click / Enter to finish` : `${cur.label}: click ${need === 1 ? "to place" : `point ${n + 1} of ${need}`} \xB7 Esc to cancel`;
      } else if (c.mode === "eraser") {
        this.hint.hidden = false;
        this.hint.textContent = "Eraser: click or drag over drawings to delete them";
      } else this.hint.hidden = true;
      this.updateFloating();
    }
    updateFloating() {
      const sel = this.c.selected();
      if (!sel.length || this.c.draft || this.c.tool) {
        this.fb.hidden = true;
        this.fbKey = "";
        return;
      }
      const box = this.c.selectionBox();
      if (!box) {
        this.fb.hidden = true;
        return;
      }
      const d2 = sel[0], def = TOOL_MAP[d2.type];
      const key = sel.map((x2) => x2.id).join() + d2.locked + sel.length + d2.style.color + d2.style.width + d2.style.dash + d2.style.fill;
      if (key !== this.fbKey) {
        this.fbKey = key;
        const hasFill = def.fields.some((f) => f.key === "style.fill"), hasLine = def.fields.some((f) => f.key === "style.color");
        this.fb.innerHTML = "";
        const add = (n) => this.fb.appendChild(n);
        const addColorPicker = (key2, title) => {
          const wrap = el("div", "dr-float-color");
          const toggle = el("button", "icolor-toggle", `<span class="icolor-swatch" style="background:${hexOf(d2.style[key2])}"></span>${title}`);
          toggle.type = "button"; toggle.setAttribute("aria-expanded", "false");
          const panel = el("div", "dr-color-panel"); panel.hidden = true;
          panel.innerHTML = `${ColorPalette.html((c) => `data-float-color="${c}"`)}<label>HEX <input type="text" class="ihex" value="${hexOf(d2.style[key2])}" maxlength="7"></label><div class="iopacity"><span>Opacity</span><input type="range" min="0" max="100" value="${d2.style.opacity ?? 100}"><output>${d2.style.opacity ?? 100}%</output></div>`;
          toggle.onclick = () => { const open = panel.hidden; this.fb.querySelectorAll(".dr-color-panel").forEach((x2) => x2.hidden = true); this.fb.querySelectorAll(".dr-float-color .icolor-toggle").forEach((x2) => x2.setAttribute("aria-expanded", "false")); panel.hidden = !open; toggle.setAttribute("aria-expanded", String(open)); };
          const setColor = (hex) => { this.store.begin(); sel.forEach((x2) => { x2.style[key2] = hex; if (key2 === "color" && !hasFill) x2.style.fill = hex; }); sel.forEach((x2) => this.store.saveToolDefaults(x2)); this.store.touch(); this.store.end(); toggle.querySelector(".icolor-swatch").style.background = hex; panel.querySelector(".ihex").value = hex; };
          panel.querySelectorAll("[data-float-color]").forEach((b) => b.onclick = () => setColor(b.dataset.floatColor));
          const hex = panel.querySelector(".ihex"); hex.onchange = () => { if (/^#[0-9a-f]{6}$/i.test(hex.value)) setColor(hex.value); else hex.value = hexOf(d2.style[key2]); };
          const range = panel.querySelector('input[type="range"]'), output = panel.querySelector("output");
          range.onpointerdown = () => this.store.begin();
          range.oninput = () => { const opacity = Math.max(0, Math.min(100, +range.value)); sel.forEach((x2) => { x2.style.opacity = opacity; this.store.saveToolDefaults(x2); }); this.store.touch(); output.textContent = opacity + "%"; };
          range.onchange = () => this.store.end();
          wrap.append(toggle, panel); add(wrap);
        };
        if (hasLine) addColorPicker("color", "Color");
        if (hasFill) addColorPicker("fill", "Fill");
        if (def.fields.some((f) => f.key === "style.width")) {
          const w3 = el("select");
          w3.title = "Line width";
          w3.innerHTML = [1, 2, 3, 4, 6].map((n) => `<option ${n === d2.style.width ? "selected" : ""}>${n}</option>`).join("");
          w3.onchange = () => this.store.mutate(() => sel.forEach((x2) => {
            x2.style.width = +w3.value;
            this.store.saveToolDefaults(x2);
          }));
          add(w3);
          const ds = el("select");
          ds.title = "Line style";
          ds.innerHTML = ["solid", "dashed", "dotted"].map((n) => `<option ${n === d2.style.dash ? "selected" : ""}>${n}</option>`).join("");
          ds.onchange = () => this.store.mutate(() => sel.forEach((x2) => {
            x2.style.dash = ds.value;
            this.store.saveToolDefaults(x2);
          }));
          add(ds);
        }
        const mk2 = (ic, t, fn) => {
          const b = el("button", "dr-fbb", icon(ic, 16));
          b.title = t;
          b.onclick = fn;
          add(b);
        };
        mk2("gear", "Settings", () => this.openSettings(d2));
        mk2(d2.locked ? "lock" : "unlock", d2.locked ? "Unlock" : "Lock", () => this.store.mutate(() => {
          const v = !d2.locked;
          sel.forEach((x2) => {
            x2.locked = v;
          });
        }));
        mk2("eyeoff", "Hide", () => {
          this.store.mutate(() => sel.forEach((x2) => {
            x2.hidden = true;
          }));
          this.c.selection.clear();
          this.c.hooks.changed?.();
        });
        mk2("copy", "Clone (Ctrl+D)", () => this.c.duplicateSelection());
        mk2("trash", "Delete (Del)", () => this.c.deleteSelection(true));
      }
      this.fb.hidden = false;
      const hr = this.host.getBoundingClientRect(), sr = this.c.svg.getBoundingClientRect();
      const w2 = this.fb.offsetWidth, h = this.fb.offsetHeight;
      let x = sr.left - hr.left + box.x + box.w / 2 - w2 / 2, y = sr.top - hr.top + box.y - h - 10;
      if (y < 4) y = sr.top - hr.top + box.y + box.h + 10;
      x = Math.max(sr.left - hr.left + 4, Math.min(x, sr.left - hr.left + sr.width - w2 - 4));
      y = Math.max(4, Math.min(y, hr.height - h - 40));
      this.fb.style.left = x + "px";
      this.fb.style.top = y + "px";
    }
    /* ---------- text editor ---------- */
    editText(d2) {
      const box = this.c.selectionBox(), sr = this.c.svg.getBoundingClientRect(), hr = this.host.getBoundingClientRect();
      const ta = el("textarea", "dr-ta");
      ta.value = d2.props.text ?? "";
      ta.rows = 2;
      ta.style.left = sr.left - hr.left + (box?.x ?? 40) + "px";
      ta.style.top = sr.top - hr.top + (box?.y ?? 40) + "px";
      this.host.appendChild(ta);
      ta.focus();
      ta.select();
      let done = false;
      const end = (ok) => {
        if (done) return;
        done = true;
        if (ok && ta.value !== d2.props.text) this.store.update(d2.id, (x) => {
          x.props.text = ta.value || " ";
        });
        ta.remove();
      };
      ta.onkeydown = (e) => {
        e.stopPropagation();
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          end(true);
        }
        if (e.key === "Escape") end(false);
      };
      ta.onblur = () => end(true);
    }
    /* ---------- settings dialog ---------- */
    openSettings(d2) {
      this.closeSettings();
      const def = TOOL_MAP[d2.type], p = el("div", "dr-set");
      this.settings = p;
      this.settingsId = d2.id;
      p.innerHTML = `<div class="dr-sh"><b>${esc2(def.label)}</b><button class="dr-x" type="button" title="Close" aria-label="Close" data-dr-ui>\u2715</button></div><div class="dr-tabs" role="tablist" data-dr-ui></div><div class="dr-sb dr-sb-style"></div><div class="dr-sb dr-sb-coords" hidden></div>
      <div class="dr-sf"><button type="button" data-a="def" data-dr-ui>Reset to Default</button><button data-a="ok" class="pri" data-dr-ui>Done</button></div>`;
      const body = p.querySelector(".dr-sb-style"), cbody = p.querySelector(".dr-sb-coords"), tabs = p.querySelector(".dr-tabs");
      this.store.begin();
      const rows = [];
      const live = () => {
        this.store.saveToolDefaults(d2); /* every change is remembered for the next drawing of this tool */
        this.store.touch();
        rows.forEach((r) => r.sync?.());
      };
      for (const f of def.fields) {
        if (f.when && !f.when(d2)) continue;
        const r = this.fieldRow(d2, f, live);
        rows.push(r);
        body.appendChild(r);
      }
      /* ---- Coordinates tab: one aligned row per anchor point (price + date/time in the chart's time zone) ---- */
      const hasCoords = !def.hideCoords && d2.points.length, showTime = def.group !== "lines";
      if (hasCoords) {
        const pts2 = el("div", "dr-pts"), n = d2.points.length, dec = this.c.m.decimals();
        pts2.innerHTML = `<div class="dr-cr dr-cr-h"><span></span><span>Price</span>${showTime ? "<span>Time</span>" : ""}</div>`;
        if (!showTime) pts2.classList.add("no-time");
        const names = n === 2 ? ["Start", "End"] : n === 3 ? ["A", "B", "C"] : null;
        d2.points.forEach((a, i) => {
          const row = el("div", "dr-cr");
          row.innerHTML = `<span title="Point ${i + 1}">${names ? names[i] : "P" + (i + 1)}</span>`;
          const pr = el("input");
          pr.type = "number";
          pr.step = "any";
          pr.value = fmtPrice(a.price, dec);
          pr.title = "Price";
          pr.onchange = () => {
            if (Number.isFinite(+pr.value) && pr.value !== "") {
              d2.points[i].price = +pr.value;
              live();
            }
          };
          const tm = showTime ? el("input") : null;
          if (tm) tm.type = "datetime-local";
          if (tm) {
            tm.step = "1";
            tm.title = "Time (" + TZNAME + ")";
            tm.value = toWall(a.time);
            tm.onchange = () => {
              const t = fromWall(tm.value);
              if (Number.isFinite(t)) {
                d2.points[i].time = t;
                live();
              }
            };
          }
          row.sync = () => {
            if (document.activeElement !== pr) pr.value = fmtPrice(d2.points[i].price, dec);
            if (tm && document.activeElement !== tm) tm.value = toWall(d2.points[i].time);
          };
          rows.push(row);
          tm ? row.append(pr, tm) : row.append(pr);
          pts2.appendChild(row);
        });
        cbody.appendChild(pts2);
      }
      /* ---- tabs (Style / Coordinates), TradingView-style; a single pane needs no tab bar ---- */
      const hasStyle = body.children.length > 0;
      const showTab = (id) => {
        if (!hasCoords || !hasStyle) id = hasCoords ? "coords" : "style";
        drTab = id;
        body.hidden = id !== "style";
        cbody.hidden = id !== "coords";
        tabs.querySelectorAll("button").forEach((x) => {
          const on = x.dataset.tab === id;
          x.classList.toggle("on", on);
          x.setAttribute("aria-selected", String(on));
        });
      };
      if (hasCoords && hasStyle) {
        for (const [id, label] of [["style", "Style"], ["coords", "Coordinates"]]) {
          const tb = el("button", "", label);
          tb.type = "button";
          tb.dataset.tab = id;
          tb.setAttribute("role", "tab");
          tb.onclick = () => showTab(id);
          tabs.appendChild(tb);
        }
      } else tabs.hidden = true;
      showTab(drTab);
      /* Draggable: grab the title bar (same behaviour as the indicator settings panel). */
      const head = p.querySelector(".dr-sh");
      head.setAttribute("data-dr-ui", "");
      head.style.cursor = "move";
      head.style.userSelect = "none";
      head.style.touchAction = "none";
      let dragS = null;
      head.addEventListener("pointerdown", (e) => {
        if (e.target.closest("button")) return;
        const hr = this.host.getBoundingClientRect(), pr = p.getBoundingClientRect();
        dragS = { x: e.clientX, y: e.clientY, left: pr.left - hr.left, top: pr.top - hr.top, w: pr.width, h: pr.height, hw: hr.width, hh: hr.height };
        head.setPointerCapture?.(e.pointerId);
        e.preventDefault();
        e.stopPropagation();
      });
      head.addEventListener("pointermove", (e) => {
        if (!dragS) return;
        const l = Math.max(0, Math.min(dragS.hw - dragS.w, dragS.left + e.clientX - dragS.x));
        const t = Math.max(0, Math.min(dragS.hh - Math.min(dragS.h, dragS.hh), dragS.top + e.clientY - dragS.y));
        p.style.left = l + "px";
        p.style.top = t + "px";
      });
      const endDrag = () => { dragS = null; };
      head.addEventListener("pointerup", endDrag);
      head.addEventListener("pointercancel", endDrag);
      const close = () => this.closeSettings();
      p.querySelector(".dr-x").onclick = close;
      p.querySelector("[data-a=ok]").onclick = close;
      p.querySelector("[data-a=def]").onclick = () => {
        const left = p.style.left, top = p.style.top;
        this.store.resetTool(d2);
        this.openSettings(d2); /* rebuild the form with the original values, keeping the window where the user put it */
        if (this.settings && left) { this.settings.style.left = left; this.settings.style.top = top; }
      };
      this.host.appendChild(p);
      p.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Escape") close();
      });
    }
    closeSettings() {
      if (this.settings) {
        this.settings.remove();
        this.settings = null;
        this.store.end();
      }
    }
    fieldRow(d2, f, live) {
      const row = el("div", "dr-row");
      row.innerHTML = `<span>${esc2(f.label)}</span>`;
      const m = this.c.m;
      const v = f.get ? f.get(d2, m) : getPath(d2, f.key);
      const set = (x) => {
        if (f.set) f.set(d2, x, m);
        else setPath(d2, f.key, x);
        live();
      };
      let inp;
      switch (f.type) {
        case "color": {
          const wrap = el("div", "dr-color-control");
          const toggle = el("button", "icolor-toggle", `<span class="icolor-swatch" style="background:${hexOf(v)}"></span>Color`); toggle.type = "button"; toggle.setAttribute("aria-expanded", "false");
          const panel = el("div", "dr-color-panel"); panel.hidden = true;
          panel.innerHTML = `${ColorPalette.html((c) => `data-draw-color="${c}"`)}<label>HEX <input type="text" class="ihex" value="${hexOf(v)}" maxlength="7"></label><div class="iopacity"><span>Opacity</span><input type="range" min="0" max="100" value="${d2.style.opacity ?? 100}"><output>${d2.style.opacity ?? 100}%</output></div>`;
          toggle.onclick = () => { panel.hidden = !panel.hidden; toggle.setAttribute("aria-expanded", String(!panel.hidden)); };
          const update = (hex) => { set(hex); toggle.querySelector(".icolor-swatch").style.background = hex; panel.querySelector(".ihex").value = hex; };
          panel.querySelectorAll("[data-draw-color]").forEach((b) => b.onclick = () => update(b.dataset.drawColor));
          const hi = panel.querySelector(".ihex"); hi.onchange = () => { if (/^#[0-9a-f]{6}$/i.test(hi.value)) update(hi.value); else hi.value = hexOf(getPath(d2, f.key)); };
          const range = panel.querySelector('input[type="range"]'), out = panel.querySelector("output");
          range.onpointerdown = () => live();
          range.oninput = () => { d2.style.opacity = Math.max(0, Math.min(100, +range.value)); out.textContent = range.value + "%"; live(); };
          inp = wrap; wrap.append(toggle, panel); break;
        }
        case "number": {
          const i = el("input");
          i.type = "number";
          i.value = String(v);
          if (f.min != null) i.min = String(f.min);
          if (f.max != null) i.max = String(f.max);
          i.step = String(f.step ?? 1);
          i.onchange = () => {
            let n = +i.value;
            if (!Number.isFinite(n)) return;
            if (f.min != null) n = Math.max(f.min, n);
            if (f.max != null) n = Math.min(f.max, n);
            i.value = String(n);
            set(n);
            if (f.get) i.value = String(f.get(d2, m));
          };
          if (f.get) row.sync = () => {
            if (document.activeElement !== i) i.value = String(f.get(d2, m));
          };
          inp = i;
          break;
        }
        case "bool": {
          const i = el("input");
          i.type = "checkbox";
          i.checked = !!v;
          i.onchange = () => set(i.checked);
          inp = i;
          break;
        }
        case "select": {
          const i = el("select");
          i.innerHTML = (f.options ?? []).map((o) => {
            const [val, lab] = Array.isArray(o) ? o : [o, o];
            return `<option value="${esc2(val)}" ${val === v ? "selected" : ""}>${esc2(lab)}</option>`;
          }).join("");
          i.onchange = () => set(i.value);
          inp = i;
          break;
        }
        case "text": {
          const i = el("input");
          i.type = "text";
          i.value = v ?? "";
          i.oninput = () => set(i.value);
          inp = i;
          break;
        }
        case "textarea": {
          const i = el("textarea");
          i.rows = 3;
          i.value = v ?? "";
          i.oninput = () => set(i.value);
          inp = i;
          break;
        }
        case "levels": {
          const wrap = el("div", "dr-lv");
          row.classList.add("col");
          v.forEach((l) => {
            const r = el("div", "dr-lr"), cb = el("input");
            cb.type = "checkbox";
            cb.checked = l.on;
            cb.onchange = () => {
              l.on = cb.checked;
              live();
            };
            const nv = el("input");
            nv.type = "number";
            nv.step = "any";
            nv.value = String(l.v);
            nv.onchange = () => {
              if (Number.isFinite(+nv.value)) {
                l.v = +nv.value;
                live();
              }
            };
            const co = el("input");
            co.type = "color";
            co.value = hexOf(l.color);
            co.oninput = () => {
              l.color = co.value;
              live();
            };
            r.append(cb, nv, co);
            wrap.appendChild(r);
          });
          inp = wrap;
          break;
        }
      }
      row.appendChild(inp);
      return row;
    }
    /* ---------- tiny context menu (falls back if app's showMenu is unavailable) ---------- */
    menu(x, y, items) {
      const w2 = window;
      if (typeof w2.showMenu === "function") {
        w2.showMenu(x, y, items);
        return;
      }
      const m = el("div", "dr-menu");
      m.style.left = x + "px";
      m.style.top = y + "px";
      items.forEach(([t, fn]) => {
        const b = el("button", "", esc2(t));
        b.onclick = () => {
          m.remove();
          fn();
        };
        m.appendChild(b);
      });
      document.body.appendChild(m);
      const off = (e) => {
        if (!m.contains(e.target)) {
          m.remove();
          document.removeEventListener("pointerdown", off, true);
        }
      };
      document.addEventListener("pointerdown", off, true);
    }
  };

  // index
  function initDrawings(b, host, chartEl) {
    const store = new DrawingStore(b.store);
    const mapper = new LwcMapper(b.chart, b.series, b.bars, chartEl, b.dec);
    const ctl = new Controller(host, mapper, store);
    const ui = new DrawingUI(host, ctl, store);
    let cur = "";
    const watch = () => {
      requestAnimationFrame(watch);
      const s = b.sym();
      if (s && s !== cur) {
        cur = s;
        ctl.cancelDraft();
        ctl.selection.clear();
        store.load(s);
        ui.closeSettings();
        ui.refresh();
      }
    };
    watch();
    ui.refresh();
    return { store, ctl, ui, mapper, toolMap: TOOL_MAP };
  }
  var w = window;
  if (w.TVDR && w.LightweightCharts) {
    w.DR = initDrawings(w.TVDR, document.getElementById("cw"), document.getElementById("chart"));
  }
})();
