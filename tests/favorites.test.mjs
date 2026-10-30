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
