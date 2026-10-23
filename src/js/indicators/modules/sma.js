/* SMA: running sum, O(n) full calc, O(len) live update */
INDREG.register('sma', makeMAModule('SMA', { len: 20, src: 'close', color: '#2962ff', w: 1 }, {
    calc(d, len, s) {
        const n = d.length, o = [], { srcv } = INDKIT;
        let sum = 0;
        const v = new Array(n);
        for (let i = 0; i < n; i++) {
            v[i] = srcv(d[i], s);
            sum += v[i];
            if (i >= len)
                sum -= v[i - len];
            if (i >= len - 1)
                o.push({ time: d[i].time, value: sum / len });
        }
        return [o];
    },
    tail(d, len, s) {
        const n = d.length;
        if (n < len)
            return null;
        let sum = 0;
        for (let i = n - len; i < n; i++)
            sum += INDKIT.srcv(d[i], s);
        return [{ time: d[n - 1].time, value: sum / len }];
    }
}));
