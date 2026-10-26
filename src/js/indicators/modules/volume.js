/* Volume histogram (overlaid at the bottom of the price pane), like TradingView's Volume:
   "Color based on previous close", optional Volume MA line (SMA, default length 20), rising / falling colours with 50 % opacity. */
INDREG.register('volume', (function () {
    const { rgba, cmp, line, OFFF } = INDKIT;
    const isUp = (b, prev, p) => p.pc && prev ? b.close >= prev.close : b.close >= b.open;
    const base = (b, prev, p) => { const up = isUp(b, prev, p); return p.custom ? (up ? p.upColor : p.dnColor) : (up ? cUp : cDn); };
    const pt = (b, prev, p) => ({ time: b.time, value: b.v || 0, color: rgba(base(b, prev, p), p.op / 100) });
    const maAt = (d, i, len) => { if (i < len - 1) return null; let s = 0; for (let k = i - len + 1; k <= i; k++) s += d[k].v || 0; return { time: d[i].time, value: s / len }; };
    return {
        name: 'Volume', vol: true,
        fields: [
            { k: 'pc', l: 'Color based on previous close', t: 'b', tab: 'inputs' }, { k: 'maLen', l: 'Volume MA length', t: 'n', min: 1, max: 500, step: 1, tab: 'inputs' },
            { k: 'upColor', l: 'Rising color', t: 'c' }, { k: 'dnColor', l: 'Falling color', t: 'c' }, { k: 'op', l: 'Opacity %', t: 'n', min: 10, max: 100, step: 5, tab: 'style' },
            { k: 'showMA', l: 'Show volume MA', t: 'b' }, { k: 'maColor', l: 'Volume MA color', t: 'c' }, { k: 'ht', l: 'Height %', t: 'n', min: 5, max: 60, step: 5, tab: 'style' }],
        defaults: { op: 50, ht: 20, custom: false, upColor: '#089981', dnColor: '#F23645', pc: false, maLen: 20, showMA: false, maColor: '#2962FF' },
        create: () => [
            chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: 'vol', lastValueVisible: false, priceLineVisible: false }),
            line({ priceScaleId: 'vol', lineWidth: 1, priceFormat: { type: 'volume' } })],
        calc: (d, p) => {
            const ma = [];
            if (p.showMA) for (let i = 0; i < d.length; i++) { const m = maAt(d, i, p.maLen); if (m) ma.push(m); }
            return [d.map((b, i) => pt(b, d[i - 1], p)), ma];
        },
        tail: (d, p) => { const n = d.length; return n ? [pt(d[n - 1], d[n - 2], p), p.showMA ? maAt(d, n - 1, p.maLen) : null] : null; },
        style: ind => {
            ind.s[0].applyOptions({ visible: ind.v });
            ind.s[1].applyOptions({ color: rgba(ind.p.maColor, 1), visible: ind.v && !!ind.p.showMA });
        },
        label: ind => 'Volume' + (ind.p.showMA ? ` MA ${ind.p.maLen}` : ''),
        color: p => p.custom ? p.upColor : '#d1d4dc',
        fmt: (ind, g) => { const a = g(0), m = ind.p.showMA ? g(1) : null; return (a == null ? '' : cmp(a)) + (m == null ? '' : ` <span style="color:${ind.p.maColor}">${cmp(m)}</span>`); },
        /* picking a colour switches the bars from "follow the candle colours" to the chosen colours */
        edited: (ind, k) => { if (k === 'upColor' || k === 'dnColor') ind.p.custom = true; },
        need: p => Math.max(1, p.showMA ? p.maLen : 1)
    };
})());
