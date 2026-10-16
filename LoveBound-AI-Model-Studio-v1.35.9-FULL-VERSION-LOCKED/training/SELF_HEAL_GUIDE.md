# v1.35.9 Self-Heal — model and studio recovery

`training/self_heal.py` detects missing **allowlisted** dependencies and invalid
numeric training settings. It creates a separate `.auto-fixed.json` config and
verifies the resulting settings. It can install missing allowlisted Python packages
only with explicit approval and network permission. Package resolution may fail,
change the environment or require CUDA-specific installation.

```bash
# Safe preview, no changes or network
python training/self_heal.py --workspace . --config training/train_config.json --modules transformers peft accelerate

# Create patched config copy (never overwrite original)
python training/self_heal.py --workspace . --config training/train_config.json --modules transformers --apply --approve

# Optional explicit dependency installation (network, mutable environment)
python training/self_heal.py --workspace . --modules transformers peft accelerate --apply --approve --install --allow-network
```

**Limits:** no self-modifying Python code, no arbitrary shell commands, no
silent model-weight rewriting, no auto-install of unapproved software, no
unattended Hugging Face upload, no secret harvesting. GGUF conversions, LoRA
training and Hub uploads still require their own explicit execution and
credentials. The script does not assert success until checks pass, and does
not promise success in all GPU/hardware/network environments. For damaged
model weights, use a trusted source and explicit checksum comparison rather
than attempting to manufacture weights.

Spaces with ephemeral storage can lose installed packages on restart; put
reviewed dependencies into requirements files and rebuild the Space.
