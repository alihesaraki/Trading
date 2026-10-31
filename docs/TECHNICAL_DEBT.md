# Technical debt and constraints

- **Classic-script coupling:** application fragments share global scope and depend on deterministic execution order. Moving to ES modules requires an explicit migration plan and browser regression coverage.
- **Generated artifacts:** browser-facing JavaScript and CSS are checked-in generated files. Source and generated output must be kept synchronized.
- **Chart library hosting:** Lightweight Charts 4.2.0 is self-hosted in `assets/vendor/`; CDNs are only a fallback. Update it by replacing that file (keep its license header).
- **No minification:** `dist/*` is plain concatenation. A minifier (e.g. esbuild) would cut transfer size further but needs a dev dependency.
- **Browser-level verification:** syntax/build and unit tests do not prove live chart rendering or every drawing/indicator interaction. Those still require browser testing against realistic data.
- **Performance baselines:** this delivery did not include browser profiling, so runtime bottlenecks and any quantitative gains remain unmeasured.
- **CSS cascade:** the source stylesheet's rule order is preserved by the build and may affect appearance. Large-scale CSS restructuring should be validated visually.
