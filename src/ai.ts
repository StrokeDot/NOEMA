// Deliberately no provider implementation, network request, credential, or fake reply.
export interface SourceExcerpt {
  sourceId: string;
  passageId: number;
  location: string;
  text: string;
}
export interface AIRequest {
  question: string;
  projectId: string;
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
