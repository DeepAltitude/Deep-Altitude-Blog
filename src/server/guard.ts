import { handleEditor, type EditorEnvironment } from "./editor";
import { EditorError } from "./errors";
export const privateHeaders = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
  "X-Robots-Tag": "noindex, nofollow",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};
export async function authenticate(
  request: Request,
  env: EditorEnvironment,
  write = false,
) {
  const response = await handleEditor(
    new Request(new URL("/api/editor/session", request.url), {
      headers: request.headers,
    }),
    "session",
    env,
  );
  const session = (await response.json()) as any;
  if (!response.ok || !session.authenticated)
    throw new EditorError(401, session.error || "Sign in to DeepAltitude.");
  if (
    write &&
    (request.headers.get("Origin") !== new URL(request.url).origin ||
      request.headers.get("Sec-Fetch-Site") === "cross-site" ||
      request.headers.get("X-Editor-CSRF") !== session.csrf)
  )
    throw new EditorError(
      403,
      "The session changed. Sign in again before saving.",
    );
  return session;
}
export async function input(request: Request, limit = 1048576) {
  if (!request.headers.get("Content-Type")?.startsWith("application/json"))
    throw new EditorError(415, "Expected JSON.");
  const reader = request.body?.getReader();
  if (!reader) throw new EditorError(400, "Empty request.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new EditorError(413, "Request too large.");
    }
    chunks.push(value);
  }
  const b = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    b.set(c, at);
    at += c.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(b));
  } catch {
    throw new EditorError(400, "Invalid request.");
  }
}
export function failure(error: unknown) {
  return Response.json(
    {
      error:
        error instanceof EditorError
          ? error.message
          : "The service is unavailable. Your unsaved changes are still here.",
    },
    {
      status: error instanceof EditorError ? error.status : 503,
      headers: privateHeaders,
    },
  );
}
