# LoveBound v1.35.9 — GitHub private backup for Hugging Face Spaces

Integrated into both the original plugin root (`github_auto_backup.py`) and
the Hugging Face Spaces training module (`training/github_auto_backup.py`).
Keeps all original `assets/*.zip` unchanged.

1. Export a versioned snapshot with `training/persistent_vault.py`.
2. Set `GITHUB_TOKEN` in Hugging Face **Space Secrets**, with permission to
   create private repositories and write repository contents.
3. Ensure `git` is installed; for archives >50 MiB, install `git-lfs` and
   have adequate LFS quota. Prefer a Docker Space with these tools preinstalled.
4. Preview (no network or changes):
   `python training/github_auto_backup.py --archive /data/exports/snapshot.zip`
5. Approve create + backup:
   `python training/github_auto_backup.py --archive /data/exports/snapshot.zip --apply --approve`
6. For an existing private repository, add `--allow-existing-repo`.
7. Automate in a Space worker/job only after configuring explicit authorization;
   keep `GITHUB_TOKEN` in Secrets and ensure sufficient Git LFS quota.

The GitHub repo is private by default and public repos are refused.
Backups are content-addressed, so the same snapshot is not rewritten.
This script does not store GitHub tokens in Git remotes. It is a
separate remote backup layer in addition to HF Dataset and persistent volume.
It cannot guarantee indefinite retention, service uptime or quota.
Check GitHub LFS charges, HF storage and restore tests.

**Restore**: clone the private GitHub repo using an authorized credential,
download the relevant `backups/<SHA256>.zip` (including LFS payload),
and use `persistent_vault.py import --archive ...`.
