export type Project = {
  id: string;
  title: string;
  author: string;
  description: string;
  settings: string;
};
export type Chapter = {
  id: string;
  title: string;
  position: number;
  version: number;
  updated_at: number;
  characters: number;
};
export type Document = Chapter & {
  project_id: string;
  html: string;
  text: string;
};
export type Source = {
  passage_id?: number;
  id: string;
  name: string;
  kind: string;
  tags: string;
  created_at: number;
  warning: string;
};
export type Passage = { id: number; location: string; text: string };
export type Hit = {
  id: number;
  source_id: string;
  name: string;
  kind: string;
  location: string;
  excerpt: string;
};
export const categories = [
  "Established Positions",
  "Open Questions",
  "Research Notes",
  "Writing Instructions",
] as const;
export type Memory = {
  id: string;
  category: (typeof categories)[number];
  title: string;
  body: string;
  source_id: string | null;
  source_name?: string;
};
export type Revision = {
  id: string;
  created_at: number;
  characters: number;
  html?: string;
  text?: string;
};
