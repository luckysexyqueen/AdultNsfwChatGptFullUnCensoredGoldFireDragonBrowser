# ONLY-MY-AI-API-MCP-PLUGINS-PROJECT

## Deploy directly from GitHub to Cloudflare Workers (Free)

1. In Cloudflare dashboard go to **Workers & Pages → Create → Import a repository / Connect to Git**.
2. Authorize the Cloudflare GitHub integration for this repository and select `luckysexyqueen/ONLY-MY-AI-API-MCP-PLUGINS-PROJECT`, branch `main`.
3. Configure **root directory** `/`, **build command** `npm run build`, **deploy command** `npm run deploy`. Do not use a Pages/static output directory.
4. Under Worker settings, add an encrypted secret named `MCP_BEARER_TOKEN` (generate a unique strong random token, do not commit it).
5. Deploy. Your MCP endpoint will be `https://<actual-worker-subdomain>.workers.dev/mcp`; health check is `/health`. The actual URL is assigned by Cloudflare, not GitHub Pages.
6. Test MCP JSON-RPC `tools/list` with `Authorization: Bearer <your-token>` and `Content-Type: application/json`. Keep the token private.

The repository's root `npm run build` installs Worker dependencies and generates `cloudflare/src/specs.generated.mjs` from `specs/`. `npm run deploy` uses `cloudflare/wrangler.toml`. This is intended for Cloudflare's Git integration; no GitHub Actions secrets are needed for this deployment path.

**Limits:** Workers Free has request/CPU quotas; 24/7 address availability does not guarantee uninterrupted service or unlimited requests. `MCP_PUBLIC_URL` is not needed for deploying the Worker, but can be configured separately if a client or dashboard needs a prefilled URL. The GitHub Pages dashboard is static and does not run the MCP Worker.
