import "./operations";
import { api, node, safePreview } from "./client";
import { author, notebookCatalog, catalogItems, reference } from "./author";
import { button, report, run, status, hasUnsavedChanges } from "./inline-ui";
import {
  newWriting,
  writingForm,
  changeVisibility,
  deleteWriting,
  settleWriting,
} from "./writing";
import { domains, domainNames, topics } from "../utils/domains";
import type { Editable, CatalogItem } from "../utils/editor-model";
import "../styles/inline.css";

const bound = new WeakSet<HTMLElement>();
function context(root: HTMLElement) {
  const query = new URLSearchParams(location.search),
    d = root.dataset.domain || query.get("domain") || "";
  const domain = domains.includes(d as any) ? d : "",
    t = root.dataset.topic || query.get("topic") || "";
  const topic =
    domain &&
    topics[domain as keyof typeof topics]?.some((topic) => topic.id === t)
      ? t
      : "";
  return { domain, topic };
}
function matches(root: HTMLElement, item: CatalogItem) {
  const { domain, topic } = context(root);
  return (
    (!domain || item.domain === domain) && (!topic || item.topic === topic)
  );
}
function summary(detail: HTMLDetailsElement, item: CatalogItem | Editable) {
  const s = node("summary", undefined, { class: "index-entry" }),
    meta = node("div", undefined, { class: "entry-meta" });
  const date = item.pubDate?.slice(0, 10);
  if (date)
    meta.append(node("time", date.replaceAll("-", "."), { datetime: date }));
  if (item.domain) {
    const domain = item.domain as keyof typeof topics;
    meta.append(
      node(
        "span",
        [
          domainNames[domain],
          topics[domain]?.find((t) => t.id === item.topic)?.title,
        ]
          .filter(Boolean)
          .join(" · "),
      ),
    );
  }
  if (item.pending)
    meta.append(
      node(
        "span",
        item.pending.direction === "public"
          ? "Publishing…"
          : "Removing public version…",
      ),
    );
  else if (item.visibility === "private")
    meta.append(node("span", "Private", { class: "private-label" }));
  const copy = node("div", undefined, { class: "entry-copy" });
  copy.append(node("h3", item.title));
  if (item.description) copy.append(node("p", item.description));
  s.append(
    meta,
    copy,
    node("span", "⌄", { class: "entry-arrow", "aria-hidden": "true" }),
  );
  detail.querySelector(":scope > summary")?.replaceWith(s);
  if (!detail.querySelector(":scope > summary")) detail.prepend(s);
  const li = detail.closest<HTMLElement>("li");
  if (li) {
    li.dataset.domain = item.domain || "";
    li.dataset.topic = item.topic || "";
    li.dataset.date = date || "";
  }
}
function emptyState(root: HTMLElement) {
  const rows = [...root.querySelectorAll<HTMLElement>(".article-index > li")];
  const empty = root.querySelector<HTMLElement>("[data-empty-notebook]");
  if (empty) empty.hidden = rows.some((row) => !row.hidden);
}
async function relatedPrinciples(target: HTMLElement, doc: Editable) {
  const catalog = await notebookCatalog();
  if (doc.kind === "article" && doc.principles.length) {
    const list = node("ul", undefined, { class: "text-index" });
    for (const ref of doc.principles) {
      const p = catalogItems(catalog, "principle").find(
        (p) => reference(p) === ref || p.file === ref || p.id === ref,
      );
      if (!p) continue;
      const li = node("li");
      li.append(
        node("a", p.title + (p.visibility === "private" ? " · Private" : ""), {
          href:
            p.visibility === "public"
              ? p.url
              : "/principai/#item=" + encodeURIComponent(p.file),
        }),
      );
      list.append(li);
    }
    if (list.children.length) {
      const section = node("section", undefined, { class: "inline-related" });
      section.append(node("h3", "Principles"), list);
      target.append(section);
    }
  }
  if (doc.kind === "principle") {
    const ids = [
      doc.file,
      doc.draftFile,
      doc.file.split("/").at(-1)?.replace(/\.md$/, ""),
    ].filter(Boolean);
    const connected = catalogItems(catalog, "article").filter((n) =>
      n.principles?.some((ref) => ids.includes(ref)),
    );
    if (connected.length) {
      const section = node("section", undefined, { class: "inline-related" });
      section.append(node("h3", "Source notes"));
      const list = node("ul", undefined, { class: "text-index" });
      for (const n of connected) {
        const li = node("li");
        li.append(
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
        list.append(li);
      }
      section.append(list);
      target.append(section);
    }
  }
}
function removeWriting(detail: HTMLDetailsElement) {
  if (detail.hasAttribute("data-dedicated")) {
    location.assign(
      detail.dataset.kind === "principle" ? "/principai/" : "/uzrasai/",
    );
    return;
  }
  const root = detail.closest<HTMLElement>("[data-notebook]");
  detail.closest("li")?.remove();
  if (root) emptyState(root);
}
export async function showWriting(detail: HTMLDetailsElement, doc: Editable) {
  if (!detail.hasAttribute("data-dedicated")) summary(detail, doc);
  else {
    const article = detail.closest("article")!;
    article.querySelector("h1")!.textContent = doc.title;
    const standfirst = article.querySelector(".standfirst");
    if (standfirst) standfirst.textContent = doc.description;
  }
  detail.dataset.file =
    doc.visibility === "public" ? doc.file : doc.draftFile || doc.file;
  const panel = detail.querySelector<HTMLElement>("[data-writing-panel]")!,
    read = node("div", undefined, { class: "prose" });
  safePreview(read, doc.body, doc.attachments);
  const tools = node("div", undefined, { class: "inline-actions" }),
    feedback = report(panel);
  const render = async (next: Editable, result?: any) => {
    if (result?.deleted) {
      removeWriting(detail);
      return;
    }
    await showWriting(detail, next);
    detail.open = true;
    document.dispatchEvent(new CustomEvent("notebook:changed"));
  };
  if (!doc.pending) {
    tools.append(
      button("Edit", () =>
        writingForm(panel, doc, render, () => void showWriting(detail, doc)),
      ),
    );
    if (["article", "principle"].includes(doc.kind)) {
      tools.append(
        button(
          doc.visibility === "public" ? "Make private" : "Make public",
          () =>
            run(panel, feedback, async () => {
              const result = await changeVisibility(
                doc,
                doc.visibility === "public" ? "private" : "public",
              );
              if (result) await render(result.document, result);
            }),
        ),
      );
      tools.append(
        button("Delete", () =>
          run(panel, feedback, async () => {
            const result = await deleteWriting(doc);
            if (result) await render(result.document, result);
          }),
        ),
      );
    }
  }
  if (
    doc.visibility === "public" &&
    doc.url &&
    !detail.hasAttribute("data-dedicated")
  )
    tools.append(
      node(
        "a",
        doc.kind === "article" ? "Open article →" : "Open principle →",
        { href: doc.url, class: "quiet-link" },
      ),
    );
  const related = node("div");
  panel.replaceChildren(read, related, tools, feedback);
  void relatedPrinciples(related, doc).catch(() => {});
  if (doc.pending)
    void settleWriting(doc, feedback, async (next, deleted) => {
      void notebookCatalog(true).catch(() => {});
      if (deleted) {
        removeWriting(detail);
        document.dispatchEvent(new CustomEvent("notebook:changed"));
        return;
      }
      await render(next);
    });
}
function wireWriting(detail: HTMLDetailsElement) {
  if (bound.has(detail)) return;
  bound.add(detail);
  detail.addEventListener("toggle", () => {
    if (!detail.open) return;
    if (detail.dataset.skipLoad) {
      delete detail.dataset.skipLoad;
      return;
    }
    const panel = detail.querySelector<HTMLElement>("[data-writing-panel]")!;
    if (panel.querySelector("form")) return;
    const feedback = report(panel);
    status(feedback, "Loading saved note…");
    void api("editor/note?file=" + encodeURIComponent(detail.dataset.file!))
      .then((doc) => {
        if (detail.open && detail.isConnected) return showWriting(detail, doc);
      })
      .catch((e) => status(feedback, e.message, true));
  });
}
function row(item: CatalogItem) {
  const li = node("li"),
    detail = node("details", undefined, {
      class: "notebook-entry",
      "data-writing": "",
      "data-kind": item.kind,
      "data-file": item.file,
    });
  detail.append(
    node("div", undefined, {
      class: "inline-content",
      "data-writing-panel": "",
    }),
  );
  li.append(detail);
  summary(detail, item);
  wireWriting(detail);
  return li;
}
async function refreshSurface(root: HTMLElement) {
  const kind = root.dataset.kind as "article" | "principle",
    catalog = await notebookCatalog();
  const items = catalogItems(catalog, kind);
  const list = node("ol", undefined, { class: "article-index" });
  for (const item of items) if (matches(root, item)) list.append(row(item));
  root.querySelector("[data-notebook-list]")!.replaceChildren(list);
  status(
    root.querySelector<HTMLElement>("[data-notebook-status]")!,
    catalog.warning || "",
  );
  emptyState(root);
  const target = new URLSearchParams(location.hash.replace(/^#/, "")).get(
    "item",
  );
  if (target) {
    const detail = [
      ...list.querySelectorAll<HTMLDetailsElement>("details[data-file]"),
    ].find((d) => d.dataset.file === target);
    if (detail) {
      detail.open = true;
      detail.scrollIntoView({ block: "nearest" });
    }
  }
}
function newItem(root: HTMLElement) {
  const host = root.querySelector<HTMLElement>("[data-new-item]")!,
    { domain, topic } = context(root),
    doc = newWriting(
      root.dataset.kind as "article" | "principle",
      domain,
      topic,
    );
  if (host.querySelector("form")) {
    host.querySelector<HTMLInputElement>("input")?.focus();
    return;
  }
  void writingForm(
    host,
    doc,
    async (saved) => {
      const list =
        root.querySelector<HTMLOListElement>(".article-index") ||
        node("ol", undefined, { class: "article-index" });
      if (!list.isConnected)
        root.querySelector("[data-notebook-list]")!.append(list);
      const li = row({
        ...saved,
        file: saved.draftFile || saved.file,
        sha: saved.draftSha || saved.sha || "",
      } as CatalogItem);
      list.prepend(li);
      host.replaceChildren();
      const detail = li.querySelector("details")!;
      detail.dataset.skipLoad = "true";
      detail.open = true;
      await showWriting(detail, saved);
      emptyState(root);
    },
    () => host.replaceChildren(),
  );
}
function applyFilters() {
  const nav = document.querySelector<HTMLElement>("[data-domain-filter]");
  if (!nav) return;
  const root = document.querySelector<HTMLElement>(
    "[data-notebook][data-kind=article]",
  );
  if (!root) return;
  const { domain, topic } = context(root),
    topicNav = document.querySelector<HTMLElement>("[data-topic-filter]")!;
  topicNav.replaceChildren();
  for (const link of nav.querySelectorAll<HTMLAnchorElement>("[data-filter]")) {
    if (link.dataset.filter === domain)
      link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  if (domain)
    for (const t of [
      { id: "", title: "All topics" },
      ...topics[domain as keyof typeof topics],
    ]) {
      const a = node("a", t.title, {
        href: "/uzrasai/?domain=" + domain + (t.id ? "&topic=" + t.id : ""),
        "data-topic": t.id,
      });
      if (t.id === topic) a.setAttribute("aria-current", "page");
      topicNav.append(a);
    }
  root
    .querySelectorAll<HTMLElement>(".article-index > li")
    .forEach(
      (li) =>
        (li.hidden =
          (!!domain && li.dataset.domain !== domain) ||
          (!!topic && li.dataset.topic !== topic)),
    );
  emptyState(root);
}
for (const selector of ["[data-domain-filter]", "[data-topic-filter]"])
  document.querySelector(selector)?.addEventListener("click", (event) => {
    const link = (event.target as Element).closest<HTMLAnchorElement>("a");
    if (
      !link ||
      (event instanceof MouseEvent &&
        (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey))
    )
      return;
    event.preventDefault();
    if (
      hasUnsavedChanges() &&
      !confirm("Discard unsaved changes and change the filter?")
    )
      return;
    history.pushState(null, "", link.href);
    applyFilters();
    void author().then((a) => {
      if (a.authenticated) {
        const root = document.querySelector<HTMLElement>(
          "[data-notebook][data-kind=article]",
        );
        if (root) void refreshSurface(root);
      }
    });
  });
window.addEventListener("popstate", () => {
  applyFilters();
  void author().then((a) => {
    if (a.authenticated)
      document
        .querySelectorAll<HTMLElement>("[data-notebook]")
        .forEach((root) => void refreshSurface(root));
  });
});
document.addEventListener("notebook:changed", () => {
  applyFilters();
  document.querySelectorAll<HTMLElement>("[data-notebook]").forEach(emptyState);
});
applyFilters();
void author().then(async (auth) => {
  if (!auth.authenticated) return;
  document
    .querySelectorAll<HTMLElement>("[data-sign-in]")
    .forEach((el) => (el.hidden = true));
  document
    .querySelectorAll<HTMLElement>("[data-author-link]")
    .forEach((el) => (el.hidden = false));
  document
    .querySelectorAll<HTMLDetailsElement>("[data-writing]")
    .forEach(wireWriting);
  for (const root of document.querySelectorAll<HTMLElement>(
    "[data-notebook]",
  )) {
    const create = root.querySelector<HTMLElement>("[data-create-slot]")!;
    const b = button("+", () => newItem(root));
    b.setAttribute(
      "aria-label",
      root.dataset.kind === "principle" ? "New principle" : "New note",
    );
    b.classList.add("notebook-plus");
    create.append(b);
    void refreshSurface(root).catch((e) =>
      status(
        root.querySelector<HTMLElement>("[data-notebook-status]")!,
        e.message,
        true,
      ),
    );
  }
  for (const target of document.querySelectorAll<HTMLElement>(
    "[data-inline-writing]",
  )) {
    const content = target.nextElementSibling as HTMLElement,
      feedback = report(target);
    const edit = button("Edit", () =>
      run(target, feedback, async () => {
        const doc = await api(
          "editor/note?file=" +
            encodeURIComponent(target.dataset.inlineWriting!),
        );
        content.hidden = true;
        const restore = () => {
          content.hidden = false;
          target.replaceChildren(edit, feedback);
        };
        await writingForm(
          target,
          doc,
          async (saved) => {
            const detail = node("details", undefined, {
              class: "notebook-entry",
              "data-dedicated": "",
              "data-kind": saved.kind,
            });
            detail.open = true;
            const summary = node("summary", "Saved note");
            summary.hidden = true;
            detail.append(
              summary,
              node("div", undefined, {
                class: "inline-content",
                "data-writing-panel": "",
              }),
            );
            target.replaceChildren(detail);
            await showWriting(detail, saved);
          },
          restore,
        );
      }),
    );
    target.prepend(edit);
  }
});
