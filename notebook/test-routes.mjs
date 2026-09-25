import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
const output = process.env.DEEPALTITUDE_QA_DIR;
if (output) fs.mkdirSync(output, { recursive: true });
const server = spawn(
  process.execPath,
  [
    "node_modules/astro/astro.js",
    "dev",
    "--host",
    "127.0.0.1",
    "--port",
    "4399",
  ],
  { stdio: ["ignore", "pipe", "pipe"] },
);
let log = "";
server.stdout.on("data", (b) => (log += b));
server.stderr.on("data", (b) => (log += b));
const origin = "http://127.0.0.1:4399";
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
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!ready)
    throw Error("Local Astro server could not start: " + log.slice(-2500));
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
  const privatePage = await fetch(origin + "/dabar/", { redirect: "manual" });
  assert.equal(privatePage.status, 303);
  assert.equal(privatePage.headers.get("Cache-Control"), "private, no-store");
  assert.ok(privatePage.headers.get("Location").startsWith("/editor/"));
  for (const route of [
    "/api/ops/snapshot?week=2026-09-21",
    "/api/ops/list?kind=projects",
    "/api/ops/list?kind=experiments",
    "/api/ops/list?kind=habits",
    "/api/calendar/events?start=2026-09-01&end=2026-10-01",
    "/api/calendar/settings",
  ]) {
    const response = await fetch(origin + route);
    assert.equal(response.status, 401, route);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  }
  const about = await fetch(origin + "/about/", { redirect: "manual" });
  assert.equal(about.status, 301);
  assert.equal(about.headers.get("Location"), "/apie/");
  const archive = await fetch(origin + "/blog/", { redirect: "manual" });
  assert.equal(archive.status, 301);
  assert.equal(archive.headers.get("Location"), "/uzrasai/");
  if (output)
    fs.writeFileSync(
      path.join(output, "runtime-routes.json"),
      JSON.stringify(results, null, 2),
    );
  console.log(
    `Runtime HTTP checks passed: ${routes.length} public/editor routes, 12 original URLs, private Dabar guard, six unauthenticated private API probes and archive/About redirects.`,
  );
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  server.kill("SIGTERM");
}
