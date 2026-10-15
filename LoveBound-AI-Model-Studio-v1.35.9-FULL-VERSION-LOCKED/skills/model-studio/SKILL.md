---
name: model-studio
description: Upload-first GGUF and dual-WebView browser integration with Hugging Face Hub, Spaces, datasets and other external environments.
---
# LoveBound AI Model Studio v1.35.9
Preserve all prior source archives (24 originals), scripts, user uploads, website sources, GGUF/PyTorch/SafeTensors/custom model files, prompt hash and translation data, Node.js manifests/modules, and rollback artifacts. Never auto-download, auto-upload, install, run untrusted code, publish, deploy, or select a model without approval. Prefer direct file uploads.

## Hugging Face integration
Support user-provided Hugging Face Hub repository exports, GGUF/SafeTensors/PyTorch model packages, datasets and Spaces source ZIPs. Inspect model config, tokenizer, sharded SafeTensors index, Git LFS pointers, model license, dataset format, Space README metadata, app entrypoint, requirements.txt, packages.txt, Dockerfile, environment variables and secrets exclusion. Optional connected Hub/Spaces operations require user approval and available connector, never assume availability. A Git LFS pointer is not a model. Spaces, GPU hardware and hosted inference may cost money; never presume free or working. Do not claim model conversion, training, Space deployment or real inference without running authorized tests. Use `python scripts/hf_upload_audit.py --input uploaded-repo.zip --output new-report.json` for a read-only ZIP audit. The script does not extract or execute uploaded content.

## Existing cross-platform workflows
Keep manually configured GeckoView and Chromium WebView separate under user's custom WebView wrapper, with origin-restricted backend/API bridges. Integrate ChatGPT-like website and plugin functions only via explicit local/hosted service; troubleshoot CORS/auth/SSE and local model runtime. Windows x86_64 and Android ARM64 primary, Linux, offline/localhost/online, VM and custom environments supported as test targets. Preserve GitHub Pages, Cloudflare, OnSpace AI, Readdy AI, Manus, ChatGPT, Codex and Grok integration plans. Retain reversible bug-fix staging, original snapshots and approval gates. No universal compatibility guarantees.

## User-selected persistent version policy (1.35.9)
The user explicitly designates **1.35.9** as the fixed public plugin version.
Keep `plugin.json`, `.codex-plugin/plugin.json`, documentation, release bundles,
and generated reports at version 1.35.9 for future *compatible patches*.
Never bump the version unless the user explicitly authorizes a new version.
Before any patch, inspect the installed manifest and reject accidental version
drift; do not delete existing files or 24 original archives.
This is a project policy, not an immutable platform-level lock: plugin owners,
platform administrators, or explicit later updates may still change metadata.
Do not claim the platform itself prevents future version changes.
