# Deep Altitude notebook

Nine static editions: Original-Raw, English, Spanish, Portuguese (Portugal), German, French, Italian, Russian and Danish. The existing Astro site and legacy article routes remain in place. `npm run build` builds Astro first, then adds the multilingual notebook and replaces the generated homepage.

## Content

The 11 author posts in `src/content` are unchanged. `original-manifest.json` records their SHA-256 hashes and the source commit. The build verifies them and copies each file byte for byte to `/original/files/{id}.md`. Every Original-Raw article also includes the complete source in an expandable panel. The previous Lithuanian homepage remains at `/original/purpose/`.

`translations/{language}.txt` contains all 11 complete translations, including unfinished notes and quoted passages. These are explicitly labelled AI-assisted translations. Original English passages remain as written in the English edition. Spelling and unfinished fragments remain untouched in the Original-Raw edition. Translations do not constitute editorial verification of claims or quote attributions.

When deliberately editing an original post, review and update all affected translations, then update its hash in the manifest. The build fails on unreviewed source changes, missing translations, duplicate IDs and unexpectedly short translations. New posts require an ID in `build.mjs`, a manifest entry and entries in all eight translation files.

## Navigation

Every language has a homepage, four category pages and eleven articles. Language links on articles keep the same article. Search covers the full text; category and original-language filters combine. Filter state is encoded in the URL and survives reloads, back/forward navigation and edition changes. Content and category navigation work without JavaScript.

The original-language filter includes a mixed-language post in both LT and EN results. The LT+EN option selects the mixed-language posts only. Site edition and source language are separate choices.

## Build and deployment

- `npm ci`
- `npm run build`
- `npm run check` (build, TypeScript and Cloudflare deployment dry run)
- `npm run deploy` (existing Cloudflare Worker)

Production uses the existing GitHub repository and Cloudflare Worker configuration. Generated notebook pages are static assets served by Cloudflare's default assets-first routing. No database, translation service, tracking or browser translation API is required. Vendored Marked 17.0.5 is in `vendor/` with its license.
