# One-command Cloudflare hosting installer (v1.5.4)

The ZIP **includes** the installer, but installing a ChatGPT plugin does **not execute** programs or create cloud hosting. Run the following on a trusted PC with Python 3.11+, Node.js/npm and Cloudflare account access.

1. Add `spec.yaml` to `specs/` and review for secrets.
2. Set a strong random `SPEC_DIRECT_MCP_TOKEN` in your shell/environment (never commit or paste it in chats).
3. Set trusted upstream API hosts in `cloudflare/wrangler.toml` (`ALLOWED_API_HOSTS`), otherwise calls remain denied.
4. Preview: `python tools/install_and_host.py`
5. Deploy with explicit approval: `python tools/install_and_host.py --apply`
6. Sign in to Cloudflare when Wrangler requests it; type DEPLOY in your terminal.
7. After deployment the script detects the real workers.dev URL from Wrangler output, sets the MCP bearer secret and probes tools/list. A successful run saves `runtime/mcp_connection.json` containing only the URL and transport, not the secret.
8. For an existing Wrangler session use `--skip-login`; optionally add `--rollback-on-failure` (rollback depends on Wrangler support).

Do not connect clients before configuring compatible authentication. A failed or unrecognized Wrangler output may require manual `--url` verification. No perpetual health monitor is deployed by this bootstrap. The Worker implements only a subset of MCP and requires client compatibility tests. Cloudflare costs, account approvals and ChatGPT/Grok/Manus connector permissions remain separate.
