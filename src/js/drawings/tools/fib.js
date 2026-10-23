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
