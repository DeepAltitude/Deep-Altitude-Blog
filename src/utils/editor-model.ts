import type { Domain } from "./domains";
export type Kind = "article" | "home" | "about" | "principle";
export interface Fields {
  title: string;
  description: string;
  body: string;
  domain: Domain | "";
  topic: string;
  principles: string[];
  tags: string[];
  pubDate: string;
  updatedDate: string;
  heroImage: string;
  heroImageAlt: string;
  introTitle: string;
  project: string;
  experiment: string;
  sprint: string;
}
export interface NewPrinciple {
  id: string;
  title: string;
  description: string;
}
export interface Attachment {
  id: string;
  mime: string;
  data: string;
  path: string;
}
export interface Editable extends Fields {
  kind: Kind;
  file: string;
  sha: string | null;
  url: string;
  key: string;
  draftFile?: string;
  draftSha?: string | null;
  newPrinciples: NewPrinciple[];
  attachments: Attachment[];
}
export interface CatalogItem {
  kind: Kind;
  file: string;
  sha: string;
  title: string;
  url: string;
  domain?: string;
  topic?: string;
  pubDate?: string;
  description?: string;
  id?: string;
}
export interface Catalog {
  articles: CatalogItem[];
  principles: CatalogItem[];
  drafts: CatalogItem[];
  warning?: string;
}
export const blankFields = (): Fields => ({
  title: "",
  description: "",
  body: "",
  domain: "",
  topic: "",
  principles: [],
  tags: [],
  pubDate: new Date().toISOString().slice(0, 10),
  updatedDate: "",
  heroImage: "",
  heroImageAlt: "",
  introTitle: "",
  project: "",
  experiment: "",
  sprint: "",
});
