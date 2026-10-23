import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { bundles } from './manifest.mjs';

/*
 * Browser entry files stay classic scripts (file:// friendly, shared globals).
 * Sources are small ordered fragments concatenated per scripts/manifest.mjs.
 * Join strategy per bundle is intentional and preserves the original output:
 *   app / styles  -> joined with ''     (fragments are not wrapped)
 *   indicators    -> joined with '\\n'
 *   drawings      -> joined with '\\n' and wrapped in one strict-mode IIFE
 */
const root = new URL('../', import.meta.url);
const read = (dir, file) => readFile(new URL(dir + file, root), 'utf8');
const assemble = async ({ dir, files }) => Promise.all(files.map((file) => read(dir, file)));

await mkdir(new URL('dist/', root), { recursive: true });

const write = (bundle, text) => writeFile(new URL(bundle.out, root), text);

await write(bundles.app, (await assemble(bundles.app)).join(''));
await write(bundles.indicators, (await assemble(bundles.indicators)).join('\n'));
await write(bundles.styles, (await assemble(bundles.styles)).join(''));
await write(
  bundles.drawings,
  '"use strict";\n(() => {\n' + (await assemble(bundles.drawings)).join('\n') + '})();\n',
);
