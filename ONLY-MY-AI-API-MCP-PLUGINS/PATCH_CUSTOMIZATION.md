# User-controlled source patches — v1.5.7

The full source is editable. `custom/` stores user-owned replacement files, `patches/` stores patch manifests, and `backups/` stores prior file bytes and checksums. Nothing runs automatically when installing the plugin ZIP.

## Workflow

1. Edit `custom/sample-note.txt`, or place your own replacement files in `custom/`.
2. Create a manifest in `patches/` with an ID and file mappings. `source` must be inside `custom/`; `target` is a project-relative path. The example creates `docs/user-note.txt`.
3. `npm run patch:preview -- --manifest patches/example.patch.json`
4. `npm run patch:apply -- --manifest patches/example.patch.json --confirm`
5. `npm run patch:rollback -- --id sample_readme_patch --confirm`

Only explicit file replacement is supported, not arbitrary unified diff merge or semantic code rewriting. No script execution from manifests. Rollback refuses to overwrite files changed after applying the patch. Use Git for 3-way merge, branches and review. Reusing an existing patch ID is blocked. Keep `backups/` private and avoid storing secrets. User patches can break builds; run project tests before deploying. The CLI prevents path traversal and symlinks and excludes sensitive directories, but is not a hardened sandbox for malicious local users. For multi-project use, copy this module into each project; an npm-published package is not yet available.

## GitHub hub status
GitHub repo creation, secrets, Pages enablement and Cloudflare permissions require an authorized account and are not performed by ZIP installation. Existing workflows remain templates until placed in a repository and configured. Do not publish private specs or credentials to Pages.
