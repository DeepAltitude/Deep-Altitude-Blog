import { readDraft, saveDraft } from "../lib/data/drafts";
import { database, type DataEnvironment } from "../lib/data/store";
import { stringify } from "yaml";
import { EditorError } from "./errors";
import {
  kindOf,
  fieldsOf,
  splitOriginal,
  updateOriginal,
  newOriginal,
  documentUrl,
  uuidPattern,
  validateFields,
  slugify,
  encoder,
  MAX_BYTES,
} from "./documents";
import {
  blankFields,
  type Editable,
  type CatalogPage,
  type CatalogItem,
  type Attachment,
  type NewPrinciple,
} from "../utils/editor-model";
export type Git = <T>(
  path: string,
  data?: unknown,
  method?: string,
) => Promise<T>;
export interface ContentEnvironment extends DataEnvironment {}
const repo = "/repos/DeepAltitude/Deep-Altitude-Blog";
const decoder = new TextDecoder("utf-8", { fatal: true });
const draftPath = (p: unknown): p is string =>
  typeof p === "string" &&
  p.startsWith("draft:") &&
  uuidPattern.test(p.slice(6));
const unb64 = (s: string) =>
  Uint8Array.from(atob(s.replace(/\s/g, "")), (c) => c.charCodeAt(0));
export const digest = async (raw: string) =>
  Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(raw))),
  )
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
interface TreeItem {
  path: string;
  sha: string;
  type: string;
}
export interface Snapshot {
  head: string;
  tree: string;
  files: Map<string, TreeItem>;
}
interface Change {
  path: string;
  mode: "100644";
  type: "blob";
  content?: string;
  sha?: string | null;
}
export async function snapshot(git: Git): Promise<Snapshot> {
  const ref = await git<{ object: { sha: string } }>(
    repo + "/git/ref/heads/main",
  );
  const commit = await git<{ tree: { sha: string } }>(
    repo + "/git/commits/" + ref.object.sha,
  );
  const tree = await git<{ tree: TreeItem[]; truncated: boolean }>(
    repo + "/git/trees/" + commit.tree.sha + "?recursive=1",
  );
  if (tree.truncated)
    throw new EditorError(
      503,
      "The repository index is too large. Use the fallback editor for now.",
    );
  return {
    head: ref.object.sha,
    tree: commit.tree.sha,
    files: new Map(
      tree.tree.filter((f) => f.type === "blob").map((f) => [f.path, f]),
    ),
  };
}
export async function readFile(
  file: string,
  snap: Snapshot,
  git: Git,
): Promise<{ raw: string; sha: string }> {
  const item = snap.files.get(file);
  if (!item)
    throw new EditorError(
      404,
      "This document no longer exists. Your unsaved text is still here.",
    );
  const result = await git<{ encoding: string; content: string; size: number }>(
    repo + "/git/blobs/" + item.sha,
  );
  if (result.encoding !== "base64" || result.size > 14 * MAX_BYTES)
    throw new EditorError(413, "This document is too large for the editor.");
  return { raw: decoder.decode(unb64(result.content)), sha: item.sha };
}
export async function commit(
  changes: Change[],
  snap: Snapshot,
  git: Git,
  message: string,
): Promise<string> {
  if (!changes.length) return snap.head;
  const tree = await git<{ sha: string }>(
    repo + "/git/trees",
    { base_tree: snap.tree, tree: changes },
    "POST",
  );
  const created = await git<{ sha: string }>(
    repo + "/git/commits",
    { message, tree: tree.sha, parents: [snap.head] },
    "POST",
  );
  // Never force: if the branch changes between reading and writing, keep the draft
  // and ask the author to reload. The source SHA is checked separately as well.
  await git(
    repo + "/git/refs/heads/main",
    { sha: created.sha, force: false },
    "PATCH",
  );
  return created.sha;
}
const change = (path: string, content: string): Change => ({
  path,
  content,
  mode: "100644",
  type: "blob",
});
export function pick(input: any): Editable {
  if (!input || !uuidPattern.test(input.key))
    throw new EditorError(
      422,
      "The editing document is invalid. Reload it without discarding your text.",
    );
  const kind = input.file
    ? kindOf(input.file)
    : ["article", "principle"].includes(input.kind)
      ? input.kind
      : null;
  if (!kind || typeof input.file !== "string")
    throw new EditorError(403, "Only notebook content can be edited.");
  if (
    input.sha !== null &&
    (typeof input.sha !== "string" || !/^[a-f0-9]{40,64}$/.test(input.sha))
  )
    throw new EditorError(
      422,
      "The saved revision is missing. Reload the document.",
    );
  const fields: any = {};
  for (const key of Object.keys(blankFields())) fields[key] = input[key];
  validateFields(fields, kind);
  const newPrinciples: NewPrinciple[] = input.newPrinciples ?? [],
    attachments: Attachment[] = input.attachments ?? [];
  if (
    !Array.isArray(newPrinciples) ||
    newPrinciples.length > 20 ||
    newPrinciples.some(
      (p) =>
        !p ||
        !/^[-a-z0-9]{1,150}$/.test(p.id) ||
        typeof p.title !== "string" ||
        !p.title.trim() ||
        p.title.length > 500 ||
        typeof p.description !== "string" ||
        p.description.length > 5000,
    )
  )
    throw new EditorError(422, "A new principle is invalid.");
  validateAttachments(attachments);
  if (input.draftFile !== undefined && !draftPath(input.draftFile))
    throw new EditorError(403, "This is not an author document.");
  if (
    input.draftSha != null &&
    (typeof input.draftSha !== "string" || !/^\d+$/.test(input.draftSha))
  )
    throw new EditorError(422, "The saved revision is invalid.");
  if (kind !== "article" && (newPrinciples.length || attachments.length))
    throw new EditorError(
      422,
      "Add article images and principles from an article.",
    );
  return {
    ...fields,
    kind,
    file: input.file,
    sha: input.sha,
    url: "",
    key: input.key,
    draftFile: input.draftFile,
    draftSha: input.draftSha,
    newPrinciples,
    attachments,
  };
}
const imageKinds: Record<
  string,
  { ext: string; valid: (b: Uint8Array) => boolean }
> = {
  "image/jpeg": {
    ext: "jpg",
    valid: (b) => b[0] === 255 && b[1] === 216 && b[2] === 255,
  },
  "image/png": {
    ext: "png",
    valid: (b) => [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => b[i] === v),
  },
  "image/gif": {
    ext: "gif",
    valid: (b) => /^GIF8[79]a/.test(String.fromCharCode(...b.subarray(0, 6))),
  },
  "image/webp": {
    ext: "webp",
    valid: (b) =>
      String.fromCharCode(...b.subarray(0, 4)) === "RIFF" &&
      String.fromCharCode(...b.subarray(8, 12)) === "WEBP",
  },
  "image/avif": {
    ext: "avif",
    valid: (b) =>
      String.fromCharCode(...b.subarray(4, 8)) === "ftyp" &&
      ["avif", "avis"].includes(String.fromCharCode(...b.subarray(8, 12))),
  },
};
function validateAttachments(attachments: Attachment[]) {
  if (!Array.isArray(attachments) || attachments.length > 8)
    throw new EditorError(413, "Use up to eight images per save.");
  let total = 0;
  const paths = new Set();
  for (const image of attachments) {
    const kind = imageKinds[image?.mime];
    if (
      !kind ||
      !uuidPattern.test(image.id) ||
      image.path !== `/images/editor-${image.id}.${kind.ext}` ||
      typeof image.data !== "string" ||
      image.data.length > 6 * MAX_BYTES ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(image.data)
    )
      throw new EditorError(422, "Use a JPEG, PNG, GIF, WebP or AVIF image.");
    const bytes = unb64(image.data);
    total += bytes.length;
    if (
      bytes.length > 4 * MAX_BYTES ||
      !kind.valid(bytes) ||
      paths.has(image.path)
    )
      throw new EditorError(422, "An image is invalid or exceeds 4 MB.");
    paths.add(image.path);
  }
  if (total > 8 * MAX_BYTES)
    throw new EditorError(413, "Use up to 8 MB of images in one save.");
}
const metadataCache = new Map<
  string,
  Omit<CatalogItem, "file" | "sha" | "url">
>();
async function mapLimit<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const result: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(6, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        result[i] = await fn(items[i]);
      }
    }),
  );
  return result;
}
async function catalog(
  snap: Snapshot,
  git: Git,
  env: ContentEnvironment,
  cursor: string | null,
): Promise<CatalogPage> {
  let offset = 0;
  if (cursor !== null) {
    const parts = /^([a-f0-9]{40}):([1-9]\d{0,7})$/.exec(cursor);
    if (!parts)
      throw new EditorError(
        400,
        "The notebook page is invalid. Reload the editor.",
      );
    if (parts[1] !== snap.head)
      throw new EditorError(
        409,
        "The notebook changed while its index was loading. Reload the editor; your text stays in this tab.",
      );
    offset = Number(parts[2]);
  }
  const publicFiles = [...snap.files.values()]
    .filter((f) => ["article", "principle"].includes(kindOf(f.path) || ""))
    .sort((a, b) => a.path.localeCompare(b.path));
  // A cold isolate must stay under the Worker request limit, even with hundreds
  // of notes. Leave room for author verification, the Git snapshot and D1.
  const end = offset + 24;
  const items = await mapLimit(publicFiles.slice(offset, end), async (f) => {
    let meta = metadataCache.get(f.sha);
    if (!meta) {
      const { raw } = await readFile(f.path, snap, git),
        data = splitOriginal(raw).document.toJSON();
      meta = {
        kind: kindOf(f.path)!,
        title: data.title,
        description: data.description || "",
        domain: data.domain,
        topic: data.topic,
        pubDate: data.pubDate,
        principles: data.principles || [],
        project: data.project,
        experiment: data.experiment,
        id: f.path.split("/").at(-1)!.slice(0, -3),
        url: documentUrl(f.path, raw),
      } as any;
      if (metadataCache.size > 400) metadataCache.clear();
      metadataCache.set(f.sha, meta!);
    }
    return { ...meta, file: f.path, sha: f.sha } as CatalogItem;
  });
  let drafts: CatalogItem[] = [];
  const privateLinks: Record<string, any> = {};
  let warning: string | undefined;
  if (env.DB && offset === 0) {
    try {
      drafts = (
        await env.DB.prepare(
          "SELECT id, document, version FROM content_drafts ORDER BY updated_at DESC",
        ).all()
      ).results
        .filter((row: any) => {
          const d = JSON.parse(row.document);
          if (!d.deleted && d.visibility === "public" && d.file)
            privateLinks[d.file] = {
              principles: d.privatePrinciples || [],
              ...d.privateRelations,
            };
          return !d.deleted && d.visibility !== "public";
        })
        .map((row: any) => {
          const d = JSON.parse(row.document);
          return {
            kind: d.kind,
            file: "draft:" + row.id,
            sha: String(row.version),
            title: d.title || "Untitled note",
            url: "",
            domain: d.domain,
            topic: d.topic,
            pubDate: d.pubDate,
            description: d.description,
            visibility: "private",
            sourceFile: d.file,
            pending: d.pending,
            principles: d.principles || [],
            project: d.project,
            experiment: d.experiment,
          };
        });
    } catch {
      warning =
        "Private notes are temporarily unavailable. Your published writing can still be edited. Try opening private notes again later.";
    }
  }
  return {
    articles: items
      .filter((i) => i.kind === "article")
      .sort(
        (a, b) =>
          String(b.pubDate || "").localeCompare(String(a.pubDate || "")) ||
          a.title.localeCompare(b.title),
      ),
    principles: items
      .filter((i) => i.kind === "principle")
      .sort((a, b) => a.title.localeCompare(b.title)),
    drafts,
    privateLinks,
    ...(warning ? { warning } : {}),
    ...(end < publicFiles.length ? { next: `${snap.head}:${end}` } : {}),
  };
}
async function requireDraft(
  document: Editable,
  _snap: Snapshot,
  _git: Git,
  env: ContentEnvironment,
) {
  if (!document.draftFile) return;
  const stored = await database(env)
    .prepare("SELECT document,version FROM content_drafts WHERE id = ?")
    .bind(document.draftFile.slice(6))
    .first();
  if (!stored || String(stored.version) !== document.draftSha)
    throw new EditorError(
      409,
      "This item changed on another device. Your local text is still here.",
    );
  const content = JSON.parse(stored.document);
  if (content.key !== document.key || content.file !== document.file)
    throw new EditorError(409, "This saved copy belongs to another document.");
}
export async function handleContent(
  action: string,
  request: Request,
  input: any,
  git: Git,
  env: ContentEnvironment,
  options: {
    snapshot?: Snapshot;
    retainPrivate?: boolean;
    originalRaw?: string;
  } = {},
) {
  const url = new URL(request.url),
    snap = options.snapshot || (await snapshot(git));
  if (action === "catalog")
    return catalog(snap, git, env, url.searchParams.get("cursor"));
  if (action === "document") {
    const file = url.searchParams.get("file");
    if (!file) {
      const kind = url.searchParams.get("kind");
      if (kind !== "article" && kind !== "principle")
        throw new EditorError(403, "Choose a document to edit.");
      return {
        ...blankFields(),
        kind,
        file: "",
        sha: null,
        url: "",
        key: crypto.randomUUID(),
        newPrinciples: [],
        attachments: [],
      };
    }
    if (draftPath(file)) {
      const { document, version } = await readDraft(
        database(env),
        file.slice(6),
      );
      return { ...pick(document), draftFile: file, draftSha: String(version) };
    }
    const kind = kindOf(file);
    if (!kind)
      throw new EditorError(403, "Only notebook content can be edited.");
    const { raw, sha } = await readFile(file, snap, git);
    return {
      ...fieldsOf(raw),
      kind,
      file,
      sha,
      url: documentUrl(file, raw),
      key: crypto.randomUUID(),
      newPrinciples: [],
      attachments: [],
    };
  }
  const document = pick(input);
  if (action === "draft") {
    if (document.draftFile) await requireDraft(document, snap, git, env);
    return { saved: true, document: await saveDraft(database(env), document) };
  }
  if (action !== "publish") throw new EditorError(404, "Not found.");
  validateFields(document, document.kind, true);
  await requireDraft(document, snap, git, env);
  const isNew = !document.sha;
  let file =
    document.file ||
    (document.kind === "article"
      ? `src/content/articles/${document.key}.md`
      : `src/content/principles/${slugify(document.title)}-${document.key.slice(0, 8)}.md`);
  const previous = snap.files.get(file);
  let original: string | undefined = options.originalRaw;
  if (!isNew) {
    if (!previous || previous.sha !== document.sha)
      throw new EditorError(
        409,
        "This document changed elsewhere. Your text is still here. Load the latest saved version before publishing.",
      );
    original = (await readFile(file, snap, git)).raw;
  }
  const changes: Change[] = [];
  if (document.kind === "article") {
    const currentPrinciples = await catalogPrinciples(snap, git);
    const normalizedTitle = (s: string) =>
      s.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
    const mapping = new Map<string, string>();
    for (const principle of document.newPrinciples) {
      if (!document.principles.includes(principle.id)) continue;
      const same = currentPrinciples.find(
        (p) => normalizedTitle(p.title) === normalizedTitle(principle.title),
      );
      if (same) {
        mapping.set(principle.id, same.id!);
        continue;
      }
      const path = `src/content/principles/${principle.id}.md`;
      if (snap.files.has(path) || changes.some((c) => c.path === path))
        throw new EditorError(
          409,
          "A principle with that identifier already exists. Select the existing principle.",
        );
      changes.push(
        change(
          path,
          "---\n" +
            stringify(
              {
                title: principle.title,
                ...(principle.description
                  ? { description: principle.description }
                  : {}),
              },
              { lineWidth: 0 },
            ) +
            "---\n",
        ),
      );
      currentPrinciples.push({
        id: principle.id,
        title: principle.title,
      } as CatalogItem);
      mapping.set(principle.id, principle.id);
    }
    document.principles = document.principles.map(
      (ref) => mapping.get(ref) || ref,
    );
    if (
      document.principles.some(
        (ref) =>
          !currentPrinciples.some(
            (p) => p.id === ref || `src/content/principles/${p.id}.md` === ref,
          ),
      )
    )
      throw new EditorError(
        422,
        "One of the linked principles is missing. Choose an existing principle or create it here.",
      );
  }
  for (const image of document.attachments) {
    if (
      document.heroImage !== image.path &&
      !document.body.includes(image.path)
    )
      continue;
    const path = "public" + image.path;
    if (snap.files.has(path)) continue;
    const blob = await git<{ sha: string }>(
      repo + "/git/blobs",
      { content: image.data, encoding: "base64" },
      "POST",
    );
    changes.push({ path, sha: blob.sha, mode: "100644", type: "blob" });
  }
  const raw =
    original === undefined
      ? newOriginal(document, document.key, document.kind)
      : updateOriginal(original, document, document.kind);
  if (isNew && previous) {
    const saved = await readFile(file, snap, git);
    if (saved.raw !== raw)
      throw new EditorError(
        409,
        "This new article was already saved. Reload it before publishing changes.",
      );
    return {
      unchanged: true,
      document: {
        ...document,
        file,
        sha: saved.sha,
        url: documentUrl(file, raw),
        newPrinciples: [],
        attachments: [],
      },
      revision: await digest(raw),
      commit: snap.head,
    };
  }
  if (!previous || original !== raw) changes.push(change(file, raw));

  const commitSha = await commit(
    changes,
    snap,
    git,
    "Save notebook: " +
      document.title.replace(/[\r\n\x00-\x1f]/g, " ").slice(0, 100),
  );
  let warning: string | undefined;
  if (document.draftFile && !options.retainPrivate) {
    try {
      const removed = await database(env)
        .prepare("DELETE FROM content_drafts WHERE id = ? AND version = ?")
        .bind(document.draftFile.slice(6), Number(document.draftSha))
        .run();
      if (removed.meta.changes !== 1)
        warning =
          "A newer private copy was kept. This version is saved to GitHub.";
    } catch {
      // Git publication already succeeded. D1 housekeeping must not turn it into
      // a reported save failure or encourage a duplicate publication.
      warning =
        "This version is saved to GitHub. Private copy cleanup failed; its older copy is still available.";
    }
  }
  const bytes = encoder.encode(raw),
    prefix = encoder.encode(`blob ${bytes.length}\0`),
    joined = new Uint8Array(prefix.length + bytes.length);
  joined.set(prefix);
  joined.set(bytes, prefix.length);
  const blobSha = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-1", joined)),
  )
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
  return {
    unchanged: changes.length === 0,
    commit: commitSha,
    revision: await digest(raw),
    ...(warning ? { warning } : {}),
    document: {
      ...document,
      file,
      sha: blobSha,
      url: documentUrl(file, raw),
      draftFile: undefined,
      draftSha: undefined,
      newPrinciples: [],
      attachments: [],
    },
  };
}
async function catalogPrinciples(
  snap: Snapshot,
  git: Git,
): Promise<CatalogItem[]> {
  return mapLimit(
    [...snap.files.values()].filter((f) => kindOf(f.path) === "principle"),
    async (f) => {
      const { raw } = await readFile(f.path, snap, git);
      return {
        kind: "principle",
        file: f.path,
        sha: f.sha,
        id: f.path.split("/").at(-1)!.slice(0, -3),
        title: splitOriginal(raw).title,
        url: documentUrl(f.path, raw),
      };
    },
  );
}
