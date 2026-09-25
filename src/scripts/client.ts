// Cloudflare's HTMLRewriter and lib.dom share Element; these are browser DOM overloads.
declare global {
  interface Element {
    append(...nodes: (Node | string)[]): void;
    prepend(...nodes: (Node | string)[]): void;
  }
}
import { marked } from "../../notebook/vendor/marked.mjs";
import { requestJSON } from "./request";
export let csrf = "";
export async function api(path: string, value?: unknown) {
  return requestJSON(
    "/api/" + path,
    {
      method: value === undefined ? "GET" : "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json", "X-Editor-CSRF": csrf },
      body: value === undefined ? undefined : JSON.stringify(value),
    },
    value === undefined ? 45000 : 90000,
  );
}
export async function session() {
  const value = await api("editor/session");
  csrf = value.csrf || "";
  return value;
}
export const el = <T = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
export function node<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text?: string,
  attrs: Record<string, string> = {},
) {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}
export function safePreview(
  target: HTMLElement,
  body: string,
  attachments: any[] = [],
) {
  const parsed = new DOMParser().parseFromString(
    marked.parse(body, { gfm: true, breaks: false }) as string,
    "text/html",
  );
  const allowed = new Set(
      "p h1 h2 h3 h4 h5 h6 ul ol li blockquote hr br strong em del a img pre code table thead tbody tr th td figure figcaption div span sup sub details summary".split(
        " ",
      ),
    ),
    discard = new Set(
      "script style iframe object embed svg math template form input button".split(
        " ",
      ),
    );
  const clean = (n: Node): Node => {
    if (n.nodeType === Node.TEXT_NODE)
      return document.createTextNode(n.textContent || "");
    const fragment = document.createDocumentFragment();
    if (!(n instanceof Element) || discard.has(n.localName)) return fragment;
    const result = allowed.has(n.localName)
      ? document.createElement(n.localName)
      : fragment;
    if (result instanceof HTMLElement) {
      for (const attr of ["title", "alt"])
        if (n.hasAttribute(attr))
          result.setAttribute(attr, n.getAttribute(attr)!);
      const attr =
        n.localName === "a" ? "href" : n.localName === "img" ? "src" : null;
      if (attr && n.hasAttribute(attr))
        try {
          const raw = n.getAttribute(attr)!,
            url = new URL(raw, location.origin),
            image =
              attr === "src" ? attachments.find((a) => a.path === raw) : null;
          if (image)
            result.setAttribute(
              attr,
              "data:" + image.mime + ";base64," + image.data,
            );
          else if (
            ["http:", "https:"].includes(url.protocol) ||
            (attr === "href" && url.protocol === "mailto:")
          )
            result.setAttribute(attr, url.href);
        } catch {}
      if (n.localName === "a") {
        result.setAttribute("target", "_blank");
        result.setAttribute("rel", "noopener noreferrer");
      }
      if (n.localName === "img") {
        result.setAttribute("loading", "lazy");
        result.setAttribute("referrerpolicy", "no-referrer");
      }
    }
    n.childNodes.forEach((child) => result.appendChild(clean(child)));
    return result;
  };
  target.replaceChildren(...Array.from(parsed.body.childNodes, clean));
}
export function option(value: string, text: string) {
  return node("option", text, { value });
}
export const splitList = (value: string) =>
  value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
export const message = (text: string, error = false) => {
  const status = el("status");
  status.textContent = text;
  status.dataset.error = String(error);
};
