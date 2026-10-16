# LoveBound v1.35.9 — Persistent, reusable repository vault

Organize distinct logical categories such as `models`, `adapters`, `gguf`,
`datasets`, `prompts`, `configs`, `plugins`, `archives`, and `reports`.
Each snapshot is immutable by content hash, with files stored as
SHA256-addressed blobs. Identical files are deduplicated across snapshots.

Commands:
```bash
python training/persistent_vault.py --vault /data/lovebound-vault snapshot --source outputs/gguf --category gguf
python training/persistent_vault.py --vault /data/lovebound-vault list
python training/persistent_vault.py --vault /data/lovebound-vault verify --snapshot SNAPSHOT_SHA256
python training/persistent_vault.py --vault /data/lovebound-vault export --snapshot SNAPSHOT_SHA256 --output /data/exports/my-model.zip
python training/persistent_vault.py --vault /data/lovebound-vault restore --snapshot SNAPSHOT_SHA256 --output /data/restore/model-copy
python training/persistent_vault.py --vault /data/lovebound-vault import --archive /data/exports/my-model.zip
```

To back up snapshots remotely (explicit authorization only), set `HF_TOKEN`
as a private Space Secret with dataset repository write access, then:
```bash
python training/persistent_vault.py --vault /data/lovebound-vault hf-upload --snapshot SNAPSHOT_SHA256 --repo-id USER/PRIVATE_VAULT --private --approve
python training/persistent_vault.py --vault /data/lovebound-vault hf-download --snapshot SNAPSHOT_SHA256 --repo-id USER/PRIVATE_VAULT --approve
```

For **real persistence**, use an HF Space persistent volume mounted at `/data`
(where available) or an authorized private Hub dataset repository. Free Spaces
without persistent storage may erase local files on restart. No service can
guarantee storage forever: keep redundant independent backups, monitor quotas,
and periodically test restores. Keep private prompts, datasets and tokens
out of public repositories. Model Hub uploads from the existing GGUF pipeline
remain separate from private dataset vault backups.

Never automatically overwrite an existing restored path, archive or source.
