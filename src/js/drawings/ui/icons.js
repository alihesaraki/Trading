  // tools/icons
  var d = (p) => `<path d="${p}" fill="none"/>`;
  var dot = (x, y) => `<circle cx="${x}" cy="${y}" r="1.8" fill="currentColor" stroke="none"/>`;
  var circ = (x, y) => `<circle cx="${x}" cy="${y}" r="2" fill="none"/>`;
  /* Long/Short position icon (TradingView style): green profit box + red stop box split by the entry line, with a bold L (long) or S (short) letter in the profit box. */
  var posIcon = (side) => {
    const long = side === "long", g = "#089981", r = "#f23645";
    const top = long ? g : r, bot = long ? r : g;
    const letter = long
      ? '<path d="M10 5.300v4.500h4" fill="none" stroke="' + g + '" stroke-width="1.800"/>'
      : '<path d="M14 14.800c-.5-.8-1.200-1.100-2-1.100-1.100 0-1.900.5-1.900 1.300 0 1.700 4 .8 4 2.600 0 .9-.9 1.400-2.100 1.400-1 0-1.800-.3-2.300-1" fill="none" stroke="' + g + '" stroke-width="1.500"/>';
    return '<rect x="3.500" y="3" width="17" height="9" rx="1.500" fill="' + top + '" fill-opacity=".22" stroke="' + top + '"/>'
      + '<rect x="3.500" y="12" width="17" height="9" rx="1.500" fill="' + bot + '" fill-opacity=".22" stroke="' + bot + '"/>'
      + '<path d="M3.500 12h17" stroke="currentColor" stroke-width="1.300"/>'
      + letter;
  };
  var IC = {
    cursor: d("M5 3l13 8-6 1.5L9.5 19z"),
    trend: d("M4 19L20 5") + circ(4, 19) + circ(20, 5),
    hline: d("M2 12h20") + dot(12, 12),
    hray: d("M4 12h18") + circ(4, 12),
    vline: d("M12 2v20") + dot(12, 12),
    arrow: d("M4 20L19 5M19 5h-7M19 5v7"),
    pchannel: d("M3 17L19 7M3 23L19 13") + d("M3 17v6M19 7v6"),
    volumeprofile: d("M3 4h18M3 8h13M3 12h18M3 16h10M3 20h15"),
    fibret: d("M3 5h18M3 10h18M3 15h18M3 20h18") + d("M6 5v15"),
    long: posIcon("long"),
    short: posIcon("short"),
    brush: d("M4 20c3 0 4-2 4-3.500L18 4l2 2L10 16.500c0 2-2 3.500-6 3.500z"),
    rect: d("M4 6h16v12H4z"),
    text: d("M5 6V4h14v2M12 4v16M9 20h6"),
    pricelabel: d("M3 12l5-5h13v10H8z") + dot(9, 12),
    flag: d("M6 21V4M6 4h12l-3 4 3 4H6"),
    arrowup: d("M12 20V5M5 11l7-7 7 7"),
    arrowdown: d("M12 4v15M5 13l7 7 7-7"),
    measure: d("M4 20L20 4M4 20h6M4 20v-6M20 4h-6M20 4v6"),
    stay: d("M12 3l9 4-9 4-9-4zM3 12l9 4 9-4M3 17l9 4 9-4"),
    lock: d("M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3"),
    unlock: d("M6 11h12v9H6zM8 11V8a4 4 0 0 1 7-2.500"),
    eye: d("M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z") + circ(12, 12),
    eyeoff: d("M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM3 3l18 18"),
    trash: d("M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13"),
    undo: d("M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3"),
    redo: d("M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3"),
    copy: d("M8 8h11v13H8zM5 16V3h11"),
    gear: d("M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z") + `<circle cx="12" cy="12" r="3" fill="none"/>`
  };
  var icon = (k, s = 20) => {
    if (k === "long" || k === "short") {
      const src = k === "long" ? "assets/images/long-position.png" : "assets/images/short-position.png";
      return `<img class="dr-position-icon" src="${src}" alt="" aria-hidden="true" width="${s}" height="${s}" style="width:${s}px;height:${s}px;object-fit:contain;vertical-align:middle;display:inline-block" />`;
    }
    return `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${IC[k] ?? IC.trend}</svg>`;
  };
