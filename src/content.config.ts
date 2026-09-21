import { glob } from 'astro/loaders';
import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { domains } from './utils/domains';

// Old dotted dates and optional empty CMS fields remain valid.
const cleanDate = (value: unknown) => typeof value === 'string'
  ? value.trim().replace(/^(\d{4})\.(\d{2})\.(\d{2})$/, '$1-$2-$3') : value;
const optionalDate = z.preprocess(value => value == null || value === '' ? undefined : cleanDate(value), z.coerce.date().optional());
const optionalText = z.preprocess(value => value == null || value === '' ? undefined : value, z.string().optional());
const optionalList = z.preprocess(value => value == null ? [] : value, z.array(z.string()).transform(values => [...new Set(values.map(value => value.trim()).filter(Boolean))]));
const schema = z.object({
  title: z.string(),
  description: z.string().nullish().transform(value => value ?? ''),
  pubDate: z.preprocess(cleanDate, z.coerce.date()),
  updatedDate: optionalDate,
  heroImage: optionalText,
  heroImageAlt: optionalText,
  heroCaption: optionalText,
  category: z.enum(['Sportas', 'Kalbos', 'Protas', 'Blog']).optional(),
  domain: z.preprocess(value => value == null || value === '' ? undefined : value, z.enum(domains).optional()),
  principles: optionalList,
  tags: optionalList,
  language: optionalText,
  originalLanguage: optionalText,
  translationKey: optionalText,
});
const posts = (base: string, pattern = '**/*.{md,mdx}') => defineCollection({loader: glob({base, pattern}), schema});
export const collections = {
  blog: posts('./src/content/blog'),
  Sportas: posts('./src/content/Sportas'),
  Kalbos: posts('./src/content/Kalbos'),
  Protas: posts('./src/content/Protas'),
  // Pages CMS creates new notes here. Their URLs do not change with their domain.
  notes: posts('./src/content', '*.{md,mdx}'),
  principles: defineCollection({
    loader: glob({base: './src/principles', pattern: '*.md'}),
    schema: z.object({title: z.string().min(1), description: optionalText}),
  }),
  pages: defineCollection({
    loader: glob({base:'./src/content/pages', pattern:'*.md'}),
    schema: z.object({title:z.string(), description:z.string().optional(), language:z.string().default('lt')}),
  }),
};
