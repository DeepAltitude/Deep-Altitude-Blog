import { getCollection, type CollectionEntry } from "astro:content";
import { getNotes, type Note } from "./posts";
import { domains, type Domain } from "./domains";

export interface Principle {
  source: CollectionEntry<"principles">;
  id: string;
  url: string;
  title: string;
  description?: string;
  references: string[];
  notes: Note[];
  domains: Domain[];
}
let principles: Promise<Principle[]> | undefined;
export function getPrinciples(): Promise<Principle[]> {
  return (principles ??= (async () => {
    const [entries, notes] = await Promise.all([
      getCollection("principles"),
      getNotes(),
    ]);
    return entries
      .map((source) => {
        // CMS stores the stable file path, so editing the title cannot break a relationship.
        const references = [source.id, source.filePath!.replace(/^\.\//, "")];
        const connected = notes.filter((note) =>
          note.principles.some((ref) => references.includes(ref)),
        );
        return {
          source,
          id: source.id,
          url: `/principai/${source.id}/`,
          ...source.data,
          references,
          notes: connected,
          domains: domains.filter((domain) =>
            connected.some((note) => note.domain === domain),
          ),
        };
      })
      .sort((a, b) => a.title.localeCompare(b.title, "lt"));
  })());
}
export async function principlesFor(note: Note) {
  return (await getPrinciples()).filter((principle) =>
    note.principles.some((ref) => principle.references.includes(ref)),
  );
}
