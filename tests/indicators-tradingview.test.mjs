import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readSource } from './helpers/sources.mjs';

const files = ['core/kit.js', 'shared/ma-base.js', 'shared/rsi-core.js', 'modules/sma.js', 'modules/ema.js', 'modules/volume.js', 'modules/dmi.js', 'modules/halftrend.js'];
const code = (await Promise.all(files.map(f => readSource('src/js/indicators/' + f)))).join('\n');
const mkS = () => ({ applyOptions() {}, setData() {}, update() {}, attachPrimitive() {} });
const ctx = {
  chart: { addLineSeries: mkS, addHistogramSeries: mkS }, $: () => ({ appendChild() {} }), document: { createElement: () => ({}) },
  map: {}, sym: 'X', tf: '1d', TFMS: { '1d': 864e5 }, cUp: '#089981', cDn: '#F23645',
};
vm.runInNewContext(code + '\n;this.out={INDREG,INDKIT};', ctx);
const { INDREG } = ctx.out;
const bars = Array.from({ length: 30 }, (_, i) => ({ time: 86400 * (i + 1), open: i + 1, high: i + 2, low: i, close: i + 1.5, v: 100 + i }));
const vals = a => Array.from(a, p => p.value);

test('SMA offset shifts the line by N candles (positive = into the future)', () => {
  const m = INDREG.get('sma'), p = { ...m.defaults, len: 3, off: 2 };
  const [line] = m.calc(bars, p, {});
  const plain = m.calc(bars, { ...p, off: 0 }, {})[0];
  assert.equal(line.length, plain.length);
  assert.equal(line[0].time, plain[0].time + 2 * 86400);
  assert.deepEqual(vals(line), vals(plain));
  assert.equal(m.tail(bars, p, {}), null, 'offset forces the full-calc path');
});

test('negative offset moves the line back and drops points before the first candle', () => {
  const m = INDREG.get('sma'), p = { ...m.defaults, len: 3, off: -3 };
  const [line] = m.calc(bars, p, {}), plain = m.calc(bars, { ...p, off: 0 }, {})[0];
  /* the first SMA(3) point sits on candle #3 (index 2); shifted back 3 candles it falls before the data and is dropped */
  assert.equal(line.length, plain.length - 1);
  assert.equal(line[0].time, bars[0].time);
  assert.equal(line[0].value, plain[1].value);
});

test('MA smoothing line (TradingView "Smoothing") is an SMA of the MA', () => {
  const m = INDREG.get('ema'), p = { ...m.defaults, len: 5, smType: 'SMA', smLen: 3 };
  const [ma, sm] = m.calc(bars, p, {});
  assert.equal(sm.length, ma.length - 2);
  const k = sm.length - 1;
  assert.ok(Math.abs(sm[k].value - (ma[ma.length - 1].value + ma[ma.length - 2].value + ma[ma.length - 3].value) / 3) < 1e-9);
  assert.equal(INDREG.get('ema').calc(bars, { ...p, smType: 'None' }, {})[1].length, 0);
});

test('Volume: MA line and "color based on previous close"', () => {
  const m = INDREG.get('volume'), p = { ...m.defaults, showMA: true, maLen: 5 };
  const [hist, ma] = m.calc(bars, p);
  assert.equal(hist.length, bars.length);
  assert.equal(ma.length, bars.length - 4);
  assert.equal(ma[0].value, (100 + 101 + 102 + 103 + 104) / 5);
  const falling = [{ time: 1, open: 10, high: 11, low: 9, close: 10, v: 1 }, { time: 2, open: 8, high: 9, low: 7, close: 9, v: 1 }];
  const byOpen = m.calc(falling, { ...m.defaults, pc: false }), byPrev = m.calc(falling, { ...m.defaults, pc: true });
  assert.ok(byOpen[0][1].color.startsWith('rgba(8,153,129'), 'close 9 > open 8: rising');
  assert.ok(byPrev[0][1].color.startsWith('rgba(242,54,69'), 'close 9 < previous close 10: falling');
  assert.equal(m.defaults.op, 50);
});

test('DMI uses TradingView colours (+DI blue, -DI orange, ADX red) and HalfTrend shows arrows + channels by default', () => {
  const d = INDREG.get('dmi').defaults;
  assert.deepEqual([d.cp, d.cm, d.ca], ['#2962FF', '#FF6D00', '#F23645']);
  const h = INDREG.get('halftrend').defaults;
  assert.equal(h.ar, true); assert.equal(h.ch, true);
});

test('settings fields are split into TradingView tabs: calculation on Inputs, colours / plots on Style', () => {
  const { INDKIT } = ctx.out, tab = INDKIT.tabOf;
  const f = INDREG.get('sma').fields.reduce((o, x) => ((o[tab(x)] ||= []).push(x.k), o), {});
  assert.deepEqual(Array.from(f.inputs), ['len', 'src', 'off', 'smType', 'smLen']);
  assert.ok(f.style.includes('color') && f.style.includes('w') && f.style.includes('lineStyle'));
});
