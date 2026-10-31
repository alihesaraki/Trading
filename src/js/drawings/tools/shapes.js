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
