# NOEMA — Dialogue-first authoring principles and interaction design

**Working implementation:** PR #3, NOEMA 0.1.9 candidate.  
**Product boundary:** NOEMA writes books. Legacy scripts remain only until SCRIPTORIA migration is safely completed.

## Organizing principle: author, AI, and the book

NOEMA's subject is the author: the person who establishes the purpose, vision, intended meaning, principles, and editorial decisions. The AI is the object/assisting partner that participates actively through good questions, comparisons, reasoning, objections, alternative formulations, and research. Their **give-and-take dialogue** is directed toward a shared *project outcome*: a book that expresses the author's genuinely considered ideas, rather than a generic AI-generated manuscript.

The relationship is neither **blind obedience** (which prevents genuine critical insight), nor AI authority over the author (which erases the writer's voice). The AI must:
1. Understand and represent the author's actual position in its strongest coherent form, distinguishing provisional exploration from confirmed beliefs.
2. Bring independent, substantive new information and fair counterarguments; don't repeat objections the author already answered without adding new evidence.
3. Preserve the author's raw wording, citations, revisions, and unresolved questions.
4. Propose manuscript candidates, structures and new chapters only as *proposals*. The author must approve anything that enters or replaces their book.
5. Keep the chosen **subject and purpose of each conversation** visible, link its conclusions to book progress, and never let a model's conversational verbosity become a substitute for finished writing.

## First screen: Book dialogue

- The **Book dialogue** workspace is a full-width primary destination in the navigation, not a 350px sidebar competing with the manuscript.
- Left: conversations belonging to the current book. Creating a conversation requires a *subject* and a *purpose toward the book*.
- Center: readable author and AI turns, with compact metadata, a separate visible independent critique, collapsible interpretation and direct author corrections.
- Bottom: sticky, multiline composer with Enter/Shift+Enter behavior, dictation controls, source attachment and a writing mode. Visual animation is restrained and honors reduced-motion preferences.
- A writing output is captured as a reviewable candidate in Conversation Draft, a Writing Gem, or an explicitly approved new or replacement chapter. The original transcript is not overwritten.

## Local-model rules

- Ask running Ollama **GET /api/tags** for its actual installed inventory *before presenting any download as necessary*. This finds models stored under Ollama's custom configured model directory even on another drive.
- If a requested model already exists, reuse it; never install it again.
- If missing, require a clear Download click and an explanation that storage/internet bandwidth will be used; ask Ollama to pull, show actual status/byte progress, and verify inventory afterward.
- Existing GGUF/Safetensors files **not registered with a running backend** are a separate category. An automatic full-disk crawler is *not* reliable, safe or respectful of user boundaries. A later user-directed **Locate model file/folder** flow can fingerprint and register supported files, without duplicating bytes where safe.
- Never auto-replace or delete a model. Show model version, architecture, quantization and storage costs when the backend exposes them; always permit manual model selection.
- NOEMA's model manager is not OpenLab's universal model tester. NOEMA should surface only models capable of meaningful writing and reasonably strong arguments; OpenLab does broader image/audio/video testing.

## Implementation phases

**0.1.9 candidate:** book-scoped conversation goals + persistent threads; full-width chat; smooth entrance and thinking animations; independent critique/interpretation; installed Ollama inventory; explicit click-to-download with progress; author approval gates. Existing 0.1.8 data migrates additively to schema v12.

**Next: true progressive conversation streaming.** The current Rust AI transport requests one structured JSON answer, so the thinking animation cannot honestly represent token-by-token generation. Implement a two-channel stream: immediate assistant text as chunks, and structured interpretation/critical-review metadata after validated completion. Preserve pending original turns and allow explicit cancel/retry; never save partial output as a completed, author-approved passage.

**Next: conversation-to-book pipeline.** Conversation milestone summaries, candidate thesis and outline, chapter links, coverage of unresolved objections, citations, and book-ready draft generation. Make the manuscript a visible *outcome* of discussions, with final author approval for chapter insertion.

**Next: model file registration.** Supported GGUF from user-picked folders plus Ollama/other backends. Detect duplicates by size/digest and backend inventory, allow existing filesystem locations where feasible, and avoid blindly copying massive weights or scanning private drives. No unsupported claim that all model formats work in Ollama.

**Later:** pin/bookmark a specific exchange, search across conversations, compare AI models on one question, resizable conversation rail, accessible incremental voice capture. Prefer quality and long-project stability to collecting flashy controls.

## Safety and preservation

All book source materials remain distinctly attributed as Writer Sources or Reference Sources. External views and fiction reference text do not automatically become the author's beliefs or book prose. Database migrations are additive, old conversation inputs are preserved, and failures in model networking never silently delete original words. Windows updater/distribution remains a separate release and signing project.
