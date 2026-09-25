import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { build } from "esbuild";

const temporary = fs.mkdtempSync(
  path.join(os.tmpdir(), "deepaltitude-editor-test-"),
);
const bundle = path.join(temporary, "editor.cjs");
await build({
  entryPoints: ["src/server/editor.ts"],
  outfile: bundle,
  bundle: true,
  format: "cjs",
  platform: "node",
  target: "node22",
  logLevel: "silent",
});
const { handleEditor, isOriginalPath, splitOriginal, updateOriginal } =
  createRequire(import.meta.url)(bundle);
const env = {
  DEEPALTITUDE_EDITOR_CLIENT_ID: "test-client",
  DEEPALTITUDE_EDITOR_CLIENT_SECRET:
    "test-only-secret-not-a-real-credential-123456",
};
const origin = "https://deepaltitude.com";
const file = "src/content/articles/03-parapente.md";
const raw = fs.readFileSync(file, "utf8");
let stored = raw,
  sha = "a".repeat(40),
  userId = 311059981,
  repoId = 1317330542,
  push = true,
  writes = [];
let exchange;
let providerDown = false;
const mockFetch = async (url, options = {}) => {
  if (providerDown) throw new Error("Simulated GitHub outage");
  const u = new URL(url);
  if (u.hostname === "github.com") {
    exchange = JSON.parse(options.body);
    return Response.json({
      access_token: "ghu_TEST_TOKEN_NEVER_REAL",
      expires_in: 28800,
    });
  }
  assert.equal(
    options.headers.Authorization,
    "Bearer ghu_TEST_TOKEN_NEVER_REAL",
  );
  if (u.pathname === "/user")
    return Response.json({ id: userId, login: "DeepAltitude" });
  if (u.pathname === "/repos/DeepAltitude/Deep-Altitude-Blog")
    return Response.json({ id: repoId, permissions: { push } });
  const contentPath = "/repos/DeepAltitude/Deep-Altitude-Blog/contents/";
  assert.ok(u.pathname.startsWith(contentPath));
  assert.equal(decodeURIComponent(u.pathname.slice(contentPath.length)), file);
  if (options.method === "PUT") {
    const data = JSON.parse(options.body);
    writes.push(data);
    assert.equal(data.sha, sha);
    assert.equal(data.branch, "main");
    stored = Buffer.from(data.content, "base64").toString("utf8");
    sha = "b".repeat(40);
    return Response.json({ content: { sha }, commit: { sha: "c".repeat(40) } });
  }
  assert.equal(u.searchParams.get("ref"), "main");
  return Response.json({
    type: "file",
    path: file,
    encoding: "base64",
    sha,
    size: Buffer.byteLength(stored),
    content: Buffer.from(stored).toString("base64"),
  });
};
const request = (action, options = {}) =>
  new Request(origin + "/api/editor/" + action, options);
const call = (action, options = {}, environment = env) =>
  handleEditor(
    request(action, options),
    action.split("?")[0],
    environment,
    mockFetch,
  );
assert.equal(
  (await call("article?file=" + encodeURIComponent(file))).status,
  401,
);
assert.deepEqual(await (await call("session", {}, {})).json(), {
  authenticated: false,
  configured: false,
});
assert.equal((await call("login", {}, {})).status, 503);
assert.equal((await call("article", { method: "DELETE" })).status, 405);

for (const blocked of [
  "notebook/translations/en.txt",
  "src/content/pages/about.md",
  "src/content/about.md",
  "src/content/blog/markdown-style-guide.md",
  "src/content/../wrangler.json",
  "src/content/blog/../../notebook/translations/en.txt",
  "src/content/blog\\evil.md",
  "src/content/en/article.md",
  "src/content/.hidden.md",
  "src/content/test.md\n",
])
  assert.equal(isOriginalPath(blocked), false, blocked);
assert.equal(isOriginalPath(file), true);
assert.equal(
  isOriginalPath("src/content/articles/2026-09-23-new-note.md"),
  true,
);
let originals = 0;
for (const relative of fs.readdirSync("src/content", { recursive: true })) {
  const filename = "src/content/" + relative;
  if (!isOriginalPath(filename)) continue;
  const text = fs.readFileSync(filename, "utf8"),
    source = splitOriginal(text);
  assert.equal(updateOriginal(text, source), text, `No-op altered ${filename}`);
  originals++;
}
const crlf =
  '---\r\ntitle: "Žodžiai"\r\n# Preserve this comment\r\ndomain: sportas\r\nunknown: keep-me\r\n---\r\n\r\nAš rašau.  \r\n\r\n';
assert.equal(
  updateOriginal(crlf, { ...splitOriginal(crlf), body: "\nAš rašau.  \n\n" }),
  crlf,
);
const changed = updateOriginal(crlf, {
  ...splitOriginal(crlf),
  title: "Naujas pavadinimas",
});
assert.equal(splitOriginal(changed).body, splitOriginal(crlf).body);
assert.ok(changed.includes("# Preserve this comment"));
assert.ok(changed.includes("unknown: keep-me"));
assert.throws(() =>
  updateOriginal(raw, { title: "", description: "", body: "text" }),
);

// New inline endpoints must enforce the same real session guard before storage.
for (const action of [
  "note?kind=article",
  "save-note",
  "delete-note",
  "settle-note",
]) {
  const response = await call(
    action,
    action.startsWith("note?")
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: origin },
          body: "{}",
        },
  );
  assert.equal(response.status, 401, action);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
}
const start = await call(
  "login?returnTo=" +
    encodeURIComponent("/editor/?file=" + encodeURIComponent(file)),
);
assert.equal(start.status, 303);
const authorize = new URL(start.headers.get("Location"));
assert.equal(authorize.origin, "https://github.com");
assert.equal(authorize.searchParams.get("code_challenge_method"), "S256");
assert.equal(
  authorize.searchParams.get("redirect_uri"),
  origin + "/api/editor/callback",
);
assert.ok(!authorize.searchParams.has("scope"));
const oauthCookie = start.headers.getSetCookie()[0].split(";")[0];
const state = authorize.searchParams.get("state");
const bad = await call("callback?code=test&state=wrong", {
  headers: { Cookie: oauthCookie },
});
assert.equal(bad.headers.get("Location"), "/editor/?error=signin");
const callback = await call("callback?code=test&state=" + state, {
  headers: { Cookie: oauthCookie },
});
assert.equal(callback.status, 303);
assert.ok(callback.headers.get("Location").startsWith("/editor/?file="));
assert.equal(exchange.repository_id, 1317330542);
assert.ok(exchange.code_verifier);
assert.equal(exchange.client_secret, env.DEEPALTITUDE_EDITOR_CLIENT_SECRET);
const encrypted = callback.headers
  .getSetCookie()
  .find((value) => value.startsWith("__Host-deepaltitude-editor="));
assert.ok(encrypted.includes("Secure; HttpOnly; SameSite=Lax"));
assert.ok(!encrypted.includes("ghu_TEST"));
const sessionCookie = encrypted.split(";")[0];
const auth = { Cookie: sessionCookie };
const sessionResponse = await call("session", { headers: auth });
assert.equal(sessionResponse.headers.get("Cache-Control"), "private, no-store");
const session = await sessionResponse.json();
assert.equal(session.authenticated, true);
assert.ok(session.csrf);
assert.equal(session.token, undefined);
const loadedResponse = await call("article?file=" + encodeURIComponent(file), {
  headers: auth,
});
assert.equal(loadedResponse.status, 200);
const loaded = await loadedResponse.json();
assert.equal(loaded.body, splitOriginal(raw).body);
const postHeaders = {
  ...auth,
  Origin: origin,
  "Content-Type": "application/json",
  "X-Editor-CSRF": session.csrf,
};
const post = (input, headers = postHeaders) =>
  call("article", { method: "POST", headers, body: JSON.stringify(input) });
assert.equal(
  (await post(loaded, { ...postHeaders, Origin: "https://other.example" }))
    .status,
  403,
);
assert.equal(
  (await post(loaded, { ...postHeaders, "X-Editor-CSRF": "wrong" })).status,
  403,
);
assert.equal(
  (await post({ ...loaded, file: "notebook/translations/en.txt" })).status,
  403,
);
assert.equal((await post({ ...loaded, sha: "old" })).status, 409);
assert.equal(writes.length, 0);
assert.equal((await (await post(loaded)).json()).unchanged, true);
assert.equal(writes.length, 0);
const save = await post({
  ...loaded,
  body: loaded.body + "\nDeliberate test edit.\n",
});
assert.equal(save.status, 200);
const saved = await save.json();
assert.equal(saved.sha, sha);
assert.ok(saved.digest);
assert.equal(writes.length, 1);
assert.equal(stored, raw + "\nDeliberate test edit.\n");
assert.equal(
  (await post({ ...loaded, body: "Stale tab content" })).status,
  409,
);
assert.equal(writes.length, 1);
userId = 42;
assert.equal(
  (await call("article?file=" + encodeURIComponent(file), { headers: auth }))
    .status,
  403,
);
userId = 311059981;
repoId = 42;
assert.equal((await call("session", { headers: auth })).status, 403);
repoId = 1317330542;
push = false;
assert.equal((await call("session", { headers: auth })).status, 403);
push = true;
// Real authentication failure is distinct from a transient provider outage.
const guardBundle = path.join(temporary, "guard.cjs");
await build({
  entryPoints: ["src/server/guard.ts"],
  outfile: guardBundle,
  bundle: true,
  format: "cjs",
  platform: "node",
  target: "node22",
  logLevel: "silent",
});
const { authenticate } = createRequire(import.meta.url)(guardBundle);
const actualFetch = globalThis.fetch;
globalThis.fetch = mockFetch;
try {
  providerDown = true;
  assert.equal((await call("session", { headers: auth })).status, 503);
  await assert.rejects(
    () => authenticate(request("session", { headers: auth }), env),
    (error) => error.status === 503,
  );
  providerDown = false;
  push = false;
  await assert.rejects(
    () => authenticate(request("session", { headers: auth }), env),
    (error) => error.status === 403,
  );
  push = true;
  const realNow = Date.now;
  try {
    Date.now = () => realNow() + 9 * 60 * 60 * 1000;
    await assert.rejects(
      () => authenticate(request("session", { headers: auth }), env),
      (error) => error.status === 401,
    );
  } finally {
    Date.now = realNow;
  }
} finally {
  providerDown = false;
  push = true;
  globalThis.fetch = actualFetch;
}
assert.equal(
  (
    await call(
      "article?file=" + encodeURIComponent(file),
      { headers: auth },
      {
        ...env,
        DEEPALTITUDE_EDITOR_CLIENT_SECRET:
          "different-test-secret-123456789012345",
      },
    )
  ).status,
  401,
);
const logout = await call("logout", {
  method: "POST",
  headers: postHeaders,
  body: "{}",
});
assert.equal(logout.status, 200);
assert.ok(logout.headers.get("Set-Cookie").includes("Max-Age=0"));
assert.equal(
  fs.readFileSync(file, "utf8"),
  raw,
  "Test touched a real original",
);
console.log(
  `Editor checks passed: ${originals} byte-exact no-op originals; OAuth/PKCE, encrypted sessions, owner/repository authorization, CSRF, translation/path rejection, safe metadata/body updates, no-op saves, concurrent edits and logout. No real GitHub writes.`,
);
