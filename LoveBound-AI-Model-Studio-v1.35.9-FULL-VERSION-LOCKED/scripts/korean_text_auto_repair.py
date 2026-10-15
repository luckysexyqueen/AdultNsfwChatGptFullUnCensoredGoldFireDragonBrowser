#!/usr/bin/env python3
"""Offline Korean tokenizer auto-repair. Scans explicit roots; never downloads models."""
import argparse, json, shutil, sys
from pathlib import Path

SAMPLES = ["안녕하세요. 한국어 GPT-2 테스트입니다.", "가나다라마바사", "한글 한글", "공백  두 칸\\n줄바꿈", "Hello! 😀 123"]

def has_bytelevel(node):
    if isinstance(node, dict):
        return node.get("type") == "ByteLevel" or any(has_bytelevel(v) for v in node.values())
    if isinstance(node, list):
        return any(has_bytelevel(v) for v in node)
    return False

def test_roundtrip(folder):
    from transformers import PreTrainedTokenizerFast
    tokenizer = PreTrainedTokenizerFast.from_pretrained(str(folder), local_files_only=True)
    results = []
    for sample in SAMPLES:
        actual = tokenizer.decode(tokenizer.encode(sample, add_special_tokens=False),
                                  skip_special_tokens=False, clean_up_tokenization_spaces=False)
        results.append({"input": sample, "decoded": actual, "exact": actual == sample})
    return results

def fix_one(source, output_root, apply):
    source = source.resolve()
    tokpath = source / "tokenizer.json"
    result = {"source": str(source), "status": "unchanged", "reason": None}
    if not tokpath.is_file():
        result["reason"] = "tokenizer.json missing"
        return result
    try:
        data = json.loads(tokpath.read_text(encoding="utf-8"))
        if not isinstance(data, dict) or not isinstance(data.get("model"), dict):
            raise ValueError("invalid tokenizer structure")
    except (OSError, UnicodeError, ValueError) as e:
        result["reason"] = str(e)
        return result
    if data.get("decoder") is not None:
        result["reason"] = "decoder already present; no safe automatic replacement"
        return result
    if not has_bytelevel(data.get("pre_tokenizer")):
        result["reason"] = "ByteLevel pre-tokenizer not confirmed"
        return result
    try:
        before = test_roundtrip(source)
    except Exception as e:
        result["reason"] = "cannot verify baseline locally: " + str(e)
        return result
    if all(x["exact"] for x in before):
        result["reason"] = "all Korean round-trips already pass"
        return result
    if not apply:
        result["status"] = "eligible"
        result["reason"] = "missing ByteLevel decoder and failing round-trip"
        return result
    output_root = output_root.resolve()
    if source == output_root or source in output_root.parents or output_root in source.parents:
        result["reason"] = "output must be outside source tree"
        return result
    dest = output_root / (source.name + "-korean-fixed")
    if dest.exists():
        result["reason"] = "output already exists"
        return result
    try:
        shutil.copytree(source, dest, symlinks=True)
        patched = dest / "tokenizer.json"
        data["decoder"] = {"type": "ByteLevel", "add_prefix_space": True, "trim_offsets": True, "use_regex": True}
        patched.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\\n", encoding="utf-8")
        after = test_roundtrip(dest)
        old_score = sum(x["exact"] for x in before)
        new_score = sum(x["exact"] for x in after)
        if new_score <= old_score or any(b["exact"] and not a["exact"] for b, a in zip(before, after)):
            shutil.rmtree(dest)
            result["status"] = "rolled_back"
            result["reason"] = "no verified improvement or regression"
        else:
            result["status"] = "fixed_copy"
            result["output"] = str(dest)
            result["before_pass"] = old_score
            result["after_pass"] = new_score
    except Exception as e:
        if dest.exists():
            shutil.rmtree(dest)
        result["status"] = "error"
        result["reason"] = str(e)
    return result

def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--scan-root", required=True, help="Explicit local model directory")
    ap.add_argument("--output-root", help="Directory for repaired copies")
    ap.add_argument("--apply", action="store_true", help="Apply only verified improvements")
    ap.add_argument("--max-depth", type=int, default=3)
    ap.add_argument("--report")
    args = ap.parse_args()
    if args.apply and not args.output_root:
        ap.error("--apply requires --output-root")
    if not 0 <= args.max_depth <= 10:
        ap.error("--max-depth must be 0..10")
    root = Path(args.scan_root).expanduser().resolve()
    if not root.is_dir():
        ap.error("scan root does not exist")
    candidates = []
    for folder in [root, *root.rglob("*")]:
        if folder.is_dir() and not folder.is_symlink():
            try:
                depth = len(folder.relative_to(root).parts)
            except ValueError:
                continue
            if depth <= args.max_depth and (folder / "tokenizer.json").is_file():
                candidates.append(folder)
    results = [fix_one(folder, Path(args.output_root).expanduser() if args.output_root else root.parent, args.apply) for folder in candidates]
    report = {"scanned_root": str(root), "apply": args.apply, "candidates": len(candidates), "results": results}
    output = json.dumps(report, ensure_ascii=False, indent=2)
    if args.report:
        path = Path(args.report).expanduser().resolve()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(output + "\\n", encoding="utf-8")
    print(output)

if __name__ == "__main__":
    main()
