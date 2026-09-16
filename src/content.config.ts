import { glob } from "astro/loaders";
import { defineCollection } from "astro:content";
import { z } from "astro/zod";

const createPostCollection = (directory: string) => defineCollection({
	// Load Markdown and MDX files for each section.
	loader: glob({ base: `./src/content/${directory}`, pattern: "**/*.{md,mdx}" }),
	// Type-check frontmatter using a schema
	schema: z.object({
		title: z.string(),
		description: z.string(),
		// Transform string to Date object
		pubDate: z.coerce.date(),
		updatedDate: z.coerce.date().optional(),
		heroImage: z.string().optional(),
	}),
});

export const collections = {
	blog: createPostCollection("blog"),
	Sportas: createPostCollection("Sportas"),
	Kalbos: createPostCollection("Kalbos"),
	Protas: createPostCollection("Protas"),
};
