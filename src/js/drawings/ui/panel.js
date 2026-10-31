  // panel: drawing UI = left toolbar + flyouts, floating selection toolbar, settings dialog (Style / Coordinates tabs), colour pickers
  var el = (tag, cls = "", html = "") => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html) e.innerHTML = html;
    e.setAttribute("data-dr-ui", "");
    return e;
  };
  var getPath = (d2, path) => path.split(".").reduce((o, k) => o == null ? o : o[k], d2);
  function setPath(d2, path, v) {
    const ks = path.split(".");
    let o = d2;
    for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]];
    o[ks[ks.length - 1]] = v;
  }
  var esc2 = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  var hexOf = (c) => /^#[0-9a-f]{6}$/i.test(c) ? c : "#888888";
  /* time zone of the chart's time axis (Tehran, see src/js/app/core/time-format.js); falls back to UTC */
  var TZNAME = typeof TZ === "string" ? TZ : "UTC";
  var wallFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZNAME, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  var wallParts = (t) => { const o = {}; for (const x of wallFmt.formatToParts(new Date(t * 1e3))) o[x.type] = x.value; return o; };
  /* epoch seconds -> "YYYY-MM-DDTHH:MM:SS" wall clock in TZNAME */
  var toWall = (t) => { const o = wallParts(t); return `${o.year}-${o.month}-${o.day}T${o.hour}:${o.minute}:${o.second}`; };
  /* wall clock string -> epoch seconds (two passes so DST offsets are resolved for that date) */
  var fromWall = (str) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(str || "");
    if (!m) return NaN;
    const asUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) / 1e3;
    let t = asUtc;
    for (let k = 0; k < 2; k++) { const o = wallParts(t); t += asUtc - Date.UTC(+o.year, +o.month - 1, +o.day, +o.hour, +o.minute, +o.second) / 1e3; }
    return t;
  };
  /* last selected tab of the drawing settings window ("style" | "coords") */
  var drTab = "style";
  var inGroup = (g) => (d2) => TOOL_MAP[d2.type]?.group === g;
  var DrawingUI = class {
    constructor(host, c, store) {
      this.host = host;
      this.c = c;
      this.store = store;
      this.bar = el("div", "dr-tb");
      this.fly = el("div", "dr-fly");
      this.fb = el("div", "dr-fb");
      this.hint = el("div", "dr-hint");
      this.settings = null;
      this.settingsId = "";
      this.lastTool = {};
      this.flyGroup = "";
      this.btns = /* @__PURE__ */ new Map();
      /* ---------- floating contextual toolbar ---------- */
      this.fbKey = "";
      this.fly.hidden = true;
      this.fb.hidden = true;
      this.hint.hidden = true;
      host.append(this.bar, this.fly, this.fb, this.hint);
      for (const g of GROUPS) this.lastTool[g.id] = TOOLS.find((t) => t.group === g.id).type;
      this.buildBar();
      // Stable outside-pointer handler scoped to this panel instance.
      this.onDocumentPointerDown = (e) => {
        const target = e.target;
        if (target && (this.bar.contains(target) || this.fly.contains(target))) return;
        this.closeFly();
      };
      document.addEventListener("pointerdown", this.onDocumentPointerDown, true);
      c.hooks.changed = () => this.refresh();
      c.hooks.editText = (d2) => this.editText(d2);
      c.hooks.openSettings = (d2) => this.openSettings(d2);
      c.hooks.menu = (x, y, items) => this.menu(x, y, items);
      store.on(() => this.refresh());
      window.addEventListener("indchange", () => this.refresh());
    }
    btn(id, ic, title, fn, cls = "", eventType = "click") {
      const b = el("button", "dr-b " + cls, icon(ic));
      b.title = title;
      b.dataset.id = id;
      b.addEventListener(eventType, (e) => {
        // Handle toolbar group activation on pointerdown for immediate response,
        // while retaining click for all other toolbar actions.
        e.preventDefault();
        e.stopPropagation();
        fn();
      }, { passive: false });
      this.btns.set(id, b);
      return b;
    }
    sep() {
      return el("div", "dr-sep");
    }
    buildBar() {
      const c = this.c, bar = this.bar;
      bar.append(
        this.btn("cursor", "cursor", "Cursor / select (Esc)", () => {
          c.setTool(null);
          c.setMode("cursor");
        }),
        this.sep()
      );
      for (const g of GROUPS) {
        const b = this.btn("g:" + g.id, g.icon, g.label, () => this.openFly(g.id, b), "dr-grp", "pointerdown");
        b.oncontextmenu = (e) => {
          e.preventDefault();
          this.openFly(g.id, b);
        };
        bar.appendChild(b);
      }
      bar.append(
        this.sep(),
        this.btn("lockall", "lock", "Lock / unlock all drawings", () => {
          const v = !store(this).items.every((d2) => d2.locked);
          store(this).setAll("locked", v);
        }),
        this.btn("hideall", "eye", "Hide / show\u2026", () => {
          const b = this.btns.get("hideall").getBoundingClientRect(), st = this.hideState();
          const lHide = st.l !== true, tHide = st.t !== true, iHide = st.i !== true;
          this.menu(b.right + 4, b.top, [
            [lHide ? "Hide lines" : "Show lines", () => this.setGroupHidden("lines", lHide)],
            [tHide ? "Hide tools" : "Show tools", () => this.setGroupHidden("other", tHide)],
            [iHide ? "Hide indicators" : "Show indicators", () => this.setIndicatorsHidden(iHide)]
          ]);
        }),
        this.btn("clear", "trash", "Delete\u2026", () => {
          const b = this.btns.get("clear").getBoundingClientRect();
          const drop = (pred) => () => {
            store(this).clear(pred);
            c.selection.clear();
            c.hooks.changed?.();
          };
          this.menu(b.right + 4, b.top, [
            ["Delete Lines", drop(inGroup("lines"))],
            ["Delete Tools", drop(inGroup("other"))],
            ["Delete Indicators", () => {
              window.IND?.removeAll?.();
            }]
          ]);
        }),
        this.sep(),
        this.btn("undo", "undo", "Undo (Ctrl+Z)", () => {
          store(this).doUndo();
        }),
        this.btn("redo", "redo", "Redo (Ctrl+Shift+Z)", () => {
          store(this).doRedo();
        })
      );
      function store(u) {
        return u.store;
      }
    }
    /* Hidden state per category: true = everything hidden, false = something visible, null = nothing to hide.
       l = lines, t = tools, d = all drawings (lines + tools), i = indicators. */
    hideState() {
      const items = this.store.items, ind = window.IND;
      const of = (g) => {
        const xs = items.filter(inGroup(g));
        return xs.length ? xs.every((d2) => d2.hidden) : null;
      };
      return {
        l: of("lines"),
        t: of("other"),
        d: items.length ? items.every((d2) => d2.hidden) : null,
        i: ind && ind.count && ind.count() ? ind.allHidden() : null
      };
    }
    setDrawingsHidden(v) {
      this.store.setAll("hidden", v);
      if (v) this.c.selection.clear();
      this.refresh();
    }
    /* Hide / show only the drawings of one toolbar tab ("lines" or "other" = Tools), independent of the other tab. */
    setGroupHidden(g, v) {
      this.store.setAll("hidden", v, inGroup(g));
      if (v) for (const id of [...this.c.selection]) if (this.store.get(id)?.hidden) this.c.selection.delete(id);
      this.refresh();
    }
    setIndicatorsHidden(v) {
      window.IND?.setVisible?.(!v);
      this.refresh();
    }
    openFly(gid, anchor) {
      if (this.flyGroup === gid && !this.fly.hidden) {
        this.closeFly();
        return;
      }
      this.flyGroup = gid;
      const tools = TOOLS.filter((t) => t.group === gid);
      this.fly.innerHTML = `<div class="dr-fh">${esc2(GROUPS.find((g) => g.id === gid).label)}</div>` + tools.map((t) => `<button data-t="${t.type}" data-dr-ui>${icon(t.icon, 18)}<span>${esc2(t.label)}</span><em>${t.hotkey ?? ""}</em></button>`).join("");
      this.fly.querySelectorAll("button").forEach((b) => b.onclick = () => {
        const t = b.dataset.t;
        this.lastTool[gid] = t;
        this.closeFly();
        this.c.setTool(t);
      });
      const r = anchor.getBoundingClientRect(), h = this.host.getBoundingClientRect();
      this.fly.hidden = false;
      this.fly.style.left = r.right - h.left + 4 + "px";
      this.fly.style.top = Math.max(4, Math.min(r.top - h.top, h.height - this.fly.offsetHeight - 4)) + "px";
    }
    closeFly() {
      // Idempotent: safe for outside clicks, selections and rapid repeated clicks.
      this.fly.hidden = true;
      this.flyGroup = "";
    }
    destroy() {
      document.removeEventListener("pointerdown", this.onDocumentPointerDown, true);
      this.closeFly();
    }
    /* ---------- refresh (toolbar state, floating bar, hint) ---------- */
    refresh() {
      const c = this.c, cur = c.tool ? TOOL_MAP[c.tool] : null;
      if (cur && !c.hold) this.lastTool[cur.group] = cur.type;
      const on = (id, v) => this.btns.get(id)?.classList.toggle("on", v);
      on("cursor", !c.tool && c.mode === "cursor");
      for (const g of GROUPS) {
        const b = this.btns.get("g:" + g.id);
        const t = TOOL_MAP[this.lastTool[g.id]];
        b.classList.toggle("on", cur?.group === g.id);
        b.innerHTML = icon(t.icon);
        b.title = `${g.label}: ${t.label}`;
      }
      const items = this.store.items;
      this.btns.get("lockall").innerHTML = icon(items.length && items.every((d2) => d2.locked) ? "lock" : "unlock");
      on("lockall", !!items.length && items.every((d2) => d2.locked));
      const hs = this.hideState(), hAny = hs.d === true || hs.i === true || hs.l === true || hs.t === true, hAll = hAny && hs.d !== false && hs.i !== false;
      this.btns.get("hideall").innerHTML = icon(hAll ? "eyeoff" : "eye");
      on("hideall", hAny);
      this.btns.get("undo").disabled = !this.store.canUndo();
      this.btns.get("redo").disabled = !this.store.canRedo();
      if (cur) {
        const n = c.draft ? c.draft.d.points.length : 0, need = typeof cur.points === "number" ? cur.points : 0;
        this.hint.hidden = false;
        this.hint.textContent = cur.points === "free" ? `${cur.label}: press and drag` : cur.points === "multi" ? `${cur.label}: click to add points \xB7 double-click / Enter to finish` : `${cur.label}: click ${need === 1 ? "to place" : `point ${n + 1} of ${need}`} \xB7 Esc to cancel`;
      } else if (c.mode === "eraser") {
        this.hint.hidden = false;
        this.hint.textContent = "Eraser: click or drag over drawings to delete them";
      } else this.hint.hidden = true;
      this.updateFloating();
    }
    updateFloating() {
      const sel = this.c.selected();
      if (!sel.length || this.c.draft || this.c.tool) {
        this.fb.hidden = true;
        this.fbKey = "";
        return;
      }
      const box = this.c.selectionBox();
      if (!box) {
        this.fb.hidden = true;
        return;
      }
      const d2 = sel[0], def = TOOL_MAP[d2.type];
      const key = sel.map((x2) => x2.id).join() + d2.locked + sel.length + d2.style.color + d2.style.width + d2.style.dash + d2.style.fill;
      if (key !== this.fbKey) {
        this.fbKey = key;
        const hasFill = def.fields.some((f) => f.key === "style.fill"), hasLine = def.fields.some((f) => f.key === "style.color");
        this.fb.innerHTML = "";
        const add = (n) => this.fb.appendChild(n);
        const addColorPicker = (key2, title) => {
          const wrap = el("div", "dr-float-color");
          const toggle = el("button", "icolor-toggle", `<span class="icolor-swatch" style="background:${hexOf(d2.style[key2])}"></span>${title}`);
          toggle.type = "button"; toggle.setAttribute("aria-expanded", "false");
          const panel = el("div", "dr-color-panel"); panel.hidden = true;
          panel.innerHTML = `${ColorPalette.html((c) => `data-float-color="${c}"`)}<label>HEX <input type="text" class="ihex" value="${hexOf(d2.style[key2])}" maxlength="7"></label><div class="iopacity"><span>Opacity</span><input type="range" min="0" max="100" value="${d2.style.opacity ?? 100}"><output>${d2.style.opacity ?? 100}%</output></div>`;
          toggle.onclick = () => { const open = panel.hidden; this.fb.querySelectorAll(".dr-color-panel").forEach((x2) => x2.hidden = true); this.fb.querySelectorAll(".dr-float-color .icolor-toggle").forEach((x2) => x2.setAttribute("aria-expanded", "false")); panel.hidden = !open; toggle.setAttribute("aria-expanded", String(open)); };
          const setColor = (hex) => { this.store.begin(); sel.forEach((x2) => { x2.style[key2] = hex; if (key2 === "color" && !hasFill) x2.style.fill = hex; }); sel.forEach((x2) => this.store.saveToolDefaults(x2)); this.store.touch(); this.store.end(); toggle.querySelector(".icolor-swatch").style.background = hex; panel.querySelector(".ihex").value = hex; };
          panel.querySelectorAll("[data-float-color]").forEach((b) => b.onclick = () => setColor(b.dataset.floatColor));
          const hex = panel.querySelector(".ihex"); hex.onchange = () => { if (/^#[0-9a-f]{6}$/i.test(hex.value)) setColor(hex.value); else hex.value = hexOf(d2.style[key2]); };
          const range = panel.querySelector('input[type="range"]'), output = panel.querySelector("output");
          range.onpointerdown = () => this.store.begin();
          range.oninput = () => { const opacity = Math.max(0, Math.min(100, +range.value)); sel.forEach((x2) => { x2.style.opacity = opacity; this.store.saveToolDefaults(x2); }); this.store.touch(); output.textContent = opacity + "%"; };
          range.onchange = () => this.store.end();
          wrap.append(toggle, panel); add(wrap);
        };
        if (hasLine) addColorPicker("color", "Color");
        if (hasFill) addColorPicker("fill", "Fill");
        if (def.fields.some((f) => f.key === "style.width")) {
          const w3 = el("select");
          w3.title = "Line width";
          w3.innerHTML = [1, 2, 3, 4, 6].map((n) => `<option ${n === d2.style.width ? "selected" : ""}>${n}</option>`).join("");
          w3.onchange = () => this.store.mutate(() => sel.forEach((x2) => {
            x2.style.width = +w3.value;
            this.store.saveToolDefaults(x2);
          }));
          add(w3);
          const ds = el("select");
          ds.title = "Line style";
          ds.innerHTML = ["solid", "dashed", "dotted"].map((n) => `<option ${n === d2.style.dash ? "selected" : ""}>${n}</option>`).join("");
          ds.onchange = () => this.store.mutate(() => sel.forEach((x2) => {
            x2.style.dash = ds.value;
            this.store.saveToolDefaults(x2);
          }));
          add(ds);
        }
        const mk2 = (ic, t, fn) => {
          const b = el("button", "dr-fbb", icon(ic, 16));
          b.title = t;
          b.onclick = fn;
          add(b);
        };
        mk2("gear", "Settings", () => this.openSettings(d2));
        mk2(d2.locked ? "lock" : "unlock", d2.locked ? "Unlock" : "Lock", () => this.store.mutate(() => {
          const v = !d2.locked;
          sel.forEach((x2) => {
            x2.locked = v;
          });
        }));
        mk2("eyeoff", "Hide", () => {
          this.store.mutate(() => sel.forEach((x2) => {
            x2.hidden = true;
          }));
          this.c.selection.clear();
          this.c.hooks.changed?.();
        });
        mk2("copy", "Clone (Ctrl+D)", () => this.c.duplicateSelection());
        mk2("trash", "Delete (Del)", () => this.c.deleteSelection(true));
      }
      this.fb.hidden = false;
      const hr = this.host.getBoundingClientRect(), sr = this.c.svg.getBoundingClientRect();
      const w2 = this.fb.offsetWidth, h = this.fb.offsetHeight;
      let x = sr.left - hr.left + box.x + box.w / 2 - w2 / 2, y = sr.top - hr.top + box.y - h - 10;
      if (y < 4) y = sr.top - hr.top + box.y + box.h + 10;
      x = Math.max(sr.left - hr.left + 4, Math.min(x, sr.left - hr.left + sr.width - w2 - 4));
      y = Math.max(4, Math.min(y, hr.height - h - 40));
      this.fb.style.left = x + "px";
      this.fb.style.top = y + "px";
    }
    /* ---------- text editor ---------- */
    editText(d2) {
      const box = this.c.selectionBox(), sr = this.c.svg.getBoundingClientRect(), hr = this.host.getBoundingClientRect();
      const ta = el("textarea", "dr-ta");
      ta.value = d2.props.text ?? "";
      ta.rows = 2;
      ta.style.left = sr.left - hr.left + (box?.x ?? 40) + "px";
      ta.style.top = sr.top - hr.top + (box?.y ?? 40) + "px";
      this.host.appendChild(ta);
      ta.focus();
      ta.select();
      let done = false;
      const end = (ok) => {
        if (done) return;
        done = true;
        if (ok && ta.value !== d2.props.text) this.store.update(d2.id, (x) => {
          x.props.text = ta.value || " ";
        });
        ta.remove();
      };
      ta.onkeydown = (e) => {
        e.stopPropagation();
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          end(true);
        }
        if (e.key === "Escape") end(false);
      };
      ta.onblur = () => end(true);
    }
    /* ---------- settings dialog ---------- */
    openSettings(d2) {
      this.closeSettings();
      const def = TOOL_MAP[d2.type], p = el("div", "dr-set");
      this.settings = p;
      this.settingsId = d2.id;
      p.innerHTML = `<div class="dr-sh"><b>${esc2(def.label)}</b><button class="dr-x" type="button" title="Close" aria-label="Close" data-dr-ui>\u2715</button></div><div class="dr-tabs" role="tablist" data-dr-ui></div><div class="dr-sb dr-sb-style"></div><div class="dr-sb dr-sb-coords" hidden></div>
      <div class="dr-sf"><button type="button" data-a="def" data-dr-ui>Reset to Default</button><button data-a="ok" class="pri" data-dr-ui>Done</button></div>`;
      const body = p.querySelector(".dr-sb-style"), cbody = p.querySelector(".dr-sb-coords"), tabs = p.querySelector(".dr-tabs");
      this.store.begin();
      const rows = [];
      const live = () => {
        this.store.saveToolDefaults(d2); /* every change is remembered for the next drawing of this tool */
        this.store.touch();
        rows.forEach((r) => r.sync?.());
      };
      for (const f of def.fields) {
        if (f.when && !f.when(d2)) continue;
        const r = this.fieldRow(d2, f, live);
        rows.push(r);
        body.appendChild(r);
      }
      /* ---- Coordinates tab: one aligned row per anchor point (price + date/time in the chart's time zone) ---- */
      const hasCoords = !def.hideCoords && d2.points.length, showTime = def.group !== "lines";
      if (hasCoords) {
        const pts2 = el("div", "dr-pts"), n = d2.points.length, dec = this.c.m.decimals();
        pts2.innerHTML = `<div class="dr-cr dr-cr-h"><span></span><span>Price</span>${showTime ? "<span>Time</span>" : ""}</div>`;
        if (!showTime) pts2.classList.add("no-time");
        const names = n === 2 ? ["Start", "End"] : n === 3 ? ["A", "B", "C"] : null;
        d2.points.forEach((a, i) => {
          const row = el("div", "dr-cr");
          row.innerHTML = `<span title="Point ${i + 1}">${names ? names[i] : "P" + (i + 1)}</span>`;
          const pr = el("input");
          pr.type = "number";
          pr.step = "any";
          pr.value = fmtPrice(a.price, dec);
          pr.title = "Price";
          pr.onchange = () => {
            if (Number.isFinite(+pr.value) && pr.value !== "") {
              d2.points[i].price = +pr.value;
              live();
            }
          };
          const tm = showTime ? el("input") : null;
          if (tm) tm.type = "datetime-local";
          if (tm) {
            tm.step = "1";
            tm.title = "Time (" + TZNAME + ")";
            tm.value = toWall(a.time);
            tm.onchange = () => {
              const t = fromWall(tm.value);
              if (Number.isFinite(t)) {
                d2.points[i].time = t;
                live();
              }
            };
          }
          row.sync = () => {
            if (document.activeElement !== pr) pr.value = fmtPrice(d2.points[i].price, dec);
            if (tm && document.activeElement !== tm) tm.value = toWall(d2.points[i].time);
          };
          rows.push(row);
          tm ? row.append(pr, tm) : row.append(pr);
          pts2.appendChild(row);
        });
        cbody.appendChild(pts2);
      }
      /* ---- tabs (Style / Coordinates), TradingView-style; a single pane needs no tab bar ---- */
      const hasStyle = body.children.length > 0;
      const showTab = (id) => {
        if (!hasCoords || !hasStyle) id = hasCoords ? "coords" : "style";
        drTab = id;
        body.hidden = id !== "style";
        cbody.hidden = id !== "coords";
        tabs.querySelectorAll("button").forEach((x) => {
          const on = x.dataset.tab === id;
          x.classList.toggle("on", on);
          x.setAttribute("aria-selected", String(on));
        });
      };
      if (hasCoords && hasStyle) {
        for (const [id, label] of [["style", "Style"], ["coords", "Coordinates"]]) {
          const tb = el("button", "", label);
          tb.type = "button";
          tb.dataset.tab = id;
          tb.setAttribute("role", "tab");
          tb.onclick = () => showTab(id);
          tabs.appendChild(tb);
        }
      } else tabs.hidden = true;
      showTab(drTab);
      /* Draggable: grab the title bar (same behaviour as the indicator settings panel). */
      const head = p.querySelector(".dr-sh");
      head.setAttribute("data-dr-ui", "");
      head.style.cursor = "move";
      head.style.userSelect = "none";
      head.style.touchAction = "none";
      let dragS = null;
      head.addEventListener("pointerdown", (e) => {
        if (e.target.closest("button")) return;
        const hr = this.host.getBoundingClientRect(), pr = p.getBoundingClientRect();
        dragS = { x: e.clientX, y: e.clientY, left: pr.left - hr.left, top: pr.top - hr.top, w: pr.width, h: pr.height, hw: hr.width, hh: hr.height };
        head.setPointerCapture?.(e.pointerId);
        e.preventDefault();
        e.stopPropagation();
      });
      head.addEventListener("pointermove", (e) => {
        if (!dragS) return;
        const l = Math.max(0, Math.min(dragS.hw - dragS.w, dragS.left + e.clientX - dragS.x));
        const t = Math.max(0, Math.min(dragS.hh - Math.min(dragS.h, dragS.hh), dragS.top + e.clientY - dragS.y));
        p.style.left = l + "px";
        p.style.top = t + "px";
      });
      const endDrag = () => { dragS = null; };
      head.addEventListener("pointerup", endDrag);
      head.addEventListener("pointercancel", endDrag);
      const close = () => this.closeSettings();
      p.querySelector(".dr-x").onclick = close;
      p.querySelector("[data-a=ok]").onclick = close;
      p.querySelector("[data-a=def]").onclick = () => {
        const left = p.style.left, top = p.style.top;
        this.store.resetTool(d2);
        this.openSettings(d2); /* rebuild the form with the original values, keeping the window where the user put it */
        if (this.settings && left) { this.settings.style.left = left; this.settings.style.top = top; }
      };
      this.host.appendChild(p);
      p.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Escape") close();
      });
    }
    closeSettings() {
      if (this.settings) {
        this.settings.remove();
        this.settings = null;
        this.store.end();
      }
    }
    fieldRow(d2, f, live) {
      const row = el("div", "dr-row");
      row.innerHTML = `<span>${esc2(f.label)}</span>`;
      const m = this.c.m;
      const v = f.get ? f.get(d2, m) : getPath(d2, f.key);
      const set = (x) => {
        if (f.set) f.set(d2, x, m);
        else setPath(d2, f.key, x);
        live();
      };
      let inp;
      switch (f.type) {
        case "color": {
          const wrap = el("div", "dr-color-control");
          const toggle = el("button", "icolor-toggle", `<span class="icolor-swatch" style="background:${hexOf(v)}"></span>Color`); toggle.type = "button"; toggle.setAttribute("aria-expanded", "false");
          const panel = el("div", "dr-color-panel"); panel.hidden = true;
          panel.innerHTML = `${ColorPalette.html((c) => `data-draw-color="${c}"`)}<label>HEX <input type="text" class="ihex" value="${hexOf(v)}" maxlength="7"></label><div class="iopacity"><span>Opacity</span><input type="range" min="0" max="100" value="${d2.style.opacity ?? 100}"><output>${d2.style.opacity ?? 100}%</output></div>`;
          toggle.onclick = () => { panel.hidden = !panel.hidden; toggle.setAttribute("aria-expanded", String(!panel.hidden)); };
          const update = (hex) => { set(hex); toggle.querySelector(".icolor-swatch").style.background = hex; panel.querySelector(".ihex").value = hex; };
          panel.querySelectorAll("[data-draw-color]").forEach((b) => b.onclick = () => update(b.dataset.drawColor));
          const hi = panel.querySelector(".ihex"); hi.onchange = () => { if (/^#[0-9a-f]{6}$/i.test(hi.value)) update(hi.value); else hi.value = hexOf(getPath(d2, f.key)); };
          const range = panel.querySelector('input[type="range"]'), out = panel.querySelector("output");
          range.onpointerdown = () => live();
          range.oninput = () => { d2.style.opacity = Math.max(0, Math.min(100, +range.value)); out.textContent = range.value + "%"; live(); };
          inp = wrap; wrap.append(toggle, panel); break;
        }
        case "number": {
          const i = el("input");
          i.type = "number";
          i.value = String(v);
          if (f.min != null) i.min = String(f.min);
          if (f.max != null) i.max = String(f.max);
          i.step = String(f.step ?? 1);
          i.onchange = () => {
            let n = +i.value;
            if (!Number.isFinite(n)) return;
            if (f.min != null) n = Math.max(f.min, n);
            if (f.max != null) n = Math.min(f.max, n);
            i.value = String(n);
            set(n);
            if (f.get) i.value = String(f.get(d2, m));
          };
          if (f.get) row.sync = () => {
            if (document.activeElement !== i) i.value = String(f.get(d2, m));
          };
          inp = i;
          break;
        }
        case "bool": {
          const i = el("input");
          i.type = "checkbox";
          i.checked = !!v;
          i.onchange = () => set(i.checked);
          inp = i;
          break;
        }
        case "select": {
          const i = el("select");
          i.innerHTML = (f.options ?? []).map((o) => {
            const [val, lab] = Array.isArray(o) ? o : [o, o];
            return `<option value="${esc2(val)}" ${val === v ? "selected" : ""}>${esc2(lab)}</option>`;
          }).join("");
          i.onchange = () => set(i.value);
          inp = i;
          break;
        }
        case "text": {
          const i = el("input");
          i.type = "text";
          i.value = v ?? "";
          i.oninput = () => set(i.value);
          inp = i;
          break;
        }
        case "textarea": {
          const i = el("textarea");
          i.rows = 3;
          i.value = v ?? "";
          i.oninput = () => set(i.value);
          inp = i;
          break;
        }
        case "levels": {
          const wrap = el("div", "dr-lv");
          row.classList.add("col");
          v.forEach((l) => {
            const r = el("div", "dr-lr"), cb = el("input");
            cb.type = "checkbox";
            cb.checked = l.on;
            cb.onchange = () => {
              l.on = cb.checked;
              live();
            };
            const nv = el("input");
            nv.type = "number";
            nv.step = "any";
            nv.value = String(l.v);
            nv.onchange = () => {
              if (Number.isFinite(+nv.value)) {
                l.v = +nv.value;
                live();
              }
            };
            const co = el("input");
            co.type = "color";
            co.value = hexOf(l.color);
            co.oninput = () => {
              l.color = co.value;
              live();
            };
            r.append(cb, nv, co);
            wrap.appendChild(r);
          });
          inp = wrap;
          break;
        }
      }
      row.appendChild(inp);
      return row;
    }
    /* ---------- tiny context menu (falls back if app's showMenu is unavailable) ---------- */
    menu(x, y, items) {
      const w2 = window;
      if (typeof w2.showMenu === "function") {
        w2.showMenu(x, y, items);
        return;
      }
      const m = el("div", "dr-menu");
      m.style.left = x + "px";
      m.style.top = y + "px";
      items.forEach(([t, fn]) => {
        const b = el("button", "", esc2(t));
        b.onclick = () => {
          m.remove();
          fn();
        };
        m.appendChild(b);
      });
      document.body.appendChild(m);
      const off = (e) => {
        if (!m.contains(e.target)) {
          m.remove();
          document.removeEventListener("pointerdown", off, true);
        }
      };
      document.addEventListener("pointerdown", off, true);
    }
  };
