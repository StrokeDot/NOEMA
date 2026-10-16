# NOEMA — Channel-First Video Script Architecture (v4)

The author may create multiple channels with different voices, subjects and audiences.
Each video-script project belongs to one channel, and scripts remain independent projects.
Books remain independent of channels. Older scripts are migrated as *unassigned* without deleting content, and can be assigned later.

## Channel profile
Store name, mission/description, audience, voice, editorial rules, content pillars, original imported text, source label, and user confirmation. Imported channel text is Draft by default; nothing is silently inferred from a filename. Profiles are editable; the original import is retained. Audio and video imports are not available in this version.

## Script library
New video scripts require selecting or creating a channel in the creation form.
The project switcher organizes scripts under their channel; **Channel profiles** lists all channels and lets the user open or create scripts in them. Scripts have production states: Draft, In Production, Published. Each has separate sections, revisions, sources, memory, and gems.

## Cross-channel comparison
The new Channel profiles workspace lets an author search matching sections from existing video scripts. Search is initially scoped to the selected channel and Published scripts only. The author can opt into **Include other channels** and optionally view unpublished work. Every returned passage is attributed to its own source channel, script, section, and publication state. Results are view-only and do not change the manuscript.

When a cloud/local AI is integrated, the assistant may use author-selected cross-channel references to compare topics, arguments, character studies, and earlier treatments. The target channel's *confirmed* profile determines the default presentation voice. References from another channel provide evidence/ideas, **not style instructions** and not implied author beliefs. Explicit user request is needed before retrieving other channels' scripts into an AI request. Do not automatically copy published passages.

A provider-agnostic `channelInstructions` function and `AIRequest` fields describe future behavior; **no live AI access exists in NOEMA 0.1**.

## Test / safety criteria
- Existing books and manuscripts survive SQLite v4 migrations.
- A script cannot link to a nonexistent channel; a book cannot link to a channel.
- A new script belongs to the chosen channel; an existing unassigned script can be assigned without losing sections.
- Both channel identity and original imported wording persist across relaunches.
- Cross-channel search is disabled by default; opt-in results retain their source channel.
- Publication status affects which scripts appear in default comparison search.
- Channel comparisons and profiles never upload data off-device without an explicitly configured future provider.
