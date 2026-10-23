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
