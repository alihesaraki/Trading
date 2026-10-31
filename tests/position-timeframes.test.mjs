import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const coords = await readFile(new URL('../src/js/drawings/runtime/coords.js', import.meta.url), 'utf8');
const pos = await readFile(new URL('../src/js/drawings/tools/position.js', import.meta.url), 'utf8');
const hist = await readFile(new URL('../src/js/app/data/older-history.js', import.meta.url), 'utf8');
const { TimeAxis, LwcMapper } = new Function(coords + '; return { TimeAxis, LwcMapper };')();

const END = 1_800_000_000;
const bars = (sec, n) => Array.from({ length: n }, (_, i) => ({ time: END - (n - 1 - i) * sec, close: 1 }));

/* Minimal model of Lightweight Charts: x is linear in the logical index over the MERGED time points of every series
   (candles + daily "future" whitespace + optional extra earlier points from another series). */
function fakeChart(data, sec, extraBefore = 0) {
  const ts = data.map((b) => b.time);
  const merged = [];
  for (let i = extraBefore; i > 0; i--) merged.push(ts[0] - i * sec);
  merged.push(...ts);
  for (let k = 1; k <= 1000; k++) merged.push(ts[ts.length - 1] + k * 86400);
  const spacing = 6, from = merged.indexOf(ts[ts.length - 1]) - 299;
  const sc = {
    logicalToCoordinate: (l) => (l - from) * spacing + spacing / 2,
    coordinateToLogical: (x) => Math.ceil((x - spacing / 2) / spacing + from), /* real library may round to whole bars */
    options: () => ({ barSpacing: spacing }),
    timeToCoordinate: (t) => { const i = merged.indexOf(t); return i < 0 ? null : sc.logicalToCoordinate(i); },
    getVisibleLogicalRange: () => ({ from, to: from + 330 }),
    width: () => 1800, height: () => 28,
  };
  return { timeScale: () => sc, priceScale: () => ({ width: () => 60 }), sc, merged, spacing, from };
}
const mapperFor = (data, sec, extra) => {
  const chart = fakeChart(data, sec, extra);
  const series = { priceToCoordinate: (p) => 500 - p, coordinateToPrice: (y) => 500 - y };
  return { m: new LwcMapper(chart, series, () => data, { clientWidth: 1800, clientHeight: 600 }, () => 2), chart };
};

test('a moment chosen on 5m lands on the same real time on every timeframe (also with extra earlier series points)', () => {
  const T = END - 40 * 300 + 90; // inside history, not aligned to a bar
  const Tfuture = END + 5 * 300;  // in the blank area right of the last candle
  for (const extra of [0, 9]) for (const sec of [60, 300, 900, 3600, 14400, 86400]) {
    const data = bars(sec, 300);
    const { m } = mapperFor(data, sec, extra);
    for (const t of [T, Tfuture]) {
      const x = m.timeToX(t);
      assert.ok(Number.isFinite(x), `${sec}s/${extra}: x finite`);
      assert.ok(Math.abs(m.xToTime(x) - t) < 1e-6, `${sec}s/${extra}: round trip`);
    }
    /* x is proportional to real time between candles: compare with the chart's own coordinate of the two neighbours */
    const i = data.findIndex((b) => b.time > T) - 1;
    if (i >= 0 && i < 299) {
      const xa = m.timeToX(data[i].time), xb = m.timeToX(data[i + 1].time);
      const want = xa + (xb - xa) * (T - data[i].time) / (data[i + 1].time - data[i].time);
      assert.ok(Math.abs(m.timeToX(T) - want) < 1e-6, `${sec}s/${extra}: interpolation`);
    }
    assert.ok(m.timeToX(T) < m.timeToX(Tfuture), `${sec}s/${extra}: order kept`);
  }
});

test('mapper returns no position (instead of x=0) while there are no candles', () => {
  const { m } = mapperFor([], 60, 0);
  assert.equal(m.timeToX(END), null);
  assert.equal(m.xToTime(100), null);
});

test('position model: times place the box, prices are untouched, handles match the drawn box', () => {
  assert.match(pos, /function posGeom/);
  assert.match(pos, /function posSync/);
  assert.match(pos, /c\.m\.timeToX\(g\.et\)/);
  assert.match(pos, /x1 = Math\.max\(X1, X0 \+ MIN_W\)/);
  assert.doesNotMatch(pos, /MIN_W = 48/);
});

test('older candles are loaded until every drawing is covered', () => {
  assert.match(hist, /async function ensureDrawingsCovered/);
  assert.match(hist, /min < data\[0\]\.time/);
});

/* ---- run the real long/short tools from the built drawings.js ---- */
import vm from 'node:vm';
const built = await readFile(new URL('../dist/drawings.js', import.meta.url), 'utf8');
const sandbox = { window: {}, document: {}, navigator: {}, requestAnimationFrame() {}, console };
vm.runInNewContext(built.replace(/\}\)\(\);\s*$/, 'window.__T = { TOOL_MAP, makeDrawing };})();'), sandbox);
const { TOOL_MAP, makeDrawing } = sandbox.window.__T;

function ctxFor(m, data, sec) {
  return {
    m, plot: m.plot(), bars: data, dec: 2, barSec: sec, selected: false, draft: false,
    px: (a) => { const x = m.timeToX(a.time), y = m.priceToY(a.price); return x == null || y == null ? null : { x, y }; },
    price: (p) => p.toFixed(2),
  };
}

for (const side of ['long', 'short']) {
  test(`${side}: box made on 5m keeps the same real time span and exact prices on every timeframe`, () => {
    const dir = side === 'long' ? 1 : -1;
    const d5 = bars(300, 300), m5 = mapperFor(d5, 300, 0).m;
    const entryT = d5[250].time + 100, entry = 200;
    const d = makeDrawing(side, [{ time: entryT, price: entry }], {});
    TOOL_MAP[side].init(d, m5);
    d.points[1].price = entry + dir * 10; d.points[2].price = entry - dir * 5; // target 10, stop 5
    const rightT = d.points[3].time;
    for (const sec of [60, 300, 900, 3600, 14400, 86400]) {
      const data = bars(sec, 300), { m } = mapperFor(data, sec, 3);
      const c = ctxFor(m, data, sec);
      const prims = TOOL_MAP[side].build(c, d);
      assert.ok(prims.length > 0, `${sec}s draws`);
      const rects = prims.filter((p) => p.k === 'rect');
      const x0 = m.timeToX(entryT), x1 = m.timeToX(rightT);
      assert.ok(Math.abs(rects[0].r.x - x0) < 1e-6, `${sec}s: left edge is the entry time`);
      assert.ok(Math.abs(rects[0].r.x + rects[0].r.w - Math.max(x1, x0 + 6)) < 1e-6, `${sec}s: right edge is the stored right time`);
      assert.ok(Math.abs(rects[0].r.y + (dir > 0 ? 0 : 0) - Math.min(m.priceToY(entry), m.priceToY(entry + dir * 10))) < 1e-6, `${sec}s: target price exact`);
      const h = TOOL_MAP[side].handles(c, d);
      assert.ok(h.every(Boolean), `${sec}s handles`);
      assert.ok(Math.abs(h[0].x - x0) < 1e-6 && Math.abs(h[0].y - m.priceToY(entry)) < 1e-6, `${sec}s entry handle`);
    }
    assert.deepEqual([d.points[0].time, d.points[0].price, d.points[1].price, d.points[2].price], [entryT, entry, entry + dir * 10, entry - dir * 5], 'stored data never changed by drawing');
  });
}

test('while candles are loading nothing is drawn (no sticking to the left edge)', () => {
  const m = mapperFor([], 60, 0).m;
  const d = makeDrawing('long', [{ time: END, price: 100 }], {});
  d.points = [{ time: END, price: 100 }, { time: END, price: 103 }, { time: END, price: 97 }, { time: END + 600, price: 100 }];
  assert.equal(TOOL_MAP.long.build(ctxFor(m, [], 60), d).length, 0);
});

test('placed by a click on 1m, the position stays on the same real time on 5m, 15m, 1h, 4h, 1D and 1W', () => {
  const sec1 = 60, d1 = bars(sec1, 300), m1 = mapperFor(d1, sec1, 5).m;
  const clickX = m1.timeToX(d1[200].time) + 2.2;           // a click between two 1m candles
  const entryT = m1.xToTime(clickX), want = d1[200].time + 2.2 / (m1.timeToX(d1[201].time) - m1.timeToX(d1[200].time)) * 60;
  assert.ok(Math.abs(entryT - want) < 1e-6, 'click converted to an exact time');
  const d = makeDrawing('long', [{ time: entryT, price: 100 }], {});
  TOOL_MAP.long.init(d, m1);
  d.points[1].price = 110; d.points[2].price = 95;
  for (const sec of [60, 300, 900, 3600, 14400, 86400, 604800]) {
    const data = bars(sec, 300), { m } = mapperFor(data, sec, 5);
    const c = ctxFor(m, data, sec);
    const r = TOOL_MAP.long.build(c, d).filter((p) => p.k === 'rect')[0].r;
    const t0 = m.xToTime(r.x), t1 = m.xToTime(r.x + r.w);
    assert.ok(Math.abs(t0 - entryT) < 1e-3, `${sec}s: left edge time (${t0} vs ${entryT})`);
    const wantRight = Math.max(d.points[3].time, entryT + (6 / Math.abs(m.timeToX(entryT + sec) - m.timeToX(entryT))) * sec);
    assert.ok(Math.abs(t1 - wantRight) < 1e-3 || r.w <= 6.0001, `${sec}s: right edge time`);
    assert.ok(r.x > 0 && r.x < 1800, `${sec}s: not stuck at the left edge (x=${r.x})`);
  }
});
