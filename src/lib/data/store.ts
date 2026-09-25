import { canonicalDate } from "./dates";
import { EditorError } from "../../server/errors";
import { asDomain, topicFor } from "../../utils/domains";
import { slugify, uuidPattern } from "../../server/documents";
export interface Statement {
  bind(...values: any[]): Statement;
  first<T = any>(): Promise<T | null>;
  all<T = any>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number } }>;
}
export interface Database {
  prepare(sql: string): Statement;
  batch(statements: Statement[]): Promise<any[]>;
}
export interface DataEnvironment {
  DB?: Database;
}
export type RecordKind = "projects" | "experiments" | "sprints" | "habits";
export const kinds: RecordKind[] = [
  "projects",
  "experiments",
  "sprints",
  "habits",
];
export function database(env: DataEnvironment): Database {
  if (!env.DB)
    throw new EditorError(
      503,
      "Private storage is not connected yet. Your changes have not been saved.",
    );
  return env.DB;
}
const fields: Record<RecordKind, string[]> = {
  projects: [
    "title",
    "description",
    "outcome",
    "progress",
    "status",
    "start_date",
    "end_date",
    "domain",
    "topic",
    "tags",
    "visibility",
    "featured",
  ],
  experiments: [
    "title",
    "description",
    "hypothesis",
    "show_progress",
    "protocol",
    "observe",
    "conclusion",
    "status",
    "start_date",
    "end_date",
    "project",
    "domain",
    "topic",
    "tags",
    "principles",
    "visibility",
    "featured",
  ],
  sprints: [
    "title",
    "description",
    "status",
    "start_date",
    "end_date",
    "project",
    "goals",
    "notes",
  ],
  habits: [
    "title",
    "recurrence",
    "weekdays",
    "weekly_target",
    "quantity",
    "active",
  ],
};
const states: Record<string, string[]> = {
  projects: ["planned", "active", "completed", "paused", "abandoned"],
  experiments: [
    "idea",
    "planned",
    "active",
    "completed",
    "paused",
    "abandoned",
  ],
  sprints: ["planned", "active", "completed", "cancelled"],
};
const arrays = ["tags", "principles", "weekdays"];
export function decode(row: any) {
  if (!row) return null;
  const result = { ...row };
  for (const k of arrays) if (k in result) result[k] = JSON.parse(result[k]);
  return result;
}
export function validDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(
      value,
    ) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value.slice(0, 10)).toISOString().slice(0, 10) ===
      value.slice(0, 10)
  );
}
export function day(value: any) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !validDate(value)
  )
    throw new EditorError(422, "Choose a valid date.");
  return value;
}
function clean(kind: RecordKind, input: any) {
  const v: Record<string, any> = {};
  if (
    !input ||
    typeof input.title !== "string" ||
    !input.title.trim() ||
    input.title.length > 500
  )
    throw new EditorError(422, "Enter a title.");
  for (const key of fields[kind]) {
    const value = input[key];
    if (value === undefined) continue;
    if (arrays.includes(key)) {
      if (
        !Array.isArray(value) ||
        value.length > 100 ||
        value.some((x: any) =>
          key === "weekdays"
            ? !Number.isInteger(x) || x < 0 || x > 6
            : typeof x !== "string" || !x.trim() || x.length > 200,
        )
      )
        throw new EditorError(422, "Check the list fields.");
      v[key] = JSON.stringify([...new Set(value)]);
      continue;
    }
    if (["featured", "active", "show_progress"].includes(key)) {
      if (![true, false, 0, 1].includes(value))
        throw new EditorError(422, "Invalid selection.");
      v[key] = value ? 1 : 0;
      continue;
    }
    if (key === "progress") {
      if (value === null || value === "") {
        v[key] = null;
        continue;
      }
      if (
        !Number.isInteger(Number(value)) ||
        Number(value) < 0 ||
        Number(value) > 100
      )
        throw new EditorError(
          422,
          "Progress must be between 0 and 100, or left empty.",
        );
      v[key] = Number(value);
      continue;
    }
    if (key === "weekly_target") {
      if (
        !Number.isInteger(Number(value)) ||
        Number(value) < 1 ||
        Number(value) > 7
      )
        throw new EditorError(422, "Weekly target must be between 1 and 7.");
      v[key] = Number(value);
      continue;
    }
    if (value !== null && (typeof value !== "string" || value.length > 100000))
      throw new EditorError(422, "One field is invalid or too long.");
    v[key] = value ?? "";
  }
  if (kind === "projects" && !v.outcome?.trim() && !v.description?.trim())
    throw new EditorError(422, "Describe the desired outcome or the project.");
  if ("status" in v && !states[kind]?.includes(v.status))
    throw new EditorError(422, "Choose a valid state.");
  if (v.visibility && !["public", "private"].includes(v.visibility))
    throw new EditorError(422, "Choose public or private.");
  if (
    v.recurrence &&
    !["daily", "weekdays", "days", "weekly"].includes(v.recurrence)
  )
    throw new EditorError(422, "Choose a recurrence.");
  if (
    (v.domain && !asDomain(v.domain)) ||
    (v.topic && (!v.domain || !topicFor(v.domain, v.topic)))
  )
    throw new EditorError(422, "Choose a topic in the selected domain.");
  for (const key of ["start_date", "end_date"])
    if (key in v) {
      if (v[key] && !validDate(v[key]))
        throw new EditorError(422, "Choose valid dates.");
      v[key] = v[key] || null;
    }
  if (
    v.start_date &&
    v.end_date &&
    Date.parse(v.end_date) < Date.parse(v.start_date)
  )
    throw new EditorError(422, "The end cannot precede the start.");
  if ("project" in v) {
    if (v.project && !uuidPattern.test(v.project))
      throw new EditorError(422, "Choose an existing project.");
    v.project = v.project || null;
  }
  return v;
}
export async function list(db: Database, kind: RecordKind, publicOnly = false) {
  if (
    !kinds.includes(kind) ||
    (publicOnly && !["projects", "experiments"].includes(kind))
  )
    return [];
  const result = await db
    .prepare(
      `SELECT * FROM ${kind}${["projects", "experiments"].includes(kind) ? " WHERE deleted_at IS NULL" : ""}${publicOnly ? " AND visibility = 'public'" : ""} ORDER BY updated_at DESC, id`,
    )
    .all();
  return result.results.map(decode);
}
export async function one(
  db: Database,
  kind: RecordKind,
  id: string,
  publicOnly = false,
) {
  if (
    !kinds.includes(kind) ||
    (publicOnly && !["projects", "experiments"].includes(kind))
  )
    return null;
  return decode(
    await db
      .prepare(
        `SELECT * FROM ${kind} WHERE (id = ? OR ${kind === "habits" ? "id" : "slug"} = ?)${["projects", "experiments"].includes(kind) ? " AND deleted_at IS NULL" : ""}${publicOnly ? " AND visibility = 'public'" : ""}`,
      )
      .bind(id, id)
      .first(),
  );
}
export async function save(db: Database, kind: RecordKind, input: any) {
  if (!kinds.includes(kind)) throw new EditorError(404, "Unknown collection.");
  const v = clean(kind, input),
    id = input.id || crypto.randomUUID(),
    now = new Date().toISOString();
  const preferences = await db
    .prepare("SELECT timezone FROM calendar_preferences WHERE id = 1")
    .first();
  for (const key of ["start_date", "end_date"])
    if (v[key]) {
      try {
        v[key] = canonicalDate(
          v[key],
          preferences?.timezone || "Europe/Zurich",
        );
      } catch (e) {
        throw new EditorError(422, (e as Error).message);
      }
    }
  if (!uuidPattern.test(id)) throw new EditorError(422, "Invalid record.");
  if (v.project && !(await one(db, "projects", v.project)))
    throw new EditorError(422, "The linked project no longer exists.");
  if (input.id) {
    if (!Number.isInteger(input.version) || input.version < 1)
      throw new EditorError(
        409,
        "Reload the saved version first. Your text is still here.",
      );
    const columns = Object.keys(v),
      result = await db
        .prepare(
          `UPDATE ${kind} SET ${columns.map((k) => k + " = ?").join(", ")}, updated_at = ?, version = version + 1 WHERE id = ? AND version = ?${["projects", "experiments"].includes(kind) ? " AND deleted_at IS NULL" : ""}`,
        )
        .bind(...Object.values(v), now, id, input.version)
        .run();
    if (result.meta.changes !== 1)
      throw new EditorError(
        409,
        "This item changed on another device. Keep your text and reload the latest version.",
      );
  } else {
    const row = {
      id,
      ...(kind === "habits"
        ? {}
        : { slug: slugify(v.title) + "-" + id.slice(0, 8) }),
      ...v,
      created_at: now,
      updated_at: now,
    };
    await db
      .prepare(
        `INSERT INTO ${kind} (${Object.keys(row).join(",")}) VALUES (${Object.keys(
          row,
        )
          .map(() => "?")
          .join(",")})`,
      )
      .bind(...Object.values(row))
      .run();
  }
  return kind === "habits"
    ? decode(
        await db.prepare("SELECT * FROM habits WHERE id = ?").bind(id).first(),
      )
    : one(db, kind, id);
}
export async function observations(
  db: Database,
  id: string,
  publicOnly = false,
) {
  return (
    await db
      .prepare(
        `SELECT o.* FROM experiment_observations o JOIN experiments e ON e.id = o.experiment WHERE e.id = ? AND e.deleted_at IS NULL${publicOnly ? " AND e.visibility = 'public'" : ""} ORDER BY o.date, o.created_at`,
      )
      .bind(id)
      .all()
  ).results;
}
export async function addObservation(db: Database, input: any) {
  if (
    !uuidPattern.test(input?.experiment) ||
    typeof input.body !== "string" ||
    !input.body.trim() ||
    input.body.length > 100000
  )
    throw new EditorError(422, "Enter an observation.");
  if (!(await one(db, "experiments", input.experiment)))
    throw new EditorError(404, "Experiment not found.");
  const id = crypto.randomUUID();
  await db
    .prepare(
      "INSERT INTO experiment_observations(id,experiment,date,body,created_at) VALUES(?,?,?,?,?)",
    )
    .bind(
      id,
      input.experiment,
      day(input.date),
      input.body,
      new Date().toISOString(),
    )
    .run();
  return { id, saved: true };
}
export async function focus(db: Database, week: string) {
  day(week);
  const found = await db
    .prepare("SELECT * FROM weekly_focus WHERE week = ?")
    .bind(week)
    .first();
  return found
    ? { ...found, items: found.deleted_at ? [] : JSON.parse(found.items) }
    : { week, items: [], version: 0 };
}
export async function saveFocus(db: Database, input: any) {
  day(input.week);
  if (
    !Array.isArray(input.items) ||
    input.items.some((s: any) => typeof s !== "string" || s.length > 1000) ||
    input.items.length > 200
  )
    throw new EditorError(422, "Check the focus list.");
  const result =
    input.version === 0
      ? await db
          .prepare(
            "INSERT OR IGNORE INTO weekly_focus(week,items,updated_at) VALUES(?,?,?)",
          )
          .bind(
            input.week,
            JSON.stringify(input.items),
            new Date().toISOString(),
          )
          .run()
      : await db
          .prepare(
            "UPDATE weekly_focus SET items = ?, deleted_at = NULL, updated_at = ?, version = version + 1 WHERE week = ? AND version = ?",
          )
          .bind(
            JSON.stringify(input.items),
            new Date().toISOString(),
            input.week,
            input.version,
          )
          .run();
  if (result.meta.changes !== 1)
    throw new EditorError(
      409,
      "Weekly focus changed elsewhere. Reload it before saving.",
    );
  return focus(db, input.week);
}
export async function habitEntry(db: Database, input: any) {
  if (!uuidPattern.test(input?.habit) || typeof input.done !== "boolean")
    throw new EditorError(422, "Invalid habit entry.");
  day(input.date);
  if (
    !(await db
      .prepare("SELECT id FROM habits WHERE id = ?")
      .bind(input.habit)
      .first())
  )
    throw new EditorError(404, "Habit not found.");
  if (input.done)
    await db
      .prepare(
        "INSERT INTO habit_entries(habit,date,quantity,updated_at) VALUES(?,?,?,?) ON CONFLICT(habit,date) DO UPDATE SET quantity = excluded.quantity, updated_at = excluded.updated_at",
      )
      .bind(
        input.habit,
        input.date,
        String(input.quantity || "").slice(0, 100),
        new Date().toISOString(),
      )
      .run();
  else
    await db
      .prepare("DELETE FROM habit_entries WHERE habit = ? AND date = ?")
      .bind(input.habit, input.date)
      .run();
  return { saved: true };
}
export async function privateSnapshot(db: Database, week: string) {
  const [projects, experiments, sprints, habits, weekly, entries] =
    await Promise.all([
      list(db, "projects"),
      list(db, "experiments"),
      list(db, "sprints"),
      list(db, "habits"),
      focus(db, week),
      db
        .prepare(
          "SELECT * FROM habit_entries WHERE date >= ? AND date < date(?, '+7 days')",
        )
        .bind(day(week), week)
        .all(),
    ]);
  return {
    projects,
    experiments,
    sprints,
    habits,
    focus: weekly,
    entries: entries.results,
  };
}

export async function removeRecord(db: Database, kind: RecordKind, input: any) {
  if (
    !["projects", "experiments"].includes(kind) ||
    !uuidPattern.test(input?.id) ||
    !Number.isInteger(input.version)
  )
    throw new EditorError(422, "Choose a saved Project or Experiment.");
  const result = await db
    .prepare(
      `UPDATE ${kind} SET deleted_at = ?, version = version + 1 WHERE id = ? AND version = ? AND deleted_at IS NULL`,
    )
    .bind(new Date().toISOString(), input.id, input.version)
    .run();
  if (result.meta.changes !== 1)
    throw new EditorError(
      409,
      "This item changed elsewhere. Reopen it before deleting.",
    );
  return { deleted: true };
}
export async function focusHistory(db: Database, before: string, limit = 5) {
  day(before);
  const rows = await db
    .prepare(
      "SELECT * FROM weekly_focus WHERE week < ? AND deleted_at IS NULL AND items <> '[]' ORDER BY week DESC LIMIT ?",
    )
    .bind(before, Math.min(20, Math.max(1, limit)) + 1)
    .all();
  return {
    items: rows.results
      .slice(0, limit)
      .map((r) => ({ ...r, items: JSON.parse(r.items) })),
    more: rows.results.length > limit,
  };
}
export async function saveOneFocus(db: Database, input: any) {
  if (
    typeof input.text !== "string" ||
    input.text.length > 1000 ||
    /[\r\n]/.test(input.text)
  )
    throw new EditorError(422, "Use one short focus line.");
  if (new Date(day(input.week) + "T12:00:00Z").getUTCDay() !== 1)
    throw new EditorError(422, "Choose an ISO week beginning on Monday.");
  const result = await saveFocus(db, {
    ...input,
    items: input.text.trim() ? [input.text.trim()] : [],
  });
  return result;
}
export async function removeFocus(db: Database, input: any) {
  const result = await db
    .prepare(
      "UPDATE weekly_focus SET deleted_at = ?, version = version + 1 WHERE week = ? AND version = ? AND deleted_at IS NULL",
    )
    .bind(new Date().toISOString(), day(input.week), input.version)
    .run();
  if (result.meta.changes !== 1)
    throw new EditorError(
      409,
      "Weekly focus changed elsewhere. Reopen it before deleting.",
    );
  return { deleted: true };
}
export async function notebookSnapshot(db: Database, week: string) {
  const [projects, experiments, weekly] = await Promise.all([
    list(db, "projects"),
    list(db, "experiments"),
    focus(db, week),
  ]);
  return { projects, experiments, focus: weekly };
}
