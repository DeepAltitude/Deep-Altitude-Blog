# Original-article editor

The editor stays at `https://deepaltitude.com/editor/`. Original articles have a quiet **Redaguoti originalą / Edit original** link. Translated articles do not. A signed-in author can select an original, edit its title, description and text, preview it, and **Save & publish**. The current repository version is loaded each time. Existing date, domain, principle, tag and language metadata are preserved. Use Pages CMS for new articles, media uploads and other metadata.

Saving commits only the selected original to `main`; the existing Cloudflare Git integration deploys it. The editor confirms publication by comparing the live original download with the saved source. A save that finds a newer GitHub version is refused, with the draft retained for review. Drafts are kept only in the current browser tab's session storage, never sent to GitHub until Save. Signing out clears those drafts. Download draft is available before reloading or signing out.

## One-time author sign-in setup

Create a **GitHub App** owned by DeepAltitude at https://github.com/settings/apps/new:

- Name: `DeepAltitude Original Editor` (choose an available variant if needed).
- Homepage: `https://deepaltitude.com/editor/`.
- Callback URL: `https://deepaltitude.com/api/editor/callback`.
- Keep user access token expiration enabled.
- Disable webhooks; no webhook is needed.
- Repository permissions: **Contents: Read and write**, **Metadata: Read-only**. No account or organization permissions are needed.
- Restrict installation to this account. Install it on **Deep-Altitude-Blog only**.
- Generate a client secret. No app private key is used by this user authorization flow.

In the existing Cloudflare Worker `astro-blog-starter-template`, under **Settings → Variables and Secrets**, add these as runtime secrets, then deploy the configuration:

```
DEEPALTITUDE_EDITOR_CLIENT_ID
DEEPALTITUDE_EDITOR_CLIENT_SECRET
```

Use the GitHub App's **Client ID**, not its numeric App ID. Do not put the secret in GitHub, build variables alone, browser storage, a URL, or this document. No additional database, KV namespace or session service is required. Changing the client secret invalidates existing editor sessions.

Open an original article, select **Edit original**, and **Sign in with GitHub** using DeepAltitude. GitHub authorization returns to the selected article. The session lasts at most eight hours, bounded by the GitHub token's expiry. On a phone and laptop the same flow applies. The initial GitHub consent and first authenticated save must be verified after these secrets are configured.

Until setup is complete, the editor fails closed and clearly says that author sign-in is not connected. Public reading pages remain usable.

## Boundaries and preservation

- The server pins the repository ID and author GitHub user ID. Every article read/save verifies the user's current GitHub identity and repository write permission.
- OAuth state and S256 PKCE protect login. Tokens are encrypted in Secure, HttpOnly, SameSite cookies, never exposed to browser JavaScript. Mutations require a same-origin JSON request and a session CSRF token.
- Only existing Markdown originals in the current content collections or root content folder are writable. Translation files, About, examples, configuration, other repositories and arbitrary paths are refused.
- The original body is edited as text; it is never round-tripped through a rich-text serializer. No-op saves preserve the entire file byte-for-byte. Metadata is parsed with `yaml`; only changed title/description values are updated. Other metadata is retained.
- The save uses GitHub's current file SHA. Concurrent edits are never silently overwritten. No automatic save or automatic translation occurs.
- Preview reconstructs safe HTML with a tag/URL allowlist. Scripts, event handlers, forms, embedded documents and unsafe links are not inserted into the authenticated editor.
- On-demand API responses are private and non-cacheable. The author page is noindex and excluded from the sitemap.

## Verification

`node notebook/test-editor.mjs` tests authentication, authorization, original-only path restrictions, CSRF, no-op preservation, original saves, conflicts and encrypted sessions with a mocked GitHub API. It does not write to the real repository.

Run `npm run check` for the full build, links, exact original downloads, TypeScript and deployment dry run. Browser validation additionally checks narrow layouts, draft recovery, preview safety, save errors and translation pages without editing controls.

GitHub references: [user authorization](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app), [file updates and SHA checks](https://docs.github.com/en/rest/repos/contents#create-or-update-file-contents).
