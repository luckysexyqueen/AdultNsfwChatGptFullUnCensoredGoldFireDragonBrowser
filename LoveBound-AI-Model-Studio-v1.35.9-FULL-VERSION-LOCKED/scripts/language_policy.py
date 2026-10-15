#!/usr/bin/env python3
"""Language policy: ko-KR primary, en-US secondary, all other languages translate.
Requires caller-provided language detector and translator for reliable multilingual support.
No model selection, downloads, network calls or auto-installs.
"""
import argparse
import importlib
import json
import re
import sys
from pathlib import Path

POLICY = {"primary": "ko-KR", "secondary": "en-US",
          "allowed": ["ko-KR", "en-US"], "foreign_target": "ko-KR",
          "fallback_target": "en-US"}

def normalize_language(code):
    code = str(code or "").strip().replace("_", "-").lower()
    if code == "ko" or code.startswith("ko-"):
        return "ko-KR"
    if code == "en" or code.startswith("en-"):
        return "en-US"
    return code or "und"

def fallback_detect(text):
    # Conservative heuristic, not a reliable multilingual detector.
    if re.search(r"[가-힣ㄱ-ㅎㅏ-ㅣ]", text):
        return "ko-KR", "heuristic"
    if text and all(ord(c) < 128 for c in text) and re.search(r"[A-Za-z]", text):
        return "en-US", "heuristic"
    return "und", "unknown"

def resolve_callable(spec):
    module_name, separator, attr = spec.partition(":")
    if not separator or not module_name or not attr:
        raise ValueError("Adapter must be MODULE:FUNCTION")
    obj = importlib.import_module(module_name)
    fn = getattr(obj, attr)
    if not callable(fn):
        raise TypeError("Adapter is not callable")
    return fn

def process(text, detector=None, translator=None, target="ko-KR"):
    if target not in POLICY["allowed"]:
        raise ValueError("Target must be ko-KR or en-US")
    if detector:
        detected = detector(text)
        source = normalize_language(detected)
        method = "adapter"
    else:
        source, method = fallback_detect(text)
    result = {"source_language": source, "target_language": target,
              "detection_method": method, "translated": False, "text": None,
              "status": None}
    if source in POLICY["allowed"]:
        result.update(text=text, status="allowed_language")
    elif not translator:
        result["status"] = "translation_required_no_adapter"
    else:
        output = translator(text, source, target)
        if not isinstance(output, str) or not output.strip():
            raise ValueError("Translator returned empty/non-text output")
        result.update(text=output, translated=True, status="translated_unverified")
    return result

def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--text")
    ap.add_argument("--input-file")
    ap.add_argument("--output-file")
    ap.add_argument("--target", choices=POLICY["allowed"], default="ko-KR")
    ap.add_argument("--detector", help="Trusted local MODULE:FUNCTION accepting text")
    ap.add_argument("--translator", help="Trusted local MODULE:FUNCTION accepting (text,source,target)")
    args = ap.parse_args()
    if (args.text is None) == (args.input_file is None):
        ap.error("Provide exactly one of --text or --input-file")
    text = args.text if args.text is not None else Path(args.input_file).read_text(encoding="utf-8")
    result = process(text,
                     resolve_callable(args.detector) if args.detector else None,
                     resolve_callable(args.translator) if args.translator else None,
                     args.target)
    output = json.dumps(result, ensure_ascii=False, indent=2)
    if args.output_file:
        Path(args.output_file).write_text(output + "\\n", encoding="utf-8")
    print(output)
    if result["text"] is None:
        sys.exit(2)

if __name__ == "__main__":
    main()
