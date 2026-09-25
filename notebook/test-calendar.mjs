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
const sql = new DatabaseSync(":memory:");
sql.exec(fs.readFileSync("migrations/0001_operational.sql", "utf8"));
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
  created,
  deleted = false,
  queries = [],
  updated = false;
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
    });
  }
  if (u.pathname === "/revoke") {
    assert.ok(options.body.toString().includes("test-refresh"));
    revoked = true;
    return new Response("", { status: 200 });
  }
  assert.equal(options.headers.Authorization, "Bearer test-access");
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
  if (options.method === "DELETE") {
    assert.equal(options.headers["If-Match"], '"event-v1"');
    deleted = true;
    return new Response(null, { status: 204 });
  }
  if (options.method === "PATCH" || options.method === "POST") {
    const input = JSON.parse(options.body);
    created = input;
    updated = options.method === "PATCH";
    return Response.json({
      id: "new-event",
      summary: input.summary,
      ...input,
      etag: '"event-v1"',
      htmlLink: "https://calendar.google.com/calendar/event?eid=test",
    });
  }
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
assert.ok(!authorize.searchParams.get("scope").includes("userinfo"));
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
const event = await g.writeEvent(
  env,
  {
    calendarId: "primary@example.invalid",
    title: "QA event",
    start: "2026-09-25T09:00",
    end: "2026-09-25T10:00",
    allDay: false,
  },
  mock,
);
assert.equal(event.id, "new-event");
assert.equal(created.start.timeZone, "Europe/Zurich");
await g.writeEvent(
  env,
  {
    ...event,
    title: "Updated QA",
    start: "2026-09-25",
    end: "2026-09-27",
    allDay: true,
  },
  mock,
);
assert.equal(updated, true);
assert.equal(created.start.date, "2026-09-25");
assert.equal(created.end.date, "2026-09-27");
await g.writeEvent(
  env,
  {
    calendarId: event.calendarId,
    id: event.id,
    etag: event.etag,
    remove: true,
  },
  mock,
);
assert.equal(deleted, true);
await assert.rejects(
  () =>
    g.writeEvent(
      env,
      { calendarId: "work", title: "Unauthorized write" },
      mock,
    ),
  /edit/,
);
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
  "Calendar provider-mock checks passed: connect/state/PKCE, reconnect/disconnect, encrypted dynamic tokens, multiple calendars, cache/range, timed/all-day/multi-day/recurring/cancelled events, real API-shaped create/edit/delete, refresh, revocation and failure. No real Google account or event was accessed.",
);
