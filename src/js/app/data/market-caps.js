/* ---------- Market-cap ranking (CoinGecko; keyed by ticker symbol) ---------- */
const marketCaps = new Map();
const MCAP_TTL = 24 * 36e5; /* ranking changes slowly: one ~600 KB download per day instead of one per page load */
const mcapCache = store.get('mcap', null);
if (mcapCache && mcapCache.m)
    for (const k in mcapCache.m)
        marketCaps.set(k, mcapCache.m[k]); /* instant, no network */
async function loadMarketCaps() {
    if (mcapCache && mcapCache.m && Date.now() - mcapCache.t < MCAP_TTL)
        return;
    try {
        const pages = await Promise.all([1, 2].map(page => fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=${page}&sparkline=false`).then(r => r.ok ? r.json() : [])));
        for (const coin of pages.flat()) {
            const k = String(coin.symbol || '').toUpperCase(), cap = Number(coin.market_cap) || 0;
            if (k && cap > 0 && cap > (marketCaps.get(k) || 0))
                marketCaps.set(k, cap);
        }
        if (marketCaps.size)
            store.set('mcap', { t: Date.now(), m: Object.fromEntries(marketCaps) });
        for (const x of all)
            x.mc = marketCaps.get(x.b) || 0;
        if (sortKey === 's') {
            buildView();
            sched();
        }
    }
    catch (_) { }
}
loadMarketCaps();
