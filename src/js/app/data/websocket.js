/* ---------- WebSocket (live prices + live candle) ---------- */
let ws, subs = new Set(), mid = 1, lastMsg = 0, hadWS = false, idle = false, idleT = 0, ciT = 0;
/* Streams we need: the selected coin (price + candle) and, while the tab is visible, the visible rows */
function wanted() {
    const w = new Set();
    if (idle)
        return w; /* tab in the background for a while: no live data at all (it is caught up on return) */
    if (!document.hidden)
        vis.filter(s => s.s).forEach(s => w.add(s.s.toLowerCase() + '@miniTicker'));
    w.add(sym.toLowerCase() + '@miniTicker');
    w.add(`${sym.toLowerCase()}@kline_${tf}`);
    return w;
}
/* Send only the SUBSCRIBE / UNSUBSCRIBE difference */
function syncWS() {
    if (!ws || ws.readyState !== 1)
        return;
    const w = wanted();
    const add = [...w].filter(x => !subs.has(x)), del = [...subs].filter(x => !w.has(x));
    if (add.length && !subs.size)
        lastMsg = Date.now(); /* fresh start after a pause: don't let the watchdog judge the socket by old traffic */
    if (add.length)
        ws.send(JSON.stringify({ method: 'SUBSCRIBE', params: add, id: mid++ }));
    if (del.length)
        ws.send(JSON.stringify({ method: 'UNSUBSCRIBE', params: del, id: mid++ }));
    subs = w;
}
function connect() {
    ws = new WebSocket(WSU);
    /* on reconnect, fill any candles / prices missed while offline */
    ws.onopen = () => {
        subs = new Set();
        lastMsg = Date.now();
        syncWS();
        /* Binance pushes a message whenever a contract is added / changed: reload the coin list right away */
        ws.send(JSON.stringify({ method: 'SUBSCRIBE', params: ['!contractInfo'], id: mid++ }));
        if (hadWS && !idle) {
            catchUp(true);
            refresh(false, true);
        }
        hadWS = true;
    };
    ws.onclose = () => setTimeout(connect, 2000);
    ws.onmessage = e => {
        lastMsg = Date.now();
        const m = JSON.parse(e.data), x = m.data;
        if (!x)
            return;
        if (x.e === '24hrMiniTicker') {
            const s = map[x.s];
            if (!s)
                return;
            s.d = +x.c > +s.p ? 'up' : +x.c < +s.p ? 'dn' : s.d;
            s.p = x.c;
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
