import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readCss } from './helpers/sources.mjs';

const [html, css, toolbar, indicatorEngine] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readCss(),
  readFile(new URL('../src/js/app/ui/toolbar.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/js/indicators/core/engine.js', import.meta.url), 'utf8'),
]);

test('mobile viewport supports safe areas without disabling user zoom', () => {
  assert.match(html, /name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/);
  assert.doesNotMatch(html, /user-scalable\s*=\s*no|maximum-scale\s*=\s*1/i);
  assert.match(css, /--safe-top:\s*env\(safe-area-inset-top/);
  assert.match(css, /--safe-left:\s*env\(safe-area-inset-left/);
});

test('mobile timeframe controls use a shrinkable horizontal scroller and touch-sized targets', () => {
  assert.match(html, /id="tfs" role="group" aria-label="Chart timeframe"/);
  assert.match(css, /#tfs\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?overflow-x:\s*auto;/);
  assert.match(css, /#tfs button\s*\{[\s\S]*?min-height:\s*40px;/);
  assert.match(toolbar, /scrollIntoView\(\{ block: 'nearest', inline: 'nearest', behavior: 'auto' \}\)/);
});

test('mobile dropdowns and settings panels are bounded and scroll internally', () => {
  assert.match(css, /#imenu\s*\{[\s\S]*?max-height:[\s\S]*?overflow-y:\s*auto;/);
  assert.match(css, /#pop,\s*#bgset\s*\{[\s\S]*?max-height:[\s\S]*?overflow:\s*auto;/);
  assert.match(indicatorEngine, /main\.clientWidth - width - 8 - safeRight/);
  assert.match(indicatorEngine, /b\.top - m\.top - height - 3/);
});

test('responsive rules cover narrow phones, landscape, tablet and desktop widths', () => {
  assert.match(css, /@media \(max-width: 380px\)/);
  assert.match(css, /@media \(max-height: 450px\) and \(max-width: 820px\)/);
  assert.match(css, /@media \(max-width: 820px\)/);
});

test('desktop Indicators button sits directly beside timeframe controls while mobile layout stays separate', () => {
  assert.match(css, /@media \(min-width: 821px\)\s*\{[\s\S]*?#tfs\s*\{[\s\S]*?flex:\s*0 1 auto;[\s\S]*?width:\s*max-content;[\s\S]*?\}\s*#btnInd\s*\{[\s\S]*?margin-left:\s*0;/);
  assert.match(css, /@media \(max-width: 820px\)[\s\S]*?#btnInd\s*\{[\s\S]*?min-width:\s*44px;/);
});
