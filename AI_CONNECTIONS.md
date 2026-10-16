# Free API and local GGUF connections

## Korean default and bundled lightweight uncensored model

Responses default to Korean across the existing API, free API and local inference
paths. Explicit requests for another language remain possible. User/GPT instructions
are retained, and language instructions are added only for inference.

The model dialog now offers **무검열 계열·한국어 모델 다운로드·실행**:
`mlabonne/Qwen3-0.6B-abliterated-GGUF`, Q4_K_M, about 378 MiB. The author describes
it as an uncensored version of Qwen3; the app does not relabel the ordinary Instruct
model as uncensored. This classification does not guarantee all outputs or quality.
The model card is linked in `models/korean-uncensored/NOTICE.md`.

The actual weights are included under `models/korean-uncensored/` as 19 static data
parts, each at most 20 MiB. Their concatenation matches the pinned original SHA-256.
The site verifies part hashes and reassembles the original GGUF before inference.
It reads the weights from its own hosting origin, with verified parts cached on the
device. It does not require a Hugging Face login or fetch external model code.
The original GPT-2 model remains available separately. First preparation requires
downloading the model assets to the device; the app does not claim instant loading
or support on memory-constrained devices.

`GFD_TEST_KOREAN=1 npm run ai:test:live` verifies Korean greetings from the real free
API and the actual local abliterated model. Both returned `안녕하세요!` in desktop Edge.
The remote API still uses Cloudflare's standard Llama model, not the abliterated
weights; uncensored-model execution is provided by the local option. Qwen thinking
output is disabled via the chat template so the UI displays the final reply.

`node scripts/vendor-korean-model.mjs` reproduces the download, splitting and hash
verification in a fresh model destination. It refuses to overwrite existing parts.
No model weights or uploaded original archives were deleted or replaced.

This patch keeps the existing API mode, adds a key-free Cloudflare Workers AI mode,
and restores the missing standalone local GGUF runtime. Choose **AI 연결** on the
homepage. The current API remains the initial mode; select **무료 API (공유 한도)**
or **로컬 모델 (서버 전송 없음)**. The choice persists on this device.

## Deployed free endpoint

- Health: https://goldfire-free-ai.huiwon0621-mcp.workers.dev/health
- Chat: `POST https://goldfire-free-ai.huiwon0621-mcp.workers.dev/v1/chat/completions`
- Provider/model: Cloudflare Workers AI, `@cf/meta/llama-3.2-1b-instruct`.
- No OpenAI key, private client key, Authorization header or new paid subscription.
- This application has a durable, shared budget of **100 requests per UTC day**,
  a three-second global cooldown, at most **4,000 input characters / 16 messages**,
  and **128 output tokens** per request. Failed provider calls consume a reservation.
- Daily reset is 00:00 UTC / 09:00 Asia/Seoul. All visitors share the application
  budget; an allowed website origin does not authenticate a person.
- The server fixes the model/output limit and ignores caller model/token overrides.
  It rejects invalid origins, large bodies, unsupported message types and excess
  requests before inference. Budget state survives restarts and deployments.
- Only the owner's GitHub Pages origin is publicly allowed. Localhost is also allowed
  for development/tests. Add an explicitly approved Cloudflare/Hugging Face website
  origin in `cloudflare-ai/worker.mjs` and redeploy before using that hosting origin.
- No automatic paid-provider fallback or subscription change. On quota/failure the
  frontend uses a previously saved local model if the existing fallback setting is
  enabled; otherwise it shows an error and keeps the user's stored message.

Cloudflare includes a free daily Workers AI allocation; the allocation is shared with
other AI use on the Cloudflare account. This application cap does not control those
other applications or existing account billing settings. No billing plan was changed
by this patch. See [current provider pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/).
The account subscription-list API was not authorized by the linked connection, so
account-wide subscription/billing status was not verified.

The Worker uses native AI and SQLite Durable Object bindings. Only the quota counters
are stored in the budget object, never conversation text. It does not log prompts or
provider exception details. Free mode sends the submitted conversation and text file
context to Cloudflare; images are not supported. This is shown in the AI selection
panel. A request timeout is reported as a failure, not a fabricated answer.

## Local execution

Open **AI 연결 → 로컬 모델 관리** or the existing GGUF model button.
Choose a GGUF file to use the existing persistent file store, or click
**내장 GPT-2 모델 불러오기 (약 102MB)** for the existing bundled model.
The latter reads `models/sexygpt-uncensored-q4_0.gguf` from the website and caches it
using Wllama's model manager. It does not upload the model or send chat text to a server.
The package/model must have been downloaded before offline use; if browser storage
is cleared or the cache is missing, load it again while online.

The trusted Wllama 3.8.1 JavaScript and WASM assets are included in `vendor/wllama/`,
with their license. They are independent of discovered plugins. The engine loads
only when a model is requested and runs inference in a worker. CPU mode is the
default and works without cross-origin isolation headers, including GitHub Pages.
WebGPU can be selected on supported browsers. Large models still require enough
device memory and storage; incompatible files produce an actual load error.

The existing bundled model is **GPT-2**, not an instruction/chat model. Its responses
may be poor or inappropriate. Its metadata is detected and it uses raw text
completion; other architectures use Wllama chat completion. No model is relabeled
or replaced. Load a compatible instruction-tuned GGUF for better conversations.
Original Windows/native bridges and storage formats are retained. Android device
inference and every possible GGUF architecture have not been verified by this patch.

## Verification

`npm run plugins:test` runs offline tests for catalog safety, requests, quota,
model validation and deployment packaging. `npm run plugins:test:browser` tests
browser UI, plugin activation and failure handling with controlled AI stubs.

`npm run ai:test:live` is opt-in and consumes real shared API quota. It opens the
existing homepage at the repository subpath, selects free mode, submits `2 + 2`
through the actual send button, loads the actual bundled GGUF through the model
dialog and submits a local prompt through the send button. It checks a nonempty
model response and verifies that local inference makes no remote AI request.
It does not replace the models or mock inference. Browser tooling variables are
documented in `PLUGIN_SYSTEM.md`; `GFD_REPORT_PATH` can save the results as JSON.

This live check passed in installed desktop Edge with the original source site and
the generated static artifact. The API returned `4`, and the actual local CPU/WASM
model produced tokens with cross-origin isolation disabled. These checks do not
establish the model's reasoning accuracy or Android runtime compatibility.

The existing embedded browser emits unrelated legacy script errors in the browser
console. They were observed during verification; this patch does not claim to have
fixed that separate browser code. The tested homepage AI flows completed.

## Build, deployment and rollback

`npm run plugins:build` also copies trusted AI runtime assets into Vite's public
directory. `npm run build:static` creates the standalone deployment artifact without
requiring dependency installation. Original plugin packages, `.env`, server sources
and private VPN profiles are not published in that artifact.

Worker source/configuration are in `cloudflare-ai/`. Deploy independently with the
AI and budget bindings in `wrangler.jsonc`; do not bundle Cloudflare credentials into
the site. A new domain requires updating the origin allowlist and endpoint config.
Cloudflare Pages has per-file asset limits; large GGUFs may need a separately hosted,
approved model URL or local file selection. Do not assume a >100MB GGUF can be uploaded
as a Pages asset. GitHub Pages serves the existing repository copy of the model.

Selecting **기존 API 유지** restores the prior request path. Remove/revert the AI
integration to remove frontend changes, or disable the `goldfire-free-ai` Worker to
stop the deployed free endpoint. The Worker deployment is independent of the PR.
