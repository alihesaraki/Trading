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
