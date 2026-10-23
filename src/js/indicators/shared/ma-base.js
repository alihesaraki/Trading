/* Shared factory for the moving-average family (SMA / EMA / SMMA). Each type has its own module file. */
function makeMAModule(name, def, algo) {
    const { LEN, SRCF, COL, WID, colorAlpha, srcv, line, fv } = INDKIT;
    return {
        name,
        fields: [LEN, SRCF, COL, WID],
        defaults: def,
        create: () => [line()],
        calc: (d, p, ind) => algo.calc(d, p.len, p.src, ind),
        tail: (d, p, ind) => algo.tail ? algo.tail(d, p.len, p.src, ind) : null,
        style: ind => ind.s[0].applyOptions({ color: colorAlpha(ind.p, 'color'), lineWidth: ind.p.w, visible: ind.v }),
        label: ind => `${name} ${ind.p.len} ${ind.p.src}`,
        color: p => p.color,
        fmt: (ind, g) => { const a = g(0); return a == null ? '' : fv(a); },
        need: p => algo.warm ? p.len * algo.warm : p.len
    };
}
