# Korean-first Full Fine-tuning, LoRA and QLoRA — v1.35.9

The same **approved Korean-first JSONL** dataset is supported in all three modes:
`--kind full`, `--kind lora`, and `--kind qlora`.
The training launcher now passes `--korean-policy`, `--system-prompt`, and
`--approved-sha256` to the actual training script in each mode. The trainer
validates every sample includes the exact approved system prompt and a
`[ASSISTANT ko-KR]` target **before loading the model**.

Workflow:
1. Write your prompt to `training/system_prompt.txt` and calculate SHA256.
2. Prepare reviewed translations with `training/prepare_korean_sft.py`.
   Other languages -> approved en-US -> ko-KR; en-US -> ko-KR.
3. Review `outputs/korean_sft.jsonl` and ensure model license and architecture.
4. Plan a run:

```bash
python training/run_training.py --kind lora \
 --model YOUR_COMPATIBLE_HF_MODEL --dataset outputs/korean_sft.jsonl \
 --output outputs/korean_lora --korean-policy \
 --system-prompt training/system_prompt.txt --approved-sha256 YOUR_SHA256
```

Change `lora` to `full` or `qlora`. To actually run, append `--execute`
and set `LOVBOUND_ALLOW_TRAINING=YES` in the execution environment.
GPU hardware and compatible Transformers/PyTorch dependencies are needed.
Full fine-tuning generally requires much more VRAM than LoRA.
GGUF quantized files are not direct training inputs to this workflow.
The prompt's inclusion in SFT data is not guaranteed to make it permanent
or perfectly followed; inject it at inference as well.

This integration does not call translators, install dependencies, or train
until explicitly executed.
