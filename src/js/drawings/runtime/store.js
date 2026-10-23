  // store
  var VERSION = 1;
  var seq = 0;
  var newId = () => "d" + Date.now().toString(36) + (seq++).toString(36) + Math.random().toString(36).slice(2, 5);
  var clone = (x) => JSON.parse(JSON.stringify(x));
  function makeDrawing(type, points, defaults) {
    const t = TOOL_MAP[type];
    return {
      id: newId(),
      type,
      points: clone(points),
      style: { ...DEFAULT_STYLE, ...t?.style ?? {}, ...defaults?.style ?? {} },
      props: clone({ ...t?.props ?? {}, ...defaults?.props ?? {} }),
      locked: false,
      hidden: false,
      z: 0
    };
  }
  function validDrawing(x) {
    return x && typeof x.id === "string" && TOOL_MAP[x.type] && Array.isArray(x.points) && x.style && x.props && x.points.every((p) => p && Number.isFinite(p.time) && Number.isFinite(p.price));
  }
  var DrawingStore = class {
    constructor(storage, limit = 100) {
      this.storage = storage;
      this.limit = limit;
      this.items = [];
      this.rev = 0;
      this.undo = [];
      this.redo = [];
      this.pending = null;
      this.listeners = /* @__PURE__ */ new Set();
      this.symbol = "";
      this.clipboard = [];
    }
    on(fn) {
      this.listeners.add(fn);
      return () => this.listeners.delete(fn);
    }
    emit() {
      this.rev++;
      this.listeners.forEach((f) => f());
    }
    key(s) {
      return `dr:v${VERSION}:${s}`;
    }
    snap() {
      return JSON.stringify(this.items);
    }
    load(symbol) {
      this.symbol = symbol;
      this.undo = [];
      this.redo = [];
      this.pending = null;
      const raw = this.storage.get(this.key(symbol), []);
      this.items = Array.isArray(raw) ? raw.filter(validDrawing) : [];
      this.emit();
    }
    save() {
      if (this.symbol) this.storage.set(this.key(this.symbol), this.items);
    }
    /** Per-tool remembered style (TradingView-like "default settings"). */
    toolDefaults(type) {
      return this.storage.get(`dr:def:${type}`, {}) || {};
    }
    saveToolDefaults(d2) {
      this.storage.set(`dr:def:${d2.type}`, { style: d2.style, props: d2.props });
    }
    get(id) {
      return this.items.find((d2) => d2.id === id);
    }
    /** Run a mutation as one undo step (no-op if nothing changed). */
    mutate(fn) {
      const before = this.snap();
      fn();
      this.finish(before);
    }
    begin() {
      if (this.pending == null) this.pending = this.snap();
    }
    /** live change during a drag: repaint + persist, but no history entry until end() */
    touch() {
      this.save();
      this.emit();
    }
    end() {
      const b = this.pending;
      this.pending = null;
      if (b != null) this.finish(b);
    }
    finish(before) {
      const after = this.snap();
      if (after !== before) {
        this.undo.push(before);
        if (this.undo.length > this.limit) this.undo.shift();
        this.redo = [];
      }
      this.save();
      this.emit();
    }
    add(d2) {
      this.mutate(() => {
        d2.z = this.items.reduce((m, x) => Math.max(m, x.z), 0) + 1;
        this.items.push(d2);
      });
      return d2;
    }
    remove(ids) {
      this.mutate(() => {
        this.items = this.items.filter((d2) => !ids.includes(d2.id));
      });
    }
    clear() {
      this.mutate(() => {
        this.items = [];
      });
    }
    update(id, fn) {
      this.mutate(() => {
        const d2 = this.get(id);
        if (d2) fn(d2);
      });
    }
    duplicate(ids, dt, dp) {
      const out = [];
      this.mutate(() => {
        for (const id of ids) {
          const s = this.get(id);
          if (!s) continue;
          const c = clone(s);
          c.id = newId();
          c.locked = false;
          c.points = c.points.map((p) => ({ time: p.time + dt, price: p.price + dp }));
          c.z = this.items.reduce((m, x) => Math.max(m, x.z), 0) + 1;
          this.items.push(c);
          out.push(c);
        }
      });
      return out;
    }
    copy(ids) {
      this.clipboard = ids.map((i) => this.get(i)).filter(Boolean).map((d2) => clone(d2));
      return this.clipboard.length;
    }
    paste(dt, dp) {
      const out = [];
      this.mutate(() => {
        for (const s of this.clipboard) {
          const c = clone(s);
          c.id = newId();
          c.locked = false;
          c.points = c.points.map((p) => ({ time: p.time + dt, price: p.price + dp }));
          c.z = this.items.reduce((m, x) => Math.max(m, x.z), 0) + 1;
          this.items.push(c);
          out.push(c);
        }
      });
      return out;
    }
    bringToFront(id) {
      this.mutate(() => {
        const d2 = this.get(id);
        if (d2) d2.z = this.items.reduce((m, x) => Math.max(m, x.z), 0) + 1;
      });
    }
    sendToBack(id) {
      this.mutate(() => {
        const d2 = this.get(id);
        if (d2) d2.z = this.items.reduce((m, x) => Math.min(m, x.z), 0) - 1;
      });
    }
    setAll(prop, v) {
      this.mutate(() => {
        this.items.forEach((d2) => {
          d2[prop] = v;
        });
      });
    }
    canUndo() {
      return this.undo.length > 0;
    }
    canRedo() {
      return this.redo.length > 0;
    }
    doUndo() {
      const s = this.undo.pop();
      if (s == null) return false;
      this.redo.push(this.snap());
      this.items = JSON.parse(s);
      this.save();
      this.emit();
      return true;
    }
    doRedo() {
      const s = this.redo.pop();
      if (s == null) return false;
      this.undo.push(this.snap());
      this.items = JSON.parse(s);
      this.save();
      this.emit();
      return true;
    }
    sorted() {
      return [...this.items].sort((a, b) => a.z - b.z);
    }
  };
