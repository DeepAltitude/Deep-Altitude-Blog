import type { APIRoute } from "astro";
import { getNotes } from "../utils/posts";
import { getPrinciples } from "../utils/principles";
import { domains, topics, domainUrl, topicUrl } from "../utils/domains";
import { list } from "../lib/data/store";
export const prerender = false;
const escape = (s: string) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
export const GET: APIRoute = async ({ locals }) => {
  const paths = [
    "/",
    "/uzrasai/",
    "/apie/",
    "/principai/",
    "/projektai/",
    "/eksperimentai/",
    "/sritys/",
    ...domains.flatMap((d) => [
      domainUrl(d),
      ...topics[d].map((t) => topicUrl(d, t.id)),
    ]),
    ...(await getNotes()).map((n) => n.url),
    ...(await getPrinciples()).map((p) => p.url),
  ];
  const db = (locals.runtime?.env as any)?.DB;
  if (db) {
    try {
      for (const [kind, base] of [
        ["projects", "/projektai/"],
        ["experiments", "/eksperimentai/"],
      ] as const)
        paths.push(
          ...(await list(db, kind, true)).map((r) => base + r.slug + "/"),
        );
    } catch {
      /* Keep durable writing discoverable during an operational outage. */
    }
  }
  return new Response(
    '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
      [...new Set(paths)]
        .map(
          (path) =>
            "<url><loc>" +
            escape(new URL(path, "https://deepaltitude.com").href) +
            "</loc></url>",
        )
        .join("") +
      "</urlset>",
    {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    },
  );
};
