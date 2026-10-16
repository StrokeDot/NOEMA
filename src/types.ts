export type Project = {
  id: string;
  title: string;
  author: string;
  description: string;
  settings: string;
  project_type: "Book" | "Video Script";
  channel_id: string | null;
  script_status: "Draft" | "In Production" | "Published";
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
  role?: "Supporting" | "Primary Reference" | "Critical Perspective" | "Background";
  use_guidance?: string;
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

export const gemKinds = ["Quote", "Reasoning", "Argument", "Draft Passage"] as const;
export const gemOrigins = ["Author", "AI Assistant", "Research Source", "Unspecified"] as const;
export const gemStatuses = ["Candidate", "Approved", "Used"] as const;
export type BookGem = {
  id: string;
  project_id: string;
  chapter_id: string | null;
  kind: (typeof gemKinds)[number];
  original_text: string;
  text: string;
  notes: string;
  origin: (typeof gemOrigins)[number];
  source_label: string;
  status: (typeof gemStatuses)[number];
  created_at: number;
  updated_at: number;
};
export type GemDraft = Pick<BookGem,"chapter_id"|"kind"|"text"|"notes"|"origin"|"source_label"|"status"> & {id?:string};

export const frameworkPerspectives = ["Author", "External", "Character", "Custom"] as const;
export const frameworkStatuses = ["Draft", "Confirmed"] as const;
export type CoreFramework = {
  id: string;
  title: string;
  perspective: (typeof frameworkPerspectives)[number];
  principles: string;
  original_text: string;
  qualifications: string;
  source_label: string;
  status: (typeof frameworkStatuses)[number];
  active: number;
  updated_at: number;
};
export type FrameworkDraft = Pick<CoreFramework, "title" | "perspective" | "principles" | "qualifications" | "source_label" | "status"> & { id?: string };

export type ChannelProfile = {
  id: string; name: string; description: string; audience: string; voice: string;
  editorial_rules: string; content_pillars: string; original_text: string;
  source_label: string; confirmed: number; script_count: number;
  created_at: number; updated_at: number;
};
export type ChannelDraft = Pick<ChannelProfile,
  "name"|"description"|"audience"|"voice"|"editorial_rules"|"content_pillars"|"original_text"|"source_label"> & {
  confirmed: boolean;
  id?: string;
};
export type ChannelScript = Pick<Project,"id"|"title"|"description"|"script_status">;
export type ChannelScriptReference = {
  script_id: string; script_title: string; script_status: Project["script_status"];
  channel_id: string; channel_name: string; section_id: string;
  section_title: string; excerpt: string; section_kind?: string;
};

export const cueStatuses = ["Draft", "Ready", "Recorded"] as const;
export type ScriptCueDraft = {
  heading: string;
  narration: string;
  visuals: string;
  evidence_notes: string;
  source_id: string | null;
  source_locator: string;
  planned_seconds: number | null;
  status: (typeof cueStatuses)[number];
  snapshot?: boolean;
};
export type ScriptCue = Omit<ScriptCueDraft,"snapshot"> & {
  id: string;
  project_id: string;
  position: number;
  version: number;
  source_name?: string | null;
  created_at: number;
  updated_at: number;
};
export type ScriptCueRevision = {
  id: string;
  snapshot: string;
  created_at: number;
};
