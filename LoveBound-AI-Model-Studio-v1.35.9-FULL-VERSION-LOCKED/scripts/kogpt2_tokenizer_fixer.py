"""KoGPT2 tokenizer inspection and optional ByteLevel decoder repair.

No model is downloaded automatically. Supply an existing local tokenizer directory.
The decoder belongs at tokenizer.json's top level, not inside its `model` object.
This repair is conditional and cannot guarantee a fix for every Korean text issue.
"""
import argparse
import json
from pathlib import Path
from transformers import PreTrainedTokenizerFast


def get_fixed_kogpt2_tokenizer(model_path, output_dir, *, repair_missing_decoder=True):
    source = Path(model_path).expanduser().resolve()
    destination = Path(output_dir).expanduser().resolve()
    if not source.is_dir() or not (source / "tokenizer.json").is_file():
        raise FileNotFoundError("Specify a local tokenizer folder containing tokenizer.json")
    if source == destination:
        raise ValueError("Output directory must differ from source directory")
    tokenizer = PreTrainedTokenizerFast.from_pretrained(
        str(source), local_files_only=True
    )
    destination.mkdir(parents=True, exist_ok=True)
    tokenizer.save_pretrained(str(destination))
    json_path = destination / "tokenizer.json"
    data = json.loads(json_path.read_text(encoding="utf-8"))
    if repair_missing_decoder and data.get("decoder") is None:
        pretokenizer = data.get("pre_tokenizer")
        # Only apply ByteLevel when the tokenizer configuration indicates ByteLevel.
        def has_bytelevel(obj):
            if isinstance(obj, dict):
                return obj.get("type") == "ByteLevel" or any(has_bytelevel(v) for v in obj.values())
            if isinstance(obj, list):
                return any(has_bytelevel(v) for v in obj)
            return False
        if not has_bytelevel(pretokenizer):
            raise ValueError("No ByteLevel pre-tokenizer detected; refusing an unsafe decoder guess")
        data["decoder"] = {"type": "ByteLevel", "add_prefix_space": True, "trim_offsets": True, "use_regex": True}
        json_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return PreTrainedTokenizerFast.from_pretrained(str(destination), local_files_only=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-path", required=True, help="Existing local tokenizer directory")
    parser.add_argument("--output-dir", required=True, help="Where to save patched tokenizer")
    args = parser.parse_args()
    tok = get_fixed_kogpt2_tokenizer(args.model_path, args.output_dir)
    sample = "안녕하세요. 한국어 GPT-2 미세조정 테스트입니다."
    decoded = tok.decode(tok.encode(sample), skip_special_tokens=True)
    print("원문:", sample)
    print("디코딩:", decoded)
    print("일치 여부:", decoded == sample)
