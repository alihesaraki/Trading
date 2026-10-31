# RSI implementation notes

- Calculation lives in `src/js/indicators/shared/rsi-core.js`; `rsi.js` only adapts it to the indicator registry and rendering API.
- Look follows TradingView/Binance: purple `#7E57C2` 1px line, dashed grey 70/50/30 levels (70/30 labelled on the price scale), 10% purple band between 70 and 30 (a Baseline series with base = lower level), scale auto-fitted to the data while always keeping the levels visible, and a purple value badge at the right edge. The live candle is updated in O(1) via `RSI_CORE.tail`.
- Default length is 14 and the default source is close. The core supports open/high/low/close/HL2/HLC3/OHLC4, sorts and deduplicates numeric timestamps, rejects invalid OHLC bars, and never emits non-finite values.
- The first RSI is emitted after `length` valid consecutive changes. Initial average gain/loss are arithmetic means of those changes; later values use Wilder's RMA recurrence.
- If average loss is zero and average gain is positive, RSI is 100. If average gain is zero and average loss is positive, RSI is 0. If average loss is zero (including a completely flat window) RSI is 100, exactly like TradingView's `ta.rsi`.
- Upper/lower levels default to 70/30; the 50 line is configurable, as is visibility of reference levels. Line color/width remain configurable through the existing settings panel.
- The installed chart library is Lightweight Charts 4.2.0 (`index.html` loader, `assets/vendor/`). This architecture currently simulates oscillator panes with dedicated price scales and scale margins inside a single chart rather than native independent pane objects. The RSI is aligned to the shared time scale and the pane separator is draggable/persisted, but this is not the same internal pane architecture as TradingView.
- Automated tests cover deterministic Wilder seeds, rising/falling/flat data, source selection, invalid values, timestamp ordering/deduplication, warm-up length, and full-calculation repeatability. No TradingView-generated reference series or pixel-level browser comparison was available in this environment, so exact parity is not claimed.

## Pine RSI parity (no alerts)

The indicator mirrors TradingView's Pine v6 "Relative Strength Index", except for the alert conditions, which are intentionally not implemented.

- **Gradient fills**: the area between the RSI line and the middle level is filled green from 100 (opaque) to the upper level (transparent) and red from the lower level (transparent) to 0 (opaque). Drawn by a series primitive (`makePrimitive` in `rsi.js`) underneath the lines.
- **Smoothing** (`maType`, default SMA 14): None, SMA, SMA + Bollinger Bands, EMA, SMMA (RMA), WMA, VWMA. EMA is seeded with the first RSI value, RMA with the SMA of the first `maLen` values, Bollinger bands use the biased stdev times `bbMult`, and the bands get a 10% green fill. Math lives in `RSI_CORE.smooth`.
- **Divergence** (`div`, off by default): regular bullish / bearish divergence with pivots 5 left / 5 right and a previous pivot 5-60 bars back (`RSI_CORE.divergence`). Divergence segments and `Bull` / `Bear` labels are drawn at the pivot bar, like Pine's `offset = -5`.
- The live candle stays O(1) for the RSI; smoothing is recomputed from the cached RSI points, and divergence falls back to a full pass.
