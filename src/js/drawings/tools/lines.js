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
