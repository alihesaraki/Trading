import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../src/js/app/chart/price-scale.js', import.meta.url), 'utf8');

function harness({ savedMode = 'linear', bars = [] } = {}) {
  const applied = [];
  const stored = new Map([['tview-price-scale-mode', savedMode]]);
  const buttons = ['linear', 'log'].map(mode => ({
    dataset: { priceScale: mode },
    classList: { toggle() {} },
    attrs: {},
    setAttribute(k, v) { this.attrs[k] = v; }
  }));
  const scaleModes = {
    handlers: {},
    querySelectorAll: () => buttons,
    addEventListener(type, fn) { this.handlers[type] = fn; }
  };
  const warning = { hidden: true, textContent: '' };
  const listeners = {};
  const context = {
    LightweightCharts: { PriceScaleMode: { Normal: 0, Logarithmic: 1 } },
    store: {
      get(key, fallback) { return stored.has(key) ? stored.get(key) : fallback; },
      set(key, value) { stored.set(key, value); }
    },
    data: bars,
    chart: { priceScale: () => ({ applyOptions: opts => applied.push(opts) }) },
    $: id => id === 'scaleModes' ? scaleModes : warning,
    document: { addEventListener(type, fn, capture) { listeners[type] = { fn, capture }; } },
    setTimeout: () => 1,
    clearTimeout() {},
    String,
    Number,
    Math
  };
  vm.runInNewContext(source, context, { filename: '14-price-scale.js' });
  return { context, applied, stored, buttons, scaleModes, warning, listeners };
}

const positive = [{ open: 10, high: 12, low: 9, close: 11 }];

test('defaults to native linear mode and exposes REG as active', () => {
  const h = harness();
  assert.equal(h.applied.at(-1).mode, 0);
  assert.equal(h.buttons[0].attrs['aria-pressed'], 'true');
  assert.equal(h.buttons[1].attrs['aria-pressed'], 'false');
});

test('toolbar switches to logarithmic mode and persists it', () => {
  const h = harness({ bars: positive });
  h.scaleModes.handlers.click({ target: { closest: () => ({ dataset: { priceScale: 'log' } }) } });
  assert.equal(h.applied.at(-1).mode, 1);
  assert.equal(h.stored.get('tview-price-scale-mode'), 'log');
  assert.equal(h.buttons[1].attrs['aria-pressed'], 'true');
});

test('clicking the already active mode is stable and predictable', () => {
  const h = harness({ savedMode: 'log', bars: positive });
  const count = h.applied.length;
  h.scaleModes.handlers.click({ target: { closest: () => ({ dataset: { priceScale: 'log' } }) } });
  assert.equal(h.applied.length, count + 1);
  assert.equal(h.applied.at(-1).mode, 1);
});

test('log mode is rejected for non-positive or invalid OHLC values', () => {
  const h = harness({ bars: [{ open: 10, high: 12, low: 0, close: 11 }] });
  const count = h.applied.length;
  h.scaleModes.handlers.click({ target: { closest: () => ({ dataset: { priceScale: 'log' } }) } });
  assert.equal(h.applied.length, count);
  assert.match(h.warning.textContent, /requires positive OHLC prices/i);
});

test('saved log mode restores, then invalid loaded data falls back to linear', () => {
  const h = harness({ savedMode: 'log', bars: positive });
  assert.equal(h.applied.at(-1).mode, 1);
  h.context.data = [{ open: -1, high: 2, low: -2, close: 1 }];
  h.context.validatePriceScaleForData();
  assert.equal(h.applied.at(-1).mode, 0);
  assert.equal(h.stored.get('tview-price-scale-mode'), 'linear');
  assert.match(h.warning.textContent, /switched off/i);
});

test('Alt+L toggles scale and prevents propagation to drawing shortcuts', () => {
  const h = harness({ bars: positive });
  let prevented = false, stopped = false;
  h.listeners.keydown.fn({ target: {}, repeat: false, altKey: true, ctrlKey: false, metaKey: false, shiftKey: false, code: 'KeyL', preventDefault() { prevented = true; }, stopImmediatePropagation() { stopped = true; } });
  assert.equal(h.applied.at(-1).mode, 1);
  assert.equal(prevented, true);
  assert.equal(stopped, true);
});

test('Alt+L is ignored while typing', () => {
  const h = harness({ bars: positive });
  let prevented = false;
  h.listeners.keydown.fn({ target: { isContentEditable: false, closest: () => ({}) }, repeat: false, altKey: true, ctrlKey: false, metaKey: false, shiftKey: false, code: 'KeyL', preventDefault() { prevented = true; }, stopImmediatePropagation() {} });
  assert.equal(h.applied.at(-1).mode, 0);
  assert.equal(prevented, false);
});

test('logarithmic equal-percentage intervals have equal log-space distances', () => {
  const d1 = Math.log(110) - Math.log(100);
  const d2 = Math.log(220) - Math.log(200);
  assert.ok(Math.abs(d1 - d2) < 1e-12);
});

test('Long Position keeps its reassigned non-conflicting shortcut', async () => {
  const positionSource = await readFile(new URL('../src/js/drawings/tools/position.js', import.meta.url), 'utf8');
  assert.match(positionSource, /hotkey:\s*side\s*===\s*"long"\s*\?\s*"Ctrl\+Alt\+Shift\+L"/);
});
