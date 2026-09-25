import type { APIRoute } from "astro";
import {
  authenticate,
  input,
  privateHeaders,
  failure,
} from "../../../server/guard";
import { EditorError } from "../../../server/errors";
import {
  settings,
  connect,
  oauthCallback,
  disconnect,
  saveSettings,
  events,
  writeEvent,
} from "../../../lib/calendar/google";
export const prerender = false;
export const ALL: APIRoute = async ({ request, params, locals }) => {
  try {
    const env = locals.runtime?.env as any,
      action = params.action,
      u = new URL(request.url);
    if (!["GET", "POST"].includes(request.method))
      throw new EditorError(405, "Method not allowed.");
    await authenticate(request, env, request.method === "POST");
    if (request.method === "GET") {
      if (action === "connect") return connect(env);
      if (action === "callback") return oauthCallback(request, env);
      if (action === "settings")
        return Response.json(await settings(env), { headers: privateHeaders });
      if (action === "events")
        return Response.json(
          await events(
            env,
            u.searchParams.get("start") || "",
            u.searchParams.get("end") || "",
          ),
          { headers: privateHeaders },
        );
    } else {
      const value = await input(request);
      let result: any;
      if (action === "disconnect") result = await disconnect(env);
      else if (action === "settings") result = await saveSettings(env, value);
      else if (action === "event") result = await writeEvent(env, value);
      else throw new EditorError(404, "Not found.");
      return Response.json(result, { headers: privateHeaders });
    }
    throw new EditorError(404, "Not found.");
  } catch (e) {
    return failure(e);
  }
};
