# npm-only Cloudflare MCP hosting installer (v1.5.5)

Requires Node.js 20+, npm, a Cloudflare account and explicit authorization. Installing the ZIP into ChatGPT does not run npm or create a hosted server.

1. Put reviewed `spec.yaml` in `specs/`. Never include secrets.
2. Edit `cloudflare/wrangler.toml` ALLOWED_API_HOSTS for your trusted API hosts.
3. Set `SPEC_DIRECT_MCP_TOKEN` in your environment to a strong random value.
4. `npm run host:setup`
5. `npm run host:preview` (no cloud changes)
6. `npm run host -- --apply` (interactive DEPLOY approval and Cloudflare browser login)
7. `npm run host:doctor` (check deployed MCP URL)

After successful verification, `runtime/mcp_connection.json` contains a copyable URL, no token. To reuse an authorized Cloudflare session: `npm run host -- --apply --skip-login`. Optional rollback on verification failure: `--rollback-on-failure`. Cloudflare charges and app connector approval are separate. This is a deploy-time command, not continuous uptime monitoring. Cloudflare Worker is a limited MCP subset.
