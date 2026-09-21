# Deep Altitude

One Astro site, one shared visual system. The homepage, indexes, articles, About and 404 use `src/layouts/Site.astro` and `src/styles/global.css`. No postbuild page replacement, UI framework, search application or translation service is needed.

## Publishing with Pages CMS

Open https://app.pagescms.org/ and sign in with GitHub. Select **DeepAltitude / Deep-Altitude-Blog**, branch **main**, then **Articles → Add an entry (the + button on a phone)**. Enter a title, domain and date, write in the large Article editor and press **Save** (the disk icon on a narrow phone screen). These are the only required fields. Language, description, image, principles and tags are optional. Saving commits to GitHub; the connected Cloudflare build publishes the site automatically.

The same form works in an iPhone browser and on a laptop. Use the cover-image picker or the Article editor's image tool to upload an image from Photos/Files. Images go to `public/images/` and are served at `/images/`. Use JPEG, PNG, WebP, GIF or AVIF; export HEIC photos as JPEG first. Pages CMS generates safe media filenames. The article filename is generated automatically from the creation date and title and hidden from the form.

New notes are created directly in `src/content/`. Every article has a canonical `/blog/{slug}/` address, independent of its domain. Existing articles stay in their current folders; their previous category-based URLs and `/notes/` aliases continue to work. Existing translation and raw-download URLs are unchanged. When editing an older article, select its domain if the new field is blank. Until then the site uses its existing category or collection; unclassified posts remain visible in All Notes. The CMS uses the existing dotted date format, while displaying a normal date picker. About has separate Lithuanian and English editors.

## Domains and principles

The five domains are Sportas, Kalbos, Protas, Darbas and Gyvenimas. Each article has at most one domain. The archive at `/blog/` includes every published note; its small text filter links to the five domain indexes. Posts without domain metadata are not guessed into a domain.

Principles are separate reusable entries in `src/principles/`. To create one, open **Principles → Add an entry**, enter the principle as its title, optionally add a description or explanation, and **Save**. Then open an article and select one or several entries in **Principles (optional)**. The reference picker searches by title. The same principle can be selected in many articles and domains. A basic note needs no principles or tags.

Pages CMS stores principle file paths as references. Filenames are generated automatically and renaming is disabled, so editing a principle's title keeps its URL and article relationships intact. Slug-only references are also accepted for manually maintained files. Removing a principle removes its rendered links; unused references never create broken public links. Remove its references from articles before deliberately deleting an entry.

`/principai/` lists the author's principles and their connected domains. Each `/principai/{slug}/` page groups its articles by domain. Article endings show “Iš šio užrašo” only when at least one principle is linked. Principles are shown as authored and are not automatically translated or invented. Initially the collection is empty. Tags are optional plain text entries displayed as quiet metadata; they do not create another navigation system.

The CMS `settings.content.merge: true` preserves unlisted metadata, including future translation relationships. The visual Markdown editor may normalize Markdown formatting when **you** save a post; use its Source switch for precise Markdown editing. Saving on main publishes directly; there is no separate draft/approval workflow.

## Content and existing editions

`src/utils/posts.ts` reads the existing four article collections and new root-level notes. Domain and language metadata have backward-compatible defaults. New notes without a language default to Lithuanian. Optional fields include principles, tags, description, updatedDate, heroImage, heroImageAlt, heroCaption, originalLanguage and translationKey. Date parsing accepts old dotted dates, trailing whitespace and ISO dates. `src/utils/domains.ts` defines the five domains; `src/utils/principles.ts` resolves the reusable relationships. Shared indexes and the article template remain Astro components.

`notebook/translations/` contains the existing eight sets of translations. They are preserved as supplied and rendered through the shared article template. Existing multilingual URLs and original-language downloads remain available. New articles need no translations: they appear in the Original-Raw index and, when applicable, the edition matching their language. Changing an original flags its existing translations as potentially older. There is no automatic translation or translation editor in Pages CMS.

The historical `original-manifest.json` is a preservation baseline, not a build lock. Original downloads are generated byte for byte from the current content. `notebook/verify.mjs` verifies those downloads and all local page, asset and fragment links. Existing source files are not moved or rewritten by the site build. The old standalone first-post page keeps its content and uses the shared reading layout.

## Development and deployment

- `npm ci`
- `npm run build` — generates all pages with Astro, refreshing its content cache so deleted notes are removed reliably.
- `npm run check` — build, exact source downloads, internal links, TypeScript and Cloudflare deployment dry run.
- `npm run dev` — Astro development server.
- `npm run deploy` — existing Cloudflare Worker, when credentials are available.

Production uses the existing GitHub-to-Cloudflare connection. `wrangler.json` and the Worker name are unchanged. `public/og.svg` is the editable source of the matching PNG social preview. Vendored Marked in `notebook/vendor/` renders the existing translation files and retains its license.
