/* EMA: seeded with the first source value, then anchored (see INDKIT.setAnchor) so the live value never drifts when older
   candles are loaded. Keeps the value at the last *closed* candle so a live tick is O(1). */
INDREG.register('ema', makeMAModule('EMA', { len: 20, src: 'close', color: '#5050FF', w: 1 }, {
    warm: 6, /* ~6*len candles make the seed's influence negligible */
    calc(d, len, s, ind) {
        const n = d.length, o = new Array(n), a = 2 / (len + 1), { srcv } = INDKIT, ai = INDKIT.anchorAt(ind, d), idx = Math.min(len * 6, 5000) - 1;
        let e = 0, prev = NaN, av;
        for (let i = 0; i < n; i++) {
            if (i === n - 1)
                prev = e;
            e = i === ai ? ind.anchor.value : i ? a * srcv(d[i], s) + (1 - a) * e : srcv(d[0], s);
            if (i === idx)
                av = e;
            o[i] = { time: d[i].time, value: e };
        }
        INDKIT.setAnchor(ind, d, idx, av);
        ind.st = { n, prev };
        return [o];
    },
    tail(d, len, s, ind) {
        const n = d.length, st = ind.st;
        if (n < 2 || !st || st.n !== n)
            return null;
        const a = 2 / (len + 1);
        return [{ time: d[n - 1].time, value: a * INDKIT.srcv(d[n - 1], s) + (1 - a) * st.prev }];
    }
}));
