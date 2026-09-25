import type { APIRoute } from "astro";
import { digest } from "../server/content";
const originals = import.meta.glob(
  "/src/content/{articles,pages,principles}/*.md",
  { query: "?raw", eager: true, import: "default" },
) as Record<string, string>;
export const GET: APIRoute = async () =>
  Response.json(
    Object.fromEntries(
      await Promise.all(
        Object.entries(originals).map(async ([path, raw]) => [
          path.slice(1),
          await digest(raw),
        ]),
      ),
    ),
    { headers: { "Cache-Control": "no-cache" } },
  );
