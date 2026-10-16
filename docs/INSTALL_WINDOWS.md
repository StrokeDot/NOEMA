# Install and try NOEMA on Windows

1. Sign in to the GitHub account that can access the private StrokeDot/NOEMA repository.
2. Open the Windows verification workflow run linked in the delivery report.
3. Under **Artifacts**, download **NOEMA-0.1-Windows-installer**.
4. Extract the ZIP and run **NOEMA_0.1.0_x64-setup.exe**.
5. Follow the installer and open **NOEMA** from the Windows Start menu.

This package targets 64-bit Windows. It includes the built application; Node.js,
Rust, Codex, and a development server are not needed. The installer may need to
install Microsoft's WebView2 runtime if it is not already present. This test
release is not code-signed, so Windows may show an unknown-publisher warning.
Only proceed with the installer downloaded from this private repository.

## A short first session

- Create a small test book, add two chapters, and try formatting. Close and reopen
  NOEMA to check the text before bringing in valuable manuscript work.
- Import a text PDF or conversation export, search a known phrase, and open its
  source passage. Image-only PDFs need OCR and are not supported yet.
- Create and edit a Project Memory note and save a Writing Gem.
- Create a channel and a Video Script project. Add two scenes with different
  narration and visual directions, reorder them, then reopen the application.
- Import an external framework, keep its perspective marked External, confirm it
  after review, and activate it only for the intended project.
- Try dark mode, book preview, and the local backup option in Settings.

Manuscripts, archives, original source files, and the SQLite database remain on
this computer. Use Settings to find the data location and make backups. Do not
replace an existing data folder with test data. AI integration is not active.
