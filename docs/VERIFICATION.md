# NOEMA 0.1 verification and handoff

Date: 15 October 2026.

This source package implements a working writing/research foundation. It is **not yet a verified Windows release**. Windows acceptance remains a required gate, not an assumed result.

## Verified in the development environment

| Check | Result |
|---|---|
| Strict TypeScript check + Vite production build | Passed |
| Rust storage/import core compilation | Passed |
| Rust workflow tests | 12 passed |
| Autosave coordinator tests | 3 passed |
| Browser integration workflow against actual Rust/SQLite | 1 passed |
| Desktop 1440 × 1000 and tablet-width 720 × 1000 layout inspection | Inspected; no horizontal overflow in the tablet test |

The browser scenario creates the example book and two chapters, applies bold formatting, verifies saved content after reload, switches chapters immediately after typing, reads both chapters in preview, imports a two-page PDF, retrieves a page-two passage, creates and edits a source-linked memory, persists the dark theme, creates a second book, verifies research/memory isolation, switches back, and checks the narrow layout. Native file selection is substituted with fixture paths; storage, import and search use the actual Rust core and on-disk SQLite.

The 12 core tests cover reopening a database, conflicting saves, revision snapshots, preserved original file bytes, project-scoped FTS search, memory CRUD, ChatGPT branch metadata, recognized/unrecognized JSON, invalid-file cleanup, text PDF page locations, scanned-PDF rejection, chapter reordering/soft deletion, consistent backup reopening, repeated migration, Unicode passage boundaries, and import/search/pagination of a 10,000-message archive.

The autosave tests exercise coalescing, serialized slow writes with correct version progression, and recovery/retry after a failed write.

## Not verified here

- Native Tauri compilation and launch: blocked by unavailable Linux GUI development libraries/pkg-config. Installing those packages was not permitted in this environment.
- Windows compilation, NSIS installation, native file dialogs, actual Windows application close/reopen, and WebView2 behavior: no Windows host available.
- Android compilation or installation.
- Production-scale multi-gigabyte archive behavior, encrypted PDFs, complex PDF reading order, OCR, or long-session endurance testing.

No Windows executable is included. `npm run tauri build` and the included Windows CI workflow are provided for the native verification gate. The frontend's roughly 695 KB minified JavaScript bundle produces Vite's advisory size warning; compilation succeeds. No external editor/font/CDN fetch is required at runtime.

## Required Windows acceptance checklist

1. Install prerequisites from README and run `npm ci`.
2. Run `npm run check` and `npm run tauri build`; retain the logs.
3. Install the generated NSIS installer and launch NOEMA.
4. Create a book with title, author, and description.
5. Add several chapters, rename/reorder one, and confirm a deletion.
6. Enter formatted text; close immediately after the last edit. Relaunch and verify the final text.
7. Import TXT, Markdown, ChatGPT JSON, and a text PDF through the native picker. Confirm originals are intact and malformed/scanned files report errors.
8. Search a known passage, check its location, and open the source reader.
9. Create/edit a memory note, link its source, and verify it after relaunch.
10. Read the book preview; change themes; collapse/resize the research panel.
11. Create a second book and confirm archives, chapters and memories remain separate.
12. Create a backup, restore it into an isolated data directory, and verify all data and originals. Do not overwrite the only copy of a real book during this test.

Until these checks pass on Windows, refer to the delivery as the **NOEMA 0.1 foundation source**, not a completed Windows release.

## Next milestone

First close the Windows acceptance gate. Then NOEMA 0.2: bounded retrieval, cited answers from imported conversations, selectable local/cloud provider adapters, cancellation, and author-approved memory promotion. Add larger archive benchmarks before increasing the per-file limit.
