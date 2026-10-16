#!/usr/bin/env python3
"""Bounded, allowlisted self-healing for Model Studio itself and model configs.
Default: dry-run. Never rewrites weights, secrets, source archives or own Python code.
Explicit flags required for environment installation or local config patching.
"""
import argparse, hashlib, importlib.util, json, os, pathlib, shutil, subprocess, sys, time
from datetime import datetime, timezone

ALLOWED_PACKAGES={
 "gradio":"gradio>=5,<7",
 "huggingface_hub":"huggingface_hub>=0.25,<2",
 "transformers":"transformers>=4.45,<5",
 "datasets":"datasets>=3,<5",
 "peft":"peft>=0.13,<1",
 "accelerate":"accelerate>=1,<2",
 "safetensors":"safetensors>=0.4,<1",
 "mergekit":"mergekit",
}
SAFE_FIELDS={"per_device_train_batch_size":1,"gradient_accumulation_steps":8,"max_seq_length":1024}
def sha(path):
    h=hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda:f.read(1024*1024),b""):h.update(block)
    return h.hexdigest()
def diagnose(config,modules):
    findings=[]
    for mod in modules:
        if mod not in ALLOWED_PACKAGES:
            findings.append({"kind":"unknown_dependency","target":mod,"fixable":False})
        elif importlib.util.find_spec(mod) is None:
            findings.append({"kind":"missing_dependency","target":mod,"fixable":True})
    if config:
        try:
            data=json.loads(config.read_text(encoding="utf-8"))
            if not isinstance(data,dict):raise ValueError("Config must be a JSON object")
            for key,val in SAFE_FIELDS.items():
                current=data.get(key)
                if current is not None and (not isinstance(current,int) or isinstance(current,bool) or current<=0):
                    findings.append({"kind":"invalid_setting","target":key,"fixable":True,"suggested":val})
        except (OSError,ValueError) as exc:
            findings.append({"kind":"invalid_config","target":str(config),"detail":str(exc),"fixable":False})
    return findings
def run(args):
    work=pathlib.Path(args.workspace).resolve()
    if not work.is_dir():raise FileNotFoundError(work)
    config=pathlib.Path(args.config).resolve() if args.config else None
    if config and (not config.is_file() or config.suffix.lower()!=".json"):raise ValueError("Existing JSON config required")
    if config and config.is_symlink():raise ValueError("Refusing symlink config")
    if args.apply and config and work not in config.parents:raise ValueError("Config must be inside workspace")
    if args.install and not args.apply:raise ValueError("--install requires --apply")
    if args.apply and not args.approve:raise ValueError("--apply requires --approve")
    if args.install and not args.allow_network:raise ValueError("--install requires --allow-network")
    if args.max_attempts<1 or args.max_attempts>3:raise ValueError("max-attempts must be 1..3")
    mods=list(dict.fromkeys(args.modules))
    before=diagnose(config,mods)
    report={"version":"1.35.9","mode":"apply" if args.apply else "dry_run",
            "findings_before":before,"actions":[],"verified":False}
    if args.apply:
        if config:
            changes=[x for x in before if x["kind"]=="invalid_setting"]
            if changes:
                original=config.read_bytes()
                data=json.loads(original)
                for x in changes:data[x["target"]]=x["suggested"]
                fixed=config.with_name(config.stem+".auto-fixed.json")
                if fixed.exists():raise FileExistsError("Refusing to overwrite "+str(fixed))
                fixed.write_text(json.dumps(data,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
                report["actions"].append({"action":"write_fixed_copy","file":str(fixed),
                                          "source_sha256":hashlib.sha256(original).hexdigest(),
                                          "new_sha256":sha(fixed)})
                # Use fixed copy for subsequent validation; never overwrite the original
                config=fixed
        if args.install:
            missing=[x["target"] for x in before if x["kind"]=="missing_dependency"]
            for mod in missing:
                spec=ALLOWED_PACKAGES[mod]
                last=None
                for attempt in range(1,args.max_attempts+1):
                    # No shell, no arbitrary user-supplied package names.
                    result=subprocess.run([sys.executable,"-m","pip","install",spec],
                                          capture_output=True,text=True,timeout=600,check=False)
                    last=result
                    if result.returncode==0:break
                report["actions"].append({"action":"pip_install","package":spec,"attempts":attempt,
                                          "success":last.returncode==0,"stderr_tail":last.stderr[-1200:]})
            importlib.invalidate_caches()
    after=diagnose(config,mods)
    report["findings_after"]=after
    report["verified"]=bool(args.apply and not after and
                            all(x.get("success",True) for x in report["actions"]))
    report["status"]="PASS" if report["verified"] else ("FAIL" if args.apply else "NOT_RUN")
    return report
def main():
    p=argparse.ArgumentParser()
    p.add_argument("--workspace",default=".")
    p.add_argument("--config",help="Existing training JSON config within workspace")
    p.add_argument("--modules",nargs="*",default=["gradio","huggingface_hub"])
    p.add_argument("--apply",action="store_true")
    p.add_argument("--approve",action="store_true",help="Explicit approval for bounded local changes")
    p.add_argument("--install",action="store_true",help="Install missing allowlisted Python packages")
    p.add_argument("--allow-network",action="store_true",help="Explicit permission to fetch packages from configured pip index")
    p.add_argument("--max-attempts",type=int,default=2)
    p.add_argument("--report",help="Write a new report JSON without overwriting")
    a=p.parse_args()
    report=run(a)
    payload=json.dumps(report,ensure_ascii=False,indent=2)
    if a.report:
        path=pathlib.Path(a.report)
        path.parent.mkdir(parents=True,exist_ok=True)
        with path.open("x",encoding="utf-8") as f:f.write(payload+"\n")
    print(payload)
    if a.apply and not report["verified"]:sys.exit(2)
if __name__=="__main__":main()
