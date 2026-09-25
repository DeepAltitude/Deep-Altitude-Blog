import { api, node, option, splitList } from "./client";
import { author, notebookCatalog, catalogItems } from "./author";
import {
  field,
  button,
  visibility,
  values,
  more,
  report,
  run,
  track,
  clean,
  status,
  hasUnsavedChanges,
} from "./inline-ui";
import { taxonomy } from "./writing";
import { pursuitProgress, todayIn } from "../lib/calendar/model";
import { domainNames } from "../utils/domains";
type Kind = "projects" | "experiments";
const names = { projects: "project", experiments: "experiment" },
  bases = { projects: "/projektai/", experiments: "/eksperimentai/" };
let timezone = "Europe/Zurich";
export function setOperationalTimezone(value: string) {
  timezone = value;
}
export const operationProgress = (record: any, kind: Kind) =>
  pursuitProgress(record, kind, todayIn(timezone));
function changed() {
  document.dispatchEvent(new CustomEvent("operations:changed"));
}
function localDate(value: string | null) {
  return value?.includes("T")
    ? todayIn(timezone, new Date(value))
    : value || "";
}
function summary(detail: HTMLDetailsElement, record: any, kind: Kind) {
  const s = node("summary", undefined, { class: "index-entry" }),
    meta = node("div", undefined, { class: "entry-meta" }),
    copy = node("div", undefined, { class: "entry-copy" });
  meta.append(node("span", record.status));
  if (record.visibility === "private")
    meta.append(node("span", "Private", { class: "private-label" }));
  copy.append(node("h3", record.title));
  const progress = operationProgress(record, kind);
  if (progress) copy.append(node("p", progress, { class: "inline-progress" }));
  s.append(
    meta,
    copy,
    node("span", "⌄", { class: "entry-arrow", "aria-hidden": "true" }),
  );
  detail.querySelector(":scope > summary")?.replaceWith(s);
  if (!detail.querySelector(":scope > summary")) detail.prepend(s);
}
export function operationForm(
  host: HTMLElement,
  record: any,
  kind: Kind,
  saved: (record: any) => void | Promise<void>,
  cancel: () => void,
) {
  const form = node("form", undefined, { class: "inline-form" }),
    experiment = kind === "experiments";
  if (record.domain)
    form.append(
      node(
        "p",
        [domainNames[record.domain as keyof typeof domainNames], record.topic]
          .filter(Boolean)
          .join(" · "),
        { class: "entry-tags" },
      ),
    );
  const title = field(
    form,
    experiment ? "What do I want to test?" : "Title",
    "title",
    record.title,
  );
  title.required = true;
  if (!experiment)
    field(
      form,
      "Desired outcome",
      "outcome",
      record.outcome,
      "textarea",
    ).required = true;
  else
    field(
      form,
      "Description (optional)",
      "description",
      record.description,
      "textarea",
    );
  visibility(form, record.visibility || "private");
  const extra = more(form);
  if (!experiment) {
    field(
      extra,
      "Description (optional)",
      "description",
      record.description,
      "textarea",
    );
    field(
      extra,
      "Status",
      "status",
      record.status,
      "select",
      ["planned", "active", "paused", "completed", "abandoned"].map(
        (value) => ({
          value,
          label: value.charAt(0).toUpperCase() + value.slice(1),
        }),
      ),
    );
    const progress = field(
      extra,
      "Progress (optional, %)",
      "progress",
      record.progress ?? "",
      "number",
    ) as HTMLInputElement;
    progress.min = "0";
    progress.max = "100";
    progress.step = "1";
  }
  const dates = node("div", undefined, { class: "inline-fields" });
  extra.append(dates);
  field(dates, "Start", "start_date", localDate(record.start_date), "date");
  field(
    dates,
    "Target end (optional)",
    "end_date",
    localDate(record.end_date),
    "date",
  );
  if (experiment) {
    field(
      extra,
      "Show progress",
      "show_progress",
      record.show_progress,
      "checkbox",
    );
    const project = field(
      extra,
      "Project (optional)",
      "project",
      record.project,
      "select",
      [
        { value: "", label: "None" },
        ...(record.project
          ? [{ value: record.project, label: "Linked project" }]
          : []),
      ],
    ) as HTMLSelectElement;
    void api("ops/list?kind=projects")
      .then((rows) => {
        project.replaceChildren(
          option("", "None"),
          ...rows.map((r: any) => option(r.id, r.title)),
        );
        project.value = record.project || "";
      })
      .catch(() => {});
    field(
      extra,
      "Protocol (optional)",
      "protocol",
      record.protocol,
      "textarea",
    );
    if (record.hypothesis)
      field(extra, "Hypothesis", "hypothesis", record.hypothesis, "textarea");
    if (record.observe)
      field(extra, "What I observe", "observe", record.observe, "textarea");
    if (record.conclusion)
      field(extra, "Conclusion", "conclusion", record.conclusion, "textarea");
  }
  taxonomy(extra, record);
  field(extra, "Tags", "tags", (record.tags || []).join(", "));
  field(
    extra,
    "Feature on homepage (public only)",
    "featured",
    record.featured,
    "checkbox",
  );
  const actions = node("div", undefined, { class: "inline-actions" });
  actions.append(
    node("button", "Save", { type: "submit", class: "inline-primary" }),
    button("Cancel", () => {
      clean(form);
      cancel();
    }),
  );
  form.append(actions);
  const feedback = report(form);
  track(form);
  host.replaceChildren(form);
  title.focus();
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void run(form, feedback, async () => {
      const v = values(form);
      const next = {
        ...record,
        ...v,
        tags: splitList(v.tags),
        ...(kind === "projects"
          ? { progress: v.progress === "" ? null : Number(v.progress) }
          : {}),
      };
      // Preserve legacy time values unless the author deliberately edits the date.
      for (const key of ["start_date", "end_date"])
        if (v[key] === localDate(record[key])) next[key] = record[key] || null;
      if (
        record.visibility === "public" &&
        next.visibility === "private" &&
        !confirm(
          "Make this " +
            names[kind] +
            " private and remove it from public pages?",
        )
      )
        return;
      status(feedback, "Saving…");
      const result = await api("ops/save", { kind, record: next });
      clean(form);
      await saved(result);
      changed();
    });
  });
}
async function observationList(host: HTMLElement, id: string) {
  const entries = await api("ops/observations?id=" + encodeURIComponent(id));
  host.replaceChildren(
    ...entries.map((entry: any) => {
      const p = node("div", undefined, { class: "observation" });
      p.append(
        node("time", entry.date, { class: "entry-tags", datetime: entry.date }),
        node("p", entry.body, { class: "preserve-lines" }),
      );
      return p;
    }),
  );
}
export async function showOperation(
  detail: HTMLDetailsElement,
  record: any,
  kind: Kind,
) {
  detail.dataset.id = record.id;
  if (!detail.hasAttribute("data-dedicated")) summary(detail, record, kind);
  else
    detail.closest("article")!.querySelector("h1")!.textContent = record.title;
  const panel = detail.querySelector<HTMLElement>("[data-operation-panel]")!;
  const read = node("div", undefined, { class: "prose" });
  for (const [key, label] of kind === "projects"
    ? [
        ["outcome", "Desired outcome"],
        ["description", ""],
      ]
    : [
        ["description", ""],
        ["hypothesis", "Hypothesis"],
        ["protocol", "Protocol"],
        ["observe", "What I observe"],
        ["conclusion", "Conclusion"],
      ])
    if (record[key]) {
      if (label) read.append(node("h3", label));
      read.append(node("p", record[key], { class: "preserve-lines" }));
    }
  const dates = [
    record.start_date && "Start: " + localDate(record.start_date),
    record.end_date && "Target end: " + localDate(record.end_date),
  ]
    .filter(Boolean)
    .join(" · ");
  if (dates) read.append(node("p", dates, { class: "entry-tags" }));
  const tools = node("div", undefined, { class: "inline-actions" }),
    feedback = node("p", undefined, { role: "status", class: "inline-status" });
  const update = (next: any) => showOperation(detail, next, kind);
  const changeState = (state: string) =>
    run(panel, feedback, async () => {
      if (
        hasUnsavedChanges(panel) &&
        !confirm("Discard the unsaved observation?")
      )
        return;
      const next = await api("ops/save", {
        kind,
        record: { ...record, status: state },
      });
      await update(next);
      changed();
    });
  tools.append(
    button("Edit", () => {
      if (
        hasUnsavedChanges(panel) &&
        !confirm("Discard the unsaved observation?")
      )
        return;
      operationForm(panel, record, kind, update, () => void update(record));
    }),
  );
  if (kind === "experiments") {
    if (["idea", "planned"].includes(record.status))
      tools.append(
        button("Start experiment", () =>
          run(panel, feedback, async () => {
            await update(
              await api("ops/start", {
                id: record.id,
                version: record.version,
                date: todayIn(timezone),
              }),
            );
            changed();
          }),
        ),
      );
    if (record.status === "active")
      tools.append(button("Pause", () => changeState("paused")));
    if (record.status === "paused")
      tools.append(
        button("Resume", () => changeState("active")),
        button("Abandon", () => changeState("abandoned")),
      );
    if (["active", "paused"].includes(record.status))
      tools.append(
        button("Complete", () => {
          if (
            hasUnsavedChanges(panel) &&
            !confirm("Discard the unsaved observation?")
          )
            return;
          const form = node("form", undefined, { class: "inline-form" });
          field(
            form,
            "Conclusion (optional)",
            "conclusion",
            record.conclusion,
            "textarea",
          );
          const actions = node("div", undefined, { class: "inline-actions" });
          actions.append(
            node("button", "Save", { type: "submit", class: "inline-primary" }),
            button("Cancel", () => void update(record)),
          );
          form.append(actions);
          const message = report(form);
          track(form);
          panel.replaceChildren(form);
          form.addEventListener("submit", (event) => {
            event.preventDefault();
            void run(form, message, async () => {
              const next = await api("ops/save", {
                kind,
                record: {
                  ...record,
                  status: "completed",
                  conclusion: values(form).conclusion,
                },
              });
              clean(form);
              await update(next);
              changed();
            });
          });
        }),
      );
  } else {
    if (["planned", "paused"].includes(record.status))
      tools.append(
        button(record.status === "paused" ? "Resume" : "Start project", () =>
          changeState("active"),
        ),
      );
    if (record.status === "active")
      tools.append(
        button("Pause", () => changeState("paused")),
        button("Complete", () => changeState("completed")),
      );
  }
  tools.append(
    button(
      record.visibility === "public" ? "Make private" : "Make public",
      () =>
        run(panel, feedback, async () => {
          if (
            hasUnsavedChanges(panel) &&
            !confirm("Discard the unsaved observation?")
          )
            return;
          if (
            record.visibility === "public" &&
            !confirm(
              "Make this " +
                names[kind] +
                " private and remove it from public pages?",
            )
          )
            return;
          await update(
            await api("ops/save", {
              kind,
              record: {
                ...record,
                visibility:
                  record.visibility === "public" ? "private" : "public",
              },
            }),
          );
          changed();
        }),
    ),
    button("Delete", () =>
      run(panel, feedback, async () => {
        if (!confirm("Delete this " + names[kind] + "?")) return;
        await api("ops/delete", { kind, record, confirm: true });
        if (detail.hasAttribute("data-dedicated")) location.assign(bases[kind]);
        else detail.closest("li")?.remove();
        changed();
      }),
    ),
  );
  if (record.visibility === "public" && !detail.hasAttribute("data-dedicated"))
    tools.append(
      node("a", "Open " + names[kind] + " →", {
        href: bases[kind] + record.slug + "/",
        class: "quiet-link",
      }),
    );
  panel.replaceChildren(read, tools, feedback);
  if (kind === "experiments") {
    const observations = node("section", undefined, {
        class: "inline-observations",
      }),
      list = node("div");
    observations.append(node("h3", "Observations"), list);
    panel.append(observations);
    void observationList(list, record.id).catch((e) =>
      status(feedback, e.message, true),
    );
    if (record.status === "active") {
      const form = node("form", undefined, { class: "inline-form" });
      const body = field(form, "Observation", "body", "", "textarea");
      body.setAttribute("placeholder", "Write a quick observation…");
      body.required = true;
      field(more(form), "Date", "date", todayIn(timezone), "date");
      form.append(
        node("button", "Add observation", {
          type: "submit",
          class: "quiet-action",
        }),
      );
      const message = report(form);
      track(form);
      observations.prepend(form);
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        void run(form, message, async () => {
          await api("ops/observation", {
            experiment: record.id,
            ...values(form),
          });
          body.value = "";
          clean(form);
          await observationList(list, record.id);
          status(message, "Observation saved.");
        });
      });
    }
  }
  if (kind === "projects") {
    const experiments = node("section", undefined, { class: "inline-related" });
    panel.append(experiments);
    void api("ops/list?kind=experiments")
      .then((rows) => {
        const linked = rows.filter((r: any) => r.project === record.id);
        if (!linked.length) return;
        experiments.append(node("h3", "Experiments"));
        const list = node("ol", undefined, { class: "article-index" });
        for (const record of linked)
          list.append(operationRow(record, "experiments"));
        experiments.append(list);
      })
      .catch(() => {});
  } else if (record.project) {
    const projectLink = node("p");
    panel.append(projectLink);
    void api(
      "ops/record?kind=projects&id=" + encodeURIComponent(record.project),
    )
      .then((r) =>
        projectLink.append(
          node("a", r.title, {
            href: "/projektai/#item=" + encodeURIComponent(r.id),
          }),
        ),
      )
      .catch(() => {});
  }
  const related = node("section", undefined, { class: "inline-related" });
  panel.append(related);
  void notebookCatalog()
    .then((c) => {
      const notes = catalogItems(c, "article").filter(
        (n) => (kind === "projects" ? n.project : n.experiment) === record.id,
      );
      if (notes.length) {
        related.append(node("h3", "Notes"));
        for (const n of notes) {
          const p = node("p");
          p.append(
            node(
              "a",
              n.title + (n.visibility === "private" ? " · Private" : ""),
              {
                href:
                  n.visibility === "public"
                    ? n.url
                    : "/uzrasai/#item=" + encodeURIComponent(n.file),
              },
            ),
          );
          related.append(p);
        }
      }
    })
    .catch(() => {});
}
const bound = new WeakSet<HTMLDetailsElement>();
export function wireOperation(detail: HTMLDetailsElement) {
  if (bound.has(detail)) return;
  bound.add(detail);
  detail.addEventListener("toggle", () => {
    if (!detail.open) return;
    if (detail.dataset.skipLoad) {
      delete detail.dataset.skipLoad;
      return;
    }
    if (detail.querySelector("form")) return;
    const feedback = report(
      detail.querySelector<HTMLElement>("[data-operation-panel]")!,
    );
    void api(
      "ops/record?kind=" +
        detail.dataset.kind +
        "&id=" +
        encodeURIComponent(detail.dataset.id!),
    )
      .then((record) => {
        if (detail.isConnected && detail.open)
          return showOperation(detail, record, detail.dataset.kind as Kind);
      })
      .catch((e) => status(feedback, e.message, true));
  });
}
export function operationRow(record: any, kind: Kind) {
  const li = node("li"),
    detail = node("details", undefined, {
      class: "notebook-entry",
      "data-operation": "",
      "data-kind": kind,
      "data-id": record.id,
    });
  detail.append(
    node("div", undefined, {
      class: "inline-content",
      "data-operation-panel": "",
    }),
  );
  li.append(detail);
  summary(detail, record, kind);
  wireOperation(detail);
  return li;
}
export function operationSurface(
  root: HTMLElement,
  records: any[],
  kind: Kind,
) {
  const target = root.querySelector<HTMLElement>("[data-operation-list]")!;
  const filtered = root.hasAttribute("data-current")
    ? records.filter((r) =>
        kind === "projects"
          ? ["active", "paused"].includes(r.status)
          : ["idea", "planned", "active", "paused"].includes(r.status),
      )
    : records;
  const list = node("ol", undefined, { class: "article-index" });
  for (const record of filtered) list.append(operationRow(record, kind));
  target.replaceChildren(list);
  if (!filtered.length)
    target.append(node("p", "No " + kind + " here yet.", { class: "muted" }));
  const slot = root.querySelector<HTMLElement>("[data-operation-create]")!;
  if (!slot.children.length)
    slot.append(
      button("+ New " + names[kind], () => {
        const host = root.querySelector<HTMLElement>("[data-operation-new]")!;
        if (host.querySelector("form")) {
          host.querySelector<HTMLInputElement>("input")?.focus();
          return;
        }
        operationForm(
          host,
          {
            title: "",
            outcome: "",
            description: "",
            status: kind === "experiments" ? "idea" : "active",
            visibility: "private",
            domain: root.dataset.domain || "",
            topic: root.dataset.topic || "",
            tags: [],
            principles: [],
            progress: null,
            show_progress: false,
          },
          kind,
          async (record) => {
            host.replaceChildren();
            target.querySelector(".muted")?.remove();
            const li = operationRow(record, kind);
            list.prepend(li);
            const detail = li.querySelector("details")!;
            detail.dataset.skipLoad = "true";
            detail.open = true;
            await showOperation(detail, record, kind);
          },
          () => host.replaceChildren(),
        );
      }),
    );
  const id = new URLSearchParams(location.hash.replace(/^#/, "")).get("item");
  if (id) {
    const detail = [
      ...list.querySelectorAll<HTMLDetailsElement>("details"),
    ].find((d) => d.dataset.id === id);
    if (detail) {
      detail.open = true;
      detail.scrollIntoView({ block: "nearest" });
    }
  }
}
void author().then(async (a) => {
  if (!a.authenticated) return;
  try {
    setOperationalTimezone((await api("calendar/preferences")).timezone);
  } catch {}
  document
    .querySelectorAll<HTMLDetailsElement>("[data-operation]")
    .forEach(wireOperation);
  for (const target of document.querySelectorAll<HTMLElement>(
    "[data-inline-operation]",
  )) {
    const kind = target.dataset.inlineOperation as Kind,
      content = target.nextElementSibling as HTMLElement,
      feedback = report(target);
    const edit = button("Edit", () =>
      run(target, feedback, async () => {
        const record = await api(
          "ops/record?kind=" +
            kind +
            "&id=" +
            encodeURIComponent(target.dataset.id!),
        );
        content.hidden = true;
        operationForm(
          target,
          record,
          kind,
          async (next) => {
            const detail = node("details", undefined, {
              class: "notebook-entry",
              "data-dedicated": "",
            });
            detail.open = true;
            const summary = node("summary", "Saved " + names[kind]);
            summary.hidden = true;
            detail.append(
              summary,
              node("div", undefined, {
                class: "inline-content",
                "data-operation-panel": "",
              }),
            );
            target.replaceChildren(detail);
            await showOperation(detail, next, kind);
          },
          () => {
            content.hidden = false;
            target.replaceChildren(edit, feedback);
          },
        );
      }),
    );
    target.prepend(edit);
  }
  for (const root of document.querySelectorAll<HTMLElement>(
    "[data-operations]:not([data-dabar-operations])",
  )) {
    const feedback = report(root);
    try {
      operationSurface(
        root,
        await api("ops/list?kind=" + root.dataset.operations),
        root.dataset.operations as Kind,
      );
    } catch (e) {
      status(feedback, (e as Error).message, true);
    }
  }
});
