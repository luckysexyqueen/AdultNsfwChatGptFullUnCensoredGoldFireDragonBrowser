#!/usr/bin/env python3
"""GGUF conversion, quantization and HF Hub upload: explicit, auditable stages.
Requires an installed llama.cpp checkout/binaries and an authorized HF account.
No install/download/upload by default. Source weights are never overwritten.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time

QUANTS = ("Q8_0","Q6_K","Q5_K_M","Q4_K_M","Q3_K_M","Q2_K")
def sha256(path):
    h=hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda:f.read(8*1024*1024),b""): h.update(block)
    return h.hexdigest()

def check_source(path):
    if not path.is_dir(): raise ValueError("Source must be a Transformers model directory (not GGUF)")
    if not (path/"config.json").is_file(): raise ValueError("Missing model config.json")
    if not any(path.glob("*.safetensors")) and not any(path.glob("pytorch_model*.bin")):
        raise ValueError("No supported Transformers weight files; check sharded model files and LFS pointers")
    for f in list(path.glob("*.safetensors"))+list(path.glob("pytorch_model*.bin")):
        if f.stat().st_size < 256 and f.read_bytes()[:80].startswith(b"version https://git-lfs"):
            raise ValueError(f"Git LFS pointer instead of weights: {f.name}")

def checked_run(argv, *, execute, log):
    record={"argv":[str(x) for x in argv],"executed":bool(execute)}
    if execute:
        result=subprocess.run([str(x) for x in argv],capture_output=True,text=True,check=False)
        record["returncode"]=result.returncode
        record["stdout_tail"]=result.stdout[-3000:]
        record["stderr_tail"]=result.stderr[-5000:]
        log.append(record)
        if result.returncode: raise RuntimeError(f"Command failed (exit {result.returncode}): {result.stderr[-1000:]}")
    else: log.append(record)

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--model-dir",required=True,help="Compatible unquantized Transformers model directory")
    p.add_argument("--output-dir",required=True)
    p.add_argument("--llama-cpp-dir",required=True,help="Installed llama.cpp source directory")
    p.add_argument("--model-name",default="LoveBound-model")
    p.add_argument("--outtype",choices=("f16","f32","bf16"),default="f16")
    p.add_argument("--quant",choices=QUANTS,default="Q4_K_M")
    p.add_argument("--adapter",help="Optional trained LoRA adapter directory to merge with base using PEFT")
    p.add_argument("--repo-id",help="HF username/model-repository, optional")
    p.add_argument("--private",action="store_true",help="Create private repo if absent")
    p.add_argument("--execute",action="store_true",help="Actually run local conversion and quantization")
    p.add_argument("--upload",action="store_true",help="Upload resulting GGUF after --execute, requires --repo-id and HF_TOKEN")
    p.add_argument("--allow-remote-code",action="store_true",help="Explicit opt-in; not recommended for untrusted repos")
    a=p.parse_args()
    source=Path(a.model_dir).resolve()
    out=Path(a.output_dir).resolve()
    llama=Path(a.llama_cpp_dir).resolve()
    if source==out or source in out.parents or out in source.parents:
        raise ValueError("Source and output must be separate, non-nested directories")
    check_source(source)
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,95}",a.model_name):
        raise ValueError("Invalid model name")
    if a.upload and not a.execute: raise ValueError("--upload requires --execute")
    if a.upload and not a.repo_id: raise ValueError("--upload requires --repo-id")
    if a.repo_id and not re.fullmatch(r"[\w.-]+/[\w.-]+",a.repo_id):
        raise ValueError("Repo must be namespace/name")
    convert=llama/"convert_hf_to_gguf.py"
    quant=llama/"build/bin/llama-quantize"
    if os.name=="nt":quant=quant.with_suffix(".exe")
    if not convert.is_file():raise FileNotFoundError(f"llama.cpp conversion script missing: {convert}")
    if not quant.is_file():raise FileNotFoundError(f"llama.cpp quantizer missing: {quant}")
    if a.adapter:
        adapter=Path(a.adapter).resolve()
        if not (adapter/"adapter_config.json").is_file():raise ValueError("Adapter must contain adapter_config.json")
        if not a.execute: print("PLAN: PEFT adapter merge to separate working directory before conversion")
        # Explicit merge uses a separate script and directory; no overwriting original.
    out.mkdir(parents=True,exist_ok=True)
    if a.adapter:
        merged=out/"merged-transformers"
        if merged.exists():raise FileExistsError("Refusing to overwrite existing merged output")
        merge_script=Path(__file__).with_name("merge_lora_for_gguf.py")
        commands=[[sys.executable,str(merge_script),"--base",str(source),"--adapter",str(adapter),"--output",str(merged)]]
        convert_source=merged
    else:
        commands=[]
        convert_source=source
    f16=out/f"{a.model_name}.{a.outtype}.gguf"
    final=out/f"{a.model_name}.{a.quant}.gguf"
    if f16.exists() or final.exists():raise FileExistsError("Refusing to overwrite existing GGUF")
    commands.append([sys.executable,str(convert),str(convert_source),"--outfile",str(f16),"--outtype",a.outtype])
    commands.append([str(quant),str(f16),str(final),a.quant])
    log=[]
    try:
        for cmd in commands:checked_run(cmd,execute=a.execute,log=log)
        if a.execute:
            if not final.is_file() or final.stat().st_size<8:raise RuntimeError("Output GGUF missing or empty")
            if final.open("rb").read(4)!=b"GGUF":raise RuntimeError("Output does not have GGUF header")
        manifest={"version":"1.35.9","model_name":a.model_name,"quant":a.quant,"mode":"executed" if a.execute else "plan_only","source":str(source),"output":str(final),"steps":log}
        if a.execute:
            manifest["gguf_size"]=final.stat().st_size
            manifest["gguf_sha256"]=sha256(final)
        if a.upload:
            from huggingface_hub import HfApi
            token=os.environ.get("HF_TOKEN")
            if not token:raise ValueError("Set HF_TOKEN in Space secrets / environment, never in source")
            api=HfApi(token=token)
            api.create_repo(repo_id=a.repo_id,repo_type="model",private=a.private,exist_ok=True)
            api.upload_file(path_or_fileobj=str(final),path_in_repo=final.name,repo_id=a.repo_id,repo_type="model",commit_message="Upload approved GGUF "+a.quant)
            manifest["uploaded_repo"]=a.repo_id
            manifest["uploaded_filename"]=final.name
        report=out/"gguf_build_report.json"
        if report.exists():raise FileExistsError("Refusing to overwrite existing report")
        report.write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding="utf-8")
        print(json.dumps(manifest,ensure_ascii=False,indent=2))
    except Exception:
        print(json.dumps({"status":"failed","completed_steps":log},ensure_ascii=False,indent=2),file=sys.stderr)
        raise
if __name__=="__main__":main()
