# NOEMA 0.1.6 — Two Source Foundations, Critical Reasoning & In-App Updater

## Books-only direction

NOEMA focuses on books. Legacy video-script content remains preserved until the separate SCRIPTORIA export/import path is verified. No data is removed in this release.

## Two-source onboarding for each book

New books open their Book Sources screen, containing two distinct upload paths:

**1. Upload my own sources:** Personal essays, rough ideas, manuscripts, argument notes and prior ChatGPT conversation exports. They are marked `source_origin=Author` in SQLite.

**2. Upload books & research:** Another person's book, article, PDF, EPUB, scientific paper, study, or supporting/critical analysis. Marked `source_origin=External` in SQLite.

The source original binary and extractable passages remain project-local. A writer may reclassify the source in the Book Sources screen. Every source still has its separate role: Supporting, Primary Reference, Critical Perspective or Background.

**Source origin does not equal approval.** An author's own discarded idea is evidence of earlier writing, not a confirmed current belief; an imported quotation from another writer isn't part of the user's mindset. Only Author-confirmed Writer Profile and Core Framework records direct NOEMA's assumptions and preferred wording.

For fiction such as a manuscript inspired by *The Lord of the Rings*, the external source can guide analysis of high-level narrative principles like pacing, world-building, themes and character arcs; NOEMA must not reproduce distinctive protected scenes, characters or lengthy passages as the writer's original story.

## Response method: understanding without sycophancy

Each new writing exchange is stored with:

1. **Original** — writer's words, not silently normalized.
2. **Interpretation** — AI's cleaned-up understanding; user-correctable.
3. **Framework-aware response** — respects confirmed author views, acknowledges nuance, uses verifiable and properly attributed source passages.
4. **Critical review** — strongest relevant counterargument, weaknesses in premises/evidence, alternative readings, or narrative logic and originality challenges for fiction. No manufactured objection merely for balance.

NOEMA can be guided by the user's established mental model without agreeing reflexively. When the user corrects the interpretation, the original remains unchanged. The writer can select **Explore this critique** or **Mark critique considered**; only after acknowledging that critique can they use the AI's response to directly create or replace a manuscript chapter. Marking reviewed **does not require agreement**. Proposals in the separate Conversation Draft remain candidates until writer approval.

NOEMA also has a curated **Fiction craft and story framework** writing workflow alongside argument review, source audit, chapter architecture and careful writer reflection.

## Updates inside NOEMA

The older code placed an updater inside Settings. The new version adds an **Updates** navigation entry and checks for available GitHub builds at application startup.

The update process is:

- Check successful main-branch GitHub Actions Windows builds.
- Show higher semantic-version build and require explicit author approval.
- Request GitHub's Actions artifact endpoint with `Accept: application/vnd.github+json` and follow the short-lived ZIP redirect. If authorization is needed, an Actions: Read fine-grained token is stored using Windows Credential Manager, not source code.
- Verify GitHub's SHA-256 artifact digest, ensure ZIP contains exactly the expected NOEMA Windows installer, make a complete SQLite/original-files backup and stage installation after NOEMA exits.
- Preserve the existing Windows application ID and local data folder. GitHub Actions also verifies an in-place baseline upgrade with saved books.

**Not yet independently signed:** This is a GitHub Actions artifact updater, not Tauri's signed update plugin or Authenticode. Tauri's official updater requires a public key in the app, a private signing key protected in the release pipeline and signed update artifacts. Future stable releases should adopt a signed GitHub Releases feed. Actions artifacts expire.

**Important bootstrap limitation:** An installed NOEMA version that has no updater or a broken downloader cannot import a new updater into itself: that machine must be upgraded once by an existing working update method or manually. From the installed update-capable version onward, all further approved releases can be installed through the in-app flow. The GitHub Actions tests verify release build, ZIP API retrieval, hash and Windows in-place installation, but cannot prove that a user's installed executable has live-update permissions until exercised on that PC.
