# NOEMA — Dedicated Video Script Studio

**Status:** First functional local-first production workspace implemented in v0.1.x. Separate from the book manuscript editor, and integrated only for projects whose format is **Video Script**.

## Why a production script is more than an ordinary document
A finished video needs two distinct things to stay aligned: what viewers **hear** (spoken narration) and what they **see** (camera/gameplay/stock footage, captions, drawings, transitions, visual examples). Sources must also remain traceable rather than being lost inside the narrative. NOEMA therefore uses structured, ordered **production cues** in addition to its existing freeform manuscript sections.

## Functional v1 workflow

- Open a Video Script project, automatically landing in the **Video script studio** workspace.
- Create individual scenes or production cues, rename and reorder them, or soft-delete. Scenes live inside the active script and channel; there is no implicit cross-channel editing.
- For each cue, independently edit:
  - Scene title.
  - **Narration/voiceover:** exact spoken words; word count and approximate duration at 130 words/minute.
  - **Footage and visual directions:** B-roll, game footage, animations, still frames, on-screen text, cutaways, transitions, and edit instructions.
  - **Source evidence:** choose an original imported source from this script's local Research library; add the precise page/time/URL locator and editorial/evidence notes.
  - **Timing:** optional manually entered planned duration; if omitted, show the approximate narration length.
  - **Readiness:** Draft, Ready, or Recorded.
- Each changed cue auto-saves to SQLite with a 400ms debounce and serialized version-checked writes. Switching cues, switching views, and normal app close request a flush.
- Periodic snapshots preserve earlier versions, with a history review and restore control. Soft deletion keeps the underlying record for future recovery.
- Production preview reads the complete ordered cue list in side-by-side narration and visual columns. Preview does not rewrite the manuscript.
- Older scripts still have the original **Manuscript** section and previous content. Migration only adds new tables.

## Design separation
The Author Voice and active Channel Profile determine future AI drafting style. Channel script comparisons, author's accepted positions, and verified research are separate inputs. An AI-generated possible line is a **Writing Gem**, not necessarily an accepted author belief. A narration paragraph is not a citation, and visuals should never be presented as historical evidence solely because an AI proposed them.

## Limitations and next stages
- This release is a **structured writing/production planning editor**, not a nonlinear video editing timeline. NOEMA does not currently render footage, edit video, or synchronize with Filmora, Premiere, Resolve, or OBS.
- Media file attachments, shot thumbnails, frame-accurate timecodes, audio waveform alignment, playback, link previews, export/import to professional NLE timelines, and timed teleprompter support are future work.
- Direct AI conversation, voice dictation and provider-powered scene suggestion remain unimplemented. No data is silently sent to an AI.
- Source dropdown presently retrieves a searchable page from the active project's imported sources. It does not cross-link or copy another project's private sources automatically.
- Approximate reading speed is a planning aid, not a measured voiceover duration. User may override timing per cue.

## Quality gates
- SQLite v5 migration preserves prior projects, freeform scripts, chapters, sources, memory, and channel profiles.
- Backend tests verify project isolation, optimistic version checks, durable persistence, cue ordering, soft deletion, source ownership, and backup.
- Browser tests exercise scene creation, independent narrator/visual fields, timing, statuses, production preview, and reopening.
