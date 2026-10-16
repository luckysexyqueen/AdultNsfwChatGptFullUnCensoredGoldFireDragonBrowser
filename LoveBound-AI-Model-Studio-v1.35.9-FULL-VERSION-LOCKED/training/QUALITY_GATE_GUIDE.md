# Model Quality Gates and Auto Repair — v1.35.9

**No universal success guarantee is possible.** This patch adds evidence-based gates, clear NOT_RUN/FAIL states, and safe re-evaluation. It does not forge benchmarks or silently modify weights.

## Gate examples

```bash
python training/quality_gate.py --translation-pairs training/datasets/translation_pairs.example.jsonl --report outputs/translation-quality.json
python training/quality_gate.py --training-jsonl outputs/korean_sft.jsonl --system-prompt training/system_prompt.txt --report outputs/prompt-coverage.json
python training/quality_gate.py --gguf outputs/gguf-export/model.Q4_K_M.gguf --report outputs/gguf-quality.json
python training/quality_gate.py --behavior-results reviewed_evaluation.jsonl --threshold 0.95 --report outputs/behavior-quality.json
HF_TOKEN=... python training/quality_gate.py --verify-hub --repo-id YOU/MODEL --remote-filename model.Q4_K_M.gguf --report outputs/hub-quality.json
```

A PASS on a structural gate is **not** a guarantee of linguistic accuracy or model compliance. For behavioral evaluation, use separate human-reviewed prompts, including unseen Korean, en-US, and other-language examples. Inference must be separately executed against the converted GGUF. Real training, model conversion, and Hub upload need compatible GPU/CPU environments, account credentials, licensing, disk and network access.

Existing `training/model_error_doctor.py` can diagnose errors and produce a separate patched config; rerun the quality gate after a repair. Unsafe architecture/weight modifications are not automatic. No automatic network upload without explicit user approval.
