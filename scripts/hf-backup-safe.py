#!/usr/bin/env python3
"""Hugging Face snapshot backup with validated card and actionable HTTP errors."""
import os
import sys
import time
from pathlib import Path

from huggingface_hub import HfApi
from huggingface_hub.utils import HfHubHTTPError


def main():
    token = os.getenv("HF_TOKEN")
    repo = os.getenv("HF_REPO")
    folder = Path(os.getenv("GFD_BACKUP_DIR", "/tmp/gfd-backup"))
    if not token or not repo or not folder.is_dir():
        raise SystemExit("Missing HF_TOKEN, HF_REPO, or snapshot folder")
    card = folder / "README.md"
    if card.exists():
        card.rename(folder / "BACKUP_ORIGINAL_README.md")
    card.write_text(
        "---\nlanguage:\n- ko\ntags:\n- backup\n- goldfiredragon\n---\n"
        "# GoldFireDragon Browser backup\n\nSource and available model snapshot.\n",
        encoding="utf-8",
    )
    api = HfApi(token=token)
    owner = api.whoami()["name"]
    if owner.casefold() != repo.split("/")[0].casefold():
        raise SystemExit("HF_TOKEN owner does not match destination namespace")
    for attempt in range(3):
        try:
            api.create_repo(repo_id=repo, repo_type="model", private=True, exist_ok=True)
            api.upload_folder(
                folder_path=str(folder),
                repo_id=repo,
                repo_type="model",
                commit_message="Back up GoldFireDragon source and available models",
            )
            print("Backup completed:", "https://huggingface.co/" + repo)
            return
        except HfHubHTTPError as exc:
            status = getattr(exc.response, "status_code", None)
            message = (getattr(exc.response, "text", "") or str(exc))[:800]
            print(f"::error::HF HTTP {status}: {message}", file=sys.stderr)
            if status not in (429, 500, 502, 503, 504) or attempt == 2:
                raise SystemExit(1)
            time.sleep(5 * (attempt + 1))


if __name__ == "__main__":
    main()
