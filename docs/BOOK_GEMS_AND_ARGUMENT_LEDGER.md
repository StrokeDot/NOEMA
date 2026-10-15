# NOEMA — Book Gems and Counterargument Ledger

**Product specification** (October 2026). Book Gems manual capture is implemented in the 0.1.x foundation; live AI messages, microphone recording, speech recognition, semantic objection tracking, and voice commands remain future work.

## Author intent
The assistant can disagree, including more than once. Repetition becomes counterproductive after the author has responded to an objection multiple times. The assistant should still surface substantially new evidence or genuinely new reasoning, and it can revisit old arguments when explicitly asked. Likewise, excellent potential manuscript lines often emerge in author–AI dialogue, but they must be deliberately saved, attributed, organized by book and chapter, and kept distinct from established author positions.

## Counterargument Ledger (planned)
- Normalize each substantive objection into a distinct **argument ID** rather than counting repeated keywords.
- Store the best charitable formulation, supporting sources, the author's actual answer, key qualifications, related established memories, and the exchange history.
- States: **New**, **Under discussion**, **Answered**, **Set aside**, **Reopened by new evidence**. The author can override a state at any time.
- Count substantive encounters across sessions, including whether an iteration added *new evidence*, clarified a premise, or merely restated the same reasoning.
- Default conversational policy: one strong presentation and a reasonable follow-up are welcome; after an objection is answered, do not repeat it verbatim. A third repetition requires demonstrably new information or the author's explicit request. Do not wait until six or seven repeated objections.
- If the objection has been addressed, prefer a concise acknowledgement such as “We already covered that objection. Here is the new evidence, if any.” Do not present the old objection as a newly discovered defect.
- Do not silence legitimate counterarguments or fact-checks by accumulating a numeric repetition score. New information, user requests, contradictions, and high-stakes factual claims always permit reconsideration.
- AI must not unilaterally mark its argument as “won” or the author's argument “defeated.” Distinguish discussion history from agreement.
- Keep a **Reviewed counterarguments** interface, searchable and linked to source passages and relevant chapters.
- The existing Author Memory Contract's locked distinctions and corrections get priority when identifying what the author actually said.

## Book Gems — first functional layer
- A **Book Gems** navigation tab belongs to each book project.
- Save a typed or pasted sentence, paragraph, argument, reasoning passage, or preliminary draft.
- Choose **Quote**, **Reasoning**, **Argument**, or **Draft Passage**.
- Assign an existing chapter or leave unassigned for later review; filter the collection by chapter, type, and keyword.
- Track status: **Candidate**, **Approved**, or **Used**. Candidates are *not* the author's confirmed beliefs or approved manuscript wording.
- Attribute origin: **Author**, **AI Assistant**, **Research Source**, or **Unspecified**. Preserve original text separately from later user edits; do not silently change the captured origin or source label.
- Add optional source identification and a note about intended use. Never claim assistant-generated lines to be independent historical citations.
- **Save passage** at the top of the app captures highlighted text into a Book Gems review form; paste or type when nothing is selected.
- Remove is soft-delete, preserving recoverability in the database; a future UI can expose restore.
- Saving does not silently edit the actual manuscript.

## Future integrated AI response controls
Every assistant message or selectable passage should have **Save to Book Gems**, including AI-produced possible book lines and reasoning. The author can edit and confirm the exact selection, target project and chapter, source attribution and desired status. Multi-paragraph selections should remain intact. A future **Book-ready line** suggestion may be shown when relevant, but the assistant should not force a generic quote into every single reply. Prefer the author's own voice and preserve source attribution.

## Voice / microphone feature (planned, not implemented)
The user may press a microphone control and speak a command without requiring real-time full-duplex voice chat. Example requests:
- “Save the last sentence as a potential quote for Chapter 3.”
- “Save my explanation as reasoning for the introduction.”
- “Keep that paragraph in Book Gems, but don't put it in the manuscript.”
- “Mark that quote as approved.”

Required command pipeline:
1. Obtain microphone permission explicitly. Record on device, with visible active-recording indicator, cancel/stop and safe handling of incomplete recordings.
2. Transcribe accurately using either a locally configured STT engine or an opt-in cloud service. No silent transmission of audio or transcripts.
3. Parse command intent and reference (“this”, “last response”, “my previous statement”) *against the actual message IDs and visible selections*, not a guessed snippet.
4. Present a confirmation sheet with **exact captured text**, intended book/chapter, attribution, type, and whether to retain the audio file.
5. Save only after confirmation; preserve transcript and source references. If the target is ambiguous, ask which passage rather than fabricating it.
6. Support typed commands through the same command parser as spoken commands. The user can edit transcription before saving.
7. Recording and transcribing a voice note by itself is useful but must never be marketed as full voice conversation until AI integration exists.
8. Sensitive source excerpts and recorded voice are private local data by default; server-based transcription must be clearly opt-in.

## Technical principles
- SQLite migrations must be additive and preserve v0.1 manuscripts, existing memory notes, sources, and conversation imports.
- Isolate all gems by project and validate chapter ownership.
- Distinguish author input, AI text, quotations from sources, user-edited text, and approved manuscript prose.
- Preserve provenance and original captured wording. Offer clear review and undo/restore pathways as the feature matures.
- Later add source message IDs and positional anchors, not only a human-readable source label.
- On Android, use a single-pane Book Gems view instead of forcing cramped desktop columns.

## Acceptance tests
- Save a candidate quote, restart app, and retrieve it in its assigned chapter.
- Edited passage shows the original wording and retains unchanged origin.
- An item in Book A does not appear in Book B; a chapter in B cannot be assigned to a gem in A.
- New migration works for both new databases and existing v0.1 databases without loss.
- Saving a candidate does not update a manuscript or an Established Position automatically.
- Future: when the author has answered an objection twice, a new AI response must add substantive information or acknowledge prior discussion rather than repeating it unchanged.
- Future: microphone command references are resolved to exact passages, and no data is saved to an incorrect chapter without confirmation.
