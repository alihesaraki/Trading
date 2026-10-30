/* ---------- Drag & drop: reorder coins (and move them between sections) ----------
   Mouse: press a row and drag. Touch: long-press a row, then drag. The first drop switches the list to a
   manual order (saved); right-click -> "Reset order" goes back to sorting by volume. */
let dg = null, dragS = '', noClick = 0;
$('list').addEventListener('pointerdown', e => {
    if (dg || e.button || (e.pointerType === 'mouse' && e.buttons !== 1))
        return;
    const r = e.target.closest('.row');
    if (!r || e.target.closest('.fl,.row-remove,input,.sc')) return;
    const isSection = r.classList.contains('sec');
    if (!isSection && !r.dataset.s) return;
    dg = { kind: isSection ? 'section' : 'coin', sec: isSection ? r.dataset.sec : '', s: isSection ? '' : r.dataset.s, x: e.clientX, y: e.clientY, px: e.clientX, py: e.clientY, id: e.pointerId, on: false, touch: e.pointerType === 'touch', slot: -1, t: 0, raf: 0, dy: 0, g: null };
    if (dg.touch)
        dg.t = setTimeout(() => {
            if (dg && !dg.on)
                dgStart();
        }, 320); /* long-press = start dragging */
    document.addEventListener('pointermove', dgMove);
    document.addEventListener('pointerup', dgEnd);
    document.addEventListener('pointercancel', dgEnd);
});
function dgMove(e) {
    if (!dg || e.pointerId !== dg.id)
        return;
    dg.px = e.clientX;
    dg.py = e.clientY;
    if (dg.on)
        return; /* the animation-frame loop follows the pointer */
    if (Math.hypot(dg.px - dg.x, dg.py - dg.y) > (dg.touch ? 10 : 5)) {
        if (dg.touch)
            dgStop(false);
        else
            dgStart();
    } /* touch moved early = the user is scrolling */
}
function dgStart() {
    const d = dg, row = d.kind === 'section' ? $('in').querySelector(`[data-sec="${d.sec}"]`) : $('in').querySelector(`[data-s="${d.s}"]`);
    if (!row) {
        dgStop(false);
        return;
    }
    d.on = true;
    if (d.kind === 'coin') dragS = d.s;
    const rc = row.getBoundingClientRect(), g = row.cloneNode(true);
    g.className = 'row gh';
    g.style.width = rc.width + 'px';
    g.style.height = rc.height + 'px';
    g.style.left = rc.left + 'px';
    d.dy = d.y - rc.top;
    d.g = g;
    document.body.appendChild(g);
    row.classList.add('dim');
    document.body.classList.add('dnd');
    try {
        $('list').setPointerCapture(d.id);
    }
    catch (_) { }
    d.raf = requestAnimationFrame(dgTick);
}
/* Move the floating row, work out the drop slot (0..rows.length = "before rows[slot]") and show the blue line */
function dgUpd() {
    const d = dg, l = $('list'), rc = l.getBoundingClientRect();
    d.g.style.transform = `translateY(${d.py - d.dy}px)`;
    const out = d.px < rc.left - 40 || d.px > rc.right + 40; /* pointer far outside the list = cancel */
    const y = d.py - d.dy + ROW / 2 - rc.top + l.scrollTop; /* centre of the floating row, in list coordinates */
    const s = clamp(Math.round(y / ROW), 0, rows.length), pv = rows[s - 1], nx = rows[s];
    d.slot = out ? -1 : s;
    const dl = $('dl');
    dl.hidden = out || (d.kind === 'coin' && !!((pv && pv.s === d.s) || (nx && nx.s === d.s))); /* no line when it would stay where it is */
    if (!dl.hidden)
        dl.style.transform = `translateY(${s * ROW}px)`;
}
function dgTick() {
    const d = dg;
    if (!d || !d.on)
        return;
    const l = $('list'), rc = l.getBoundingClientRect(), z = 48;
    const v = d.py < rc.top + z ? -clamp((rc.top + z - d.py) / z, 0, 1) : d.py > rc.bottom - z ? clamp((d.py - rc.bottom + z) / z, 0, 1) : 0;
    if (v && d.px >= rc.left - 40 && d.px <= rc.right + 40)
        l.scrollTop += Math.round(v * 16); /* auto-scroll near the top / bottom edge */
    dgUpd();
    d.raf = requestAnimationFrame(dgTick);
}
function dgStop(drop) {
    const d = dg;
    if (!d)
        return;
    dg = null;
    clearTimeout(d.t);
    cancelAnimationFrame(d.raf);
    document.removeEventListener('pointermove', dgMove);
    document.removeEventListener('pointerup', dgEnd);
    document.removeEventListener('pointercancel', dgEnd);
    if (!d.on)
        return;
    if (drop && d.slot >= 0) {
        if (d.kind === 'section') dropSection(d.sec, d.slot);
        else dropCoin(d.s, d.slot);
    }
    d.g.remove();
    $('dl').hidden = true;
    document.body.classList.remove('dnd');
    dragS = '';
    noClick = Date.now() + 300;
    lastKey = '';
    sched();
}
function dgEnd(e) {
    if (!dg || e.pointerId !== dg.id)
        return;
    if (dg.on) {
        dg.px = e.clientX;
        dg.py = e.clientY;
        dgUpd();
    }
    dgStop(e.type === 'pointerup');
}
/* Move a section divider like TradingView: coins after the divider belong to it until the next divider. */
function dropSection(id, slot) {
    if (!fullRows.some(x => x.sec === id)) return;
    const sequence = fullRows.filter(x => x.sec !== id);
    const visibleTarget = rows[slot];
    let target;
    if (visibleTarget) {
        target = sequence.findIndex(x => x.sec ? x.sec === visibleTarget.sec : x.s === visibleTarget.s);
    } else {
        if (slot >= rows.length) target = sequence.length;
        else {
            const prev = rows[slot - 1];
            target = prev ? sequence.findIndex(x => x.sec ? x.sec === prev.sec : x.s === prev.s) + 1 : sequence.length;
        }
    }
    if (target < 0) target = sequence.length;
    sequence.splice(target, 0, { sec: id });
    let active = 0;
    for (const item of sequence) {
        if (item.sec) active = item.sec;
        else if (item.s) {
            if (active) secOf[item.s] = active;
            else delete secOf[item.s];
        }
    }
    secs = sequence.filter(x => x.sec).map(x => secs.find(sec => sec.id === x.sec)).filter(Boolean);
    saveSecs();
    buildView();
    sched();
}
/* Put coin `sy` at slot `s` of the current rows: updates the manual order and, with sections, its section */
function dropCoin(sy, s) {
    const pv = rows[s - 1], nx = rows[s];
    if (!map[sy] || (pv && pv.s === sy) || (nx && nx.s === sy))
        return; /* dropped where it already is */
    const grouped = secs.length && !query.trim();
    ord = sortList(all.slice()).map(x => x.s).filter(x => x !== sy); /* freeze the order currently shown (minus the moved coin) */
    let g = gidOf(sy), anchor = null, before = true;
    if (grouped)
        g = !pv ? 0 : pv.sec ? pv.sec : gidOf(pv.s); /* section of the row above the slot (a header = top of that section) */
    if (nx && nx.s)
        anchor = nx.s;
    else if (pv && pv.s) {
        anchor = pv.s;
        before = false;
    }
    else if (grouped && pv && pv.sec)
        anchor = ord.find(x => gidOf(x) === g) || null; /* empty / collapsed section: first coin of it */
    const i = anchor ? ord.indexOf(anchor) : -1;
    if (i < 0)
        ord.push(sy);
    else
        ord.splice(before ? i : i + 1, 0, sy);
    if (grouped) {
        if (g)
            secOf[sy] = g;
        else
            delete secOf[sy];
        const x = secs.find(z => z.id === g);
        if (x && x.c)
            x.c = false; /* dropping into a collapsed section opens it */
        saveSecs();
    }
    sortKey = null;
    reIx();
    store.set('ord', ord);
    buildView();
    sched();
}
document.addEventListener('touchmove', e => {
    if (dg && dg.on && e.cancelable)
        e.preventDefault();
}, { passive: false }); /* no page scroll while dragging (touch) */
document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && dg)
        dgStop(false);
});
addEventListener('blur', () => dgStop(false));
