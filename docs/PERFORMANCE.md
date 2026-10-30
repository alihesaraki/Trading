# Performance notes

## Current design

- Source fragments are concatenated into browser-facing scripts, avoiding a runtime request per fragment.
- Indicator implementations are separated by responsibility while sharing a common registry/engine.
- Drawing tools are grouped by family and use shared coordinate and primitive helpers.
- The drawing layer checks chart-view signatures to decide when overlay work needs to be refreshed (see `docs/DRAWINGS.md` history/implementation notes where applicable).

## Verification performed for this delivery

The build script was run successfully and regenerated `dist/app.js`, `dist/indicators.js`, `dist/drawings.js`, and `dist/style.css` byte-for-byte identically to the supplied generated files. `node --check` passed for each generated JavaScript file and `build.mjs`.

No before/after browser benchmark or profiling session was available. Therefore, no numeric performance improvement is claimed. Potential improvements should be based on browser profiling with representative live charts and watchlist sizes.

## Safe profiling targets

- Chart rendering and candle update frequency during active WebSocket traffic.
- Drawing overlay refresh frequency while panning, zooming, resizing, and receiving live candles.
- Indicator recalculation cost on history changes and timeframe/symbol switches.
- Watchlist DOM updates and drag-and-drop interaction.
- Startup cost and generated script size.

## Network data usage

- Market caps (CoinGecko, ~600 KB) are cached in localStorage for 24h instead of downloaded on every page load.
- The full `/ticker/24hr` list is refreshed every 3 min while the WebSocket is live (60s only when it is down); tab-switch/reconnect refreshes are throttled to one per 45s.
- After 30s in a background tab every WebSocket stream is unsubscribed; on return the chart catches up with a tiny `startTime` kline request.
- Watchlist stream subscriptions are throttled (250ms) instead of debounced, so rows that scrolled out of view stop streaming.
- Daily-open progress is saved while loading, and coins with no candle today are not re-requested every refresh.

## Coin list loading and coverage

- Daily opens (Chg%) are fetched with 24 parallel requests, rows on screen first; a rate-limit/network failure retries after 6s, 12s, 24s... instead of waiting for the next refresh.
- Every USDT perpetual is listed, including non-ASCII names. Dated futures (`_` in the symbol), USDC contracts and the two hidden coins are skipped. Delisted contracts are removed on each refresh.
- The `!contractInfo` stream triggers a coin-list reload a few seconds after Binance adds or changes a contract.
- `coinStats()` in the browser console shows how many contracts Binance returned vs. how many are shown.

## Live price speed (WebSocket)

Binance USDⓈ-M update speeds: `<symbol>@miniTicker` 2s, `<symbol>@kline_<tf>` 250ms, `<symbol>@aggTrade` 100ms (`bookTicker` is real-time but lives on the `/public` tier and carries bid/ask, not the last price).

- Only the selected (chart) coin uses `@aggTrade` (100ms). Watchlist rows use `@miniTicker` (2s) to keep data use low; the selected coin's `@miniTicker` doubles as a cheap heartbeat.
- The forming chart candle also follows each trade (coalesced to one chart update per animation frame); the 250ms kline still supplies volume and the official OHLC, and an older kline snapshot never moves the price backwards.
- Connects to `wss://fstream.binance.com/market/stream`; falls back to the legacy `/stream` URL if the new one never delivers data twice in a row.
- Binance limits: 10 incoming messages/s per connection (over the limit = disconnect, repeated = IP ban) and 1024 streams. SUBSCRIBE/UNSUBSCRIBE are batched (60 streams per message) and sent through a queue at most every 260 ms (~4/s); the unsent queue is rebuilt on every list scroll so it never grows.
- A dead socket is replaced immediately instead of waiting for `onclose`.
- A REST 24h list no longer overwrites a price that arrived over the socket in the last 5 s.
- Tests: `tests/websocket-live.test.mjs`.
