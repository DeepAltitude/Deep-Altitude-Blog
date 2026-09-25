import { api, node } from "./client";
import { button, field, report, run, track, clean, status } from "./inline-ui";
import { isoWeek } from "../lib/calendar/model";
const label = (week: string) => "Week " + isoWeek(week).week;
export async function focusSurface(root: HTMLElement, current: any) {
  const now = root.querySelector<HTMLElement>("[data-current-focus]")!,
    history = root.querySelector<HTMLElement>("[data-focus-history]")!,
    more = root.querySelector<HTMLButtonElement>("[data-more-focus]")!;
  const show = (target: HTMLElement, record: any, isCurrent: boolean) => {
    const text = record.items.join(" · ");
    target.replaceChildren(
      node("h3", label(record.week)),
      node("p", text || "What matters most this week?", {
        class: "preserve-lines",
      }),
    );
    const actions = node("div", undefined, { class: "inline-actions" });
    actions.append(button("Edit", () => edit(target, record, isCurrent)));
    const feedback = report(target);
    if (!isCurrent)
      actions.append(
        button("Delete", () =>
          run(target, feedback, async () => {
            if (!confirm("Delete this week's focus?")) return;
            await api("ops/focus-delete", {
              week: record.week,
              version: record.version,
              confirm: true,
            });
            target.closest("details")?.remove();
          }),
        ),
      );
    target.append(actions);
    if (isCurrent && !text) edit(target, record, true);
  };
  const edit = (target: HTMLElement, record: any, isCurrent: boolean) => {
    const form = node("form", undefined, { class: "inline-form" });
    form.append(node("h3", label(record.week)));
    const input = field(
      form,
      "Focus",
      "focus",
      record.items.join(" · "),
    ) as HTMLInputElement;
    input.maxLength = 1000;
    input.placeholder = "What matters most this week?";
    const actions = node("div", undefined, { class: "inline-actions" });
    actions.append(
      node("button", "Save", { type: "submit", class: "inline-primary" }),
      button("Cancel", () => {
        clean(form);
        if (!record.items.length) {
          target.replaceChildren(
            button("Set focus", () => edit(target, record, isCurrent)),
          );
        } else show(target, record, isCurrent);
      }),
    );
    form.append(actions);
    const feedback = report(form);
    target.replaceChildren(form);
    track(form);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void run(form, feedback, async () => {
        const saved = await api("ops/focus-save", {
          week: record.week,
          version: record.version,
          text: input.value,
        });
        clean(form);
        show(target, saved, isCurrent);
        if (!isCurrent) {
          const summary = target.closest("details")?.querySelector("summary");
          if (summary)
            summary.textContent =
              label(saved.week) + " — " + saved.items.join(" · ");
        }
      });
    });
  };
  show(now, current, true);
  let before = current.week,
    loading = false;
  const load = async () => {
    if (loading) return;
    loading = true;
    more.disabled = true;
    try {
      const result = await api("ops/focus-history?before=" + before);
      for (const record of result.items) {
        const entry = node("details", undefined, {
            class: "focus-history-entry",
          }),
          body = node("div");
        entry.append(
          node(
            "summary",
            label(record.week) + " — " + record.items.join(" · "),
          ),
          body,
        );
        show(body, record, false);
        history.append(entry);
        before = record.week;
      }
      more.hidden = !result.more;
      if (!history.children.length)
        history.append(
          node("p", "No previous focuses yet.", { class: "muted" }),
        );
    } catch (e) {
      const feedback = report(history);
      status(feedback, (e as Error).message, true);
    } finally {
      loading = false;
      more.disabled = false;
    }
  };
  more.addEventListener("click", () => void load());
  await load();
}
