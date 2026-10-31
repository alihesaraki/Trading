  // primitives: tools return plain "primitives" (line, poly, rect, ell, path, text); this file turns them into SVG (primToSvg) and hit-tests them (hitPrim)
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
