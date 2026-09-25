# DeepAltitude

**Rašymas išgrynina mintis.**

A public notebook and a private daily reference. Astro renders the interface; the existing Cloudflare Worker serves it. The public GitHub repository holds durable writing. Private operational state belongs in D1. Google Calendar owns ordinary scheduled events.

## How it works

| Information | Source of truth | Interface |
| --- | --- | --- |
| Homepage / About | `src/content/pages/{home,about}.md` | Contextual Edit link or `/editor/` |
| Original notes | `src/content/articles/*.md` | `/uzrasai/`, `/blog/<slug>/`, editor |
| Principles | `src/content/principles/*.md` | `/principai/`, editor |
| Projects, experiments, observations, sprints | D1 | Public pages when explicitly public; editor / Dabar |
| Private writing drafts | D1 `content_drafts` | Editor → Save private draft |
| Habits, completions, weekly focus | D1 | `/dabar/` |
| Calendar events | Google Calendar API | Dabar calendar |
| Google connection / preferences | D1; tokens encrypted with AES-GCM | Editor → Settings |
| Credentials / encryption key | Cloudflare Secrets | One-time infrastructure setup |
| Month count | Browser local storage | 1 / 3 / 6 / 12 readable months |

There is one taxonomy source: `src/utils/domains.ts`. Domain and Topic are optional for new writing. Existing articles retain their wording, titles, original dates, descriptions, images and existing metadata. Migration adds stable IDs, preserved slugs and feed GUIDs. No translations or invented principles are generated.

Forward references are canonical. Notes reference Project / Experiment / Sprint IDs and Principle slugs; Experiments reference a Project and Principles; Sprints reference a Project. Reverse lists are derived. Public reverse lists query only public records. Sprints and habits never appear publicly. The Homepage shows public featured Projects and public featured active Experiments.

## Writing from a phone or laptop

1. Open `https://deepaltitude.com/editor/` and sign in with the authorized GitHub account.
2. Choose **+ Note**, or open an existing note and follow **Edit article**.
3. Enter a title, date and your text. Domain, Topic, connections, principles, tags and an image are optional. Write in the original language.
4. On a phone, switch between **Edit** and **Preview**. On a laptop, both are visible side by side.
5. **Save private draft** keeps the draft in D1. **Save & publish** writes the original Markdown to GitHub and starts the existing deployment.
6. **Saved to GitHub** means the commit exists. **Live** appears only after the deployed publication fingerprint matches the saved file. A deployment timeout does not discard the saved writing.

Homepage and About use the same contextual editing flow. The Homepage introduction is its Description field. New principles can be added directly while writing; existing principles are reusable. Draft images are stored in private D1 chunks within row-size limits; they enter `public/images/editor-<uuid>.<ext>` only on publication.

Unsaved writing is recovered from this tab's session storage, with **Download draft** as a fallback. Save conflicts never silently overwrite another version. Download your text before explicitly loading the latest saved version.

## Projects, experiments, sprints and habits

Use the editor's simple collection links. A Project needs a title and your intended outcome; an Experiment Idea needs only a title. Ideas start private and undated. **Pradėti eksperimentą** changes the same record to active and sets its start date. There is no simultaneous-experiment limit. Add dated observations to an existing Experiment; complete it and record your own conclusion when useful.

Sprints are private. Habits support daily, weekdays, selected weekdays (Mon 0–Sun 6), or a weekly frequency, plus an optional quantity. Checking a habit updates D1 immediately; it makes no Git commit or deployment. Weekly focus is a small editable list, not a task manager.

Operational dates use native date pickers with optional time fields. Times use the configured timezone, initially `Europe/Zurich`. Invalid daylight-saving local times are rejected. Google event times also use this configured timezone. All-day Google event ends are exclusive: the end is the first day after the event.

## Dabar and Calendar

`/dabar/` is guarded on the server. It brings together the calendar, weekly focus, active projects / experiments / sprints, and habits. Calendar offers Monday-first month grids. The 3 / 6 / 12 views stack full-size months vertically. Dense mobile days open an agenda.

Calendar is a projection: Google owns appointments; D1 owns pursuit dates. Sources can be hidden without changing data. Google recurrence is expanded by the API within the requested range. Event edits/deletes affect the selected occurrence, not the whole recurring series. A short private in-memory event cache reduces repeat requests. Google failure leaves DeepAltitude dates visible.

## Authentication and privacy

The existing private GitHub App **DeepAltitude Original Editor** authenticates only GitHub user ID `311059981`, checks repository ID `1317330542` and write permission, and writes only approved content/image paths on `DeepAltitude/Deep-Altitude-Blog`, branch `main`.

The sign-in uses OAuth state + PKCE. Session cookies are AES-GCM encrypted, `Secure`, `HttpOnly`, `SameSite=Lax`, and expire within eight hours. Mutations require the same Origin and session CSRF token. Private routes and APIs use `private, no-store`, `noindex` and restrictive browser security headers. Neither GitHub credentials nor Google tokens enter client JavaScript.

Google Calendar consent is separate from author sign-in. Disconnecting Calendar does not revoke editor access. Google refresh tokens are dynamic D1 data encrypted with a dedicated stable key; they are not deployment variables. Never rotate the token encryption key without first disconnecting/reconnecting Google or migrating the encrypted values.

## One-time Cloudflare setup — still required

The source is prepared for the following binding and secrets. They are **not provisioned by this repository**. The production editor currently reports that author sign-in is not connected. Do not infer successful infrastructure setup from a green build.

1. Create a D1 database named `deepaltitude-private` in the existing Cloudflare account, then add this entry to `wrangler.json`, using the actual returned database ID:

   ```json
   "d1_databases": [{
     "binding": "DB",
     "database_name": "deepaltitude-private",
     "database_id": "THE_ACTUAL_DATABASE_ID",
     "migrations_dir": "migrations"
   }]
   ```

2. Apply the migration before enabling authoring: `npx wrangler d1 migrations apply deepaltitude-private --remote`.
3. In Worker `astro-blog-starter-template`, configure Secrets:

   | Name | Value |
   | --- | --- |
   | `DEEPALTITUDE_EDITOR_CLIENT_ID` | The installed GitHub App client ID |
   | `DEEPALTITUDE_EDITOR_CLIENT_SECRET` | A client secret generated in that GitHub App's settings |
   | `GOOGLE_CLIENT_ID` | A Google web-application OAuth client ID |
   | `GOOGLE_CLIENT_SECRET` | That Google OAuth client's secret |
   | `TOKEN_ENCRYPTION_KEY` | A stable, independently generated random secret of at least 32 characters |

4. GitHub App callback: `https://deepaltitude.com/api/editor/callback`. The App needs Contents read/write and is installed only on this repository. No App private key is used.
5. Enable Google Calendar API in the Google Cloud project. Configure the OAuth consent screen for the author and register exactly `https://deepaltitude.com/api/calendar/callback`. The requested scopes are Calendar events and read-only Calendar list; offline access is required. Keep Google OAuth's publishing/test-user configuration appropriate for durable personal use; test-mode grants can expire.
6. Commit the real D1 binding configuration and deploy. Sign in at `/editor/`, then connect Calendar separately in Settings and select the calendars/default/timezone.

Never put real secrets in GitHub, chat, screenshots or logs. No private operational data is placed in this public repository.

## Development, validation and deployment

Node 22+; the SQLite-backed test runner needs Node 22.13+ (Node 24 is used here).

```sh
npm ci
npm run check
npm run test:runtime
npm run dev -- --host 127.0.0.1
```

`npm run check` runs Astro/TypeScript checks, preservation/auth/storage/calendar tests, a fresh production build, generated-route/link checks and a Cloudflare dry run. Tests use an in-memory SQLite database, mocked GitHub and mocked Google; they do not edit real essays or accounts. The runtime test starts Astro and probes real HTTP routes, redirects and unauthenticated private endpoints. Real account consent, author UI workflows, mobile rendering and production D1 migration still require live verification after setup.

For local D1 development, add the real binding first and run `npx wrangler d1 migrations apply deepaltitude-private --local`. Put development secrets only in an ignored `.dev.vars` file. The application never has a production authentication bypass.

Production is the existing `main` → Cloudflare Git integration. GitHub writes create one atomic commit including any new principles/images. SHA checks and non-forced reference updates prevent lost edits. D1 changes do not trigger builds. Public operational pages render on request so visibility changes apply without a rebuild. The sitemap queries only public records; RSS remains available without a visible footer control.

The Cloudflare account/dashboard security challenge prevented provisioning or reading new bindings during this implementation. Browser access to local previews was also blocked. Those external/live checks are explicitly separate from the passing automated tests.

## Recovery

Remote recovery branch: `recovery/pre-final-system-20260925` at `295fa8cdb5d33fa6a625e84cc4991c75e7bf785f`. It includes the author's latest About/Home edits before this migration. Git history retains removed translation and CMS infrastructure. The original essay body/metadata baseline is in `notebook/migration-baseline.json`; the final paths and current About hash are in `notebook/content-migration.json`.

Recover public code/content with a reviewed Git revert or by redeploying the recovery commit. A code rollback does not restore D1. Use Cloudflare D1 Time Travel/backups for operational data, preserve the encryption key, and take a database export before destructive schema changes. Migrations are additive; do not delete the database as part of a website rollback.
