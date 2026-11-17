# DeepSeek connection options

NOEMA 0.1.15 keeps ChatGPT subscription sign-in, OpenAI API, Claude API and
local Ollama, and adds two optional DeepSeek connections.

## DeepSeek API

Choose **Cloud AI → DeepSeek API** and save a DeepSeek API key. This uses the
DeepSeek API balance. It does not use a ChatGPT or Claude subscription.
Keys stay in their own Windows Credential Manager entry. Writing requests go
to the official `https://api.deepseek.com/chat/completions` endpoint. Flash
and V4 Pro are offered; structured JSON writing feedback uses non-thinking mode.

## DeepSeek Harness

Harness remains an optional companion. NOEMA does not install it, read its
provider credentials, or automatically run a coding-agent session.

1. Install a compatible DeepSeek Harness 0.2.2 preview: 0.2.2-rc.4 or a newer
   compatible 0.2 release. Sign in to your DeepSeek account inside Harness.
2. In NOEMA, choose **Cloud AI → DeepSeek Harness → Prepare Harness connection**.
3. Install the prepared `harness-writing-bridge` folder using Harness's Plugins
   interface. NOEMA opens that folder on request. If the `dsh` launcher is
   installed, the panel also shows the exact local-folder install command:
   `dsh plugin --profile desktop add "<prepared folder>"`.
4. Restart Harness with the plugin enabled. Return to NOEMA and choose
   **Reconnect Harness**, then a model and **Continue to your dialogue**.

The plugin calls the official `ctx.llm` service directly. It exposes only the
first-party `deepseek-account` and `deepseek-official` routes advertised by
Harness. Sign-in, model access and account/API balances are managed by Harness;
account access is not described as a free or unlimited subscription.

Only an explicit NOEMA writing request makes an inference call. The bridge
sends no agent tools and executes no agent loop. A response is accepted only
after a successful terminal `finish` with `reason.kind=stop`. Quota errors,
tool-call endings, token limits and interrupted streams preserve the pending
original writing and cannot save partial model text as a completed response.

The bridge listens on `127.0.0.1:17879`, requires a 64-hex pairing token, and
rejects browser origins, unexpected Host headers and non-DeepSeek routes.
NOEMA's native client bypasses proxies and rejects redirects and remote hosts.
The bridge-only token is separate from provider credentials. NOEMA protects its
copy in Windows Credential Manager. The prepared plugin's user-local
configuration carries the other copy; keep that folder private.

The source plugin is under `src-tauri/harness-bridge`. Its package/index are
compiled into NOEMA with `include_str!`; preparation writes the complete local
package and pairing patch, so no separate plugin download is needed. Credentials
and pairing values are never embedded in the repository or installer.

## Subscription access

ChatGPT's supported subscription sign-in remains a separate provider. Claude
uses the existing Anthropic API connection; third-party subscription plugins
are not relayed through the DeepSeek bridge. Anthropic also documents linked
billing for approved integrations, which this version does not implement.

## Validation

- `npm run build` and `npm test`
- `npm run test:harness` exercises real loopback HTTP pairing, origin/host
  checks, model filtering, exact original input, no tool declarations, and late
  failure handling against a simulated Harness LLM service.
- The browser integration test covers ChatGPT account selection, optional
  Harness preparation/model selection and direct DeepSeek API routing without
  sending live paid requests.
- Native Windows tests include loopback restrictions and route validation.
- A real installed Harness/plugin/account pairing and a live DeepSeek reply
  still require acceptance testing with the user's account.

Official references checked November 18, 2026:

- https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/llm/llm
- https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/account/deepseek-account
- https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/plugin-market.md
- https://api-docs.deepseek.com/
- https://support.claude.com/en/articles/13189465-log-in-to-your-claude-account
