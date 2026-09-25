// @ts-check
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import redirects from "./notebook/legacy-routes.json" with { type: "json" };
export default defineConfig({
  site: "https://deepaltitude.com",
  redirects: Object.fromEntries(
    Object.entries(redirects).filter(
      ([path]) => !["/Sportas", "/Kalbos", "/Protas"].includes(path),
    ),
  ),
  adapter: cloudflare({
    platformProxy: { enabled: true },
    imageService: "compile",
  }),
});
