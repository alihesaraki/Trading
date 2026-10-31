import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const src = await readFile(new URL('../src/js/app/chart/color-palette.js', import.meta.url), 'utf8');
const mod = new Function('window', 'document', 'navigator', src + '; return { colorPalette, ColorPalette };')(
  { isSecureContext: true }, { addEventListener() {} }, {},
);

test('palette is 8 x 8 = 64 unique-position colours, black to white on the first row', () => {
  const p = mod.colorPalette;
  assert.equal(p.length, 8);
  assert.ok(p.every((r) => r.length === 8));
  assert.equal(p.flat().length, 64);
  assert.equal(p[0][0], '#000000');
  assert.equal(p[0][7], '#FFFFFF');
});

test('component renders one swatch per colour (no visible HEX text)', () => {
  const html = mod.ColorPalette.html((c) => `data-x="${c}"`);
  assert.equal((html.match(/class="cp-sw"/g) || []).length, 64);
  assert.ok(!html.includes('class="cp-hex"'));
});
