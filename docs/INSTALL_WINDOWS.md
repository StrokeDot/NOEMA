# Install or upgrade NOEMA 0.1.1 on Windows

**Verified installer:** https://github.com/StrokeDot/NOEMA/actions/runs/38866970900/artifacts/12031283151

**Successful Windows workflow:** https://github.com/StrokeDot/NOEMA/actions/runs/38866970900

## Install the test version

1. Sign in to GitHub with access to the private `StrokeDot/NOEMA` repository.
2. Open the installer link above and download the artifact ZIP (`NOEMA-0.1.1-Windows-installer`).
3. Extract the ZIP in Windows Explorer, then run `NOEMA_0.1.1_x64-setup.exe`.
4. If NOEMA 0.1.0 is already installed, **close it first and run 0.1.1 over the existing installation**. Do not uninstall the old version; do not manually delete its data directory.
5. Launch NOEMA from the Start menu. Confirm your existing books and video scripts are present.

This is a private, unsigned Windows x64 test build. Windows may show an unknown-publisher warning. Proceed only with the installer downloaded from your private repository. WebView2 may be installed if needed. The app itself does not require Rust, Node.js, Codex, or an internet connection for ordinary local writing.

## Verified in GitHub Actions

On 2026-10-16, Windows verification run 38866970900 passed the frontend build, JS tests, Rust tests, Playwright browser tests, native release packaging, and a native Windows upgrade smoke test. That smoke test installed the previously verified 0.1.0 version, created and reopened a book chapter and video script scene, installed 0.1.1 over the original installation without uninstalling, and checked that both projects survived the upgrade and another launch.

This is strong automated coverage, but it is not a guarantee against all problems on individual PCs. Make a backup of anything valuable before changing your installation.

## First things to test

- **Books:** Create a new book, add chapters, type and format text, and reopen the app.
- **YouTube channels:** Create a channel profile and a script; write narration and separate visual directions in Video Script Studio.
- **Research and memory:** Import a small TXT or text-based PDF, check a source passage, and save a project-memory note or Writing Gem.
- **Persistence and backup:** Close and reopen NOEMA. Use Settings to locate the data folder and create a local backup.

Do not import your entire manuscript archive until you've confirmed your small test projects are saving correctly. Original books, research, and SQLite data remain on your computer. AI model connectivity is not yet implemented.

## Updates

Version 0.1.1 has a link in Settings to open the private GitHub download page, **not** an automatic updater. A future automatic updater requires signing and a securely accessible update feed. For the current version, close NOEMA, download the newer installer from your private repository and run it over the existing installation without uninstalling.

The application's identifier and data directory are unchanged between 0.1.0 and 0.1.1. Do not delete the original data folder as part of upgrading.
