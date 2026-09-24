# Validation

## Domains and principles — 21 September 2026

Content baseline: `caab56b`, including the author's latest Freediving edit made during implementation.

- All 23 existing content/page and translation files match the baseline byte for byte. No existing article metadata or wording was edited. No principle or tag was invented for an existing article.
- The clean release build passes Astro, TypeScript and the Wrangler deployment dry run: 210 HTML pages, 9,300 internal links, 12 compatibility redirects and 13 exact original-file downloads.
- All 178 previous HTML routes remain represented by a page or a redirect with an existing destination. Original articles now also have canonical `/blog/` URLs. Capitalized domain index routes redirect to their lowercase counterparts without duplicate Astro routes.
- RSS keeps all 12 existing item identifiers while linking to the canonical article URLs.
- Temporary content exercised five domains, an unclassified article, one article with several principles, one principle shared across three domains, an unused principle, optional tags, a minimal four-field article and explicit domain metadata overriding an old category. A principle title was changed without changing its URL or relationships.
- 76 fixture page/viewport checks passed at 320, 390, 768 and 1440 pixels. Another 21 checks passed on the clean release. Checks covered filters, keyboard/Escape navigation, menu bounds, article-to-principle-to-article navigation, chronological order and absent optional sections. No horizontal document overflow, missing assets or JavaScript errors were found. Mobile and desktop screenshots were reviewed.
- All eight fixture files were removed. No fixture pages or downloads remain in the release output. The author's principle collection starts empty.
- The Pages CMS configuration and select/reference fields pass the official Pages CMS schemas. Only title, domain, date and body are required. The reference picker stores stable paths and displays titles; both article and principle filenames are automatic. The CMS interface itself was not automated through an authenticated browser session.
- Wrangler's local server could not start because this execution environment cannot enumerate network interfaces. The deployment dry run passes; HTTP redirect behavior is checked against production after deployment.

## Notebook layout — 18 September 2026

Content baseline: `DeepAltitude/Deep-Altitude-Blog`, commit `1790ba0` (including the latest Pages CMS edit to Kalbų mokymasis).

- All 11 original essay bodies are preserved exactly as in that GitHub version. All eight existing translation files are unchanged byte for byte. The starter Markdown example remains available at its existing URL, outside the notebook indexes.
- Only two existing content metadata lines change: the language-learning publication date is represented in the CMS-compatible dotted format without changing its date, and the standalone first-post page gains a shared layout. Neither changes article wording.
- The shared Astro renderer generates homepages, chronological indexes, categories and article pages for the original and existing eight language editions. Legacy URLs, raw downloads and RSS remain available.
- Astro build, TypeScript and Wrangler deployment dry run pass. The link verifier checks pages, local assets, fragment targets and byte-exact downloads of current source files, without preventing future CMS edits.
- Pages CMS configuration passes the official `pages-cms/pages-cms` configuration schema. Its date field reader successfully reads every existing article date, including trailing whitespace. Date defaults and read/write behavior were checked with the CMS date implementation.
- A temporary CMS-format note verified automatic discovery, category/language metadata, optional fields, image paths, homepage ordering, the category index, English edition, article routes and RSS. It required no translation entries. The fixture and its uploaded image were removed before release. That deletion exposed Astro’s empty-collection cache behavior; `astro build --force` now refreshes the cache on every production build.
- 168 Chromium page/viewport checks passed at widths of 320, 390, 768 and 1440 pixels, including all nine editions, the original article pages, About, 404 and an image/code fixture. No document-level horizontal overflow, JavaScript errors or missing assets were found.
- Production testing found that the legacy redirects needed explicit trailing-slash variants. `public/_redirects` now supplies those variants; verification checks paired routes and valid destinations.
- Browser interactions checked category navigation, article return links, edition switching, menu keyboard/Escape behavior and the full raw-source text. Desktop home/index/reader and mobile home/index/reader/About screenshots were visually reviewed.
- Browser checks served the built static assets locally through Playwright interception. Configuration and publishing format were validated; no authenticated Pages CMS editor session was automated.

The historical manifest remains a baseline, not a restriction on author edits. Future article additions and edits do not require a manifest update or translated copies. Saving on main triggers the existing GitHub-to-Cloudflare deployment.
# Original-only on-site editor — 23 September 2026

- Implemented an author editor within the existing visual system, with original-only article links, title/description/body editing, formatting controls, safe preview, tab-local drafts, explicit Save & publish and publication verification.
- Server tests use a mocked GitHub API: all 12 original articles pass byte-exact no-op checks; OAuth state/PKCE, encrypted cookies, pinned owner/repository, same-origin/CSRF checks, rejected translation/arbitrary paths, concurrent changes, deliberate saves and logout pass. No real article writes were made.
- Browser checks use the built site and real editor handler against a mocked GitHub API, with normal browser security enabled. Widths 320, 390, 768 and 1440 pass without horizontal overflow. Draft recovery, unsafe preview HTML, conflicts, save/publication feedback, expired sessions, logout and absence of translation editing links pass.
- Astro build, TypeScript, 9,351 internal links across 211 HTML pages, 13 exact original downloads, 12 legacy redirects and Cloudflare deployment dry run pass. The editor is noindex and excluded from the sitemap. All 23 existing content/translation file hashes match the preceding release baseline.
- Author authentication is not yet configured: a repository-scoped GitHub App and two runtime Cloudflare secrets are needed as documented in `EDITOR.md`. Authenticated production login/save and deployment verification remain pending that setup. The editor fails closed without it.
