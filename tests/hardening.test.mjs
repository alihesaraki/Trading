import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bundles } from '../scripts/manifest.mjs';
import { readSource, readCss } from './helpers/sources.mjs';

const sha = (algorithm, content) => createHash(algorithm).update(content).digest('base64');

async function listFiles(dir, extension) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await listFiles(path, extension)));
    else if (entry.name.endsWith(extension)) found.push(path);
  }
  return found;
}

test('index.html: CSP hashes match the inline scripts and restrict connections to the known hosts', async () => {
  const html = await readSource('index.html');
  const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)?.[1];
  assert.ok(csp, 'CSP meta tag is missing');
  const inlineScripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.equal(inlineScripts.length, 2);
  for (const script of inlineScripts) {
    assert.ok(csp.includes(`'sha256-${sha('sha256', script)}'`), 'inline script changed: regenerate its sha256 in the CSP meta tag');
  }
  assert.match(csp, /connect-src 'self' https:\/\/fapi\.binance\.com wss:\/\/fstream\.binance\.com https:\/\/api\.coingecko\.com/);
  assert.match(csp, /object-src 'none'/);
  assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/);
});

test('index.html: integrity hash equals the vendored Lightweight Charts file', async () => {
  const html = await readSource('index.html');
  const integrity = /LIB_INTEGRITY = '(sha384-[^']+)'/.exec(html)?.[1];
  const vendored = await readFile(new URL('../assets/vendor/lightweight-charts.standalone.production.js', import.meta.url));
  assert.equal(integrity, `sha384-${sha('sha384', vendored)}`);
});

test('manifest lists every source file (an unlisted file is never bundled)', async () => {
  const bundleSpecs = [...Object.values(bundles)];
  for (const spec of bundleSpecs) {
    const extension = spec.out.endsWith('.css') ? '.css' : '.js';
    const onDisk = (await listFiles(spec.dir, extension)).map((p) => p.slice(spec.dir.length).replaceAll('\\', '/'));
    assert.deepEqual([...onDisk].sort(), [...spec.files].sort(), `${spec.dir} differs from the manifest`);
  }
});

test('no empty catch blocks: failures are logged through log.warn or explained in a comment', async () => {
  const emptyCatch = /catch\s*(\(\s*\w*\s*\))?\s*\{\s*\}/;
  for (const file of await listFiles('src/js', '.js')) {
    assert.doesNotMatch(await readFile(file, 'utf8'), emptyCatch, `${file} has an empty catch block`);
  }
});

test('exchange symbols: markup characters are rejected on ingest and escaped in the watchlist row', async () => {
  const tickerSource = await readSource('src/js/app/data/ticker-data.js');
  const unsafeChars = new Function(`${/const UNSAFE_SYMBOL_CHARS = .*;/.exec(tickerSource)[0]}; return UNSAFE_SYMBOL_CHARS;`)();
  for (const bad of ['A"BUSDT', 'A<b>USDT', "A'BUSDT", 'A&BUSDT', 'A BUSDT', 'A`BUSDT']) assert.ok(unsafeChars.test(bad), bad);
  for (const good of ['BTCUSDT', '1000PEPEUSDT', '币安人生USDT']) assert.ok(!unsafeChars.test(good), good);

  const sections = await readSource('src/js/app/watchlist/sections.js');
  assert.match(sections, /data-s="\$\{esc\(s\.s\)\}"/);
  assert.match(sections, /\$\{esc\(coinName\(s\.b\)\)\}/);
});

test('watchlist rows are keyboard reachable and reduced motion is respected', async () => {
  const sections = await readSource('src/js/app/watchlist/sections.js');
  assert.match(sections, /role="button" tabindex="0"/);
  assert.match(sections, /e\.key === 'ArrowDown'/);
  assert.match(await readCss(), /@media \(prefers-reduced-motion: reduce\)/);
});
