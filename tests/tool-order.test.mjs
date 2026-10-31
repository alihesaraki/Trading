import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const registry = await readFile(new URL('../src/js/drawings/runtime/registry.js', import.meta.url), 'utf8');

test('Lines group starts with Horizontal line and includes Rectangle', () => {
  assert.match(registry, /tools:\s*\[LINE_TOOLS\.find\(\(x\) => x\.type === "hline"\),/);
  assert.match(registry, /LINE_TOOLS\.filter\(\(x\) => x\.type !== "hline"\),\s*rect\]/);
  assert.match(registry, /icon: "hline"/);
  assert.match(registry, /SHAPE_TOOLS\.filter\(\(x\) => x\.type !== "rect"\)/);
});

test('Tools group starts with Long Position followed by Short Position', () => {
  assert.match(registry, /tools:\s*\[\.\.\.POSITION_TOOLS, \.\.\.FIB_TOOLS/);
});
