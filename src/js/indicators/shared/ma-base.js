/* Shared factory for the moving-average family (SMA / EMA / SMMA). Each type has its own module file.
   Like TradingView's Moving Average indicators: Length, Source, Offset, optional Smoothing MA, line style / thickness / colour. */
function makeMAModule(name, def, algo) {
    const { LEN, SRCF, COL, WID, OFFF, LSTY, LSTY_N, colorAlpha, line, fv } = INDKIT;
    const SM = ['None', 'SMA', 'EMA', 'SMMA (RMA)', 'WMA', 'VWMA'], hasSm = p => !!p.smType && p.smType !== 'None';
    /* time of data index i; indices past the last candle are extrapolated on the chart's timeframe grid */
    const timeAt = (d, i) => {
        const n = d.length;
        if (i < 0 || !n) return null;
        if (i < n) return d[i].time;
        const k = i - n + 1, last = d[n - 1].time;
        if (tf === '1M') { const x = new Date(last * 1000); return Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + k, 1) / 1000; }
        return last + k * (TFMS[tf] / 1000);
    };
    /* Offset: shift the plotted points by N candles (positive = into the future, negative = back) */
    const shift = (d, pts, off) => {
        if (!off || !pts.length) return pts;
        const out = [];
        let j = 0;
        for (const pt of pts) {
            while (j < d.length - 1 && d[j].time < pt.time) j++;
            const t = timeAt(d, j + off);
            if (t != null) out.push({ time: t, value: pt.value });
        }
        return out;
    };
    const smooth = (d, pts, p) => {
        if (!hasSm(p) || !pts.length) return [];
        const vol = p.smType === 'VWMA' ? new Map(d.map(b => [b.time, Number(b.v) || 0])) : null;
        const { ma } = RSI_CORE.smooth(p.smType, pts.map(x => x.value), vol ? pts.map(x => vol.get(x.time) || 0) : null, p.smLen), out = [];
        for (let i = 0; i < pts.length; i++) if (Number.isFinite(ma[i])) out.push({ time: pts[i].time, value: ma[i] });
        return out;
    };
    return {
        name,
        fields: [LEN, SRCF, OFFF,
            { k: 'smType', l: 'Smoothing type', t: 's', o: SM, tab: 'inputs' }, { k: 'smLen', l: 'Smoothing length', t: 'n', min: 1, max: 500, step: 1, tab: 'inputs' },
            COL, WID, { k: 'lineStyle', l: 'Line style', t: 's', o: LSTY }, { k: 'smColor', l: 'Smoothing line color', t: 'c' }],
        defaults: Object.assign({ off: 0, lineStyle: 'Solid', smType: 'None', smLen: 14, smColor: '#FFEB3B' }, def),
        create: () => [line(), line()],
        calc: (d, p, ind) => {
            const raw = algo.calc(d, p.len, p.src, ind)[0];
            return [shift(d, raw, p.off), shift(d, smooth(d, raw, p), p.off)];
        },
        /* O(1) live update only for the plain line; offset / smoothing recompute (cheap) through calc() */
        tail: (d, p, ind) => p.off || hasSm(p) || !algo.tail ? null : algo.tail(d, p.len, p.src, ind),
        style: ind => {
            const p = ind.p;
            ind.s[0].applyOptions({ color: colorAlpha(p, 'color'), lineWidth: p.w, lineStyle: LSTY_N[p.lineStyle] ?? 0, visible: ind.v });
            ind.s[1].applyOptions({ color: colorAlpha(p, 'smColor'), lineWidth: 1, visible: ind.v && hasSm(p) });
        },
        label: ind => `${name} ${ind.p.len} ${ind.p.src}` + (ind.p.off ? ` ${ind.p.off}` : '') + (hasSm(ind.p) ? ` ${ind.p.smType.replace(' (RMA)', '')} ${ind.p.smLen}` : ''),
        color: p => p.color,
        fmt: (ind, g) => {
            const a = g(0), b = hasSm(ind.p) ? g(1) : null;
            return (a == null ? '' : fv(a)) + (b == null ? '' : ` <span style="color:${ind.p.smColor}">${fv(b)}</span>`);
        },
        need: p => (algo.warm ? p.len * algo.warm : p.len) + (hasSm(p) ? p.smLen * (/EMA|SMMA/.test(p.smType) ? 12 : 1) : 0)
    };
}
