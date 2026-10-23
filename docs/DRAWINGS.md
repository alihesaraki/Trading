# Drawing tools

The active drawing implementation is in `src/js/drawings/`, split into feature folders and assembled into `dist/drawings.js` by `scripts/build.mjs` (order declared in `scripts/manifest.mjs`).

- `core/` (`types`, `math`, `tool-common`, `finance`) provides shared types and helpers.
- `tools/` (`lines`, `fib`, `shapes`, `annotations`, `position`, `measure`, `volume-profile`) implements drawing-tool families.
- `runtime/registry.js` registers tools for the **Lines** and **Tools** toolbar tabs.
- `runtime/` (`store`, `coords`, `primitives`, `controller`), `ui/` (`icons`, `panel`) and `index.js` provide storage, coordinate conversion, rendering primitives, interaction handling, icons, UI, and initialization.

## Behavior and interactions

Drawings are stored as `{time, price}` anchors and persisted per symbol in local storage using keys in the `dr:v1:<SYMBOL>` family. The drawing layer uses chart-view state to determine when its SVG overlay needs refreshing, keeping drawings aligned during view changes and live chart updates.

Keyboard shortcuts include Alt+T/H/V/F/X/M for tools; Alt+L toggles Log/Linear price scale; Alt+Shift+R activates Rectangle, Esc to cancel, Del to delete, Ctrl+Z / Ctrl+Shift+Z for undo/redo, Ctrl+C/V/D for copy/paste/duplicate, Ctrl+A to select all, and Shift for 45-degree constraints where supported.

Edit the source fragments rather than `dist/drawings.js` directly. Run the build after changes and validate drawing creation, selection, dragging, hit-testing, undo/redo, persistence, and chart pan/zoom behavior in a browser.
