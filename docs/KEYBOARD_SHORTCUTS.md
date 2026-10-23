# Keyboard Shortcuts — Tview Chart

This reference describes shortcuts implemented in the current Tview Chart source. “TradingView-compatible” means the key combination is documented by TradingView's Advanced Charts / Trading Platform shortcut reference; it does not imply the custom Tview implementation has all TradingView features.

Reference checked: https://www.tradingview.com/charting-library-docs/latest/configuration/Shortcuts/ (accessed 2026-10-18).

## Drawing tools

| Shortcut | Action | Context | Classification | Notes |
|---|---|---|---|---|
| `Alt+T` | Activate Trend Line | Global, except text-entry targets | Official-compatible | Existing custom drawing tool |
| `Alt+H` | Place a Horizontal Line at the current pointer position | Pointer inside chart plot; otherwise activates the tool for click-to-place | Official-compatible key, Tview immediate-placement behavior | Creates and selects the line immediately when pointer coordinates are available |
| `Alt+J` | Place a Horizontal Ray at the current pointer position | Pointer inside chart plot; otherwise activates the tool for click-to-place | Tview custom immediate-placement behavior | Creates and selects the ray immediately when pointer coordinates are available |
| `Alt+V` | Place a Vertical Line at the current pointer position | Pointer inside chart plot; otherwise activates the tool for click-to-place | Official-compatible key, Tview immediate-placement behavior | Creates and selects the line immediately when pointer coordinates are available |
| `Alt+C` | Cross Line | — | Not implemented | No cross-line drawing type exists in the current tool registry |
| `Alt+F` | Activate Fibonacci Retracement | Global, except text-entry targets | Official-compatible | Existing custom drawing tool |
| `Shift+→` | Bar Replay: forward one bar | While Bar Replay is open, outside text entry | TradingView-compatible | Finishes the forming candle, or reveals the next one |
| `Shift+↓` | Bar Replay: play / pause | While Bar Replay is open, outside text entry | TradingView-compatible | Speed is set from the toolbar |
| `Shift+←` | Bar Replay: step back | While Bar Replay is open, outside text entry | Tview custom | Removes the last revealed update |
| `Alt+Shift+R` | Activate Rectangle | Global, except text-entry targets | Official-compatible | Moved from `Alt+R` to avoid the chart-reset conflict |
| `Alt+X` | Activate Text Annotation | Global, except text-entry targets | Tview custom | No equivalent shortcut is documented in the referenced official list |
| `Alt+L` | Toggle between Linear (REG) and Logarithmic (LOG) price scales | Chart context, outside text entry | TradingView-compatible | Uses native `PriceScaleMode`; saved in local storage |
| `Alt+M` | Activate Measurement tool | Global, except text-entry targets | Tview custom | In addition, hold `Shift` and click/drag on the chart to measure |
| `Ctrl+Alt+Shift+L` / `Cmd+Option+Shift+L` | Activate Long Position | Global, except text-entry targets | Tview custom | Replaces conflicting `Alt+L` (TradingView logarithmic scale) |
| `Ctrl+Alt+Shift+S` / `Cmd+Option+Shift+S` | Activate Short Position | Global, except text-entry targets | Tview custom | Replaces conflicting `Alt+S` (TradingView snapshot/link action) |
| `Ctrl+Alt+Shift+P` / `Cmd+Option+Shift+P` | Activate Fixed Range Volume Profile | Global, except text-entry targets | Tview custom | Replaces conflicting `Alt+P` (TradingView percent scale) |

When `Alt+H`, `Alt+J`, or `Alt+V` is pressed while the pointer is over the chart plot, the corresponding one-point drawing is created immediately at that price/time coordinate and selected. If the pointer is not over the plot, the shortcut falls back to activating the tool so the user can click to place it.

## Drawing editing

| Shortcut | Action | Context | Classification | Notes |
|---|---|---|---|---|
| `Ctrl/Cmd+Z` | Undo | Drawing controller active | Common / supported | Delegates to the existing drawing store history |
| `Ctrl/Cmd+Shift+Z` | Redo | Drawing controller active | Alias | Retained as an additional alias |
| `Ctrl/Cmd+Y` | Redo | Drawing controller active | Official-compatible | Delegates to the existing drawing store history |
| `Ctrl/Cmd+C` | Copy selected drawings | Drawing selection | Official-compatible | Browser copy is prevented only when drawings are selected |
| `Ctrl/Cmd+V` | Paste drawings | Drawing controller active | Official-compatible | Prevents browser default when handled by the drawing controller |
| `Ctrl/Cmd+D` | Duplicate selected drawing(s) | Drawing selection | Tview custom | Kept as a custom convenience shortcut |
| `Ctrl/Cmd+A` | Select all visible drawings | No active drawing tool | Tview custom | Prevents browser select-all only when this action is applicable |
| `Delete` | Delete selected drawings | Drawing selection, no active draft | Official-compatible | Does not delete when nothing is selected |
| `Backspace` | Delete selection or remove last draft point | Drawing selection/draft | Context-sensitive | Draft-point removal only applies to supported drafts |
| `Enter` | Finish the current drawing | Active drawing draft | Context-sensitive | Not intercepted for ordinary text-entry targets |
| `Escape` | Clear quick measure, cancel/finish draft, exit tool, or clear selection | Drawing controller | Context-sensitive | Priority follows the active drawing state |
| `Shift` + click/drag | Temporary measure interaction | Chart plot | Official-compatible behavior | The former “hold Shift to switch to measure tool” global handler was removed to align with this interaction |

## Chart and watchlist

| Shortcut | Action | Context | Classification | Notes |
|---|---|---|---|---|
| `Alt+R` | Reset chart view | Chart page, outside text entry | Official-compatible | Uses the fast viewport-only reset: latest 300 bars, 16-bar right margin, and auto price-scale fit |
| `Space` | Select next watchlist symbol | Outside text entry | Trading Platform-compatible | Existing Tview watchlist behavior |
| `ArrowDown` / `ArrowUp` | Select next/previous watchlist symbol | Outside text entry and form controls | Trading Platform-compatible | Current implementation is global rather than limited to explicit watchlist focus |

## Official shortcuts not implemented

These are documented in TradingView's Advanced Charts reference but are not mapped because the current app does not expose a verified equivalent action or supporting UI/API:

- `Ctrl/Cmd+K` — Quick Search (no matching quick-search dialog was found).
- `/` — Indicators search (no equivalent indicator-search dialog was found).
- `Ctrl/Cmd+S` — Save chart layout (no layout save/load workflow was found; browser Save Page behavior is not intercepted).
- `Alt+G` — Go to date (no date-navigation dialog was found).
- `Alt+I` — Invert series scale (not added without a confirmed chart-scale API integration).
- `Ctrl/Cmd+Alt/Option+H` — Hide drawings (no verified existing hide-all action was found).
- Chart arrow-key navigation, Ctrl/Cmd+arrow zoom/pan, snapshots, layout loading, and cross-line drawing remain unimplemented pending matching UI/chart APIs.

## Platform and safety notes

- The drawing controller ignores global shortcuts when the event target is an input, textarea, select, or content-editable element.
- Windows/Linux use `Ctrl`; macOS uses `Cmd` for the controller's primary modifier operations. `Alt` corresponds to `Option` on macOS.
- The browser and operating system reserve some combinations. Tview only prevents defaults for actions it actually handles; `Ctrl/Cmd+S` is intentionally not intercepted.
- Automated syntax/build checks do not prove browser interaction parity. Keyboard and pointer behavior still needs manual browser verification.
