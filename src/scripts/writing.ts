import { api, node, option, splitList } from "./client";
import {
  button,
  field,
  visibility,
  values,
  more,
  report,
  run,
  track,
  clean,
  status,
} from "./inline-ui";
import { notebookCatalog, catalogItems, reference } from "./author";
import {
  blankFields,
  type Editable,
  type CatalogItem,
} from "../utils/editor-model";
import { domains, domainNames, topics } from "../utils/domains";
import { todayIn } from "../lib/calendar/model";
import { slugify } from "../server/documents";
export const newWriting = (
  kind: "article" | "principle",
  domain = "",
  topic = "",
): Editable => ({
  ...blankFields(),
  kind,
  key: crypto.randomUUID(),
  file: "",
  sha: null,
  url: "",
  domain: domain as any,
  topic,
  pubDate: todayIn(),
  visibility: "private",
  attachments: [],
  newPrinciples: [],
});
export function taxonomy(target: HTMLElement, value: any) {
  const domain = field(
    target,
    "Domain",
    "domain",
    value.domain || "",
    "select",
    [
      { value: "", label: "Unassigned" },
      ...domains.map((d) => ({ value: d, label: domainNames[d] })),
    ],
  ) as HTMLSelectElement;
  const topic = field(
    target,
    "Topic",
    "topic",
    value.topic || "",
    "select",
    [],
  ) as HTMLSelectElement;
  const update = (chosen: string) => {
    topic.replaceChildren(
      option("", "Unassigned"),
      ...(topics[domain.value as keyof typeof topics] || []).map((t) =>
        option(t.id, t.title),
      ),
    );
    topic.value = chosen;
  };
  update(value.topic || "");
  domain.addEventListener("change", () => update(""));
}
export async function writingForm(
  host: HTMLElement,
  document: Editable,
  saved: (document: Editable, result?: any) => void | Promise<void>,
  cancel: () => void,
) {
  document = {
    ...document,
    attachments: document.attachments.map((image) => ({ ...image })),
  };
  let newPrincipleDraft: { title: string; id: string } | undefined;
  const form = node("form", undefined, { class: "inline-form" }),
    page = ["home", "about"].includes(document.kind);
  const context = [
    document.domain && domainNames[document.domain],
    document.domain &&
      topics[document.domain]?.find((t) => t.id === document.topic)?.title,
  ]
    .filter(Boolean)
    .join(" · ");
  if (context) form.append(node("p", context, { class: "entry-tags" }));
  const title = field(
    form,
    document.kind === "article"
      ? "Subject"
      : document.kind === "principle"
        ? "Principle"
        : "Title",
    "title",
    document.title,
  );
  title.required = true;
  title.setAttribute("maxlength", "500");
  if (page)
    field(
      form,
      "Introduction",
      "description",
      document.description,
      "textarea",
    );
  const body = field(
    form,
    document.kind === "article"
      ? "Note"
      : document.kind === "principle"
        ? "Explanation (optional)"
        : "Text",
    "body",
    document.body,
    "textarea",
  );
  body.classList.add("note-input");
  let choices: CatalogItem[] = [],
    principleInput: HTMLInputElement | undefined;
  const selected = new Set(document.principles);
  if (document.kind === "article") {
    const principleHost = node("div", undefined, { class: "principle-picker" });
    form.append(principleHost);
    const selectedHost = node("div");
    principleHost.append(selectedHost);
    principleInput = field(
      principleHost,
      "Principle (optional)",
      "newPrinciple",
      "",
      "text",
    ) as HTMLInputElement;
    const datalist = node("datalist", undefined, {
      id: "principles-" + crypto.randomUUID(),
    });
    principleInput.setAttribute("list", datalist.id);
    principleInput.placeholder =
      "Choose an existing principle or write a new one";
    principleHost.append(datalist);
    principleHost.append(
      node("p", "Private principles stay private when a note is made public.", {
        class: "editor-help",
      }),
    );
    void notebookCatalog()
      .then((catalog) => {
        choices = catalogItems(catalog, "principle");
        datalist.replaceChildren(
          ...choices.map((p) => option(p.title, p.title)),
        );
        for (const ref of selected) {
          const p = choices.find(
            (p) => reference(p) === ref || p.file === ref || p.id === ref,
          );
          const label = node(
              "label",
              p?.title ||
                document.newPrinciples.find((p) => p.id === ref)?.title ||
                "Linked principle",
              { class: "inline-check" },
            ),
            check = node("input", undefined, { type: "checkbox" });
          check.checked = true;
          check.addEventListener("change", () =>
            check.checked ? selected.add(ref) : selected.delete(ref),
          );
          label.prepend(check);
          selectedHost.append(label);
        }
      })
      .catch(() => {
        principleInput!.placeholder =
          "Write a new principle (existing list unavailable)";
      });
  }
  if (!page)
    visibility(
      form,
      document.visibility ||
        (document.file && !document.draftFile ? "public" : "private"),
    );
  const extra = more(form);
  if (!page)
    field(
      extra,
      "Description (optional)",
      "description",
      document.description,
      "textarea",
    );
  if (document.kind === "article") {
    taxonomy(extra, document);
    field(extra, "Date", "pubDate", document.pubDate || todayIn(), "date");
    field(extra, "Tags", "tags", document.tags.join(", "));
    for (const [name, label, kind] of [
      ["project", "Project (optional)", "projects"],
      ["experiment", "Experiment (optional)", "experiments"],
    ] as const) {
      const current = document[name],
        select = field(extra, label, name, current, "select", [
          { value: "", label: "None" },
          ...(current ? [{ value: current, label: "Linked " + name }] : []),
        ]) as HTMLSelectElement;
      void api("ops/list?kind=" + kind)
        .then((rows) => {
          select.replaceChildren(
            option("", "None"),
            ...rows.map((r: any) => option(r.id, r.title)),
          );
          select.value = current;
        })
        .catch(() => {});
    }
    field(extra, "Image description", "heroImageAlt", document.heroImageAlt);
    field(extra, "Hero image (optional)", "heroImage", document.heroImage);
    const upload = field(
      extra,
      "Insert image",
      "upload",
      "",
      "file",
    ) as HTMLInputElement;
    upload.accept = "image/jpeg,image/png,image/webp,image/gif,image/avif";
    upload.addEventListener(
      "change",
      () =>
        void run(form, feedback, async () => {
          const file = upload.files?.[0];
          if (!file) return;
          const ext: Record<string, string> = {
            "image/jpeg": "jpg",
            "image/png": "png",
            "image/gif": "gif",
            "image/webp": "webp",
            "image/avif": "avif",
          };
          if (!ext[file.type] || file.size > 4 * 1024 * 1024)
            throw Error("Choose a supported image under 4 MB.");
          const data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result).split(",")[1]);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          const id = crypto.randomUUID(),
            path = "/images/editor-" + id + "." + ext[file.type];
          document.attachments.push({ id, path, mime: file.type, data });
          const text = body as HTMLTextAreaElement;
          text.setRangeText(
            "\n\n![](" + path + ")\n",
            text.selectionStart,
            text.selectionEnd,
            "end",
          );
          text.dispatchEvent(new Event("input", { bubbles: true }));
          upload.value = "";
          status(
            feedback,
            "Image added. Add its description inside the square brackets.",
          );
        }),
    );
  }
  if (document.kind === "home")
    field(extra, "Introduction title", "introTitle", document.introTitle);
  const actions = node("div", undefined, { class: "inline-actions" });
  const save = node("button", "Save", {
    type: "submit",
    class: "inline-primary",
  });
  actions.append(
    save,
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
      const v = values(form),
        next = {
          ...document,
          ...v,
          principles: [...selected],
          newPrinciples: [...document.newPrinciples],
        };
      if (typeof v.tags === "string") next.tags = splitList(v.tags);
      const newTitle = principleInput?.value.trim();
      if (newTitle) {
        const existing = choices.find(
          (p) =>
            p.title.trim().toLocaleLowerCase() === newTitle.toLocaleLowerCase(),
        );
        if (existing) next.principles.push(reference(existing));
        else {
          if (newPrincipleDraft?.title !== newTitle)
            newPrincipleDraft = {
              title: newTitle,
              id: slugify(newTitle) + "-" + crypto.randomUUID().slice(0, 8),
            };
          const id = newPrincipleDraft.id;
          next.newPrinciples.push({ id, title: newTitle, description: "" });
          next.principles.push(id);
        }
      }
      next.principles = [...new Set(next.principles)];
      const target = page ? "public" : v.visibility;
      const withdraw = document.visibility === "public" && target === "private";
      if (
        withdraw &&
        !confirm(
          "Make this item private and remove it from the live public site? Previously published revisions remain in public GitHub history.",
        )
      )
        return;
      status(feedback, "Saving…");
      const result = await api("editor/save-note", {
        document: next,
        visibility: target,
        confirm: withdraw,
      });
      clean(form);
      void notebookCatalog(true).catch(() => {});
      await saved(result.document, result);
    });
  });
}
export async function changeVisibility(
  document: Editable,
  target: "private" | "public",
) {
  if (
    target === "private" &&
    !confirm(
      "Make this item private and remove it from the live public site? Previously published revisions remain in public GitHub history.",
    )
  )
    return null;
  return api("editor/save-note", {
    document,
    visibility: target,
    confirm: target === "private",
  });
}
export async function deleteWriting(document: Editable) {
  if (
    !confirm(
      "Delete this " +
        (document.kind === "principle" ? "principle" : "note") +
        "?" +
        (document.visibility === "public"
          ? " Its public page will be removed. Previously published revisions remain in GitHub history."
          : ""),
    )
  )
    return null;
  return api("editor/delete-note", {
    document,
    visibility: document.visibility || "private",
    confirm: true,
  });
}
export async function settleWriting(
  document: Editable,
  feedback: HTMLElement,
  done: (document: Editable, deleted: boolean) => void | Promise<void>,
) {
  if (!document.pending) return;
  status(
    feedback,
    document.pending.direction === "public"
      ? "Saved. Publishing…"
      : "Saved privately. Removing the public version…",
  );
  for (let attempt = 0; attempt < 36 && feedback.isConnected; attempt++) {
    if (attempt) await new Promise((resolve) => setTimeout(resolve, 5000));
    try {
      const result = await api("editor/settle-note", {
        file: document.draftFile,
        version: document.draftSha,
      });
      if (!result.pending) {
        await done(result.document, !!result.deleted);
        return;
      }
    } catch (e) {
      status(feedback, (e as Error).message, true);
      return;
    }
  }
  status(
    feedback,
    "Your saved copy is safe. The live deployment is still pending; reopen this item to check again.",
  );
}
