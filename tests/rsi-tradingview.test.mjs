import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readCss } from './helpers/sources.mjs';
const rsi = await readFile(new URL('../src/js/indicators/modules/rsi.js', import.meta.url), 'utf8');
const engine = await readFile(new URL('../src/js/indicators/core/engine.js', import.meta.url), 'utf8');
const css = await readCss();
test('RSI is styled like TradingView/Binance: purple 1px line, dashed grey 70/50/30 levels, shaded band', () => {
  assert.match(rsi, /name: 'RSI', shortName: 'RSI'/);
  assert.match(rsi, /color: '#7E57C2', w: 1/);
  assert.match(rsi, /\[p\.ob, 'ob'\].*\[p\.mid, 'mid'\].*\[p\.os, 'os'\]/s);
  assert.match(rsi, /lineStyle: 2/);
  assert.match(rsi, /olb-level/);
  assert.match(rsi, /addBaselineSeries/);
  assert.doesNotMatch(rsi, /addAreaSeries/);
  assert.match(rsi, /baseValue: \{ type: 'price', price: Number\(p\.os\) \}/);
  assert.match(rsi, /RSI_CORE\.calculate/);
  assert.doesNotMatch(css, /rsi-level-labels/);
});
test('RSI scale fits the data but keeps the levels visible, and updates the live candle in O(1)', () => {
  assert.match(rsi, /autoscaleInfoProvider: base =>/);
  assert.match(rsi, /tail\(d, p, ind\)/);
  assert.match(rsi, /RSI_CORE\.tail/);
});
test('RSI has no opaque underlay (only the 30-70 band is shaded) and cleans up its series', () => {
  assert.doesNotMatch(rsi, /maskS/);
  assert.match(rsi, /chart\.removeSeries\(ind\.fillS\)/);
});
test('crosshair label shows the oscillator value inside its pane', () => {
  assert.match(engine, /labelVisible: false/);
  assert.match(engine, /os \? os\.s\[0\]\.coordinateToPrice/);
});
test('oscillator pane height is persisted and can be dragged to resize', () => {
  assert.match(engine, /store\.get\('rsiPaneHeight', 22\)/);
  assert.match(engine, /store\.set\('rsiPaneHeight', height\)/);
  assert.match(engine, /class="osc-resize"/);
  assert.match(css, /\.osc-resize[\s\S]*cursor: row-resize/);
  assert.match(css, /touch-action: none/);
});
test('main price axis is covered inside oscillator panes', () => {
  assert.match(engine, /axMask/);
  assert.match(css, /\.axmask/);
});

test('RSI supports smoothing, gradient fills and divergence without Bollinger Bands (no alerts)', () => {
  assert.match(rsi, /maType: 'SMA', maLen: 14, div: false/);
  assert.doesNotMatch(rsi, /Show Bollinger Bands|Bollinger line style|bbMult|bbColor/);
  assert.match(rsi, /attachPrimitive/);
  assert.match(rsi, /gradient\(c, W, poly, s, 100, Number\(p\.ob\)/);
  assert.match(rsi, /gradient\(c, W, poly, s, Number\(p\.os\), 0/);
  assert.match(rsi, /'Bull'/);
  assert.match(rsi, /'Bear'/);
  assert.doesNotMatch(rsi, /alertcondition|alert\(/i);
});
