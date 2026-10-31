import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

test('long and short position tools use their dedicated high-resolution image assets', async () => {
  const source = await readFile(new URL('../src/js/drawings/ui/icons.js', import.meta.url), 'utf8');
  assert.match(source, /k === "long" \? "assets\/images\/long-position\.png" : "assets\/images\/short-position\.png"/);
  assert.match(source, /object-fit:contain/);
  for (const file of ['../assets/images/long-position.png', '../assets/images/short-position.png']) {
    const data = await readFile(new URL(file, import.meta.url));
    assert.equal(data.subarray(1, 4).toString(), 'PNG');
    assert.ok((await stat(new URL(file, import.meta.url))).size > 1000);
    assert.equal(data.readUInt32BE(16), 512);
    assert.equal(data.readUInt32BE(20), 512);
  }
});
