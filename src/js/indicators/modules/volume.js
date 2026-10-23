/* Volume histogram (overlaid at the bottom of the price pane) */
INDREG.register('volume', (function () {
    const { rgba, cmp } = INDKIT;
    const base = (b, p) => p.custom ? (b.close >= b.open ? p.upColor : p.dnColor) : (b.close >= b.open ? cUp : cDn);
    const pt = (b, p) => ({ time: b.time, value: b.v || 0, color: rgba(base(b, p), p.op / 100) });
    return {
        name: 'Volume', vol: true,
        fields: [{ k: 'upColor', l: 'Up color', t: 'c' }, { k: 'dnColor', l: 'Down color', t: 'c' }, { k: 'op', l: 'Opacity %', t: 'n', min: 10, max: 100, step: 5 }, { k: 'ht', l: 'Height %', t: 'n', min: 5, max: 60, step: 5 }],
        defaults: { op: 55, ht: 20, custom: false, upColor: '#0f9d7a', dnColor: '#f7e21f' },
        create: () => [chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: 'vol', lastValueVisible: false, priceLineVisible: false })],
        calc: (d, p) => [d.map(b => pt(b, p))],
        tail: (d, p) => d.length ? [pt(d[d.length - 1], p)] : null,
        style: ind => ind.s[0].applyOptions({ visible: ind.v }),
        label: () => 'Volume',
        color: p => p.custom ? p.upColor : '#d1d4dc',
        fmt: (ind, g) => { const a = g(0); return a == null ? '' : cmp(a); },
        /* picking a colour switches the bars from "follow the candle colours" to the chosen colours */
        edited: (ind, k) => { if (k === 'upColor' || k === 'dnColor') ind.p.custom = true; },
        need: () => 1
    };
})());
