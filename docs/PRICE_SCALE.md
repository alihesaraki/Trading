# Price Scale Modes

## Implementation

The chart is loaded from Lightweight Charts `4.2.0` (`index.html`). The main candlestick series uses the chart's right price scale. `src/js/app/chart/price-scale.js` switches that native scale between `PriceScaleMode.Normal` (Linear / REG) and `PriceScaleMode.Logarithmic` (Log / LOG). This is a real scale-mode change; price-axis labels are not merely reformatted.

The library owns price-to-screen and screen-to-price conversion for the active scale. Drawing code continues to use the existing `series.priceToCoordinate()` and `series.coordinateToPrice()` methods, so saved drawing anchors remain stored as actual `{time, price}` values and are not rewritten when the mode changes. Volume-profile and drawing overlays that already use these series coordinate APIs follow the scale transformation naturally.

## Controls and persistence

- `REG` selects linear scaling; it is the default when no preference exists.
- `LOG` selects native logarithmic scaling.
- `Alt+L` toggles between the two modes outside editable text fields.
- The Long Position drawing tool remains available with `Ctrl+Alt+Shift+L` (Windows/Linux) or `Cmd+Option+Shift+L` (macOS).
- The preference is stored in local storage as `tview-price-scale-mode`, independently from drawing storage and symbol/timeframe caches.

Clicking an already active mode reapplies that mode without toggling to the other mode. Switching modes does not deliberately reset the visible time range or force autoscaling.

## Invalid prices

Logarithmic mode requires every loaded candle's OHLC values to be finite and greater than zero. If a dataset contains a zero, negative, missing, or invalid OHLC value, the UI refuses the Log selection and displays a warning. If such data appears after Log mode was restored or while new history/candles are loaded, the chart falls back to Linear and updates the saved preference accordingly.

## Verification status

The automated tests exercise mode selection, persistence, invalid-data guards, shortcut propagation, and the mathematical equal-percentage property of logarithms. Build and JavaScript syntax checks are also run. The tests use a mocked chart API; a real-browser verification of Lightweight Charts rendering, crosshair inverse mapping, drawings, volume profile, indicators, zoom, and pan is still required before claiming full end-to-end parity.

## Reset Chart viewport (Update 26)

The Reset Chart button, `Alt+R`, and the chart context-menu Reset action now share `resetChartView()`.
When at least 300 bars are already loaded, it immediately enables native price-scale autoscaling and sets the Lightweight Charts logical range to the last 300 loaded bar indices, with a 16-bar right-side margin. It does not reload the chart, refetch existing history, recreate series, or change the selected price-scale mode. Native autoscaling uses the visible range and the chart's own series scaling behavior.

If fewer than 300 bars are loaded and older history may exist, the function first applies the available viewport immediately, then requests only the missing count from the existing Binance kline endpoint. It checks the active chart request token and symbol/timeframe before applying that result, coalesces repeated clicks for the same chart, and ignores stale responses. Older bars are prepended only when needed; indicators are refreshed only on that slower data-extension path.
