  // index: initDrawings() = entry point. Creates the DrawingStore, the Controller (canvas/SVG layer) and the toolbar Panel, then wires them to the chart bridge window.TVDR
  function initDrawings(b, host, chartEl) {
    const store = new DrawingStore(b.store);
    const mapper = new LwcMapper(b.chart, b.series, b.bars, chartEl, b.dec);
    const ctl = new Controller(host, mapper, store);
    const ui = new DrawingUI(host, ctl, store);
    let cur = "";
    const watch = () => {
      requestAnimationFrame(watch);
      const s = b.sym();
      if (s && s !== cur) {
        cur = s;
        ctl.cancelDraft();
        ctl.selection.clear();
        store.load(s);
        ui.closeSettings();
        ui.refresh();
      }
    };
    watch();
    ui.refresh();
    return { store, ctl, ui, mapper, toolMap: TOOL_MAP };
  }
  var w = window;
  if (w.TVDR && w.LightweightCharts) {
    w.DR = initDrawings(w.TVDR, document.getElementById("cw"), document.getElementById("chart"));
    w.DRX = { DrawingUI };
    /* ---- Multi-chart ----
       The left toolbar lives in the main page and drives the active chart. Every chart tells it when its drawing state changed. */
    const idx = typeof PANE === "number" ? PANE : 0;
    const bridge = () => (idx ? w.parent.MC : w.MC);
    const notify = () => { try { const m = bridge(); m && m.barChanged && m.barChanged(idx); } catch (_) {} };
    w.DR.store.on(notify);
    const prevChanged = w.DR.ctl.hooks.changed;
    w.DR.ctl.hooks.changed = function () { if (prevChanged) prevChanged.apply(this, arguments); notify(); };
    if (!idx) w.DR.ctl.keysOff = () => !!(w.MC && w.MC.keysBlocked && w.MC.keysBlocked());
    /* Another chart showing the same coin changed its drawings (saved to localStorage): reload them here */
    w.addEventListener("storage", (e) => {
      const st = w.DR.store;
      if (!st.symbol || e.key !== st.key(st.symbol)) return;
      w.DR.ctl.cancelDraft();
      w.DR.ctl.selection.clear();
      st.load(st.symbol);
    });
  }
