// @ts-check
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";

import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
	site: "https://deepaltitude.com",
	redirects: {
  "/Sportas/freediving": "/blog/02-freediving/",
  "/Kalbos/metodai": "/blog/04-kalbu-mokymasis/",
  "/Protas/laikinumas": "/protas/",
},
	integrations: [mdx(), sitemap({filter:page=>!new URL(page).pathname.startsWith('/editor/')} )],
	adapter: cloudflare({
		platformProxy: {
			enabled: true,
		},
	}),
});
