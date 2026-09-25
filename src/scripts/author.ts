import { session, api } from "./client";
import { loadCatalogPages } from "./catalog";
import type { Catalog, CatalogItem } from "../utils/editor-model";
let auth: ReturnType<typeof session> | undefined,
  catalog: Promise<Catalog> | undefined;
export const author = () =>
  (auth ??= session().catch(() => ({ authenticated: false })));
export const notebookCatalog = (refresh = false) => {
  if (refresh) catalog = undefined;
  return (catalog ??= loadCatalogPages(api).catch((error) => {
    catalog = undefined;
    throw error;
  }));
};
export function catalogItems(
  catalog: Catalog,
  kind: "article" | "principle",
): CatalogItem[] {
  const privateItems = catalog.drafts.filter((item) => item.kind === kind);
  return [
    ...(kind === "article" ? catalog.articles : catalog.principles)
      .filter((item) => !privateItems.some((p) => p.sourceFile === item.file))
      .map((item) => ({
        ...item,
        ...catalog.privateLinks?.[item.file],
        principles: [
          ...(item.principles || []),
          ...(catalog.privateLinks?.[item.file]?.principles || []),
        ],
        visibility: "public" as const,
      })),
    ...privateItems,
  ].sort((a, b) =>
    kind === "article"
      ? String(b.pubDate || "").localeCompare(String(a.pubDate || "")) ||
        a.title.localeCompare(b.title)
      : a.title.localeCompare(b.title),
  );
}
export function reference(item: CatalogItem) {
  return item.file.startsWith("draft:") ? item.file : item.id || item.file;
}

// Clear authenticated DOM in other tabs and when restoring a browser snapshot.
const authChannel =
  typeof BroadcastChannel === "undefined"
    ? null
    : new BroadcastChannel("deepaltitude-author");
authChannel?.addEventListener("message", (event) => {
  if (event.data === "signed-out") location.reload();
});
window.addEventListener("pageshow", (event) => {
  if (event.persisted) location.reload();
});
export async function signOut() {
  await api("editor/logout", {});
  authChannel?.postMessage("signed-out");
  location.reload();
}
