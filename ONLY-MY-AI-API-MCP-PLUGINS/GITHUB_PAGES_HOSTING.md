# v1.5.6 GitHub Pages + Cloudflare Workers automatic deployment

GitHub Pages **cannot execute an MCP server**. It hosts a static dashboard with a copyable HTTPS MCP URL. Cloudflare Workers runs the actual authenticated MCP API.

1. Create or select a GitHub repository, push this ZIP contents to `main`, and enable **Settings > Pages > Source: GitHub Actions**.
2. Create GitHub repository Actions secrets: `CLOUDFLARE_API_TOKEN` (scoped Worker edit rights), `CLOUDFLARE_ACCOUNT_ID`, `SPEC_DIRECT_MCP_TOKEN` (strong random value >=24 characters). Never commit tokens. Protect `cloudflare-production` environment with reviewers if desired.
3. Set repository Actions variable `MCP_PUBLIC_URL` to the **real** Cloudflare Worker HTTPS URL, e.g. `https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev/mcp`. This cannot be inferred from spec.yaml alone. Obtain the URL from your first approved Wrangler deployment or Cloudflare dashboard.
4. Set `ALLOWED_API_HOSTS` in `cloudflare/wrangler.toml` to trusted API hosts. Review `specs/` for sensitive data: specs are embedded into the Worker deployment.
5. Push `specs/spec.yaml` to main. `cloudflare-worker.yml` bundles specs, deploys Worker, sets the bearer secret, and attempts a connection check. `pages.yml` deploys the static dashboard. You may trigger either workflow manually under Actions.
6. Visit your GitHub Pages URL and press Copy MCP URL. This copies the configured Worker URL, not a GitHub Pages API URL. Registration and credentials still require approval in each MCP client.

Notes: GitHub Actions cannot deploy without GitHub repository permission and Cloudflare secrets. A failed deployment is reported by Actions; there is no perpetual uptime monitor or guaranteed automatic rollback. The Worker supports a subset of MCP. The dashboard intentionally contains no bearer token. For private use, note that a public GitHub Pages site exposes the Worker URL (not the secret). `MCP_PUBLIC_URL` is a repository variable, not a secret. Never store API credentials in `spec.yaml`.
