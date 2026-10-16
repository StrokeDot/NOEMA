# NOEMA Windows verification and handoff

Verified 16 October 2026. This is a testable Windows prerelease, with a built NSIS
installer and automated installed-application verification.

- Verified application commit: `cf900ae60a55ae404311fc6cd94d24b7b08c4862`
- [Successful Windows workflow](https://github.com/StrokeDot/NOEMA/actions/runs/38858899633)
- [Download installer artifact](https://github.com/StrokeDot/NOEMA/actions/runs/38858899633/artifacts/12028082487)
- [Screenshots and native verification report](https://github.com/StrokeDot/NOEMA/actions/runs/38858899633/artifacts/12028451612)
- [Installation and first-session instructions](INSTALL_WINDOWS.md)
- [PDF diagnosis and repair details](WINDOWS_REPAIR.md)

## Results

| Check | Result |
|---|---|
| Strict TypeScript check and Vite production build | Passed locally and on Windows |
| JavaScript autosave tests | 3 passed locally and on Windows |
| Rust workflow/integration tests | 19 passed locally and on Windows |
| Playwright browser workflows using real Rust/SQLite | 3 passed locally and on Windows |
| Tauri release compilation and NSIS packaging | Passed on Windows |
| Installation of generated NSIS package | Passed on Windows |
| Installed executable loads embedded frontend without Vite | Passed on Windows |
| Create book/chapter, save, close native window, relaunch and read text | Passed on Windows |
| Create channel/video, save separate narration and visuals, close/relaunch | Passed on Windows |
| Downloaded installer and evidence ZIP checksums | Matched GitHub upload digests |

The native report records installation success, three application launches,
embedded frontend assets, and successful book and script reopening. The screenshot
shows the installed Video Script Studio. These are actual Windows tests, separate
from the development-only browser bridge.

The browser workflows exercise rich text, immediate chapter switching, book
preview, PDF import and page references, source-linked memory editing, confirmed
framework activation, theme persistence, project isolation, video scene ordering,
and an unobstructed writing workspace at 1024 × 768 and tablet widths.

The Rust suite covers durable SQLite reopening, conflict detection, revision
snapshots, original imported bytes, project-scoped FTS search, conversation roles,
branches and timestamps, invalid-import cleanup, PDF page extraction and specific
OCR errors, PDF byte offsets, memory CRUD, chapter ordering/soft deletion, backup
reopening, legacy migrations, retained manuscript text, Writing Gems, framework
perspective/activation, channel grouping, separate video fields, and a searchable
10,000-message archive. No existing tests were disabled.

## Installer identity

Extract `NOEMA_0.1.0_x64-setup.exe` from the installer artifact. It is 3,494,946 bytes.

- Installer SHA-256: `2faf6f4a474f25eb1c415e8420bcfb6c46763e5125db63557d9dbf5cc9339803`
- Artifact ZIP SHA-256: `caadc4efcfe6010a00bafdae3a4626d8aa1784257f70f1e8fd331faf559cabaa`

GitHub currently retains this Actions artifact until 14 January 2027. Repository
access is required to download it; the repository remains private.

## Limits and remaining manual acceptance

- The installer is unsigned and may produce a Windows unknown-publisher warning.
- Native file-picker interactions, all Windows display scales, complex PDF layouts,
  encrypted PDFs, long writing sessions, and large real-world author archives have
  not received exhaustive manual testing. Scanned PDFs require unsupported OCR.
- Browser tests substitute fixture paths for native file selection; imports and
  storage still use the real Rust implementation.
- Native restart tests wait for the saved indicator before closing. An immediate
  close during an unfinished save still merits manual acceptance testing.
- The approximately 736 KB minified frontend bundle produces an advisory size
  warning; the build succeeds and assets are included locally.
- AI, Android delivery, EPUB/PDF publishing, and synchronization are not implemented.
- No author database was used or modified in these tests. Migrations were unchanged;
  migration and backup tests pass on synthetic legacy databases.

Start with a small test book and video before importing valuable work. Exercise
native imports, revisions, Writing Gems, and backups through the UI. Then prioritize
NOEMA 0.2: bounded project retrieval and answers with direct source citations,
provider-independent AI, and author-approved memory promotion.
