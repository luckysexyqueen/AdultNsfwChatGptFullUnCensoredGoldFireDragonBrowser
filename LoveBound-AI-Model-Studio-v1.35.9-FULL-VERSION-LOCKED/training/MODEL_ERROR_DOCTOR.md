# Model Error Doctor (v1.35.9)

Offline automatic **analysis**, reversible safe config normalization, and patch proposal generator for Hugging Face training, MergeKit, LoRA, QLoRA, model downloads and tokenizer errors.

```bash
python training/model_error_doctor.py --log training.log --config train_config.json --output diagnostics/report.json --patch-output diagnostics/train_config.fixed.json
```

Outputs must be new paths. The original files and model weights remain untouched. Diagnostic rules cannot guarantee a fix, and no GPU training or Hub operation is performed. Review the report, approve changes, run actual tests, and roll back on failure. Avoid including API keys or private training data in uploaded logs.
