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
