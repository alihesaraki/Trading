/* DMI: +DI, -DI, ADX (Wilder) in its own band under the chart */
INDREG.register('dmi', (function () {
    const { WID, colorAlpha, line } = INDKIT;
    /* DMI: +DI, -DI, ADX (Wilder) */
    function dmi(d, L, A) {
        const P = [], M = [], X = [];
        let tr = 0, pS = 0, mS = 0, dxS = 0, adx = 0, dn = 0;
        for (let i = 1; i < d.length; i++) {
            const b = d[i], q = d[i - 1], up = b.high - q.high, dw = q.low - b.low;
            const t = Math.max(b.high - b.low, Math.abs(b.high - q.close), Math.abs(b.low - q.close));
            const pd = up > dw && up > 0 ? up : 0, md = dw > up && dw > 0 ? dw : 0;
            if (i <= L) {
                tr += t;
                pS += pd;
                mS += md;
                if (i < L)
                    continue;
                tr /= L;
                pS /= L;
                mS /= L;
            }
            else {
                tr = (tr * (L - 1) + t) / L;
                pS = (pS * (L - 1) + pd) / L;
                mS = (mS * (L - 1) + md) / L;
            }
            const pl = tr ? 100 * pS / tr : 0, mi = tr ? 100 * mS / tr : 0, sum = pl + mi, dx = 100 * Math.abs(pl - mi) / (sum || 1);
            P.push({ time: b.time, value: pl });
            M.push({ time: b.time, value: mi });
            dn++;
            if (dn <= A) {
                dxS += dx;
                if (dn < A)
                    continue;
                adx = dxS / A;
            }
            else
                adx = (adx * (A - 1) + dx) / A;
            X.push({ time: b.time, value: adx });
        }
        return [P, M, X];
    }
    return {
        name: 'DMI', osc: true,
        fields: [{ k: 'adx', l: 'ADX smoothing', t: 'n', min: 1, max: 200, step: 1 }, { k: 'len', l: 'DI length', t: 'n', min: 1, max: 200, step: 1 }, WID, { k: 'showP', l: '+DI', t: 'b' }, { k: 'showM', l: '−DI', t: 'b' }, { k: 'showA', l: 'ADX', t: 'b' }, { k: 'cp', l: '+DI color', t: 'c' }, { k: 'cm', l: '−DI color', t: 'c' }, { k: 'ca', l: 'ADX color', t: 'c' }],
        defaults: { len: 14, adx: 14, w: 1, showP: true, showM: true, showA: true, cp: '#2962FF', cm: '#FF6D00', ca: '#F23645' } /* TradingView: +DI blue, -DI orange, ADX red */,
        create: ind => {
            const o = { priceScaleId: ind.sid };
            /* one value badge per line on the right edge (same as RSI) */
            ind.lbs = [0, 1, 2].map(() => { const e = document.createElement('div'); e.className = 'olb'; $('olb').appendChild(e); return e; });
            return [line(o), line(o), line(o)];
        },
        calc: (d, p) => dmi(d, p.len, p.adx),
        style: ind => ['cp', 'cm', 'ca'].forEach((k, i) => ind.s[i].applyOptions({ color: colorAlpha(ind.p, k), lineWidth: ind.p.w, visible: !!ind.v && [ind.p.showP, ind.p.showM, ind.p.showA][i] !== false })),
        label: ind => `DMI ${ind.p.adx} ${ind.p.len}`,
        color: p => p.cp,
        fmt: (ind, g) => [0, 1, 2].map(k => { const v = g(k); return `<span style="color:${[ind.p.cp, ind.p.cm, ind.p.ca][k]}">${v == null ? '' : v.toFixed(2)}</span>`; }).join(' '),
        need: p => (p.len + p.adx) * 4,
        frame(ind, ctx) {
            const items = [];
            ind.lbs.forEach((e, k) => {
                const visible = [ind.p.showP, ind.p.showM, ind.p.showA][k] !== false;
                const v = ind.v && visible && ind.last ? ind.last[k] : null, y = v == null ? null : ind.s[k].priceToCoordinate(v);
                if (y == null || y < 0 || y > ctx.H) { e.style.display = 'none'; return; }
                items.push({ e, k, y, v });
            });
            /* keep badges from overlapping: spread them at least 17px apart */
            items.sort((a, b) => a.y - b.y);
            for (let i = 1; i < items.length; i++) items[i].y = Math.max(items[i].y, items[i - 1].y + 17);
            for (const { e, k, y, v } of items) {
                e.style.display = 'block';
                e.style.width = ctx.W;
                e.style.background = [ind.p.cp, ind.p.cm, ind.p.ca][k];
                e.textContent = v.toFixed(2);
                e.style.transform = `translateY(${Math.round(y - 8)}px)`;
            }
        },
        destroy: ind => (ind.lbs || []).forEach(e => e.remove())
    };
})());
