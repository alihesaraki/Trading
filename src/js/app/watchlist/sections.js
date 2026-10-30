/* ---------- Sections (like TradingView watchlist sections) ----------
   A section is a collapsible header that spaces coins apart. Coins keep their own sort order inside each
   group. secs = ordered headers [{id,n:name,c:collapsed}], secOf = coin -> section id (no entry = top group).
   Sections are shown only when no search / flag filter is active. */
let secs = store.get('secs', []), secOf = store.get('secOf', {}), editing = null, rows = [];
let sectionScope = 'all';
const scopeKey = () => flt || 'all';
const saveSecs = () => {
    const scope = sectionScope;
    if (scope === 'all') { store.set('secs', secs); store.set('secOf', secOf); }
    else { store.set('secs_' + scope, secs); store.set('secOf_' + scope, secOf); }
};
function syncSectionScope() {
    const next = scopeKey();
    if (next === sectionScope) return;
    sectionScope = next;
    if (next === 'all') { secs = store.get('secs', []); secOf = store.get('secOf', {}); }
    else { secs = store.get('secs_' + next, []); secOf = store.get('secOf_' + next, {}); }
    if (!Array.isArray(secs)) secs = [];
    if (!secOf || typeof secOf !== 'object' || Array.isArray(secOf)) secOf = {};
    editing = null;
}
const esc = t => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/* Section id a coin belongs to (0 = ungrouped top group) */
const gidOf = sy => secs.some(x => x.id === secOf[sy]) ? secOf[sy] : 0;
/* Manual order (set by drag & drop): list of symbols, saved in localStorage. Empty = default order (24h volume). */
let ord = store.get('ord', []), ordIx = new Map();
if (!Array.isArray(ord))
    ord = [];
const reIx = () => { ordIx = new Map(ord.map((x, i) => [x, i])); };
reIx();
function resetOrder() { ord = []; reIx(); store.set('ord', ord); buildView(); sched(); }
/* Sort a coin array in place by the active column (default: manual order, else 24h quote volume) */
function sortList(a) {
    if (sortKey) {
        const k = sortKey, d = sortDir;
        a.sort((x, y) => k === 's' ? d * ((x.mc || 0) - (y.mc || 0)) : d * (x[k] - y[k]));
    }
    else if (ord.length) {
        const ix = z => ordIx.has(z) ? ordIx.get(z) : 1e9;
        a.sort((x, y) => ix(x.s) - ix(y.s) || y.qv - x.qv);
    } /* coins not in the manual list go last */
    else
        a.sort((x, y) => y.qv - x.qv);
    return a;
}
function addSection(sx) {
    const id = 's' + Date.now().toString(36);
    if (sx) {
        const gid = gidOf(sx), grp = sortList(all.slice()).filter(s => gidOf(s.s) === gid), i = grp.findIndex(s => s.s === sx);
        secs.splice(gid === 0 ? 0 : secs.findIndex(x => x.id === gid) + 1, 0, { id, n: 'New section', c: false });
        for (const s of grp.slice(i))
            secOf[s.s] = id;
    }
    else
        secs.push({ id, n: 'New section', c: false }); /* right-click on empty space: add at the end */
    saveSecs();
    editing = id;
    buildView();
    sched();
}
function delSection(id) {
    const i = secs.findIndex(x => x.id === id);
    if (i < 0)
        return;
    const prev = i ? secs[i - 1].id : 0;
    for (const k in secOf)
        if (secOf[k] === id) {
            if (prev)
                secOf[k] = prev;
            else
                delete secOf[k];
        }
    secs.splice(i, 1);
    saveSecs();
    buildView();
    sched();
}
function toggleSec(id) {
    const x = secs.find(s => s.id === id);
    if (!x)
        return;
    x.c = !x.c;
    saveSecs();
    buildView();
    sched();
}
function renameSec(id) { editing = id; buildView(); sched(); }
function endEdit(inp, ok) {
    if (editing === null)
        return;
    const x = secs.find(s => s.id === editing);
    editing = null;
    if (x && ok) {
        x.n = inp.value.trim() || x.n;
        saveSecs();
    }
    buildView();
    sched();
}
const secHtml = x => `<div class="row sec" data-sec="${x.sec}"><span class="sc" role="button" tabindex="0" aria-label="${x.closed ? 'Expand' : 'Collapse'} section">${x.closed ? '▸' : '▾'}</span>${editing === x.sec ? `<input class="sni" maxlength="40" value="${esc(x.name)}">` : `<span class="sn">${esc(x.name)}</span>`}<span class="sk">${x.n}</span></div>`;
/* Shown name: the 1000 / 1000000 prefix of Binance's multiplied contracts is dropped (1000PEPE -> PEPE); long names get a smaller font. */
const coinName = b => b.replace(/^10{3,}(?=[A-Z])/, '');
const nmCls = b => { const n = coinName(b).length; return n > 8 ? ' xlong' : n > 5 ? ' long' : ''; };
let ver = 0, fullRows = [];
/* Filter + sort the list, build grouped rows, set the scroll height, mark the sorted column header.
   view = selectable coins only (keyboard navigation); rows = coins + section headers (rendering) */
function buildView() {
    syncSectionScope();
    const q = query.trim().toUpperCase();
    const matches = all.filter(s => (!q || s.b.startsWith(q) || coinName(s.b).startsWith(q)) && (!flt || (flt === 'fav' ? !!favs[s.s] : flags[s.s] === flt)));
    // Search results prioritize the shortest matching ticker (e.g. S before SOL).
    const items = q
        ? matches.sort((a, b) => a.b.length - b.b.length || a.b.localeCompare(b.b) || a.s.localeCompare(b.s))
        : sortList(matches);
    if (secs.length && !q) { /* each tab has its own independent section groups */
        const g = { 0: [] };
        secs.forEach(x => g[x.id] = []);
        for (const s of items)
            g[gidOf(s.s)].push(s);
        view = [...g[0]];
        rows = [...g[0]];
        fullRows = [...g[0]];
        for (const x of secs) {
            const headerRow = { sec: x.id, name: x.n, closed: x.c, n: g[x.id].length };
            fullRows.push(headerRow, ...g[x.id]);
            rows.push(headerRow);
            if (!x.c) {
                view.push(...g[x.id]);
                rows.push(...g[x.id]);
            }
        }
    }
    else {
        view = items;
        rows = items;
        fullRows = items;
    }
    ver++;
    $('msg').style.display = rows.length ? 'none' : 'block';
    $('msg').textContent = all.length ? (flt === 'fav' ? 'No favorite coins yet' : flt ? 'No flagged coins' : 'No results') : 'Loading…';
    $('sp').style.height = rows.length * ROW + 'px';
    [...$('cols').children].forEach(c => { const on = c.dataset.k === sortKey; c.className = on ? 'a' + (sortDir > 0 ? ' asc' : '') : ''; });
}
/* Virtualized list: only the visible rows (+2 buffer) exist in the DOM */
let raf = 0, vis = [], lastKey = '';
const sched = () => { raf || (raf = requestAnimationFrame(render)); };
const cTxt = s => s.o ? `${s.c >= 0 ? '' : '−'}${Math.abs(s.c).toFixed(2)}%` : '–';
const cCls = s => s.o ? (s.c >= 0 ? 'g' : 'r') : '';
function render() {
    raf = 0;
    const l = $('list'), a = Math.max(0, Math.floor(l.scrollTop / ROW) - 2), b = Math.min(rows.length, Math.ceil((l.scrollTop + l.clientHeight) / ROW) + 2);
    vis = rows.slice(a, b);
    $('in').style.transform = `translateY(${a * ROW}px)`;
    const key = a + '|' + b + '|' + ver + '|' + sym;
    if (key !== lastKey) { /* rows changed -> rebuild */
        lastKey = key;
        $('in').innerHTML = vis.map(s => s.sec ? secHtml(s) : `<div class="row${s.s === sym ? ' act' : ''}${s.s === dragS ? ' dim' : ''}" data-s="${s.s}"><button class="fl ${flags[s.s] || ''}" data-f="${s.s}" title="Choose flag color">${FLAG}</button><span class="nm${nmCls(s.b)}">${coinName(s.b)}</span>${flt ? `<button class="row-remove" data-remove="${s.s}" aria-label="${flt === 'fav' ? 'Remove from favorites' : 'Remove flag'}" title="${flt === 'fav' ? 'Remove from favorites' : 'Remove flag'}">×</button>` : ''}<b class="p ${s.d}">${fmt(s)}</b><b class="c ${cCls(s)}">${cTxt(s)}</b></div>`).join('');
        if (editing) {
            const i = $('in').querySelector('.sni');
            if (i) {
                i.focus();
                i.select();
            }
        } /* inline rename box */
    }
    else { /* same rows -> only patch changed texts */
        for (const r of $('in').children) {
            const s = map[r.dataset.s], p = r.querySelector('.p'), c = r.querySelector('.c');
            if (!s)
                continue;
            const t = fmt(s);
            if (p.textContent !== t)
                p.textContent = t;
            p.className = 'p ' + s.d;
            const ct = cTxt(s);
            if (c.textContent !== ct)
                c.textContent = ct;
            c.className = 'c ' + cCls(s);
        }
    }
    if (map[sym])
        header();
    /* subscribe to the rows now visible. Throttle (not debounce): live ticks re-render constantly, and a debounce
       would never fire, leaving old rows streaming (wasted data) and newly visible rows without a live price. */
    if (!render.t)
        render.t = setTimeout(() => { render.t = 0; syncWS(); }, 250);
}
$('list').addEventListener('scroll', sched, { passive: true });
$('list').onclick = e => {
    if (Date.now() < noClick)
        return; /* the click that ends a drag */
    const arrow = e.target.closest('.sec .sc');
    if (arrow) {
        toggleSec(arrow.closest('.sec').dataset.sec);
        return;
    }
    if (e.target.closest('.sec')) return;
    const remove = e.target.closest('.row-remove');
    if (remove) {
        const k = remove.dataset.remove;
        if (flt === 'fav') toggleFav(k); else setFlag(k, '');
        return;
    }
    const f = e.target.closest('.fl');
    if (f) {
        toggleFlag(f.dataset.f, f);
        return;
    }
    const r = e.target.closest('.row');
    if (r)
        select(r.dataset.s);
};
$('list').ondblclick = e => {
    const name = e.target.closest('.sec .sn');
    if (name)
        renameSec(name.closest('.sec').dataset.sec);
};
$('list').addEventListener('focusout', e => {
    if (e.target.classList.contains('sni'))
        endEdit(e.target, true);
});
$('list').addEventListener('keydown', e => {
    if (e.target.classList.contains('sc') && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        toggleSec(e.target.closest('.sec').dataset.sec);
        return;
    }
    if (!e.target.classList.contains('sni')) return;
    if (e.key === 'Enter') e.target.blur();
    else if (e.key === 'Escape') endEdit(e.target, false);
});
/* Watchlist right-click: coin / empty space -> add section; section header -> rename / delete */
$('list').oncontextmenu = e => {
    e.preventDefault();
    if (dg && dg.on)
        return;
    const h = e.target.closest('.sec'), r = e.target.closest('.row:not(.sec)');
    if (h)
        showMenu(e.clientX, e.clientY, [['Rename section', () => renameSec(h.dataset.sec)], ['Delete section', () => delSection(h.dataset.sec)]]);
    else
        showMenu(e.clientX, e.clientY, [['Add section', () => addSection(r && r.dataset.s)], ...(r ? [[favs[r.dataset.s] ? 'Remove from favorite' : 'Add to favorite', () => toggleFav(r.dataset.s)]] : [])]);
};
/* Header click: sort cycle (first direction <-> opposite; two states only) */
$('cols').onclick = e => {
    if (e.target.closest('.gr'))
        return;
    const k = e.target.closest('span')?.dataset.k;
    if (!k)
        return;
    const first = -1;
    if (sortKey !== k) {
        sortKey = k;
        sortDir = first;
    }
    else
        sortDir = -sortDir;
    buildView();
    $('list').scrollTop = 0;
    sched();
};
/* Convert Persian-layout keystrokes to their English key positions in Search.
   This lets symbol searches work even when the system keyboard is set to Persian. */
const faKeyMap = {
    'ض': 'q', 'ص': 'w', 'ث': 'e', 'ق': 'r', 'ف': 't', 'غ': 'y', 'ع': 'u', 'ه': 'i', 'خ': 'o', 'ح': 'p', 'ج': '[', 'چ': ']', 'پ': '\\',
    'ش': 'a', 'س': 's', 'ی': 'd', 'ي': 'd', 'ب': 'f', 'ل': 'g', 'ا': 'h', 'آ': 'h', 'ت': 'j', 'ن': 'k', 'م': 'l', 'ک': ';', 'ك': ';', 'گ': "'",
    'ظ': 'z', 'ط': 'x', 'ز': 'c', 'ر': 'v', 'ذ': 'b', 'د': 'n', 'ئ': 'm', 'ء': 'm', 'ؤ': ',', 'و': ',', '،': ',', '؟': '?', 'ژ': 'C'
};
const englishSearchText = value => Array.from(value, ch => faKeyMap[ch] ?? ch).join('');
$('q').oninput = e => {
    const converted = englishSearchText(e.target.value);
    if (converted !== e.target.value) {
        const pos = e.target.selectionStart;
        e.target.value = converted;
        try {
            e.target.setSelectionRange(pos, pos);
        }
        catch (_) { }
    }
    query = converted;
    buildView();
    $('list').scrollTop = 0;
    sched();
};
/* Type-to-search: letters typed anywhere on the chart/watchlist focus the search box.
   Keep normal typing intact in inputs, textareas, menus, and editable controls. */
const isSearchTypingTarget = t => !!(t && (t.isContentEditable || t.closest?.('input,textarea,select,[contenteditable="true"]')));
document.addEventListener('keydown', e => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || isSearchTypingTarget(e.target))
        return;
    const typedKey = englishSearchText(e.key).toUpperCase();
    if (!/^[A-Z]$/.test(typedKey))
        return;
    const search = $('q');
    if (!search || search.disabled)
        return;
    e.preventDefault();
    search.focus({ preventScroll: true });
    search.value += typedKey;
    search.dispatchEvent(new Event('input', { bubbles: true }));
}, true);
let selT = 0;
/* Select a coin (kb = keyboard navigation, slightly debounced) */
function select(s, kb) {
    // Choosing a search result returns to the full watchlist and brings the coin into view.
    const fromSearch = !!(query || $('q').value);
    if (fromSearch) {
        query = '';
        $('q').value = '';
        // A coin inside a collapsed section cannot be scrolled to until that section is expanded.
        const sectionId = gidOf(s);
        const section = secs.find(x => x.id === sectionId);
        if (section && section.c) {
            section.c = false;
            saveSecs();
        }
        buildView();
        const targetIndex = rows.findIndex(row => row && row.s === s);
        if (targetIndex >= 0) {
            const list = $('list');
            // Set the scroll position after the view is rebuilt, then render the virtual rows.
            list.scrollTop = Math.max(0, targetIndex * ROW);
            sched();
            requestAnimationFrame(() => {
                const currentIndex = rows.findIndex(row => row && row.s === s);
                if (currentIndex >= 0) {
                    list.scrollTop = currentIndex * ROW;
                    sched();
                }
            });
        } else {
            sched();
        }
    }
    if (s === sym)
        return;
    sym = s;
    store.set(SAVED_SYMBOL_KEY, sym);
    history.replaceState(null, '', '#' + s);
    resetState();
    header();
    sched();
    clearTimeout(selT);
    selT = setTimeout(() => { loadChart(); syncWS(); }, kb ? 140 : 0);
}
/* Arrow Up / Down: previous / next coin in the list */
document.addEventListener('keydown', e => {
    if ((e.key !== 'ArrowUp' && e.key !== 'ArrowDown') || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey)
        return;
    const t = e.target, tag = t.tagName;
    if ((tag === 'INPUT' && t.id !== 'q') || tag === 'SELECT' || tag === 'TEXTAREA' || !view.length)
        return;
    e.preventDefault();
    const i = view.findIndex(s => s.s === sym), d = e.key === 'ArrowDown' ? 1 : -1;
    const n = i < 0 ? (d > 0 ? 0 : view.length - 1) : Math.min(view.length - 1, Math.max(0, i + d));
    if (n === i)
        return;
    select(view[n].s, true);
    const l = $('list'), top = rows.indexOf(view[n]) * ROW;
    if (top < l.scrollTop)
        l.scrollTop = top;
    else if (top + ROW > l.scrollTop + l.clientHeight)
        l.scrollTop = top + ROW - l.clientHeight;
    sched();
});
/* Chart shortcuts: activate drawing tools immediately, with no extra toolbar click. */
const isTypingTarget = t => !!(t && (t.isContentEditable || t.closest?.('input,textarea,select,[contenteditable="true"]')));
function activateDrawingTool(type) {
    if (window.DR?.ctl?.setTool)
        window.DR.ctl.setTool(type);
}
function nextCoin() {
    if (!view.length)
        return;
    const i = view.findIndex(s => s.s === sym), n = i < 0 ? 0 : (i + 1) % view.length;
    select(view[n].s, true);
    const l = $('list'), top = rows.indexOf(view[n]) * ROW;
    if (top < l.scrollTop)
        l.scrollTop = top;
    else if (top + ROW > l.scrollTop + l.clientHeight)
        l.scrollTop = top + ROW - l.clientHeight;
    sched();
}
document.addEventListener('keydown', e => {
    if (isTypingTarget(e.target))
        return;
    if (e.code === 'Space' && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        e.preventDefault();
        nextCoin();
        return;
    }
    // TradingView-compatible chart reset. Rectangle has moved to Alt+Shift+R.
    if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.code === 'KeyR') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (typeof resetChartView === 'function') resetChartView();
    }
}, true);
addEventListener('hashchange', () => {
    const h = location.hash.slice(1).toUpperCase();
    if (h && map[h])
        select(h);
});
