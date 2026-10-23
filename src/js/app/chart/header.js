/* ---------- Header (title + daily change of the selected coin) ---------- */
function header() {
    const s = map[sym], b = sym.replace(/USDT$/, ''), tl = Object.keys(TFS).find(k => TFS[k] === tf);
    $('ttl').textContent = `${b} / TetherUS PERPETUAL CONTRACT · ${tl} · Binance`;
    if (!s || !s.o) {
        $('chg').textContent = '';
        return;
    }
    const p = +s.p, d = p - s.o, sg = d >= 0 ? '+' : '−';
    $('chg').textContent = `${sg}${Math.abs(d).toFixed(s.dec)} (${sg}${Math.abs(s.c).toFixed(2)}%)`;
    $('chg').style.color = d >= 0 ? cUp : cDn;
    document.title = `${fmt(s)} ${b} · Binance Futures`;
}
