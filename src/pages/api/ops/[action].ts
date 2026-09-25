import type { APIRoute } from "astro";
import {
  authenticate,
  input,
  failure,
  privateHeaders,
} from "../../../server/guard";
import { EditorError } from "../../../server/errors";
import {
  database,
  kinds,
  list,
  one,
  save,
  observations,
  addObservation,
  focus,
  saveFocus,
  habitEntry,
  privateSnapshot,
  type RecordKind,
} from "../../../lib/data/store";
export const prerender = false;
export const ALL: APIRoute = async ({ request, params, locals }) => {
  try {
    const env = locals.runtime?.env as any;
    await authenticate(request, env, request.method !== "GET");
    const db = database(env),
      u = new URL(request.url),
      action = params.action;
    if (!["GET", "POST"].includes(request.method))
      throw new EditorError(405, "Method not allowed.");
    let result: any;
    const kind = u.searchParams.get("kind") as RecordKind;
    if (request.method === "GET") {
      if (action === "snapshot")
        result = await privateSnapshot(db, u.searchParams.get("week") || "");
      else if (action === "list" && kinds.includes(kind))
        result = await list(db, kind);
      else if (action === "record" && kinds.includes(kind)) {
        result = await one(db, kind, u.searchParams.get("id") || "");
        if (!result) throw new EditorError(404, "Item not found.");
      } else if (action === "observations")
        result = await observations(db, u.searchParams.get("id") || "");
      else if (action === "focus")
        result = await focus(db, u.searchParams.get("week") || "");
      else throw new EditorError(404, "Not found.");
    } else {
      const body = await input(request);
      if (action === "save" && kinds.includes(body.kind))
        result = await save(db, body.kind, body.record);
      else if (action === "observation")
        result = await addObservation(db, body);
      else if (action === "focus") result = await saveFocus(db, body);
      else if (action === "habit") result = await habitEntry(db, body);
      else if (action === "start") {
        const record = await one(db, "experiments", body.id);
        if (!record) throw new EditorError(404, "Experiment not found.");
        if (record.version !== body.version)
          throw new EditorError(
            409,
            "This experiment changed. Reload it first.",
          );
        result = await save(db, "experiments", {
          ...record,
          status: "active",
          start_date: body.date || new Date().toISOString().slice(0, 10),
        });
      } else throw new EditorError(404, "Not found.");
    }
    return Response.json(result, { headers: privateHeaders });
  } catch (e) {
    return failure(e);
  }
};
