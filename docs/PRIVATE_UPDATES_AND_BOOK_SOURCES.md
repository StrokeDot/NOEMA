# NOEMA 0.1.2 — Private in-app updates and project source foundations

## How project sources work

A book or script has **two explicitly different kinds of knowledge**:

1. **Author mindset:** the author-approved, *confirmed* Core Frameworks activated for the project. This reflects premises, methods, style rules, and boundaries the author reviewed.
2. **Project sources:** imported research files, books or extracts, primary texts, critical viewpoints, references, and previous conversations. These remain **source claims, not author beliefs**.

The writing top bar now includes **+ Attach sources** so an author can import a file while writing, similar to attaching documents to a chat. NOEMA stores the original locally and searches extracted passages in the current project. Supported formats: TXT, Markdown, JSON conversation exports, and text-based PDF, up to 256 MiB each.

In Book sources or Script sources, select **Use in book** to classify a source as **Supporting**, **Primary Reference**, **Critical Perspective**, or **Background**, and add notes about how the material should be used. The distinction matters when interpreting arguments. The project knowledge context backend returns confirmed active author frameworks separately from project-specific sources, including their roles and usage guidance.

This is local research organization. NOEMA 0.1.2 **does not yet have a live AI model connection**, and no user research is sent automatically to any model. Attachments cannot currently OCR scanned PDFs or extract protected ebooks; only supported source material should be imported.

## Private GitHub updater

**Important:** NOEMA 0.1.1 only links to GitHub downloads. NOEMA 0.1.2 introduces a working **in-app private GitHub Actions artifact updater** that needs one initial 0.1.2 installer upgrade. It does **not** use Tauri signed release packages or Authenticode publisher signatures yet.

1. Install 0.1.2 normally over your current NOEMA installation, without uninstalling or clearing the data folder.
2. In NOEMA → Settings → NOEMA Updates, create a fine-grained personal access token on GitHub:
   - Resource owner: account that can access `StrokeDot/NOEMA`.
   - Repository access: **only** `StrokeDot/NOEMA`.
   - Repository permission: **Actions: Read**; GitHub may require Metadata: Read.
   - Use a reasonable expiration. The app will prompt for a new token if it expires.
3. Enter the token in Settings. NOEMA validates private workflow access and stores the token in Windows Credential Manager rather than SQLite, localStorage or the executable.
4. Choose **Check for updates**. NOEMA looks only at successful `main` runs of `.github/workflows/windows.yml`, compares proper semantic versions, and ignores expired artifacts.
5. When a newer installer is present, click **Install update and close NOEMA**. NOEMA flushes pending manuscript changes, downloads the ZIP via authenticated GitHub API, verifies the GitHub artifact SHA-256 digest, checks the expected Windows setup executable name, and creates a complete backup of the SQLite database and originals outside the active data folder.
6. A separate installer process starts after NOEMA closes. Reopen NOEMA normally after Windows finishes installing. If an error occurs, your archive backup is retained.

**Security and practical limits:** GitHub artifact SHA-256 verification proves integrity against the authenticated GitHub metadata, *not* that the executable was signed by a dedicated NOEMA release-signing key. Only connect a token you trust and approve updates from your own verified repo. A compromised repo/workflow could build a compromised binary. Do not embed tokens or copy them into chat. Credentials may be deleted from Settings. Updates require internet access, authentication, and an unexpired successful GitHub Actions artifact. Users can always use the manual installer as a recovery path.

For higher-assurance publisher-signed update packages, add the official Tauri 2 updater, signing key management and authenticated private release feed in a future release. Do not call this feature a Tauri signed updater.

The 0.1.2 client update path needs a *future* 0.1.3 (or later) GitHub installer for complete real end-to-end validation of self-update; CI can test installation and migration separately.

## Data integrity

- Existing book, script, sources, frameworks, chapters and memories migrate to schema v6 without deletion.
- Source roles default to Supporting for older imports.
- The author controls whether uploaded sources should be used as primary references, critical perspectives, or background.
- The app does not delete a manuscript or source just because a new update becomes available.
- Installation is always user approved; simply launching NOEMA does not trigger an installation.
