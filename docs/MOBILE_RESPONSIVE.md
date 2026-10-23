# Mobile layout (TradingView-app style)

Applies to `@media (max-width: 820px), (pointer: coarse) and (max-height: 500px)` (portrait phones, small tablets, landscape phones). Desktop is untouched.

- **Two pages**: Chart and Watchlist, switched by the bottom tab bar `#mnav` (`src/js/app/ui/mobile-nav.js`). Picking a coin jumps to the chart. In landscape the bar becomes a left rail.
- **Draw tab** opens the drawing tools as a bottom strip (`body.m-tools`); the chart shrinks above it.
- **Top bar**: timeframe picker, indicators (icon), replay.
- **Bottom sheets** with dimmed backdrop: indicators menu, indicator settings, drawing settings, drawing group fly-outs.
- Safe-area insets, `100dvh`-free fixed shell, 16px inputs (no iOS zoom), 44px touch targets.
- Watchlist row height stays 36px because the virtual scroller uses the JS constant `ROW`.
- Old iPhones (iOS 12+): `inset`, `padding-inline` and `dvh` have explicit fallbacks.
- Watchlist columns: three equal, centered columns.
- Breakpoints: 820 (layout), 600-820 (labels), 380 (compact), landscape rail, 450px-high compaction.
