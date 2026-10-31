import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readSource } from './helpers/sources.mjs';

const src = await readSource('src/js/app/data/websocket.js');

/* Minimal browser stand-in: a fake WebSocket that records everything the app sends */
function setup({ failOpen = false } = {}) {
  const sockets = [];
  let dead = false; /* after a test: no more reconnect timers, so the process can exit */
  class FakeWS {
    constructor(url) { this.url = url; this.readyState = 0; this.sent = []; sockets.push(this); if (dead) return; if (!failOpen) setTimeout(() => { this.readyState = 1; this.onopen && this.onopen(); }, 0); else setTimeout(() => { this.readyState = 3; this.onclose && this.onclose(); }, 0); }
    send(m) { this.sent.push({ t: Date.now(), m: JSON.parse(m) }); }
    close() { this.readyState = 3; }
    push(msg) { this.onmessage({ data: JSON.stringify(msg) }); }
  }
  const applied = [];
  const ctx = vm.createContext({
    WSU: 'wss://fstream.binance.com/stream', WSU_MARKET: 'wss://fstream.binance.com/market/stream',
    WebSocket: FakeWS, document: { hidden: false }, console, Date, Math, JSON, Object, Set, setTimeout, clearTimeout,
    requestAnimationFrame: f => setTimeout(f, 0),
    vis: [{ s: 'ETHUSDT' }, { s: 'SOLUSDT' }], sym: 'ETHUSDT', tf: '1m',
    map: { ETHUSDT: { p: '100.00', d: '', dec: 2, o: 90 }, SOLUSDT: { p: '10.00', d: '', dec: 2, o: 9 } },
    calc: s => (+s.p - s.o) / s.o * 100, sched() {}, bar: k => ({ time: k.t / 1000, open: +k.o, high: +k.h, low: +k.l, close: +k.c, v: +k.v, T: k.T }),
    applyBar: b => { ctx.data[ctx.data.length - 1] = b; applied.push(b); },
    data: [{ time: 60, open: 100, high: 101, low: 99, close: 100, v: 5 }], curKey: 'ETHUSDT|1m', closeAt: 120000,
    lastClose: 0, lastUp: true, skew: 0, skewOk: false, pend: null, window: {}, refresh() {}, catchUp() {},
  });
  vm.runInContext(src, ctx);
  vm.runInContext('connect()', ctx);
  return { ctx, sockets, applied, run: c => vm.runInContext(c, ctx), stop() { dead = true; vm.runInContext('clearTimeout(rowT)', ctx); sockets.forEach(w => { w.onclose = null; w.readyState = 3; }); } };
}
const wait = ms => new Promise(r => setTimeout(r, ms));

test('connects to the /market tier: aggTrade for the chart coin, miniTicker for watchlist rows', async () => {
  const t = setup();
  await wait(50);
  const ws = t.sockets[0];
  assert.equal(ws.url, 'wss://fstream.binance.com/market/stream');
  await wait(800);
  const params = ws.sent.flatMap(s => s.m.params);
  for (const p of ['ethusdt@aggTrade', 'ethusdt@kline_1m', '!contractInfo', 'solusdt@miniTicker']) assert.ok(params.includes(p), p);
  assert.ok(!params.includes('ethusdt@miniTicker'), 'the chart coin needs no miniTicker (kline is the heartbeat)');
  assert.ok(!params.includes('solusdt@aggTrade') && !params.includes('btcusdt@aggTrade'));
  t.stop();
});

test('control messages never exceed ~4 per second even while the list is scrolled constantly', async () => {
  const t = setup();
  await wait(50);
  const ws = t.sockets[0];
  for (let i = 0; i < 40; i++) { t.run(`vis = [{ s: 'COIN${i}USDT' }, { s: 'COIN${i + 1}USDT' }]; syncWS();`); await wait(25); }
  await wait(600);
  const times = ws.sent.map(s => s.t);
  for (let i = 0; i < times.length; i++) {
    const inSec = times.filter(x => x >= times[i] && x < times[i] + 1000).length;
    assert.ok(inSec <= 5, `${inSec} messages within one second (Binance limit is 10)`);
  }
  assert.ok(t.run('subs.has("coin40usdt@miniTicker")'));
  assert.ok(!t.run('subs.has("coin0usdt@miniTicker")'));
  t.stop();
});

test('aggTrade updates the watchlist price and the forming candle immediately', async () => {
  const t = setup();
  await wait(50);
  const ws = t.sockets[0];
  ws.push({ stream: 'ethusdt@aggTrade', data: { e: 'aggTrade', E: 70000, s: 'ETHUSDT', p: '103.50', T: 69990 } });
  ws.push({ data: { e: '24hrMiniTicker', E: 70000, s: 'SOLUSDT', c: '9.50' } });
  ws.push({ data: { e: '24hrMiniTicker', E: 70000, s: 'ETHUSDT', c: '90.00' } }); /* old 2s snapshot of the chart coin is ignored */
  await wait(30);
  assert.equal(t.run('map.ETHUSDT.p'), '103.50');
  assert.equal(t.run('map.ETHUSDT.d'), 'up');
  assert.equal(t.run('map.SOLUSDT.d'), 'dn');
  assert.equal(t.applied.length, 1);
  assert.equal(t.applied[0].close, 103.5);
  assert.equal(t.applied[0].high, 103.5);
  assert.equal(t.applied[0].v, 5, 'volume stays with the kline stream');
  t.stop();
});

test('an older kline snapshot does not move the candle back behind a newer trade', async () => {
  const t = setup();
  await wait(50);
  const ws = t.sockets[0];
  ws.push({ data: { e: 'aggTrade', E: 70200, s: 'ETHUSDT', p: '104.00', T: 70190 } });
  await wait(30);
  ws.push({ data: { e: 'kline', E: 70100, s: 'ETHUSDT', k: { t: 60000, T: 119999, i: '1m', o: '100', h: '103', l: '99', c: '103', v: '7', x: false } } });
  const last = t.applied[t.applied.length - 1];
  assert.equal(last.close, 104);
  assert.equal(last.high, 104);
  assert.equal(last.v, 7);
  t.stop();
});

test('falls back to the legacy /stream URL when the /market URL never delivers data', async () => {
  const t = setup({ failOpen: true });
  await wait(5200);
  assert.equal(t.sockets[0].url, 'wss://fstream.binance.com/market/stream');
  assert.ok(t.sockets.some(s => s.url === 'wss://fstream.binance.com/stream'));
  t.stop();
});

test('watchlist rows are streamed in pulses: subscribed in the on-phase, dropped in the off-phase, chart streams never dropped', async () => {
  const t = setup();
  await wait(50);
  assert.ok(t.run('subs.has(\"solusdt@miniTicker\")'));
  t.run('rowPulse()'); /* off-phase */
  await wait(700);
  assert.ok(!t.run('subs.has(\"solusdt@miniTicker\")'), 'rows dropped between pulses');
  assert.ok(t.run('subs.has(\"ethusdt@aggTrade\") && subs.has(\"ethusdt@kline_1m\")'), 'chart streams stay on');
  t.run('rowPulse()'); /* on-phase again */
  await wait(700);
  assert.ok(t.run('subs.has(\"solusdt@miniTicker\")'));
  t.stop();
});
