import type { Catalog, CatalogPage } from "../utils/editor-model";

// Assemble a complete, consistent index before replacing the editor's current
// choices. A failed page leaves the existing index and unsaved document intact.
export async function loadCatalogPages(
  request: (path: string) => Promise<CatalogPage>,
): Promise<Catalog> {
  const result: Catalog = { articles: [], principles: [], drafts: [] };
  const seen = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await request(
      "editor/catalog" + (cursor ? "?cursor=" + encodeURIComponent(cursor) : ""),
    );
    result.articles.push(...page.articles);
    result.principles.push(...page.principles);
    result.drafts.push(...page.drafts);
    if (page.warning) result.warning = page.warning;
    cursor = page.next;
    if (cursor && seen.has(cursor))
      throw new Error("The notebook index could not finish loading. Try again; your draft is still here.");
    if (cursor) seen.add(cursor);
  } while (cursor);
  result.articles.sort(
    (a, b) => String(b.pubDate || "").localeCompare(String(a.pubDate || "")) || a.title.localeCompare(b.title),
  );
  result.principles.sort((a, b) => a.title.localeCompare(b.title));
  return result;
}
