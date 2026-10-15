# Cloudflare Workers auto-deploy (v1.5.3)

This is a separate JavaScript/ESM Cloudflare Workers implementation. Python FastMCP cannot be deployed unchanged into Workers. The Worker implements a bounded, stateless JSON-response subset of Streamable HTTP MCP (initialize, ping, tools/list, tools/call), not every transport/session feature. Verify compatibility with each client.

## Setup (first time, requires user approval)
1. Install Node.js/npm and Python 3.11+; run `cd cloudflare && npm install`.
2. Run `npx wrangler login` in cloudflare/ and authorize your Cloudflare account.
3. Put trusted **public** HTTPS API hostnames in `cloudflare/wrangler.toml` `ALLOWED_API_HOSTS`. Keep secrets out of YAML and the repo.
4. Set `SPEC_DIRECT_MCP_TOKEN` in your local environment to a strong random secret; never commit it. Configure Worker secret with `python tools/cloudflare_deploy.py --apply --set-secret` after first successful deployment if needed. Wrangler may require Worker creation before `secret put`; when that happens deploy first, then set the secret, then verify. Never expose unauthenticated endpoints.
5. Add spec.yaml files to `specs/` (review that they contain no sensitive data). Preview: `python tools/cloudflare_deploy.py`.
6. Deploy: `python tools/cloudflare_deploy.py --apply` (runs Wrangler, using already approved credentials). Wrangler prints the assigned workers.dev URL. The URL is not predictable from the spec filename.
7. Verify: `python tools/cloudflare_deploy.py --apply --url https://YOUR-REAL-WORKER.workers.dev/mcp` (this **redeploys**; instead use `python tools/connection_doctor.py --url https://YOUR-REAL-WORKER.workers.dev/mcp` for check only). Ensure token is available to the doctor. Use `python tools/mcp_url.py --origin https://YOUR-REAL-WORKER.workers.dev --json` and `python tools/dashboard.py` for copy UI.

## Limitations and security
- Deployment is not possible without a connected Cloudflare account and Wrangler authorization. No account credentials are bundled.
- Worker bundles specs at deploy time: updates require another deploy; existing Python hot reload applies only to the Python server.
- Bearer authentication is mandatory for `/mcp`. The public `/health` endpoint returns only a count. Host allowlist defaults to deny-all. Cloudflare's edge DNS resolution is outside this adapter's control; enforce outbound restrictions and review hosts; avoid DNS rebinding by trusted host policy. No arbitrary code execution or auto source rewriting.
- Recovery: bounded connection test retries and optional `--rollback-on-failure` for Wrangler versions that support rollback. It is not an always-on external uptime monitor, and rollback can fail. Cloudflare runtime restarts are platform-managed. Self Runner is for local processes, not Workers.
- Not supported in this Worker adapter: SSE streaming, persistent sessions, OAuth login/token refresh, OpenAPI external refs, multipart binary streaming, complete parameter serialization, or unrestricted uploads. Writes require confirm_write and real user authorization.
- Cloudflare plan limits, account restrictions, custom domain configuration, client app approval, and charges remain under user control.
