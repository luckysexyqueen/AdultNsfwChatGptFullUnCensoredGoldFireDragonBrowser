# LoveBound v1.35.9 — User Requirements Memory & Verification

This **file-backed, project-local** memory stores user-approved requirements
between runs and restarts if the workspace is persisted. It is not ChatGPT
account memory and does not change model weights by itself.

- `training/user_requirements.json`: initial explicit project requirements.
- `python training/requirements_memory.py verify`: run objective checks.
- `python training/requirements_memory.py list`: show active memory.
- To add a new requirement, use `add --id ... --requirement ... --approve`
  and optional `--checks-json '[...]'`; the script creates a uniquely
  named snapshot without overwriting existing requirements.
- Review the snapshot and manually promote it to active memory.
- Checks supported: file_exists, file_sha256, json_equals.
- For every new build, run the verifier before publishing. A PASS only
  proves the specified checks, **not** model quality, training success,
  permanent prompt obedience, or successful Hub uploads.
- Model training still requires user approval, compatible hardware, and
  empirical evaluation. Automated self-healing is bounded to allowlisted
  packages and safe configuration changes; it cannot guarantee all tasks.
- Do not store API keys, private datasets, or sensitive prompts in a public
  Space. Use persistent private storage for memory on ephemeral Spaces.
