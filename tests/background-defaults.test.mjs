import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const background = await readFile(new URL('../src/js/app/chart/background.js', import.meta.url), 'utf8');
const chart = await readFile(new URL('../src/js/app/chart/chart.js', import.meta.url), 'utf8');

test('default chart background is #09101c and default grid opacity is 25%', () => {
  assert.match(background, /BG_DEFAULT\s*=\s*\{\s*bg:\s*'#09101c',\s*grid:\s*'#2a2e39',\s*gridOp:\s*25,/);
  assert.match(chart, /rgba\(42,46,57,\.25\)/);
});
