# ChatGPT subscription connection

NOEMA for Windows supports the official **Sign in with ChatGPT** public-client
flow. An eligible account can authorize NOEMA to use its ChatGPT plan for writing
requests, without an API key or an intermediary Codex installation.

## Connect

1. Start a book dialogue and choose **Cloud AI → ChatGPT subscription**.
2. Select **Continue with ChatGPT**. Complete authorization in your system browser.
3. Return to NOEMA, choose an available model, and continue to your dialogue.

You can also select **ChatGPT subscription** in the AI model manager. That panel
shows the active account, saved registrations, sign-out, and **Manage ChatGPT
usage**. After signing out, use **Continue with saved account** to reuse the
same registration. Add another registration only for a different account or
workspace, rather than repeatedly registering the same account.

Usage shares the account's plan limits. No automatic fallback to API billing or
account rotation occurs. NOEMA sends the current writing request and its local
project context directly to OpenAI. This connection does not import ChatGPT
conversations or memory. NOEMA still maintains its own project memory and books.
Only explicit writing requests initiate inference; signing in or refreshing the
model catalog does not automatically generate book content.

## Implementation

- The native Rust process owns OAuth, the loopback listener, token renewal, and
  requests. Credentials never enter the webview, localStorage, SQLite, or logs.
- Each installation persists an opaque UUID host ID in Windows Credential
  Manager. Each sign-in uses a new state, nonce, and S256 PKCE verifier.
- The listener binds only to `127.0.0.1`, before opening the browser. Its port may
  change; its callback path remains `/auth/callback`.
- Initial authorization uses `dynamic_agent_client` with `agent_name_hint=NOEMA`.
  The issued registration ID is used for code exchange and later authorization.
- ID-token signatures, issuer, audience, expiry, subject and nonce are checked
  against OpenAI discovery/JWKS. Reauthorization cannot replace another saved
  account's identity or registration. The granted plan scope is required.
- Saved registrations and rotating credentials live in protected OS credential
  entries. A generation pointer commits complete token sets atomically. Chunking
  avoids the small per-entry Windows credential size limit.
- One desktop instance and a native async lock serialize refresh, sign-out,
  account changes and writing requests.
- Model choices come from the account's `/v1/models` catalog, filtered by
  `visibility=list`. Changing accounts clears the previous model selection.
- Inference uses `/v1/responses`, `instructions`, full necessary input history,
  `store:false` and `stream:true`. Completion is accepted only after
  `response.completed`; interruption and late quota errors cannot save partial
  feedback as a completed exchange. Author originals retain the existing
  persistence-before-network behavior.
- Sign-out tries session revocation with bounded retries, clears local tokens,
  and retains registration/host identity. If revocation is unconfirmed, NOEMA
  directs the user to disconnect the app in ChatGPT Settings.

## Validation and limits

Run `npm run build`, `npm test`, `npm run test:core`, `npm run test:e2e`, and on
Windows `cargo test --manifest-path src-tauri/Cargo.toml --lib`.

The OAuth and stream parser tests do not require a live account. A real browser
sign-in, account-specific model catalog, one writing exchange, restart, refresh,
and sign-out still require a user-authorized live acceptance test. The first
live exchange consumes the user's normal plan allowance.

The current implementation targets the Windows desktop app. An Android device
needs its own native callback and protected-storage integration. There is no
hosted token proxy. Keep the plan connection available without a paid NOEMA
upgrade. This repository currently has no LICENSE file; a public repository by
itself does not establish an open-source license. A distribution license should
be chosen by the project owner before distributing NOEMA as open-source software.

Official implementation references (checked November 17, 2026):

- https://developers.openai.com/siwc/token-sharing-open-source/sign-in
- https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions
- https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference
- https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations
- https://openai.com/policies/sign-in-with-chatgpt-terms/
