# noapi-google-search-mcp integration (GoldFireDragonBrowser)

Upstream: https://github.com/engram-ae/noapi-google-search-mcp (MIT licensed, Python MCP + Playwright/Chromium).

This integration intentionally keeps the existing Vercel /api/jp-search endpoint and GoldFireDragonBrowser.html working. The upstream MCP is a long-running Python/Chromium process, not a Vercel Node.js Function or an HTTP proxy. Installing it as a Vercel dependency does not expose its MCP tools.

## Run upstream on a persistent host (Windows/Linux)

```bash
git clone https://github.com/engram-ae/noapi-google-search-mcp.git
cd noapi-google-search-mcp
python -m venv .venv
# Activate the virtual environment for your OS, then:
python -m pip install -e .
python -m playwright install chromium
noapi-google-search-mcp
```

The executable is an MCP stdio server; connect it to an MCP client using the client’s stdio process configuration. It is not an HTTPS URL, so a website cannot call it directly. The upstream project also contains other tools and optional heavy ML dependencies; review its security and resource usage before deployment.

## Web integration requirements

To connect the website, deploy a separate authenticated HTTPS MCP gateway that supports the upstream stdio transport and maps the tools `google_search`, `google_images`, and `visit_page` to safe, rate-limited HTTP routes. Configure the gateway with Japanese Google region/language preferences where supported. Keep API credentials server-side. Do not expose arbitrary page-fetch or MCP tool execution to anonymous users.

Use the existing `/api/jp-search` endpoint as a safe fallback until the gateway is live and tested. Vercel Tokyo region does not guarantee Japanese egress IP; use a Japan-based gateway with verified public egress IP if that is a requirement.

## Verification checklist

1. Upstream Python dependencies and Playwright Chromium install successfully on the host.
2. MCP client lists the `google_search`, `google_images`, and `visit_page` tools.
3. Japanese search returns results through the MCP client.
4. Authenticated HTTPS gateway returns the expected results and rejects unauthenticated or invalid requests.
5. GoldFireDragonBrowser integration calls the gateway and falls back to `/api/jp-search` on failure.
6. Verify actual gateway public IP geolocation separately; never infer it from the configured region.

**Status:** upstream identified and installation/integration plan recorded; upstream server and HTTPS gateway have not yet been deployed or verified.
