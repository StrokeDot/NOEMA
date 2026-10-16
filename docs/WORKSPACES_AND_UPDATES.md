# NOEMA 0.1.1 — separate writing workspaces

New writing project first asks for **Book project** or **YouTube channel script**.
Each choice then presents its own setup form. Existing project records and stored
content are retained; no database migration is introduced.

Book navigation contains the manuscript, book preview, research, conversations,
memory, frameworks, and Writing Gems. Channel profiles and video production tools
are absent. Script navigation opens Video Script Studio and provides channel
profiles, script research, conversations, memory, and Script Gems. Its older
freeform drafts remain accessible under Freeform draft and Draft preview, with
section terminology rather than book/chapter terminology.

The Books / YouTube channels switch changes workspaces. The project picker lists
only the current workspace's project type. Research remains scoped to the active
project. Frameworks remain a shared library but require explicit project activation.

## Updates — current behavior and honest limitation

0.1.0 has no updater, so it must receive this version through an installer once.
The 0.1.1 Settings page includes **Open update downloads**, which opens the private
repository's Windows builds in the system browser. Download the latest successful
installer, close NOEMA, and run it over the existing installation; do not uninstall.
The app identifier and data-folder location are unchanged.

This is a download shortcut, **not automatic downloading or installation**. The
current GitHub connection cannot provision repository secrets, and there is no
configured signed, authenticated update feed. No access token or signing secret
is placed in source, installer, or localStorage. The private repository is not
made public to work around this limitation.

To finish automatic updates, configure the official Tauri updater with a stable
public verification key, securely managed CI signing private key, and an update
feed the installed app can authenticate to. Private Actions artifacts alone are
not an anonymous update feed. Signing and authenticated delivery must be tested
before presenting an Install update button. Tauri reference:
https://v2.tauri.app/plugin/updater/

## Verification

Browser tests verify type selection, separate navigation and project pickers,
returning to saved script scenes after switching workspaces, and script-specific
gem labels. Existing authoring/import/memory/theme and narrow-window tests remain.

The Windows workflow installs the previous verified 0.1.0 artifact, creates book
and video data, closes the app, then installs 0.1.1 into the same installation.
It checks both old projects and another restart using the new executable. It never
uninstalls the app or resets its data directory. The temporary baseline artifact
is currently retained until January 2027; refresh the baseline for future releases.
