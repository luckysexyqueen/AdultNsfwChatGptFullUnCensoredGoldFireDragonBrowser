# User-defined default system prompt + model error auto-repair (v1.35.9)

The user owns `training/system_prompt.txt` (replace placeholder text). **Prompt behavior is not permanently added to model weights merely by saving a TXT.** Three supported workflows:

1. **Runtime system message:** inject the TXT as the system role for every inference request, with approved trusted backend.
2. **Training dataset preparation:** run `python training/system_prompt_manager.py --prompt training/system_prompt.txt` to view SHA256, then `python training/system_prompt_manager.py --prompt training/system_prompt.txt --dataset training/datasets/example.jsonl --output outputs/prompt-dataset.jsonl --approve-sha256 HASH`. This creates a new JSONL, which can be used with the existing approved LoRA/full fine-tuning script. A model's chat template may require adjusting the delimiter format; the training script treats examples as plain text. Fine-tuning does not guarantee the model will follow instructions.
3. **Model metadata:** optionally bundle the TXT with a model's adapter/model card as a reproducible inference preset, without changing model weights.

The prompt is user-provided, versioned by SHA256, and must not be silently overwritten. `training/auto_repair.py --log training.log --config config.json --out-dir diagnostics/run-001 --approve-config-fix` generates a read-only diagnostic report plus a patched **copy** for safe numeric-string normalization. It never executes training, installs dependencies, mutates model weights, or performs endless retries. Model architecture mismatch, missing weights, auth and GPU OOM require environment-specific decisions.

On a public Hugging Face Space, avoid exposing confidential prompts and model archives. For persistent user-edited prompts use approved private storage or a persistent volume, not the public repository or ephemeral Space filesystem.
