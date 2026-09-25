// @ts-check
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
export default defineConfig({
  site: "https://deepaltitude.com",
  // Legacy redirects are generated once and shared with the SSR fallback. Defining
  // them here would make the adapter append a second copy to dist/_redirects.
  adapter: cloudflare({
    platformProxy: { enabled: true },
    imageService: "compile",
  }),
});
