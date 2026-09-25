import {
  one,
  database,
  type DataEnvironment,
  type Database,
} from "../lib/data/store";
import { readDraft, saveDraft } from "../lib/data/drafts";
import { blankFields, type Editable } from "../utils/editor-model";
import { EditorError } from "./errors";
import {
  handleContent,
  snapshot,
  readFile,
  commit,
  pick,
  type Git,
} from "./content";
import { uuidPattern } from "./documents";

interface NotebookEnvironment extends DataEnvironment {
  ASSETS?: { fetch(request: Request): Promise<Response> };
}
async function deployedJson(
  path: string,
  commit: string,
  env: NotebookEnvironment,
  fetcher: typeof fetch,
) {
  try {
    const request = new Request(
      "https://deepaltitude.com/" + path + "?verify=" + commit,
      { signal: AbortSignal.timeout(15000) },
    );
    // Read this deployed Worker's assets directly: an outbound request to our
    // own domain can be rejected before it ever reaches the public manifest.
    const response = env.ASSETS
      ? await env.ASSETS.fetch(request)
      : await fetcher(request);
    if (!response.ok) throw Error();
    return await response.json();
  } catch {
    throw new EditorError(
      503,
      "The live deployment could not be checked. Your saved copy is safe; try again shortly.",
    );
  }
}

const privateId = (file: unknown) =>
  typeof file === "string" &&
  file.startsWith("draft:") &&
  uuidPattern.test(file.slice(6))
    ? file.slice(6)
    : null;
async function stored(db: Database, file: string) {
  const id = privateId(file);
  if (!id) throw new EditorError(422, "Choose a saved item.");
  const { document, version } = await readDraft(db, id);
  return { ...document, draftFile: file, draftSha: String(version) };
}
async function alias(db: Database, file: string) {
  const row = await db
    .prepare(
      "SELECT id FROM content_drafts WHERE json_extract(document, '$.file') = ? AND COALESCE(json_extract(document, '$.deleted'), 0) = 0 ORDER BY updated_at DESC LIMIT 1",
    )
    .bind(file)
    .first();
  return row ? stored(db, "draft:" + row.id) : null;
}
function revision(document: Editable, saved: Editable) {
  if (
    document.key !== saved.key ||
    document.draftSha !== saved.draftSha ||
    document.file !== saved.file
  )
    throw new EditorError(
      409,
      "This item changed elsewhere. Your text is still here; reopen the latest version before saving.",
    );
}
async function privatePrinciples(db: Database, document: Editable) {
  const refs = new Map<string, string>();
  for (const p of document.newPrinciples) {
    if (!document.principles.includes(p.id)) continue;
    // Reuse a previously saved private principle after an interrupted Note save.
    const found = await db
      .prepare(
        "SELECT id FROM content_drafts WHERE json_extract(document, '$.kind') = 'principle' AND json_extract(document, '$.principleId') = ? AND COALESCE(json_extract(document, '$.deleted'), 0) = 0 LIMIT 1",
      )
      .bind(p.id)
      .first();
    const key = found?.id || crypto.randomUUID();
    if (!found)
      await saveDraft(db, {
        ...blankFields(),
        kind: "principle",
        key,
        file: "",
        sha: null,
        url: "",
        title: p.title,
        description: p.description,
        attachments: [],
        newPrinciples: [],
        visibility: "private",
        principleId: p.id,
      });
    refs.set(p.id, "draft:" + key);
  }
  return {
    ...document,
    principles: document.principles.map((ref) => refs.get(ref) || ref),
    newPrinciples: [],
  };
}
async function publicReferences(db: Database, document: Editable) {
  const visible: string[] = [],
    hidden: string[] = [];
  for (const ref of document.principles) {
    if (!privateId(ref)) {
      visible.push(ref);
      continue;
    }
    const related = await stored(db, ref);
    if (related.kind !== "principle")
      throw new EditorError(422, "Choose a principle.");
    if (related.visibility === "public" && !related.pending)
      visible.push(related.file);
    else hidden.push(ref);
  }
  return { visible, hidden };
}

// Normal inline and advanced editing share these transitions. D1 is a private
// safety copy until the deployed public manifest confirms the Git operation.
export async function handleNotebook(
  action: string,
  request: Request,
  input: any,
  git: Git,
  env: NotebookEnvironment,
  fetcher: typeof fetch = fetch,
) {
  const url = new URL(request.url);
  if (action === "note") {
    const file = url.searchParams.get("file") || "";
    if (privateId(file)) return stored(database(env), file);
    let saved: Editable | null = null;
    if (file && env.DB) saved = await alias(env.DB, file);
    if (saved && saved.visibility !== "public") return saved;
    const doc = (await handleContent(
      "document",
      request,
      null,
      git,
      env,
    )) as Editable;
    return {
      ...doc,
      visibility: doc.file ? "public" : "private",
      ...(saved
        ? {
            key: saved.key,
            draftFile: saved.draftFile,
            draftSha: saved.draftSha,
            principles: [
              ...new Set([
                ...doc.principles,
                ...(saved.privatePrinciples || []),
              ]),
            ],
            privatePrinciples: saved.privatePrinciples,
            ...saved.privateRelations,
          }
        : {}),
    };
  }
  const db = database(env);
  if (action === "settle-note") {
    const doc = await stored(db, input?.file);
    if (doc.draftSha !== input.version)
      throw new EditorError(
        409,
        "This item changed elsewhere. Reopen its latest version.",
      );
    if (!doc.pending) return { saved: true, document: doc };
    let manifest: Record<string, string>;
    try {
      manifest = (await deployedJson(
        "publication.json",
        doc.pending.commit,
        env,
        fetcher,
      )) as Record<string, string>;
      if (
        !manifest ||
        typeof manifest !== "object" ||
        Array.isArray(manifest) ||
        !manifest["src/content/pages/home.md"]
      )
        throw Error();
    } catch {
      throw new EditorError(
        503,
        "The live deployment could not be checked. Your saved copy is safe; try again shortly.",
      );
    }
    const pending = doc.pending;
    let verified =
      pending.direction === "public"
        ? manifest[pending.file] === pending.revision
        : false;
    if (pending.direction !== "public" && !(pending.file in manifest)) {
      const marker: any = await deployedJson(
        "visibility-revision.json",
        pending.commit,
        env,
        fetcher,
      );
      verified =
        Number.isSafeInteger(marker?.sequence) &&
        marker.sequence >= (pending.sequence || 1);
    }
    if (!verified) return { saved: true, pending: true, document: doc };
    delete doc.pending;
    if (pending.direction === "public") {
      doc.visibility = "public";
      doc.attachments = [];
      delete doc.originalRaw;
    } else {
      doc.visibility = "private";
      doc.sha = null;
      doc.url = "";
      if (pending.direction === "delete") doc.deleted = true;
    }
    const saved = await saveDraft(db, doc);
    return { saved: true, deleted: !!doc.deleted, document: saved };
  }
  let document = pick(input?.document);
  if (!["article", "principle", "home", "about"].includes(document.kind))
    throw new EditorError(403, "Choose a notebook item.");
  const visibility = input?.visibility;
  if (!["private", "public"].includes(visibility))
    throw new EditorError(422, "Choose Private or Public.");
  if (["home", "about"].includes(document.kind)) {
    if (action !== "save-note" || visibility !== "public")
      throw new EditorError(403, "Homepage and About remain public.");
    return handleContent("publish", request, document, git, env);
  }
  let saved: Editable | null = null;
  if (document.draftFile) {
    saved = await stored(db, document.draftFile);
    revision(document, saved);
    if (saved.pending)
      throw new EditorError(
        409,
        "The last visibility change is still being deployed. Check its saved state before making another change.",
      );
  }
  const snap =
    visibility === "public" || (document.file && document.sha)
      ? await snapshot(git)
      : { head: "", tree: "", files: new Map() };
  const publicFile = document.file && snap.files.get(document.file);
  if (publicFile && publicFile.sha !== document.sha)
    throw new EditorError(
      409,
      "The public version changed elsewhere. Your text is still here; reopen it before saving.",
    );
  if (action === "delete-note" && input.confirm !== true)
    throw new EditorError(422, "Confirm deletion first.");
  if (
    publicFile &&
    (visibility === "private" || action === "delete-note") &&
    input.confirm !== true
  )
    throw new EditorError(
      422,
      "Confirm removal from the public site first. Previously published revisions remain in GitHub history.",
    );
  const originalRaw = publicFile
    ? (await readFile(document.file, snap, git)).raw
    : saved?.originalRaw;
  document = {
    ...document,
    visibility: "private",
    ...(originalRaw ? { originalRaw } : {}),
    ...(saved?.principleId ? { principleId: saved.principleId } : {}),
  };
  if (action !== "delete-note")
    document = await privatePrinciples(db, document);
  if (!publicFile) document.sha = null;
  if (!document.file && document.kind === "principle" && document.principleId)
    document.file = "src/content/principles/" + document.principleId + ".md";
  document = await saveDraft(db, document);
  if (action === "delete-note" || visibility === "private") {
    if (publicFile) {
      // Verify the durable private copy before deleting the Git representation.
      const backup = await stored(db, document.draftFile!);
      if (backup.body !== document.body || backup.originalRaw !== originalRaw)
        throw new EditorError(
          503,
          "The private copy could not be verified. The public item was kept.",
        );
      const markerPath = "public/visibility-revision.json";
      const previousMarker = snap.files.has(markerPath)
        ? JSON.parse((await readFile(markerPath, snap, git)).raw)
        : { sequence: 0 };
      const sequence = Number(previousMarker.sequence) + 1;
      if (!Number.isSafeInteger(sequence) || sequence < 1)
        throw new EditorError(
          503,
          "The publication marker could not be read safely.",
        );
      const commitSha = await commit(
        [
          { path: document.file, mode: "100644", type: "blob", sha: null },
          {
            path: markerPath,
            mode: "100644",
            type: "blob",
            content: JSON.stringify({ sequence }) + "\n",
          },
        ],
        snap,
        git,
        "Remove public notebook item",
      );
      document.pending = {
        direction: action === "delete-note" ? "delete" : "private",
        file: document.file,
        commit: commitSha,
        sequence,
      };
      document = await saveDraft(db, document);
      return { saved: true, pending: true, document };
    }
    if (action === "delete-note") {
      document.deleted = true;
      document = await saveDraft(db, document);
    }
    document.sha = null;
    document.url = "";
    return { saved: true, deleted: !!document.deleted, document };
  }
  if (action !== "save-note") throw new EditorError(404, "Not found.");
  const refs = await publicReferences(db, document);
  const publishing = { ...document, principles: refs.visible };
  const privateRelations: Editable["privateRelations"] = {};
  for (const [field, kind] of [
    ["project", "projects"],
    ["experiment", "experiments"],
    ["sprint", "sprints"],
  ] as const) {
    if (document[field] && !(await one(db, kind, document[field], true))) {
      privateRelations[field] = document[field];
      publishing[field] = "";
    }
  }
  // Retain the original public path and raw metadata through a private interval.
  if (
    !publishing.file &&
    publishing.kind === "principle" &&
    document.principleId
  )
    publishing.file = "src/content/principles/" + document.principleId + ".md";
  const result = (await handleContent(
    "publish",
    request,
    publishing,
    git,
    env,
    {
      snapshot: snap,
      retainPrivate: true,
      originalRaw: publicFile ? undefined : originalRaw,
    },
  )) as any;
  document = {
    ...result.document,
    draftFile: document.draftFile,
    draftSha: document.draftSha,
    visibility: "private",
    originalRaw,
    principles: [...result.document.principles, ...refs.hidden],
    privatePrinciples: refs.hidden,
    privateRelations,
    ...privateRelations,
    attachments: document.attachments,
    pending: {
      direction: "public",
      file: result.document.file,
      revision: result.revision,
      commit: result.commit,
    },
  };
  document = await saveDraft(db, document);
  return { saved: true, pending: true, document };
}
