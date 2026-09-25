import { node, option } from "./client";
const dirty = new Set<HTMLFormElement>();
export const hasUnsavedChanges = (root: Node = document) =>
  [...dirty].some(
    (form) => form.isConnected && (form === root || root.contains(form)),
  );
window.addEventListener("beforeunload", (event) => {
  if (hasUnsavedChanges()) event.preventDefault();
});
export function track(form: HTMLFormElement) {
  form.addEventListener("input", () => dirty.add(form));
  form.addEventListener("change", () => dirty.add(form));
}
export function clean(form: HTMLFormElement) {
  dirty.delete(form);
}
export function button(
  text: string,
  fn: () => void | Promise<void>,
  className = "quiet-action",
) {
  const b = node("button", text, { type: "button", class: className });
  b.addEventListener("click", () => {
    void fn();
  });
  return b;
}
export function status(target: HTMLElement, text: string, error = false) {
  target.textContent = text;
  target.dataset.error = String(error);
}
export async function run(
  target: HTMLElement,
  report: HTMLElement,
  task: () => Promise<void>,
) {
  if (target.dataset.busy === "true") return;
  target.dataset.busy = "true";
  const controls = [
    ...target.querySelectorAll<HTMLInputElement>(
      "input,textarea,select,button",
    ),
  ].map((el) => ({ el, disabled: el.disabled }));
  controls.forEach(({ el }) => (el.disabled = true));
  try {
    await task();
  } catch (error) {
    status(report, (error as Error).message, true);
  } finally {
    delete target.dataset.busy;
    controls.forEach(({ el, disabled }) => (el.disabled = disabled));
  }
}
export function field(
  target: HTMLElement,
  label: string,
  name: string,
  value: any = "",
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
  if (input instanceof HTMLInputElement) input.type = type;
  if (input instanceof HTMLTextAreaElement)
    input.rows = name === "body" ? 10 : 3;
  if (input instanceof HTMLSelectElement)
    input.append(...choices!.map((c) => option(c.value, c.label)));
  if (input instanceof HTMLInputElement && type === "checkbox") {
    input.checked = !!value;
    wrapper.className = "inline-check";
  } else input.value = value ?? "";
  wrapper.append(input);
  target.append(wrapper);
  return input;
}
export function visibility(target: HTMLElement, selected = "private") {
  const group = node("fieldset", undefined, { class: "visibility-control" });
  group.append(node("legend", "Visibility"));
  for (const value of ["private", "public"]) {
    const label = node("label", value === "private" ? "Private" : "Public"),
      radio = node("input", undefined, {
        type: "radio",
        name: "visibility",
        value,
      });
    radio.checked = selected === value;
    label.prepend(radio);
    group.append(label);
  }
  target.append(group);
}
export function values(form: HTMLFormElement) {
  const out: any = {};
  for (const input of Array.from(form.elements))
    if (
      (input instanceof HTMLInputElement ||
        input instanceof HTMLTextAreaElement ||
        input instanceof HTMLSelectElement) &&
      input.name
    ) {
      if (input instanceof HTMLInputElement && input.type === "radio") {
        if (input.checked) out[input.name] = input.value;
      } else
        out[input.name] =
          input instanceof HTMLInputElement && input.type === "checkbox"
            ? input.checked
            : input.value;
    }
  return out;
}
export function more(target: HTMLElement) {
  const details = node("details", undefined, { class: "inline-more" });
  details.append(node("summary", "More"));
  const body = node("div");
  details.append(body);
  target.append(details);
  return body;
}
export function report(target: HTMLElement) {
  const p = node("p", undefined, {
    role: "status",
    "aria-live": "polite",
    class: "inline-status",
  });
  target.append(p);
  return p;
}
