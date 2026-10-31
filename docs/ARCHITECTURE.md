# Architecture and data flow

## Runtime shape

`index.html` (inline loader) loads Lightweight Charts 4.2.0 (local copy in `assets/vendor/`, CDN fallbacks), then `dist/app.js`, `dist/indicators.js`, and `dist/drawings.js`. These are classic scripts rather than ES modules. The order and shared global scope are intentional compatibility constraints.

## Source ownership

Everything the browser runs is generated into `dist/` from `src/`. Each source folder has one responsibility:

- `src/js/app/core/`: bootstrap, shared state, time formatting, startup.
- `src/js/app/chart/`: chart creation, background, fit, cache, candle colours, palette, countdown, price scale, header.
- `src/js/app/data/`: candle updates, history (initial/older/sync), rollover, daily open, ticker and market-cap data, WebSocket, watchdog.
- `src/js/app/watchlist/`: watchlist core, sections, drag & drop, columns, panel.
- `src/js/app/ui/`: context menu, toolbar, replay, mobile navigation.
- `src/js/indicators/core/`: `kit.js` (helpers and registration) and `engine.js` (menu/settings, legend, series lifecycle, warm-up).
- `src/js/indicators/shared/`: calculation cores reused by several indicators (`ma-base`, `rsi-core`).
- `src/js/indicators/modules/`: one file per indicator (SMA, EMA, SMMA, RSI, DMI, HalfTrend, Volume).
- `src/js/drawings/core|tools|runtime|ui` and `index.js`: shared types/math/finance, tool families, store/coords/primitives/controller/registry, icons/panel UI, entry point. Assembled into one IIFE.
- `src/styles/`: the stylesheet split by section (tokens, base, topbar, chart-overlays, watchlist, menus, forms, color-picker, drawing-tools, responsive, replay, mobile).
- `scripts/`: `build.mjs` (bundler) and `manifest.mjs` (explicit file order for every bundle).
- `dist/`: generated bundles loaded by `index.html`. Never edit by hand.
- `assets/images/`: icons and images.

## Data and rendering flow

1. `index.html` loads the charting library and the generated browser assets in order.
2. Application fragments initialize chart state, chart series, history handling, watchlist behavior, and live market-data connections.
3. Indicator modules register calculations with the shared indicator kit; the engine manages their user interface and chart series.
4. Drawing tools translate stored anchors and chart context into drawing primitives. Coordinate helpers map between chart data and rendered positions, while the controller handles interaction and rendering.
5. Drawings are persisted in browser local storage using symbol-scoped keys (`dr:v1:<SYMBOL>`).

## Build contract

`scripts/manifest.mjs` is the single source of truth for what goes into each bundle **and in what order**. `scripts/build.mjs` reads it and writes `dist/app.js` and `dist/style.css` (fragments concatenated without wrappers), `dist/indicators.js` (kit + shared + modules + engine) and `dist/drawings.js` (fragments wrapped in one IIFE). Because order lives in the manifest, file names carry no numeric prefixes. **When you add a source file, you must add it to the manifest at the correct position**; unlisted files are not bundled. Keep global declarations stable unless the runtime contract is deliberately changed.

## Refactoring constraints

- Do not load source fragments individually in the browser.
- Do not reorder CSS partials in the manifest casually; cascade order may be behaviorally significant.
- Treat global variables and script order as public internal interfaces.
- Validate chart interaction, live candle updates, watchlist behavior, indicator calculations, drawing hit-testing, and persistence after behavior-affecting changes.


The price-scale controller in `src/js/app/chart/price-scale.js` uses the chart library's native `PriceScaleMode.Normal` and `PriceScaleMode.Logarithmic` modes. Drawing coordinate conversion remains delegated to series `priceToCoordinate` / `coordinateToPrice` APIs, so persisted drawing anchors are not rewritten during scale changes.
