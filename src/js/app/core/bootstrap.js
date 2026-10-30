/* =====================================================================
   Binance Futures chart - main app
   (chart, watchlist, live data via WebSocket, candle auto-update)
   ===================================================================== */
const API = 'https://fapi.binance.com', WSU = 'wss://fstream.binance.com/stream', WSU_MARKET = 'wss://fstream.binance.com/market/stream', ROW = 36, LIM = 300;
/* Timeframe label -> Binance interval, and interval length in ms (1M is approximate, only used as a fallback) */
const TFS = { '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1h', '4h': '4h', '1D': '1d', '1W': '1w', '1M': '1M' };
const TFMS = { '1m': 6e4, '5m': 3e5, '15m': 9e5, '1h': 36e5, '4h': 144e5, '1d': 864e5, '1w': 6048e5, '1M': 26784e5 };
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
/* localStorage wrapper that never throws */
const store = { get(k, d) {
        try {
            const v = JSON.parse(localStorage.getItem(k));
            return v == null ? d : v;
        }
        catch (_) {
            return d;
        }
    }, set(k, v) {
        try {
            localStorage.setItem(k, JSON.stringify(v));
        }
        catch (_) { }
    } };
const getJ = (u, sig) => fetch(u, { signal: sig }).then(r => r.json());
