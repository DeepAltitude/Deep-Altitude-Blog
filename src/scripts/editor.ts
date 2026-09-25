import { api, el, node, message, safePreview } from "./client";
import { author, signOut } from "./author";
import { writingForm } from "./writing";
import { button, run, values, hasUnsavedChanges } from "./inline-ui";
import type { Editable } from "../utils/editor-model";
const query = new URLSearchParams(location.search);
let settings: any;
async function openSettings() {
  settings = await api("calendar/settings");
  el("settings").hidden = false;
  el("calendar-connection").textContent =
    settings.warning ||
    (settings.connected
      ? "Connected" + (settings.account ? " as " + settings.account : "")
      : settings.configured
        ? "Not connected."
        : "Google Calendar connection is not configured yet.");
  el("calendar-connect").textContent = settings.connected
    ? "Reconnect Google Calendar →"
    : "Connect Google Calendar →";
  el("calendar-connect").hidden = !settings.configured;
  el("calendar-disconnect").hidden = !settings.connected;
  el("calendar-settings").hidden = false;
  const checks = el("calendar-choices");
  checks.replaceChildren(node("legend", "Calendars"));
  checks.hidden = !settings.calendars.length;
  for (const c of settings.calendars) {
    const label = node("label", c.name, { class: "inline-check" }),
      input = node("input", undefined, { type: "checkbox", value: c.id });
    input.checked = settings.preferences.calendars.includes(c.id);
    label.prepend(input);
    checks.append(label);
  }
  el("calendar-settings").querySelector<HTMLInputElement>(
    "[name=timezone]",
  )!.value = settings.preferences.timezone;
}
el("calendar-settings").addEventListener("submit", (event) => {
  event.preventDefault();
  void run(el("calendar-settings"), el("status"), async () => {
    await api("calendar/settings", {
      ...values(el<HTMLFormElement>("calendar-settings")),
      calendars: [
        ...el("calendar-choices").querySelectorAll<HTMLInputElement>(
          "input:checked",
        ),
      ].map((i) => i.value),
      version: settings.preferences.version,
    });
    await openSettings();
    message("Settings saved.");
  });
});
el("calendar-disconnect").addEventListener(
  "click",
  () =>
    void run(el("settings"), el("status"), async () => {
      if (!confirm("Disconnect Google Calendar? Author access is unchanged."))
        return;
      await api("calendar/disconnect", {});
      await openSettings();
      message("Calendar disconnected. Author access is unchanged.");
    }),
);
el("logout").addEventListener(
  "click",
  () =>
    void run(el("workspace"), el("status"), async () => {
      if (
        hasUnsavedChanges() &&
        !confirm("Sign out and discard unsaved changes?")
      )
        return;
      await signOut();
    }),
);
function showPage(doc: Editable, pending = false) {
  const host = el("page-editor"),
    read = node("div", undefined, { class: "prose" });
  safePreview(read, doc.body);
  const edit = button("Edit", () =>
    writingForm(
      host,
      doc,
      async (saved) => showPage(saved, true),
      () => showPage(doc),
    ),
  );
  host.replaceChildren(node("p", doc.description), read, edit);
  if (pending)
    host.prepend(
      node("p", "Saved. The public page updates after deployment.", {
        role: "status",
      }),
    );
}
async function boot() {
  const login = el<HTMLAnchorElement>("login-link");
  login.href =
    "/api/editor/login?returnTo=" +
    encodeURIComponent(
      query.get("returnTo") === "/dabar/"
        ? "/dabar/"
        : location.pathname + location.search,
    );
  try {
    const auth = await author();
    if (!auth.authenticated) {
      el("login-message").textContent = auth.configured
        ? "Sign in to write in your notebook."
        : "Author sign-in is not connected yet.";
      login.hidden = !auth.configured;
      return;
    }
    el("login").hidden = true;
    el("workspace").hidden = false;
    const file = query.get("file"),
      kind = query.get("kind"),
      id = query.get("id");
    if (
      file &&
      ["src/content/pages/home.md", "src/content/pages/about.md"].includes(file)
    ) {
      el("editor-heading").textContent = file.endsWith("home.md")
        ? "Home"
        : "About";
      showPage(await api("editor/note?file=" + encodeURIComponent(file)));
      return;
    }
    // Keep old bookmarks useful; normal authoring has one shared inline path.
    const base =
      kind === "projects"
        ? "/projektai/"
        : kind === "experiments"
          ? "/eksperimentai/"
          : kind === "principle"
            ? "/principai/"
            : file || kind === "article"
              ? "/uzrasai/"
              : null;
    if (base) {
      location.replace(
        base + (id || file ? "#item=" + encodeURIComponent(id || file!) : ""),
      );
      return;
    }
    await openSettings();
    if (query.get("calendar") === "failed")
      message(
        "Google Calendar connection was not completed. Author access is unchanged.",
        true,
      );
  } catch (e) {
    message((e as Error).message, true);
    el("login-message").textContent = (e as Error).message;
  }
}
void boot();
