import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { build } from "esbuild";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "deepaltitude-inline-"));
async function load(file) {
  const out = path.join(tmp, path.basename(file) + ".cjs");
  await build({
    entryPoints: [file],
    outfile: out,
    bundle: true,
    format: "cjs",
    platform: "node",
    logLevel: "silent",
  });
  return createRequire(import.meta.url)(out);
}
const { handleNotebook } = await load("src/server/notebook.ts"),
  content = await load("src/server/content.ts"),
  store = await load("src/lib/data/store.ts");
const sql = new DatabaseSync(":memory:");
for (const file of fs.readdirSync("migrations").sort())
  sql.exec(fs.readFileSync("migrations/" + file, "utf8"));
const db = {
  prepare(query) {
    let values = [];
    const s = {
      bind(...v) {
        values = v;
        return s;
      },
      async first() {
        return sql.prepare(query).get(...values) || null;
      },
      async all() {
        return { results: sql.prepare(query).all(...values) };
      },
      async run() {
        return {
          meta: { changes: Number(sql.prepare(query).run(...values).changes) },
        };
      },
    };
    return s;
  },
  async batch(statements) {
    sql.exec("BEGIN");
    try {
      const out = [];
      for (const s of statements) out.push(await s.run());
      sql.exec("COMMIT");
      return out;
    } catch (e) {
      sql.exec("ROLLBACK");
      throw e;
    }
  },
};
const files = new Map();
const blob = (raw) =>
  createHash("sha1")
    .update("blob " + Buffer.byteLength(raw) + "\0" + raw)
    .digest("hex");
for (const file of [
  "src/content/pages/home.md",
  "public/visibility-revision.json",
]) {
  const raw = fs.readFileSync(file, "utf8");
  files.set(file, { raw, sha: blob(raw) });
}
let changes = [],
  writes = 0,
  head = "1".repeat(40),
  fail = false;
async function git(endpoint, data, method) {
  if (method && method !== "GET") writes++;
  if (endpoint.endsWith("/git/ref/heads/main"))
    return { object: { sha: head } };
  if (endpoint.includes("/git/commits/") && !data)
    return { tree: { sha: "2".repeat(40) } };
  if (endpoint.includes("/git/trees/") && !data)
    return {
      tree: [...files].map(([path, v]) => ({ path, sha: v.sha, type: "blob" })),
      truncated: false,
    };
  if (endpoint.includes("/git/blobs/") && !data) {
    const v = [...files.values()].find(
      (v) => v.sha === endpoint.split("/").at(-1),
    );
    return {
      encoding: "base64",
      content: Buffer.from(v.raw).toString("base64"),
      size: Buffer.byteLength(v.raw),
    };
  }
  if (endpoint.endsWith("/git/trees")) {
    changes = data.tree;
    return { sha: "3".repeat(40) };
  }
  if (endpoint.endsWith("/git/commits"))
    return { sha: crypto.randomUUID().replaceAll("-", "").padEnd(40, "a") };
  if (endpoint.endsWith("/git/refs/heads/main")) {
    if (fail) throw Error("Git unavailable");
    for (const c of changes) {
      if (c.sha === null) files.delete(c.path);
      else if (c.content !== undefined)
        files.set(c.path, { raw: c.content, sha: blob(c.content) });
    }
    head = data.sha;
    return {};
  }
  throw Error("Unexpected Git request " + endpoint);
}
const req = (query) =>
  new Request("https://deepaltitude.com/api/editor/note" + (query || ""));
let live = {},
  sequence = 0;
async function deploy() {
  live = {};
  for (const [file, v] of files)
    if (file.startsWith("src/content/"))
      live[file] = await content.digest(v.raw);
  sequence = JSON.parse(
    files.get("public/visibility-revision.json").raw,
  ).sequence;
}
await deploy();
const fetcher = async (url) =>
  Response.json(url.includes("visibility-revision") ? { sequence } : live);
const call = (action, input = null, query = "") =>
  handleNotebook(action, req(query), input, git, { DB: db }, fetcher);
const fresh = (kind) => call("note", null, "?kind=" + kind);
let note = await fresh("article");
note.title = "Private fixture";
note.body = "PRIVATE marker";
note.domain = "mokymasis";
note.topic = "methods";
note.newPrinciples = [
  {
    id: "fixture-principle",
    title: "Private principle marker",
    description: "",
  },
];
note.principles = ["fixture-principle"];
let result = await call("save-note", { document: note, visibility: "private" });
note = result.document;
assert.equal(writes, 0);
assert.ok(note.principles[0].startsWith("draft:"));
let principle = await call(
  "note",
  null,
  "?file=" + encodeURIComponent(note.principles[0]),
);
assert.equal(principle.visibility, "private");
const reopened = await call(
  "note",
  null,
  "?file=" + encodeURIComponent(note.draftFile),
);
assert.equal(reopened.body, "PRIVATE marker");
await assert.rejects(
  () =>
    call("save-note", {
      document: { ...note, draftSha: "0" },
      visibility: "private",
    }),
  /changed/,
);
// Public text is explicitly replaced in fixtures; private principles never enter Git.
note.body = "Disposable public text";
note.title = "Disposable public title";
fail = true;
await assert.rejects(
  () => call("save-note", { document: note, visibility: "public" }),
  /Git unavailable/,
);
fail = false;
assert.equal(files.size, 2);
note = await call("note", null, "?file=" + encodeURIComponent(note.draftFile));
assert.equal(note.body, "Disposable public text");
result = await call("save-note", { document: note, visibility: "public" });
note = result.document;
assert.equal(result.pending, true);
assert.ok(
  ![...files.values()].some(
    (v) =>
      v.raw.includes("Private principle marker") || v.raw.includes("draft:"),
  ),
);
let pending = await call("settle-note", {
  file: note.draftFile,
  version: note.draftSha,
});
assert.equal(pending.pending, true);
assert.equal(
  (await call("note", null, "?file=" + encodeURIComponent(note.draftFile)))
    .body,
  note.body,
);
await deploy();
note = (
  await call("settle-note", { file: note.draftFile, version: note.draftSha })
).document;
assert.equal(note.visibility, "public");
const oldFile = note.file,
  oldRaw = files.get(note.file).raw;
const publicRead = await call(
  "note",
  null,
  "?file=" + encodeURIComponent(note.file),
);
assert.ok(publicRead.principles.includes(principle.draftFile));
await assert.rejects(
  () => call("save-note", { document: publicRead, visibility: "private" }),
  /Confirm removal/,
);
note = (
  await call("save-note", {
    document: publicRead,
    visibility: "private",
    confirm: true,
  })
).document;
assert.equal(files.has(oldFile), false);
assert.equal(note.originalRaw, oldRaw);
assert.equal(
  (await call("settle-note", { file: note.draftFile, version: note.draftSha }))
    .pending,
  true,
);
// An older deployment without this file cannot falsely confirm a withdrawal.
live = { ...live };
delete live[oldFile];
assert.equal(
  (await call("settle-note", { file: note.draftFile, version: note.draftSha }))
    .pending,
  true,
);
await deploy();
note = (
  await call("settle-note", { file: note.draftFile, version: note.draftSha })
).document;
assert.equal(note.visibility, "private");
assert.equal(note.sha, null);
note = (await call("save-note", { document: note, visibility: "public" }))
  .document;
assert.equal(note.file, oldFile);
assert.equal(files.get(oldFile).raw, oldRaw);
await deploy();
note = (
  await call("settle-note", { file: note.draftFile, version: note.draftSha })
).document;
// Private principle can be published separately; its stable private reference survives.
principle = (
  await call("save-note", { document: principle, visibility: "public" })
).document;
await deploy();
principle = (
  await call("settle-note", {
    file: principle.draftFile,
    version: principle.draftSha,
  })
).document;
assert.equal(principle.visibility, "public");
let deletion = await call("delete-note", {
  document: note,
  visibility: "public",
  confirm: true,
});
note = deletion.document;
await deploy();
deletion = await call("settle-note", {
  file: note.draftFile,
  version: note.draftSha,
});
assert.equal(deletion.deleted, true);
await assert.rejects(
  () => call("note", null, "?file=" + encodeURIComponent(note.draftFile)),
  /not found/,
);
assert.ok(
  sql.prepare("SELECT id FROM content_drafts WHERE id=?").get(note.key),
  "Soft delete retains recoverability",
);
const catalog = await content.handleContent("catalog", req(), null, git, {
  DB: db,
});
assert.ok(!catalog.drafts.some((d) => d.file === note.draftFile));
// Existing private drafts stay readable without a data migration.
let legacy = await content.handleContent(
  "document",
  req("?kind=article"),
  null,
  git,
  { DB: db },
);
legacy.title = "Legacy";
legacy.body = "Keep exactly";
legacy = (await content.handleContent("draft", req(), legacy, git, { DB: db }))
  .document;
assert.equal(
  (await call("note", null, "?file=" + encodeURIComponent(legacy.draftFile)))
    .body,
  "Keep exactly",
);
let project = await store.save(db, "projects", {
  title: "Project",
  outcome: "Outcome",
  progress: 25,
});
assert.equal(project.visibility, "private");
await assert.rejects(
  () => store.save(db, "projects", { ...project, progress: 101 }),
  /Progress/,
);
let experiment = await store.save(db, "experiments", {
  title: "Idea",
  project: project.id,
});
const id = experiment.id;
experiment = await store.save(db, "experiments", {
  ...experiment,
  status: "active",
  start_date: "2026-09-25",
  end_date: "2026-10-24",
  show_progress: true,
});
assert.equal(experiment.id, id);
await store.addObservation(db, {
  experiment: id,
  date: "2026-09-25",
  body: "Observation",
});
await store.removeRecord(db, "experiments", experiment);
assert.equal(await store.one(db, "experiments", id), null);
assert.equal((await store.observations(db, id, true)).length, 0);
assert.ok(sql.prepare("SELECT id FROM experiments WHERE id=?").get(id));
const current = await store.saveOneFocus(db, {
  week: "2026-09-21",
  version: 0,
  text: "One focus",
});
assert.deepEqual(current.items, ["One focus"]);
await assert.rejects(
  () => store.saveOneFocus(db, { ...current, text: "two\nlines" }),
  /one short/,
);
for (let n = 1; n <= 7; n++) {
  const d = new Date("2026-09-21T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - n * 7);
  await store.saveOneFocus(db, {
    week: d.toISOString().slice(0, 10),
    version: 0,
    text: "Week " + n,
  });
}
const history = await store.focusHistory(db, "2026-09-21");
assert.equal(history.items.length, 5);
assert.equal(history.more, true);
assert.equal(
  (await store.focusHistory(db, history.items.at(-1).week)).items.length,
  2,
);
await store.removeFocus(db, current);
assert.deepEqual((await store.focus(db, current.week)).items, []);
assert.ok(!("habits" in (await store.notebookSnapshot(db, current.week))));
assert.ok(!("sprints" in (await store.notebookSnapshot(db, current.week))));
// Private operational relationships stay out of public Markdown.
let linked = await fresh("article");
linked.title = "Public note with a private relationship";
linked.body = "Public body";
linked.project = project.id;
linked = (await call("save-note", { document: linked, visibility: "public" }))
  .document;
assert.ok(!files.get(linked.file).raw.includes(project.id));
await deploy();
linked = (
  await call("settle-note", {
    file: linked.draftFile,
    version: linked.draftSha,
  })
).document;
assert.equal(
  (await call("note", null, "?file=" + encodeURIComponent(linked.file)))
    .project,
  project.id,
);
const unavailable = {
  prepare() {
    throw Error("D1 unavailable");
  },
};
const beforeFailure = writes;
await assert.rejects(() =>
  handleNotebook(
    "save-note",
    req(),
    { document: linked, visibility: "private", confirm: true },
    git,
    { DB: unavailable },
    fetcher,
  ),
);
assert.equal(writes, beforeFailure);
assert.ok(
  files.has(linked.file),
  "Failed private backup must leave the public file intact",
);
const model = await load("src/lib/calendar/model.ts");
assert.deepEqual(model.isoWeek("2027-01-01"), { year: 2026, week: 53 });
assert.deepEqual(model.isoWeek("2027-01-04"), { year: 2027, week: 1 });
assert.equal(model.pursuitProgress({ progress: null }, "projects"), "");
assert.equal(model.pursuitProgress({ progress: 0 }, "projects"), "0%");
assert.equal(
  model.pursuitProgress(
    { start_date: "2026-09-25", end_date: "2026-10-24" },
    "experiments",
    "2026-09-25",
  ),
  "",
);
assert.equal(
  model.pursuitProgress(
    { show_progress: 1, start_date: "2026-09-25", end_date: "2026-10-24" },
    "experiments",
    "2026-09-30",
  ),
  "Day 6 / 30",
);
const dates = model.operationalItems({
  projects: [
    {
      id: "p",
      title: "Range",
      status: "active",
      start_date: "2026-09-24T23:15:00Z",
      end_date: "2026-09-26",
    },
  ],
  experiments: [],
  sprints: [{ id: "retained", status: "active", start_date: "2026-09-25" }],
});
assert.equal(dates.length, 1);
assert.equal(dates[0].start, "2026-09-25");
assert.equal(dates[0].allDay, true);
assert.equal(dates[0].href, "/projektai/#item=p");
assert.equal(model.occurs(dates[0], "2026-09-26", "Europe/Zurich"), true);
assert.equal(model.occurs(dates[0], "2026-09-27", "Europe/Zurich"), false);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(
  "Inline notebook model checks passed: private preservation, reusable private principles, failure-safe publish/withdraw, deployment ordering, unchanged republish, recoverable deletion, optional progress, same experiment record, one-line focus/history and legacy storage.",
);
