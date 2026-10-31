/* ---------- Ticker data ---------- */
/* Merge REST 24h ticker data into the symbol table (USDT perpetuals only) */
const HIDDEN_COINS = new Set(['USDCUSDT', 'BTCDOMUSDT']); /* not shown in the watchlist */
/* Counters for the last ticker list: total contracts returned by Binance vs. what the watchlist shows.
   Run coinStats() in the browser console to see them. */
let coinStatsInfo = { total: 0, shown: 0, dated: 0, notUsdt: 0, hidden: 0 };
window.coinStats = () => ({ ...coinStatsInfo, inWatchlist: all.length });
function ingest(arr) {
    const st = { total: arr.length, shown: 0, dated: 0, notUsdt: 0, hidden: 0 };
    for (const t of arr) {
        const n = t.symbol;
        if (n.includes('_')) { /* dated delivery futures (BTCUSDT_261225) are not perpetuals */
            st.dated++;
            continue;
        }
        if (!n.endsWith('USDT')) { /* USDC-margined perpetuals duplicate the USDT coins */
            st.notUsdt++;
            continue;
        }
        if (HIDDEN_COINS.has(n) || /[\x00-\x20]/.test(n)) {
            st.hidden++;
            continue;
        }
        st.shown++;
        let s = map[n];
        const p = t.lastPrice;
        if (!s) {
            s = map[n] = { s: n, b: n.slice(0, -4), p, c: 0, o: opens[n] || 0, qv: 0, mc: marketCaps.get(n.slice(0, -4)) || 0, d: '', dec: (p.split('.')[1] || '').length };
            all.push(s);
        }
        if (!(s.t && Date.now() - s.t < 5000)) { /* a live trade price from the last seconds is newer than this REST snapshot */
            s.d = +p > +s.p ? 'up' : +p < +s.p ? 'dn' : s.d;
            s.p = p;
        }
        s.qv = +t.quoteVolume;
        s.c = calc(s);
    }
    /* contracts Binance no longer lists (delisted) leave the watchlist; the list is edited in place */
    if (arr.length > 100) {
        const live = new Set(arr.map(t => t.symbol)), keep = all.filter(s => live.has(s.s));
        if (keep.length !== all.length) {
            all.length = 0;
            all.push(...keep);
            for (const k in map)
                if (!live.has(k))
                    delete map[k];
        }
    }
    if (st.shown !== coinStatsInfo.shown)
        console.info('[coins] Binance returned', st.total, 'contracts; watchlist shows', st.shown, '(dated', st.dated, '| non-USDT', st.notUsdt, '| hidden', st.hidden + ')');
    coinStatsInfo = st;
}
let lastRef = 0;
async function refresh(first, force) {
    /* the full 24h list is ~0.5k symbols; skip it if one was fetched moments ago (tab switches, reconnects) */
    if (!first && !force && Date.now() - lastRef < 45000)
        return;
    lastRef = Date.now();
    checkDay();
    try {
        const arr = await (first ? P_T : fetch(API + '/fapi/v1/ticker/24hr').then(r => r.json()));
        if (!Array.isArray(arr))
            throw 0;
        ingest(arr);
        buildView();
        if (first && !map[sym])
            sym = 'BTCUSDT';
        header();
        sched();
        if (all.some(s => !s.o && s.nk !== dayMs))
            loadOpens();
    } /* fetch any missing daily opens */
    catch (e) {
        if (!all.length)
            $('msg').textContent = 'Failed to load (check network / VPN)';
    }
}
