# LoveBound AI Model Studio 1.35.9 — GGUF export + quantization + HF Model Hub

The pipeline accepts a **compatible Transformers model directory** produced by
Full fine-tuning or a base model plus a PEFT LoRA adapter. For LoRA/QLoRA,
it merges the adapter into a new, separate Transformers directory before conversion.
Original weights are never changed. It uses llama.cpp's
`convert_hf_to_gguf.py` and `llama-quantize`, so only model architectures supported
by the installed llama.cpp revision can be converted.

## Requirements
- Compatible installed llama.cpp source and built `build/bin/llama-quantize`
- Python conversion dependencies matching your llama.cpp checkout
- Optional LoRA merge: compatible `torch`, `transformers`, `peft`, `accelerate`
- Hub upload: `pip install -r training/requirements-gguf.txt`
- A user-owned Hugging Face **model** repository, access token with write permission,
  and sufficient storage; check license and Space hardware/billing.
- Do not embed tokens in code or publish source model archives unintentionally.

## Preview without executing

```bash
python training/gguf_pipeline.py \
 --model-dir outputs/full_model \
 --llama-cpp-dir /workspace/llama.cpp \
 --output-dir outputs/gguf-export \
 --model-name my-korean-model --quant Q4_K_M
```

## Actually convert and quantize (explicit approval)

```bash
python training/gguf_pipeline.py \
 --model-dir outputs/full_model \
 --llama-cpp-dir /workspace/llama.cpp \
 --output-dir outputs/gguf-export \
 --model-name my-korean-model --quant Q4_K_M --execute
```

## LoRA/QLoRA adapter variant
Add `--adapter outputs/korean_lora` with `--model-dir` pointing to the
compatible unquantized base model. A separate merged checkpoint is created.

## Upload final GGUF to Hugging Face Model Hub

Configure `HF_TOKEN` as a **Space Secret** (not source code), then explicitly add:

```text
--repo-id YOUR_USERNAME/YOUR_MODEL --private --execute --upload
```

The script verifies the final file has a GGUF header and writes a SHA256 manifest.
Successful Hub upload depends on network, token permission, repo quotas, licensing,
and sufficient disk/RAM. The UI is a **command planner** and does not execute
expensive conversion or upload on button click.

## Lightweight quantization
Choose `--quant Q8_0`, `Q6_K`, `Q5_K_M`, `Q4_K_M` (default),
`Q3_K_M`, or `Q2_K`. Smaller quantization can reduce disk/RAM but degrade quality.
This is **not** a new GGUF architecture or guaranteed mobile compatibility.
Android/Windows target performance requires testing.
