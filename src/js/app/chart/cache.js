/* ---------- In-memory cache: going back to a recent coin/timeframe is instant, no full download ---------- */
const cache = new Map();
function stash() {
    if (!curKey || !data.length)
        return;
    cache.delete(curKey);
    cache.set(curKey, { d: data, nm: noMore });
    if (cache.size > 12)
        cache.delete(cache.keys().next().value); /* keep the 12 most recent */
}
