# PROJECT AUDIT REPORT — Binance Futures Chart ("Trading-main", package `tview-chart`)

| | |
|---|---|
| **Audit date** | 2026-11-18 |
| **Auditor role** | Senior Software Architect / Security / QA / UX (read-only audit) |
| **Commit / branch** | **Not determinable** — the supplied ZIP contains no `.git` directory |
| **Scope** | Entire archive: `index.html`, `src/` (JS + CSS), `scripts/`, `tests/`, `docs/`, `dist/`, `assets/` (125 files) |
| **Method** | Static code reading, grep evidence, build + test run **in a scratch copy** (original untouched; see Appendix C) |

**Assumptions & stated purpose.** The project is a client-only, framework-free web app that clones a TradingView-style trading terminal for **Binance USDT-M Futures**: candlestick chart (Lightweight Charts 4.2.0), live WebSocket data, watchlist, 7 indicators, drawing tools, bar replay, multi-chart (up to 4), mobile layout (README §1). It has no backend, no accounts and no payments; it is a free analysis tool (README disclaimer: "not financial advice"). The business model is therefore unknown/none; I assumed a personal or community tool, possibly later monetised. The UI was **not rendered**; UI/UX findings are code-based.

> **Remediation update (2026-11-18):** the top-five actions below were implemented afterwards in a working copy: F-001 (SRI + CSP), F-002 (CI), F-003 (symbol validation/escaping), F-004 (`log.warn` helper, no empty catches), F-005 (reduced motion + keyboard rows), F-006 (docs). Scores and findings in this report describe the code **as audited, before** those changes.

## Table of contents
1. [Project Health Assessment](#1-project-health-assessment) · 2. [Critical Problems & Weaknesses](#2-critical-problems--weaknesses) · 3. [Technical & Architectural Risk Assessment](#3-technical--architectural-risk-assessment) · 4. [Improvement & Upgrade Recommendations](#4-improvement--upgrade-recommendations) · 5. [Competitive Analysis](#5-competitive-analysis--feature-gap-assessment) · 6. [UI/UX & Visual Design](#6-uiux--visual-design-evaluation) · 7. [Product Opportunities](#7-product-improvement-opportunities) · 8. [Next Release Proposal](#8-next-release-proposal) · 9. [Roadmap](#9-implementation-roadmap) · 10. [Executive Summary](#10-final-executive-summary) · Appendices [A](#appendix-a--evidence-ledger) [B](#appendix-b--not-inspected--not-verifiable) [C](#appendix-c--methodology--commands-run) [D](#appendix-d--glossary)

---

## 1. Project Health Assessment

### Stack & size snapshot
| Area | Facts |
|---|---|
| Languages | Plain browser JavaScript (classic scripts, no modules), CSS, one HTML page; Node ESM for build/tests; one Python e2e script |
| Frameworks / deps | None at runtime besides vendored Lightweight Charts 4.2.0 (`assets/vendor/…`, 163 KB). `package.json` has **zero** dependencies |
| Build | `scripts/build.mjs` concatenates fragments in the order of `scripts/manifest.mjs` into 4 files in `dist/` |
| Source LOC | JS `src/` 7,889 · CSS `src/styles/` 2,961 · tests 1,158 (incl. helper) · docs 411 lines |
| Shipped size (unminified) | `dist/app.js` 160,691 B · `drawings.js` 131,006 B · `indicators.js` 90,742 B · `style.css` 68,522 B ≈ **451 KB** |
| Largest source files | `drawings/runtime/controller.js` 958 · `drawings/ui/panel.js` 640 · `indicators/core/engine.js` 630 · `watchlist/sections.js` 404 · `ui/replay.js` 372 |
| Hosting / CI | None configured in the archive (no workflow files, no Dockerfile, no hosting config) |

### Scores
| Category | Weight | Score | Evidence | Why not higher |
|---|---:|---:|---|---|
| Architecture & structure | 15 | 70 | Clear feature folders (README §3); single ordering source `scripts/manifest.mjs`; late-bound guard pattern `window.IND && …` (README §5); multi-chart reuses the app in iframes (`docs/ARCHITECTURE.md`) | Shared global scope + order as a runtime contract (`docs/TECHNICAL_DEBT.md`); cross-bundle coupling via globals/`window.TVDR`; iframe+`localStorage` event sync |
| Code quality & maintainability | 15 | 68 | Consistent naming, comments explain intent (e.g. `history.js:1-20`); but files of 958/640/630 lines; very long template-literal lines (`sections.js:159`); 17 empty `catch` blocks | No linter/formatter config in repo; large files; dense markup-in-JS |
| Security | 15 | 72 | No secrets found (grep); no backend; most user text escaped (`sections.js:23,100`); WS frames parsed in try/catch (`websocket.js`); hex values validated (`drawings/ui/panel.js:17`) | No CSP; CDN fallback scripts without SRI (`index.html` loader, ~l.96); external strings reach `innerHTML` unescaped (F-003) |
| Testing & QA | 12 | 70 | **94/94 tests pass** (run by me); e2e exists (`tests/e2e/multichart.e2e.py`); RSI parity tests vs TradingView logic; `node:vm` behaviour tests for WebSocket | Many tests assert on source text (`readSource`), not behaviour; no coverage measure; e2e not run by me; no CI |
| Performance & resource efficiency | 10 | 70 | Virtualised watchlist (`sections.js:151-160`), throttled WS subscription, caching (`chart/cache.js`), 24 h market-cap cache (`docs/PERFORMANCE.md`) | **No measurements** (docs admit it); unminified 451 KB; 4 full app instances for 4 charts |
| Dependency management | 8 | 80 | Zero npm deps; vendored, pinned library; local file first | Library pinned at 4.2.0 — currency vs. latest major **not checked**; no integrity pinning |
| Error handling & logging | 8 | 62 | Exponential back-off retry (`history.js`), watchdog (`watchdog.js`), stale-response token | **0 `console.*` calls** in `src/`; 17 empty `catch (_) { }`; failures mostly invisible to user/dev |
| Documentation | 7 | 78 | README (496 lines) explains the unusual architecture, rules, recipes; 8 docs files | Drift: README says "64 tests" (§3, §6, §8) but 94 run; `assets/vendor/README.md` still says "Put this file here" |
| Dev/deploy configuration & automation | 5 | 40 | Scripts `build`, `test`, `check:syntax` exist | No CI, no lint, no `.gitignore`/LICENSE/deploy config in archive; manual dist sync |
| Accessibility & UI consistency | 5 | 58 | ARIA labels/roles on most top-bar controls (`index.html:~64-75`); `:focus-visible` in 5 stylesheets | **No `prefers-reduced-motion` anywhere** in `src/styles`; watchlist rows are non-focusable `div`s (`sections.js:159`, potential) |

**Overall = (70×15 + 68×15 + 72×15 + 70×12 + 70×10 + 80×8 + 62×8 + 78×7 + 40×5 + 58×5) / 100 = 6862 / 100 = 68.6 / 100.**
No Critical security finding and tests exist, so no caps apply.

**Maturity: Level 3 – Developing** (upper end). Reasonable structure, real tests and good docs; missing automation, observability, accessibility polish and measured performance.

### Most significant positives
- **Build output verified in sync:** rebuilding in a scratch copy produced byte-identical `dist/` files (`cmp` on all four).
- **Honest, thorough documentation** of the unusual architecture, including debt and what is *unverified* (`docs/TECHNICAL_DEBT.md`, `docs/PERFORMANCE.md`).
- **Resilient data layer:** back-off retries, rate-limit-aware waits, WS fallback endpoint, tab-visibility unsubscribe, diff-based subscribe batching under Binance's documented limits.
- **Zero runtime dependencies**, vendored chart library with CDN fallbacks.
- **Test suite is green and meaningful in places** (RSI parity, WebSocket pulse logic via `node:vm`).

---

## 2. Critical Problems & Weaknesses

No Critical or High findings were confirmed.

### 2.1 Confirmed issues

| Field | F-001 |
|---|---|
| Title | CDN fallback scripts loaded without Subresource Integrity; no Content-Security-Policy |
| Description | If the local library fails, `index.html` loads Lightweight Charts from jsDelivr, cdnjs, unpkg with no `integrity=` attribute; the page has no CSP meta/header (grep: 0 matches for `integrity=`/`Content-Security`). |
| Location | `index.html` loader script (`LIB` array, ~line 96) |
| Severity | Medium |
| Why a problem | Third-party code executed with full page privileges if a CDN/path is compromised. |
| Consequences | Script injection → access to `localStorage` (watchlist, drawings, settings) and ability to alter displayed prices (misleading for traders). No credentials exist client-side, which limits impact. |
| Recommended solution | Add `integrity` + `crossorigin` to the fallback loads (hash of the vendored 4.2.0 file) or drop the fallbacks; add a CSP meta/header with `script-src 'self'` and `connect-src` limited to `fapi.binance.com`, `fstream.binance.com`, `api.coingecko.com`. |
| Status | Confirmed |

| Field | F-002 |
|---|---|
| Title | No automated quality gate (no CI, lint, or dist-sync check) |
| Description | Tests/build are manual npm scripts; `dist/` is committed and must be regenerated by hand (README §6). No workflow, lint config, or pre-commit hook exists in the archive. |
| Location | repo root / `package.json` |
| Severity | Medium |
| Why | The "edit `src/`, never `dist/`" rule is enforced only by convention; a stale `dist/` silently ships old code (the browser never loads `src/`). |
| Consequences | Regressions and stale bundles reaching users. |
| Recommended solution | A CI job: `npm run build && git diff --exit-code dist && npm test && npm run check:syntax`; add ESLint (no new runtime dependency). |
| Status | Confirmed (absence in archive; a `.github` folder could exist upstream — not verifiable) |

| Field | F-003 |
|---|---|
| Title | Exchange-supplied symbol strings inserted into `innerHTML` unescaped |
| Description | The watchlist row template interpolates `s.s` (attribute) and `coinName(s.b)` (text) raw. `ingest()` only rejects symbols containing `_`, control characters, or not ending in `USDT`; `"`, `<`, `>` are not rejected. The project's own `esc()` (`sections.js:23`) is used for section names but not here. |
| Location | `src/js/app/watchlist/sections.js:159` (template), `:102` (`coinName`), `src/js/app/data/ticker-data.js:8-30` (`ingest`) |
| Severity | Low |
| Why | Inconsistent output encoding; relies entirely on Binance and TLS behaving. |
| Consequences | Practically unlikely (trusted source over HTTPS), but becomes exploitable if the data source is ever proxied/replaced or a CSP is absent (see F-001). |
| Recommended solution | Validate symbols in `ingest()` with `/^[A-Z0-9]{2,30}USDT$/` (the early-fetch in `index.html` already uses a similar regex) and run `esc()` over interpolated values. |
| Status | Confirmed (pattern); exploitability Potential |

| Field | F-004 |
|---|---|
| Title | No logging/telemetry; silent failure swallowing |
| Description | `grep console\.` returns 0 hits in `src/`; 17 occurrences of `catch (_) { }`, e.g. `ui/multichart.js:66,71,148`, `ui/pane-mode.js:12,59`, `core/bootstrap.js` `store` wrapper. |
| Severity | Medium |
| Why | Failures (storage quota, iframe access, parse errors) become undiagnosable in the field. |
| Consequences | Hard-to-reproduce bugs; users see a frozen UI without explanation. |
| Recommended solution | A tiny `log.warn(scope, err)` helper (debug flag via `localStorage`), used in catches that hide real errors; keep silence only where documented (e.g. malformed WS frame, `websocket.js`). |
| Status | Confirmed |

| Field | F-005 |
|---|---|
| Title | No `prefers-reduced-motion` handling; limited keyboard path in the watchlist |
| Description | `grep prefers-reduced-motion src/styles` → 0 files. Watchlist rows are `div.row[data-s]` without `tabindex`/role (`sections.js:159`); only the section toggle has `role="button" tabindex="0"` (`:100`). |
| Severity | Medium |
| Why | Violates the stated accessibility baseline; keyboard users cannot select a coin by keyboard (if no other handler exists — **not verified**; the global `keydown` handler was not traced). |
| Recommended solution | Add a reduced-motion block in `tokens.css`/`base.css`; give rows `role="option"`/`tabindex` with arrow-key navigation (listbox pattern). |
| Status | Confirmed (reduced-motion) / Potential (keyboard) |

| Field | F-006 |
|---|---|
| Title | Documentation drift |
| Description | README states "64 tests" (§3, §6, §8); `npm test` runs **94**. `assets/vendor/README.md` instructs to add the library though it is present. |
| Severity | Low · Status Confirmed |
| Recommended solution | Remove hard-coded counts; rewrite the vendor README as "how to update". |

| Field | F-007 |
|---|---|
| Title | Chart time zone hard-coded to Asia/Tehran |
| Location | `src/js/app/core/time-format.js:3` (`const TZ = 'Asia/Tehran'`); replay date picker text in `index.html` ("Chart time zone: Asia/Tehran") |
| Severity | Low (documented, intentional — README "known limits") |
| Why | Non-Iranian users see offset times; competitors expose a time-zone setting [V] (Binance FAQ). |
| Recommended solution | Setting persisted in `localStorage`, default = browser zone. |
| Status | Confirmed |

| Field | F-008 |
|---|---|
| Title | Oversized modules and unminified shipping |
| Location | `drawings/runtime/controller.js` (958 lines), `drawings/ui/panel.js` (640), `indicators/core/engine.js` (630); `dist/*` ≈ 451 KB unminified |
| Severity | Low · Status Confirmed |
| Recommended solution | Split by responsibility only when next touched; add an optional minify step (esbuild as devDependency) keeping unminified output for debugging. |

### 2.2 Potential concerns (need investigation)

| ID | Concern | Location | Why it needs checking |
|---|---|---|---|
| P-001 | Tests asserting on source text can pass while behaviour is broken | `tests/helpers/sources.mjs`; 8 test files use `readSource` | Brittle against refactors, weak against regressions; measure which tests execute code vs. regex source |
| P-002 | Multi-chart = up to 4 full app instances (iframes) → 4× JS parse/heap, 4 WebSocket connections per IP | `docs/ARCHITECTURE.md` (Multi-chart), `ui/multichart.js` | No profiling exists; may hurt low-end devices and Binance connection limits |
| P-003 | e2e test (Playwright, Binance mocked) never confirmed running | `tests/e2e/multichart.e2e.py` | Not executed in this audit |
| P-004 | Lightweight Charts attribution/licence obligations (Apache-2.0 + TradingView attribution notice) | `assets/vendor/…`, README Credits | Not verified that the rendered chart shows the required attribution |
| P-005 | Library 4.2.0 may be behind a newer major | `assets/vendor/` | Not checked; upgrade only with compatibility review |
| P-006 | CoinGecko free API (~600 KB/day) rate limits / CORS failure handling | `data/market-caps.js` | Failure path exists (try/catch) but UX effect unobserved |
| P-007 | Missing LICENSE, `.gitignore`, repo hygiene files | archive root | ZIP may have omitted them; cannot tell |

---

## 3. Technical & Architectural Risk Assessment

| ID | Risk | Prob. | Impact | Level | Mitigation | Timing |
|---|---|---|---|---|---|---|
| R-01 | Stale `dist/` shipped (F-002) | Medium | High | **High** | CI dist-diff check | Immediate |
| R-02 | Supply-chain via CDN fallback (F-001) | Low | High | **Medium** | SRI/CSP | Immediate |
| R-03 | Binance API/WS changes or rate-limits (external dependency) | Medium | High | **High** | Already partially mitigated (back-off, fallback URL); add contract tests with recorded payloads | Immediate (tests) |
| R-04 | Global-scope + order coupling breaks on edit | Medium | Medium | Medium | Keep manifest tests; add an "all `src` files listed" test | Postpone |
| R-05 | Multi-chart resource use (P-002) | Medium | Medium | Medium | Profile first | Postpone |
| R-06 | Silent failures (F-004) | High | Medium | **Medium-High** | Logging helper | Immediate |
| R-07 | Single point of failure: Binance REST/WS & CoinGecko | Medium | High | High | Status banner when data stale | Postpone |
| R-08 | Scalability: only static hosting; load grows on Binance, not on server | Low | Low | Low | none needed | Postpone |
| R-09 | Browser/device: iframe multi-chart disabled <820 px and `file://` (docs) — fallback exists | Low | Low | Low | — | Postpone |
| R-10 | Data integrity: `localStorage` shape changes need migrations (README §5) | Medium | Medium | Medium | Add schema `version` + migration tests | Postpone |
| R-11 | Long-term maintainability: no linter, big files | Medium | Medium | Medium | ESLint, split on touch | Postpone |
| R-12 | Library upgrade/compat (P-005) | Low | Medium | Low | Planned spike | Postpone |

**Address immediately:** R-01, R-02, R-03 (contract tests), R-06.
**Can be postponed:** R-04, R-05 (until profiled), R-07–R-12.

---

## 4. Improvement & Upgrade Recommendations

Format: Title · Problem · Why · Outcome · Complexity · Effort · Priority · Prerequisites · Risks.

**Architecture**
- **A1 – Manifest-completeness test** · `scripts/manifest.mjs` silently ignores unlisted files (README §2.3) · prevents "code that never runs" · test fails if any `src/**/*.js` is absent from the manifest · Low · S · P1 · none · none.
- **A2 – Keep classic-script model; do not migrate to ES modules/bundler now.** Justification: the model is deliberate (file://, no build for hosting) and works; migration cost is high with only unit tests covering browser behaviour (`docs/TECHNICAL_DEBT.md`). Revisit when a browser regression suite exists.

**Code quality**
- **C1 – Add ESLint (flat config) + Prettier check** (dev-only) · none present · catches undefined globals across fragments · Medium · M · P2 · A1 · globals config must list cross-file names.
- **C2 – Split `controller.js`/`panel.js`/`engine.js` opportunistically** · 958/640/630 lines · reviewability · Medium · L · P3 · tests for drawings behaviour · regression risk (hit-testing).

**Performance**
- **PF1 – Profile first**: record Performance traces for (a) single chart + 500-row watchlist live, (b) 4-chart layout · docs state no baselines · evidence before optimisation · Low · M · P2.
- **PF2 – Optional minified build** · 451 KB unminified · faster first load · Low · S · P3 · devDependency approval · harder debugging (keep sourcemaps).

**Security**
- **S1 – SRI + CSP** (F-001) · Low · S · P0/P1 · compute hash of vendored file · CSP too strict can block inline loader (`index.html` has inline scripts → use nonces/hash or move loader to a file).
- **S2 – Validate/escape exchange strings** (F-003) · Low · S · P1 · none · none.

**Frontend**
- **U1 – Reduced-motion + keyboard-navigable watchlist** (F-005) · Medium · M · P1.
- **U2 – User-selectable time zone** (F-007) · Low · S · P2 · touches `time-format.js`, drawings time formatting (`drawings/ui/panel.js:18`) · persisted-drawing times are absolute, so safe.

**Database / API**
- **D1 – Versioned `localStorage` schema + migration helper** · keys scattered (README §5) · avoids breaking users' saved drawings/layouts · Medium · M · P2.
- **D2 – Validate Binance payload shapes** in `ingest()`/`history.js` (types of `lastPrice`, kline arrays) · Low · S · P1.

**Dependencies**
- **DEP1 – Record vendored lib version/hash & update procedure** in `assets/vendor/README.md` · Low · S · P2.

**Testing**
- **T1 – Convert key source-text tests to behaviour tests** (`node:vm`/jsdom-less stubs) · Medium · L · P2 · P-001 analysis.
- **T2 – Run the Playwright e2e in CI** · Medium · M · P2 · F-002.

**Documentation**
- **DOC1 – Remove hard-coded test counts; add CONTRIBUTING/CHANGELOG** · Low · S · P2.

**Workflow**
- **W1 – CI pipeline** (F-002) · Low · S · **P1**.
- **W2 – Add logging helper** (F-004) · Low · S · **P1**.

| Priority | Recommendations |
|---|---|
| P0 | S1 (SRI part) |
| P1 | W1, W2, A1, S2, D2, U1 |
| P2 | C1, PF1, U2, D1, DEP1, T1, T2, DOC1 |
| P3 | C2, PF2 |

---

## 5. Competitive Analysis & Feature Gap Assessment

**Why these three (accessed 2026-11-18).**
- **TradingView** — the product being emulated; pricing page <https://www.tradingview.com/pricing/> **[V]**.
- **Binance Futures web chart** (TradingView-powered chart embedded in the exchange the app uses for data) — <https://www.binance.com/en/support/faq/8419126024404348a1c6e4039fbed3fe> **[V]**.
- **GoCharting** — standalone browser charting platform in the same niche. Its pricing page was **not fetchable** (blocked by the session allowlist), so all its cells are **[A]**.

| Feature | Current project | TradingView | Binance Futures chart | GoCharting | Gap |
|---|---|---|---|---|---|
| Price | Free, self-hosted (code) | Basic $0; Essential $12.95/mo annual … Ultimate $199.95/mo **[V]** | Free with account **[A]** | **[A]** free + paid tiers | Advantage: no paywall |
| Indicators per chart | Unlimited by design (7 types) (README §1) | Basic 2; Essential 5; Plus 10; Premium 25; Ultimate 50 **[V]** | MA, Bollinger etc. via menu **[V]** | **[A]** large library | Few indicator types (7); no custom scripts |
| Charts per tab / multi-chart | Up to 4 (README, ARCH) | Basic 1; Essential 2; Plus 4; Premium 8; Ultimate 16 **[V]** | Not mentioned in FAQ **[V]** | **[A]** multi-chart | Parity with Plus tier |
| Saved layouts | Local per browser | Basic 1; Essential 5; Plus 10 **[V]** | Classic/Advanced/Full-screen layouts **[V]** | **[A]** | No cloud sync/export |
| Drawing tools | Lines, Fib, shapes, annotations, positions, measure, volume profile | Extensive **[A]** | Trend line, long/short position **[V]** | **[A]** | Fewer tools; no templates (unverified in code) |
| Chart types | 12 (README §1) | Many **[A]** | Candlestick and depth **[V]** | **[A]** | Advantage vs Binance |
| Bar replay | Yes (`ui/replay.js`) | Included in paid plans **[V]** (Basic unclear) | Not mentioned **[V]** | **[A]** | Advantage vs Binance |
| Alerts | **None found** | 3 price alerts on Basic; up to 1,000 **[V]** | Not mentioned in FAQ **[V]** | **[A]** | **Major gap** |
| Trading from chart | None | Via brokers **[A]** | Long/Short position tools; order placement not mentioned **[V]** | **[A]** | Out of scope (read-only app) |
| Time-zone setting | Fixed Asia/Tehran | **[A]** yes | Yes **[V]** | **[A]** | Gap (F-007) |
| Watchlist flags/sections/drag-drop | Yes | Yes **[A]** | Basic **[A]** | **[A]** | Parity/advantage for crypto |
| Mobile layout | Bottom tabs, safe-area (README §1) | Native apps **[A]** | Native app **[A]** | **[A]** | OK for web |
| Accounts/cloud sync | None | Yes **[V]** (layouts per plan) | Yes **[A]** | **[A]** | Gap |
| Data scope | Binance USDT-M futures only | Multi-asset **[A]** | Binance only **[A]** | Multi-exchange **[A]** | Narrow scope |

- **Missing features:** alerts, more indicators (Bollinger, MACD, ATR are not in the module list), cloud/export of layouts, time-zone setting, symbol-level notes.
- **Poorly implemented (code-based):** keyboard/reduced-motion accessibility (F-005).
- **Differentiation opportunities:** free unlimited indicators + 4-chart layout, no sign-up, crypto-specific watchlist (market-cap sort, flags), instant load via early fetch.
- **Potential advantages:** zero cost, privacy (no server, data stays in browser), speed.
- **Unnecessary for this audience:** order entry/brokerage integration; scripting language (Pine-like) until core gaps close.

---

## 6. UI/UX & Visual Design Evaluation

*Code-based only — the UI was not rendered or observed.*

**Visual design findings.** Design tokens exist (`src/styles/tokens.css`) and CSS is split by area; dark TradingView-like palette (`theme-color #131722`, `index.html`). Eleven partial stylesheets with order-dependent cascade (README §4.4) risk inconsistency over time.

**UX findings.** Strong: instant first paint via prefetch, loading/error messages with retry countdown (`history.js`), mobile bottom nav, resettable chart (`#jumpNow` "Reset Chart · Go to latest" button), ARIA on top bar. Weak: pane iframes strip media queries by script (`index.html` head, `PN` block) — fragile; no visible stale-data indicator when WebSocket is down (potential); watchlist keyboard path unclear.

| Problem | Proposed change | Expected improvement | Tied to |
|---|---|---|---|
| No reduced-motion support | `@media (prefers-reduced-motion: reduce)` disabling transitions/animations | Comfort for motion-sensitive users | Accessibility |
| Watchlist rows not focusable (`sections.js:159`) | Listbox pattern with arrow keys, Enter to select | Keyboard parity | Accessibility |
| Fixed Tehran zone | Time-zone picker in Settings → Canvas | Correct times for all users | Usability |
| WS-down state invisible | Small "Delayed/Offline" badge in header (data already tracked in `watchdog.js`) | Trust in prices | Business goal (trust) |
| Media-rule stripping hack for panes | Use a `.pane` class to scope layout rules in CSS | Fewer surprises, simpler CSS | Consistency |

---

## 7. Product Improvement Opportunities

Opportunity areas: **trust** (stale-data badge), **retention** (alerts, saved layouts), **discoverability** (keyboard-shortcut help — shortcuts documented in `docs/KEYBOARD_SHORTCUTS.md` but no in-app panel was found; not verified), **personalization** (time zone, themes), **conversion/differentiation** (shareable layout link).

| Feature | What it does | User problem | Why needed | Expected value | Complexity | Priority |
|---|---|---|---|---|---|---|
| **Price alerts (browser notifications)** | Alert when price crosses a level; uses the existing WS price stream | Users cannot leave the tab and be notified | Biggest verified competitor gap | High | Medium | Essential |
| **Time-zone setting** | Choose display zone | Wrong times | Basic correctness | Medium | Low | Essential |
| **Stale/offline indicator** | Badge when data older than N s | Traders may act on old prices | Trust | High | Low | Essential |
| **Export/import settings & drawings (JSON)** | Backup/move between browsers | Local-only storage is fragile | Retention | Medium | Low | Essential |
| More indicators (Bollinger, MACD, ATR) | Using existing module contract (`indicators/core/kit.js`) | Common indicators missing | Parity | Medium | Medium | Optional |
| Shareable layout link | Encode symbol/TF/indicators in URL hash | Sharing setups | Growth | Medium | Medium | Optional |
| Cloud sync | Accounts | Cross-device | Requires backend — **out of scope** | — | XL | Optional/Postpone |

---

## 8. Next Release Proposal

**Goals:** make the existing app safer to ship and change; close the cheapest verified gaps. No rewrite.

- **Must-have:** CI gate (W1/F-002); SRI+CSP (S1/F-001); symbol validation + escaping (S2/F-003); logging helper (W2/F-004); manifest-completeness test (A1); README/test-count fix (F-006).
- **Recommended features:** time-zone setting (F-007); stale-data badge; settings/drawings export-import.
- **Optional:** price alerts (own release if time-boxed); ESLint.
- **Technical:** D2 payload validation; vendor README rewrite.
- **UI/UX:** reduced-motion block; listbox keyboard nav for watchlist.
- **Expected outcomes:** stability (CI), security (CSP/SRI/escaping), maintainability (lint/logging), UX (accessibility, time zone), product value (trust badge, backup).
- **Explicitly out of scope:** ES-module migration, framework adoption, backend/cloud sync, order entry, minification, splitting large modules, Lightweight Charts major upgrade.

---

## 9. Implementation Roadmap

| Phase | Tasks (IDs) | Priority | Effort | Dependencies | Deliverables / completion criteria |
|---|---|---|---|---|---|
| **1 Critical fixes** | S1 (SRI/CSP), S2 (symbol validation/escape), W1 (CI) | P0–P1 | M total | none (all parallel) | CI green on build-diff+tests; CSP loads app in a real browser; symbols with `<">` rejected (new test) |
| **2 Structural & technical** | W2 logging, A1 manifest test, D2 payload validation, C1 ESLint, DOC1 | P1–P2 | M–L | W1 for enforcement | Lint clean; no silent catches without comment; docs accurate |
| **3 UI/UX** | U1 a11y, U2 time zone, stale badge | P1–P2 | M | Phase 2 logging helps debug | Keyboard-only selection works; reduced-motion verified in a browser; time zone persists |
| **4 Feature development** | Settings export/import, alerts, extra indicators | P2 | L | Phase 1–2; D1 schema versioning before export | Round-trip export/import test; alert fires in e2e with mocked WS |
| **5 Optimization & QA** | PF1 profiling, PF2 minify, T1/T2, C2 | P2–P3 | L | W1; profiling before any optimisation | Baseline traces recorded; behaviour tests replace source-text tests where valuable |

**Dependency map.** Parallel: S1 ‖ S2 ‖ W1 ‖ DOC1. Blocked: C1 (after A1 so globals are enumerated), T2 (after W1), export/import (after D1), PF2 (after PF1), alerts (after W2 + stale-data logic).

---

## 10. Final Executive Summary

1. **Overall condition:** 68.6/100, Maturity 3 (Developing): a well-documented, working, dependency-free app with sound data-layer resilience; lacks automation and observability.
2. **Strengths:** reproducible build (verified byte-identical), 94 passing tests, thoughtful WS/rate-limit handling, honest docs.
3. **Critical weaknesses:** none Critical/High confirmed. Top Medium: unprotected CDN fallback/no CSP, no CI, silent error swallowing, accessibility gaps.
4. **Biggest technical risks:** stale `dist/` shipping; Binance API changes without contract tests; unmeasured multi-chart cost.
5. **Most valuable opportunities:** price alerts, time-zone setting, stale-data indicator, backup/export.
6. **Competitive disadvantages:** no alerts, fewer indicators/drawing tools, no cloud sync, single exchange.
7. **Recommended design direction:** keep the TradingView-familiar dark UI; invest in accessibility and trust signals rather than visual redesign.
8. **Top five immediate actions:** (1) CI gate with dist-diff; (2) SRI + CSP; (3) validate/escape symbol strings; (4) logging helper replacing silent catches; (5) reduced-motion + watchlist keyboard access.
9. **Next release:** the "must-have" set in §8 plus time zone and stale-data badge; nothing larger.

**What would I improve first, what would I postpone, and why?** First: the CI gate and the small security hardening (SRI/CSP, symbol escaping) — they are cheap (days), protect every later change, and address the only way users could receive wrong or malicious code. Postpone: ES-module migration, module splitting, minification, cloud sync and alerts-as-a-big-feature — they are costly or unmeasured, and the current architecture works; do profiling and add tests before touching them.

---

## Appendix A — Evidence ledger
| ID · file:line | Observation | Status |
|---|---|---|
| E-01 · `index.html` loader (~l.96) | CDN fallback URLs with no `integrity` | confirmed |
| E-02 · `index.html` (whole) | No CSP meta; grep `Content-Security` = 0 | confirmed |
| E-03 · `sections.js:159` | `data-s="${s.s}"` and `coinName(s.b)` unescaped in `innerHTML` | confirmed |
| E-04 · `sections.js:23,100` | `esc()` exists and used for section names | confirmed |
| E-05 · `ticker-data.js:8-30` | Symbol filter only `_`, `USDT` suffix, hidden set, control chars | confirmed |
| E-06 · `src/` (grep) | 0 `console.*`; 17 `catch (_) { }` incl. `multichart.js:66,71,148`, `pane-mode.js:12,59` | confirmed |
| E-07 · `src/styles` (grep) | 0 `prefers-reduced-motion`; `:focus-visible` in 5 files | confirmed |
| E-08 · `sections.js:100` vs `:159` | Only section toggle has `tabindex`; rows do not | confirmed (keyboard impact potential) |
| E-09 · `time-format.js:3` | `TZ = 'Asia/Tehran'` | confirmed |
| E-10 · README §3/§6/§8 vs `npm test` | "64 tests" vs 94 run | confirmed |
| E-11 · `assets/vendor/README.md` | Stale "Put this file here" text | confirmed |
| E-12 · archive root | No `.git`, CI, lint, LICENSE, `.gitignore` | confirmed (archive only) |
| E-13 · `dist/*` vs rebuild | Byte-identical (`cmp`) | confirmed |
| E-14 · `tests/helpers/sources.mjs`, 8 test files | Source-text based assertions | confirmed; adequacy potential |
| E-15 · `docs/ARCHITECTURE.md` Multi-chart | 3 extra full app iframes | confirmed (doc); cost potential |
| E-16 · `docs/PERFORMANCE.md` | "No before/after browser benchmark" | confirmed |
| E-17 · `market-caps.js:12` | CoinGecko fetch inside try/catch | confirmed; UX effect potential |

## Appendix B — Not inspected / not verifiable
- UI never rendered or interacted with; no visual, contrast, or touch-gesture verification.
- Git history, branch, contributors, CI on the remote — no `.git` in archive.
- `tests/e2e/multichart.e2e.py` not executed (needs browser + Playwright; skipped to stay read-only/low-risk).
- Live Binance/CoinGecko behaviour and rate limits not exercised (no outbound calls made from the project).
- Indicator numerical correctness beyond the passing unit tests; drawing hit-testing; replay logic were not reviewed line-by-line. Most files outside the grep-driven areas (e.g. `replay.js`, `controller.js`, `engine.js` internals) were **not read in full**.
- Dependency vulnerability scan (no npm deps; vendored library not scanned); library currency not checked.
- Competitor data: GoCharting fully **assumed**; TradingView non-pricing cells and Binance non-FAQ cells **assumed**.
- Licence/attribution compliance (P-004).

## Appendix C — Methodology & commands run
Read-only inspection of the extracted ZIP (extracted to a scratch directory). Commands: `unzip`, `find`, `wc`, `cat`, `grep`/ripgrep patterns (`innerHTML`, `console.`, `catch`, `prefers-reduced-motion`, `focus-visible`, `integrity=`, secrets regex), `cmp`. In a **separate copy** of the project: `npm test` → **94 tests, 94 pass, 0 fail**; `npm run check:syntax` → completed without error output; `node scripts/build.mjs` → regenerated `dist/` identical to the shipped files. Web: WebSearch and WebFetch of TradingView pricing and Binance support FAQ (GoCharting fetch blocked). No project file other than this report was created in the project directory; no lint/coverage tools were run (none configured).

## Appendix D — Glossary
**Severity** — Critical: exploitable hole / data loss / production-breaking. High: likely user-visible failure or serious weakness. Medium: reliability/quality issue with workarounds. Low: minor.
**Priority** — P0 immediately · P1 essential next release · P2 improves quality · P3 optional.
**Effort** — S <1 day · M 1–3 days · L 1–2 weeks · XL >2 weeks. **Complexity** — Low/Medium/High.
**Evidence status** — Confirmed (observed) · Potential (needs investigation) · Recommendation (reasoned opinion).
**[V]/[A]** — competitor cell Verified with source / Assumed.
