# Modular website integration

Modes: `local-files`, `hosted`, `separate`, `hybrid`, `partial`. Combine exported modules with your own site manually after reviewing changes. The exporter never modifies your website or deploys anything.

Edit `integration_plan.json` and run `python scripts/website_module_packager.py --config custom/website_integration/integration_plan.json --output ./my-website-modules.zip`.

Modules: `frontend_api_client` (browser-side client), `backend_mock` (HTTP 501 example only), `integration_config` (plan metadata; do not publish if you add secrets), `documentation`. No trained weights, system prompt or actual inference backend are included. Back up your website before merging. Never expose private data or keys.
