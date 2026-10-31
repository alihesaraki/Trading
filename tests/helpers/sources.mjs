import { readFile } from 'node:fs/promises';
import { bundles } from '../../scripts/manifest.mjs';

const root = new URL('../../', import.meta.url);

/** Read one source file by repo-relative path, e.g. 'src/js/app/chart/chart.js'. */
export const readSource = (path) => readFile(new URL(path, root), 'utf8');

/** Full stylesheet = every CSS partial concatenated in cascade order. */
export const readCss = async () =>
  (await Promise.all(bundles.styles.files.map((f) => readSource(bundles.styles.dir + f)))).join('');
