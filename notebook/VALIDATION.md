# Validation — 18 September 2026

Content baseline: `DeepAltitude/Deep-Altitude-Blog`, commit `1790ba0` (including the latest Pages CMS edit to Kalbų mokymasis).

- All 11 original essay bodies are preserved exactly as in that GitHub version. All eight existing translation files are unchanged byte for byte. The starter Markdown example remains available at its existing URL, outside the notebook indexes.
- Only two existing content metadata lines change: the language-learning publication date is represented in the CMS-compatible dotted format without changing its date, and the standalone first-post page gains a shared layout. Neither changes article wording.
- The shared Astro renderer generates homepages, chronological indexes, categories and article pages for the original and existing eight language editions. Legacy URLs, raw downloads and RSS remain available.
- Astro build, TypeScript and Wrangler deployment dry run pass. The link verifier checks pages, local assets, fragment targets and byte-exact downloads of current source files, without preventing future CMS edits.
- Pages CMS configuration passes the official `pages-cms/pages-cms` configuration schema. Its date field reader successfully reads every existing article date, including trailing whitespace. Date defaults and read/write behavior were checked with the CMS date implementation.
- A temporary CMS-format note verified automatic discovery, category/language metadata, optional fields, image paths, homepage ordering, the category index, English edition, article routes and RSS. It required no translation entries. The fixture and its uploaded image were removed before release. That deletion exposed Astro’s empty-collection cache behavior; `astro build --force` now refreshes the cache on every production build.
- 168 Chromium page/viewport checks passed at widths of 320, 390, 768 and 1440 pixels, including all nine editions, the original article pages, About, 404 and an image/code fixture. No document-level horizontal overflow, JavaScript errors or missing assets were found.
- Browser interactions checked category navigation, article return links, edition switching, menu keyboard/Escape behavior and the full raw-source text. Desktop home/index/reader and mobile home/index/reader/About screenshots were visually reviewed.
- Browser checks served the built static assets locally through Playwright interception. Configuration and publishing format were validated; no authenticated Pages CMS editor session was automated.

The historical manifest remains a baseline, not a restriction on author edits. Future article additions and edits do not require a manifest update or translated copies. Saving on main triggers the existing GitHub-to-Cloudflare deployment.
