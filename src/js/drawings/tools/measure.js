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
