import { parseDocument, stringify } from "yaml";
import { asDomain, topicFor } from "../utils/domains";
import { blankFields, type Fields, type Kind } from "../utils/editor-model";
import { EditorError } from "./errors";
export const encoder = new TextEncoder();
export const MAX_BYTES = 1024 * 1024;
export const uuidPattern =
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export function isOriginalPath(path: unknown): path is string {
  if (
    typeof path !== "string" ||
    path.length > 240 ||
    /[\\\x00-\x1f\x7f]/.test(path)
  )
    return false;
  const match = path.match(/^src\/content\/(articles)\/([^/]+)\.md$/);
  return (
    !!match &&
    !match[2].startsWith(".") &&
    !["about", "about-en", "home", "markdown-style-guide"].includes(match[2])
  );
}
export function kindOf(path: unknown): Kind | null {
  if (isOriginalPath(path)) return "article";
  if (path === "src/content/pages/home.md") return "home";
  if (path === "src/content/pages/about.md") return "about";
  if (
    typeof path === "string" &&
    /^src\/content\/principles\/[a-z0-9][a-z0-9-]{0,180}\.md$/.test(path)
  )
    return "principle";
  return null;
}
export function splitOriginal(raw: string) {
  const match = raw.match(
    /^(\uFEFF?---[ \t]*\r?\n)([\s\S]*?)(\r?\n---[ \t]*(?:\r?\n|$))([\s\S]*)$/,
  );
  if (!match)
    throw new EditorError(
      422,
      "This document has no supported metadata header.",
    );
  const document = parseDocument(match[2]);
  if (
    document.errors.length ||
    !document.contents ||
    !document.toJSON() ||
    typeof document.toJSON() !== "object" ||
    Array.isArray(document.toJSON())
  )
    throw new EditorError(
      422,
      "The metadata cannot be read safely. No changes were made.",
    );
  const title = document.get("title"),
    description = document.get("description");
  if (typeof title !== "string")
    throw new EditorError(422, "This document has no valid title.");
  return {
    open: match[1],
    metadata: match[2],
    close: match[3],
    body: match[4],
    document,
    title,
    description: typeof description === "string" ? description : "",
  };
}
export const normalizeLines = (value: string) => value.replace(/\r\n?/g, "\n");
export function dateValue(value: unknown): string {
  if (value == null || value === "") return "";
  const date = new Date(
    String(value)
      .trim()
      .replace(/^(\d{4})\.(\d{2})\.(\d{2})$/, "$1-$2-$3"),
  );
  return Number.isFinite(date.valueOf()) ? date.toISOString().slice(0, 10) : "";
}
export function fieldsOf(raw: string): Fields {
  const s = splitOriginal(raw),
    data = s.document.toJSON();
  return {
    ...blankFields(),
    title: s.title,
    description: s.description,
    body: normalizeLines(s.body),
    domain: asDomain(data.domain) || "",
    topic: data.topic || "",
    principles: data.principles || [],
    tags: data.tags || [],
    pubDate: dateValue(data.pubDate),
    updatedDate: dateValue(data.updatedDate),
    heroImage: data.heroImage || "",
    heroImageAlt: data.heroImageAlt || "",
    introTitle: data.introTitle || "",
    project: data.project || "",
    experiment: data.experiment || "",
    sprint: data.sprint || "",
  };
}
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
export function validateFields(
  input: Partial<Fields>,
  kind: Kind,
  complete = false,
): void {
  if (
    typeof input.title !== "string" ||
    !input.title.trim() ||
    input.title.length > 500 ||
    typeof input.description !== "string" ||
    input.description.length > 5000 ||
    typeof input.body !== "string" ||
    encoder.encode(input.body).length > MAX_BYTES
  )
    throw new EditorError(
      422,
      "Enter a title and keep the article under 1 MB.",
    );
  if (complete && kind === "article" && !input.body.trim())
    throw new EditorError(422, "Enter the article text before publishing.");
  if (
    (input.domain && !asDomain(input.domain)) ||
    (input.topic &&
      (!input.domain || !topicFor(input.domain as any, input.topic)))
  )
    throw new EditorError(422, "Choose a valid domain and topic.");
  for (const field of ["principles", "tags"] as const)
    if (
      field in input &&
      (!Array.isArray(input[field]) ||
        input[field]!.length > 50 ||
        input[field]!.some(
          (v) => typeof v !== "string" || !v.trim() || v.length > 240,
        ))
    )
      throw new EditorError(
        422,
        "Use up to 50 short tags or principle references.",
      );
  for (const field of ["pubDate", "updatedDate"] as const)
    if (input[field] && !/^\d{4}-\d{2}-\d{2}$/.test(input[field]!))
      throw new EditorError(422, "Use a valid date.");
  for (const field of ["pubDate", "updatedDate"] as const)
    if (input[field] && dateValue(input[field]) !== input[field])
      throw new EditorError(422, "Use a valid date.");
  if (kind === "article" && complete && !input.pubDate)
    throw new EditorError(422, "Choose a publication date.");
  for (const field of [
    "heroImage",
    "heroImageAlt",
    "introTitle",
    "topic",
    "domain",
    "project",
    "experiment",
    "sprint",
  ] as const)
    if (
      field in input &&
      (typeof input[field] !== "string" || input[field]!.length > 1000)
    )
      throw new EditorError(422, "One of the fields is too long.");
  if (
    input.heroImage &&
    !/^\/(?!\/)[^\s\\]*$|^https:\/\//.test(input.heroImage)
  )
    throw new EditorError(
      422,
      "Use an uploaded image or an https image address.",
    );
}
// Mutate only deliberately changed fields. Untouched Markdown, CRLFs, unknown
// frontmatter and comments are retained; no-op saves return the original bytes.
export function updateOriginal(
  raw: string,
  input: Partial<Fields>,
  kind: Kind = "article",
) {
  validateFields(input, kind);
  const s = splitOriginal(raw),
    old = fieldsOf(raw),
    eol = raw.includes("\r\n") ? "\r\n" : "\n";
  const fields: (keyof Fields)[] = [
    "title",
    "description",
    ...(kind === "article"
      ? ([
          "domain",
          "topic",
          "principles",
          "tags",
          "pubDate",
          "updatedDate",
          "heroImage",
          "heroImageAlt",
          "project",
          "experiment",
          "sprint",
        ] as const)
      : kind === "home"
        ? (["introTitle"] as const)
        : []),
  ];
  let metadata = s.metadata,
    changed = false;
  for (const field of fields) {
    if (!(field in input) || same(old[field], input[field])) continue;
    const value = input[field];
    if (
      (value === "" || (Array.isArray(value) && !value.length)) &&
      !["title", "description"].includes(field)
    )
      s.document.delete(field);
    else s.document.set(field, value);
    changed = true;
  }
  const body =
    normalizeLines(input.body!) === normalizeLines(s.body)
      ? s.body
      : normalizeLines(input.body!).replaceAll("\n", eol);
  // A completed placeholder stops being a placeholder only when its author changes its body.
  if (body !== s.body && s.document.get("placeholder") === true) {
    s.document.delete("placeholder");
    changed = true;
  }
  if (changed)
    metadata = s.document
      .toString({ lineWidth: 0 })
      .replace(/\n$/, "")
      .replaceAll("\n", eol);
  const result = s.open + metadata + s.close + body;
  if (encoder.encode(result).length > MAX_BYTES)
    throw new EditorError(413, "This document is too large.");
  return result;
}
export function slugify(title: string) {
  return (
    title
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 100) || "note"
  );
}
export function newOriginal(fields: Fields, key: string, kind: Kind) {
  validateFields(fields, kind, true);
  const data: Record<string, unknown> = { title: fields.title };
  if (fields.description) data.description = fields.description;
  if (kind === "article") {
    Object.assign(data, {
      id: key,
      slug: slugify(fields.title) + "-" + key.slice(0, 8),
      pubDate: fields.pubDate,
      domain: fields.domain,
      topic: fields.topic,
    });
    for (const f of [
      "updatedDate",
      "heroImage",
      "heroImageAlt",
      "tags",
      "principles",
      "project",
      "experiment",
      "sprint",
    ] as const)
      if (fields[f]?.length) data[f] = fields[f];
  }
  return (
    "---\n" +
    stringify(data, { lineWidth: 0 }) +
    "---\n" +
    normalizeLines(fields.body)
  );
}
export function documentUrl(path: string, raw: string) {
  const kind = kindOf(path);
  if (kind === "home") return "/";
  if (kind === "about") return "/apie/";
  const data = splitOriginal(raw).document.toJSON(),
    filename = path.split("/").at(-1)!.replace(/\.md$/, "");
  if (kind === "principle") return "/principai/" + filename + "/";
  return (
    "/blog/" + (data.slug || filename.toLowerCase().replace(/\s+/g, "-")) + "/"
  );
}
