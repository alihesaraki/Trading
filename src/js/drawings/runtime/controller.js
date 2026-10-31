  // controller: the interaction engine. Pointer / keyboard handling, hit-testing, drag + resize handles, selection,
  // drawing a new shape point by point, rendering all drawings into SVG layers, undo/redo hooks. Biggest file of the drawing layer.
  var HIT_TOL = 6;
  var HANDLE_R = 8;
  var HANDLE_TOUCH_R = 30;
  var COARSE = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  var Controller = class {
    constructor(host, m, store, hooks = {}) {
      this.host = host;
      this.m = m;
      this.store = store;
      this.hooks = hooks;
      this.tool = null;
      this.mode = "cursor";
      this.stay = false;
      this.selection = /* @__PURE__ */ new Set();
      this.draft = null;
      this.sig = "";
      this.lastRev = -1;
      this.dirty = true;
      this.gesture = null;
      this.swallow = false;
      this.raf = 0;
      this.lastPointer = null;
      this.hold = null; /* Ctrl-held temporary Brush: { tool, mode } to restore on release */
      this.holdPending = false;
      this.draftDirty = false;
      this.lastDrawingTap = null;
      this.qm = null;
      this.qmDirty = false;
      this.onCompat = (e) => {
        if (this.swallow) {
          e.stopPropagation();
        }
      };
      this.onDown = (e) => {
        this.swallow = false;
        if (e.button !== 0 || this.ignoreTarget(e)) return;
        const p = this.local(e);
        this.lastPointer = p;
        if (!this.inPlot(p)) return;
        // Mobile browsers do not consistently dispatch dblclick; recognize a quick second tap on the same drawing.
        if (e.pointerType === "touch" && this.mode === "cursor" && !this.tool && !this.draft) {
          const now = Date.now(), d2 = this.hitTest(p), last = this.lastDrawingTap;
          if (d2 && last && last.id === d2.id && now - last.time <= 380 && Math.hypot(p.x - last.x, p.y - last.y) <= 26) {
            this.lastDrawingTap = null;
            this.select([d2.id]);
            if (TOOL_MAP[d2.type].editsText) this.hooks.editText?.(d2);
            else this.hooks.openSettings?.(d2);
            this.swallow = true;
            e.stopPropagation();
            e.preventDefault();
            return;
          }
          this.lastDrawingTap = d2 ? { id: d2.id, time: now, x: p.x, y: p.y } : null;
        }
        if (this.qm?.waiting) {
          this.qmSecond(p, e);
          this.swallow = true;
          e.stopPropagation();
          e.preventDefault();
          return;
        }
        if (this.qm) this.clearQM();
        if (this.mode === "cursor" && (this.tool === "measure" || !this.tool && e.shiftKey)) {
          if (this.startQM(p, e)) {
            this.swallow = true;
            e.stopPropagation();
            e.preventDefault();
            window.addEventListener("pointermove", this.onMove);
            window.addEventListener("pointerup", this.onUp);
            window.addEventListener("pointercancel", this.onUp);
          }
          return;
        }
        let handled = false;
        if (this.mode === "eraser") {
          handled = this.startErase(p);
        } else if (this.tool) {
          this.drawDown(p, e);
          handled = true;
        } else handled = this.selectDown(p, e);
        if (handled) {
          this.swallow = true;
          e.stopPropagation();
          e.preventDefault();
          window.addEventListener("pointermove", this.onMove);
          window.addEventListener("pointerup", this.onUp);
          window.addEventListener("pointercancel", this.onUp);
        }
      };
      this.onHover = (e) => {
        if (this.ignoreTarget(e)) return;
        const p = this.local(e);
        this.lastPointer = p;
        if (this.qm?.waiting) {
          this.qmTo(p, e);
          return;
        }
        if (this.gesture) return;
        if (this.draft) {
          this.updatePreview(p, e);
          return;
        }
        if (this.tool || this.mode === "eraser") return;
        if (!this.inPlot(p)) {
          this.setHoverCursor("");
          return;
        }
        const hd = this.handleAt(p);
        if (hd) {
          this.setHoverCursor("dr-handle");
          return;
        }
        this.setHoverCursor(this.hitTest(p) ? "dr-move" : "");
      };
      // Do not reuse a stale chart coordinate when the pointer has left the drawing surface.
      this.onLeave = () => { this.lastPointer = null; };
      this.hoverClass = "";
      this.onMove = (e) => {
        const p = this.local(e);
        this.lastPointer = p;
        const g = this.gesture;
        if (g?.k === "move") {
          const dx = p.x - g.start.x, dy = p.y - g.start.y;
          if (!g.moved && Math.hypot(dx, dy) < 3) return;
          g.moved = true;
          const t0 = this.m.xToTime(g.start.x), t1 = this.m.xToTime(p.x), p0 = this.m.yToPrice(g.start.y), p1 = this.m.yToPrice(p.y);
          if (t0 == null || t1 == null || p0 == null || p1 == null) return;
          const dt = t1 - t0;
          let dp = p1 - p0;
          /* Never push a price to zero / negative (breaks the logarithmic scale and the risk maths). */
          let minP = Infinity;
          for (const [, pts2] of g.orig) for (const q of pts2) minP = Math.min(minP, q.price);
          if (minP > 0 && minP + dp <= 0) dp = -minP * 0.999;
          for (const [id, pts2] of g.orig) {
            const d2 = this.store.get(id);
            if (d2) d2.points = pts2.map((a) => ({ time: a.time + dt, price: a.price + dp }));
          }
          this.store.touch();
        } else if (g?.k === "handle") {
          const d2 = this.store.get(g.id);
          if (!d2) return;
          const t = TOOL_MAP[d2.type];
          const prev = d2.points[g.idx > 0 ? g.idx - 1 : 0];
          const from = this.ctx().px(prev) ?? void 0;
          const pp = g.off ? { x: p.x + g.off.x, y: p.y + g.off.y } : p;
          let a = this.anchorAt(pp, e, d2.points.length > 1 && !t.dragHandle ? from : void 0, d2.points.length > 1 && !t.dragHandle ? prev : void 0);
          if (!a) return;
          if (t.dragHandle) {
            t.dragHandle(d2, g.idx, a, this.m);
            g.moved = true;
            this.store.touch();
            return;
          }
          if (t.constrain) a = t.constrain(d2, g.idx, a);
          d2.points[g.idx] = a;
          g.moved = true;
          this.store.touch();
        } else if (g?.k === "erase") {
          const d2 = this.hitTest(p);
          if (d2) {
            this.store.remove([d2.id]);
          }
        } else if (g?.k === "draw") this.drawMove(p, e);
        else if (g?.k === "qm") this.qmTo(p, e);
      };
      this.onUp = (e) => {
        window.removeEventListener("pointermove", this.onMove);
        window.removeEventListener("pointerup", this.onUp);
        window.removeEventListener("pointercancel", this.onUp);
        const g = this.gesture;
        this.gesture = null;
        if (g?.k === "move" || g?.k === "handle") {
          this.store.end();
        } else if (g?.k === "draw") this.drawUp(this.local(e), e);
        else if (g?.k === "qm") this.qmUp(this.local(e), e);
        else if (g?.k === "erase") {
          this.store.end();
        }
        if (this.holdPending) {
          this.holdPending = false;
          this.endHoldBrush();
        }
      };
      this.onDbl = (e) => {
        if (this.ignoreTarget(e)) return;
        const p = this.local(e);
        if (this.draft && TOOL_MAP[this.draft.d.type].points === "multi") {
          const pts2 = this.draft.d.points;
          if (pts2.length > 1) pts2.pop();
          e.stopPropagation();
          e.preventDefault();
          this.finishDraft();
          return;
        }
        if (this.tool || this.mode === "eraser" || !this.inPlot(p)) return;
        const d2 = this.hitTest(p);
        if (d2) {
          e.stopPropagation();
          e.preventDefault();
          this.select([d2.id]);
          if (TOOL_MAP[d2.type].editsText) this.hooks.editText?.(d2);
          else this.hooks.openSettings?.(d2);
        }
      };
      this.onCtx = (e) => {
        if (this.ignoreTarget(e)) return;
        const p = this.local(e);
        if (!this.inPlot(p) || this.tool) return;
        const d2 = this.hitTest(p);
        if (!d2) return;
        e.stopPropagation();
        e.preventDefault();
        if (!this.selection.has(d2.id)) this.select([d2.id]);
        this.hooks.menu?.(e.clientX, e.clientY, this.menuItems(d2));
      };
      /* Arrow keys nudge the selected drawings: left/right = one bar, up/down = a few pixels of price. */
      this.onArrow = (e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
        if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || this.tool || this.draft || this.gesture) return;
        const t = e.target;
        if (t && (t.isContentEditable || t.closest?.('input, textarea, select, [contenteditable="true"], [role="textbox"]'))) return;
        const pos = this.selected().filter((d2) => !d2.locked && !d2.hidden);
        if (!pos.length) return;
        e.preventDefault();
        e.stopPropagation();
        const sec = this.m.barSec(), dt = e.key === "ArrowLeft" ? -sec : e.key === "ArrowRight" ? sec : 0;
        this.store.begin();
        for (const d2 of pos) {
          let dp = 0;
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            const y0 = this.m.priceToY(d2.points[0].price);
            const p1 = y0 == null ? null : this.m.yToPrice(y0 + (e.key === "ArrowUp" ? -4 : 4));
            if (p1 == null) continue;
            dp = p1 - d2.points[0].price;
            let minP = Infinity;
            for (const q of d2.points) minP = Math.min(minP, q.price);
            if (minP > 0 && minP + dp <= 0) continue;
          }
          d2.points = d2.points.map((a) => ({ ...a, time: a.time + dt, price: a.price + dp }));
        }
        this.store.touch();
        clearTimeout(this.arrowT);
        this.arrowT = setTimeout(() => this.store.end(), 500);
      };
      /* Pressing / releasing Shift while a line is being drawn re-evaluates the straight-line snap without a mouse move. */
      this.onShift = (e) => {
        if (e.key === "Shift" && this.draft && !this.draft.free && this.lastPointer) this.updatePreview(this.lastPointer, { shiftKey: e.type === "keydown" });
      };
      this.onKey = (e) => {
        const t = e.target;
        if (t && (t.isContentEditable || t.closest?.('input, textarea, select, [contenteditable="true"], [role="textbox"]'))) return;
        const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
        if (mod && k === "z") {
          e.preventDefault();
          e.shiftKey ? this.store.doRedo() : this.store.doUndo();
          this.pruneSelection();
          return;
        }
        if (mod && k === "y") {
          e.preventDefault();
          this.store.doRedo();
          this.pruneSelection();
          return;
        }
        if (mod && k === "c" && this.selection.size) {
          e.preventDefault();
          this.copy();
          return;
        }
        if (mod && k === "v") {
          e.preventDefault();
          this.paste();
          return;
        }
        if (mod && k === "d" && this.selection.size) {
          e.preventDefault();
          this.duplicateSelection();
          return;
        }
        if (mod && k === "a" && (!this.tool || this.hold)) {
          e.preventDefault();
          this.select(this.store.items.filter((d2) => !d2.hidden).map((d2) => d2.id));
          return;
        }
        if ((e.key === "Delete" || e.key === "Backspace") && !this.draft) {
          if (this.selection.size) {
            e.preventDefault();
            this.deleteSelection();
          }
          return;
        }
        if (e.key === "Backspace" && this.draft && this.draft.d.points.length > 1) {
          this.draft.d.points.pop();
          this.dirty = true;
          return;
        }
        if (e.key === "Enter" && this.draft) {
          this.finishDraft();
          return;
        }
        if (e.key === "Escape") {
          if (this.qm) {
            this.clearQM();
            if (this.tool === "measure") this.setTool(null);
            return;
          }
          if (this.draft) {
            const def = TOOL_MAP[this.draft.d.type];
            if (def.points === "multi" && this.draft.d.points.length >= 2) this.finishDraft();
            else this.cancelDraft();
          } else if (this.tool || this.mode === "eraser") this.setTool(null), this.setMode("cursor");
          else if (this.selection.size) {
            this.selection.clear();
            this.dirty = true;
            this.hooks.changed?.();
          }
          return;
        }
        // Match the complete modifier combination. This prevents Alt+R (chart reset)
        // from accidentally activating Rectangle, which intentionally uses Alt+Shift+R.
        if (e.repeat) return;
        const keyName = e.code?.startsWith("Key") ? e.code.slice(3).toUpperCase() : e.key.toUpperCase();
        const isMac = /Mac|iPhone|iPad/.test(navigator.platform || "");
        const pressed = {
          // Treat Ctrl-based custom shortcuts as the platform's primary modifier.
          CTRL: e.ctrlKey || (isMac && e.metaKey),
          ALT: e.altKey,
          SHIFT: e.shiftKey,
          META: e.metaKey && !isMac
        };
        const normalize = (part) => part.toUpperCase() === "CMD" || part.toUpperCase() === "META" ? "META" : part.toUpperCase();
        const t2 = Object.values(TOOL_MAP).find((toolDef) => {
          if (!toolDef.hotkey) return false;
          const parts = toolDef.hotkey.split("+").map(normalize);
          const expectedKey = parts.pop();
          if (expectedKey !== keyName) return false;
          return ["CTRL", "ALT", "SHIFT", "META"].every((modifier) =>
            !!pressed[modifier] === parts.includes(modifier));
        });
        if (t2) {
          e.preventDefault();
          e.stopPropagation();
          // Single-anchor line tools should place immediately at the pointer, like a chart hotkey
          // action, instead of requiring a second click to finish the drawing.
          if (["hline", "hray", "vline"].includes(t2.type) && this.placeSinglePointAtPointer(t2.type)) return;
          this.setTool(t2.type);
        }
      };
      /* Hold Ctrl = temporary Brush (left button draws); releasing Ctrl restores the previous tool / mode. */
      this.onCtrlDown = (e) => {
        if (e.key !== "Control" || e.repeat) return;
        const t = e.target;
        if (t && (t.isContentEditable || t.closest?.('input, textarea, select, [contenteditable="true"], [role="textbox"]'))) return;
        this.beginHoldBrush();
      };
      this.onCtrlUp = (e) => {
        if (e.key === "Control") this.endHoldBrush();
      };
      this.onBlur = () => this.endHoldBrush();
      const NS = "http://www.w3.org/2000/svg";
      this.svg = document.createElementNS(NS, "svg");
      this.svg.setAttribute("class", "dr-svg");
      this.svg.setAttribute("font-family", "Trebuchet MS,Roboto,sans-serif");
      this.layer = document.createElementNS(NS, "g");
      this.draftLayer = document.createElementNS(NS, "g");
      this.handlesLayer = document.createElementNS(NS, "g");
      this.qmLayer = document.createElementNS(NS, "g");
      this.svg.append(this.layer, this.draftLayer, this.qmLayer, this.handlesLayer);
      host.appendChild(this.svg);
      store.on(() => {
        this.dirty = true;
      });
      const h = host;
      h.addEventListener("pointerdown", this.onDown, true);
      h.addEventListener("pointermove", this.onHover, true);
      h.addEventListener("pointerleave", this.onLeave, true);
      for (const t of ["mousedown", "touchstart"]) h.addEventListener(t, this.onCompat, true);
      h.addEventListener("dblclick", this.onDbl, true);
      h.addEventListener("contextmenu", this.onCtx, true);
      document.addEventListener("keydown", this.onKey);
      document.addEventListener("keydown", this.onArrow, true);
      document.addEventListener("keydown", this.onShift);
      document.addEventListener("keyup", this.onShift);
      document.addEventListener("keydown", this.onCtrlDown);
      document.addEventListener("keyup", this.onCtrlUp);
      window.addEventListener("blur", this.onBlur);
      const loop = () => {
        this.raf = requestAnimationFrame(loop);
        this.frame();
      };
      this.raf = requestAnimationFrame(loop);
    }
    destroy() {
      cancelAnimationFrame(this.raf);
      document.removeEventListener("keydown", this.onKey);
      document.removeEventListener("keydown", this.onArrow, true);
      document.removeEventListener("keydown", this.onShift);
      document.removeEventListener("keyup", this.onShift);
      document.removeEventListener("keydown", this.onCtrlDown);
      document.removeEventListener("keyup", this.onCtrlUp);
      window.removeEventListener("blur", this.onBlur);
      this.host.removeEventListener("pointerdown", this.onDown, true);
      this.host.removeEventListener("pointermove", this.onHover, true);
      this.host.removeEventListener("pointerleave", this.onLeave, true);
      for (const type of ["mousedown", "touchstart"]) this.host.removeEventListener(type, this.onCompat, true);
      this.host.removeEventListener("dblclick", this.onDbl, true);
      this.host.removeEventListener("contextmenu", this.onCtx, true);
      window.removeEventListener("pointermove", this.onMove);
      window.removeEventListener("pointerup", this.onUp);
      window.removeEventListener("pointercancel", this.onUp);
      this.svg.remove();
    }
    /* ---------- state setters ---------- */
    /** Place a one-point drawing at the current pointer without entering click-to-place mode. */
    placeSinglePointAtPointer(type) {
      const p = this.lastPointer;
      const def = TOOL_MAP[type];
      if (!p || !def || def.points !== 1 || !this.inPlot(p)) return false;
      const anchor = pointToAnchor(this.m, p.x, p.y);
      if (!anchor) return false;
      this.clearQM();
      if (this.draft) this.cancelDraft();
      const drawing = makeDrawing(type, [anchor], this.store.toolDefaults(type));
      def.init?.(drawing, this.m);
      this.store.add(drawing);
      this.tool = null;
      this.mode = "cursor";
      this.selection.clear();
      this.selection.add(drawing.id);
      this.dirty = true;
      this.updateCursor();
      this.hooks.changed?.();
      return true;
    }
    beginHoldBrush() {
      if (this.hold || this.draft || this.gesture || this.qm || !TOOL_MAP.brush) return;
      this.hold = { tool: this.tool, mode: this.mode };
      this.tool = "brush";
      this.mode = "cursor";
      this.dirty = true;
      this.updateCursor();
      this.hooks.changed?.();
    }
    endHoldBrush() {
      if (!this.hold) return;
      if (this.gesture?.k === "draw") {
        this.holdPending = true;
        return;
      }
      const h = this.hold;
      this.hold = null;
      this.holdPending = false;
      if (this.draft) this.cancelDraft();
      this.tool = h.tool;
      this.mode = h.mode;
      this.dirty = true;
      this.updateCursor();
      this.hooks.changed?.();
    }
    setTool(t) {
      this.hold = null;
      this.clearQM();
      if (this.draft) this.cancelDraft();
      this.tool = t;
      if (t) {
        this.mode = "cursor";
        this.selection.clear();
      }
      this.dirty = true;
      this.updateCursor();
      this.hooks.changed?.();
    }
    setMode(m) {
      this.hold = null;
      this.clearQM();
      this.cancelDraft();
      this.tool = null;
      this.mode = m;
      this.selection.clear();
      this.dirty = true;
      this.updateCursor();
      this.hooks.changed?.();
    }
    select(ids, additive = false) {
      if (!additive) this.selection.clear();
      ids.forEach((i) => this.selection.add(i));
      this.dirty = true;
      this.hooks.changed?.();
    }
    selected() {
      return [...this.selection].map((i) => this.store.get(i)).filter(Boolean);
    }
    /* ---------- context / geometry ---------- */
    ctx() {
      const m = this.m, dec = m.decimals();
      return {
        m,
        plot: m.plot(),
        bars: m.bars(),
        dec,
        barSec: m.barSec(),
        selected: false,
        draft: false,
        px: (a) => {
          const x = m.timeToX(a.time), y = m.priceToY(a.price);
          return x == null || y == null ? null : { x, y };
        },
        price: (p) => fmtPrice(p, dec)
      };
    }
    primsOf(d2, c = this.ctx()) {
      try {
        return TOOL_MAP[d2.type].build({ ...c, selected: this.selection.has(d2.id) }, d2);
      } catch {
        return [];
      }
    }
    handlePts(d2, c = this.ctx()) {
      const t = TOOL_MAP[d2.type];
      if (t.handles) return t.handles(c, d2);
      return d2.points.map((a) => c.px(a));
    }
    hitTest(p, onlyId, touchTol) {
      const c = this.ctx(), tol = touchTol ?? HIT_TOL;
      const list = this.store.sorted().filter((d2) => !d2.hidden && (!onlyId || d2.id === onlyId)).reverse();
      for (const d2 of list) {
        if (d2.type === "brush" || d2.type === "highlighter") {
        }
        for (const pr of this.primsOf(d2, c)) if (hitPrim(pr, p, Math.max(tol, (pr.w ?? 1) / 2 + 3))) return d2;
      }
      return null;
    }
    handleAt(p, radius = HANDLE_R + 2) {
      const c = this.ctx();
      let best = null, bd = Infinity;
      for (const d2 of this.selected()) {
        if (d2.locked || d2.hidden) continue;
        const hs = this.handlePts(d2, c);
        for (let i = 0; i < hs.length; i++) {
          const q = hs[i], k = q ? dist(q, p) : Infinity;
          if (k <= radius && k < bd) {
            bd = k;
            best = { d: d2, idx: i };
          }
        }
      }
      return best;
    }
    local(e) {
      const r = this.svg.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    inPlot(p) {
      const r = this.m.plot();
      return p.x >= 0 && p.y >= 0 && p.x <= r.w && p.y <= r.h;
    }
    /* `from` = pixel of the previous point, `fromA` = its exact anchor. Shift snaps the segment to the nearest 45 degrees;
       horizontal / vertical results copy the price / time of `fromA` so the line is exactly level / plumb. */
    anchorAt(p, e, from, fromA) {
      let q = p, snap = 0;
      if (e.shiftKey && from) {
        const dx = p.x - from.x, dy = p.y - from.y, r = Math.hypot(dx, dy), k = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)), a = k * (Math.PI / 4);
        q = { x: from.x + r * Math.cos(a), y: from.y + r * Math.sin(a) };
        snap = k % 4 === 0 ? 1 : Math.abs(k) % 4 === 2 ? 2 : 0;
      }
      const an = pointToAnchor(this.m, q.x, q.y);
      if (an && fromA) {
        if (snap === 1) an.price = fromA.price;
        else if (snap === 2) an.time = fromA.time;
      }
      return an;
    }
    /* ---------- event handlers ---------- */
    ignoreTarget(e) {
      return !!e.target?.closest?.("[data-dr-ui]");
    }
    setHoverCursor(c) {
      if (c === this.hoverClass) return;
      this.host.classList.remove("dr-move", "dr-handle");
      if (c) this.host.classList.add(c);
      this.hoverClass = c;
    }
    updateCursor() {
      this.host.classList.toggle("dr-draw", !!this.tool);
      this.host.classList.toggle("dr-erase", this.mode === "eraser");
      if (this.tool || this.mode === "eraser") this.setHoverCursor("");
    }
    /* --- selection / dragging --- */
    selectDown(p, e) {
      const touch = e.pointerType === "touch", pen = e.pointerType === "pen";
      const hd = this.handleAt(p, touch ? HANDLE_TOUCH_R : pen ? 16 : void 0);
      if (hd) {
        this.store.begin();
        const q = this.handlePts(hd.d)[hd.idx];
        /* keep the grab offset: the handle follows the finger without jumping under it */
        this.gesture = { k: "handle", id: hd.d.id, idx: hd.idx, moved: false, off: q ? { x: q.x - p.x, y: q.y - p.y } : null };
        return true;
      }
      const d2 = this.hitTest(p, void 0, touch ? 14 : pen ? 9 : void 0);
      if (!d2) {
        if (this.selection.size) {
          this.selection.clear();
          this.dirty = true;
          this.hooks.changed?.();
        }
        return false;
      }
      if (e.shiftKey) {
        this.selection.has(d2.id) ? this.selection.delete(d2.id) : this.selection.add(d2.id);
      } else if (!this.selection.has(d2.id)) {
        this.selection.clear();
        this.selection.add(d2.id);
      }
      this.dirty = true;
      this.hooks.changed?.();
      if (d2.locked) return true;
      const orig = /* @__PURE__ */ new Map();
      for (const s of this.selected()) if (!s.locked) orig.set(s.id, s.points.map((a) => ({ ...a })));
      this.store.begin();
      this.gesture = { k: "move", start: p, orig, moved: false };
      return true;
    }
    /* --- eraser --- */
    startErase(p) {
      this.store.begin();
      this.gesture = { k: "erase" };
      const d2 = this.hitTest(p);
      if (d2) this.store.remove([d2.id]);
      return true;
    }
    /* --- drawing --- */
    drawDown(p, e) {
      const def = TOOL_MAP[this.tool];
      const a = this.anchorAt(p, e, this.draft ? this.ctx().px(this.draft.d.points[this.draft.d.points.length - 1]) ?? void 0 : void 0, this.draft ? this.draft.d.points[this.draft.d.points.length - 1] : void 0);
      this.gesture = { k: "draw" };
      if (!a) return;
      if (!this.draft) {
        const d2 = makeDrawing(def.type, [a], this.store.toolDefaults(def.type));
        this.draft = { d: d2, preview: a, down: p, moved: false, free: def.points === "free", px: def.points === "free" ? [{ x: p.x, y: p.y }] : null };
        if (def.points === 1) {
          this.finishDraft();
          return;
        }
      } else {
        this.draft.d.points.push(a);
        this.draft.down = p;
        this.draft.moved = false;
        if (def.points !== "multi" && def.points !== "free" && this.draft.d.points.length >= def.points) {
          this.finishDraft();
          return;
        }
      }
      this.dirty = true;
    }
    updatePreview(p, e) {
      if (!this.draft) return;
      const pts2 = this.draft.d.points, last = this.ctx().px(pts2[pts2.length - 1]) ?? void 0;
      const a = this.anchorAt(p, e, last, pts2[pts2.length - 1]);
      if (a) {
        this.draft.preview = a;
        this.draftDirty = true;
      }
    }
    drawMove(p, e) {
      const dr = this.draft;
      if (!dr) return;
      if (Math.hypot(p.x - dr.down.x, p.y - dr.down.y) > 4) dr.moved = true;
      if (dr.free) {
        /* pixel-space stroke: cheap distance test, no per-move chart lookups; anchors are stored for the final drawing */
        const px = dr.px || (dr.px = []), last = px[px.length - 1];
        if (!last || Math.hypot(p.x - last.x, p.y - last.y) >= 2) {
          if (px.length >= 6000) return;
          const a = pointToAnchor(this.m, p.x, p.y);
          if (a) {
            px.push({ x: p.x, y: p.y });
            dr.d.points.push(a);
            this.draftDirty = true;
          }
        }
      } else this.updatePreview(p, e);
    }
    drawUp(p, e) {
      const dr = this.draft;
      if (!dr) return;
      const def = TOOL_MAP[dr.d.type];
      if (dr.free) {
        this.finishDraft();
        return;
      }
      if (dr.moved && dr.d.points.length === 1 && typeof def.points === "number" && def.points >= 2) {
        this.updatePreview(p, e);
        dr.d.points.push(dr.preview);
        dr.moved = false;
        if (dr.d.points.length >= def.points) this.finishDraft();
        this.dirty = true;
      }
    }
    cancelDraft() {
      this.draft = null;
      this.gesture = null;
      this.dirty = true;
    }
    finishDraft() {
      const dr = this.draft;
      if (!dr) return;
      this.draft = null;
      const d2 = dr.d, def = TOOL_MAP[d2.type], need = typeof def.points === "number" ? def.points : def.minPoints ?? 2;
      if (d2.points.length < need) {
        this.dirty = true;
        return;
      }
      if (need >= 2) {
        const c = this.ctx(), ps = d2.points.map((a) => c.px(a));
        if (ps.every((q) => q && ps[0] && dist(q, ps[0]) < 2)) {
          this.dirty = true;
          return;
        }
      }
      if (def.points === "free") {
        const c = this.ctx(), px = d2.points.map((a) => c.px(a)).filter(Boolean);
        if (px.length === d2.points.length) {
          const keep = simplify(px, 0.8);
          d2.points = keep.map((q) => ({ time: this.m.xToTime(q.x), price: this.m.yToPrice(q.y) }));
        }
      }
      def.init?.(d2, this.m);
      this.store.add(d2);
      this.gesture = null;
      if (!this.stay && !this.hold) {
        this.tool = null;
        this.updateCursor();
      }
      this.selection.clear();
      this.selection.add(d2.id);
      this.hooks.changed?.();
      if (def.editsText) this.hooks.editText?.(d2);
    }
    menuItems(d2) {
      return [
        ["Settings\u2026", () => this.hooks.openSettings?.(d2)],
        ["Clone", () => this.duplicateSelection()],
        [d2.locked ? "Unlock" : "Lock", () => this.store.mutate(() => {
          const v = !d2.locked;
          this.selected().forEach((x) => {
            x.locked = v;
          });
        })],
        ["Hide", () => {
          this.store.mutate(() => {
            this.selected().forEach((x) => {
              x.hidden = true;
            });
          });
          this.selection.clear();
          this.hooks.changed?.();
        }],
        ["Bring to front", () => this.store.bringToFront(d2.id)],
        ["Send to back", () => this.store.sendToBack(d2.id)],
        ["Delete", () => this.deleteSelection(true)]
      ];
    }
    /* ---------- commands ---------- */
    deleteSelection(force = false) {
      const ids = this.selected().filter((d2) => force || !d2.locked).map((d2) => d2.id);
      if (!ids.length) return;
      this.store.remove(ids);
      this.selection.clear();
      this.hooks.changed?.();
    }
    duplicateSelection() {
      const ids = [...this.selection];
      if (!ids.length) return;
      const dt = this.m.barSec() * 3, p = this.lastClose(), dp = p * -0.01;
      const out = this.store.duplicate(ids, dt, dp);
      this.selection = new Set(out.map((d2) => d2.id));
      this.hooks.changed?.();
    }
    lastClose() {
      const b = this.m.bars();
      return b.length ? b[b.length - 1].close : 0;
    }
    copy() {
      return this.store.copy([...this.selection]);
    }
    paste() {
      const dt = this.m.barSec() * 3, p = this.lastClose();
      const out = this.store.paste(dt, p * -0.01);
      if (out.length) {
        this.selection = new Set(out.map((d2) => d2.id));
        this.hooks.changed?.();
      }
    }
    pruneSelection() {
      for (const id of [...this.selection]) if (!this.store.get(id)) this.selection.delete(id);
      this.dirty = true;
      this.hooks.changed?.();
    }
    /* ---------- quick measure (Shift+drag / Measure tool) ----------
       Lives outside the drawing store: no undo entries, no full re-render while dragging. */
    qmAnchor(p, e) {
      return pointToAnchor(this.m, p.x, p.y);
    }
    startQM(p, e) {
      const a = this.qmAnchor(p, e);
      if (!a) return false;
      const d2 = makeDrawing("measure", [a, a], this.store.toolDefaults("measure"));
      this.qm = { d: d2, a, down: p, moved: false, viaTool: this.tool === "measure", waiting: false, frozen: false };
      this.gesture = { k: "qm" };
      this.qmDirty = true;
      this.host.classList.add("dr-draw");
      return true;
    }
    qmTo(p, e) {
      const q = this.qm;
      if (!q) return;
      if (Math.hypot(p.x - q.down.x, p.y - q.down.y) > 3) q.moved = true;
      const b = this.qmAnchor(p, e);
      if (b) {
        q.d.points = [q.a, b];
        this.qmDirty = true;
      }
    }
    qmUp(p, e) {
      const q = this.qm;
      if (!q) return;
      this.qmTo(p, e);
      if (q.moved) {
        if (q.viaTool) this.qmFreeze();
        else this.clearQM();
        return;
      }
      if (q.viaTool) {
        q.waiting = true;
        return;
      }
      this.clearQM();
      const d2 = this.hitTest(p);
      if (d2) {
        this.selection.has(d2.id) ? this.selection.delete(d2.id) : this.selection.add(d2.id);
        this.dirty = true;
        this.hooks.changed?.();
      }
    }
    qmSecond(p, e) {
      this.qmTo(p, e);
      this.qm.moved = true;
      this.qmFreeze();
    }
    qmFreeze() {
      const q = this.qm;
      q.waiting = false;
      q.frozen = true;
      this.qmDirty = true;
      if (!this.stay) {
        this.tool = null;
        this.updateCursor();
        this.hooks.changed?.();
      }
    }
    clearQM() {
      if (!this.qm) return;
      this.qm = null;
      this.qmDirty = true;
      if (this.gesture?.k === "qm") this.gesture = null;
      this.updateCursor();
    }
    renderQM() {
      const q = this.qm;
      this.qmLayer.innerHTML = q ? this.primsOf(q.d, this.ctx()).map(primToSvg).join("") : "";
    }
    /* ---------- rendering ---------- */
    invalidate() {
      this.dirty = true;
    }
    frame() {
      const s = this.m.signature();
      if (this.dirty || s !== this.sig || this.store.rev !== this.lastRev) {
        this.sig = s;
        this.lastRev = this.store.rev;
        this.dirty = false;
        this.draftDirty = false;
        this.render();
        this.qmDirty = !!this.qm || this.qmDirty;
      } else if (this.draftDirty) {
        /* a stroke / preview changed: repaint only the draft layer, not every drawing */
        this.draftDirty = false;
        this.renderDraft(this.ctx());
      }
      if (this.qmDirty) {
        this.qmDirty = false;
        this.renderQM();
      }
    }
    render() {
      const pl = this.m.plot();
      this.svg.style.width = pl.w + "px";
      this.svg.style.height = pl.h + "px";
      const c = this.ctx(), parts = [];
      for (const d2 of this.store.sorted()) {
        if (d2.hidden) continue;
        const prims = this.primsOf(d2, c);
        parts.push(`<g data-id="${d2.id}"${d2.locked ? ' class="dr-locked"' : ""}>${prims.map(primToSvg).join("")}</g>`);
      }
      this.layer.innerHTML = parts.join("");
      this.renderDraft(c);
      const hp = [];
      for (const d2 of this.selected()) {
        if (d2.hidden) continue;
        for (const q of this.handlePts(d2, c)) if (q) hp.push(`<circle cx="${q.x.toFixed(1)}" cy="${q.y.toFixed(1)}" r="${COARSE ? 9 : 5}" class="dr-h${d2.locked ? " lk" : ""}"/>`);
      }
      this.handlesLayer.innerHTML = hp.join("");
      this.hooks.changed?.();
    }
    renderDraft(c) {
      if (!this.draft) {
        if (this.draftLayer.firstChild) this.draftLayer.innerHTML = "";
        return;
      }
      const dr = this.draft, t = TOOL_MAP[dr.d.type];
      if (dr.free && dr.px) {
        /* live stroke straight from pixels */
        const prim = { k: "poly", pts: dr.px, ...strokeOf(dr.d.style) };
        this.draftLayer.innerHTML = `<g opacity="0.9">${primToSvg(prim)}</g>`;
        return;
      }
      const need = typeof t.points === "number" ? t.points : dr.d.points.length + 1;
      const pts2 = [...dr.d.points];
      if (!dr.free) while (pts2.length < need) pts2.push(dr.preview);
      if (t.points === "multi") pts2.push(dr.preview);
      const tmp = { ...dr.d, points: pts2, draft: true };
      this.draftLayer.innerHTML = `<g opacity="0.9">${this.primsOf(tmp, c).map(primToSvg).join("")}</g>`;
    }
    /** bounding box (svg-local px) of the current selection's handles, for the floating toolbar */
    selectionBox() {
      const c = this.ctx(), xs = [], ys = [];
      for (const d2 of this.selected()) {
        if (d2.hidden) continue;
        for (const pr of this.primsOf(d2, c)) {
          if (pr.k === "line") xs.push(pr.a.x, pr.b.x), ys.push(pr.a.y, pr.b.y);
          else if (pr.k === "poly" || pr.k === "path") pr.pts.forEach((q) => (xs.push(q.x), ys.push(q.y)));
          else if (pr.k === "rect") xs.push(pr.r.x, pr.r.x + pr.r.w), ys.push(pr.r.y, pr.r.y + pr.r.h);
          else if (pr.k === "ell") xs.push(pr.c.x - pr.rx, pr.c.x + pr.rx), ys.push(pr.c.y - pr.ry, pr.c.y + pr.ry);
        }
        this.handlePts(d2, c).forEach((q) => q && (xs.push(q.x), ys.push(q.y)));
      }
      if (!xs.length) return null;
      const x = Math.min(...xs), y = Math.min(...ys);
      return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
    }
  };
