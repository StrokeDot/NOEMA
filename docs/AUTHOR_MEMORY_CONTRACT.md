# NOEMA — Author Memory Contract
**Status:** Product requirement approved for planning; not yet implemented.
**Scope:** Persistent author understanding, voice, reasoning and corrections.
**Principle:** The AI adapts to the author; the author should not repeatedly restate established positions.

## Purpose
NOEMA is a book-writing assistant, not a generic chatbot. It must maintain durable, source-grounded understanding of what the author has actually said and accepted, distinguishing that from hypotheses, debate positions, other people's claims, assistant proposals and unresolved questions.

No model can be made infallible or literally have unlimited context. We will approximate continuity with persistent structured storage, prioritized retrieval, explicit context construction, provenance, regression tests, and author-controlled corrections. Never claim memory succeeded if material could not be retrieved.

## Three layers of persistent knowledge

1. **Author-wide profile** — Voice, writing preferences, argumentation method, recurring personal principles the author explicitly chooses to share across books. Apply across projects only when the author has authorized the scope.
2. **Project canon** — Established positions, precise distinctions, rejected formulations, source interpretations, open questions, and book-specific editorial rules. Apply only to the active project unless explicitly shared.
3. **Conversation and source record** — Original imported conversations, author inputs, manuscript revisions and reference documents. Immutable original content is preserved. Summaries are a separate, revisable interpretation, never a substitute for source material.

## Required record shape (proposed)
Every structured memory should be able to store:
- ID, scope (author or project), project ID when applicable, and category.
- **Exact author wording** or link to original message/source, plus a concise faithful normalized proposition.
- **Meaning and qualifications:** context, exceptions, distinctions, what this position DOES and DOES NOT claim.
- **Corrections:** explicit rejected interpretations and why, with source links.
- **Status:** proposed, confirmed, author-locked, superseded, or rejected.
- **Provenance:** source ID, message ID/passage, timestamp and who authored the claim.
- **Revision history:** old value, new value, reason, timestamp and who approved.
- Optional links: related claims, contradictory claims, citations and manuscript sections.

User inputs and quotations must never be incorrectly attributed to the assistant, and assistant suggestions must never be promoted to the author's established beliefs automatically.

## Locking semantics
- **Proposed:** AI-extracted candidate or inferred style preference, never treated as definitive.
- **Confirmed:** Explicitly approved by author.
- **Author-locked:** High-priority author-approved statement or correction. Include when relevant to every subsequent AI request. Do not silently weaken, invert or override it.
- **Superseded / Rejected:** Retain an audit record so earlier misunderstandings do not recur; do not treat as current author belief.
- The author can always update, unlock, replace or delete even a locked memory. A locked memory is protected against AI rewriting, not protected against the author.
- If two current high-priority memories conflict, ask about the *specific* conflict rather than inventing a reconciliation.
- If retrieval is incomplete, say so briefly instead of pretending to remember.

## The Author Voice
Maintain an editable **Author Voice Profile** covering, where the author supplies evidence:
- Language, preferred vocabulary, register, level of directness and rhetorical rhythm.
- Whether prose is analytical, literary, philosophical, narrative or explanatory in context.
- Argumentation approach: how claims, evidence, counterarguments, conclusions, and citations should be organized.
- Recurring tone corrections, unwanted formulations, preferred examples, and intentional distinctions.
- Optional author-approved writing samples and before/after examples of accepted edits.

By default, AI-assisted *manuscript prose* should draft and revise in the author's voice, never flattening it into generic AI prose. Conversations and analytical replies should respect the author's preferred communication style while preserving accuracy and clarity.

Offer novel ideas or stylistic directions as explicitly labelled **Alternative approach to consider**, distinct from the author's position. Explain any substantive disagreement, rather than blending a speculative alternative into established manuscript text. Do not silently edit the manuscript.

## Context construction before every AI answer (future)
1. Resolve current author, project, chapter and task.
2. Load applicable author-wide instructions and active, author-locked project memories.
3. Retrieve relevant confirmed positions, exact author statements, prior explicit corrections, open questions, and writing examples.
4. Retrieve relevant manuscript sections and source passages with locators.
5. Rank relevance and priority while respecting model context limits.
6. Construct a structured AI request distinguishing **Author's positions**, **Rejected interpretations**, **Unresolved questions**, **Source quotations**, **Writing voice**, and **Request**.
7. Preserve retrieval/source references where possible; when the evidence is ambiguous, seek clarification without assuming a position.
8. On author correction, propose a precise memory change for confirmation rather than repeating the error in future sessions.

Never simply feed all archives into one giant prompt. Retrieval must remain local-first and scalable.

## Example acceptance scenario — collective guilt distinction
A user states that they reject collective guilt and that responsibility for a historical wrong must be distinguished from assigning blame to an entire group or descendants.

Expected: When returning to the topic, the assistant retrieves and honors this explicit distinction, analyzes the specific argument presented, and does not repeatedly accuse the author of holding a collective-guilt position they disavowed.

Important: This example establishes ONLY the explicit rejection of collective guilt and the importance of preserving that distinction. It does not imply, invent, or automatically approve the author's other positions concerning the Holocaust or related history. Exact positions must be captured from the author's own words and context.

The assistant remains free to test historical claims against evidence and identify actual errors, without replacing the author's stated argument with a straw man or generating repetitive warnings for distinctions already established.

## Author-facing functionality (planned)
- **Author Profile** editor with writing voice and global principles.
- **Memory Inbox:** AI proposes candidate learnings from conversation; author approves, edits, rejects or locks.
- **Memory Detail:** precise source wording, scope, status, qualifications, rejected paraphrases, provenance and edit history.
- **Correct NOEMA:** user supplies a correction and sees the proposed persistent change.
- **Memory Inspector:** display which active memory records influenced a given response and provide links to their sources.
- Search, export, backup, cross-project isolation, and user-requested deletion.
- Optional settings to allow active memory across projects. Default to project boundaries for content.

## Persistence and safety
- Existing NOEMA v0.1 SQLite project/chapter/research/memory records must survive database upgrades.
- Add migrations; never reset or overwrite the database to implement the new memory system.
- Sensitive content stays local unless the user has explicitly enabled a cloud AI provider; disclose what project excerpts are sent on each cloud request.
- Do not secretly upload original conversations, profiles or books.
- The assistant must obey applicable provider safeguards; author style memory is not a way to override those safeguards.

## Testable acceptance criteria
1. An author confirms and locks a distinction, closes the app, reopens it and retrieves the same precise record and source.
2. After importing a large conversation archive, NOEMA distinguishes statements by the author from assistant speculation and quoted opponents.
3. A later question with relevant terms retrieves the locked distinction without requiring restatement.
4. An assistant's proposed alternative is labelled and does not replace accepted prose.
5. A correction updates the active proposition while retaining version history.
6. Editing one book's project canon does not silently modify other books.
7. An older v0.1 database migrates without losing its records.
8. The author can review, export, change or delete their saved memory.
9. If an author-wide rule conflicts with an active project-specific rule, a documented scope rule or direct clarification resolves it; never silently misattribute either.
10. The system never reports that a source was consulted unless retrieval actually occurred.

## Implementation roadmap
**0.1.x:** Persistence schema migrations, author-wide voice profile, per-memory provenance/status/locking, correction workflow, and UI to review and edit records.

**0.2:** Provider-independent AI connection, prioritized memory retrieval, author voice context assembly, source-grounded answers, clearly separated alternate approaches.

**0.2+:** Optional AI extraction of candidate memories from imported conversations, author-review inbox, contradiction detection, memory inspector and automated continuity evaluation.

The author is always the final authority over what the author's position and writing voice are. The model can challenge claims, not invent the author's belief.
