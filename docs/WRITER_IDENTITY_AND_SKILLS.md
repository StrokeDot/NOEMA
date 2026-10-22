# NOEMA Writer Identity, Conversation Layers & Skills — v0.1.5

## Purpose

NOEMA is a **book-writing app**. A writer develops an argument through dialogue; early spoken attempts can be grammatically rough or logically unfinished. The system must retain the original, explicitly distinguish proposed interpretations from the author's true meaning, and form a durable, corrigible memory over time.

## The three-layer exchange

1. **Author original** — exact typed or speech-to-text message as received by NOEMA. Immutable once saved (database `writing_turns.original_text`). It is NOT a recording of microphone audio; speech-to-text can mishear words. The author can add a subsequent clarification, not silently rewrite history.
2. **AI interpretation** — cleaned-up and reorganized statement of what the AI thinks the author means. Revisable when the author corrects it; separate `interpretation_author_corrected` flag.
3. **AI answer** — distinct response containing genuine critical engagement, counterarguments, evidence/source citations, and proposals. The model returns structured JSON so interpretation cannot be silently substituted for original speech.

Input is stored before contacting Ollama/OpenAI. If a provider fails, original input stays `pending` rather than being lost. Legacy chat history remains accessible.

## Two separate downstream documents

- **Writer Profile** contains tentative observations about writing voice, stated preferences, reasoning style, beliefs and moral framework, with a verbatim quotation and originating conversation turn when model-generated. AI suggestions are `Candidate`; confirmed/rejected only by the author. Only confirmed notes enter later prompts. It is NOT an automated assessment of actual personality, spiritual standing, conscience, or psychological diagnosis.
- **Conversation Draft** contains candidate book-ready passages from exact author words, their reviewed coherent interpretations, and AI suggestions. Each has provenance. The author can approve, exclude or collect them automatically as **candidates**. Generating a chapter from approved pieces requires a separate explicit confirmation; the original transcript remains intact.

The writer may explicitly enable "Let AI collect proposed passages automatically". This delegates *collecting candidates*, never publishing to a manuscript or interpreting every utterance as endorsement.

## Provider architecture

- **Local**: Ollama, base URL `http://127.0.0.1:11434`; per-request structured JSON `format` and model selection. The local model itself must be installed separately and may compete for VRAM with other programs.
- **Remote**: OpenAI API, independently billed; API key stored in Windows Credential Manager. Importing a ChatGPT export preserves archive as a source but cannot transfer ChatGPT Plus entitlement or private ChatGPT account memory.
- Model suggestions for the user's 16 GB VRAM, 64 GB RAM Windows computer: `qwen3.5:9b` for everyday conversations; `gemma4:12b` for writing and source reading; `gpt-oss:20b` for deliberate reasoning (tight VRAM at long context); optional `qwen3:14b` as an alternative. Official availability and formats depend on Ollama tags.

For quality, compare the same real argument against multiple providers, grading fidelity to author intent, novelty of counterarguments, citation accuracy, coherent grammar and author voice. Do not assume bigger model or benchmark score automatically means better author understanding.

## Built-in writing skills

The first release uses **hard-coded, reviewed writing workflows**, selected in the chat:
- Open conversation
- Argument reviewer (steelman and logical gaps)
- Chapter architect (book structure)
- Source and citation auditor (no fabricated citations)
- Writer profile reflection (cautious, evidence-linked learning)

These are *skill-like instructions*, **not** an external plugin runtime. The open Agent Skills specification describes SKILL.md bundles, which can contain scripts. Future support should parse vetted instruction-only skill packs separately, show their source and permissions, restrict external tools/network/filesystem, and require explicit consent before scripts run. Untrusted source documents and downloaded skills must never be allowed to override the writer's confirmed instructions.

## Voice: first implementation and remaining work

The chat's Dictate button uses browser/WebView `SpeechRecognition` where available and leaves recognized text in the unsent composer for writer review. The system may transmit audio to the browser speech service: it is not guaranteed offline. On Windows, the writer may use **Windows + H** in the focused message box if WebView2 doesn't expose speech recognition.

For truly local/offline voice recognition, a future version should:
1. Record opt-in microphone audio with clear start/stop and permission controls;
2. Use an independently installed local Whisper backend (e.g. whisper.cpp) for transcription;
3. Review the transcript before submission and optionally retain the audio *only with explicit opt-in*;
4. Provide English/Spanish language selection and preserve pauses with optional punctuation;
5. Never infer a psychological trait merely from dictated fillers or grammatical errors.

This version provides no bundled Whisper engine or verified offline microphone capture. Do not market the Dictate button as guaranteed offline.

## Data and migration safeguards

- SQLite schema migration v9 is additive and does not rewrite prior book and video-script records.
- Project-specific conversations and drafts never cross into another project; global author-confirmed profile notes may inform all book projects.
- Existing NOEMA scripts remain archived in this database until the separate SCRIPTORIA migration/export is implemented and verified.
- The private GitHub updater still relies on authenticated artifacts and SHA-256 integrity; the future signing improvements are separate from this writer identity feature.
