---
title: LoveBound AI Model Studio
emoji: 💜
colorFrom: purple
colorTo: blue
sdk: gradio
app_file: app.py
pinned: false
---

# LoveBound AI Model Studio v1.35.9 — Hugging Face Spaces FULL

This **FULL** package preserves the original plugin directory layout and **all 24 original ZIP archives**. It adds a Gradio Space app with read-only project ZIP diagnostics and a version/inventory panel.

## Install on Hugging Face Spaces

1. Create a **private** Gradio Space (recommended).
2. Extract this archive locally. Upload **all files and directories inside the archive** to the Space repository root. `app.py`, `README.md`, and `requirements.txt` must be at the root.
3. Large individual archives may require Git LFS / Xet-supported uploads; the Space build may exceed resource quotas. Never substitute a Git LFS pointer for the actual archive when offline preservation is required.
4. Let the Space install `requirements.txt` and start `app.py`.
5. Use the read-only diagnostics tabs to inspect uploaded ZIPs.

## What this does / does not do

- Includes original ChatGPT plugin manifests, scripts, configs, workspace templates and 24 source ZIPs, without deleting or repacking the source ZIP contents.
- Exposes the Hugging Face repository and dual-WebView **inventory** diagnostics as a Gradio UI.
- **Does not** automatically run a ChatGPT plugin in Spaces, execute GGUF models, fine-tune models, build EXE/APK, fix arbitrary source code, or deploy to GitHub/Cloudflare.
- Preserves the user-selected version `1.35.9` as a project policy; this is not an immutable platform lock.
- **Security:** Files committed to a public Space repository may be visible/downloadable. Audit licenses, private files, API keys, personal data and third-party code before uploading. Keep Space secrets in the Hugging Face Secrets settings, not in Git.

The `assets/` directory contains third-party archives with their own licenses; their inclusion does not imply permission to redistribute publicly.

## Training extension
MergeKit, LoRA, QLoRA and full fine-tuning launchers are under `training/`; see [training/README.md](training/README.md). Space UI only generates plans. Install training dependencies and run on explicitly provisioned compatible GPU.
