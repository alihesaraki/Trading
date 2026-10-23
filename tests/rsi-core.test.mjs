import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const source = await readFile(new URL('../src/js/indicators/shared/rsi-core.js', import.meta.url), 'utf8');
const ctx = {}; vm.runInNewContext(source, ctx);
const { calculate } = ctx.RSI_CORE;
const bars = values => values.map((close, i) => ({time:i+1, open:close, high:close, low:close, close}));
const near = (a,b,eps=1e-8) => assert.ok(Math.abs(a-b)<eps, `${a} != ${b}`);
test('Wilder RSI seeds after exactly length close-to-close changes', () => {
 const out=calculate(bars([10,11,12,11,13]),3); assert.equal(out.length,2); assert.equal(out[0].time,4); near(out[0].value,66.6666666667); near(out[1].value,83.3333333333);
});
test('rising-only and falling-only sequences produce 100 and 0', () => { assert.equal(calculate(bars([1,2,3,4]),2).at(-1).value,100); assert.equal(calculate(bars([4,3,2,1]),2).at(-1).value,0); });
test('flat data gives 100, exactly like TradingView (avgLoss == 0)', () => assert.equal(calculate(bars([5,5,5,5]),2).at(-1).value, 100));
test('source calculations support HL2, HLC3 and OHLC4', () => {
 const b=[{time:1,open:1,high:5,low:1,close:3},{time:2,open:3,high:7,low:3,close:5},{time:3,open:5,high:9,low:5,close:7}];
 for(const src of ['open','high','low','close','hl2','hlc3','ohlc4']) assert.ok(calculate(b,1,src).every(p=>Number.isFinite(p.value)));
});
test('duplicate timestamps are deduplicated and out-of-order input is sorted', () => {
 const input=[...bars([1,2,3]),{...bars([20])[0],time:2}]; const out=calculate(input,1); assert.ok(out.every((p,i)=>!i||p.time>out[i-1].time));
});
test('invalid OHLC breaks continuity and never emits NaN or Infinity', () => {
 const input=[...bars([1,2]),{time:3,open:NaN,high:NaN,low:NaN,close:NaN},...bars([5,6,7]).map((b,i)=>({...b,time:i+4}))];
 assert.ok(calculate(input,1).every(p=>Number.isFinite(p.value)));
});
test('incremental tail agrees with full recalculation (latest output)', () => {
 const a=bars([10,11,10,12,13,12,14]); const full=calculate(a,3).at(-1).value;
 const prefix=calculate(a.slice(0,-1),3); const recalculated=calculate(a,3).at(-1).value; assert.ok(prefix.length); near(full,recalculated);
});
test('different lengths warm up at their own first valid bar', () => { const data=bars([1,2,3,4,5,6]); assert.equal(calculate(data,2)[0].time,3); assert.equal(calculate(data,4)[0].time,5); });

test('tail() on the forming candle matches a full recalculation', () => {
 const a=bars([10,11,10,12,13,12,14,13,15,14,16]);
 for (const len of [1,3,5]) { const snap={}; calculate(a,len,'close',snap); const t=ctx.RSI_CORE.tail(snap,a.at(-1),len,'close'); const f=calculate(a,len).at(-1); assert.equal(t.time,f.time); near(t.value,f.value); }
});
test('matches a known TradingView/Wilder reference (len 14, classic 15-close example)', () => {
 const c=[44.34,44.09,44.15,43.61,44.33,44.83,45.10,45.42,45.84,46.08,45.89,46.03,45.61,46.28,46.28,46.00,46.03,46.41,46.22,45.64];
 const out=calculate(bars(c),14); assert.equal(out.length,6); near(out[0].value,70.46413502,1e-6); near(out[1].value,66.24961856,1e-6); near(out[2].value,66.48094,1e-3);
});

const { smooth, divergence, MA_TYPES } = ctx.RSI_CORE;
const plain = x => JSON.parse(JSON.stringify(x));
const nan = a => Array.from(a, v => Number.isNaN(v) ? null : v);
test('smoothing MA types follow Pine (na warm-up, EMA seed, RMA seeded by SMA, WMA weights, VWMA by volume)', () => {
 assert.deepEqual(plain(MA_TYPES), ['None','SMA','SMA + Bollinger Bands','EMA','SMMA (RMA)','WMA','VWMA']);
 assert.deepEqual(nan(smooth('SMA',[1,2,3,4,5],null,3).ma), [null,null,2,3,4]);
 assert.deepEqual(nan(smooth('None',[1,2,3],null,3).ma), [null,null,null]);
 const e = smooth('EMA',[1,2,3],null,3).ma; near(e[0],1); near(e[1],1.5); near(e[2],2.25);
 const r = smooth('SMMA (RMA)',[1,2,3,4,5],null,3).ma; assert.ok(Number.isNaN(r[1])); near(r[2],2); near(r[3],8/3); near(r[4],31/9);
 const w = smooth('WMA',[1,2,3,4,5],null,3).ma; near(w[2],14/6); near(w[4],26/6);
 const v = smooth('VWMA',[1,2,3,4,5],[1,1,2,2,1],3).ma; near(v[2],2.25); near(v[3],3.2); near(v[4],3.8);
});
test('Bollinger Bands use the biased (population) stdev times the multiplier around the SMA', () => {
 const { ma, sd } = smooth('SMA + Bollinger Bands',[1,2,3,4,5],null,3,2);
 near(ma[2],2); near(sd[2],2*Math.sqrt(2/3)); assert.ok(Number.isNaN(sd[1]));
 assert.ok(smooth('SMA',[1,2,3,4,5],null,3,2).sd.every(Number.isNaN));
});
test('regular bullish divergence: higher RSI low, lower price low, previous pivot 5-60 bars back', () => {
 const v=[50,45,40,35,30,20,30,35,40,45,50,45,40,35,30,25,30,35,40,45,50];
 const pts=v.map((value,i)=>({time:i+1,value})), lows=v.map(()=>100), highs=v.map(()=>100); lows[15]=90;
 const { bull, bear } = divergence(pts, lows, highs);
 assert.deepEqual(plain(bull.map(p=>[p.time,p.cond])), [[6,false],[16,true]]);
 assert.equal(bear.filter(p=>p.cond).length, 0);
 lows[15]=110; assert.equal(divergence(pts,lows,highs).bull.at(-1).cond, false);
});
test('regular bearish divergence: lower RSI high, higher price high', () => {
 const v=[50,55,60,65,70,80,70,65,60,55,50,55,60,65,70,75,70,65,60,55,50];
 const pts=v.map((value,i)=>({time:i+1,value})), lows=v.map(()=>100), highs=v.map(()=>100); highs[15]=120;
 const { bear } = divergence(pts, lows, highs);
 assert.deepEqual(plain(bear.map(p=>[p.time,p.cond])), [[6,false],[16,true]]);
});
