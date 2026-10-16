# LoveBound AI Model Studio v1.35.9 — Korean-first SFT policy

- Primary language: Korean (ko-KR). Secondary language: US English (en-US).
- For any other language: **approved source -> en-US -> ko-KR** pairs only.
- English inputs: approved **en-US -> ko-KR** pairs. Korean inputs stay Korean.
- This is a **training-data preparation rule**, not an actual automatic translation model.
- The tool refuses to invent translations; missing intermediate/target texts are held.
- User-written `training/system_prompt.txt` is embedded in each generated SFT sample
  only after the user explicitly approves its exact SHA256.
- Training may encourage behavior but does not guarantee that weights obey the prompt.
- Inference still needs explicit system prompt injection and a language-aware runtime.
- No cloud translator calls, model downloads, or training are executed by the preparer.
- Only use training data you are authorized to process; avoid copying private prompts
  or model archives into a public Hugging Face Space.

## Example

```bash
python -c "import hashlib,pathlib; print(hashlib.sha256(pathlib.Path('training/system_prompt.txt').read_bytes()).hexdigest())"
python training/prepare_korean_sft.py \
  --pairs training/datasets/translation_pairs.example.jsonl \
  --prompt training/system_prompt.txt \
  --approved-sha256 YOUR_APPROVED_SHA256 \
  --output outputs/korean_sft.jsonl
```

Then review the dataset and explicitly run `training/run_training.py` for LoRA/QLoRA/full.
