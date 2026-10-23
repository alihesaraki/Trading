  // math
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
    if (pts2.length < 3) return pts2.slice();
    let idx = 0, dmax = 0;
    for (let i = 1; i < pts2.length - 1; i++) {
      const d2 = distToSegment(pts2[i], pts2[0], pts2[pts2.length - 1]);
      if (d2 > dmax) {
        dmax = d2;
        idx = i;
      }
    }
    if (dmax <= eps) return [pts2[0], pts2[pts2.length - 1]];
    const l = simplify(pts2.slice(0, idx + 1), eps), r = simplify(pts2.slice(idx), eps);
    return l.slice(0, -1).concat(r);
  }
  function arrowHead(from, tip, size) {
    const ang = Math.atan2(tip.y - from.y, tip.x - from.x), s = Math.PI / 7;
    return [
      tip,
      { x: tip.x - size * Math.cos(ang - s), y: tip.y - size * Math.sin(ang - s) },
      { x: tip.x - size * Math.cos(ang + s), y: tip.y - size * Math.sin(ang + s) }
    ];
  }
