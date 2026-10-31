/* ---------- Daily open prices: Chg% = change of the current daily candle (since 00:00 UTC open) ----------
   Binance has no bulk endpoint for this, so each coin's daily open is fetched once per day (tiny
   requests, busiest coins first), cached in localStorage and reused on reload. */
const dayStart = () => { const d = new Date(); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); };
let dayMs = dayStart(), opBusy = false, opRetry = 0;
const OP_WORKERS = 24; /* parallel kline requests (HTTP/2): ~500 coins load in a few seconds instead of a minute */
let opens = (() => { const o = store.get('dopen', {}); return o.day === dayMs ? o.m : {}; })();
const calc = s => s.o ? (+s.p - s.o) / s.o * 100 : 0;
async function loadOpens() {
    if (opBusy)
        return;
    opBusy = true;
    const day = dayMs, shown = new Set(vis.map(s => s.s)), todo = all.filter(s => !s.o && s.nk !== day).sort((a, b) => (shown.has(b.s) - shown.has(a.s)) || b.qv - a.qv); /* rows on screen first, then busiest coins */
    const i = todo.findIndex(s => s.s === sym);
    if (i > 0)
        todo.unshift(todo.splice(i, 1)[0]); /* selected coin first */
    let stop = false, t = 0;
    const worker = async () => {
        while (todo.length && !stop) {
            const s = todo.shift();
            try {
                const k = await getJ(`${API}/fapi/v1/klines?symbol=${s.s}&interval=1d&limit=1`);
                if (day !== dayMs)
                    return;
                if (!Array.isArray(k)) {
                    stop = true;
                    return;
                } /* rate limit / error: retry on next refresh */
                if (k[0] && k[0][0] >= day) {
                    s.o = +k[0][1];
                    opens[s.s] = s.o;
                    s.c = calc(s);
                }
                else
                    s.nk = day; /* no candle today: don't ask again until tomorrow */
            }
            catch (_) {
                stop = true;
            }
            if (Date.now() - t > 400) {
                t = Date.now();
                buildView();
                sched();
                if (day === dayMs)
                    store.set('dopen', { day, m: opens }); /* keep progress: a reload mid-way doesn't restart from zero */
            } /* update the list while loading */
        }
    };
    await Promise.all(Array.from({ length: OP_WORKERS }, worker));
    opBusy = false;
    buildView();
    sched();
    if (day === dayMs)
        store.set('dopen', { day, m: opens });
    if (stop && day === dayMs)
        setTimeout(loadOpens, Math.min(60000, 6000 * 2 ** opRetry++)); /* rate limit / network error: retry soon, with back-off */
    else
        opRetry = 0;
}
/* New UTC day: drop yesterday's opens and fetch fresh ones */
function checkDay() {
    const d = dayStart();
    if (d === dayMs)
        return;
    dayMs = d;
    opens = {};
    all.forEach(s => { s.o = 0; s.c = 0; });
    header();
    loadOpens();
}
