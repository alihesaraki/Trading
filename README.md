# Trading Chart

A Trading-style market chart UI for **Binance USDT-M Futures**, written in plain browser JavaScript (no framework, no runtime bundler, no ES modules). It combines a candlestick chart, a watchlist, technical indicators, drawing tools, bar replay and a mobile layout in one page.

> **If you are an AI assistant (or a new developer) reading this file:** sections 2, 5 and 9 contain the rules that matter most. The project is built by *concatenating ordered source fragments into global-scope classic scripts*. It is **not** a module-based app, so normal assumptions about `import`/`export` do not apply. Read section 2 first.

---

## 1. What the app does

- Candlestick chart via **Lightweight Charts 4.2.0** (loaded from the jsDelivr CDN).
- Live data from Binance Futures: REST (`https://fapi.binance.com`) for history and 24h tickers, WebSocket (`wss://fstream.binance.com/stream`) for live prices and the forming candle. Market-cap ranking comes from CoinGecko.
- Timeframes: `1m 5m 15m 1h 4h 1D 1W 1M`. Initial history load, older history on scroll-left, gap catch-up after disconnects, instant candle rollover.
- Watchlist: search, green/red flag filter, sections, drag & drop ordering, resizable columns, resizable panel that can be moved to the other side.
- Indicators: SMA, EMA, SMMA, RSI (TradingView-accurate), DMI/ADX, HalfTrend, Volume.
- Drawing tools: lines, Fibonacci, shapes/brush, annotations, long/short position, measure, fixed-range volume profile; undo/redo; stored per symbol.
- Bar Replay (TradingView style), linear/log price scale, candle colour and background settings, context menu, keyboard shortcuts.
- Mobile layout: bottom tab bar (Watchlist / Chart / Draw), landscape rail, safe-area handling.
- Chart time zone is **Asia/Tehran** (`src/js/app/core/time-format.js`).

---

## 2. The one thing you must understand

The browser loads **four generated files from `dist/`**. They are produced by concatenating many small source files from `src/` in an order declared in `scripts/manifest.mjs`.

```
src/js/app/**         ──►  dist/app.js          (concatenated, no wrapper)
src/js/indicators/**  ──►  dist/indicators.js   (concatenated, joined with "\n")
src/js/drawings/**    ──►  dist/drawings.js     (concatenated, wrapped in one "use strict" IIFE)
src/styles/*.css      ──►  dist/style.css       (concatenated in cascade order)
```

Consequences:

1. **Source files are fragments, not modules.** A file may use names declared in files earlier in the same bundle (and, for `indicators`, names from `app.js`). Files have no `import`/`export`. Do not add them.
2. **Order is a runtime contract.** Top-level `const`/`let`/`var` are used across files depending on position. Reordering can cause "Cannot access X before initialization" or silently change behaviour.
3. **`scripts/manifest.mjs` is the single source of truth for order.** File names carry no numeric prefixes. A source file that is **not listed in the manifest is not bundled** (the code silently never runs).
4. **Never edit `dist/*` by hand.** Edit `src/`, then run `npm run build`. `dist/` is committed so the site works on static hosting without a build step.
5. `index.html` loads `dist/app.js` → `dist/indicators.js` → `dist/drawings.js`, all with `defer`, so they execute in that order after the Lightweight Charts script.

---

## 3. Directory structure

```text
Trading/
├── index.html                 # Entry page: DOM skeleton, early data fetch, loads CDN lib + dist/ bundles
├── package.json               # npm scripts: build, test, check:syntax (no dependencies)
├── README.md                  # This file
│
├── assets/
│   └── images/                # favicon.ico, favicon-*.png, apple-touch-icon.png,
│                              #   long-position.png, short-position.png, assets-position-*.png
│
├── dist/                      # GENERATED – do not edit
│   ├── app.js
│   ├── indicators.js
│   ├── drawings.js
│   └── style.css
│
├── scripts/
│   ├── manifest.mjs           # Bundle definitions: source dir, output path, ORDERED file list
│   └── build.mjs              # Reads the manifest, concatenates, writes dist/
│
├── src/
│   ├── js/
│   │   ├── app/               # Main application  (→ dist/app.js)
│   │   │   ├── core/          #   bootstrap, state, time format, startup
│   │   │   ├── chart/         #   chart instance and its appearance/behaviour
│   │   │   ├── data/          #   REST/WebSocket/history/ticker data
│   │   │   ├── watchlist/     #   symbol list
│   │   │   └── ui/            #   toolbar, context menu, replay, mobile nav
│   │   ├── indicators/        # Indicator system (→ dist/indicators.js)
│   │   │   ├── core/          #   kit (registry + helpers), engine
│   │   │   ├── shared/        #   reusable calculation cores
│   │   │   └── modules/       #   one file per indicator
│   │   └── drawings/          # Drawing tools    (→ dist/drawings.js)
│   │       ├── core/          #   types, math, finance helpers (no DOM)
│   │       ├── tools/         #   tool families
│   │       ├── runtime/       #   registry, store, coords, primitives, controller
│   │       ├── ui/            #   icons, panel
│   │       └── index.js       #   entry (initDrawings)
│   └── styles/                # CSS partials     (→ dist/style.css)
│
├── tests/
│   ├── helpers/sources.mjs    # readSource(path), readCss() (concatenates CSS via the manifest)
│   └── *.test.mjs             # node:test suites (64 tests)
│
└── docs/                      # ARCHITECTURE, DRAWINGS, PRICE_SCALE, MOBILE_RESPONSIVE,
                               #   RSI_IMPLEMENTATION, PERFORMANCE, KEYBOARD_SHORTCUTS, TECHNICAL_DEBT
```

Root rule: the repo root contains only entry/config files and folders. No stray source files.

---

## 4. Bundle contents and execution order

Order below is exactly the manifest order (top to bottom = execution order).

### 4.1 `dist/app.js` ← `src/js/app/`

| # | File | Responsibility |
|---|------|----------------|
| 1 | `core/bootstrap.js` | Constants (`API`, `WSU`, `TFS`, `TFMS`, `ROW`, `LIM`), `$` DOM helper, `clamp`, safe `localStorage` wrapper `store`, `getJ`. |
| 2 | `chart/color-palette.js` | Reusable 8×8 `ColorPalette` colour picker. |
| 3 | `core/time-format.js` | Tehran time formatting for the time axis and crosshair. |
| 4 | `core/state.js` | Global state: `sym`, `data`, `pend`, saved symbol/timeframe keys. |
| 5 | `chart/chart.js` | Creates `chart` and candle `series`; invisible "future" series extending the time axis; `candle()`/`bar()` converters; exposes **`window.TVDR`** (bridge for drawings). |
| 6 | `chart/candle-colors.js` | Candle colour settings popup (double-click / right-click a candle). |
| 7 | `chart/background.js` | Chart background settings; touch double-tap behaviour. |
| 8 | `chart/fit.js` | Initial fit and fast "Reset Chart" viewport logic. |
| 9 | `chart/cache.js` | In-memory cache so revisiting a coin/timeframe is instant. |
| 10 | `data/candle-updates.js` | `applyBar`: apply one new/forming candle to the chart. |
| 11 | `data/history.js` | Load candles for the current symbol/timeframe (reuses the early fetch from `index.html`). |
| 12 | `data/history-sync.js` | Catch up on missed candles after disconnect/sleep. |
| 13 | `data/older-history.js` | Load older candles when scrolling left. |
| 14 | `data/candle-rollover.js` | Instant rollover when a candle closes. |
| 15 | `chart/countdown.js` | Countdown label on the price scale + per-frame loop. |
| 16 | `ui/context-menu.js` | Context menu shared by chart and watchlist. |
| 17 | `chart/price-scale.js` | Linear/log scale controller (native LWC modes), Alt+L shortcut. |
| 18 | `ui/toolbar.js` | Timeframe bar and phone timeframe picker. |
| 19 | `chart/header.js` | Title + daily change of the selected coin. |
| 20 | `ui/replay.js` | Bar Replay (largest UI file). |
| 21 | `watchlist/core.js` | Price formatting, flag cycle (none → green → red). |
| 22 | `data/daily-open.js` | Daily-open prices (Chg% since 00:00 UTC). |
| 23 | `watchlist/sections.js` | Sections, manual order, sorting/rendering (largest watchlist file). |
| 24 | `watchlist/drag-drop.js` | Drag & drop reordering and moving between sections. |
| 25 | `watchlist/columns.js` | Resizable columns. |
| 26 | `watchlist/panel.js` | Resizable panel, move to other side, show/hide. |
| 27 | `data/market-caps.js` | CoinGecko market-cap ranking. |
| 28 | `data/ticker-data.js` | 24h ticker ingestion (USDT perpetuals only). |
| 29 | `data/websocket.js` | WebSocket subscriptions (diff-based SUBSCRIBE/UNSUBSCRIBE). |
| 30 | `data/watchdog.js` | Dead-socket / missed-close / tab-visibility recovery. |
| 31 | `core/startup.js` | App start. |
| 32 | `ui/mobile-nav.js` | Mobile bottom tab bar (**intentionally runs after startup**). |

### 4.2 `dist/indicators.js` ← `src/js/indicators/`

Order: `core/kit.js` → `shared/ma-base.js` → `shared/rsi-core.js` → `modules/dmi.js` → `ema.js` → `halftrend.js` → `rsi.js` → `sma.js` → `smma.js` → `volume.js` → `core/engine.js`.

- `core/kit.js`: `INDREG` (module registry) and `INDKIT` (shared helpers, anchored-recursion support for EMA/SMMA). Documents the **module contract**.
- `shared/`: reusable calculation code: `makeMAModule` (factory for the SMA/EMA/SMMA family) and `RSI_CORE` (pure RSI calculation, equals TradingView `ta.rsi`).
- `modules/`: one file per indicator; each registers itself into `INDREG`.
- `core/engine.js`: declares the global `var IND`; owns active indicators, chart series, legend, settings panel, menu, history warm-up. **Must stay last** so every module is registered first.

### 4.3 `dist/drawings.js` ← `src/js/drawings/`

Wrapped in one strict-mode IIFE, so its internals are private. Order: `core/types` → `core/math` → `core/tool-common` → `core/finance` → `tools/lines` → `tools/fib` → `tools/shapes` → `tools/annotations` → `tools/position` → `tools/measure` → `tools/volume-profile` → `runtime/registry` → `runtime/store` → `runtime/coords` → `runtime/primitives` → `runtime/controller` → `ui/icons` → `ui/panel` → `index.js`.

- `core/`: shared types, geometry math, position sizing and time formatting (no DOM).
- `tools/`: tool families (each tool = definition + render + hit-test + settings).
- `runtime/registry.js`: exactly two toolbar tabs: **Lines** (line tools + rectangle) and **Tools** (positions first, then the rest).
- `runtime/store.js`: drawing persistence, per-tool default style, undo/redo.
- `runtime/coords.js`: time ↔ pixel mapping (anchors are `{time, price}` in absolute time).
- `runtime/primitives.js`, `runtime/controller.js`: SVG overlay rendering and pointer/keyboard interaction (controller is the largest file).
- `ui/icons.js`, `ui/panel.js`: tool icons and the drawing toolbar/settings UI.
- `index.js`: `initDrawings(...)` entry; assigns `window.DR`.

### 4.4 `dist/style.css` ← `src/styles/`

Order (cascade matters): `tokens` → `base` → `topbar` → `chart-overlays` → `watchlist` → `menus` → `forms` → `color-picker` → `drawing-tools` → `responsive` → `replay` → `mobile`.

`tokens.css` also holds the file header and CSS variables (`--safe-top`, etc.). Do not reorder partials or move rules between them casually; later partials override earlier ones.

---

## 5. Runtime contracts between bundles

- **Shared global scope.** `app.js` and `indicators.js` are plain scripts, so their top-level declarations (`chart`, `data`, `store`, `IND`, `INDREG`, `INDKIT`, `RSI_CORE`, …) are visible to later scripts. `indicators.js` depends on names from `app.js`.
- **`app.js` → `indicators.js` is an optional, late-bound dependency.** Because `app.js` executes first, app code always calls the engine defensively: `window.IND && IND.full()`, `IND.tick()`, `IND.need()`, `IND.clear()`, `IND.colors()`, `IND.frame()`, `IND.setMainMargins()`. Keep that guard pattern.
- **`window.TVDR`** (created in `src/js/app/chart/chart.js`) is the bridge to the drawing layer: `{ chart, series, bars(), sym(), dec(), store }`. `drawings.js` is an IIFE, so it only sees `window` properties: `TVDR`, `LightweightCharts`, `IND` (e.g. `IND.removeAll`, `IND.setVisible`) and the DOM elements `#cw` and `#chart`. `drawings/index.js` only starts when `TVDR` and `LightweightCharts` exist and then sets `window.DR`.
- **Early fetch.** `index.html` starts `P_T` (24h tickers) and `P_K` (klines for `SYM0`/`TF0`, default `BTCUSDT`/`1d`) before the chart library loads; `data/history.js` reuses `P_K` for the first load. Keep `SYM0`/`TF0` consistent with that logic.
- **DOM ids.** Much of the code finds elements by id from `index.html` (`#chart`, `#cw`, `#tfs`, `#btnInd`, `#btnReplay`, `#btnWatch`, `#list`, `#side`, `#mnav`, `#pop`, `#imenu`, …). Renaming an id requires updating JS, CSS and tests together.
- **Persistence** (browser `localStorage`, through the `store` wrapper that never throws): selected symbol/timeframe (`chartSelectedSymbol`, `chartSelectedTimeframe`), price scale mode (`tview-price-scale-mode`), watchlist flags/sections/order/column widths/visibility (`flags`, `secs`, `secOf`, `ord`, `cw2`, `sw2`, `watchlistHidden`, …), candle/background colours (`cc`, `cco`, `bg`), indicator configuration (`inds`, …), replay speed (`rpSpeed`), daily-open and market-cap caches (`dopen`, `mcap`), and drawings under `dr:v1:<SYMBOL>`. Changing a stored shape needs migration code.

---

## 6. Commands

```bash
npm run build           # regenerate dist/ from src/   (node scripts/build.mjs)
npm test                # node --test tests/*.test.mjs (64 tests)
npm run check:syntax    # node --check on dist/*.js and scripts/*.mjs
```

There are **no npm dependencies**; a recent Node with ES-module support is enough. To run the app, serve the repo root with any static server (or open `index.html`; classic scripts work over `file://`) with network access to Binance and jsDelivr.

Always run `npm run build` after editing anything in `src/`, and commit `src/` and `dist/` together.

---

## 7. Recipes

**Add a source file to an existing bundle**
1. Create it in the right feature folder under `src/js/<bundle>/…` (plain fragment, no import/export).
2. Add its path at the correct position in `scripts/manifest.mjs`.
3. `npm run build && npm test`.

**Add an indicator**
1. Create `src/js/indicators/modules/<name>.js` following the contract documented in `core/kit.js` (`sma.js` is a small example, `rsi.js` a complex one). Put reusable maths in `shared/`.
2. List it in the `indicators` bundle **after** `shared/*` and **before** `core/engine.js`.
3. Build and test; add a test for non-trivial calculation code.

**Add a drawing tool**
1. Add a file in `src/js/drawings/tools/` and list it before `runtime/registry.js` in the manifest.
2. Register it in `runtime/registry.js` (choose the Lines or Tools tab) and add an icon in `ui/icons.js`.
3. Verify creation, selection, dragging, hit-testing, undo/redo and persistence in a browser.

**Add styles**
Add rules to the matching partial in `src/styles/`. For a new partial, add it to the `styles` list in the manifest at the intended cascade position.

**Add a test**
Create `tests/<name>.test.mjs` with `node:test`. Read sources with `readSource('src/js/...')` and CSS with `readCss()` from `tests/helpers/sources.mjs`. Existing tests either assert on source text, run a source file in `node:vm` with stubs, or execute the built `dist/drawings.js` (build first for those).

---

## 8. Tests

`tests/` covers: background defaults and double-tap, colour palette, future time axis, mobile layout, responsive header, watchlist toggle, price scale (including log-scale drawings), reset chart, RSI core and TradingView parity, tool order, position icons and position timeframe behaviour. Most tests use source text or `node:vm` with fake DOM/chart objects, so no browser is needed.

Tests cannot replace a manual browser check for chart interaction, live candle updates, watchlist drag & drop, indicator rendering, drawing hit-testing and mobile gestures.

---

## 9. Rules for making changes (important for AI assistants)

1. **Edit `src/`, never `dist/`.** Rebuild afterwards.
2. **Do not introduce ES modules, bundlers, frameworks or TypeScript** unless the task explicitly changes the runtime model. Everything relies on shared globals and script order.
3. **Do not rename or reorder globals/files casually.** Check the manifest order and grep for usages across `app`, `indicators`, `drawings`, `tests` and `index.html`.
4. **New file ⇒ manifest entry.**
5. **Keep the root clean.** New source goes into `src/js/<bundle>/<feature>/`, styles into `src/styles/`, images into `assets/images/`, docs into `docs/`.
6. **One responsibility per folder/file;** place code where section 4 says it belongs.
7. **CSS order is behaviour.** Keep partial order; `responsive` and `mobile` must stay late.
8. **Update tests and docs** when paths, ids or behaviour change; update the manifest and this README when the structure changes.
9. **Preserve compatibility:** classic scripts, `file://` usage, no required build step for deployment (`dist/` is committed).
10. When behaviour changes, say what could not be verified without a browser.

---

## 10. External dependencies and caveats

- Lightweight Charts **4.2.0** via CDN (pinned).
- Binance Futures public REST/WebSocket and CoinGecko public API: availability, rate limits and CORS are outside the app's control. Watchdog logic handles dropped sockets and sleeping tabs.
- Indicators and drawing tools are analysis aids only, not trading advice.

More detail: `docs/ARCHITECTURE.md`, `docs/DRAWINGS.md`, `docs/PRICE_SCALE.md`, `docs/MOBILE_RESPONSIVE.md`, `docs/RSI_IMPLEMENTATION.md`, `docs/KEYBOARD_SHORTCUTS.md`, `docs/PERFORMANCE.md`, `docs/TECHNICAL_DEBT.md`.
