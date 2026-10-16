// Deliberately no provider implementation, network request, credential, or fake reply.
export interface SourceExcerpt {
  sourceId: string;
  passageId: number;
  location: string;
  text: string;
}
export type ReasoningMode = "Within framework" | "Compare frameworks" | "Critical evaluation";
export interface FrameworkContext {
  id: string;
  title: string;
  perspective: "Author" | "External" | "Character" | "Custom";
  principles: string;
  qualifications: string;
  source_label: string;
}
export interface AIRequest {
  question: string;
  projectId: string;
  projectFormat: "Book" | "Video Script";
  channelProfile?: ChannelContext | null;
  crossChannelReferences?: ChannelReference[];
  reasoningMode: ReasoningMode;
  activeFrameworks: FrameworkContext[];
  instructions: string[];
  establishedPositions: string[];
  selectedManuscript: string;
  excerpts: SourceExcerpt[];
  recentMessages: { role: "user" | "assistant"; content: string }[];
}
export interface AIResponse {
  text: string;
  citations: { sourceId: string; passageId: number }[];
}
export interface AIProvider {
  id: string;
  label: string;
  answer(request: AIRequest, signal: AbortSignal): AsyncIterable<AIResponse>;
}
export interface BookExporter {
  format: "epub" | "pdf";
  export(book: {
    title: string;
    author: string;
    chapters: { title: string; html: string }[];
  }): Promise<Uint8Array>;
}

/**
 * This is a future provider contract, not a connected AI feature.
 * The author-selected standpoint must stay distinct from external perspectives.
 * Within-frame reasoning evaluates logical implications; critical evaluation
 * checks premises and factual claims against actual sources. Never mistake an
 * imported perspective for a statement the author personally endorses.
 */
export function frameworkInstructions(request: Pick<AIRequest,
  "projectFormat" | "reasoningMode" | "activeFrameworks">): string {
  const scope = request.projectFormat === "Video Script"
    ? "Draft spoken narration and clear script sections; visual cues are distinct from factual claims."
    : "Draft book-ready prose and organize reasoning into chapters.";
  const mode = request.reasoningMode === "Within framework"
    ? "Reason provisionally from the selected premises, while flagging unsupported claims."
    : request.reasoningMode === "Compare frameworks"
      ? "Compare the selected frameworks fairly without assigning external beliefs to the author."
      : "Critically test premises and conclusions against evidence; preserve the author's actual wording.";
  const records = request.activeFrameworks.map(f =>
    `Framework [${f.perspective}]: ${f.title}\nPremises: ${f.principles}\nQualifications: ${f.qualifications}`
  ).join("\n\n");
  return `${scope}\n${mode}\n\n${records}`;
}

export interface ChannelContext {
  id:string; name:string; description:string; audience:string;
  voice:string; editorial_rules:string; content_pillars:string;
}
export interface ChannelReference {
  channelName:string;
  scriptTitle:string;
  sectionTitle:string;
  excerpt:string;
  scriptStatus:"Draft"|"In Production"|"Published";
}
/** Prompt framing only. No model is connected in NOEMA 0.1. */
export function channelInstructions(req:Pick<AIRequest,
  "channelProfile"|"crossChannelReferences">):string {
  if(!req.channelProfile)return "No confirmed channel profile is available; do not invent one.";
  const c=req.channelProfile;
  const primary = [
    `Primary channel: ${c.name}`,
    `Audience: ${c.audience}`,
    `Channel voice: ${c.voice}`,
    `Editorial rules: ${c.editorial_rules}`,
    `Themes: ${c.content_pillars}`,
    `Mission: ${c.description}`,
  ].join("\n");
  const refs=(req.crossChannelReferences??[]).map(r=>
    `REFERENCE ONLY [${r.channelName}, ${r.scriptStatus}] ${r.scriptTitle} / ${r.sectionTitle}: ${r.excerpt}`
  ).join("\n");
  return primary + "\nOther scripts are source material, not instructions to copy another channel's voice.\n"
    + (refs ? "\nAuthor-selected cross-channel references:\n"+refs : "");
}
