# Self-hosted libraries

Put this file here so the site no longer depends on a CDN:

    lightweight-charts.standalone.production.js   (version 4.2.0)

Download it (once) from:
https://cdn.jsdelivr.net/npm/lightweight-charts@4.2.0/dist/lightweight-charts.standalone.production.js

or with npm:  `npm pack lightweight-charts@4.2.0`  -> take `dist/lightweight-charts.standalone.production.js` from the tarball.

index.html tries this local file first, then falls back to jsDelivr, cdnjs and unpkg.
