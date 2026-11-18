"""CSP + keyboard smoke test (real Chromium, Binance mocked). The page's Content-Security-Policy stays ENABLED here.
Run:  python3 tests/e2e/csp.e2e.py"""
import re, os, sys, threading, http.server, functools
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
PORT = 8766
SYMS = {'BTCUSDT': '67000.50', 'ETHUSDT': '3200.25', 'SOLUSDT': '150.12', 'EVIL"><img src=x>USDT': '1.00'}
CORS = {'access-control-allow-origin': '*'}

def klines(limit):
    return [[1700000000000 + i * 86400000, '100', '101', '99', '100.5', '10', 1700000000000 + (i + 1) * 86400000 - 1, '1', 1, '1', '1', '0'] for i in range(limit)]

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

fails = []
def check(name, ok, info=''):
    print(('PASS ' if ok else 'FAIL ') + name + ((' -> ' + str(info)) if info != '' and not ok else ''))
    if not ok: fails.append(name)

def mock_api(route):
    u = route.request.url
    if '/ticker/24hr' in u:
        route.fulfill(json=[{'symbol': k, 'lastPrice': v, 'quoteVolume': '1000000'} for k, v in SYMS.items()], headers=CORS)
    elif '/klines' in u:
        route.fulfill(json=klines(300), headers=CORS)
    else:
        route.fulfill(json=[], headers=CORS)

def open_page(browser, url):
    page = browser.new_context(viewport={'width': 1400, 'height': 800}).new_page()
    violations, errors = [], []
    page.on('console', lambda m: violations.append(m.text) if 'Content Security Policy' in m.text or 'Content-Security-Policy' in m.text else None)
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.route(re.compile(r'https://(fapi\.binance\.com|api\.coingecko\.com)/.*'), mock_api)
    page.route_web_socket(re.compile(r'wss://fstream\.binance\.com/.*'), lambda ws: ws.on_message(lambda m: None))
    page.goto(url)
    return page, violations, errors

def main():
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(Quiet, directory=ROOT))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    with sync_playwright() as p:
        b = p.chromium.launch()
        for label, url in (('http', f'http://127.0.0.1:{PORT}/index.html'), ('file', 'file://' + os.path.join(ROOT, 'index.html'))):
            page, violations, errors = open_page(b, url)
            try:
                page.wait_for_selector('#in .row:not(.sec)', timeout=15000)
                loaded = True
            except Exception:
                loaded = False
            check(f'[{label}] app starts and the watchlist renders under the CSP', loaded)
            check(f'[{label}] no CSP violations', not violations, violations[:2])
            check(f'[{label}] no uncaught errors', not errors, errors[:2])
            if label == 'http' and loaded:
                rows = page.locator('#in .row:not(.sec)')
                names = [rows.nth(i).get_attribute('data-s') for i in range(rows.count())]
                check('symbol with markup characters is not listed', not any('<' in (n or '') or '"' in (n or '') for n in names), names)
                check('no injected <img> element in the list', page.locator('#in img[src="x"]').count() == 0)
                check('rows are focusable', rows.first.get_attribute('tabindex') == '0')
                rows.first.focus()
                page.keyboard.press('ArrowDown')
                focused = page.locator('#in .row:focus')
                check('ArrowDown moves focus to the next row', focused.count() == 1 and focused.get_attribute('data-s') == names[1], names[:2])
                page.keyboard.press('Enter')
                page.wait_for_timeout(300)
                check('Enter selects the focused coin', page.locator('#in .row.act').get_attribute('data-s') == names[1])
                check('focus survives the list re-render', page.locator('#in .row:focus').count() == 1)
                page.emulate_media(reduced_motion='reduce')
                dur = page.locator('#in .row').first.evaluate('e => getComputedStyle(e).transitionDuration')
                check('reduced motion shortens transitions', float(dur.replace("s", "")) < 0.01, dur)
        b.close()
    print('\nALL PASSED' if not fails else '\nFAILED: ' + ', '.join(fails))
    sys.exit(1 if fails else 0)

main()
