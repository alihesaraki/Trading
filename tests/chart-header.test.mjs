import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readSource, readCss } from './helpers/sources.mjs';

const src = await readSource('src/js/app/chart/header.js');
const settings = await readSource('src/js/app/chart/candle-colors.js');

function harness({ saved, bars, type = 'candles', prevClose = false } = {}) {
  const els = {};
  const el = id => els[id] || (els[id] = { hidden: false, innerHTML: '', textContent: '', offsetTop: 8, offsetHeight: 18, style: { setProperty(k, v) { this[k] = v; } }, classList: { toggle(c, on) { this[c] = on; } } });
  let cross = null;
  const ctx = {
    store: { get: (k, d) => (k === 'hdr' ? saved : d), set(k, v) { ctx.saved = v; } },
    $: el, data: bars, map: { BTCUSDT: { dec: 2, o: 1, p: 1 } }, sym: 'BTCUSDT', tf: '1d', TFS: { '1D': '1d' },
    chartType: type, haArr: [], typeKind: () => 'candle', lineCfg: { color: '#2962FF' }, cUp: '#089981', cDn: '#F23645',
    window: { candleCfg: { prevClose } }, chart: { subscribeCrosshairMove: f => { cross = f; } }, addEventListener() {},
    requestAnimationFrame: f => { f(); return 0; }, document: { title: '' }, fmt: () => '1', Math, String, Object, Number,
  };
  vm.createContext(ctx);
  vm.runInContext(src.replace(/^const /gm, 'var ').replace(/^let /gm, 'var '), ctx);
  return { ctx, els, el, cross: p => cross(p) };
}
const bars = [
  { time: 1, open: 100, high: 110, low: 90, close: 105 },
  { time: 2, open: 105, high: 120, low: 100, close: 99 },
  { time: 3, open: 99, high: 1234.5, low: 95, close: 1200 },
];

test('defaults: symbol name + chart value on, bar change off', () => {
  const h = harness({ bars });
  assert.deepEqual({ ...h.ctx.headerCfg }, { name: true, values: true, change: false });
  h.ctx.headerValues();
  assert.match(h.el('hv').innerHTML, /O<\/span><span class="hv-v">99\.00/);
  assert.match(h.el('hv').innerHTML, /1,234\.50/);
  assert.doesNotMatch(h.el('hv').innerHTML, /hv-chg/);
  assert.equal(h.el('ttl').hidden, false);
});

test('crosshair selects the candle; leaving the chart returns to the latest candle', () => {
  const h = harness({ bars });
  h.cross({ point: { x: 1, y: 1 }, time: 1 });
  assert.match(h.el('hv').innerHTML, /105\.00/);
  assert.match(h.el('hv').innerHTML, /color:#089981/);
  h.cross({ time: undefined });
  assert.match(h.el('hv').innerHTML, /1,200\.00/);
  h.cross({ point: { x: 1, y: 1 }, time: 99 }); /* empty future area -> latest candle */
  assert.match(h.el('hv').innerHTML, /1,200\.00/);
});

test('bar change = close vs previous close, with minus sign and percent; hidden on the first candle', () => {
  const h = harness({ bars, saved: { change: true } });
  h.cross({ point: { x: 1, y: 1 }, time: 2 });
  assert.match(h.el('hv').innerHTML, /−6\.00 \(−5\.71%\)/);
  assert.match(h.el('hv').innerHTML, /color:#F23645/);
  h.cross({ point: { x: 1, y: 1 }, time: 1 });
  assert.doesNotMatch(h.el('hv').innerHTML, /hv-chg/);
});

test('toggles are independent and the whole header hides when everything is off', () => {
  const h = harness({ bars, saved: { name: false, values: false, change: true } });
  h.ctx.headerValues();
  assert.equal(h.el('ttl').hidden, true);
  assert.doesNotMatch(h.el('hv').innerHTML, /hv-l/);
  assert.match(h.el('hv').innerHTML, /hv-chg/);
  h.ctx.setHeaderOpt('change', false);
  assert.equal(h.el('tl').hidden, true);
  assert.equal(h.el('cw').classList['hdr-off'], true);
  assert.equal(h.ctx.saved.change, false);
  h.ctx.resetHeaderCfg();
  assert.deepEqual({ ...h.ctx.headerCfg }, { name: true, values: true, change: false });
});

test('line-like chart types only report the close', () => {
  const h = harness({ bars, type: 'area' });
  h.ctx.headerValues();
  assert.equal((h.el('hv').innerHTML.match(/hv-l/g) || []).length, 1);
});

test('Settings -> Symbol tab exposes the three Status line toggles; header wiring is in place', async () => {
  assert.match(settings, /STATUS LINE/);
  for (const k of ['name', 'values', 'change']) assert.match(settings, new RegExp(`\\['${k}', '`));
  assert.match(settings, /data-st-hdr/);
  assert.match(settings, /resetHeaderCfg\(\)/);
  assert.match(await readSource('index.html'), /<span id="hv" hidden>/);
  assert.match(await readCss(), /top: var\(--lg-top, 28px\)/);
});
