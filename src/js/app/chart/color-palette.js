/* ---------- ColorPalette: reusable 8 x 8 colour picker palette ----------
   ColorPalette.html(attrsFor)  -> markup (attrsFor(hex) returns the data-* attributes that tell the caller's own click handler what the swatch does)
   ColorPalette.mount(el, attrsFor) -> same markup injected into an element
   Clicking any swatch ALSO copies its HEX code to the clipboard (one delegated listener, installed once). */
const colorPalette = [
  ["#000000", "#242424", "#484848", "#6D6D6D", "#919191", "#B6B6B6", "#DADADA", "#FFFFFF"],
  ["#800000", "#A00000", "#C00000", "#E00000", "#FF2020", "#FF5050", "#FF8080", "#FFB0B0"],
  ["#803000", "#A04000", "#C05000", "#E06000", "#FF7000", "#FF9030", "#FFB060", "#FFD0A0"],
  ["#807000", "#A08C00", "#C0A800", "#E0C400", "#FFE000", "#FFE830", "#FFF060", "#FFF8A0"],
  ["#004000", "#006000", "#008000", "#00A000", "#00C000", "#30D030", "#70E070", "#B0F0B0"],
  ["#000060", "#000080", "#0000A0", "#0000C0", "#2020E0", "#5050FF", "#8080FF", "#B0B0FF"],
  ["#300060", "#480080", "#6000A0", "#7800C0", "#9020E0", "#B050F0", "#C880FF", "#E0B0FF"],
  ["#600030", "#800040", "#A00050", "#C00060", "#E02080", "#F050A0", "#FF80C0", "#FFB0D8"]
];
const ColorPalette = (function () {
    const flat = colorPalette.flat();
    function copyText(text) {
        if (navigator.clipboard && window.isSecureContext)
            return navigator.clipboard.writeText(text).then(() => true, () => legacy(text));
        return Promise.resolve(legacy(text)); /* file:// and http pages have no async clipboard API */
    }
    function legacy(text) {
        const ta = document.createElement('textarea');
        ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
        document.body.appendChild(ta); ta.select();
        let ok = false;
        try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
        ta.remove();
        return ok;
    }
    function html(attrsFor) {
        return `<div class="ipal cp" role="group" aria-label="Color palette">${colorPalette.map(row => row.map(c => `<button type="button" class="cp-sw" ${attrsFor ? attrsFor(c) : ''} data-cp-hex="${c}" title="${c} (click to apply and copy)" aria-label="${c}"><span class="cp-box" style="background:${c}"></span></button>`).join('')).join('')}</div>`;
    }
    function mount(el, attrsFor) { el.innerHTML = html(attrsFor); return el; }
    document.addEventListener('click', e => {
        const b = e.target.closest && e.target.closest('.cp-sw');
        if (!b) return;
        const hex = b.dataset.cpHex;
        Promise.resolve(copyText(hex)).then(ok => {
            if (!ok) return;
            b.classList.add('cp-copied'); /* brief highlight; the HEX is still in the tooltip */
            setTimeout(() => b.classList.remove('cp-copied'), 600);
        });
    });
    return { colors: colorPalette, flat, html, mount, copy: copyText };
})();
window.COLOR_PALETTE = ColorPalette.flat; /* flat list kept for older callers */
