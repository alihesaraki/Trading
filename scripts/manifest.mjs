/*
 * Single source of truth for bundle composition and ORDER.
 *
 * The browser loads classic scripts that share one global scope, so execution
 * order is a runtime contract. Order is declared explicitly here instead of
 * being encoded in filename prefixes, which lets sources live in feature folders.
 * Paths are relative to src/js/<bundle>/ (or src/styles/ for CSS).
 */
export const bundles = {
  app: {
    dir: 'src/js/app/',
    out: 'dist/app.js',
    files: [
  'core/bootstrap.js',
  'chart/color-palette.js',
  'core/time-format.js',
  'core/state.js',
  'chart/chart.js',
  'chart/candle-colors.js',
  'chart/background.js',
  'chart/fit.js',
  'chart/cache.js',
  'data/candle-updates.js',
  'data/history.js',
  'data/history-sync.js',
  'data/older-history.js',
  'data/candle-rollover.js',
  'chart/countdown.js',
  'ui/context-menu.js',
  'chart/price-scale.js',
  'ui/toolbar.js',
  'chart/header.js',
  'ui/replay.js',
  'watchlist/core.js',
  'data/daily-open.js',
  'watchlist/sections.js',
  'watchlist/drag-drop.js',
  'watchlist/columns.js',
  'watchlist/panel.js',
  'data/market-caps.js',
  'data/ticker-data.js',
  'data/websocket.js',
  'data/watchdog.js',
  'core/startup.js',
  'ui/mobile-nav.js'
    ],
  },
  indicators: {
    dir: 'src/js/indicators/',
    out: 'dist/indicators.js',
    files: [
  'core/kit.js',
  'shared/ma-base.js',
  'shared/rsi-core.js',
  'modules/dmi.js',
  'modules/ema.js',
  'modules/halftrend.js',
  'modules/rsi.js',
  'modules/sma.js',
  'modules/smma.js',
  'modules/volume.js',
  'core/engine.js'
    ],
  },
  drawings: {
    dir: 'src/js/drawings/',
    out: 'dist/drawings.js',
    files: [
  'core/types.js',
  'core/math.js',
  'core/tool-common.js',
  'core/finance.js',
  'tools/lines.js',
  'tools/fib.js',
  'tools/shapes.js',
  'tools/annotations.js',
  'tools/position.js',
  'tools/measure.js',
  'tools/volume-profile.js',
  'runtime/registry.js',
  'runtime/store.js',
  'runtime/coords.js',
  'runtime/primitives.js',
  'runtime/controller.js',
  'ui/icons.js',
  'ui/panel.js',
  'index.js'
    ],
  },
  styles: {
    dir: 'src/styles/',
    out: 'dist/style.css',
    files: [
  'tokens.css',
  'base.css',
  'topbar.css',
  'chart-overlays.css',
  'watchlist.css',
  'menus.css',
  'forms.css',
  'color-picker.css',
  'drawing-tools.css',
  'responsive.css',
  'replay.css',
  'mobile.css'
    ],
  },
};
