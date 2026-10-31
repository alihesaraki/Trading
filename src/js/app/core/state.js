/* ---------- State ---------- */
const SAVED_SYMBOL_KEY = 'chartSelectedSymbol';
const SAVED_TIMEFRAME_KEY = 'chartSelectedTimeframe';
const validTimeframes = new Set(Object.values(TFS));
const savedSymbol = store.get(SAVED_SYMBOL_KEY, 'BTCUSDT');
const savedTimeframe = store.get(SAVED_TIMEFRAME_KEY, '1d');
let sym = typeof savedSymbol === 'string' && /^[^_\s]{2,30}USDT$/.test(savedSymbol) ? savedSymbol : 'BTCUSDT', tf = validTimeframes.has(savedTimeframe) ? savedTimeframe : '1d', all = [], map = {}, view = [], sortKey = 's', sortDir = -1, query = '';
store.set(SAVED_SYMBOL_KEY, sym);
store.set(SAVED_TIMEFRAME_KEY, tf);
let data = [], noMore = false, loadingOld = false, lastClose = null, lastUp = true, closeAt = 0, skew = 0, skewOk = false, cdCol = '';
/* pend: live candle that arrived before history finished loading; curKey: sym|tf of the data on screen;
   ctl: AbortController of in-flight chart requests; cuBusy/cuT: catch-up lock and last run time */
let pend = null, curKey = '', ctl = null, cuBusy = false, cuT = 0;
const DEFAULT_CANDLE_COLORS = ['#089981', '#F23645']; /* current TradingView default up / down colours */
let savedCandleColors = store.get('cc', DEFAULT_CANDLE_COLORS);
// Migrate the former built-in default, but preserve any custom colors saved by the user.
const isOldDefault = c => Array.isArray(c) && ((c[0]?.toLowerCase() === '#0f9d7a' && c[1]?.toLowerCase() === '#f7e21f') || (c[0]?.toLowerCase() === '#26a69a' && c[1]?.toLowerCase() === '#ef5350'));
if (isOldDefault(savedCandleColors)) {
  savedCandleColors = DEFAULT_CANDLE_COLORS;
  store.set('cc', savedCandleColors);
}
let [cUp, cDn] = Array.isArray(savedCandleColors) && savedCandleColors.length >= 2 ? savedCandleColors : DEFAULT_CANDLE_COLORS;
