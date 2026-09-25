import {
  api,
  session,
  el,
  node,
  option,
  message,
  safePreview,
  splitList,
} from "./client";
import { domains, domainNames, topics } from "../utils/domains";
import { slugify } from "../server/documents";
import { todayIn } from "../lib/calendar/model";
import { requestJSON } from "./request";
import type { Editable, Catalog } from "../utils/editor-model";
const query = new URLSearchParams(location.search),
  writing = el<HTMLFormElement>("writing-form"),
  operational = el<HTMLFormElement>("operational-form");
let authorTimezone = "Europe/Zurich";
let catalog: Catalog = { articles: [], principles: [], drafts: [] },
  current: Editable | null = null,
  record: any = null,
  kind = query.get("kind") || "article",
  busy = false,
  dirty = false,
  publishRun = 0,
  settings: any;
const fields = (form: HTMLFormElement, name: string) =>
  form.elements.namedItem(name) as
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
const storageKey = () => "deepaltitude-unsaved:" + location.search;
function preserve() {
  dirty = true;
  try {
    sessionStorage.setItem(
      storageKey(),
      JSON.stringify(
        current
          ? { mode: "writing", value: writingValue() }
          : { mode: "operational", value: operationalValue() },
      ),
    );
  } catch {}
  if (current) preview();
}
function clean() {
  dirty = false;
  try {
    sessionStorage.removeItem(storageKey());
  } catch {}
}
window.addEventListener("beforeunload", (e) => {
  if (dirty) {
    e.preventDefault();
    e.returnValue = "";
  }
});
function error(e: unknown) {
  message((e as Error).message, true);
  if ((e as any).status === 401) {
    el("login").hidden = false;
    el("login-link").hidden = false;
    el<HTMLAnchorElement>("login-link").href =
      "/api/editor/login?returnTo=" +
      encodeURIComponent(location.pathname + location.search);
    el("login-message").textContent =
      "Sign in again. Your unsaved writing is preserved in this tab.";
  }
}
async function act(fn: () => Promise<void>) {
  if (busy) return;
  // A previous publication poll must not overwrite this action's status.
  publishRun++;
  busy = true;
  const controls = Array.from(
    document.querySelectorAll(
      "#workspace input, #workspace textarea, #workspace select, #workspace button",
    ),
  ).map((node) => {
    const element = node as unknown as HTMLInputElement;
    return { element, disabled: element.disabled };
  });
  controls.forEach(({ element }) => (element.disabled = true));
  try {
    await fn();
  } catch (e) {
    error(e);
  } finally {
    busy = false;
    controls.forEach(({ element, disabled }) => (element.disabled = disabled));
  }
}
function field(
  target: HTMLElement,
  name: string,
  label: string,
  type = "text",
  choices?: { value: string; label: string }[],
) {
  const wrapper = node("label", label),
    input = choices
      ? node("select")
      : type === "textarea"
        ? node("textarea")
        : node("input");
  input.name = name;
  if (input instanceof HTMLInputElement) {
    input.type = type;
    if (name === "title") input.required = true;
  }
  if (input instanceof HTMLTextAreaElement) input.rows = 4;
  if (choices && input instanceof HTMLSelectElement)
    input.append(...choices.map((c) => option(c.value, c.label)));
  if (type === "textarea") wrapper.className = "wide";
  if (type === "checkbox") wrapper.className = "check-label";
  wrapper.append(input);
  target.append(wrapper);
  return input;
}
function fill(form: HTMLFormElement, data: any) {
  if (form === operational) data = operationalFormData(data);
  for (const input of Array.from(form.elements)) {
    if (
      !(
        input instanceof HTMLInputElement ||
        input instanceof HTMLSelectElement ||
        input instanceof HTMLTextAreaElement
      ) ||
      !input.name
    )
      continue;
    const value = data[input.name];
    if (input instanceof HTMLInputElement && input.type === "checkbox")
      input.checked = !!value;
    else if (input instanceof HTMLSelectElement && input.multiple) {
      Array.from(input.options).forEach(
        (o) => (o.selected = (value || []).map(String).includes(o.value)),
      );
    } else
      input.value = Array.isArray(value) ? value.join(", ") : (value ?? "");
  }
}
function values(form: HTMLFormElement) {
  const result: any = {};
  for (const input of Array.from(form.elements)) {
    if (
      !(
        input instanceof HTMLInputElement ||
        input instanceof HTMLSelectElement ||
        input instanceof HTMLTextAreaElement
      ) ||
      !input.name
    )
      continue;
    result[input.name] =
      input instanceof HTMLInputElement && input.type === "checkbox"
        ? input.checked
        : input instanceof HTMLSelectElement && input.multiple
          ? Array.from(input.selectedOptions).map((o) => o.value)
          : input.value;
  }
  return result;
}
function taxonomy(target: HTMLElement, form: HTMLFormElement) {
  field(target, "domain", "Domain", "select", [
    { value: "", label: "Optional" },
    ...domains.map((d) => ({ value: d, label: domainNames[d] })),
  ]);
  field(target, "topic", "Topic", "select", [{ value: "", label: "Optional" }]);
  fields(form, "domain").addEventListener("change", () =>
    updateTopics(form, ""),
  );
}
function updateTopics(form: HTMLFormElement, selected: string) {
  const d = fields(form, "domain").value as keyof typeof topics,
    select = fields(form, "topic") as HTMLSelectElement;
  select.replaceChildren(
    option("", "Optional"),
    ...(topics[d] || []).map((t) => option(t.id, t.title)),
  );
  select.value = selected;
}
async function relationships(
  target: HTMLElement,
  _form: HTMLFormElement,
  all = false,
) {
  for (const [name, label, k] of [
    ["project", "Project", "projects"],
    ...(all
      ? [
          ["experiment", "Experiment", "experiments"],
          ["sprint", "Sprint", "sprints"],
        ]
      : []),
  ]) {
    let rows: any[] = [];
    let unavailable = false;
    try {
      rows = await api("ops/list?kind=" + k);
    } catch {
      /* A disconnected operational store does not block public writing. */
      unavailable = true;
    }
    const saved: string | undefined = (current || record)?.[name];
    const select = field(target, name, label, "select", [
      { value: "", label: "Optional" },
      ...rows.map((r) => ({ value: r.id, label: r.title })),
      ...(saved && !rows.some((r) => r.id === saved)
        ? [{ value: saved, label: "Saved connection (unavailable)" }]
        : []),
    ]);
    select.disabled = unavailable;
    if (unavailable)
      target.append(
        node(
          "p",
          label +
            " connections are unavailable. Any existing connection will be kept.",
          { class: "editor-help" },
        ),
      );
  }
}
function principleOptions(select: HTMLSelectElement, selected: string[] = []) {
  select.replaceChildren(
    ...catalog.principles.map((p) => option(p.id!, p.title)),
    ...(current?.newPrinciples || []).map((p) => option(p.id, p.title)),
  );
  for (const reference of selected) {
    if (
      !Array.from(select.options).some(
        (o) =>
          o.value === reference ||
          "src/content/principles/" + o.value + ".md" === reference,
      )
    )
      select.append(option(reference, "Saved principle (unavailable)"));
  }
  Array.from(select.options).forEach(
    (o) =>
      (o.selected =
        selected.includes(o.value) ||
        selected.includes("src/content/principles/" + o.value + ".md")),
  );
}
async function loadCatalog() {
  catalog = await api("editor/catalog");
  el("catalog-warning").textContent = catalog.warning || "";
  el("catalog-warning").hidden = !catalog.warning;
  await choices();
}
async function choices() {
  const collection = el<HTMLSelectElement>("collection").value;
  const rows =
    collection in catalog
      ? (catalog as any)[collection]
      : await api("ops/list?kind=" + collection);
  el<HTMLSelectElement>("record-choice").replaceChildren(
    option("", "Choose…"),
    ...rows.map((r: any) => option(r.file || r.id, r.title)),
  );
}
el("collection").addEventListener("change", () => choices().catch(error));
el("record-choice").addEventListener("change", () => {
  const value = el<HTMLSelectElement>("record-choice").value,
    c = el<HTMLSelectElement>("collection").value;
  if (value)
    location.href =
      "/editor/?" +
      (["articles", "principles", "drafts"].includes(c)
        ? "file=" + encodeURIComponent(value)
        : "kind=" + c + "&id=" + value);
});
function writingValue(): Editable {
  return {
    ...current!,
    ...values(writing),
    principles: Array.from(
      el<HTMLSelectElement>("note-principles").selectedOptions,
    ).map((o) => o.value),
    tags: splitList(fields(writing, "tags")?.value || ""),
  };
}
function preview() {
  if (!current) return;
  const value = writingValue();
  el("preview-title").textContent = value.title;
  el("preview-description").textContent = value.description;
  el("preview-meta").textContent = [
    domainNames[value.domain as keyof typeof domainNames],
    value.pubDate,
  ]
    .filter(Boolean)
    .join(" / ");
  const figure = el("preview-hero"),
    image = el<HTMLImageElement>("preview-hero-image");
  figure.hidden = true;
  if (value.heroImage) {
    try {
      const url = new URL(value.heroImage, location.origin);
      if (["https:", "http:"].includes(url.protocol)) {
        image.src = url.href;
        image.alt = value.heroImageAlt;
        figure.hidden = false;
      }
    } catch {}
  }
  safePreview(el("preview-body"), value.body, value.attachments);
}
async function openWriting(
  file: string | null,
  requestedKind: string,
  ignoreRecovery = false,
) {
  publishRun++;
  message("Loading the latest saved version…");
  current = await api(
    "editor/document?" +
      (file ? "file=" + encodeURIComponent(file) : "kind=" + requestedKind),
  );
  kind = current!.kind;
  record = null;
  const meta = el("writing-metadata");
  meta.replaceChildren();
  if (kind === "article") {
    field(meta, "pubDate", "Date", "date");
    field(meta, "updatedDate", "Updated date", "date");
    taxonomy(meta, writing);
    await relationships(meta, writing, true);
    field(meta, "tags", "Tags, separated by commas");
    field(meta, "heroImage", "Optional image");
    field(meta, "heroImageAlt", "Image description");
  }
  el("note-metadata").hidden = kind !== "article";
  el("document-kind").textContent =
    kind === "article" ? "ORIGINAL NOTE" : kind.toUpperCase();
  el("editor-heading").textContent = current!.title || "Naujas užrašas";
  fill(writing, current);
  if (kind === "article") updateTopics(writing, current!.topic);
  principleOptions(el("note-principles"), current!.principles);
  const link = el<HTMLAnchorElement>("published-link");
  link.hidden = !current!.url;
  link.href = current!.url || "/";
  writing.hidden = false;
  operational.hidden = true;
  el("settings").hidden = true;
  el("observations").hidden = true;
  el<HTMLDetailsElement>("library").open = false;
  dirty = false;
  message("");
  if (ignoreRecovery) clean();
  if (!ignoreRecovery) restoreRecovery();
  preview();
}
function restoreRecovery() {
  try {
    const raw = sessionStorage.getItem(storageKey());
    if (!raw) return;
    const draft = JSON.parse(raw);
    if (current && draft.mode === "writing") {
      const server = current;
      current = { ...current, ...draft.value };
      fill(writing, current);
      if (kind === "article") updateTopics(writing, current!.topic);
      principleOptions(el("note-principles"), current!.principles);
      dirty = true;
      message(
        server.sha !== current!.sha
          ? "Unsaved writing restored. The saved version has changed; download your draft before reloading."
          : "Unsaved writing restored.",
      );
    } else if (record && draft.mode === "operational") {
      record = draft.value;
      fill(operational, record);
      if (fields(operational, "domain"))
        updateTopics(operational, record.topic);
      dirty = true;
      message("Unsaved changes restored.");
    }
  } catch {}
}
writing.addEventListener("input", preserve);
writing.addEventListener("change", preserve);
el("write-mode").addEventListener("click", () => {
  document.querySelector(".writing-split")!.classList.remove("preview-active");
  el("write-mode").setAttribute("aria-pressed", "true");
  el("preview-mode").setAttribute("aria-pressed", "false");
});
el("preview-mode").addEventListener("click", () => {
  preview();
  document.querySelector(".writing-split")!.classList.add("preview-active");
  el("write-mode").setAttribute("aria-pressed", "false");
  el("preview-mode").setAttribute("aria-pressed", "true");
});
el("add-principle").addEventListener("click", () => {
  const input = el<HTMLInputElement>("new-principle-title"),
    title = input.value.trim();
  if (!title || !current) return;
  const chosen = Array.from(
      el<HTMLSelectElement>("note-principles").selectedOptions,
    ).map((o) => o.value),
    existing = catalog.principles.find(
      (p) => p.title.trim().toLocaleLowerCase() === title.toLocaleLowerCase(),
    );
  let id = existing?.id;
  if (!id) {
    id = slugify(title) + "-" + crypto.randomUUID().slice(0, 8);
    current.newPrinciples.push({ id, title, description: "" });
  }
  chosen.push(id);
  principleOptions(el("note-principles"), chosen);
  input.value = "";
  preserve();
});
el("image-upload").addEventListener("change", async () => {
  const input = el<HTMLInputElement>("image-upload"),
    file = input.files?.[0];
  if (!file || !current) return;
  const extensions: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/avif": "avif",
  };
  if (!extensions[file.type] || file.size > 4 * 1024 * 1024) {
    message("Choose a supported image under 4 MB.", true);
    return;
  }
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const id = crypto.randomUUID(),
    path = "/images/editor-" + id + "." + extensions[file.type];
  current.attachments.push({ id, path, mime: file.type, data });
  const body = fields(writing, "body") as HTMLTextAreaElement;
  body.setRangeText(
    "\n\n![](" + path + ")\n",
    body.selectionStart,
    body.selectionEnd,
    "end",
  );
  input.value = "";
  preserve();
  message(
    "Image added. Add a description between the square brackets. It will upload when you publish.",
  );
});
async function publish() {
  message("Saving to GitHub…");
  const result = await api("editor/publish", writingValue());
  current = result.document;
  clean();
  history.replaceState(
    null,
    "",
    "/editor/?file=" + encodeURIComponent(current!.file),
  );
  message("Saved to GitHub. Publishing…");
  const link = el<HTMLAnchorElement>("published-link");
  link.href = current!.url;
  link.hidden = false;
  // The server may have reused an existing principle with the same title.
  // Reflect its canonical references before another save, even if refresh fails.
  principleOptions(el("note-principles"), current!.principles);
  if (result.warning) message("Saved to GitHub. Publishing… " + result.warning);
  void verifyPublication(result, current!.file, ++publishRun);
  void loadCatalog()
    .then(() => {
      if (current?.file === result.document.file)
        principleOptions(el("note-principles"), writingValue().principles);
    })
    .catch(() => {
      el("catalog-warning").hidden = false;
      el("catalog-warning").textContent =
        "Saved to GitHub. The item list could not refresh; reopen it later.";
    });
}
async function verifyPublication(result: any, file: string, run: number) {
  for (let attempt = 0; attempt < 36 && run === publishRun; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 5000));
    try {
      const manifest = (await requestJSON(
        "/publication.json?revision=" + result.commit,
        { cache: "no-store" },
        10000,
      )) as Record<string, string>;
      if (manifest[file] === result.revision) {
        if (run === publishRun)
          message(
            (dirty
              ? "Live — previous save verified. You have unsaved changes."
              : "Live — publication verified.") +
              (result.warning ? " " + result.warning : ""),
          );
        return;
      }
    } catch {}
  }
  if (run !== publishRun) return;
  message(
    "Saved to GitHub. The live deployment has not been verified yet. Your saved content is safe; check the published page shortly." +
      (result.warning ? " " + result.warning : ""),
  );
}
writing.addEventListener("submit", (e) => {
  e.preventDefault();
  void act(publish);
});
el("save-draft").addEventListener("click", () =>
  act(async () => {
    message("Saving private draft…");
    const result = await api("editor/draft", writingValue());
    current = result.document;
    clean();
    history.replaceState(
      null,
      "",
      "/editor/?file=" + encodeURIComponent(current!.draftFile!),
    );
    message("Private draft saved.");
  }),
);
el("download").addEventListener("click", () => {
  if (!current) return;
  const d = writingValue(),
    blob = new Blob([d.title + "\n\n" + d.description + "\n\n" + d.body], {
      type: "text/plain;charset=utf-8",
    }),
    url = URL.createObjectURL(blob),
    a = node("a", "", { href: url, download: slugify(d.title) + ".md" });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
el("reload-document").addEventListener("click", () => {
  if (
    current &&
    (!dirty ||
      confirm(
        "Replace the local draft with the saved version? Download your draft first if you want to keep it.",
      ))
  )
    void act(() =>
      openWriting(current!.draftFile || current!.file, kind, true),
    );
});
function operationalFormData(data: any) {
  const result = { ...data };
  for (const key of ["start", "end"]) {
    const value = data[key + "_date"];
    if (!value) {
      result[key + "_time"] = "";
      continue;
    }
    if (value.includes("T")) {
      const local = new Intl.DateTimeFormat("sv-SE", {
        timeZone: authorTimezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(new Date(value));
      result[key + "_date"] = local.slice(0, 10);
      result[key + "_time"] = local.slice(11, 16);
    } else result[key + "_time"] = "";
  }
  return result;
}
function operationalValue() {
  const v = { ...record, ...values(operational) };
  const original = operationalFormData(record);
  for (const key of ["start", "end"]) {
    const date = v[key + "_date"],
      time = v[key + "_time"];
    v[key + "_date"] =
      date === original[key + "_date"] && time === original[key + "_time"]
        ? record[key + "_date"]
        : date && time
          ? date + "T" + time
          : date;
  }
  if (Array.isArray(v.weekdays)) v.weekdays = v.weekdays.map(Number);
  for (const k of ["tags", "weekdays"])
    if (typeof v[k] === "string")
      v[k] = k === "weekdays" ? splitList(v[k]).map(Number) : splitList(v[k]);
  if (v.weekly_target !== undefined) v.weekly_target = Number(v.weekly_target);
  return v;
}
async function openOperational() {
  current = null;
  record = query.get("id")
    ? await api("ops/record?kind=" + kind + "&id=" + query.get("id"))
    : {
        title: "",
        status:
          kind === "experiments"
            ? query.has("idea")
              ? "idea"
              : "planned"
            : "planned",
        visibility: "private",
        active: true,
        recurrence: "daily",
        weekly_target: 1,
        tags: [],
        principles: [],
        weekdays: [],
      };
  let target = el("operational-fields");
  target.replaceChildren();
  field(target, "title", "Title");
  if (kind === "habits") {
    field(target, "recurrence", "Repeat", "select", [
      { value: "daily", label: "Daily" },
      { value: "weekdays", label: "Weekdays" },
      { value: "days", label: "Specific weekdays" },
      { value: "weekly", label: "X times per week" },
    ]);
    const weekdays = field(
      target,
      "weekdays",
      "Weekdays",
      "select",
      [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
        "Sunday",
      ].map((label, i) => ({ value: String(i), label })),
    ) as HTMLSelectElement;
    weekdays.multiple = true;
    weekdays.size = 7;
    field(target, "weekly_target", "Times per week", "number");
    field(target, "quantity", "Optional quantity, e.g. 45 min");
    field(target, "active", "Active", "checkbox");
  } else {
    field(
      target,
      "description",
      kind === "experiments" ? "What do I want to test?" : "Description",
      "textarea",
    );
    if (kind === "experiments" && record.status === "idea") {
      const details = node("details", undefined, { class: "wide" });
      details.append(node("summary", "Optional details"));
      const extra = node("div", undefined, { class: "field-grid" });
      details.append(extra);
      target.append(details);
      target = extra;
    }
    const states =
      kind === "projects"
        ? ["planned", "active", "completed", "paused", "abandoned"]
        : kind === "experiments"
          ? ["idea", "planned", "active", "completed", "paused", "abandoned"]
          : ["planned", "active", "completed", "cancelled"];
    field(
      target,
      "status",
      "State",
      "select",
      states.map((s) => ({ value: s, label: s })),
    );
    field(target, "start_date", "Start", "date");
    field(target, "start_time", "Start time (optional)", "time");
    field(
      target,
      "end_date",
      kind === "projects" ? "Target date" : "End date",
      "date",
    );
    field(target, "end_time", "End time (optional)", "time");
    if (kind === "projects")
      field(target, "outcome", "Desired outcome", "textarea");
    else await relationships(target, operational);
    if (kind !== "sprints") {
      taxonomy(target, operational);
      field(target, "tags", "Tags, separated by commas");
      field(target, "visibility", "Visibility", "select", [
        { value: "private", label: "Private" },
        { value: "public", label: "Public" },
      ]);
      field(
        target,
        "featured",
        kind === "projects"
          ? "Feature on Homepage (public only)"
          : "Feature on Homepage (public + active only)",
        "checkbox",
      );
    }
    if (kind === "experiments") {
      for (const [name, label] of [
        ["hypothesis", "Hypothesis"],
        ["protocol", "Protocol"],
        ["observe", "Things to observe"],
        ["conclusion", "Conclusion"],
      ])
        field(target, name, label, "textarea");
      const select = field(
        target,
        "principles",
        "Principles",
        "select",
        catalog.principles.map((p) => ({ value: p.id!, label: p.title })),
      ) as HTMLSelectElement;
      select.multiple = true;
      select.size = 4;
      const add = node("button", "+ New principle", { type: "button" });
      target.append(add);
      add.addEventListener("click", () =>
        act(async () => {
          const title = prompt("Principle — your reusable idea");
          if (!title?.trim()) return;
          const d = await api("editor/document?kind=principle");
          d.title = title;
          const result = await api("editor/publish", d);
          const id = result.document.file.split("/").pop().slice(0, -3);
          select.append(option(id, title));
          select.options[select.options.length - 1].selected = true;
          preserve();
          message(
            "Principle saved to GitHub. Save this experiment to connect it.",
          );
        }),
      );
    }
    if (kind === "sprints") {
      field(target, "goals", "Focus / goals", "textarea");
      field(target, "notes", "Notes", "textarea");
    }
  }
  fill(operational, record);
  if (fields(operational, "domain"))
    updateTopics(operational, record.topic || "");
  operational.hidden = false;
  writing.hidden = true;
  el("settings").hidden = true;
  el<HTMLDetailsElement>("library").open = false;
  el("editor-heading").textContent =
    record.title ||
    (
      {
        projects: "Naujas projektas",
        experiments: query.has("idea")
          ? "Eksperimento idėja"
          : "Naujas eksperimentas",
        sprints: "Naujas sprintas",
        habits: "Įprotis",
      } as any
    )[kind];
  el("start-experiment").hidden =
    kind !== "experiments" || !record.id || record.status !== "idea";
  el("observations").hidden = kind !== "experiments" || !record.id;
  if (kind === "experiments" && record.id) await loadObservations();
  dirty = false;
  restoreRecovery();
}
operational.addEventListener("input", preserve);
operational.addEventListener("change", preserve);
operational.addEventListener("submit", (e) => {
  e.preventDefault();
  void act(async () => {
    message("Saving…");
    record = await api("ops/save", { kind, record: operationalValue() });
    clean();
    history.replaceState(
      null,
      "",
      "/editor/?kind=" + kind + "&id=" + record.id,
    );
    message("Saved.");
    el("start-experiment").hidden =
      kind !== "experiments" || record.status !== "idea";
    if (kind === "experiments") {
      el("observations").hidden = false;
      await loadObservations();
    }
  });
});
el("start-experiment").addEventListener("click", () =>
  act(async () => {
    if (dirty) {
      record = await api("ops/save", { kind, record: operationalValue() });
    }
    record = await api("ops/start", {
      id: record.id,
      version: record.version,
      date: todayIn(authorTimezone),
    });
    fill(operational, record);
    clean();
    el("start-experiment").hidden = true;
    message("Experiment started. The same record is now active.");
  }),
);
async function loadObservations() {
  const entries = await api("ops/observations?id=" + record.id),
    target = el("observation-list");
  target.replaceChildren(
    ...entries.map((e: any) => {
      const row = node("div", undefined, { class: "observation" });
      row.append(
        node("time", e.date),
        node("p", e.body, { class: "preserve-lines" }),
      );
      return row;
    }),
  );
  fields(el("observation-form"), "date").value = todayIn(authorTimezone);
}
el("observation-form").addEventListener("submit", (e) => {
  e.preventDefault();
  void act(async () => {
    await api("ops/observation", {
      experiment: record.id,
      ...values(el("observation-form")),
    });
    fields(el("observation-form"), "body").value = "";
    await loadObservations();
    message("Observation saved.");
  });
});
async function openSettings() {
  settings = await api("calendar/settings");
  el("settings").hidden = false;
  el("editor-heading").textContent = "Settings";
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
  for (const c of settings.calendars) {
    const label = node("label", c.name, { class: "check-label" }),
      input = node("input", undefined, { type: "checkbox", value: c.id });
    input.checked = settings.preferences.calendars.includes(c.id);
    label.prepend(input);
    checks.append(label);
  }
  const select = fields(
    el("calendar-settings"),
    "default_calendar",
  ) as HTMLSelectElement;
  select.replaceChildren(
    option("", "Choose…"),
    ...settings.calendars
      .filter((c: any) => c.writable)
      .map((c: any) => option(c.id, c.name)),
  );
  fill(el("calendar-settings"), settings.preferences);
}
el("calendar-settings").addEventListener("submit", (e) => {
  e.preventDefault();
  void act(async () => {
    await api("calendar/settings", {
      ...values(el("calendar-settings")),
      calendars: Array.from(
        document.querySelectorAll<HTMLInputElement>(
          "#calendar-choices input:checked",
        ),
      ).map((i) => i.value),
      version: settings.preferences.version,
    });
    await openSettings();
    message("Settings saved.");
  });
});
el("calendar-disconnect").addEventListener("click", () =>
  act(async () => {
    await api("calendar/disconnect", {});
    await openSettings();
    message("Calendar disconnected. DeepAltitude authoring remains available.");
  }),
);
el("logout").addEventListener("click", () =>
  act(async () => {
    if (
      dirty &&
      !confirm("Sign out with unsaved changes? Download your writing first.")
    )
      return;
    await api("editor/logout", {});
    location.reload();
  }),
);
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
    const auth = await session();
    if (!auth.authenticated) {
      el("login-message").textContent = auth.configured
        ? "Sign in to write and manage your notebook."
        : "Author sign-in is not connected yet.";
      login.hidden = !auth.configured;
      return;
    }
    el("login").hidden = true;
    el("workspace").hidden = false;
    message("Loading your notebook…");
    await loadCatalog();
    message("");
    if (kind === "settings") {
      await openSettings();
      return;
    }
    if (["projects", "experiments", "sprints", "habits"].includes(kind)) {
      try {
        authorTimezone = (await api("calendar/settings")).preferences.timezone;
      } catch {}
      await openOperational();
      return;
    }
    await openWriting(query.get("file"), kind);
  } catch (e) {
    error(e);
    el("login-message").textContent = (e as Error).message;
  }
}
void boot();
