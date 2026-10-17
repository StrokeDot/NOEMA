# Product decision — NOEMA is books only; YouTube scripts become a separate app

**Status:** Author-approved product direction (2026-10-17). Architecture/migration plan, not yet deployed.
**Priority:** Preserve all existing user data while dividing the current all-in-one Windows app.

## Non-negotiable decision

**NOEMA is exclusively a book writing, research, and publishing studio.**
Do not continue to add channel management, thumbnails, video scenes, B-roll, timing, narration, or YouTube publishing features to NOEMA.

Create a **second independent Windows application** for YouTube creators:
- Per-channel profiles, branding, audience, rules, style, editorial voice and themes.
- Scripts belong to a channel; each script has narration, scenes, visual directions, sources, timestamps, production notes, status, and history.
- Upload/use a YouTube thumbnail image and manage revisions/assets for that video (an actual file in local storage, not merely its filename).
- Research, existing script comparisons, Writing Gems, project-grounded AI chat, and author-approved core frameworks as appropriate to the channel.
- Optional future storyboard, voiceover, media timeline and editor integration.
- Own name/brand, repo, app ID, updater, release artifacts, SQLite data directory, and backups. No dependency on NOEMA's executable or database at runtime.

## NOEMA books-only feature scope

- Book project creation, library, chapters/manuscripts, book preview/export.
- Research uploads of PDF, DOCX, EPUB, plain text and supported conversation formats, with original provenance.
- Author's mindset/voice/core-belief frameworks, saved arguments, correction memory, established positions, counterarguments and citations.
- Project-specific AI conversations and approval-based chapter/draft editing.
- Book Gems / candidate passages, revisions, backups and safe updates.
- No YouTube channel switcher or Script Studio in the books-only UI; no option to create new script projects after migration.
- Existing book work and app data must not be reset or lost.

## Safe separation sequence

1. **Freeze and preserve:** Keep a known working all-in-one installer and export a complete verified backup of the current local NOEMA database and original uploads before any schema/UI changes. Do not delete or overwrite the only copy.
2. **Name and identity:** Ask author to name the video application before permanently choosing its Windows identifier, data folder, GitHub repository and updater identifiers. Do not invent a public brand.
3. **Create the script app separately:** Extract or reuse the production script/channel code in a different repository, with independent bundled app identity and SQLite location. Add first-class thumbnail upload, local assets and validation.
4. **Migration:** Build explicit **Export YouTube projects** from the old NOEMA data (channel profiles; scripts; manuscript and scene cues; research original binaries; passages/source links; projects' chat/memory/gems; relevant revision histories; source metadata; imported framework references; thumbnail assets if any). Include integrity manifest and version number. New script app imports and validates. Keep original IDs/relationships or implement reviewed remapping.
5. **Verify both apps:** Tests confirm migrated script and chapter counts, source file hashes, revisions and channel mapping in new app; old book projects remain in NOEMA. Do not delete NOEMA's stored script data as a side effect of UI changes.
6. **Books-only release:** Switch NOEMA onboarding and navigation to books only, hide/remove script editor and channel commands after the migration/export route works, and update documentation/installer/updater identity appropriately. Optionally retain export/recovery tools for old users.
7. **Cross-app insights are opt-in:** Frameworks or research reused across products only with explicit export/import/share action; never silently read/write another app's local data.

## Compatibility caveats

Existing NOEMA v0.1.x releases have books and scripts in the *same SQLite database*. Merely hiding script tabs would strand existing video data: **not a sufficient migration**.

A complete NOEMA backup is useful recovery evidence, but not by itself a ready-to-import script format. Need real export and import with linked source files and chapter/scene ownership. Ensure offline operation and no requirement for a live GitHub or AI account to access prior writing.

The second app's app identifier must differ from `studio.noema.app`; it must not reuse NOEMA's Windows data directory or private GitHub updater credential namespace.

## Separate release gates

- Books-only NOEMA: create/reopen books; import sources; chat/draft/gems; legacy book DB migration; updater; no channel/script navigation.
- YouTube script app: create channel/video; attach/change/view thumbnail; independently create/reopen narration and visual cues; channel scripts and sources; import existing user scripts, verify equality; separate backup/updater.
- Windows installers can be installed side by side; updating one app never modifies the other's projects.

**Next user decision required:** the new YouTube application name. Until that is chosen, preserve scripts and do not perform a destructive or inaccessible split.
