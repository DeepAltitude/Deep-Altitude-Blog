import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { build } from "esbuild";
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "calendar-test-")),
  file = path.join(temp, "google.cjs");
await build({
  entryPoints: ["src/lib/calendar/google.ts"],
  outfile: file,
  bundle: true,
  platform: "node",
  format: "cjs",
  logLevel: "silent",
});
const g = createRequire(import.meta.url)(file);
const modelFile = path.join(temp, "model.cjs"),
  routeFile = path.join(temp, "route.cjs");
await build({
  entryPoints: ["src/lib/calendar/model.ts"],
  outfile: modelFile, bundle: true, platform: "node", format: "cjs", logLevel: "silent",
});
const model = createRequire(import.meta.url)(modelFile);
// Test the Calendar router as an already-authorized author. Real author/CSRF
// checks remain covered by the existing guard/editor tests.
await build({
  entryPoints: ["src/pages/api/calendar/[action].ts"],
  outfile: routeFile, bundle: true, platform: "node", format: "cjs", logLevel: "silent",
  plugins: [{
    name: "authorized-calendar-route",
    setup(builder) {
      builder.onLoad({ filter: /server[\\/]guard\.ts$/ }, () => ({
        contents: `
          export const authenticate = async () => ({ authenticated: true });
          export const input = (request) => request.json();
          export const privateHeaders = { "Cache-Control": "private, no-store" };
          export const failure = (error) => Response.json({ error: error.message }, { status: error.status || 503, headers: privateHeaders });
        `,
        loader: "js",
      }));
    },
  }],
});
const route = createRequire(import.meta.url)(routeFile);
for (const method of ["GET", "POST", "PATCH", "DELETE"]) {
  const response = await route.ALL({
    request: new Request("https://deepaltitude.com/api/calendar/event", {
      method,
      ...(method === "POST" ? { headers: { "Content-Type": "application/json" }, body: "{}" } : {}),
    }),
    params: { action: "event" }, locals: { runtime: { env: {} } },
  });
  assert.equal(response.status, ["GET", "POST"].includes(method) ? 404 : 405);
}
const page = fs.readFileSync("src/pages/dabar.astro", "utf8");
assert.doesNotMatch(page, /id="(?:new-event|day-add-event|event-form|event-save|event-delete)"/);
assert.doesNotMatch(fs.readFileSync("src/pages/editor/index.astro", "utf8"), /default_calendar/);
assert.equal(model.googleEventHref("https://calendar.google.com/calendar/event?eid=example"), "https://calendar.google.com/calendar/event?eid=example");
assert.equal(model.googleEventHref("https://www.google.com/calendar/event?eid=example"), "https://www.google.com/calendar/event?eid=example");
for (const unsafe of [undefined, "", "javascript:alert(1)", "https://calendar.google.com.example.invalid/", "http://calendar.google.com/"])
  assert.equal(model.googleEventHref(unsafe), null);
const range = model.eventWhen({ allDay: true, start: "2026-09-24", end: "2026-09-27" }, "America/New_York");
assert.match(range, /24/);
assert.match(range, /26/);
assert.doesNotMatch(range, /27/);
assert.match(range, /All day/);
const timed = model.eventWhen({ allDay: false, start: "2026-09-25T08:00:00+02:00", end: "2026-09-25T09:00:00+02:00" }, "Europe/Zurich");
assert.match(timed, /08:00/);
assert.match(timed, /09:00/);
assert.match(timed, /Europe\/Zurich/);
const sql = new DatabaseSync(":memory:");
sql.exec(fs.readFileSync("migrations/0001_operational.sql", "utf8"));
sql.exec(fs.readFileSync("migrations/0002_inline_notebook.sql", "utf8"));
const db = {
  prepare(s) {
    let args = [];
    const q = {
      bind(...v) {
        args = v;
        return q;
      },
      async first() {
        return sql.prepare(s).get(...args) || null;
      },
      async all() {
        return { results: sql.prepare(s).all(...args) };
      },
      async run() {
        return {
          meta: { changes: Number(sql.prepare(s).run(...args).changes) },
        };
      },
    };
    return q;
  },
};
const env = {
  DB: db,
  GOOGLE_CLIENT_ID: "test-client",
  GOOGLE_CLIENT_SECRET: "test-secret",
  TOKEN_ENCRYPTION_KEY: "test-only-encryption-key-not-a-real-secret-12345678",
};
let refreshes = 0,
  revoked = false,
  fail = false,
  queries = [],
  grantedScopes = "https://www.googleapis.com/auth/calendar.events.readonly https://www.googleapis.com/auth/calendar.calendarlist.readonly";
const mock = async (url, options = {}) => {
  if (fail) throw Error("Simulated network failure");
  const u = new URL(url);
  if (u.pathname === "/token") {
    const input = new URLSearchParams(options.body);
    assert.equal(input.get("client_secret"), env.GOOGLE_CLIENT_SECRET);
    if (input.get("grant_type") === "refresh_token") {
      refreshes++;
      if (revoked)
        return Response.json({ error: "invalid_grant" }, { status: 400 });
      assert.equal(input.get("refresh_token"), "test-refresh");
    } else assert.ok(input.get("code_verifier"));
    return Response.json({
      access_token: "test-access",
      refresh_token: "test-refresh",
      expires_in: 3600,
      scope: grantedScopes,
    });
  }
  if (u.pathname === "/revoke") {
    assert.ok(options.body.toString().includes("test-refresh"));
    revoked = true;
    return new Response("", { status: 200 });
  }
  assert.equal(options.headers.Authorization, "Bearer test-access");
  assert.equal(options.method, "GET", "Calendar list access must be read-only");
  if (u.pathname.endsWith("/calendarList"))
    return Response.json({
      items: [
        {
          id: "primary@example.invalid",
          summary: "Personal",
          primary: true,
          accessRole: "owner",
          timeZone: "Europe/Zurich",
        },
        { id: "work", summary: "Work", accessRole: "reader" },
      ],
    });
  assert.equal(options.method, "GET", "Calendar data access must be read-only");
  assert.equal(options.body, undefined);
  queries.push(u.searchParams);
  return Response.json({
    items: [
      {
        id: "timed",
        summary: "Timed",
        start: { dateTime: "2026-09-25T08:00:00+02:00" },
        end: { dateTime: "2026-09-25T09:00:00+02:00" },
      },
      {
        id: "all-day",
        summary: "All day",
        start: { date: "2026-09-25" },
        end: { date: "2026-09-26" },
      },
      {
        id: "multi-day",
        summary: "Multi day",
        start: { date: "2026-09-25" },
        end: { date: "2026-09-28" },
      },
      {
        id: "recurring_20260925",
        summary: "Recurring occurrence",
        recurringEventId: "series",
        start: { dateTime: "2026-09-25T12:00:00+02:00" },
        end: { dateTime: "2026-09-25T13:00:00+02:00" },
      },
      { id: "cancelled", status: "cancelled" },
    ],
  });
};
assert.equal((await g.settings(env, mock)).connected, false);
const start = await g.connect(env),
  authorize = new URL(start.headers.get("Location"));
assert.equal(authorize.searchParams.get("access_type"), "offline");
assert.equal(authorize.searchParams.get("code_challenge_method"), "S256");
assert.deepEqual(authorize.searchParams.get("scope").split(" ").sort(), [
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  "https://www.googleapis.com/auth/calendar.events.readonly",
]);
assert.equal(authorize.searchParams.get("redirect_uri"), "https://deepaltitude.com/api/calendar/callback");
const cookie = start.headers.get("Set-Cookie").split(";")[0];
const bad = await g.oauthCallback(
  new Request(
    "https://deepaltitude.com/api/calendar/callback?code=test&state=wrong",
    { headers: { Cookie: cookie } },
  ),
  env,
  mock,
);
assert.ok(bad.headers.get("Location").endsWith("failed"));
assert.equal(
  sql.prepare("SELECT count(*) n FROM oauth_connections").get().n,
  0,
);
// Partial consent must not create a usable connection or persist provider tokens.
const scopes = grantedScopes;
grantedScopes = "https://www.googleapis.com/auth/calendar.calendarlist.readonly";
const partial = await g.oauthCallback(
  new Request(
    "https://deepaltitude.com/api/calendar/callback?code=test&state=" + authorize.searchParams.get("state"),
    { headers: { Cookie: cookie } },
  ), env, mock,
);
assert.ok(partial.headers.get("Location").endsWith("failed"));
assert.equal(sql.prepare("SELECT count(*) n FROM oauth_connections").get().n, 0);
grantedScopes = scopes;
const response = await g.oauthCallback(
  new Request(
    "https://deepaltitude.com/api/calendar/callback?code=test&state=" +
      authorize.searchParams.get("state"),
    { headers: { Cookie: cookie } },
  ),
  env,
  mock,
);
assert.ok(response.headers.get("Location").endsWith("connected"));
const stored = sql
  .prepare("SELECT encrypted_token FROM oauth_connections")
  .get().encrypted_token;
assert.ok(!stored.includes("test-refresh"));
assert.ok(!stored.includes("test-access"));
let settings = await g.settings(env, mock);
assert.equal(settings.calendars.length, 2);
assert.deepEqual(settings.preferences.calendars, ["primary@example.invalid"]);
settings = await g.saveSettings(
  env,
  { ...settings.preferences, calendars: ["primary@example.invalid", "work"] },
  mock,
);
assert.equal(settings.preferences.calendars.length, 2);
let result = await g.events(env, "2026-09-01", "2026-10-01", mock);
assert.equal(result.items.length, 8);
assert.ok(!result.items.some((e) => e.id === "cancelled"));
assert.equal(queries.length, 2);
assert.equal(queries[0].get("singleEvents"), "true");
assert.equal(queries[0].get("timeZone"), "Europe/Zurich");
await g.events(env, "2026-09-01", "2026-10-01", mock);
assert.equal(queries.length, 2, "Event cache not reused");
const stale = await g.crypt(
  { access: "expired", refresh: "test-refresh", expires: 0 },
  env.TOKEN_ENCRYPTION_KEY,
  "google-token",
);
sql.prepare("UPDATE oauth_connections SET encrypted_token=?").run(stale);
await g.calendars(env, mock);
assert.equal(refreshes, 1);
assert.equal(g.writeEvent, undefined, "No provider write operation is exported");
assert.ok(result.items.every((item) => !("writable" in item) && !("etag" in item)));
assert.ok(!("default_calendar" in settings.preferences));
assert.ok(!JSON.stringify(settings).includes("test-refresh"));
assert.ok(!JSON.stringify(settings).includes("test-access"));
fail = true;
await assert.rejects(
  () => g.events(env, "2026-10-01", "2026-11-01", mock),
  /unavailable/,
);
fail = false;
await g.disconnect(env, mock);
assert.equal(
  sql.prepare("SELECT count(*) n FROM oauth_connections").get().n,
  0,
);
assert.equal((await g.settings(env, mock)).connected, false);
assert.equal(
  (await g.events(env, "2026-09-01", "2026-10-01", mock)).items.length,
  0,
);
// Reconnect creates a fresh independent connection; revocation is reported only by Calendar.
revoked = false;
const again = await g.connect(env),
  next = new URL(again.headers.get("Location"));
await g.oauthCallback(
  new Request(
    "https://deepaltitude.com/api/calendar/callback?code=test&state=" +
      next.searchParams.get("state"),
    { headers: { Cookie: again.headers.get("Set-Cookie").split(";")[0] } },
  ),
  env,
  mock,
);
assert.equal((await g.settings(env, mock)).connected, true);
sql.prepare("UPDATE oauth_connections SET encrypted_token=?").run(stale);
revoked = true;
await assert.rejects(() => g.calendars(env, mock), /revoked/);
console.log(
  "Calendar provider-mock checks passed: connect/state/PKCE, reconnect/disconnect, encrypted dynamic tokens, multiple calendars, cache/range, timed/all-day/multi-day/recurring/cancelled events, read-only scopes and requests, rejected partial consent, refresh, revocation and failure. No real Google account or event was accessed.",
);
