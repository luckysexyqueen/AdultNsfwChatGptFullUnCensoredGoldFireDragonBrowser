# Website plugin discovery and compatibility

The existing standalone chat and `GoldFireDragonBrowser.html` load `plugins/boot.js`.
It reads one same-origin, data-only `plugins/registry.json`. No GitHub token, directory
listing, backend, package installation, or remote JavaScript is needed in the browser.
The catalog includes the three existing packages. Open **플러그인 3개** to inspect
them and enable their optional, visible chat instructions. Defaults preserve current
chat behavior. Choices are stored locally by plugin ID and version; a version change
requires renewed opt-in unless the owner explicitly set `autoEnable`.

Enabled instructions are added only when preparing an inference request, including
the standalone remote chat, local GGUF, GGUF fallback and the React `streamChat` path.
Conversation instructions, messages, model storage and native browser bridges keep
their existing formats. The browser page shows the catalog; it does not execute
server tools. `window.GFDPlugins` exposes `list`, `setEnabled`, and `extendInstructions`;
`window.GFDPluginsReady` resolves even if discovery fails. Notifications are
`gfd:plugins-ready` and `gfd:plugins-changed`.

## Add or update a plugin

1. Add a package folder containing `plugin.json` with `name` (lowercase ID), `version`
   and `description`. OpenAI extension `interface.displayName` is optional.
2. Optionally add a reviewed `web-plugin.json`:

   ```json
   {
     "schemaVersion": 1,
     "autoEnable": false,
     "context": "Plain text instructions reviewed by the website owner."
   }
   ```

3. Run `npm run plugins:build` and commit the generated `plugins/` and `public/plugins/`
   files. This is also automatic before `npm run dev`, `npm run build`, and in
   `npm run build:static`. GitHub Pages branch publishing serves files as committed;
   it does not run Node or discover new directories at request time. CI detects a
   stale committed catalog and produces a fresh static deployment artifact.
4. Run `npm run plugins:test`. No dependency installation is needed for these checks.
   For optional browser tests, install Playwright in your tooling environment, install
   its Chromium browser and run `npm run plugins:test:browser` after a static build.
   `GFD_PLAYWRIGHT_MODULE` may point to an existing Playwright `index.mjs` file URL;
   `GFD_BROWSER_CHANNEL=msedge` uses installed Edge; `GFD_STATIC_ROOT` selects a build
   directory. These tests stub AI responses and do not call real inference services.

Discovery walks at most five levels, ignores dot directories, dependency/build/model
stores and symlinks, selects only public metadata, rejects duplicate IDs and oversized
data, and fails the build on malformed packages/adapters. It does not read `.env`,
skills, model archives, API specs, MCP configuration, credentials or executable files.
An adapter with extra fields such as `script`, `entry`, `endpoint` or `apiKey` is rejected.
Known credential formats are rejected in published text; this is a defense in depth,
not a substitute for reviewing public descriptions/context. Never put secrets there.

The runtime uses text nodes (no plugin HTML), a 64 KiB streaming JSON limit, no redirects,
no credentials and a four-second request timeout. Invalid entries are isolated; a
missing, offline, wrong-type or malformed registry yields an empty catalog while chat
continues. Plugin requests bypass service-worker caches. No offline copy of plugin
context is reused after a failed load. Private browsing falls back to in-memory choices.
The trusted loader is application code; packages cannot supply JavaScript, CSS,
iframes, shell commands, network endpoints or tool-call handlers.

## Hosting

**Current GitHub Pages branch:** merge this PR into `gh-pages`; the committed loader,
catalog and HTML changes work under the repository subpath with `.nojekyll`.
Use `npm run build:static` to prepare a separate `site-dist/` directory, or download
the `static-website` artifact from the plugin checks workflow. The workflow validates
and packages; it does not change Pages settings or deploy on its own.
The existing `npm run deploy` now publishes this directory instead of the entire
repository. A fresh output directory is required; pass an alternative destination
with `node scripts/build-static-site.mjs /path/to/new-output` for repeated builds.

The packager retains the standalone HTML and explicitly selected browser assets,
including existing offline/model assets. It excludes source packages, `.env`, Git
metadata, Python/Node servers and deployment credentials. Public Supabase URL and
an explicitly `anon` JWT are projected from the existing client configuration;
service-role or unrecognized keys are omitted. Review existing static assets before
publication. This patch does not erase secrets already committed to public history.
The legacy VPN `.ovpn` profiles contain private key material and are deliberately
not copied to the public static artifact. Their original repository files are
untouched; native VPN use still requires a private/native distribution of those
profiles. The new plugin runtime never fetches or imports them.

**Optional Cloudflare Pages:** build command `npm run build:static`, output `site-dist`.
No dependency install is required by the static builder; use a build environment that
does not automatically install the legacy application dependencies, or upload the CI
artifact with Direct Upload. This supports the existing static site; a Worker backend
is separately deployed and authorized. See the official
[static HTML guide](https://developers.cloudflare.com/pages/framework-guides/deploy-anything/).

**Optional Hugging Face:** upload the contents of the generated directory to a static
Space and use a Space README with YAML `sdk: static` and `app_file: index.html`. Keep
server credentials in an independently deployed Docker/Gradio service or Worker, never
in static JavaScript/Space public variables. See
[Static HTML Spaces](https://huggingface.co/docs/hub/main/spaces-sdks-static).

GitHub Pages cannot run Python/MCP/Node servers. Existing packaged skills and servers
remain intact, but their execution requires an independently deployed backend plus
client authorization. The separate opt-in free AI mode and restored local engine are
documented in [AI_CONNECTIONS.md](./AI_CONNECTIONS.md); plugin discovery itself does
not connect MCP tools or transmit chat data. See
[GitHub Pages creation and limitations](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site).

## Roll back

Disable context with the per-plugin checkbox, or remove `web-plugin.json` and rebuild
to leave a catalog-only plugin. Revert the PR to remove the complete integration.

## ZIP-to-APK / local asset plugin compatibility

The generated plugins/boot.js is a classic script containing the reviewed runtime and a packaged data-only registry. file:, content:, capacitor: and other non-HTTP asset origins use the packaged registry without ESM imports or JSON fetches. HTTP(S), including localhost wrappers, continues fetching the current registry; a hosted load failure does not revive a stale snapshot.

Edit plugins/boot-source.js for menu UI or plugins/runtime.mjs for runtime behavior, then run npm run plugins:build. The generated boot.js and public/plugins/boot.js must match. Rebuild/repackage the APK after plugin changes; an old installed APK retains its packaged catalog. LocalStorage saves preferences when supported; blocked storage uses memory for the current run.

Run npm run plugins:test:apk with Playwright available; GFD_PLAYWRIGHT_MODULE and GFD_BROWSER_CHANNEL work like the existing browser checks. Tests open both entrypoints through file:// with networking disabled and exercise all three plugins, instruction application, persistence, and denied storage.

Package the entire static build with index.html at the ZIP root. A lone index.html cannot replace referenced JS/model/font assets. The plugin menu and instruction integration are verified in a desktop Chrome file:// test, not an Android APK. APK wrapper policies, remote AI CORS/networking, file-based ES modules used elsewhere in the app, WASM, model resources, VPN credentials and native Gecko/Chromium bridges still need host support and device verification.

## Durable APK preference fallback

Plugin initialization probes localStorage and falls back to IndexedDB when it is denied. The IndexedDB cache is loaded before GFDPluginsReady resolves. Call await GFDPlugins.flushPreferences() before a host-controlled shutdown to wait for queued preference writes. If both browser storage mechanisms are denied, only current-run memory is available; the host must provide persistent storage to survive a restart. Browser tests now include a complete browser-process restart using a persistent profile with localStorage denied.
