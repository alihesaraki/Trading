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
  }
