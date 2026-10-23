import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../src/js/app/chart/fit.js', import.meta.url), 'utf8');

function bars(count, start = 1) {
  return Array.from({ length: count }, (_, i) => ({
    time: start + i * 60,
    open: 100 + i,
    high: 103 + i,
    low: 98 + i,
    close: 101 + i,
  }));
}

function harness({ count = 300, noMore = false, getJImpl = async () => [] } = {}) {
  const calls = [];
  const scaleCalls = [];
  const timeScaleOptions = [];
  const context = {
    data: bars(count, 10000), sym: 'BTCUSDT', tf: '1m', tok: 7, noMore,
    API: 'https://example.test', ctl: { signal: { aborted: false } },
    chart: {
      priceScale: () => ({ applyOptions: opts => scaleCalls.push(opts) }),
      timeScale: () => ({ setVisibleLogicalRange: range => calls.push({ ...range }), applyOptions: opts => timeScaleOptions.push(opts) }),
    },
    getJ: (...args) => getJImpl(...args),
    candle: row => ({ time: row[0] / 1000, open: +row[1], high: +row[2], low: +row[3], close: +row[4] }),
    validatePriceScaleForData() {},
    series: { setData: d => { context.seriesData = d; } },
    window: { IND: null },
    requestAnimationFrame() {},
    Math, Number, String, encodeURIComponent,
  };
  vm.runInNewContext(source, context, { filename: '05-chart-fit.js' });
  return { context, calls, scaleCalls, timeScaleOptions };
}

test('Reset Chart targets the latest 300 loaded bars plus the configured right margin', async () => {
  const h = harness({ count: 400 });
  await h.context.resetChartView();
  assert.deepEqual(h.calls.at(-1), { from: 100, to: 415 });
  assert.ok(h.scaleCalls.some(c => c.autoScale === true));
  assert.equal(h.scaleCalls.at(-1).scaleMargins.top, 0.15);
  assert.equal(h.scaleCalls.at(-1).scaleMargins.bottom, 0.15);
  assert.equal(h.timeScaleOptions.at(-1).rightOffset, 16);
});

test('Reset Chart measures margins from the top of RSI / DMI panes via IND.setMainMargins', async () => {
  const h = harness({ count: 400 });
  const got = [];
  h.context.window.IND = { setMainMargins: (t, b) => got.push([t, b]) };
  await h.context.resetChartView();
  assert.deepEqual(got.at(-1), [0.15, 0.15]);
  assert.ok(!h.scaleCalls.some(c => c.scaleMargins));
});

test('Reset Chart does not refetch or rebuild loaded data when 300 bars are available', async () => {
  let requests = 0;
  const h = harness({ count: 300, getJImpl: async () => { requests++; return []; } });
  await h.context.resetChartView();
  assert.equal(requests, 0);
  assert.equal(h.context.seriesData, undefined);
  assert.deepEqual(h.calls.at(-1), { from: 0, to: 315 });
});

test('Reset Chart uses all available bars when fewer than 300 exist and requests only the deficit', async () => {
  let requestedUrl = '';
  const olderRows = Array.from({ length: 6 }, (_, i) => [
    (1000 + i * 60) * 1000, '10', '12', '9', '11'
  ]);
  const h = harness({ count: 294, getJImpl: async url => { requestedUrl = url; return olderRows; } });
  await h.context.resetChartView();
  assert.match(requestedUrl, /limit=6(?:&|$)/);
  assert.equal(h.context.data.length, 300);
  assert.deepEqual(h.calls.at(-1), { from: 0, to: 315 });
  assert.equal(h.context.seriesData.length, 300);
});

test('repeated clicks coalesce an in-flight request for the same symbol/timeframe', async () => {
  let resolveRequest;
  let requests = 0;
  const h = harness({ count: 294, getJImpl: () => {
    requests++;
    return new Promise(resolve => { resolveRequest = resolve; });
  } });
  const first = h.context.resetChartView();
  const second = h.context.resetChartView();
  assert.equal(requests, 1);
  resolveRequest([]);
  await Promise.all([first, second]);
});

test('late history response is ignored after symbol or timeframe changes', async () => {
  let resolveRequest;
  const h = harness({ count: 294, getJImpl: () => new Promise(resolve => { resolveRequest = resolve; }) });
  const pending = h.context.resetChartView();
  h.context.sym = 'ETHUSDT';
  h.context.tok++;
  resolveRequest([[1_000_000, '10', '12', '9', '11']]);
  await pending;
  assert.equal(h.context.data.length, 294);
  assert.equal(h.context.seriesData, undefined);
});

test('reset implementation preserves scale mode and does not touch drawing or indicator state on fast path', async () => {
  const h = harness({ count: 300 });
  h.context.priceScaleMode = 'log';
  h.context.drawings = [{ id: 'keep' }];
  h.context.indicators = [{ id: 'keep' }];
  await h.context.resetChartView();
  assert.equal(h.context.priceScaleMode, 'log');
  assert.equal(h.context.drawings[0].id, 'keep');
  assert.equal(h.context.indicators[0].id, 'keep');
});
