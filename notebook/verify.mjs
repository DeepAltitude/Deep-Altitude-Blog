import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { parse } from "yaml";
const root = path.resolve("dist"),
  redirects = JSON.parse(fs.readFileSync("notebook/legacy-routes.json"));
const routes = new Set([
  "/",
  "/editor/",
  "/dabar/",
  "/uzrasai/",
  "/apie/",
  "/about/",
  "/blog/",
  "/principai/",
  "/projektai/",
  "/eksperimentai/",
  "/sitemap.xml",
]);
const files = fs
  .readdirSync("src/content/articles")
  .filter((f) => f.endsWith(".md"));
for (const filename of files) {
  const raw = fs.readFileSync("src/content/articles/" + filename, "utf8"),
    data = parse(raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)[1]);
  if (!data.draft)
    routes.add("/blog/" + (data.slug || filename.slice(0, -3)) + "/");
}
for (const filename of fs
  .readdirSync("src/content/principles")
  .filter((f) => f.endsWith(".md")))
  routes.add("/principai/" + filename.slice(0, -3) + "/");
const exists = (p) =>
  routes.has(p) ||
  fs.existsSync(path.join(root, p)) ||
  fs.existsSync(path.join(root, p, "index.html"));
for (const [from, to] of Object.entries(redirects))
  assert.ok(exists(to), `Missing redirect destination: ${from} → ${to}`);
let links = 0;
for (const filename of fs
  .readdirSync(root, { recursive: true })
  .filter((f) => f.endsWith(".html"))) {
  const html = fs.readFileSync(path.join(root, filename), "utf8");
  for (const [, raw] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const url = new URL(
      raw.replaceAll("&amp;", "&"),
      "https://deepaltitude.com/" + filename.replace(/index\.html$/, ""),
    );
    if (url.origin !== "https://deepaltitude.com") continue;
    if (url.pathname.startsWith("/api/")) continue;
    assert.ok(
      exists(decodeURI(url.pathname)) ||
        redirects[url.pathname.replace(/\/$/, "")],
      `Broken local link in ${filename}: ${raw}`,
    );
    links++;
  }
}
for (const file of ["dabar/index.html", "editor/index.html"])
  assert.ok(
    !fs.existsSync(path.join(root, file)),
    `Private dynamic route was emitted as static HTML: ${file}`,
  );
for (const file of fs
  .readdirSync(root, { recursive: true })
  .filter((f) => f.endsWith(".js") || f.endsWith(".html"))) {
  if (file.startsWith("_worker.js")) continue;
  const content = fs.readFileSync(path.join(root, file), "utf8");
  assert.ok(
    !content.includes("test-refresh") && !content.includes("PRIVATE_REFRESH"),
    `Test token leaked: ${file}`,
  );
}
console.log(
  `Generated output verified: ${files.length} notes, ${Object.keys(redirects).length} preserved redirects, ${links} local links, dynamic private routes and no test credentials in public output.`,
);
