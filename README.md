# NOEMA — Version 0.1

**Where Thought Becomes Legacy.**

A local-first writing studio built with Tauri 2, React, TypeScript, Tiptap, Rust, and SQLite FTS5. Books, video scripts, and accumulated knowledge are the center of the application. No AI account, API key, cloud database, telemetry, or network service is required for ordinary use. **AI model connections are not yet implemented.**

## Delivery status

This is a source distribution, not a prebuilt Windows installer. The frontend and Rust storage core have been built and tested in the development environment. The native desktop shell and Windows installation/relaunch workflow still require verification on Windows. See `docs/VERIFICATION.md` for exact results and remaining gates. Do not treat this source package as a fully certified desktop release.

## Start on Windows

Install the following development prerequisites:

- Node.js 24 LTS with npm.
- Stable Rust through rustup, using the default Windows MSVC toolchain.
- Microsoft Visual Studio Build Tools with **Desktop development with C++**, including the Windows SDK.
- Microsoft Edge WebView2 Runtime (usually already present on current Windows).

Official prerequisite guide: https://v2.tauri.app/start/prerequisites/

Extract the source ZIP. Open PowerShell in its `noema` folder:

```powershell
npm ci
npm run tauri dev
```

After prerequisites are installed, you can also double-click `Start-NOEMA.cmd`.

The first build downloads dependencies and compiles Rust; later launches are faster. Do not open `index.html` directly. `npm run dev` alone starts the frontend, but deliberately does **not** provide a browser database.

To produce a Windows installer:

```powershell
npm run tauri build
```

The NSIS installer is generated in `src-tauri/target/release/bundle/nsis/`. An installed build needs no Node or Rust to run. This project does not yet configure code signing; a locally built unsigned installer may show Windows publisher warnings.

A Windows GitHub Actions workflow is included. If you place this folder at the root of a repository, the workflow tests and builds an installer downloadable from the run's artifacts. It does not publish a release or upload any books.

## What is implemented

- Multiple independent **Book** and **Video Script** writing projects with title, author, description, and persistent project settings.
- **Core Frameworks** workspace: create or import text documents (TXT/MD/JSON), preserve original wording, label author vs. external perspectives, explicitly confirm, and activate reusable frameworks for selected projects.
- Create, rename, reorder, and soft-delete chapters. Chapter headings provide sections inside a chapter.
- Tiptap rich text: paragraphs, headings, bold, italic, underline, lists, blockquotes, undo/redo, word count, and focus mode.
- Debounced autosave, serialized writes, optimistic conflict detection, normal-close save flushing, and recoverable revision history.
- Import UTF-8 TXT/Markdown, recognized JSON conversations, and text-based PDFs. Originals are copied under unique IDs, never overwritten.
- FTS5 passage search scoped to the active book, with file names and PDF page / message / extracted-character locations.
- Paginated source lists, passage readers, conversation archives, and search results; tags editable per source.
- Four manual project-memory categories, search, edits, deletion confirmation, and optional source links.
- Read-only book preview in chapter order, five chapters per preview page.
- Light/dark themes, responsive navigation, collapsible research workspace, desktop panel resizing.
- Complete local backup of all books, revisions, memories, and original files.
- Provider-independent AI and publishing interfaces, without fake AI responses.

## First session

1. Create a Book or Video Script project. For example, **26 Reasons Why Jews Should Believe in Jesus**, author Alejandro Rosillon. No book is forced into the application.
2. Add chapters with the + button. Use heading formatting for sections.
3. Write, wait for **Saved on this computer**, and reopen the application to verify your local setup.
4. In Research, choose **Import files**. ChatGPT ZIP exports must first be extracted; select `conversations.json`.
5. Search the right panel. Clicking a result opens the source's corresponding passage page.
6. Add a Project Memory entry and, if useful, link it to a source.
7. Open Book Preview to read chapters together.
8. In **Core Frameworks**, add or import an author belief document, review it, mark it Confirmed, and check **Use in this project**. Other projects are unaffected unless you activate it there as well.
9. For video scripts, sections use the same rich-text editor as book chapters. A specialized narration/B-roll/timing editor is planned, not implemented.
10. Use Settings → Create complete backup periodically.

## Data and durability

Tauri selects the operating system's application-data directory for `studio.noema.app`. On Windows this is normally `%APPDATA%\studio.noema.app`; **Settings shows the authoritative path**. Everything is local:

```text
noema.sqlite3       project data and FTS5 index
noema.sqlite3-wal   SQLite write-ahead log while active
noema.sqlite3-shm   SQLite shared-memory file while active
originals/         immutable copies of imported files
```

SQLite uses foreign keys, WAL journaling, `synchronous=FULL`, atomic transactions, and additive schema migrations through version 3. Newer unknown schema versions are rejected rather than overwritten. Revision snapshots capture the previous draft at most once a minute; restoring creates an additional snapshot of the current draft. Revisions are not automatically purged. Deleted chapters remain in SQLite; a graphical trash/recovery screen is not yet implemented.

The 400 ms autosave debounce means an abrupt OS/process crash can lose the latest unsaved keystrokes. Normal chapter switching and normal window close flush pending writes. Errors remain visible; failed writes remain in editor memory for retry. No local app can guarantee recovery after disk loss: use backups.

Backups use SQLite `VACUUM INTO` while holding the write lock, then copy original files. Choose a **new folder name** outside NOEMA's data folder. The complete backup includes all projects. To restore manually, close all NOEMA windows, preserve/rename the current data directory as a safety copy, then copy the backup folder's contents into the exact data directory shown in Settings. Do not combine a restored database with stale `-wal`/`-shm` files. Relaunch and verify your books. Backup files are not encrypted.

## Supported conversation formats

- ChatGPT `conversations.json`: array of conversations with `mapping`, parent references, and message content parts.
- One conversation with `mapping`.
- An object with a `conversations` array.
- One conversation with `messages`, each with a `role` or `speaker` and string `content`.
- A direct array of `{ "role": "user", "content": "..." }` messages.

ChatGPT branches are preserved, including node IDs, parent IDs, original message JSON, available timestamps, roles and conversation IDs. Parent-first traversal is deterministic and is not represented as a single canonical branch. The original JSON remains authoritative. Attachments and multimodal payloads are retained in the original but not interpreted. Unrecognized JSON structures fail explicitly.

Text/PDF passages use 1,600 Unicode characters with 160-character overlap, so ordinary words across passage boundaries remain searchable. Location offsets refer to extracted text, not original PDF byte offsets. Search treats whitespace-separated words as literal AND terms, not SQL/FTS syntax. It is lexical search, not semantic retrieval.

## Architecture

- `src/`: React interface, Tiptap editor, autosave coordinator, typed models, `ai.ts` extension interfaces.
- `src-tauri/`: native window, restricted capability configuration, IPC command adapter, OS data directory.
- `crates/noema-core/`: independently testable storage and import engine.
- `schema.sql`: first transactional database migration.
- `tests/`: autosave tests, PDF fixtures, full frontend/Rust integration scenario.
- `examples/test_bridge.rs`: development-only localhost integration-test bridge, not linked into the installed app.

Native imports parse in a blocking worker without holding the database mutex. Import commits are transactional; very large commits or backups can briefly delay saves, with pending save status shown. The renderer loads only active manuscripts and paginated archive passages. Full archives are never placed in a chat context or loaded at app startup. Search pagination bounds results, although offset pagination and very broad searches still need performance profiling at much larger scales.

No network permission or credential storage is configured for AI. `AIProvider` accepts instructions, established positions, selected manuscript, bounded source excerpts and recent conversation context. NOEMA 0.2 can implement retrieval and provider adapters without changing the core ownership model.

## Verification commands

```powershell
npm run build
npm test
npm run test:core
npx playwright install chromium
npm run test:e2e
npm run tauri build
```

The browser integration suite launches the real Rust/SQLite engine in an isolated temporary folder and a development-only frontend bridge. It supplies test file selections in place of the native OS picker. It is not a substitute for a native Windows installation test. No real author data is used.

Optional: `npm run format` and `cargo fmt --manifest-path crates/noema-core/Cargo.toml`.

## Known limits and next milestone

- Windows compilation, installation, launch, and book/video reopening passed automated verification. Native file dialogs and long-session manual acceptance remain; see [verification report](docs/VERIFICATION.md).
- Android packaging, touch selection behavior, sync, EPUB/PDF production, OCR, footnotes, illustrations and AI are not implemented.
- Imports are limited to 256 MiB per file and parsed in memory. This is a deliberate bound, not a claim of unlimited archive size. Several documents can be imported sequentially. There is no cancellation or byte-progress UI yet.
- PDF extraction quality varies with fonts, layouts and encodings. Image-only pages are reported; no OCR. A PDF with mixed image/text pages can be imported with a warning for blank extracted pages.
- No separate section tree, graphical trash restoration, original-file export button, or automated backup schedule yet. Original copies are accessible through the data folder or backup.
- No automatic memory extraction: established positions are always authored manually.
- The app has no encrypted vault; privacy relies on your local Windows account/disk protections.

Next: evaluate the installed prerelease using [the first-session checklist](docs/INSTALL_WINDOWS.md). Then **NOEMA 0.2**: project-grounded AI answers with direct citations to original passages, bounded retrieval, user-approved memory promotion, and provider choice.

### Book Gems (0.1.x foundation)

NOEMA now includes a **Book Gems** workspace for candidate quotations, reasoning, arguments, and draft passages, grouped by chapter. Highlight text and use **Save passage** in the top toolbar, or open Book Gems to type/paste a passage. Each entry has attribution and source notes, status (Candidate / Approved / Used), and an editable version that keeps the original capture intact. These items are separate from established project memory and never modify manuscript text automatically.

Microphone capture, voice commands, assistant response capture, and objection repetition tracking are planned integrations, **not yet available**. See `docs/BOOK_GEMS_AND_ARGUMENT_LEDGER.md` for their specification.

## Author-selected reasoning frameworks and script format

NOEMA now distinguishes **Book** from **Video Script** projects. Both use the same durable writing/archive tools. Video Script Studio provides the separate narration, visuals, citations, and timing fields described below.

The **Core Frameworks** library is shared locally across writing projects but **not automatically activated** across them. Frameworks may belong to the Author or represent External, Character, or Custom standpoints. Imported text is initially **Draft**. You must review and confirm it before enabling it for a project. The original text is retained separately from later edits. Confirming a framework means the transcription represents that perspective, not that the claims have been proven.

Future model integration will support three reasoning modes: **Within framework**, **Compare frameworks**, and **Critical evaluation**. The database already exposes only confirmed and active frameworks to the planned AI context contract; NOEMA does not currently send them to any AI service. See [Script and framework specification](docs/SCRIPTS_AND_FRAMEWORKS.md) and [Author memory requirements](docs/AUTHOR_MEMORY_CONTRACT.md).

## Channel-first video scripts (v0.1.x)

Create a **Channel profile** from the left navigation before making a new video script. Profiles capture mission, audience, voice, editorial guidelines and recurring subject areas. You can type a profile or import a local TXT, Markdown, or JSON text file. Imported original wording is retained separately. Profiles are unconfirmed until you review and confirm them.

When creating a new **Video Script** project, choose a channel (or quickly create one in the project form). The project switcher groups video scripts by channel. Open the **Channel profiles** view to see each channel's scripts and make another script under it. Script status can be set to **Draft**, **In Production**, or **Published** in Settings.

The **Compare existing scripts** panel searches passages from other script projects. By default it searches Published scripts in the current channel. To include other channels, explicitly check **Include other channels**. Each result identifies its original channel and source script. Script text is not silently copied into a new manuscript.

**Important:** The AI conversation/model integration is still future work. The database can return confirmed channel profiles and explicitly selected cross-channel script references, but NOEMA does not yet send them to an AI or reason over them automatically. Existing online YouTube videos and ChatGPT conversations are not automatically imported. See [Channel Script Library](docs/CHANNEL_SCRIPT_LIBRARY.md).


## Dedicated video script studio (production cues)

Video Script projects now open in **Video script studio**. Create and arrange scenes; each scene has separate **Narration / voiceover**, **Footage / visual directions**, **evidence/source references**, optional planned duration, and Draft/Ready/Recorded status. These fields auto-save locally with revision history. Use **Production preview** to review an ordered, side-by-side narration/visual script before recording.

The original **Manuscript** view remains available for older freeform drafts. Existing books, script sections, channel profiles, and research are not replaced by the new cue editor. An uploaded research file must belong to the same project to be linked directly.

This is a writing/production planning system, **not** a video rendering or timeline editor. There is no connected AI model, live voice assistant, Filmora integration, or automatic media footage import yet. See [Script Studio specification](docs/VIDEO_SCRIPT_STUDIO.md).

## Windows installer verification

The Windows Actions workflow runs the frontend build, JavaScript tests, Rust tests,
and browser integration tests before building the NSIS installer. It then silently
installs the package on the disposable runner and uses WebView2 automation to create
and reopen a book and video script in the installed application, without Vite.
An app-specific WebView2 debugging policy is temporarily set on the disposable
runner and removed after testing. It is not part of the installed app configuration.

A successful run provides **NOEMA-0.1-Windows-installer** (the installer ZIP) and
**NOEMA-Windows-verification** (screenshots and a native smoke-test report).
Download and extract the installer artifact, then run its `.exe`. The current
prerelease is unsigned. No programming tools are needed to use the installed app.

### PDF checkout regression

The original PDF fixtures were valid, but Git's Windows newline conversion treated
the mostly-ASCII PDFs as text and changed their byte offsets. `.gitattributes` now
marks all PDFs as binary. Do not regenerate or edit PDF fixtures with text tools.
Tests verify the xref/object offsets, extraction on both pages, byte-for-byte
preservation of the imported original, and the specific no-text/OCR limitation.
No PDF dependency or importer workaround was required.

Verified installer: [download the Windows artifact](https://github.com/StrokeDot/NOEMA/actions/runs/38858899633/artifacts/12028082487). See [the full verification report](docs/VERIFICATION.md) for test scope, checksums, and limitations.

## Version 0.1.1

Book projects and YouTube scripts now have separate setup, navigation, and project lists. See [workspaces and update behavior](docs/WORKSPACES_AND_UPDATES.md). Settings includes a private update-download shortcut; automatic in-app installation is not configured. Run the newer installer over the existing installation without uninstalling.

## AI chat beside the manuscript — NOEMA 0.1.3

Open **AI chat** in a book or video script to discuss your writing beside the working editor. Messages are stored inside that project. Configure either an **OpenAI API key** (separately billed from a ChatGPT subscription, stored in Windows Credential Manager) or an **Ollama local model**. NOEMA does not transfer your existing ChatGPT sessions or Plus entitlement; import ChatGPT conversation exports into project sources instead.

NOEMA retrieves selected confirmed author frameworks, established positions, recent chapter text, the designated working draft, and relevant excerpts from the current project's research. External sources remain explicitly attributed to their source. Source texts are untrusted reference material. You must **approve** chapter creation or replacement; it does not silently modify a manuscript.

**New imports:** Microsoft Word DOCX and DRM-free EPUB alongside PDF, TXT, Markdown and ChatGPT JSON exports. Export Google Docs as DOCX for import. Source originals remain saved separately from extracted text. EPUB media, DOCX tracked changes/comments and scanned PDF OCR are not supported yet. The source list now supports **Use as working draft** and **Create chapter** from an imported source. Protected ebooks and legacy binary DOC files cannot be imported.

No API model or local LLM is automatically downloaded, and provider answers should be verified before use as evidence. There are no direct Google Docs edits, realtime voice calls, or multi-step autonomous editing agents in this version.
