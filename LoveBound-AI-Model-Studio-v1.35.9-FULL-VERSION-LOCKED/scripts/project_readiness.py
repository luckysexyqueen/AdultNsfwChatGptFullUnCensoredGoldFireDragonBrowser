#!/usr/bin/env python3
"""Read-only inventory and diagnostic checklist. No imports of user project code."""
import argparse,json,pathlib,hashlib,zipfile
def inspect(path):
    p=pathlib.Path(path)
    if not p.is_file(): raise ValueError("Input must be a file")
    result={"name":p.name,"size":p.stat().st_size,"sha256":hashlib.sha256(p.read_bytes()).hexdigest()}
    with p.open("rb") as f: header=f.read(16)
    if header.startswith(b"GGUF"): result["kind"]="gguf";result["header_version"]=int.from_bytes(header[4:8],"little")
    elif header.startswith(b"PK\x03\x04"): result["kind"]="zip"
    elif p.suffix.lower()==".safetensors":
        result["kind"]="safetensors_candidate";result["note"]="Requires valid header, config, tokenizer and inference test"
    elif p.suffix.lower() in (".pt",".pth"): result["kind"]="pytorch_candidate";result["note"]="Never unpickle untrusted weights"
    else: result["kind"]="unclassified"
    if result["kind"]=="zip":
        with zipfile.ZipFile(p) as z:
            names=z.namelist()
            result["entries"]=len(names)
            result["unsafe_paths"]=sum(1 for n in names if n.startswith("/") or ".." in pathlib.PurePosixPath(n).parts or "\\\\" in n)
            result["website_hints"]=sorted({x for x in ["package.json","index.html","vite.config.ts","vite.config.js","capacitor.config.ts","config.xml","requirements.txt","pyproject.toml"] if any(n==x or n.endswith("/"+x) for n in names)})
    return result
def main():
    p=argparse.ArgumentParser()
    p.add_argument("--input",required=True);p.add_argument("--output",required=True)
    a=p.parse_args()
    result={"file":inspect(a.input),"actual_inference_test":False,"actual_api_test":False,"build_test":False,
            "next_checks":["preserve original","review config and logs","check actual runtime and endpoint","approve changes","test on target platform"]}
    out=pathlib.Path(a.output)
    if out.exists(): raise SystemExit("Refusing to overwrite existing report")
    out.parent.mkdir(parents=True,exist_ok=True)
    out.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding="utf-8")
if __name__=="__main__": main()
