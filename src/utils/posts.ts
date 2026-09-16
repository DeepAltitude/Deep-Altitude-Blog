import { getCollection } from 'astro:content';

// Keep the combined blog listing and RSS feed in sync across all sections.
export async function getAllPosts() {
  const collections = await Promise.all([
    getCollection('blog'),
    getCollection('Sportas'),
    getCollection('Kalbos'),
    getCollection('Protas'),
  ]);
  return collections.flat().sort(
    (a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf(),
  );
}
