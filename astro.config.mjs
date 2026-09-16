// @ts-check
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";

import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
	site: "https://deepaltitude.com",
	redirects: {
  "/blog/02-freediving": "/Sportas/02-freediving/",
  "/blog/03-parapente": "/Sportas/03-parapente/",
  "/blog/05-jiu-jitsu": "/Sportas/05-jiu-jitsu/",
  "/blog/07-sveikata": "/Sportas/07-sveikata/",
  "/blog/04-kalbu-mokymasis": "/Kalbos/04-kalbu-mokymasis/",
  "/blog/06-santykiai": "/Protas/06-santykiai/",
  "/blog/08-sprendimai": "/Protas/08-sprendimai/",
  "/blog/09-nesitikek-ko-negali-duoti": "/Protas/09-nesitikek-ko-negali-duoti/",
  "/blog/10-vibracijos": "/Protas/10-vibracijos/",
  "/blog/99-quotes": "/Protas/99-quotes/",
  "/Sportas/freediving": "/Sportas/02-freediving/",
  "/Kalbos/metodai": "/Kalbos/04-kalbu-mokymasis/",
  "/Protas/laikinumas": "/Protas/",
  "/blog/02-freediving/": "/Sportas/02-freediving/",
  "/blog/03-parapente/": "/Sportas/03-parapente/",
  "/blog/05-jiu-jitsu/": "/Sportas/05-jiu-jitsu/",
  "/blog/07-sveikata/": "/Sportas/07-sveikata/",
  "/blog/04-kalbu-mokymasis/": "/Kalbos/04-kalbu-mokymasis/",
  "/blog/06-santykiai/": "/Protas/06-santykiai/",
  "/blog/08-sprendimai/": "/Protas/08-sprendimai/",
  "/blog/09-nesitikek-ko-negali-duoti/": "/Protas/09-nesitikek-ko-negali-duoti/",
  "/blog/10-vibracijos/": "/Protas/10-vibracijos/",
  "/blog/99-quotes/": "/Protas/99-quotes/",
  "/Sportas/freediving/": "/Sportas/02-freediving/",
  "/Kalbos/metodai/": "/Kalbos/04-kalbu-mokymasis/",
  "/Protas/laikinumas/": "/Protas/"
},
	integrations: [mdx(), sitemap()],
	adapter: cloudflare({
		platformProxy: {
			enabled: true,
		},
	}),
});
