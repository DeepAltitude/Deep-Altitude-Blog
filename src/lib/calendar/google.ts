import { database, type DataEnvironment, type Database } from "../data/store";
import { EditorError } from "../../server/errors";
import { validDate } from "../data/store";
import type { CalendarItem } from "./model";
export interface GoogleEnvironment extends DataEnvironment {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  TOKEN_ENCRYPTION_KEY?: string;
}
const callback = "https://deepaltitude.com/api/calendar/callback",
  cookieName = "__Host-deepaltitude-calendar";
const readScopes = [
  "https://www.googleapis.com/auth/calendar.events.readonly",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
];
const encoder = new TextEncoder(),
  decoder = new TextDecoder();
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export async function crypt(
  value: any,
  secret: string | undefined,
  purpose: string,
  decrypt = false,
): Promise<any> {
  if (!secret || secret.length < 32)
    throw new EditorError(503, "Calendar token encryption is not configured.");
  const key = await crypto.subtle.importKey(
    "raw",
    await crypto.subtle.digest(
      "SHA-256",
      encoder.encode("deepaltitude-calendar-v1:" + secret),
    ),
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
  if (decrypt) {
    try {
      const envelope = JSON.parse(value),
        plain = await crypto.subtle.decrypt(
          {
            name: "AES-GCM",
            iv: unb64(envelope.iv),
            additionalData: encoder.encode(purpose),
          },
          key,
          unb64(envelope.data),
        );
      return JSON.parse(decoder.decode(plain));
    } catch {
      throw new EditorError(
        409,
        "Calendar connection could not be read. Reconnect Google Calendar.",
      );
    }
  }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  return JSON.stringify({
    iv: b64(iv),
    data: b64(
      new Uint8Array(
        await crypto.subtle.encrypt(
          { name: "AES-GCM", iv, additionalData: encoder.encode(purpose) },
          key,
          encoder.encode(JSON.stringify(value)),
        ),
      ),
    ),
  });
}
const configured = (env: GoogleEnvironment) =>
  !!env.GOOGLE_CLIENT_ID &&
  !!env.GOOGLE_CLIENT_SECRET &&
  !!env.TOKEN_ENCRYPTION_KEY &&
  env.TOKEN_ENCRYPTION_KEY.length >= 32;
export async function prefs(db: Database) {
  const row = await db
    .prepare("SELECT * FROM calendar_preferences WHERE id = 1")
    .first();
  return {
    calendars: JSON.parse(row?.calendars || "[]"),
    timezone: row?.timezone || "Europe/Zurich",
    version: row?.version || 0,
  };
}
async function connection(env: GoogleEnvironment) {
  const row = await database(env)
    .prepare(
      "SELECT encrypted_token FROM oauth_connections WHERE provider = 'google'",
    )
    .first();
  return row
    ? crypt(row.encrypted_token, env.TOKEN_ENCRYPTION_KEY, "google-token", true)
    : null;
}
async function store(env: GoogleEnvironment, value: any) {
  await database(env)
    .prepare(
      "INSERT INTO oauth_connections(provider,encrypted_token,updated_at) VALUES('google',?,?) ON CONFLICT(provider) DO UPDATE SET encrypted_token = excluded.encrypted_token, updated_at = excluded.updated_at",
    )
    .bind(
      await crypt(value, env.TOKEN_ENCRYPTION_KEY, "google-token"),
      new Date().toISOString(),
    )
    .run();
}
async function requestToken(
  env: GoogleEnvironment,
  parameters: Record<string, string>,
  fetcher: typeof fetch,
) {
  let response: Response;
  try {
    response = await fetcher("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        ...parameters,
        client_id: env.GOOGLE_CLIENT_ID!,
        client_secret: env.GOOGLE_CLIENT_SECRET!,
      }),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new EditorError(
      503,
      "Google Calendar is unavailable. DeepAltitude remains available.",
    );
  }
  if (!response.ok)
    throw new EditorError(
      409,
      "Google Calendar authorization expired or was revoked. Reconnect Calendar.",
    );
  return response.json() as Promise<any>;
}
async function access(
  env: GoogleEnvironment,
  fetcher: typeof fetch,
  force = false,
) {
  const saved = await connection(env);
  if (!saved)
    throw new EditorError(409, "Connect Google Calendar in Settings.");
  if (!force && saved.expires > Date.now() + 60000) return saved.access;
  const fresh = await requestToken(
    env,
    { grant_type: "refresh_token", refresh_token: saved.refresh },
    fetcher,
  );
  const next = {
    ...saved,
    access: fresh.access_token,
    refresh: fresh.refresh_token || saved.refresh,
    expires: Date.now() + fresh.expires_in * 1000,
  };
  await store(env, next);
  return next.access;
}
async function api(
  env: GoogleEnvironment,
  path: string,
  fetcher: typeof fetch,
  retry = true,
): Promise<any> {
  const token = await access(env, fetcher);
  let response: Response;
  try {
    response = await fetcher("https://www.googleapis.com/calendar/v3/" + path, {
      method: "GET",
      headers: {
        Authorization: "Bearer " + token,
      },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new EditorError(
      503,
      "Google Calendar is unavailable. Retry shortly.",
    );
  }
  if (response.status === 401 && retry) {
    await access(env, fetcher, true);
    return api(env, path, fetcher, false);
  }
  if (!response.ok)
    throw new EditorError(
      response.status === 401 ? 409 : 502,
      response.status === 401
        ? "Reconnect Google Calendar."
        : "Google Calendar could not be read. Check calendar permissions and retry.",
    );
  return response.json();
}
export async function calendars(
  env: GoogleEnvironment,
  fetcher: typeof fetch = fetch,
) {
  let token = "",
    all: any[] = [];
  do {
    const data = await api(
      env,
      "users/me/calendarList?maxResults=250" +
        (token ? "&pageToken=" + encodeURIComponent(token) : ""),
      fetcher,
    );
    all.push(...(data.items || []));
    token = data.nextPageToken || "";
  } while (token);
  return all
    .filter((c) => !c.deleted)
    .map((c) => ({
      id: c.id,
      name: c.summaryOverride || c.summary,
      primary: !!c.primary,
      timeZone: c.timeZone,
    }));
}
export async function settings(
  env: GoogleEnvironment,
  fetcher: typeof fetch = fetch,
) {
  const preferences = await prefs(database(env));
  const connected = !!(await database(env)
    .prepare("SELECT provider FROM oauth_connections WHERE provider='google'")
    .first());
  let available: any[] = [],
    warning = "";
  if (connected)
    try {
      available = await calendars(env, fetcher);
    } catch (e) {
      warning = e instanceof EditorError ? e.message : "Calendar unavailable.";
    }
  return {
    configured: configured(env),
    connected,
    preferences,
    calendars: available,
    account: available.find((c) => c.primary)?.id || "",
    warning,
  };
}
export async function connect(env: GoogleEnvironment) {
  database(env);
  if (!configured(env))
    throw new EditorError(
      503,
      "Google Calendar credentials are not configured yet.",
    );
  const state = crypto.randomUUID(),
    verifier = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("");
  const challenge = b64(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", encoder.encode(verifier)),
    ),
  )
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
  const value = encodeURIComponent(
    await crypt(
      { state, verifier, expires: Date.now() + 600000 },
      env.TOKEN_ENCRYPTION_KEY,
      "google-state",
    ),
  );
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID!,
    redirect_uri: callback,
    response_type: "code",
    scope: readScopes.join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  return new Response(null, {
    status: 303,
    headers: {
      Location: "https://accounts.google.com/o/oauth2/v2/auth?" + params,
      "Set-Cookie": `${cookieName}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
      "Cache-Control": "private, no-store",
    },
  });
}
export async function oauthCallback(
  request: Request,
  env: GoogleEnvironment,
  fetcher: typeof fetch = fetch,
) {
  const u = new URL(request.url),
    value = (request.headers.get("Cookie") || "")
      .split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith(cookieName + "="))
      ?.slice(cookieName.length + 1);
  let target = "/editor/?kind=settings&calendar=failed";
  try {
    if (!value) throw new EditorError(400, "Missing state.");
    const state = await crypt(
      decodeURIComponent(value),
      env.TOKEN_ENCRYPTION_KEY,
      "google-state",
      true,
    );
    if (
      state.expires < Date.now() ||
      state.state !== u.searchParams.get("state") ||
      !u.searchParams.get("code")
    )
      throw new EditorError(400, "Invalid state.");
    const result = await requestToken(
      env,
      {
        grant_type: "authorization_code",
        code: u.searchParams.get("code")!,
        redirect_uri: callback,
        code_verifier: state.verifier,
      },
      fetcher,
    );
    if (!result.refresh_token)
      throw new EditorError(
        400,
        "Offline permission is required. Reconnect Calendar.",
      );
    const granted = new Set(String(result.scope || "").split(/\s+/));
    if (readScopes.some((scope) => !granted.has(scope)))
      throw new EditorError(400, "Calendar read permissions were not granted.");
    await store(env, {
      access: result.access_token,
      refresh: result.refresh_token,
      expires: Date.now() + result.expires_in * 1000,
    });
    const all = await calendars(env, fetcher),
      current = await prefs(database(env));
    if (!current.calendars.length) {
      const primary = all.find((c) => c.primary) || all[0];
      if (primary)
        await database(env)
          .prepare(
            "UPDATE calendar_preferences SET calendars = ?, version = version + 1 WHERE id = 1",
          )
          .bind(JSON.stringify([primary.id]))
          .run();
    }
    target = "/editor/?kind=settings&calendar=connected";
  } catch {
    /* Provider tokens and errors are never logged or reflected to the browser. */
  }
  return new Response(null, {
    status: 303,
    headers: {
      Location: target,
      "Set-Cookie": `${cookieName}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
      "Cache-Control": "private, no-store",
    },
  });
}
export async function disconnect(
  env: GoogleEnvironment,
  fetcher: typeof fetch = fetch,
) {
  const token = await connection(env);
  if (token) {
    let response: Response;
    try {
      response = await fetcher("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: token.refresh }),
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new EditorError(
        503,
        "Google could not confirm revocation. Retry disconnecting.",
      );
    }
    if (!response.ok && response.status !== 400)
      throw new EditorError(
        503,
        "Google could not confirm revocation. Retry disconnecting.",
      );
  }
  await database(env)
    .prepare("DELETE FROM oauth_connections WHERE provider='google'")
    .run();
  cache.clear();
  return { disconnected: true };
}
export async function saveSettings(
  env: GoogleEnvironment,
  value: any,
  fetcher: typeof fetch = fetch,
) {
  const connected = await database(env)
    .prepare("SELECT provider FROM oauth_connections WHERE provider='google'")
    .first();
  const all = connected ? await calendars(env, fetcher) : [];
  if (
    !Array.isArray(value.calendars) ||
    value.calendars.some((id: any) => !all.some((c) => c.id === id))
  )
    throw new EditorError(422, "Choose calendars from the connected account.");
  try {
    new Intl.DateTimeFormat("en", { timeZone: value.timezone }).format();
  } catch {
    throw new EditorError(422, "Use a valid timezone.");
  }
  const result = await database(env)
    .prepare(
      "UPDATE calendar_preferences SET calendars = ?, timezone = ?, version = version + 1 WHERE id = 1 AND version = ?",
    )
    .bind(
      JSON.stringify(value.calendars),
      value.timezone,
      value.version,
    )
    .run();
  if (result.meta.changes !== 1)
    throw new EditorError(409, "Settings changed elsewhere. Reload them.");
  cache.clear();
  return settings(env, fetcher);
}
const cache = new Map<string, { expires: number; items: CalendarItem[] }>();
export function normalizeEvent(event: any, calendar: any): CalendarItem | null {
  if (event.status === "cancelled" || !event.start || !event.end) return null;
  return {
    id: event.id,
    source: "google",
    title: event.summary || "(Be pavadinimo)",
    start: event.start.date || event.start.dateTime,
    end: event.end.date || event.end.dateTime,
    allDay: !!event.start.date,
    href: event.htmlLink,
    calendarId: calendar.id,
    calendarName: calendar.name,
    location: event.location || "",
    description: event.description || "",
  };
}
export async function events(
  env: GoogleEnvironment,
  start: string,
  end: string,
  fetcher: typeof fetch = fetch,
) {
  if (
    !validDate(start) ||
    !validDate(end) ||
    Date.parse(end) <= Date.parse(start) ||
    Date.parse(end) - Date.parse(start) > 400 * 86400000
  )
    throw new EditorError(
      422,
      "Choose a calendar range of up to twelve months.",
    );
  const p = await prefs(database(env)),
    row = await database(env)
      .prepare(
        "SELECT updated_at FROM oauth_connections WHERE provider='google'",
      )
      .first();
  if (!row)
    return {
      items: [],
      timezone: p.timezone,
      warning: "Google Calendar neprijungtas.",
    };
  const key = JSON.stringify([
      row.updated_at,
      p.calendars,
      p.timezone,
      start,
      end,
    ]),
    saved = cache.get(key);
  if (saved && saved.expires > Date.now())
    return { items: saved.items, timezone: p.timezone };
  const all = await calendars(env, fetcher),
    items: CalendarItem[] = [];
  await Promise.all(
    all
      .filter((c) => p.calendars.includes(c.id))
      .map(async (c) => {
        let page = "";
        do {
          const q = new URLSearchParams({
            timeMin: start + "T00:00:00Z",
            timeMax: end + "T00:00:00Z",
            timeZone: p.timezone,
            singleEvents: "true",
            showDeleted: "false",
            maxResults: "2500",
            orderBy: "startTime",
            ...(page ? { pageToken: page } : {}),
          });
          const result = await api(
            env,
            "calendars/" + encodeURIComponent(c.id) + "/events?" + q,
            fetcher,
          );
          for (const event of result.items || []) {
            const normalized = normalizeEvent(event, c);
            if (normalized) items.push(normalized);
          }
          page = result.nextPageToken || "";
        } while (page);
      }),
  );
  if (cache.size > 20) cache.clear();
  cache.set(key, { items, expires: Date.now() + 60000 });
  return { items, timezone: p.timezone };
}
