import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readSource } from './helpers/sources.mjs';

const src = await readSource('src/js/app/chart/chart-type.js');
const mkEl = () => ({ hidden: true, innerHTML: '', style: {}, setAttribute() {}, contains: () => false, getBoundingClientRect: () => ({}) });

function harness(type = 'candles', bars = []) {
  const calls = { set: [], upd: [], alt: [] };
  const mkSeries = (name) => ({
    setData: d => calls.alt.push([name, 'set', d]), update: p => calls.alt.push([name, 'upd', p]), applyOptions() {},
    options: () => ({ priceFormat: { type: 'price', precision: 2, minMove: .01 } }),
  });
  const cfgBody = { on: true, up: '#089981', dn: '#F23645', upO: 100, dnO: 100 };
  const ctx = {
    store: { get: (k, d) => (k === 'chartType' ? type : d), set() {} },
    $: () => mkEl(), document: { addEventListener() {} }, addEventListener() {},
    LightweightCharts: { LineType: { WithSteps: 1 } },
    data: bars, clamp: (v, a, b) => Math.min(b, Math.max(a, v)),
    cUp: '#089981', cDn: '#F23645', cUpOpacity: 100, cDnOpacity: 100,
    rgbaC: (h, o) => `${h}@${o}`,
    window: { candleCfg: { prevClose: false, body: cfgBody, border: { ...cfgBody }, wick: { ...cfgBody } }, dispatchEvent() {}, IND: null },
    series: { setData: d => calls.set.push(d), update: p => calls.upd.push(p), applyOptions() {}, options: () => ({ priceFormat: {} }) },
    chart: {
      removeSeries() {}, timeScale: () => ({ getVisibleLogicalRange: () => null }),
      addLineSeries: () => mkSeries('line'), addAreaSeries: () => mkSeries('area'), addBarSeries: () => mkSeries('bar'),
      addBaselineSeries: () => mkSeries('baseline'), addHistogramSeries: () => mkSeries('hist'),
    },
    chartAlts: [], Event: class {},
  };
  ctx.window.document = ctx.document;
  vm.runInNewContext(src + '\n;this.api={ setBars, updateBar, restyleChart, setChartType, get type(){return chartType}, get haArr(){return haArr}, candlePoint, CHART_TYPES };', ctx);
  return { ctx, calls, api: ctx.api };
}
const bars = [
  { time: 1, open: 10, high: 12, low: 9, close: 11 },
  { time: 2, open: 11, high: 13, low: 10, close: 10.5 },
  { time: 3, open: 10.5, high: 14, low: 10, close: 13 },
];

test('chart type menu offers TradingView-style types including Heikin Ashi', () => {
  const { api } = harness();
  const ids = api.CHART_TYPES.map(t => t[0]);
  for (const id of ['bars', 'candles', 'hollow', 'line', 'linemk', 'step', 'area', 'hlcarea', 'baseline', 'columns', 'hilo', 'ha']) assert.ok(ids.includes(id), id);
});

test('Heikin Ashi converts candles with the standard formula', () => {
  const { ctx, calls, api } = harness('ha', bars);
  api.restyleChart();
  const out = calls.set.at(-1);
  assert.equal(out[0].close, (10 + 12 + 9 + 11) / 4);
  assert.equal(out[0].open, (10 + 11) / 2);
  const ha1open = (out[0].open + out[0].close) / 2;
  assert.equal(out[1].open, ha1open);
  assert.equal(out[1].close, (11 + 13 + 10 + 10.5) / 4);
  assert.equal(out[1].high, Math.max(13, ha1open, out[1].close));
});

test('Heikin Ashi live update recomputes only the forming candle from the previous HA candle', () => {
  const { ctx, calls, api } = harness('ha', bars.slice());
  api.restyleChart();
  const prevHa = api.haArr[1];
  const live = { time: 3, open: 10.5, high: 15, low: 10, close: 14 };
  ctx.data[2] = live;
  api.updateBar(live);
  const p = calls.upd.at(-1);
  assert.equal(p.open, (prevHa.open + prevHa.close) / 2);
  assert.equal(p.close, (10.5 + 15 + 10 + 14) / 4);
});

test('Hollow candles: rising candle is empty, falling candle is filled', () => {
  const { api } = harness('hollow', bars);
  const up = api.candlePoint(bars[2], bars[1], 2), dn = api.candlePoint(bars[1], bars[0], 1);
  assert.equal(up.color, 'rgba(0,0,0,0)');
  assert.equal(dn.color, '#F23645@100');
});

test('line-like types hide the candles and feed a helper series instead', () => {
  const { calls, api } = harness('line', bars);
  api.restyleChart();
  assert.ok(calls.set.at(-1).every(p => p.color === 'rgba(0,0,0,0)'));
  const alt = calls.alt.filter(c => c[0] === 'line' && c[1] === 'set').at(-1);
  assert.deepEqual(Array.from(alt[2], p => p.value), [11, 10.5, 13]); /* Array.from: the data comes from another vm realm */
});

test('setBars with an empty list clears candles and helper series', () => {
  const { calls, api } = harness('area', bars);
  api.restyleChart();
  api.setBars([]);
  assert.equal(calls.set.at(-1).length, 0);
  assert.equal(calls.alt.filter(c => c[0] === 'area' && c[1] === 'set').at(-1)[2].length, 0);
});

test('Settings window: Symbol + Canvas tabs live in one dialog; chart-type button sits beside Indicators', async () => {
  const html = await readSource('index.html');
  const candle = await readSource('src/js/app/chart/candle-colors.js');
  const bg = await readSource('src/js/app/chart/background.js');
  assert.match(html, /id="btnType"[\s\S]*?id="btnInd"/);
  assert.ok(!html.includes('id="bgset"'));
  assert.match(candle, /data-st-tab="symbol"/);
  assert.match(candle, /data-st-tab="canvas"/);
  assert.match(bg, /function renderCanvas/);
  assert.ok(!bg.includes("createElement('div')"), 'no second popup is created');
});
