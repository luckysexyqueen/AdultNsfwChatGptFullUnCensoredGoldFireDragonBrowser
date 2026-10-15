# v1.5.2 — Copyable MCP URL

An OpenAPI `spec.yaml` describes an upstream API. It does **not** itself provide an internet endpoint. The packaged MCP server reads the spec(s) and exposes its tools at a deployed server's `/mcp` route. One MCP endpoint serves all loaded specs.

1. Put OpenAPI files in `specs/` and deploy the server to a real HTTPS domain, with incoming MCP authentication and upstream egress restrictions configured.
2. Generate the registration URL: `python tools/mcp_url.py --origin https://YOUR-REAL-DEPLOYMENT` (replace the example with a real host).
3. Generate a copyable JSON registration guide: `python tools/mcp_url.py --origin https://YOUR-REAL-DEPLOYMENT --json`.
4. For a local copy button dashboard, set `PUBLIC_MCP_ORIGIN=https://YOUR-REAL-DEPLOYMENT` in the process environment and run `python tools/dashboard.py`; open `http://127.0.0.1:8765` and click **Copy MCP URL**.
5. Paste the URL into each client's custom MCP connector configuration, provide credentials using the client's supported secure flow, and approve connection. Test with `tools/connection_doctor.py` or the target client's tools list.

The dashboard shows a configured URL, **not** proof that the endpoint is live or connected. No URL is fabricated before deployment. Specs added to a mounted `specs/` directory are reloaded on subsequent registry calls; image-baked specs require rebuild and redeploy. The MCP tools are dynamically backed by the registry but clients may need tool refresh. A web account's connector cannot be installed merely by pasting a spec.
