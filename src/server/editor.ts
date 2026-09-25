import { handleNotebook } from "./notebook";
import type { DataEnvironment } from "../lib/data/store";
import { EditorError } from "./errors";
import {
  isOriginalPath,
  splitOriginal,
  updateOriginal,
  normalizeLines,
} from "./documents";
import { handleContent } from "./content";
export {
  isOriginalPath,
  splitOriginal,
  updateOriginal,
  normalizeLines,
} from "./documents";

// Single-author identity, fixed repository, encrypted session and CSRF checks.
const REPOSITORY = "DeepAltitude/Deep-Altitude-Blog";
const REPOSITORY_ID = 1317330542;
const AUTHOR_ID = 311059981;
const ORIGIN = "https://deepaltitude.com";
const CALLBACK = `${ORIGIN}/api/editor/callback`;
const SESSION = "__Host-deepaltitude-editor";
const OAUTH = "__Host-deepaltitude-oauth";
const MAX_BYTES = 1024 * 1024;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
export interface EditorEnvironment extends DataEnvironment {
  DEEPALTITUDE_EDITOR_CLIENT_ID?: string;
  DEEPALTITUDE_EDITOR_CLIENT_SECRET?: string;
}
interface Session {
  token: string;
  login: string;
  csrf: string;
  expires: number;
}
interface OAuthState {
  state: string;
  verifier: string;
  returnTo: string;
  expires: number;
}
type GithubFile = {
  type: string;
  path: string;
  encoding: string;
  content: string;
  sha: string;
  size: number;
};
const headers = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
};
function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers });
}
function redirect(path: string) {
  return new Response(null, {
    status: 303,
    headers: { ...headers, Location: path },
  });
}
function cookie(
  response: Response,
  name: string,
  value: string,
  maxAge: number,
) {
  response.headers.append(
    "Set-Cookie",
    `${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`,
  );
  return response;
}
function readCookie(request: Request, name: string) {
  return (request.headers.get("Cookie") ?? "")
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(name + "="))
    ?.slice(name.length + 1);
}
function base64(bytes: Uint8Array) {
  let value = "";
  for (let i = 0; i < bytes.length; i += 8192)
    value += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(value);
}
function unbase64(value: string) {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}
function base64url(bytes: Uint8Array) {
  return base64(bytes)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}
function unbase64url(value: string) {
  return unbase64(value.replaceAll("-", "+").replaceAll("_", "/"));
}
function random() {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}
async function key(secret: string) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode("deepaltitude-editor-v1:" + secret),
  );
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}
async function seal(value: unknown, secret: string, purpose: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(purpose) },
    await key(secret),
    encoder.encode(JSON.stringify(value)),
  );
  return base64url(iv) + "." + base64url(new Uint8Array(encrypted));
}
async function unseal<T extends { expires: number }>(
  value: string | undefined,
  secret: string,
  purpose: string,
): Promise<T | null> {
  if (!value || value.length > 3800) return null;
  try {
    const [iv, data] = value.split(".");
    const bytes = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: unbase64url(iv),
        additionalData: encoder.encode(purpose),
      },
      await key(secret),
      unbase64url(data),
    );
    const result = JSON.parse(decoder.decode(bytes));
    return typeof result.expires === "number" && result.expires > Date.now()
      ? result
      : null;
  } catch {
    return null;
  }
}
function safeReturn(value: string | null) {
  try {
    const url = new URL(value ?? "/editor/", ORIGIN);
    return url.origin === ORIGIN &&
      ["/editor/", "/dabar/"].includes(url.pathname)
      ? url.pathname + url.search
      : "/editor/";
  } catch {
    return "/editor/";
  }
}
async function github<T>(
  path: string,
  token: string,
  fetcher: typeof fetch,
  data?: unknown,
  method?: string,
): Promise<T> {
  let response: Response;
  try {
    response = await fetcher(`https://api.github.com${path}`, {
      method: method ?? (data === undefined ? "GET" : "PUT"),
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "DeepAltitude-editor",
        "Content-Type": "application/json",
      },
      body: data === undefined ? undefined : JSON.stringify(data),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new EditorError(
      503,
      data === undefined
        ? "GitHub is unavailable. Try again shortly."
        : "The save could not be confirmed. Reload the saved version before trying again. Your text is still here.",
    );
  }
  if (response.status === 401)
    throw new EditorError(
      401,
      "Your sign-in has expired. Sign in again; your text stays in this tab.",
    );
  if (response.status === 409 || response.status === 422)
    throw new EditorError(
      409,
      "The original changed elsewhere. Your text has been kept. Review the latest saved version before saving again.",
    );
  if (response.status === 404)
    throw new EditorError(
      404,
      "The original could not be found, or the editor has no access to it.",
    );
  if (!response.ok)
    throw new EditorError(
      response.status === 403 ? 403 : 502,
      "GitHub did not allow this operation. Check the editor’s repository access and try again.",
    );
  return response.json() as Promise<T>;
}
async function author(token: string, fetcher: typeof fetch) {
  const user = await github<{ id: number; login: string }>(
    "/user",
    token,
    fetcher,
  );
  if (user.id !== AUTHOR_ID)
    throw new EditorError(
      403,
      "Only the DeepAltitude author can use this editor.",
    );
  const repo = await github<{ id: number; permissions?: { push: boolean } }>(
    `/repos/${REPOSITORY}`,
    token,
    fetcher,
  );
  if (repo.id !== REPOSITORY_ID || !repo.permissions?.push)
    throw new EditorError(
      403,
      "The editor needs write access to the DeepAltitude repository.",
    );
  return user;
}
async function fileAt(path: string, token: string, fetcher: typeof fetch) {
  const endpoint = `/repos/${REPOSITORY}/contents/${path.split("/").map(encodeURIComponent).join("/")}`;
  const file = await github<GithubFile>(endpoint + "?ref=main", token, fetcher);
  if (
    file.type !== "file" ||
    file.path !== path ||
    file.encoding !== "base64" ||
    file.size > MAX_BYTES
  )
    throw new EditorError(422, "This is not an editable original article.");
  return {
    file,
    endpoint,
    raw: decoder.decode(unbase64(file.content.replace(/\s/g, ""))),
  };
}
function requireSameOrigin(request: Request) {
  const origin = new URL(request.url).origin;
  if (
    request.headers.get("Origin") !== origin ||
    request.headers.get("Sec-Fetch-Site") === "cross-site"
  )
    throw new EditorError(
      403,
      "Please save from the DeepAltitude editor itself.",
    );
  if (!request.headers.get("Content-Type")?.startsWith("application/json"))
    throw new EditorError(415, "Expected an editor request.");
}
async function readJson(request: Request) {
  if (Number(request.headers.get("Content-Length")) > MAX_BYTES * 14)
    throw new EditorError(413, "This request is too large.");
  const reader = request.body?.getReader();
  if (!reader) throw new EditorError(400, "No article was submitted.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BYTES * 14) {
      await reader.cancel();
      throw new EditorError(413, "This request is too large.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    const value = JSON.parse(decoder.decode(bytes));
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw Error();
    return value;
  } catch {
    throw new EditorError(400, "The editor request could not be read.");
  }
}

export async function handleEditor(
  request: Request,
  action: string,
  env: EditorEnvironment,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  const url = new URL(request.url),
    secret = env.DEEPALTITUDE_EDITOR_CLIENT_SECRET;
  const configured =
    !!env.DEEPALTITUDE_EDITOR_CLIENT_ID &&
    typeof secret === "string" &&
    secret.length >= 20;
  try {
    if (
      ![
        "session",
        "login",
        "callback",
        "article",
        "logout",
        "catalog",
        "document",
        "draft",
        "publish",
        "note",
        "save-note",
        "delete-note",
        "settle-note",
      ].includes(action)
    )
      return json({ error: "Not found." }, 404);
    const allowed =
      action === "article"
        ? ["GET", "POST"]
        : [
              "logout",
              "draft",
              "publish",
              "save-note",
              "delete-note",
              "settle-note",
            ].includes(action)
          ? ["POST"]
          : ["GET"];
    if (!allowed.includes(request.method))
      return json({ error: "Method not allowed." }, 405);
    if (action === "session" && !configured)
      return json({ authenticated: false, configured: false });
    if (!configured)
      throw new EditorError(503, "Author sign-in is not connected yet.");
    if (action === "login") {
      const state: OAuthState = {
        state: random(),
        verifier: random(),
        returnTo: safeReturn(url.searchParams.get("returnTo")),
        expires: Date.now() + 600000,
      };
      const challenge = base64url(
        new Uint8Array(
          await crypto.subtle.digest("SHA-256", encoder.encode(state.verifier)),
        ),
      );
      const params = new URLSearchParams({
        client_id: env.DEEPALTITUDE_EDITOR_CLIENT_ID!,
        redirect_uri: CALLBACK,
        state: state.state,
        code_challenge: challenge,
        code_challenge_method: "S256",
        login: "DeepAltitude",
        allow_signup: "false",
      });
      return cookie(
        redirect("https://github.com/login/oauth/authorize?" + params),
        OAUTH,
        await seal(state, secret!, OAUTH),
        600,
      );
    }
    if (action === "callback") {
      const state = await unseal<OAuthState>(
        readCookie(request, OAUTH),
        secret!,
        OAUTH,
      );
      if (
        !state ||
        !url.searchParams.get("code") ||
        url.searchParams.get("state") !== state.state
      )
        return cookie(redirect("/editor/?error=signin"), OAUTH, "", 0);
      try {
        const response = await fetcher(
          "https://github.com/login/oauth/access_token",
          {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              client_id: env.DEEPALTITUDE_EDITOR_CLIENT_ID,
              client_secret: secret,
              code: url.searchParams.get("code"),
              redirect_uri: CALLBACK,
              code_verifier: state.verifier,
              repository_id: REPOSITORY_ID,
            }),
            signal: AbortSignal.timeout(15000),
          },
        );
        const result = (await response.json()) as {
          access_token?: string;
          expires_in?: number;
          error?: string;
        };
        if (!response.ok || result.error || !result.access_token)
          throw Error("Sign-in failed");
        const user = await author(result.access_token, fetcher);
        const age = Math.min(28800, Number(result.expires_in) || 28800);
        const session: Session = {
          token: result.access_token,
          login: user.login,
          csrf: random(),
          expires: Date.now() + age * 1000,
        };
        return cookie(
          cookie(redirect(state.returnTo), OAUTH, "", 0),
          SESSION,
          await seal(session, secret!, SESSION),
          age,
        );
      } catch {
        return cookie(redirect("/editor/?error=signin"), OAUTH, "", 0);
      }
    }
    const session = await unseal<Session>(
      readCookie(request, SESSION),
      secret!,
      SESSION,
    );
    if (!session) {
      if (action === "session")
        return json({ authenticated: false, configured: true });
      throw new EditorError(401, "Sign in to edit the original article.");
    }
    if (request.method === "POST") {
      requireSameOrigin(request);
      if (request.headers.get("X-Editor-CSRF") !== session.csrf)
        throw new EditorError(
          403,
          "The editing session changed. Sign in again before saving.",
        );
    }
    if (action === "logout")
      return cookie(json({ authenticated: false }), SESSION, "", 0);
    await author(session.token, fetcher);
    if (action === "session")
      return json({
        authenticated: true,
        configured: true,
        login: session.login,
        csrf: session.csrf,
        privateDrafts: !!env.DB,
        operational: !!env.DB,
      });
    if (["note", "save-note", "delete-note", "settle-note"].includes(action))
      return json(
        await handleNotebook(
          action,
          request,
          request.method === "POST" ? await readJson(request) : null,
          <T>(path: string, data?: unknown, method?: string) =>
            github<T>(path, session.token, fetcher, data, method),
          env,
          fetcher,
        ),
      );
    if (["catalog", "document", "draft", "publish"].includes(action))
      return json(
        await handleContent(
          action,
          request,
          request.method === "POST" ? await readJson(request) : null,
          <T>(path: string, data?: unknown, method?: string) =>
            github<T>(path, session.token, fetcher, data, method),
          env,
        ),
      );
    const input = request.method === "POST" ? await readJson(request) : null;
    const path = input?.file ?? url.searchParams.get("file");
    if (!isOriginalPath(path))
      throw new EditorError(
        403,
        "Only original articles can be edited here. Translations and other files are read-only.",
      );
    const { file, endpoint, raw } = await fileAt(path, session.token, fetcher);
    if (request.method === "GET") {
      const source = splitOriginal(raw);
      return json({
        file: path,
        sha: file.sha,
        title: source.title,
        description: source.description,
        body: normalizeLines(source.body),
      });
    }
    if (input.sha !== file.sha)
      throw new EditorError(
        409,
        "The original changed elsewhere. Your text has been kept. Review the latest saved version before saving again.",
      );
    const updated = updateOriginal(raw, input);
    const digest = base64url(
      new Uint8Array(
        await crypto.subtle.digest("SHA-256", encoder.encode(updated)),
      ),
    );
    if (updated === raw)
      return json({ sha: file.sha, unchanged: true, digest });
    const saved = await github<{
      content: { sha: string };
      commit: { sha: string };
    }>(endpoint, session.token, fetcher, {
      branch: "main",
      sha: file.sha,
      message:
        "Edit original: " +
        input.title.replace(/[\r\n\x00-\x1f]/g, " ").slice(0, 120),
      content: base64(encoder.encode(updated)),
    });
    return json({
      sha: saved.content.sha,
      commit: saved.commit.sha,
      digest,
      unchanged: false,
    });
  } catch (error) {
    const known = error instanceof EditorError;
    const response = json(
      {
        error: known
          ? error.message
          : "The editor could not complete this request. Your text has not been discarded.",
      },
      known ? error.status : 500,
    );
    if (known && error.status === 401) cookie(response, SESSION, "", 0);
    return response;
  }
}
