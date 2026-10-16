# NOEMA — Books, Video Scripts, and Core Belief Frameworks
**Status:** Foundational project-format and manual framework features implemented in 0.1.x. AI reasoning remains planned.

## Writing project formats
NOEMA supports **Book** and **Video Script** as project formats. Existing databases and projects default to Book. Both formats use the same local archive, research, editor, memory, gems, snapshots and backup system. Their sections share the current chapters table, so switching formats does not delete text.

- **Book:** chapters and sections, citations, drafts, book preview, future EPUB/PDF publishing.
- **Video Script:** script sections, narration writing, evidence and project memory. Future specialized writing fields will include **spoken narration**, **visual directions/B-roll**, **quoted clip/source**, **scene or shot**, **estimated narration time**, and **production notes**. These fields are **not yet implemented**; current scripts use the ordinary rich-text editor and section labels.

Do not mix scripts with books under a single project merely because both are writing. They remain separate, selectable projects while optionally sharing approved author-wide frameworks.

## Core belief frameworks
The user can upload or create descriptions of intellectual foundations—personal convictions, methodological principles, theological or philosophical premises, named opponents' positions, and fictional character perspectives.

- Each framework has a title, perspective owner (**Author**, **External**, **Character**, **Custom**), main text, qualifications and source name.
- Add by typing or importing local UTF-8 **TXT, Markdown, or JSON** text (up to 500 KB in the first version). A PDF can separately be imported into Research; direct PDF-to-framework import requires a future UI.
- Imported original wording is immutable; subsequent edits change only working text. The filename is preserved as a source label.
- Frameworks are **Draft** by default; the author reviews and explicitly marks them **Confirmed**. Confirmation signifies accurate transcription/attribution, **not** scientific or historical verification.
- Only confirmed frameworks can be **active for an individual writing project**. The same framework may be activated for several books and/or scripts. Deactivation does not delete it.
- Archiving requires confirmation and deactivates the framework in all projects; data remains in local storage.

**Never** infer that material labelled External, Character, or Custom constitutes the author's personal belief. Multiple active frameworks may conflict because their aim may be comparison.

## Planned AI reasoning behaviors
NOEMA will eventually offer three explicit modes:
1. **Within framework:** Take the selected premise set provisionally and examine its implications, reasoning, wording, and counterarguments while distinguishing assumptions from established external facts.
2. **Compare frameworks:** Present fair/strong versions of the applicable frameworks; identify real agreements, disagreements, and differing starting premises.
3. **Critical evaluation:** Test the premises and conclusions against historical/scientific/textual evidence, independent of whether the author endorses them.

The AI must always follow the author's approved writing voice where appropriate, and should not silently turn a hypothetical or opponent's argument into an established author position. Repeated challenges should use the existing Counterargument Ledger design: the same answered objection does not need to be restated without genuinely new grounds.

The currently defined `AIRequest` type has project format, reasoning mode, and active framework fields, and the database exposes a `framework_context` action returning only active, confirmed records. **There is no live model provider yet; these settings are not currently passed to ChatGPT or any LLM.**

## Data security and persistence
- v3 is an additive SQLite migration. Do not overwrite v1/v2 data.
- Original uploads are read in the local app and persisted as database text, not sent to a server.
- Framework library is author-wide, with project-specific activation. Book and script data remain project-scoped.
- Future network model use must require explicit provider configuration and clearly disclose what stored framework excerpts are sent out.
- All selected content must be reviewable and correctable by the author.

## Further implementation
- Rich voiceover/B-roll/timeline editor for video scripts.
- Explicit scene/project planning and recording/editing metadata.
- File handling for PDF/DOCX frameworks with original attachment preservation, source anchoring and file integrity verification.
- Framework version history, locks and citations; provenance review.
- AI retrieval and prompt construction using author memory plus the correct active framework(s), with user-selected reasoning mode.
- Counterargument Ledger to retain and recognize previously answered objections.
- Automated tests for across-session AI style consistency and viewpoint attribution.
