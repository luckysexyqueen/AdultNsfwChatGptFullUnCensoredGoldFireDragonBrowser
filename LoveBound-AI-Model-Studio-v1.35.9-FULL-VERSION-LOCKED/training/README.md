# LoveBound AI Model Studio v1.35.9 — Hugging Face Training Extension

**Space UI is read-only/planning-only by default.** To train, use a separately provisioned GPU environment and explicitly run commands from a trusted terminal. Dependencies are **not installed automatically**. No background execution from public UI.

## Setup
```bash
python -m pip install -r training/requirements-training.txt
```

## LoRA
```bash
LOVBOUND_ALLOW_TRAINING=YES python training/run_training.py --kind lora --model your-compatible-hf-model --dataset training/datasets/example.jsonl --output outputs/lora1 --execute
```
Remove `--execute` to inspect the command only. `--kind qlora` requires supported CUDA GPU and bitsandbytes; `--kind full` requires substantial memory. GGUF Q4 files are **not** directly supported as Transformers fine-tuning inputs; use compatible base checkpoint weights. MergeKit models must be architecture-compatible; GPT-2 and Llama families cannot be SLERP-merged.

## MergeKit
```bash
LOVBOUND_ALLOW_TRAINING=YES python training/run_training.py --kind mergekit --config training/mergekit/example-config.yaml --output outputs/merged1 --execute
```
Replace placeholder model IDs in YAML. Output folders must be new. The wrapper refuses overwriting existing output. Confirm model licenses and disk quota. CPU Space does not provide practical large-model training; use GPU hardware or external jobs. No training or inference has been run in this package.

## Preservation
Original 24 ZIP assets remain byte-identical to the prior FULL REBUILT archive. Plugin version remains **1.35.9**. Use a private Space if these source archives must not be public.

See `SYSTEM_PROMPT_AND_REPAIR.md` for custom system prompt and bounded model error repair.
