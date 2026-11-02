/* ---------- Multi-chart (main page) ----------
   Up to 4 charts at once. Chart 1 is this page's own chart; charts 2-4 are the same app in iframes (see ui/pane-mode.js).
   - one timeframe for all: the main page writes it to localStorage, the panes follow through the storage event
   - one indicator list for all: every chart saves / reloads the shared list (indicators engine)
   - ONE left drawing toolbar (this page's): its buttons are proxied to the drawing controller of the ACTIVE chart
   - the watchlist chooses the coin of the active chart; clicking a chart makes it active */
var MC = PANE ? null : (() => { /* panes have no layout of their own */
    const LAYOUTS = {
        '1': { n: 1, label: '1 chart', icon: '<rect x="3" y="4" width="14" height="12" rx="1.5"/>' },
        '2v': { n: 2, areas: '"a b"', cols: '1fr 1fr', rows: '1fr', label: '2 charts · side by side', icon: '<rect x="3" y="4" width="6" height="12" rx="1.2"/><rect x="11" y="4" width="6" height="12" rx="1.2"/>' },
        '2h': { n: 2, areas: '"a" "b"', cols: '1fr', rows: '1fr 1fr', label: '2 charts · stacked', icon: '<rect x="3" y="4" width="14" height="5.2" rx="1.2"/><rect x="3" y="10.8" width="14" height="5.2" rx="1.2"/>' },
        '3': { n: 3, areas: '"a b" "c c"', cols: '1fr 1fr', rows: '1fr 1fr', label: '3 charts', icon: '<rect x="3" y="4" width="6" height="5.2" rx="1.2"/><rect x="11" y="4" width="6" height="5.2" rx="1.2"/><rect x="3" y="10.8" width="14" height="5.2" rx="1.2"/>' },
        '4': { n: 4, areas: '"a b" "c d"', cols: '1fr 1fr', rows: '1fr 1fr', label: '4 charts', icon: '<rect x="3" y="4" width="6" height="5.2" rx="1.2"/><rect x="11" y="4" width="6" height="5.2" rx="1.2"/><rect x="3" y="10.8" width="6" height="5.2" rx="1.2"/><rect x="11" y="10.8" width="6" height="5.2" rx="1.2"/>' },
    };
    const AREA = ['a', 'b', 'c', 'd'], PANE_COINS = ['ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT'];
    const KEY = 'mcLayout';
    const saved = store.get(KEY, {});
    let id = LAYOUTS[saved.id] ? saved.id : '1', act = Number.isInteger(saved.a) ? saved.a : 0, n = 1;
    let wrap = null, grid = null, cells = [], frames = [], home = null, barUI = null;
    const barFns = new Set();
    const btn = $('btnMulti'), menu = $('mcmenu');
    /* works only over http(s) (the main page must be able to reach into the iframes) and on a wide window */
    const httpOk = () => /^https?:$/.test(location.protocol);
    const wide = () => innerWidth > 820;
    const save = () => store.set(KEY, { id, a: act });
    const paneWin = i => { try { return i ? (frames[i] && frames[i].contentWindow) : window; } catch (_) { return null; } };
    const ready = i => { const w = paneWin(i); return !!(w && (i ? w.MCP : true) && w.DR); };
    const activeDR = () => (ready(act) ? paneWin(act).DR : null);
    /* ---------- coins of the extra charts ---------- */
    function ensureSym(i) {
        const k = 'chartSelectedSymbol.p' + i;
        if (typeof store.get(k, null) === 'string')
            return;
        const used = new Set([sym]);
        for (let j = 1; j < 4; j++) { const v = store.get('chartSelectedSymbol.p' + j, null); if (typeof v === 'string') used.add(v); }
        store.set(k, PANE_COINS.find(c => !used.has(c)) || 'ETHUSDT');
    }
    /* ---------- left drawing toolbar shared by every chart ---------- */
    function createBar() {
        if (barUI || !window.DRX || !window.DR)
            return;
        const forward = (get, own) => new Proxy({}, {
            get(_, k) {
                if (own && k in own)
                    return own[k];
                const t = get(), v = t[k];
                return typeof v === 'function' ? v.bind(t) : v;
            },
            set(_, k, v) { get()[k] = v; return true; },
        });
        const dr = () => activeDR() || window.DR;
        const ctlP = forward(() => dr().ctl, { hooks: {} });
        const stP = forward(() => dr().store, { on: f => { barFns.add(f); return () => barFns.delete(f); } });
        barUI = new DRX.DrawingUI(document.createElement('div'), ctlP, stP);
        /* only the left bar + its flyout belong here: the floating drawing bar, hint and settings stay inside each chart */
        barUI.fb.remove();
        barUI.hint.remove();
        barUI.updateFloating = () => { };
        /* after a toolbar click the keyboard must work on the active chart (Esc, Delete, Ctrl+Z ...) */
        const focusSoon = () => setTimeout(focusActive, 0);
        barUI.bar.addEventListener('pointerup', focusSoon, true);
        barUI.fly.addEventListener('pointerup', focusSoon, true);
    }
    function focusActive() {
        const w = paneWin(act);
        try { w && w.focus(); } catch (_) { }
    }
    function barChanged(i) {
        if (i !== act)
            return;
        barFns.forEach(f => { try { f(); } catch (_) { } });
    }
    /* ---------- layout ---------- */
    function teardown() {
        frames.forEach(f => f && f.remove());
        frames = [];
        cells = [];
        if (wrap) {
            if (barUI) { barUI.bar.remove(); barUI.fly.remove(); barUI.closeFly(); }
            home.parent.insertBefore($('cw'), home.next);
            wrap.remove();
            wrap = grid = null;
        }
        document.body.classList.remove('mc-on');
        n = 1;
        act = 0;
        window.mcInactive = false;
        syncWS();
    }
    function build(L) {
        const first = !wrap;
        if (first) {
            const cw = $('cw');
            home = { parent: cw.parentNode, next: cw.nextSibling };
            wrap = document.createElement('div');
            wrap.className = 'mc-wrap';
            grid = document.createElement('div');
            grid.className = 'mc-grid';
            wrap.appendChild(grid);
            home.parent.insertBefore(wrap, cw);
            const c0 = document.createElement('div');
            c0.className = 'mc-cell';
            c0.appendChild(cw);
            cells[0] = c0;
            document.body.classList.add('mc-on');
        }
        n = L.n;
        grid.style.gridTemplateAreas = L.areas;
        grid.style.gridTemplateColumns = L.cols;
        grid.style.gridTemplateRows = L.rows;
        for (let i = 0; i < 4; i++) {
            if (i >= n) { /* chart no longer in the layout: its iframe (and WebSocket) goes away */
                if (cells[i]) { cells[i].remove(); cells[i] = null; frames[i] = null; }
                continue;
            }
            if (!cells[i]) {
                ensureSym(i);
                const c = document.createElement('div'), f = document.createElement('iframe');
                c.className = 'mc-cell';
                f.className = 'mc-frame';
                f.title = 'Chart ' + (i + 1);
                f.src = location.pathname + '?pane=' + i;
                c.appendChild(f);
                cells[i] = c;
                frames[i] = f;
            }
            cells[i].style.gridArea = AREA[i];
            if (cells[i].parentNode !== grid)
                grid.appendChild(cells[i]);
        }
        cells[0].style.gridArea = AREA[0];
        if (cells[0].parentNode !== grid)
            grid.insertBefore(cells[0], grid.firstChild);
        createBar();
        if (barUI) {
            barUI.host = wrap;
            wrap.append(barUI.bar, barUI.fly);
        }
    }
    function setFlags() {
        for (let i = 0; i < n; i++) {
            const w = paneWin(i);
            if (!w)
                continue;
            const off = n > 1 && i !== act;
            if (w.mcInactive !== off) {
                w.mcInactive = off;
                try { w.syncWS && w.syncWS(); } catch (_) { }
            }
        }
    }
    function activate(i) {
        if (!(i >= 0 && i < n))
            i = 0;
        act = i;
        cells.forEach((c, k) => c && c.classList.toggle('mc-act', n > 1 && k === i));
        setFlags();
        if (barUI) { barUI.closeFly(); barUI.refresh(); }
        save();
        sched(); /* watchlist: highlight the coin of this chart */
    }
    function apply(nid) {
        if (!LAYOUTS[nid])
            nid = '1';
        id = nid;
        const eff = httpOk() && wide() ? LAYOUTS[nid] : LAYOUTS['1'];
        if (eff.n === 1) {
            if (wrap) teardown();
        }
        else {
            build(eff);
            activate(act < eff.n ? act : 0);
            /* a chart that finished loading after the layout was applied still has to learn whether it is the active one */
            frames.forEach((f, i) => { if (f) waitReady(i); });
        }
        syncMenu();
        save();
    }
    function waitReady(i, tries = 0) {
        if (ready(i)) {
            setFlags();
            barChanged(i);
            return;
        }
        if (tries < 300 && frames[i])
            setTimeout(() => waitReady(i, tries + 1), 100);
    }
    /* ---------- top bar button + menu ---------- */
    const svg = (inner, s = 18) => `<svg viewBox="0 0 20 20" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">${inner}</svg>`;
    function syncMenu() {
        btn.innerHTML = svg(LAYOUTS[id].icon, 18);
        btn.title = 'Multi-chart: ' + LAYOUTS[id].label;
        btn.setAttribute('aria-label', 'Multi-chart layout: ' + LAYOUTS[id].label);
        menu.innerHTML = Object.keys(LAYOUTS).map(k => `<button type="button" role="menuitemradio" data-l="${k}" aria-checked="${k === id}" class="${k === id ? 'on' : ''}">${svg(LAYOUTS[k].icon, 20)}<span>${LAYOUTS[k].label}</span></button>`).join('')
            + (httpOk() ? '' : '<div class="mc-note">Multi-chart needs the page to be opened over http(s) (a local server or GitHub Pages), not as a file.</div>');
    }
    function closeMenu() { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); }
    btn.onclick = e => {
        e.stopPropagation();
        if (!menu.hidden)
            return closeMenu();
        const main = $('main'), b = btn.getBoundingClientRect(), m = main.getBoundingClientRect();
        menu.hidden = false;
        menu.style.left = Math.max(8, Math.min(b.left - m.left, main.clientWidth - menu.offsetWidth - 8)) + 'px';
        menu.style.top = b.bottom - m.top + 3 + 'px';
        btn.setAttribute('aria-expanded', 'true');
    };
    menu.onclick = e => {
        const b = e.target.closest('button[data-l]');
        if (!b)
            return;
        closeMenu();
        apply(b.dataset.l);
    };
    document.addEventListener('pointerdown', e => { if (!menu.hidden && !menu.contains(e.target) && !btn.contains(e.target)) closeMenu(); });
    addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });
    /* Replay is a top-bar button: with several charts it replays the active one */
    $('bar').addEventListener('click', e => {
        const b = e.target.closest('#btnReplay');
        if (!b || n < 2 || act === 0)
            return;
        const w = paneWin(act), t = w && w.document.getElementById('btnReplay');
        if (t) {
            e.stopPropagation();
            e.preventDefault();
            t.click();
        }
    }, true);
    /* clicking this page's own chart makes chart 1 the active one */
    $('cw').addEventListener('pointerdown', () => { if (n > 1 && act !== 0) activate(0); }, true);
    /* the window got too narrow (phones, small windows) -> back to one chart; wide again -> the saved layout returns */
    let rzT = 0;
    addEventListener('resize', () => {
        clearTimeout(rzT);
        rzT = setTimeout(() => {
            const want = httpOk() && wide() ? LAYOUTS[id].n : 1;
            if (want !== n || (want === 1 && wrap))
                apply(id);
        }, 150);
    });
    syncMenu();
    /* restore the saved layout once the drawing layer (a later script) is there */
    if (id !== '1') {
        const t = setInterval(() => { if (window.DR && window.DRX) { clearInterval(t); apply(id); } }, 40);
    }
    return {
        apply, activate,
        layout: () => id, count: () => n, active: () => act,
        getMap: () => map,
        barChanged,
        keysBlocked: () => n > 1 && act !== 0,
        activeSym: () => { if (n < 2 || act === 0) return null; const w = paneWin(act); try { return w && w.MCP ? w.MCP.sym() : null; } catch (_) { return null; } },
        /* the watchlist picked a coin: for chart 2-4 it goes into that chart's iframe */
        routeSelect(s, kb) {
            if (n < 2 || act === 0)
                return false;
            const w = paneWin(act);
            if (!w || !w.MCP)
                return false;
            w.MCP.setSym(s, kb);
            return true;
        },
        frame: i => paneWin(i),
    };
})();
