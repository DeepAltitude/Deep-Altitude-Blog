import type { Database } from "./store";
import type { Editable } from "../../utils/editor-model";
import { EditorError } from "../../server/errors";
// Keep each D1 row below its 2 MB limit; phone images stay private until publish.
export async function readDraft(db: Database, id: string) {
  const row = await db
    .prepare("SELECT document,version FROM content_drafts WHERE id = ?")
    .bind(id)
    .first();
  if (!row) throw new EditorError(404, "Draft not found.");
  const document = JSON.parse(row.document) as Editable;
  const parts = (
    await db
      .prepare(
        "SELECT image_id,part,data FROM draft_media WHERE draft_id = ? ORDER BY image_id,part",
      )
      .bind(id)
      .all()
  ).results;
  for (const image of document.attachments) {
    image.data = parts
      .filter((p) => p.image_id === image.id)
      .map((p) => p.data)
      .join("");
  }
  return { document, version: row.version };
}
export async function saveDraft(db: Database, document: Editable) {
  const id = document.draftFile?.slice(6) || document.key,
    nonce = crypto.randomUUID(),
    now = new Date().toISOString();
  const metadata = JSON.stringify({
    ...document,
    attachments: document.attachments.map((image) => ({ ...image, data: "" })),
  });
  if (new TextEncoder().encode(metadata).length > 1800000)
    throw new EditorError(
      413,
      "This draft is too large. Download it before reducing its size.",
    );
  const statements = [
    document.draftFile
      ? db
          .prepare(
            "UPDATE content_drafts SET document = ?, save_token = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?",
          )
          .bind(metadata, nonce, now, id, Number(document.draftSha))
      : db
          .prepare(
            "INSERT OR IGNORE INTO content_drafts(id,document,save_token,updated_at) VALUES(?,?,?,?)",
          )
          .bind(id, metadata, nonce, now),
  ];
  // A stale write must not touch images. All mutations share a per-save nonce and
  // execute atomically in one D1 batch, including the optimistic version update.
  statements.push(
    db
      .prepare(
        "DELETE FROM draft_media WHERE draft_id = ? AND EXISTS(SELECT 1 FROM content_drafts WHERE id = ? AND save_token = ?)",
      )
      .bind(id, id, nonce),
  );
  for (const image of document.attachments)
    for (
      let offset = 0, part = 0;
      offset < image.data.length;
      offset += 512000, part++
    )
      statements.push(
        db
          .prepare(
            "INSERT INTO draft_media(draft_id,image_id,part,data) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM content_drafts WHERE id = ? AND save_token = ?)",
          )
          .bind(
            id,
            image.id,
            part,
            image.data.slice(offset, offset + 512000),
            id,
            nonce,
          ),
      );
  const results = await db.batch(statements);
  if (results[0].meta.changes !== 1)
    throw new EditorError(
      409,
      "This draft changed elsewhere. Reload before saving.",
    );
  return {
    ...document,
    draftFile: "draft:" + id,
    draftSha: String(Number(document.draftSha || 0) + 1),
  };
}
