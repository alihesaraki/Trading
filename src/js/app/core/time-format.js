/* ---------- Tehran time (Asia/Tehran) for the time axis + crosshair label ----------
   Intl handles Iran's historical DST too, so old candles are labelled correctly as well. */
const TZ = 'Asia/Tehran', DAILY = new Set(['1d', '1w', '1M']);
const tzf = o => new Intl.DateTimeFormat('en-GB', Object.assign({ timeZone: TZ, hourCycle: 'h23' }, o));
const FT = { hm: tzf({ hour: '2-digit', minute: '2-digit' }), d: tzf({ day: 'numeric' }), m: tzf({ month: 'short' }), y: tzf({ year: 'numeric' }),
    f: tzf({ weekday: 'short', day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }) };
/* time-axis tick: 0 = year, 1 = month, 2 = day, 3+ = time of day */
const tickFmt = (t, type) => { const d = new Date(t * 1000); return type === 0 ? FT.y.format(d) : type === 1 ? FT.m.format(d) : type === 2 ? FT.d.format(d) : FT.hm.format(d); };
/* label shown on the time axis under the crosshair */
const crossFmt = t => {
    if (typeof t !== 'number')
        return '';
    const p = {};
    for (const x of FT.f.formatToParts(new Date(t * 1000)))
        p[x.type] = x.value;
    const day = `${p.weekday} ${p.day} ${p.month} '${p.year}`;
    return DAILY.has(tf) ? day : `${day}  ${p.hour}:${p.minute}`;
};
