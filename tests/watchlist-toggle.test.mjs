import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readCss } from './helpers/sources.mjs';

const [html, css, panel] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readCss(),
  readFile(new URL('../src/js/app/watchlist/panel.js', import.meta.url), 'utf8'),
]);

test('watchlist has a top-bar toggle with accessible collapsed state', () => {
  assert.match(html, /id="btnWatch"/);
  assert.match(panel, /store\.get\('watchlistHidden', false\)/);
  assert.match(panel, /store\.set\('watchlistHidden', watchHidden\)/);
  assert.match(panel, /watchToggle\.addEventListener\('click'/);
});

test('watchlist can be fully hidden and restored, and phones switch pages with the bottom tab bar', () => {
  assert.match(css, /body\.watchlist-hidden #side\s*\{\s*display:\s*none !important;/);
  assert.match(css, /body\.mview-watch #side\s*\{\s*visibility:\s*visible;/);
  assert.match(panel, /classList\.toggle\('watchlist-hidden', watchHidden\)/);
});
