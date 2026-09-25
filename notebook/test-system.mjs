import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { build } from "esbuild";
const temporary = fs.mkdtempSync(
  path.join(os.tmpdir(), "deepaltitude-system-"),
);
async function module(file) {
  const out = path.join(temporary, path.basename(file) + ".cjs");
  await build({
    entryPoints: [file],
    outfile: out,
    bundle: true,
    format: "cjs",
    platform: "node",
    target: "node22",
    logLevel: "silent",
  });
  return createRequire(import.meta.url)(out);
}
const store = await module("src/lib/data/store.ts"),
  calendar = await module("src/lib/calendar/model.ts"),
  google = await module("src/lib/calendar/google.ts"),
  docs = await module("src/server/documents.ts"),
  content = await module("src/server/content.ts");
const sqlite = new DatabaseSync(":memory:");
sqlite.exec(fs.readFileSync("migrations/0001_operational.sql", "utf8"));
sqlite.exec(fs.readFileSync("migrations/0002_inline_notebook.sql", "utf8"));
const db = {
  async batch(statements) {
    sqlite.exec("BEGIN");
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      sqlite.exec("COMMIT");
      return results;
    } catch (error) {
      sqlite.exec("ROLLBACK");
      throw error;
    }
  },
  prepare(sql) {
    let values = [];
    const statement = {
      bind(...v) {
        values = v;
        return statement;
      },
      async first() {
        return sqlite.prepare(sql).get(...values) || null;
      },
      async all() {
        return { results: sqlite.prepare(sql).all(...values) };
      },
      async run() {
        const result = sqlite.prepare(sql).run(...values);
        return { meta: { changes: Number(result.changes) } };
      },
    };
    return statement;
  },
};
// Original wording and every original metadata field survive the physical migration.
const baseline = JSON.parse(
    fs.readFileSync("notebook/migration-baseline.json"),
  ),
  migration = JSON.parse(fs.readFileSync("notebook/content-migration.json"));
for (const original of baseline.originals) {
  const mapping = migration.articles.find((m) => m.before === original.path),
    raw = fs.readFileSync(mapping.after, "utf8"),
    split = docs.splitOriginal(raw);
  assert.equal(
    createHash("sha256").update(split.body).digest("hex"),
    original.bodySha256,
    mapping.after,
  );
  const metadata = split.document.toJSON();
  for (const [k, v] of Object.entries(original.metadata))
    assert.deepEqual(metadata[k], v, mapping.after + ": " + k);
  assert.equal(docs.updateOriginal(raw, docs.fieldsOf(raw)), raw);
}
assert.equal(
  createHash("sha256")
    .update(fs.readFileSync("src/content/pages/about.md"))
    .digest("hex"),
  migration.aboutSha256,
);
let project = await store.save(db, "projects", {
  title: "QA private project",
  outcome: "Learn",
  status: "active",
});
assert.equal(project.visibility, "private");
assert.equal((await store.list(db, "projects", true)).length, 0);
await assert.rejects(
  () => store.save(db, "projects", { ...project, version: 0 }),
  /Reload/,
);
project = await store.save(db, "projects", {
  ...project,
  visibility: "public",
  featured: true,
});
assert.equal((await store.list(db, "projects", true)).length, 1);
await assert.rejects(
  () => store.save(db, "projects", { ...project, version: 1 }),
  /changed/,
);
let idea = await store.save(db, "experiments", { title: "Only a title" });
assert.equal(idea.status, "idea");
assert.equal(idea.start_date, null);
assert.equal(idea.visibility, "private");
const sameID = idea.id;
idea = await store.save(db, "experiments", {
  ...idea,
  status: "active",
  start_date: "2026-09-25",
  project: project.id,
});
assert.equal(idea.id, sameID);
assert.equal((await store.list(db, "experiments")).length, 1);
await store.addObservation(db, {
  experiment: idea.id,
  date: "2026-09-25",
  body: "My own observation.",
});
assert.equal((await store.observations(db, idea.id, true)).length, 0);
idea = await store.save(db, "experiments", { ...idea, visibility: "public" });
assert.equal((await store.observations(db, idea.id, true)).length, 1);
for (let i = 0; i < 12; i++)
  await store.save(db, "experiments", {
    title: "Simultaneous " + i,
    status: "active",
    start_date: "2026-09-25",
    end_date: i % 2 ? "2026-10-25" : null,
  });
assert.equal((await store.list(db, "experiments")).length, 13);
let sprint = await store.save(db, "sprints", {
  title: "A focused week",
  status: "active",
  start_date: "2026-09-25",
  end_date: "2026-10-02",
  project: project.id,
});
assert.deepEqual(await store.list(db, "sprints", true), []);
sprint = await store.save(db, "sprints", { ...sprint, status: "completed" });
assert.equal(sprint.status, "completed");
let habit = await store.save(db, "habits", {
  title: "Read",
  recurrence: "weekly",
  weekly_target: 3,
  quantity: "20 min",
});
assert.equal((await store.one(db, "habits", habit.id)).title, "Read");
await store.habitEntry(db, { habit: habit.id, date: "2026-09-25", done: true });
await store.habitEntry(db, { habit: habit.id, date: "2026-09-25", done: true });
assert.equal(sqlite.prepare("SELECT count(*) n FROM habit_entries").get().n, 1);
await store.habitEntry(db, {
  habit: habit.id,
  date: "2026-09-25",
  done: false,
});
assert.equal(sqlite.prepare("SELECT count(*) n FROM habit_entries").get().n, 0);
const focus = await store.saveFocus(db, {
  week: "2026-09-21",
  items: ["Read", "Write"],
  version: 0,
});
assert.equal(focus.version, 1);
await assert.rejects(
  () =>
    store.saveFocus(db, {
      week: "2026-09-21",
      items: ["Overwrite"],
      version: 0,
    }),
  /changed/,
);
await assert.rejects(() =>
  store.save(db, "projects", { title: "Bad date", start_date: "2026-02-31" }),
);
await assert.rejects(() =>
  store.save(db, "experiments", {
    title: "Bad topic",
    domain: "veiksmas",
    topic: "meditation",
  }),
);
for (const count of [1, 3, 6, 12]) {
  const months = calendar.monthsFrom("2026-09-01", count);
  assert.equal(months.length, count);
  for (const month of months) {
    const cells = calendar.monthCells(month);
    assert.equal(cells[0].getDay(), 1);
    assert.ok(cells.length >= 28 && cells.length <= 42);
    assert.equal(cells.length % 7, 0);
  }
}
assert.equal(
  calendar.todayIn("Europe/Zurich", new Date("2026-09-24T23:15:00Z")),
  "2026-09-25",
);
assert.equal(calendar.monday("2026-09-27"), "2026-09-21");
const allDay = {
  id: "a",
  source: "google",
  title: "Away",
  allDay: true,
  start: "2026-09-24",
  end: "2026-09-27",
};
assert.equal(calendar.occurs(allDay, "2026-09-26", "Europe/Zurich"), true);
assert.equal(calendar.occurs(allDay, "2026-09-27", "Europe/Zurich"), false);
assert.equal(google.normalizeEvent({ status: "cancelled" }, {}), null);
assert.equal(
  google.normalizeEvent(
    {
      id: "r_1",
      status: "confirmed",
      summary: "Occurrence",
      start: { dateTime: "2026-09-25T09:00:00+02:00" },
      end: { dateTime: "2026-09-25T10:00:00+02:00" },
    },
    { id: "calendar", name: "Personal", writable: true },
  ).allDay,
  false,
);
const cryptoKey = "test-only-dedicated-encryption-key-32-characters";
const encrypted = await google.crypt(
  { refresh: "PRIVATE_REFRESH" },
  cryptoKey,
  "google-token",
);
assert.ok(!encrypted.includes("PRIVATE_REFRESH"));
assert.equal(
  (await google.crypt(encrypted, cryptoKey, "google-token", true)).refresh,
  "PRIVATE_REFRESH",
);
await assert.rejects(() =>
  google.crypt(encrypted, cryptoKey, "wrong-purpose", true),
);
// Drafts are private D1 rows: saving a draft makes zero Git writes.
const files = new Map();
for (const file of [
  ...migration.articles.map((m) => m.after),
  "src/content/pages/home.md",
  "src/content/pages/about.md",
]) {
  const raw = fs.readFileSync(file, "utf8"),
    sha = createHash("sha1")
      .update("blob " + Buffer.byteLength(raw) + "\0" + raw)
      .digest("hex");
  files.set(file, { raw, sha });
}
let writes = 0,
  head = "1".repeat(40),
  tree = "2".repeat(40),
  pending;
async function git(endpoint, data, method) {
  if (method && method !== "GET") writes++;
  if (endpoint.endsWith("/git/ref/heads/main"))
    return { object: { sha: head } };
  if (endpoint.includes("/git/commits/") && !data)
    return { tree: { sha: tree } };
  if (endpoint.includes("/git/trees/") && !data)
    return {
      tree: [...files].map(([path, v]) => ({ path, sha: v.sha, type: "blob" })),
      truncated: false,
    };
  if (endpoint.includes("/git/blobs/") && !data) {
    const v = [...files.values()].find(
      (f) => f.sha === endpoint.split("/").at(-1),
    );
    return {
      encoding: "base64",
      content: Buffer.from(v.raw).toString("base64"),
      size: Buffer.byteLength(v.raw),
    };
  }
  if (endpoint.endsWith("/git/trees") && method === "POST") {
    pending = data.tree;
    return { sha: "3".repeat(40) };
  }
  if (endpoint.endsWith("/git/commits") && method === "POST")
    return { sha: "4".repeat(40) };
  if (endpoint.endsWith("/git/refs/heads/main") && method === "PATCH") {
    for (const change of pending) {
      if (change.content !== undefined) {
        const raw = change.content,
          sha = createHash("sha1")
            .update("blob " + Buffer.byteLength(raw) + "\0" + raw)
            .digest("hex");
        files.set(change.path, { raw, sha });
      }
    }
    head = data.sha;
    return {};
  }
  throw Error("Unexpected Git operation: " + endpoint);
}
const request = (query = "") =>
  new Request("https://deepaltitude.com/api/editor/document" + query);
let document = await content.handleContent(
  "document",
  request("?kind=article"),
  null,
  git,
  { DB: db },
);
document.title = "Private writing";
document.body = "Not for the public repository.";
let saved = await content.handleContent("draft", request(), document, git, {
  DB: db,
});
assert.equal(writes, 0);
assert.equal(
  sqlite.prepare("SELECT count(*) n FROM content_drafts").get().n,
  1,
);
await assert.rejects(
  () =>
    content.handleContent(
      "draft",
      request(),
      { ...saved.document, draftSha: "99" },
      git,
      { DB: db },
    ),
  /changed/,
);
const read = await content.handleContent(
  "document",
  request("?file=" + encodeURIComponent(saved.document.draftFile)),
  null,
  git,
  { DB: db },
);
assert.equal(read.body, document.body);
saved = await content.handleContent("publish", request(), saved.document, git, {
  DB: db,
});
assert.ok(writes > 0);
assert.ok(files.has(saved.document.file));
assert.equal(
  sqlite.prepare("SELECT count(*) n FROM content_drafts").get().n,
  0,
);
assert.equal(
  docs.splitOriginal(files.get(saved.document.file).raw).body,
  document.body,
);
const noOp = await content.handleContent(
  "publish",
  request(),
  saved.document,
  git,
  { DB: db },
);
assert.equal(noOp.unchanged, true);
const stale = { ...saved.document, sha: "0".repeat(40) };
await assert.rejects(
  () => content.handleContent("publish", request(), stale, git, { DB: db }),
  /changed/,
);
// A database outage must not hide public Markdown or cause a false Git failure.
const brokenDB = {
  prepare() {
    throw new Error("Simulated D1 outage with private detail");
  },
};
const offlineCatalog = await content.handleContent(
  "catalog",
  request(),
  null,
  git,
  { DB: brokenDB },
);
assert.ok(
  offlineCatalog.articles.some((item) => item.file === saved.document.file),
);
assert.equal(offlineCatalog.drafts.length, 0);
assert.match(offlineCatalog.warning, /temporarily unavailable/);
assert.ok(!offlineCatalog.warning.includes("private detail"));
const beforeFailedDraft = writes;
await assert.rejects(
  () =>
    content.handleContent(
      "draft",
      request(),
      { ...document, key: crypto.randomUUID() },
      git,
      { DB: brokenDB },
    ),
  /D1 outage/,
);
assert.equal(
  writes,
  beforeFailedDraft,
  "Failed private draft attempted a Git write",
);
const priorRaw = files.get(saved.document.file).raw;
await assert.rejects(
  () =>
    content.handleContent(
      "publish",
      request(),
      { ...saved.document, body: "Unsaved local writing." },
      (endpoint, data, method) => {
        if (method === "PATCH")
          throw new Error("Simulated GitHub write interruption");
        return git(endpoint, data, method);
      },
      { DB: db },
    ),
  /GitHub write interruption/,
);
assert.equal(
  files.get(saved.document.file).raw,
  priorRaw,
  "Failed Git update changed published writing",
);
const pendingDraft = await content.handleContent(
  "draft",
  request(),
  { ...document, key: crypto.randomUUID(), title: "Cleanup failure" },
  git,
  { DB: db },
);
const cleanupFailureDB = {
  prepare(sql) {
    if (sql.startsWith("DELETE FROM content_drafts")) {
      const statement = {
        bind() {
          return statement;
        },
        async run() {
          throw Error("Simulated cleanup outage");
        },
      };
      return statement;
    }
    return db.prepare(sql);
  },
};
const publishedWithDraft = await content.handleContent(
  "publish",
  request(),
  pendingDraft.document,
  git,
  { DB: cleanupFailureDB },
);
assert.ok(files.has(publishedWithDraft.document.file));
assert.match(publishedWithDraft.warning, /saved to GitHub.*cleanup failed/);
assert.equal(publishedWithDraft.document.draftFile, undefined);
assert.ok(
  sqlite
    .prepare("SELECT id FROM content_drafts WHERE id = ?")
    .get(pendingDraft.document.key),
);
// Exercise the current document service for pages and reusable principles too.
for (const page of ["home", "about"]) {
  const file = "src/content/pages/" + page + ".md";
  const pageDocument = await content.handleContent(
    "document",
    request("?file=" + encodeURIComponent(file)),
    null,
    git,
    { DB: db },
  );
  const originalPage = files.get(file).raw;
  const pageNoOp = await content.handleContent(
    "publish",
    request(),
    pageDocument,
    git,
    { DB: db },
  );
  assert.equal(pageNoOp.unchanged, true);
  assert.equal(files.get(file).raw, originalPage);
  const edited = {
    ...pageDocument,
    description: "Provider-mocked author test.",
  };
  const pageSave = await content.handleContent(
    "publish",
    request(),
    edited,
    git,
    { DB: db },
  );
  assert.equal(
    docs.fieldsOf(files.get(file).raw).description,
    edited.description,
  );
  assert.equal(
    docs.splitOriginal(files.get(file).raw).body,
    docs.splitOriginal(originalPage).body,
  );
  assert.equal(pageSave.document.url, page === "home" ? "/" : "/apie/");
}
let principle = await content.handleContent(
  "document",
  request("?kind=principle"),
  null,
  git,
  { DB: db },
);
principle = {
  ...principle,
  title: "A provider-mocked principle",
  body: "An explanation.",
};
const principleSave = await content.handleContent(
  "publish",
  request(),
  principle,
  git,
  { DB: db },
);
const linked = {
  ...saved.document,
  principles: ["temporary-principle"],
  newPrinciples: [
    { id: "temporary-principle", title: principle.title, description: "" },
  ],
};
const linkedSave = await content.handleContent(
  "publish",
  request(),
  linked,
  git,
  { DB: db },
);
const principleId = principleSave.document.file.split("/").at(-1).slice(0, -3);
assert.deepEqual(
  linkedSave.document.principles,
  [principleId],
  "Inline principle should reuse the canonical entity",
);
assert.equal(files.has("src/content/principles/temporary-principle.md"), false);
assert.equal(
  (
    await content.handleContent(
      "publish",
      request(),
      linkedSave.document,
      git,
      { DB: db },
    )
  ).unchanged,
  true,
);
const drafts = await module("src/lib/data/drafts.ts");
const privateImage = {
  id: crypto.randomUUID(),
  mime: "image/png",
  path: "/images/qa-private.png",
  data: "A".repeat(3000000),
};
const imageDraft = {
  ...document,
  key: crypto.randomUUID(),
  file: "",
  sha: null,
  draftFile: undefined,
  draftSha: undefined,
  attachments: [privateImage],
};
const imageSaved = await drafts.saveDraft(db, imageDraft);
assert.ok(
  sqlite.prepare("SELECT max(length(data)) n FROM draft_media").get().n <=
    512000,
);
assert.equal(
  (await drafts.readDraft(db, imageSaved.key)).document.attachments[0].data,
  privateImage.data,
);
await assert.rejects(
  () =>
    drafts.saveDraft(db, { ...imageSaved, draftSha: "99", attachments: [] }),
  /changed/,
);
assert.equal(
  (await drafts.readDraft(db, imageSaved.key)).document.attachments[0].data,
  privateImage.data,
  "A stale draft write damaged staged images",
);
const timed = await store.save(db, "experiments", {
  title: "Timezone test",
  start_date: "2026-09-25T09:00",
  end_date: "2026-09-25T10:00",
});
assert.equal(timed.start_date, "2026-09-25T07:00:00.000Z");
assert.equal(
  (await store.save(db, "experiments", { ...timed, title: "Timezone edit" }))
    .start_date,
  timed.start_date,
);
// A cold catalog must fit the Worker subrequest budget and still return every
// note in order. The real deployment failed when this required one blob fetch
// per note in a single request; the previous small fixture did not expose it.
const catalogClient = await module("src/scripts/catalog.ts");
for (let i = 0; i < 125; i++) {
  const raw = `---\ntitle: Catalog fixture ${i}\npubDate: 2026-09-${String(i % 25 + 1).padStart(2, "0")}\n---\nDisposable local test text.\n`;
  files.set(`src/content/articles/catalog-fixture-${i}.md`, {
    raw,
    sha: createHash("sha1").update("blob " + Buffer.byteLength(raw) + "\0" + raw).digest("hex"),
  });
}
let catalogPages = 0;
const writesBeforeCatalog = writes;
async function catalogPage(endpoint, environment = { DB: db }) {
  let subrequests = 2; // /user and repository write-permission verification.
  const limitedGit = async (...args) => {
    assert.ok(++subrequests <= 50, "Catalog exceeds the Worker subrequest budget");
    return git(...args);
  };
  catalogPages++;
  return content.handleContent("catalog", new Request("https://deepaltitude.com/api/" + endpoint), null, limitedGit, environment);
}
const fullCatalog = await catalogClient.loadCatalogPages(catalogPage);
const expectedArticles = [...files.keys()].filter((file) => docs.kindOf(file) === "article");
assert.ok(catalogPages > 1);
assert.deepEqual(fullCatalog.articles.map((item) => item.file).sort(), expectedArticles.sort());
assert.equal(new Set(fullCatalog.articles.map((item) => item.file)).size, expectedArticles.length);
assert.equal(fullCatalog.drafts.length, sqlite.prepare("SELECT count(*) n FROM content_drafts").get().n);
for (let i = 1; i < fullCatalog.articles.length; i++)
  assert.ok(String(fullCatalog.articles[i - 1].pubDate || "") >= String(fullCatalog.articles[i].pubDate || ""));
assert.equal(writes, writesBeforeCatalog, "Reading a catalog must never write to GitHub");
const unavailableDrafts = await catalogClient.loadCatalogPages((endpoint) => catalogPage(endpoint, { DB: brokenDB }));
assert.equal(unavailableDrafts.articles.length, expectedArticles.length);
assert.equal(unavailableDrafts.drafts.length, 0);
assert.match(unavailableDrafts.warning, /temporarily unavailable/);
const firstPage = await catalogPage("editor/catalog");
const catalogHead = head;
head = "a".repeat(40);
await assert.rejects(() => catalogPage("editor/catalog?cursor=" + encodeURIComponent(firstPage.next)), /changed while its index/);
head = catalogHead;
await assert.rejects(() => catalogPage("editor/catalog?cursor=invalid"), /page is invalid/);
let interruptedPages = 0;
await assert.rejects(() => catalogClient.loadCatalogPages(async () => {
  if (++interruptedPages > 1) throw new Error("Simulated second-page failure");
  return firstPage;
}), /second-page failure/);
await assert.rejects(() => catalogClient.loadCatalogPages(async () => firstPage), /could not finish/);
// Public and private API guards are exercised with no session and no real network.
for (const endpoint of [
  "src/pages/api/ops/[action].ts",
  "src/pages/api/calendar/[action].ts",
]) {
  const route = await module(endpoint);
  for (const action of [
    "snapshot",
    "notebook",
    "focus-history",
    "focus-save",
    "focus-delete",
    "delete",
    "record",
    "list",
    "focus",
    "habit",
    "events",
    "settings",
    "preferences",
    "connect",
    "callback",
    "event",
  ]) {
    const response = await route.ALL({
      request: new Request("https://deepaltitude.com/api/test/" + action),
      params: { action },
      locals: { runtime: { env: { DB: db } } },
    });
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    const text = await response.text();
    assert.ok(!text.includes("PRIVATE_REFRESH"));
    assert.ok(!text.includes("My own observation"));
  }
}
console.log(
  `System checks passed: ${baseline.originals.length} preserved essays + current About; D1 migrations and CRUD, privacy, conflicts, idea promotion, 13 concurrent experiments, observations, habits, focus, 1/3/6/12 months, timezone and exclusive all-day ends, encryption, private drafts, Git publishing, bounded cold catalog pagination and unauthenticated API probes.`,
);
