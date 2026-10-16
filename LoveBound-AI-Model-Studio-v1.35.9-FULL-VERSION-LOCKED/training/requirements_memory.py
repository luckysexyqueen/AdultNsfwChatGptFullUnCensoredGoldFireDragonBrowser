#!/usr/bin/env python3
"""User-controlled requirements memory with auditable, bounded auto-verification.
No model weight editing, training, external upload, or self-modifying code.
"""
import argparse, hashlib, json, pathlib, re, sys, datetime
def digest(data):
    return hashlib.sha256(json.dumps(data,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()
def load(path):
    if not path.exists():return {"schema":1,"version":"1.35.9","requirements":[],"history":[]}
    data=json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data,dict) or not isinstance(data.get("requirements"),list):raise ValueError("Invalid memory")
    return data
def save_new(path,data):
    path.parent.mkdir(parents=True,exist_ok=True)
    with path.open("x",encoding="utf-8") as f:json.dump(data,f,ensure_ascii=False,indent=2)
def verify(req,root):
    checks=req.get("checks",[])
    if not checks:return {"status":"NOT_RUN","checks":[]}
    results=[]
    for check in checks:
        typ=check.get("type")
        rel=check.get("path","")
        target=(root/rel).resolve()
        if target!=root and root not in target.parents:
            results.append({"type":typ,"status":"FAIL","reason":"path outside workspace"});continue
        if typ=="file_exists":
            ok=target.is_file()
        elif typ=="file_sha256":
            ok=target.is_file() and hashlib.sha256(target.read_bytes()).hexdigest()==check.get("sha256")
        elif typ=="json_equals":
            try:
                value=json.loads(target.read_text(encoding="utf-8"))
                for key in check.get("key_path",[]):
                    if not isinstance(value,dict):raise KeyError(key)
                    value=value[key]
                ok=value==check.get("expected")
            except (OSError,ValueError,KeyError,TypeError):ok=False
        else:
            results.append({"type":typ,"status":"NOT_RUN","reason":"unsupported check"});continue
        results.append({"type":typ,"path":rel,"status":"PASS" if ok else "FAIL"})
    statuses=[r["status"] for r in results]
    status="FAIL" if "FAIL" in statuses else ("NOT_RUN" if "NOT_RUN" in statuses else "PASS")
    return {"status":status,"checks":results}
def main():
    p=argparse.ArgumentParser()
    p.add_argument("--workspace",default=".")
    p.add_argument("--memory",default="training/user_requirements.json")
    sub=p.add_subparsers(dest="command",required=True)
    add=sub.add_parser("add")
    add.add_argument("--id",required=True)
    add.add_argument("--requirement",required=True)
    add.add_argument("--checks-json",default="[]")
    add.add_argument("--approve",action="store_true")
    sub.add_parser("list")
    sub.add_parser("verify")
    a=p.parse_args()
    root=pathlib.Path(a.workspace).resolve()
    if not root.is_dir():raise FileNotFoundError(root)
    memory=(root/a.memory).resolve()
    if root not in memory.parents or memory.suffix!=".json":raise ValueError("Memory must be a JSON file inside workspace")
    if memory.is_symlink():raise ValueError("Refusing symlink memory")
    data=load(memory)
    if a.command=="add":
        if not a.approve:raise ValueError("Explicit --approve required to store a user requirement")
        if not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9_-]{1,63}",a.id):raise ValueError("Invalid requirement ID")
        if not a.requirement.strip():raise ValueError("Empty requirement")
        checks=json.loads(a.checks_json)
        if not isinstance(checks,list):raise ValueError("Checks must be list")
        if any(x["id"]==a.id for x in data["requirements"]):raise ValueError("Duplicate ID")
        req={"id":a.id,"text":a.requirement,"checks":checks,"approved":True}
        data["requirements"].append(req)
        # Append-only snapshot: no silent overwrite, preserve history.
        snapshot=memory.with_name(memory.stem+"."+digest(data)[:12]+".json")
        save_new(snapshot,data)
        print(json.dumps({"status":"STORED_SNAPSHOT","path":str(snapshot),"requirement":req},ensure_ascii=False,indent=2))
        print("To make this the active memory, review snapshot then explicitly copy it to --memory path.",file=sys.stderr)
    elif a.command=="list":
        print(json.dumps(data,ensure_ascii=False,indent=2))
    else:
        checks=[{"id":r.get("id"),"text":r.get("text"),**verify(r,root)} for r in data["requirements"]]
        overall="FAIL" if any(c["status"]=="FAIL" for c in checks) else ("NOT_RUN" if not checks or any(c["status"]=="NOT_RUN" for c in checks) else "PASS")
        print(json.dumps({"version":"1.35.9","status":overall,"requirements":checks},ensure_ascii=False,indent=2))
        if overall=="FAIL":sys.exit(2)
if __name__=="__main__":main()
