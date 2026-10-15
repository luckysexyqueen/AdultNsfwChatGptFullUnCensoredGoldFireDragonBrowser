# Custom API specs
Put your own OpenAPI 3.x or Swagger 2.0 `spec.yaml` / `spec.yml` / `spec.json` here. The sample `spec.yaml` is deliberately empty; replace it with your actual spec.

Conversion: `python scripts/api_spec_to_dataset.py --spec custom/api_specs/spec.yaml --output ./api_examples.jsonl`

YAML requires locally installed PyYAML. Review output before fine-tuning. This does not convert YAML directly into a trained AI model.
