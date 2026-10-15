# v1.5.1 Real-time Self Runner (opt-in)

Runs a local or deployed process supervisor while **you keep it running**. Monitors child exit, optional loopback health, and spec directory changes. Rebuilds OpenAPI registry on tool calls (already supported), emits rotating structured JSONL events, restarts a failed child with bounded backoff and circuit breaker (3 restarts per 5 minutes by default), and gracefully terminates on SIGTERM/SIGINT. It does **not** rewrite source code, install patches from the internet, bypass approvals, or guarantee repair of arbitrary bugs.

## Commands

Preview: `python tools/self_runner.py --dry-run --command python -m server.mcp_server`
Run: `python tools/self_runner.py --interval 5 --max-restarts 3 --command python -m server.mcp_server`
Optional health check: `--health-url http://127.0.0.1:8080/health` **only if your deployment exposes this endpoint**; otherwise omit it.
Events: `runtime/self-runner.jsonl`. Review before enabling persistent OS startup. For cloud deployments use the hosting platform's process manager and health checks instead of stacking multiple supervisors. Install MCP SDK requirements first. Never expose unauthenticated MCP services to the internet.

## Known limits
No self-code modification or autonomous remote deployment; failures that persist stop at the circuit breaker. No Windows EXE or Android APK is produced by this patch. Monitoring only runs where this script is actually started. Existing cloud integrations still require user consent and deployed HTTPS MCP service.
