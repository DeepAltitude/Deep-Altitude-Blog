# Validation — 17 September 2026

Source: `DeepAltitude/Deep-Altitude-Blog`, commit `f6c908af042eae267d6286783ce94c334ac288d3`.

- All existing source posts remain unchanged. All 11 downloadable originals match their SHA-256 manifest hashes.
- Nine editions, 99 article pages: 11 original posts and 88 complete AI-assisted translations.
- Astro build, TypeScript check and Wrangler deployment dry run pass.
- 5,689 internal link/asset references across 165 generated HTML pages resolve locally, including fragment targets and legacy routes.
- Browser checks pass for search, combined category/language filters, empty state, reset, URL persistence, reload and browser back.
- Switching editions preserves the article or active filters. The language menu works by keyboard and closes on Escape.
- 72 responsive page checks across all nine editions at widths of 320, 390, 768 and 1,440 pixels found no horizontal overflow. Desktop, mobile menu and original article screenshots were visually reviewed.
- Category and article navigation work with JavaScript disabled.
- Original raw panels were compared verbatim against source files for the two longest posts. No JavaScript errors or missing assets occurred in the browser checks.
- SUSV's linked championship page loads. AIDA's profile endpoint denies automated requests (HTTP 403); its original URL is preserved unchanged.

The browser checks used intercepted local static assets because this execution environment cannot start Wrangler's network-interface enumeration. They do not establish that the production Cloudflare deployment is healthy; production status must be checked separately after release.
