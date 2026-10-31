/* ---------- Bar Replay (TradingView style) ----------
   Pick a start bar -> every candle after it is hidden and is revealed again one update at a time.
   Model: `data` (the global the chart, indicators and drawings already read) holds only the revealed candles;
   `arr` holds the real candles after the cut and `ai` of them are already revealed. `ph` (0..3) counts the updates
   of the candle that is still forming: open -> first extreme -> second extreme -> close (a path built from the real OHLC).
   Live WebSocket candles are redirected into `arr` (see applyBar), so nothing real-time leaks into the replay. */
var RP = (function () {
    const SPEEDS = [10, 7, 5, 3, 1, 0.5, 0.3, 0.1]; /* updates per second, same list as TradingView */
    const SUB = 4;                                  /* updates per candle */
    let mode = 'off';                               /* 'off' | 'pick' (choosing the start bar) | 'active' */
    let arr = [], ai = 0, ph = 0, cutT = 0;
    let pending = null;                             /* replay carried over a symbol / timeframe switch: { t } */
    let playing = false, timer = 0, feeding = false, rePickFrom = null, hoverIdx = -1, hoverY = 0, toastT = 0;
    let speed = +store.get('rpSpeed', 3);
    if (!SPEEDS.includes(speed)) speed = 3;

    const ICON = {
        play: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 4.2v11.6L16 10z"/></svg>',
        pause: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5.5 4h3.2v12H5.5zM11.3 4h3.2v12h-3.2z"/></svg>',
    };
    const stepSec = () => (TFMS[tf] || 6e4) / 1000;
    const endOf = b => { if (tf === '1M') { const d = new Date(b.time * 1000); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / 1000; } return b.time + stepSec(); };
    /* index of the last candle that opens before T (-1 if none) */
    function idxBefore(T) {
        let lo = 0, hi = data.length - 1, r = -1;
        while (lo <= hi) { const m = (lo + hi) >> 1; if (data[m].time < T) { r = m; lo = m + 1; } else hi = m - 1; }
        return r;
    }
    function toast(msg) {
        const t = $('rpToast');
        t.textContent = msg; t.hidden = false;
        clearTimeout(toastT);
        toastT = setTimeout(() => { t.hidden = true; }, 3200);
    }
    function redraw() {
        const ts = chart.timeScale(), rg = ts.getVisibleLogicalRange();
        validatePriceScaleForData();
        setBars(data);
        syncFut();
        window.IND && IND.full();
        if (rg) ts.setVisibleLogicalRange(rg);
    }
    function showBar(idx) {
        const ts = chart.timeScale(), rg = ts.getVisibleLogicalRange(), span = rg ? Math.max(60, rg.to - rg.from) : 120;
        ts.setVisibleLogicalRange({ from: idx - span * 0.7, to: idx + span * 0.3 });
    }
    function setCut() {
        const l = data[data.length - 1];
        cutT = l ? (ph > 0 ? l.time : endOf(l)) : 0;
    }

    /* ---------- UI state ---------- */
    function ui() {
        const shown = mode !== 'off' || !!pending, act = mode === 'active';
        $('rpBar').hidden = !shown;
        const b = $('btnReplay');
        b.setAttribute('aria-pressed', String(shown));
        b.classList.toggle('on', shown);
        $('rpPlay').disabled = $('rpStep').disabled = !act;
        $('rpPlay').innerHTML = playing ? ICON.pause : ICON.play;
        $('rpPlay').title = playing ? 'Pause (Shift+↓)' : 'Play (Shift+↓)';
        $('rpPlay').setAttribute('aria-label', playing ? 'Pause' : 'Play');
        $('rpSpeed').firstElementChild.textContent = speed + 'x';
        $('rpSel').classList.toggle('on', mode === 'pick');
        $('rpSel').querySelector('span').textContent = mode === 'pick' ? 'Click a bar…' : 'Select bar';
    }

    /* ---------- Start-bar picking (vertical cut line, the area to its right is dimmed) ---------- */
    function idxAtX(x) {
        const l = chart.timeScale().coordinateToLogical(x);
        return l == null ? -1 : clamp(Math.round(l), 0, Math.max(0, data.length - 2));
    }
    function placeCut() {
        const cut = $('rpCut'), dim = $('rpDim');
        const x = mode === 'pick' && hoverIdx >= 0 && data.length > 1 ? chart.timeScale().logicalToCoordinate(hoverIdx) : null;
        if (x == null) { cut.hidden = dim.hidden = true; return; }
        const left = Math.round($('chart').getBoundingClientRect().left - $('cw').getBoundingClientRect().left + x);
        const th = (chart.timeScale().height && chart.timeScale().height()) || 28;
        cut.hidden = dim.hidden = false;
        cut.style.left = left + 'px'; cut.style.bottom = th + 'px'; cut.style.setProperty('--y', Math.round(hoverY) + 'px');
        dim.style.left = left + 'px'; dim.style.right = chart.priceScale('right').width() + 'px'; dim.style.bottom = th + 'px';
    }
    function setPick(on) {
        $('cw').classList.toggle('rp-pick', on);
        if (!on) { hoverIdx = -1; placeCut(); }
    }
    function enterPick() {
        if (data.length < 2) { toast('Chart is still loading'); return; }
        stopPlay();
        if (mode === 'active') { rePickFrom = cutT; fullView(); }
        else rePickFrom = null;
        mode = 'pick';
        setPick(true);
        ui();
    }
    function cancelPick() {
        if (mode !== 'pick') return;
        setPick(false);
        const T = rePickFrom;
        rePickFrom = null;
        if (T != null && data.length > 1) { mode = 'off'; startAt(Math.max(0, idxBefore(T)), true); }
        else exit();
    }
    chart.subscribeCrosshairMove(p => {
        if (mode !== 'pick') return;
        if (!p.point) hoverIdx = -1;
        else { hoverIdx = idxAtX(p.point.x); hoverY = p.point.y; }
        placeCut();
    });
    chart.subscribeClick(p => {
        if (mode !== 'pick' || !p.point) return;
        const idx = idxAtX(p.point.x);
        if (idx < 0) return;
        rePickFrom = null;
        setPick(false);
        startAt(idx, true);
        const rg = chart.timeScale().getVisibleLogicalRange();
        if (!rg || idx < rg.from || idx > rg.to) showBar(idx);
    });
    chart.timeScale().subscribeVisibleLogicalRangeChange(() => { if (mode === 'pick') placeCut(); });

    /* ---------- Starting / stopping ---------- */
    function startAt(idx, draw) {
        idx = Math.min(idx, data.length - 2);
        if (idx < 0) { toast('Not enough candles to start a replay here'); return false; }
        stopPlay();
        arr = data.slice(idx + 1); ai = 0; ph = 0;
        data = data.slice(0, idx + 1);
        mode = 'active'; pending = null;
        setCut();
        setPick(false);
        ui();
        if (draw) redraw();
        return true;
    }
    /* put every real candle back into `data` (the caller redraws) */
    function restore() {
        stopPlay();
        if (mode !== 'active' || !arr.length) return false;
        const base = data.length - ai - (ph > 0 ? 1 : 0);
        data = data.slice(0, Math.max(0, base)).concat(arr);
        arr = []; ai = 0; ph = 0;
        return true;
    }
    function fullView() { if (restore()) redraw(); }
    function exit() {
        const was = mode === 'active';
        stopPlay(); closeDate(); setPick(false);
        if (was) restore();
        pending = null; rePickFrom = null; mode = 'off';
        ui();
        if (was && data.length) {
            setBars(data);
            syncFut();
            const l = data[data.length - 1];
            lastClose = l.close; lastUp = l.close >= l.open;
            closeAt = l.T ? l.T + 1 : l.time * 1000 + (TFMS[tf] || 0);
            validatePriceScaleForData();
            window.IND && IND.full();
            fitSoon();
            catchUp(true);
        }
    }

    /* ---------- Playback ---------- */
    const path = t => t.close >= t.open ? [t.open, t.low, t.high, t.close] : [t.open, t.high, t.low, t.close];
    function partial(t, k) {
        const P = path(t).slice(0, k);
        return { time: t.time, open: t.open, high: Math.max(...P), low: Math.min(...P), close: P[k - 1], v: (t.v || 0) * k / SUB };
    }
    function feed(b) { feeding = true; try { applyBar(b); } finally { feeding = false; } }
    function tickOnce() {
        if (mode !== 'active') return false;
        if (ai >= arr.length) { toast('Reached the latest candle'); return false; }
        const t = arr[ai], k = ph + 1;
        feed(k >= SUB ? t : partial(t, k));
        if (k >= SUB) { ai++; ph = 0; } else ph = k;
        setCut();
        window.IND && IND.tick();
        return true;
    }
    function stepBar() { stopPlay(); if (mode !== 'active') return; ph = SUB - 1; tickOnce(); } /* finish the forming candle, or reveal the next one */
    function back() {
        if (mode !== 'active') return;
        stopPlay();
        if (ph > 0) { data.pop(); ph = 0; }
        else if (ai > 0) { data.pop(); ai--; }
        else { toast('This is where the replay started'); return; }
        setCut();
        redraw();
    }
    function schedule() {
        clearTimeout(timer);
        timer = setTimeout(() => {
            if (!playing) return;
            if (!tickOnce()) { stopPlay(); return; }
            schedule();
        }, 1000 / speed);
    }
    function play() {
        if (mode !== 'active' || playing) return;
        if (ai >= arr.length) { toast('Reached the latest candle'); return; }
        playing = true; ui(); schedule();
    }
    function stopPlay() { if (playing || timer) { playing = false; clearTimeout(timer); timer = 0; ui(); } }
    const togglePlay = () => playing ? stopPlay() : play();

    /* ---------- Real-time candles while replaying ---------- */
    function live(b) {
        const tail = arr[arr.length - 1];
        if (!tail) return;
        if (b.time === tail.time) arr[arr.length - 1] = b;
        else if (b.time > tail.time && b.time - tail.time <= stepSec() * 1.6) arr.push(b); /* ignore gaps: exit() catches up */
    }

    /* ---------- Loading older candles (Select date / First available date) ---------- */
    async function ensureBack(T, cap) {
        if (!data.length || data[0].time <= T || noMore) return true;
        const my = tok;
        let first = data[0].time, add = [], n = 0, ok = true;
        loadingOld = true;
        $('ld').style.display = 'block';
        try {
            while (first > T && !noMore && n++ < (cap || 30)) {
                const k = await getJ(`${API}/fapi/v1/klines?symbol=${sym}&interval=${tf}&limit=1500&endTime=${first * 1000 - 1}`, ctl && ctl.signal);
                if (my !== tok) return false;
                if (!Array.isArray(k)) throw 0;
                if (k.length < 1500) noMore = true;
                if (!k.length) break;
                add = k.map(candle).concat(add);
                first = add[0].time;
            }
        } catch (_) { ok = false; }
        finally { if (my === tok) { loadingOld = false; $('ld').style.display = 'none'; } }
        if (my !== tok) return false;
        if (add.length) data = add.concat(data);
        if (!ok) toast("Couldn't load older candles");
        return ok;
    }
    /* start the replay so that `T` (unix seconds) is the first candle to be revealed */
    async function startFromTime(T, cap) {
        if (data.length < 2) return;
        stopPlay();
        if (mode === 'active') { rePickFrom = null; fullView(); }
        mode = 'pick'; setPick(false); ui();
        if (T >= data[data.length - 1].time) { toast('Choose a date before the latest candle'); setPick(true); return; }
        if (T < data[0].time) {
            const my = tok;
            await ensureBack(T, cap);
            if (my !== tok) return;
            if (!noMore && data[0].time > T && cap) toast(`Loaded the latest ${data.length.toLocaleString('en-US')} candles only`);
        }
        const idx = Math.max(0, idxBefore(T));
        if (startAt(idx, true)) showBar(idx);
        else { redraw(); }
    }

    /* ---------- Replay kept across a symbol / timeframe switch ---------- */
    function beforeSwitch() {
        if (mode === 'pick') return;
        if (mode !== 'active') return;
        const t = cutT;
        restore();            /* so the in-memory cache stores the full candle list */
        mode = 'off';
        pending = { t };
    }
    function afterData() {
        if (mode === 'active' && !pending) { restore(); mode = 'off'; pending = { t: cutT }; } /* data was replaced under us */
        if (!pending || !data.length) return;
        const p = pending;
        if (p.t < data[0].time && !noMore) { loadBackThen(p); return; }
        pending = null;
        if (!startAt(Math.max(0, idxBefore(p.t)), false)) exit();
    }
    async function loadBackThen(p) {
        const my = tok;
        await ensureBack(p.t, 30);
        if (pending !== p || my !== tok) return;
        pending = null;
        const idx = Math.max(0, idxBefore(p.t));
        if (startAt(idx, true)) showBar(idx);
        else { redraw(); exit(); }
    }

    /* ---------- Date picker (chart time zone) ---------- */
    const OFF = tzf({ year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
    function tehranToUnix(y, mo, d, h, mi) {
        const off = ms => { const p = {}; for (const x of OFF.formatToParts(new Date(ms))) p[x.type] = x.value; return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000; };
        const local = Date.UTC(y, mo - 1, d, h, mi);
        return (local - off(local - off(local))) / 1000;
    }
    const isoDay = ms => { const p = {}; for (const x of tzf({ year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(ms))) p[x.type] = x.value; return `${p.year}-${p.month}-${p.day}`; };
    function openDate() {
        const l = data[data.length - 1];
        if (!l) return;
        $('rpD').max = isoDay(l.time * 1000);
        if (!$('rpD').value) $('rpD').value = isoDay((l.time - 86400 * 7) * 1000);
        $('rpDate').hidden = false;
        $('rpD').focus();
    }
    function closeDate() { $('rpDate').hidden = true; }
    function goDate() {
        const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec($('rpD').value), t = /^(\d{2}):(\d{2})$/.exec($('rpT').value || '00:00');
        if (!d || !t) { toast('Enter a valid date'); return; }
        closeDate();
        startFromTime(tehranToUnix(+d[1], +d[2], +d[3], +t[1], +t[2]), 0);
    }

    /* ---------- Wiring ---------- */
    function menuAt(btn, items) { const r = btn.getBoundingClientRect(); showMenu(r.left, r.bottom + 4, items); }
    $('btnReplay').onclick = () => { if (mode === 'off' && !pending) enterPick(); else exit(); };
    $('rpSel').onclick = () => menuAt($('rpSel'), [
        ['Select bar', () => enterPick()],
        ['Select date…', openDate],
        ['First available date', () => startFromTime(0, 40)],
        ['Random bar', startAtRandom],
    ]);
    function startAtRandom() {
        if (data.length < 2) return;
        stopPlay();
        if (mode === 'active') { rePickFrom = null; fullView(); }
        mode = 'pick'; setPick(false);
        const lo = Math.min(50, data.length - 2), idx = lo + Math.floor(Math.random() * (data.length - 1 - lo));
        if (startAt(idx, true)) showBar(idx);
    }
    $('rpPlay').onclick = togglePlay;
    $('rpStep').onclick = stepBar;
    $('rpSpeed').onclick = () => menuAt($('rpSpeed'), SPEEDS.map(s => [`${s === speed ? '✓ ' : '&nbsp;&nbsp;&nbsp;'}${s}x`, () => {
        speed = s; store.set('rpSpeed', s); ui();
        if (playing) schedule();
    }]));
    $('rpLive').onclick = exit;
    $('rpExit').onclick = exit;
    $('rpDateGo').onclick = goDate;
    $('rpDateX').onclick = closeDate;
    $('rpDate').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); goDate(); } else if (e.key === 'Escape') closeDate(); });
    document.addEventListener('keydown', e => {
        if (mode === 'off' || isTypingTarget(e.target)) return;
        if (e.key === 'Escape' && mode === 'pick') { cancelPick(); return; }
        if (!e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
        if (e.key === 'ArrowRight') { e.preventDefault(); stepBar(); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); back(); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); togglePlay(); }
    }, true);
    /* draggable toolbar */
    $('rpGrip').addEventListener('pointerdown', e => {
        const bar = $('rpBar'), cw = $('cw').getBoundingClientRect(), r = bar.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
        bar.style.cssText += `;left:${r.left - cw.left}px;top:${r.top - cw.top}px;bottom:auto;transform:none`;
        const mv = ev => {
            bar.style.left = clamp(ev.clientX - dx - cw.left, 0, Math.max(0, cw.width - r.width)) + 'px';
            bar.style.top = clamp(ev.clientY - dy - cw.top, 0, Math.max(0, cw.height - r.height)) + 'px';
        };
        const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); };
        addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('pointercancel', up);
        e.preventDefault();
    });
    addEventListener('resize', () => {
        const bar = $('rpBar');
        if (!bar.style.left || bar.hidden) return;
        const cw = $('cw').getBoundingClientRect(), r = bar.getBoundingClientRect();
        bar.style.left = clamp(r.left - cw.left, 0, Math.max(0, cw.width - r.width)) + 'px';
        bar.style.top = clamp(r.top - cw.top, 0, Math.max(0, cw.height - r.height)) + 'px';
    });
    ui();

    return {
        on: () => mode === 'active',
        /* applyBar hook: real-time candles are parked while a replay runs */
        intercept(b) { if (mode !== 'active' || feeding) return false; live(b); return true; },
        beforeSwitch, afterData,
    };
})();
