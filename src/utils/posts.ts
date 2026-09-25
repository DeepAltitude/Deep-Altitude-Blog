import { getCollection, type CollectionEntry } from "astro:content";
const rawFiles = import.meta.glob("/src/content/articles/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;
import { type Domain } from "./domains";
export { domainUrl, topicUrl } from "./domains";
type Source = CollectionEntry<"articles">;
const aliases: Record<string, string> = {
  "blog/01-apie-ka": "why-this-notebook",
  "Sportas/02-freediving": "freediving",
  "Sportas/03-parapente": "paragliding",
  "Kalbos/04-kalbu-mokymasis": "language-learning",
  "Sportas/05-jiu-jitsu": "jiu-jitsu",
  "Protas/06-santykiai": "relationships",
  "Sportas/07-sveikata": "health",
  "Protas/08-sprendimai": "better-decisions",
  "Protas/09-nesitikek-ko-negali-duoti": "expectations",
  "Protas/10-vibracijos": "vibrations",
  "Protas/99-quotes": "quotes",
};
export interface Note {
  source: Source;
  id: string;
  url: string;
  language?: string;
  originalLanguage?: string;
  domain?: Domain;
  topic?: string;
  project?: string;
  experiment?: string;
  sprint?: string;
  legacyGuid?: string;
  principles: string[];
  tags: string[];
  title: string;
  description: string;
  pubDate: Date;
  updatedDate?: Date;
  heroImage?: string;
  heroImageAlt?: string;
  heroCaption?: string;
  body: string;
  raw: string;
  example: boolean;
  placeholder: boolean;
}
let originals: Promise<Note[]> | undefined;
export function getOriginals(): Promise<Note[]> {
  return (originals ??= (async () => {
    const collections = [await getCollection("articles")];
    const notes = collections
      .flat()
      .filter((source) => !source.data.draft)
      .map((source) => {
        const key = `${source.collection}/${source.id}`,
          id =
            aliases[key] ||
            source.data.id ||
            `${source.collection}-${source.id}`;
        const example = source.id === "markdown-style-guide";
        // Keep existing language metadata; new writing has no imposed language.
        const legacy =
          Object.values(aliases).includes(id) || id.startsWith("Protas-");
        const language =
          source.data.language ||
          (legacy
            ? id === "quotes"
              ? "en"
              : id === "vibrations"
                ? "mul"
                : "lt"
            : undefined);
        return {
          ...source.data,
          source,
          id,
          url: `/blog/${source.data.slug || source.id}/`,
          language,
          originalLanguage: source.data.originalLanguage || language,
          body: source.body ?? "",
          raw: rawFiles["/" + source.filePath!.replace(/^\.\//, "")],
          example,
          placeholder: source.data.placeholder ?? false,
        } as Note;
      })
      .sort(
        (a, b) =>
          b.pubDate.valueOf() - a.pubDate.valueOf() ||
          a.source.id.localeCompare(b.source.id),
      );
    if (new Set(notes.map((n) => n.id)).size !== notes.length)
      throw Error("Duplicate article identifiers");
    if (new Set(notes.map((n) => n.url)).size !== notes.length)
      throw Error("Duplicate article URLs");
    return notes;
  })());
}
export async function getNotes() {
  return (await getOriginals()).filter((note) => !note.example);
}
export const getAllPosts = getNotes;
export const dateLabel = (date: Date) =>
  date.toISOString().slice(0, 10).replaceAll("-", ".");
export const bodyLanguage = (note: Note) =>
  note.language === "mul" ? "lt" : note.language;
export const usableImage = (image?: string) =>
  image && !image.includes("blog-placeholder") ? image : undefined;
