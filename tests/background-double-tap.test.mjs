import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/js/app/chart/background.js', import.meta.url), 'utf8');

test('mobile double-tap on empty chart plot opens background settings', () => {
  assert.match(source, /addEventListener\('pointerup', e => \{[\s\S]*?e\.pointerType !== 'touch'/);
  assert.match(source, /matchMedia\('\(pointer: coarse\) and \(max-width: 820px\)'\)/);
  assert.match(source, /now - last\.time <= 380/);
  assert.match(source, /Math\.hypot\(e\.clientX - last\.x, e\.clientY - last\.y\) <= 28/);
  assert.match(source, /openBgSet\(\);/);
});

test('background double-tap ignores candle taps, chart axes, and overlay controls', () => {
  assert.match(source, /candleAt\(e\)/);
  assert.match(source, /plotRight = rect\.width - chart\.priceScale\('right'\)\.width\(\)/);
  assert.match(source, /plotBottom = rect\.height - chart\.timeScale\(\)\.height\(\)/);
  assert.match(source, /#lg,#iset,#pop,#tl/);
});
