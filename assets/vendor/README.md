# Self-hosted libraries

`lightweight-charts.standalone.production.js` is TradingView Lightweight Charts **4.2.0** (Apache-2.0; keep its license header).

## Updating it

1. Replace the file (e.g. `npm pack lightweight-charts@<version>` and take `dist/lightweight-charts.standalone.production.js` from the tarball).
2. Update the version in the three CDN fallback URLs in `index.html`.
3. Regenerate the integrity hash and put it in `LIB_INTEGRITY` (`index.html`):

       openssl dgst -sha384 -binary assets/vendor/lightweight-charts.standalone.production.js | openssl base64 -A

4. `npm test` (`tests/hardening.test.mjs` checks that the hash matches the file) and check the chart in a browser.

`index.html` tries this local file first, then jsDelivr, cdnjs and unpkg. A CDN copy whose bytes differ from the local file is rejected by Subresource Integrity.
