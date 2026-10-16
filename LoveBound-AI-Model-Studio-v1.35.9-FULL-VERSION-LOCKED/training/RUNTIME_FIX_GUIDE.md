# LoveBound AI Model Studio runtime repair v1.35.10
- Run `python training/integration_smoke_test.py` before publishing.
- Tests Python syntax, requirement checks, vault snapshot/export/import/restore, GitHub plan mode and explicit approval gate, original 24 ZIP assets.
- GitHub backup now handles existing repositories whose default branch is not main.
- Vault refuses symlinks in snapshot source.
- Gradio GitHub control is explicitly a command preview, not a real deployment button.
- Offline PASS is NOT a guarantee of Hugging Face GPU training, model generation, network access, Git LFS quota, or real remote uploads.
