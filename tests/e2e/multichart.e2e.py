"""Multi-chart end-to-end test (real Chromium, Binance fully mocked: no network needed).
Run:  python3 tests/e2e/multichart.e2e.py   (needs: pip install playwright + a Chromium build)"""
import json, math, re, subprocess, sys, time, os, threading, http.server, functools
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
PORT = 8765
SYMS = {'BTCUSDT': 67000.5, 'ETHUSDT': 3200.25, 'SOLUSDT': 150.123, 'BNBUSDT': 600.1, 'XRPUSDT': 0.5123, 'DOGEUSDT': 0.1234}
IV = {'1m': 6e4, '5m': 3e5, '15m': 9e5, '1h': 36e5, '4h': 144e5, '1d': 864e5, '1w': 6048e5, '1M': 26784e5}

def klines(sym, iv, limit):
    ms = IV[iv]; now = int(time.time() * 1000); last = now - now % int(ms); base = SYMS.get(sym, 10)
    out = []
    for i in range(limit):
        t = last - (limit - 1 - i) * int(ms); w = math.sin(i / 7 + len(sym)) * base * .01
        o = base + w; c = base + math.sin((i + 1) / 7 + len(sym)) * base * .01
        out.append([t, str(o), str(max(o, c) * 1.002), str(min(o, c) * .998), str(c), '100', t + int(ms) - 1, '1', 1, '1', '1', '0'])
    return out

class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

def serve():
    h = functools.partial(Q, directory=ROOT)
    s = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), h)
    threading.Thread(target=s.serve_forever, daemon=True).start()
    return s

fails = []
def check(name, ok, info=''):
    print(('PASS ' if ok else 'FAIL ') + name + ((' -> ' + str(info)) if info != '' and not ok else ''))
    if not ok: fails.append(name)

def main():
    srv = serve()
    socks = []   # [{ws, subs:set}]
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': 1500, 'height': 900})
        page = ctx.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))

        def api(route):
            u = route.request.url
            if '/ticker/24hr' in u:
                route.fulfill(json=[{'symbol': k, 'lastPrice': ('%.4f' % v if v < 10 else '%.2f' % v), 'quoteVolume': '1000000'} for k, v in SYMS.items()], headers={'access-control-allow-origin': '*'})
            elif '/klines' in u:
                q = dict(re.findall(r'([a-zA-Z]+)=([^&]+)', u))
                if 'startTime' in q or 'endTime' in q:
                    route.fulfill(json=klines(q['symbol'], q['interval'], 2)[-1:] if 'startTime' in q else [], headers={'access-control-allow-origin': '*'})
                else:
                    route.fulfill(json=klines(q['symbol'], q['interval'], int(q.get('limit', 300))), headers={'access-control-allow-origin': '*'})
            else:
                route.fulfill(json=[], headers={'access-control-allow-origin': '*'})
        page.route(re.compile(r'https://(fapi\.binance\.com|api\.coingecko\.com)/.*'), api)

        def ws_handler(ws):
            rec = {'ws': ws, 'subs': set(), 'unsubbed': set()}
            socks.append(rec)
            def on_msg(m):
                d = json.loads(m)
                if d.get('method') == 'SUBSCRIBE':
                    for s in d['params']: rec['subs'].add(s)
                if d.get('method') == 'UNSUBSCRIBE':
                    for s in d['params']: rec['subs'].discard(s)
                ws.send(json.dumps({'result': None, 'id': d.get('id')}))
            ws.on_message(on_msg)
        page.route_web_socket(re.compile(r'wss://fstream\.binance\.com/.*'), ws_handler)

        page.goto(f'http://127.0.0.1:{PORT}/index.html')
        page.wait_for_selector('#chart canvas', timeout=15000)
        page.wait_for_function('window.DR && window.MC', timeout=15000)
        page.wait_for_function("document.querySelector('#ld').style.display==='none'", timeout=15000)
        check('single chart by default (no multi grid)', page.locator('.mc-wrap').count() == 0)
        check('layout button exists', page.locator('#btnMulti').count() == 1)

        # ---------- open 4-chart layout ----------
        page.click('#btnMulti')
        check('layout menu lists 5 layouts', page.locator('#mcmenu button').count() == 5)
        page.click('#mcmenu button[data-l="4"]')
        page.wait_for_function('MC.count()===4', timeout=5000)
        for i in (1, 2, 3):
            page.wait_for_function(f'(()=>{{const w=MC.frame({i});return !!(w&&w.MCP&&w.DR)}})()', timeout=20000)
        for i in (1, 2, 3):
            page.wait_for_function(f"MC.frame({i}).eval('data.length')>0", timeout=20000)
        check('chart 1 active at start', page.evaluate('MC.active()') == 0)
        check('4 cells + 3 iframes', page.locator('.mc-cell').count() == 4 and page.locator('iframe.mc-frame').count() == 3)
        syms = [page.evaluate('sym')] + [page.evaluate(f"MC.frame({i}).MCP.sym()") for i in (1, 2, 3)]
        check('4 different coins', len(set(syms)) == 4, syms)
        check('pane has no phone layout (max-width rules stripped)', page.evaluate("getComputedStyle(MC.frame(1).document.getElementById('mnav')).display") == 'none')
        for i in (1, 2, 3):
            check(f'pane {i} tool bar hidden, chart fills the cell', page.evaluate(f"getComputedStyle(MC.frame({i}).document.querySelector('.dr-tb')).display") == 'none')
        check('shared left toolbar in the multi wrapper', page.locator('.mc-wrap > .dr-tb').count() == 1)
        check('main page own toolbar hidden', page.evaluate("getComputedStyle(document.querySelector('#cw > .dr-tb')).display") == 'none')

        # ---------- timeframe ----------
        page.click('#tfs button[data-t="1h"]')
        for i in (1, 2, 3):
            page.wait_for_function(f"MC.frame({i}).eval('tf')==='1h' && MC.frame({i}).eval('data.length')>0", timeout=15000)
        check('timeframe follows in every chart', page.evaluate('tf') == '1h' and all(page.evaluate(f"MC.frame({i}).eval('tf')") == '1h' for i in (1, 2, 3)))
        page.wait_for_timeout(500)

        # ---------- indicators ----------
        page.click('#btnInd'); page.click('#imenu button[data-t="ema"]')
        for i in (1, 2, 3):
            page.wait_for_function(f"MC.frame({i}).document.querySelectorAll('#lg .lr').length===1", timeout=8000)
        check('indicator added in main shows in all charts', page.locator('#lg .lr').count() == 1)
        # remove it inside pane 2 -> everywhere
        fr2 = page.frame_locator('iframe.mc-frame >> nth=1')
        fr2.locator('#lg .lr').hover()
        fr2.locator('#lg .lr button[data-a="x"]').click()
        page.wait_for_function("document.querySelectorAll('#lg .lr').length===0", timeout=8000)
        for i in (1, 3):
            page.wait_for_function(f"MC.frame({i}).document.querySelectorAll('#lg .lr').length===0", timeout=8000)
        check('indicator removed in a pane disappears everywhere', True)
        page.click('#btnInd'); page.click('#imenu button[data-t="ema"]')
        page.wait_for_function("MC.frame(3).document.querySelectorAll('#lg .lr').length===1", timeout=8000)

        # ---------- active chart / watchlist ----------
        box = page.locator('iframe.mc-frame >> nth=1').bounding_box()
        page.mouse.click(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
        page.wait_for_function('MC.active()===2', timeout=3000)
        check('click on chart 3 activates it', page.evaluate('MC.active()') == 2)
        check('active cell highlighted', page.locator('.mc-cell.mc-act').count() == 1)
        page.locator('#list .row[data-s="BNBUSDT"], #list .row[data-s="XRPUSDT"]').first.wait_for(timeout=5000)
        target = 'DOGEUSDT' if page.locator('#list .row[data-s="DOGEUSDT"]').count() else 'XRPUSDT'
        before_main = page.evaluate('sym')
        page.click(f'#list .row[data-s="{target}"]')
        page.wait_for_function(f"MC.frame(2).MCP.sym()==='{target}'", timeout=5000)
        page.wait_for_function("MC.frame(2).eval('data.length')>0 && MC.frame(2).eval('curKey')==='" + target + "|1h'", timeout=15000)
        check('watchlist coin goes to the active chart only', page.evaluate('sym') == before_main)
        check('watchlist highlights the active chart coin', page.locator(f'#list .row.act[data-s="{target}"]').count() == 1)
        check('chart title shows the coin', target[:-4] in page.evaluate("MC.frame(2).document.getElementById('ttl').textContent"))

        # ---------- data use: trades stream only for the active chart ----------
        page.wait_for_timeout(800)
        agg = []
        for i, w in enumerate([None, 1, 2, 3]):
            subs = [s for r in socks for s in r['subs'] if s.endswith('@aggTrade')]
        all_agg = sorted(set(subs))
        check('only the active chart keeps the 100ms trade stream', len(all_agg) == 1 and all_agg[0].startswith(target.lower()), all_agg)
        klines_ = sorted({s for r in socks for s in r['subs'] if '@kline_1h' in s})
        check('every chart has its kline stream', len(klines_) == 4, klines_)

        # ---------- live update reaches an inactive chart ----------
        t0 = int(time.time() * 1000); tf_ms = 36e5; ot = int(t0 - t0 % tf_ms)
        sock_main = None
        for r in socks:
            if any(s.startswith('btcusdt@kline') or s.startswith(before_main.lower() + '@kline') for s in r['subs']): sock_main = r
        if sock_main:
            sock_main['ws'].send(json.dumps({'stream': 'x', 'data': {'e': 'kline', 'E': t0, 's': before_main, 'k': {'t': ot, 'T': ot + int(tf_ms) - 1, 's': before_main, 'i': '1h', 'o': '1', 'c': '77777', 'h': '77777', 'l': '1', 'v': '5', 'x': False}}}))
            page.wait_for_timeout(400)
            check('kline update draws on an inactive chart', page.evaluate('data[data.length-1].close') == 77777)

        # ---------- drawing tools: shared toolbar acts on the active chart ----------
        def draw_in(frame_idx, dx=0):
            if frame_idx == 0:
                bx = page.locator('#cw #chart').bounding_box()
            else:
                bx = page.locator(f'iframe.mc-frame >> nth={frame_idx-1}').bounding_box()
            x0, y0 = bx['x'] + bx['width'] * .3, bx['y'] + bx['height'] * .4
            page.mouse.move(x0, y0); page.mouse.down(); page.mouse.move(x0 + 80, y0 + 20, steps=6); page.mouse.up()
        def count(i): return page.evaluate(f"MC.frame({i}).DR.store.items.length")
        def pick_trend():
            grp = page.locator('.mc-wrap > .dr-tb .dr-grp').first
            grp.dispatch_event('pointerdown')
            page.locator('.mc-wrap > .dr-fly button[data-t="trend"]').click()
        # active = chart index 2 (third chart)
        pick_trend()
        check('toolbar tool becomes active on the active chart', page.evaluate("MC.frame(2).DR.ctl.tool") == 'trend')
        check('...and not on the main chart', page.evaluate("DR.ctl.tool") in (None, ''))
        draw_in(2)
        page.wait_for_timeout(300)
        check('drawing lands on the active chart only', count(2) >= 1 and count(0) == 0 and count(1) == 0, [count(0), count(1), count(2), count(3)])
        # undo from toolbar acts on the active chart
        page.locator('.mc-wrap > .dr-tb .dr-b[data-id="undo"]').click()
        page.wait_for_timeout(200)
        check('toolbar undo acts on the active chart', count(2) == 0, count(2))
        # switch active chart to main and draw there
        bx = page.locator('#cw #chart').bounding_box()
        page.mouse.click(bx['x'] + bx['width'] / 2, bx['y'] + 40)
        page.wait_for_function('MC.active()===0')
        pick_trend()
        draw_in(0)
        page.wait_for_timeout(300)
        check('drawing on chart 1 stays on chart 1', count(0) >= 1 and count(2) == 0, [count(0), count(1), count(2), count(3)])
        # same coin in another chart gets the drawing through storage sync
        main_sym = page.evaluate('sym')
        page.evaluate(f"MC.frame(3).MCP.setSym('{main_sym}')")
        page.wait_for_function(f"MC.frame(3).eval('curKey')==='{main_sym}|1h'", timeout=15000)
        page.wait_for_timeout(400)
        n0 = count(0)
        check('same coin in another chart shows the same drawings', count(3) == n0 and n0 >= 1, [count(0), count(3)])
        pick_trend(); draw_in(0); page.wait_for_timeout(400)
        check('new drawing syncs to the other chart with the same coin', count(3) == count(0) and count(0) >= 2, [count(0), count(3)])

        # ---------- chart type (top bar) applies to every chart; Replay (top bar) acts on the active chart ----------
        page.click('#btnType'); page.click('#typemenu button[data-type="line"]')
        for i in (1, 2, 3):
            page.wait_for_function(f"MC.frame({i}).eval('chartType')==='line'", timeout=8000)
        check('chart type chosen in the top bar applies to every chart', page.evaluate('chartType') == 'line')
        page.click('#btnType'); page.click('#typemenu button[data-type="candles"]')
        page.wait_for_function("MC.frame(1).eval('chartType')==='candles'", timeout=8000)
        bx = page.locator('iframe.mc-frame >> nth=0').bounding_box()
        page.mouse.click(bx['x'] + bx['width'] / 2, bx['y'] + 60)
        page.wait_for_function('MC.active()===1')
        page.click('#btnReplay')
        page.wait_for_function("MC.frame(1).document.getElementById('btnReplay').getAttribute('aria-pressed')==='true'", timeout=5000)
        check('Replay button starts replay in the active chart only', page.evaluate("document.getElementById('btnReplay').getAttribute('aria-pressed')") != 'true')
        page.evaluate("MC.frame(1).document.getElementById('btnReplay').click()")
        bx = page.locator('#cw #chart').bounding_box()
        page.mouse.click(bx['x'] + bx['width'] / 2, bx['y'] + 40)
        page.wait_for_function('MC.active()===0')

        page.screenshot(path='/tmp/mc4.png')

        # ---------- other layouts, then back to single ----------
        page.click('#btnMulti'); page.click('#mcmenu button[data-l="2v"]')
        page.wait_for_function('MC.count()===2 && document.querySelectorAll("iframe.mc-frame").length===1', timeout=5000)
        check('2-chart layout removes the extra iframes', page.locator('iframe.mc-frame').count() == 1)
        page.screenshot(path='/tmp/mc2.png')
        page.click('#btnMulti'); page.click('#mcmenu button[data-l="1"]')
        page.wait_for_function('MC.count()===1', timeout=5000)
        check('back to one chart: grid gone, own toolbar back', page.locator('.mc-wrap').count() == 0 and page.evaluate("getComputedStyle(document.querySelector('#cw > .dr-tb')).display") != 'none')
        check('chart still alive after returning', page.evaluate('data.length') > 0)
        check('trade stream back on in single mode', any(s.endswith('@aggTrade') for r in socks for s in r['subs'] if s.startswith(main_sym.lower())))

        # ---------- reload keeps the layout ----------
        page.click('#btnMulti'); page.click('#mcmenu button[data-l="3"]')
        page.wait_for_function('MC.count()===3')
        page.reload()
        page.wait_for_function('window.MC && MC.count()===3', timeout=20000)
        for i in (1, 2):
            page.wait_for_function(f"(()=>{{const w=MC.frame({i});return !!(w&&w.MCP&&w.DR)}})()", timeout=20000)
        check('layout restored after reload', page.evaluate('MC.layout()') == '3' and page.locator('iframe.mc-frame').count() == 2)

        # ---------- narrow window = one chart ----------
        page.set_viewport_size({'width': 700, 'height': 800})
        page.wait_for_function('MC.count()===1', timeout=5000)
        check('narrow window falls back to one chart', page.locator('.mc-wrap').count() == 0)
        page.set_viewport_size({'width': 1500, 'height': 900})
        page.wait_for_function('MC.count()===3', timeout=8000)
        check('wide again restores the saved layout', page.locator('iframe.mc-frame').count() == 2)

        check('no uncaught page errors', not errors, errors[:3])
        b.close()
    srv.shutdown()
    print('\nFAILED: %d' % len(fails) if fails else '\nALL PASSED')
    sys.exit(1 if fails else 0)

main()
