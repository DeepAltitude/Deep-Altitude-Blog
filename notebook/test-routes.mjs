import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import net from "node:net";
import { legacyRedirects } from "../src/utils/legacy-redirects.mjs";
const worker = process.argv.includes("--worker");
const available = net.createServer();
await new Promise((resolve, reject) => {
  available.once("error", reject);
  available.listen(0, "127.0.0.1", resolve);
});
const port = available.address().port;
await new Promise((resolve) => available.close(resolve));
const output = process.env.DEEPALTITUDE_QA_DIR;
if (output) fs.mkdirSync(output, { recursive: true });
const server = spawn(
  process.execPath,
  worker
    ? [
        "node_modules/wrangler/bin/wrangler.js",
        "dev",
        "--local",
        "--ip",
        "127.0.0.1",
        "--port",
        String(port),
      ]
    : [
        "node_modules/astro/astro.js",
        "dev",
        "--host",
        "127.0.0.1",
        "--port",
        String(port),
      ],
  { stdio: ["ignore", "pipe", "pipe"] },
);
let log = "";
server.stdout.on("data", (b) => (log += b));
server.stderr.on("data", (b) => (log += b));
const origin = "http://127.0.0.1:" + port;
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(origin + "/api/editor/session");
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {}
    if (server.exitCode !== null) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!ready)
    throw Error(
      `Local ${worker ? "Cloudflare Worker" : "Astro server"} could not start: ` +
        log.slice(-2500),
    );
  const authConfiguration = await (
    await fetch(origin + "/api/editor/session")
  ).json();
  const migration = JSON.parse(
    fs.readFileSync("notebook/content-migration.json"),
  );
  const routes = [
    "/",
    "/uzrasai/",
    "/veiksmas/",
    "/mokymasis/",
    "/protas/",
    "/darbas/",
    "/zmones/",
    "/principai/",
    "/projektai/",
    "/eksperimentai/",
    "/apie/",
    "/editor/",
    ...migration.articles.map((a) => "/blog/" + a.slug + "/"),
  ];
  const results = [];
  for (const route of routes) {
    const response = await fetch(origin + route, { redirect: "manual" }),
      body = await response.text();
    assert.equal(response.status, 200, route + ": " + body.slice(0, 200));
    assert.ok(!body.includes("<title>Error</title>"), route);
    results.push({ route, status: response.status });
    if (output && ["/", "/editor/", "/uzrasai/", "/apie/"].includes(route))
      fs.writeFileSync(
        path.join(
          output,
          "render-" +
            (route === "/" ? "home" : route.replaceAll("/", "")) +
            ".html",
        ),
        body,
      );
  }
  const aliases = [...legacyRedirects].flatMap(([source, destination]) => [
    [source, destination],
    [source + "/", destination],
  ]);
  for (let at = 0; at < aliases.length; at += 8) {
    await Promise.all(
      aliases.slice(at, at + 8).map(async ([source, destination]) => {
        const response = await fetch(origin + source + "?ref=legacy", {
          redirect: "manual",
        });
        assert.equal(
          response.status,
          301,
          source + " must remain an HTTP redirect",
        );
        const location = new URL(response.headers.get("Location"), origin);
        assert.equal(
          location.pathname + location.search,
          destination + "?ref=legacy",
          source,
        );
      }),
    );
  }
  const missing = await fetch(origin + "/no-such-legacy-note/", {
    redirect: "manual",
  });
  assert.equal(missing.status, 404);
  assert.ok((await missing.text()).includes("Šio puslapio nėra."));
  const privatePage = await fetch(origin + "/dabar/", { redirect: "manual" });
  assert.equal(privatePage.status, 303);
  assert.equal(privatePage.headers.get("Cache-Control"), "private, no-store");
  assert.ok(privatePage.headers.get("Location").startsWith("/editor/"));
  for (const route of [
    "/api/ops/snapshot?week=2026-09-21",
    "/api/ops/notebook?week=2026-09-21",
    "/api/ops/focus-history?before=2026-09-21",
    "/api/editor/note?kind=article",
    "/api/ops/list?kind=projects",
    "/api/ops/list?kind=experiments",
    "/api/ops/list?kind=habits",
    "/api/calendar/events?start=2026-09-01&end=2026-10-01",
    "/api/calendar/settings",
    "/api/calendar/preferences",
  ]) {
    const response = await fetch(origin + route);
    if (route.startsWith("/api/editor/") && !authConfiguration.configured) {
      assert.equal(response.status, 503, route);
      assert.deepEqual(await response.json(), {
        error: "Author sign-in is not connected yet.",
      });
    } else assert.equal(response.status, 401, route);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  }
  for (const route of [
    "/api/editor/save-note",
    "/api/editor/delete-note",
    "/api/editor/settle-note",
    "/api/ops/focus-save",
    "/api/ops/focus-delete",
    "/api/ops/delete",
  ]) {
    const response = await fetch(origin + route, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: "{}",
    });
    if (route.startsWith("/api/editor/") && !authConfiguration.configured) {
      assert.equal(response.status, 503, route);
      assert.deepEqual(await response.json(), {
        error: "Author sign-in is not connected yet.",
      });
    } else assert.ok([401, 403].includes(response.status), route);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  }
  for (const [source, destination] of [
    ["/about/", "/apie/"],
    ["/blog/", "/uzrasai/"],
  ]) {
    for (const search of ["", "?ref=legacy"]) {
      const response = await fetch(origin + source + search, {
        redirect: "manual",
      });
      assert.equal(response.status, 301, source);
      assert.equal(
        response.headers.get("Location"),
        destination + search,
        source,
      );
    }
  }
  if (output)
    fs.writeFileSync(
      path.join(output, "runtime-routes.json"),
      JSON.stringify(results, null, 2),
    );
  console.log(
    `Runtime HTTP checks passed (${worker ? "Cloudflare Worker" : "Astro"}): ${routes.length} public/editor routes, 12 original URLs, ${aliases.length} legacy slash variants with query strings, private Dabar guard, unauthenticated private API probes and archive/About redirects.`,
  );
} catch (e) {
  console.error(e);
  console.error(log.slice(-2500));
  process.exitCode = 1;
} finally {
  server.kill("SIGTERM");
}
