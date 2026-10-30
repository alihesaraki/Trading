/* ---------- WebSocket (live prices + live candle) ----------
   Speed (Binance USDⓈ-M docs):  <sym>@aggTrade 100ms  |  <sym>@kline_<tf> 250ms  |  <sym>@miniTicker 2s (too slow).
   Limits: max 10 incoming messages/s per connection (over the limit = disconnect, repeat = IP ban), max 1024 streams.
   -> the chart (selected coin) is driven by aggTrade and moves with every trade; watchlist rows use miniTicker (2s) to keep data use low;
      SUBSCRIBE / UNSUBSCRIBE messages are batched and sent at most ~4 per second.
   Binance routes streams by tier: aggTrade / kline / contractInfo are on /market. The legacy /stream URL is kept as a fallback. */
const WS_URLS = [WSU_MARKET, WSU], WS_GAP = 260, WS_BATCH = 60;
let ws, subs = new Set(), mid = 1, lastMsg = 0, hadWS = false, idle = false, idleT = 0, ciT = 0;
let wsUrl = 0, wsFail = 0, wsTries = 0, wsGot = false, wsQ = [], wsQT = 0, wsLast = 0, lastTr = null, trRaf = 0;
/* Streams we need: the selected coin (trades + candle) and, while the tab is visible, the visible rows */
function wanted() {
    const w = new Set(['!contractInfo']); /* Binance pushes a message whenever a contract is added / changed: reload the coin list right away */
    if (idle)
        return w; /* tab in the background for a while: no live data at all (it is caught up on return) */
    if (!document.hidden)
        vis.forEach(s => s.s && w.add(s.s.toLowerCase() + '@miniTicker')); /* watchlist rows: one small message every 2s per coin (low data use) */
    w.add(sym.toLowerCase() + '@aggTrade'); /* chart: every trade, 100ms */
    w.add(`${sym.toLowerCase()}@kline_${tf}`);
    w.add(sym.toLowerCase() + '@miniTicker'); /* also a cheap heartbeat: a quiet coin is never mistaken for a dead socket */
    return w;
}
/* Control messages go through a small queue: one message per WS_GAP ms, so scrolling the list can never exceed Binance's 10 msg/s limit */
function pump() {
    wsQT = 0;
    if (!ws || ws.readyState !== 1) {
        wsQ.length = 0;
        return;
    }
    const wait = wsLast + WS_GAP - Date.now();
    if (wait > 0) {
        wsQT = setTimeout(pump, wait);
        return;
    }
    const m = wsQ.shift();
    if (!m)
        return;
    wsLast = Date.now();
    ws.send(JSON.stringify(m));
    m.params.forEach(p => m.method === 'SUBSCRIBE' ? subs.add(p) : subs.delete(p)); /* subs = what has really been sent */
    if (wsQ.length)
        wsQT = setTimeout(pump, WS_GAP);
}
/* Queue only the SUBSCRIBE / UNSUBSCRIBE difference (the not-yet-sent queue is rebuilt each time, so it never grows while scrolling) */
function syncWS() {
    if (!ws || ws.readyState !== 1)
        return;
    const w = wanted();
    const add = [...w].filter(x => !subs.has(x)), del = [...subs].filter(x => !w.has(x));
    wsQ.length = 0;
    if (add.length && subs.size <= 1)
        lastMsg = Date.now(); /* fresh start after a pause: don't let the watchdog judge the socket by old traffic */
    for (let i = 0; i < del.length; i += WS_BATCH)
        wsQ.push({ method: 'UNSUBSCRIBE', params: del.slice(i, i + WS_BATCH), id: mid++ });
    for (let i = 0; i < add.length; i += WS_BATCH)
        wsQ.push({ method: 'SUBSCRIBE', params: add.slice(i, i + WS_BATCH), id: mid++ });
    if (wsQ.length && !wsQT)
        pump();
}
/* Drop the current socket and open a new one right away (a dead socket can take very long to fire onclose) */
function wsReset() {
    if (ws) {
        ws.onopen = ws.onmessage = ws.onclose = null;
        try {
            ws.close();
        }
        catch (_) { }
    }
    clearTimeout(wsQT);
    wsQT = 0;
    wsQ.length = 0;
    connect();
}
function connect() {
    ws = new WebSocket(WS_URLS[wsUrl]);
    wsGot = false;
    /* on reconnect, fill any candles / prices missed while offline */
    ws.onopen = () => {
        subs = new Set();
        wsQ.length = 0;
        wsLast = 0;
        lastMsg = Date.now();
        syncWS();
        if (hadWS && !idle) {
            catchUp(true);
            refresh(false, true);
        }
        hadWS = true;
    };
    ws.onclose = () => {
        clearTimeout(wsQT);
        wsQT = 0;
        wsQ.length = 0;
        /* never received data from this URL twice in a row -> try the other one (new /market tier <-> legacy /stream) */
        if (!wsGot) {
            wsTries++;
            if (++wsFail >= 2) {
                wsFail = 0;
                wsUrl = (wsUrl + 1) % WS_URLS.length;
            }
        }
        setTimeout(connect, wsGot ? 1000 : Math.min(8000, 1000 * 2 ** (wsTries - 1))); /* back-off while offline */
    };
    ws.onmessage = e => {
        lastMsg = Date.now();
        wsGot = true;
        wsFail = wsTries = 0;
        const m = JSON.parse(e.data), x = m.data;
        if (!x)
            return;
        if (x.e === 'aggTrade') { /* selected coin only */
            const s = map[x.s];
            if (s && x.p !== s.p) {
                s.d = +x.p > +s.p ? 'up' : +x.p < +s.p ? 'dn' : s.d;
                s.p = x.p;
                s.t = lastMsg; /* a REST list that arrives later must not overwrite this newer price with an older one */
                s.c = calc(s);
                sched();
            }
            if (x.s === sym)
                liveTrade(x);
        }
        else if (x.e === '24hrMiniTicker') { /* watchlist rows */
            const s = map[x.s];
            if (!s || x.s === sym || x.c === s.p)
                return; /* the selected coin is driven by aggTrade (newer than this 2s snapshot) */
            s.d = +x.c > +s.p ? 'up' : +x.c < +s.p ? 'dn' : s.d;
            s.p = x.c;
            s.t = lastMsg;
            s.c = calc(s);
            sched();
        }
        else if (x.e === 'contractInfo') {
            clearTimeout(ciT);
            ciT = setTimeout(() => refresh(false, true), 4000);
        }
        else if (x.e === 'kline' && x.s === sym && x.k.i === tf) {
            const k = x.k, b = bar(k);
            skew = x.E - Date.now();
            skewOk = true; /* server-vs-local clock offset for an accurate countdown */
            /* the kline snapshot (every 250ms) can be older than a trade we already drew: keep the newer price */
            if (!k.x && lastTr && lastTr.E > x.E && lastTr.T >= k.t && lastTr.T <= k.T) {
                b.close = lastTr.p;
                b.high = Math.max(b.high, lastTr.p);
                b.low = Math.min(b.low, lastTr.p);
            }
            lastClose = b.close;
            lastUp = b.close >= b.open;
            closeAt = k.T + 1;
            if (data.length) {
                applyBar(b);
                window.IND && IND.tick();
            }
            else
                pend = b; /* history not loaded yet -> keep it */
        }
    };
}
/* ---------- Trade-driven candle: the forming candle follows every trade (100ms) instead of waiting for the 250ms kline ----------
   Work is coalesced to one chart update per animation frame. Volume and the official OHLC still come from the kline stream. */
function liveTrade(x) {
    const p = +x.p;
    if (!(p > 0))
        return;
    lastTr = { p, E: x.E, T: x.T };
    if (!trRaf)
        trRaf = requestAnimationFrame(flushTrade);
}
function flushTrade() {
    trRaf = 0;
    const t = lastTr, n = data.length;
    if (!t || !n || curKey !== sym + '|' + tf || (window.RP && RP.on()))
        return;
    const l = data[n - 1];
    if (t.T < l.time * 1000 || (closeAt && t.T >= closeAt))
        return; /* trade belongs to another candle: the kline stream / rollover creates that one */
    const hi = Math.max(l.high, t.p), lo = Math.min(l.low, t.p);
    if (l.close === t.p && l.high === hi && l.low === lo)
        return;
    const b = Object.assign({}, l, { close: t.p, high: hi, low: lo });
    lastClose = b.close;
    lastUp = b.close >= b.open;
    applyBar(b);
    window.IND && IND.tick();
}
