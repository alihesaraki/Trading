import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readCss } from './helpers/sources.mjs';

const [html, css, nav] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readCss(),
  readFile(new URL('../src/js/app/ui/mobile-nav.js', import.meta.url), 'utf8'),
]);

test('mobile tab bar separates chart and watchlist', () => {
  assert.match(html, /id="mnav"/);
  assert.match(html, /data-view="watch"[\s\S]*data-view="chart"[\s\S]*data-view="draw"/);
  assert.match(css, /body\.mview-watch #main\s*\{\s*visibility:\s*hidden;/);
  assert.match(nav, /classList\.toggle\('mview-watch'/);
});

test('mobile layout covers portrait and landscape phones', () => {
  assert.match(css, /@media \(max-width: 820px\), \(pointer: coarse\) and \(max-height: 500px\)/);
  assert.match(css, /orientation: landscape/);
  assert.match(css, /theme-color|env\(safe-area-inset-bottom/);
});
