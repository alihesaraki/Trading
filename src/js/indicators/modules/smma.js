/* SMMA / RMA: like EMA (anchored, remembers the value at the last closed candle for O(1) live updates). */
INDREG.register('smma', makeMAModule('SMMA', { len: 14, src: 'close', color: '#e040fb', w: 1 }, {
    warm: 12, /* alpha is 1/len, so it needs about twice the history of an EMA */
    calc(d, len, s, ind) {
        const n = d.length, o = [], { srcv } = INDKIT, ai = INDKIT.anchorAt(ind, d), idx = Math.min(len * 12, 5000) - 1;
        let sum = 0, m = 0, prev = NaN, av;
        for (let i = 0; i < n; i++) {
            const v = srcv(d[i], s);
            if (i < len - 1) {
                sum += v;
                continue;
            }
            if (i === n - 1)
                prev = m;
            if (i === ai)
                m = ind.anchor.value;
            else if (i === len - 1) {
                sum += v;
                m = sum / len;
            }
            else
                m = (m * (len - 1) + v) / len;
            if (i === idx)
                av = m;
            o.push({ time: d[i].time, value: m });
        }
        INDKIT.setAnchor(ind, d, idx, av);
        ind.st = { n, prev };
        return [o];
    },
    tail(d, len, s, ind) {
        const n = d.length, st = ind.st;
        if (n < len + 1 || !st || st.n !== n || st.prev !== st.prev)
            return null;
        return [{ time: d[n - 1].time, value: (st.prev * (len - 1) + INDKIT.srcv(d[n - 1], s)) / len }];
    }
}));
