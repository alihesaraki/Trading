import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../src/js/app/chart/chart.js', import.meta.url), 'utf8');
const constants = source.match(/const FUTURE_YEARS = 3;[\s\S]*?const fut = chart\.addLineSeries\([\s\S]*?\);/);
const functionSource = source.match(/function futTimes\(last\) \{[\s\S]*?\n\}/);
assert.ok(constants, 'future axis constants exist');
assert.ok(functionSource, 'future axis generator exists');

function futureTimes(timeframe, last = Date.UTC(2026, 0, 1) / 1000) {
  const context = {
    tf: timeframe,
    TFMS: { '1m': 60_000, '5m': 300_000, '15m': 900_000, '1h': 3_600_000, '4h': 14_400_000, '1d': 86_400_000, '1w': 604_800_000, '1M': 2_678_400_000 },
    chart: { addLineSeries: () => ({}) },
    Date,
  };
  vm.runInNewContext(`${constants[0]}\n${functionSource[0]}\nthis.result = futTimes(${last});`, context);
  return context.result;
}

test('all timeframes extend the time axis approximately three years into the future', () => {
  const last = Date.UTC(2026, 0, 1) / 1000;
  const horizon = 3 * 365 * 24 * 60 * 60;
  for (const tf of ['1m', '5m', '15m', '1h', '4h', '1d', '1w', '1M']) {
    const points = futureTimes(tf, last);
    assert.ok(points.length > 0, `${tf} has future points`);
    assert.ok(points.at(-1).time <= last + horizon, `${tf} does not exceed the three-year horizon`);
    assert.ok(points.at(-1).time >= last + horizon - (tf === '1M' ? 32 * 86400 : tf === '1w' ? 7 * 86400 : 86400), `${tf} reaches close to three years`);
    for (let i = 1; i < points.length; i++) assert.ok(points[i].time > points[i - 1].time, `${tf} points are ordered`);
  }
});

test('intraday axis has timeframe-aligned slots in the next 48 hours and sparse anchors farther out', () => {
  const last = Date.UTC(2026, 0, 1) / 1000;
  for (const [tf, interval] of [['1m', 60], ['5m', 300], ['15m', 900], ['1h', 3600], ['4h', 14400]]) {
    const points = futureTimes(tf, last);
    const near = points.filter(p => p.time <= last + 48 * 3600);
    assert.ok(near.length >= Math.floor(48 * 3600 / interval) - 1, `${tf} has near-future slots at its timeframe`);
    assert.ok(points.length < 5000, `${tf} remains responsive`);
  }
});
