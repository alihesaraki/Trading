import test from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from './helpers/sources.mjs';

test('Favorites tab sits right after All', async () => {
  const html = await readSource('index.html');
  assert.match(html, /<button data-f="" class="on">All<\/button><button data-f="fav" class="fv"/);
});

test('right-click menu: Add section first, favorite second', async () => {
  const src = await readSource('src/js/app/watchlist/sections.js');
  assert.match(src, /\[\['Add section'.*\.\.\.\(r \? \[\[favs\[r\.dataset\.s\] \? 'Remove from favorite' : 'Add to favorite'/s);
  assert.match(src, /flt === 'fav' \? !!favs\[s\.s\]/);
});


test('blue flag filter is replaced by star selection in the flag picker', async () => {
  const html = await readSource('index.html');
  const core = await readSource('src/js/app/watchlist/core.js');
  assert.doesNotMatch(html, /data-f="b"|Blue flags/);
  assert.match(core, /\['r', 'Red'\], \['g', 'Green'\]/);
  assert.match(core, /class="sw star[\s\S]*data-c="fav"/);
  assert.match(core, /if \(b\.dataset\.c === 'fav'\) toggleFav\(k\)/);
  assert.match(core, /Legacy blue flags become favorites/);
});

test('remove control is hidden until row hover or keyboard focus', async () => {
  const css = await readSource('src/styles/watchlist.css');
  assert.match(css, /\.row-remove[\s\S]*opacity: 0;[\s\S]*pointer-events: none;/);
  assert.match(css, /\.row:hover \.row-remove,[\s\S]*\.row-remove:focus-visible[\s\S]*opacity: 1;[\s\S]*pointer-events: auto;/);
});
