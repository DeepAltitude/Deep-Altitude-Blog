import type { APIRoute } from "astro";
import { handleEditor, type EditorEnvironment } from "../../../server/editor";

export const prerender = false;
export const ALL: APIRoute = ({ request, params, locals }) =>
  handleEditor(
    request,
    params.action ?? "",
    (locals.runtime?.env ?? {}) as EditorEnvironment,
  );
