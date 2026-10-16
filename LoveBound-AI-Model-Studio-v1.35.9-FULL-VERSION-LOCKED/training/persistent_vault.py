#!/usr/bin/env python3
"""Content-addressed, versioned local vault. Explicit HF repo backup/restore.
Files, folders and logical collections stay separated. No silent upload/deletion.
"""
import argparse, hashlib, json, os, pathlib, re, shutil, sys, tempfile, zipfile
from datetime import datetime,timezone
def sha_file(path):
    h=hashlib.sha256()
    with path.open("rb") as f:
        for part in iter(lambda:f.read(1024*1024),b""):h.update(part)
    return h.hexdigest()
def rootpath(path):return pathlib.Path(path).expanduser().resolve()
def safe_relative(name):
    p=pathlib.PurePosixPath(name)
    if p.is_absolute() or not name or any(x in ("..",".") for x in p.parts) or "\\" in name:
        raise ValueError("Unsafe path: "+name)
    return p
def init(vault):
    for name in ("blobs/sha256","snapshots","exports","reports"): (vault/name).mkdir(parents=True,exist_ok=True)
def read_manifest(vault,snapshot):
    if not re.fullmatch(r"[a-f0-9]{64}",snapshot):raise ValueError("Snapshot must be SHA256")
    p=vault/"snapshots"/(snapshot+".json")
    obj=json.loads(p.read_text(encoding="utf-8"))
    if obj["snapshot_id"]!=snapshot:raise ValueError("Snapshot id mismatch")
    check=dict(obj);check.pop("snapshot_id")
    digest=hashlib.sha256(json.dumps(check,ensure_ascii=False,sort_keys=True,separators=(",",":")).encode()).hexdigest()
    if digest!=snapshot:raise ValueError("Manifest tampered")
    return obj
def blobpath(vault,digest):return vault/"blobs/sha256"/digest[:2]/digest
def store_blob(vault,source,digest):
    target=blobpath(vault,digest)
    target.parent.mkdir(parents=True,exist_ok=True)
    if target.exists():
        if sha_file(target)!=digest:raise ValueError("Stored blob hash mismatch")
        return
    fd,temp=tempfile.mkstemp(dir=str(target.parent),prefix=".incoming-")
    try:
        with os.fdopen(fd,"wb") as dst,source.open("rb") as inp:
            shutil.copyfileobj(inp,dst,1024*1024)
        if sha_file(pathlib.Path(temp))!=digest:raise ValueError("Blob copy mismatch")
        os.replace(temp,target)
    finally:
        if os.path.exists(temp):os.unlink(temp)
def snapshot(vault,source,category):
    source=rootpath(source)
    if not source.exists():raise FileNotFoundError(source)
    if source==vault or source in vault.parents or vault in source.parents:
        raise ValueError("Vault and source must not be nested")
    if not re.fullmatch(r"[a-z][a-z0-9_-]{1,40}",category):raise ValueError("Invalid category")
    if source.is_symlink():raise ValueError("Refusing symlink source")
    if source.is_dir() and any(x.is_symlink() for x in source.rglob("*")):
        raise ValueError("Refusing symlinks inside source")
    items=[source] if source.is_file() else sorted(x for x in source.rglob("*") if x.is_file())
    records=[]
    for path in items:
        if path.is_symlink():raise ValueError("Refusing symlink source")
        rel=path.name if source.is_file() else path.relative_to(source).as_posix()
        safe_relative(rel)
        digest=sha_file(path)
        store_blob(vault,path,digest)
        records.append({"path":rel,"sha256":digest,"bytes":path.stat().st_size})
    if not records:raise ValueError("No files to snapshot")
    obj={"schema":1,"version":"1.35.9","category":category,"files":records}
    digest=hashlib.sha256(json.dumps(obj,ensure_ascii=False,sort_keys=True,separators=(",",":")).encode()).hexdigest()
    obj["snapshot_id"]=digest
    path=vault/"snapshots"/(digest+".json")
    if not path.exists():path.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    return obj
def verify(vault,manifest):
    issues=[]
    for item in manifest["files"]:
        safe_relative(item["path"])
        p=blobpath(vault,item["sha256"])
        if not p.is_file() or p.stat().st_size!=item["bytes"] or sha_file(p)!=item["sha256"]:
            issues.append(item["path"])
    return {"status":"PASS" if not issues else "FAIL","snapshot_id":manifest["snapshot_id"],"files":len(manifest["files"]),"issues":issues}
def export(vault,manifest,target):
    target=rootpath(target)
    if target.exists():raise FileExistsError(target)
    check=verify(vault,manifest)
    if check["status"]!="PASS":raise ValueError("Vault verification failed")
    target.parent.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(target,"x",zipfile.ZIP_DEFLATED,compresslevel=6,allowZip64=True) as z:
        z.writestr("manifest.json",json.dumps(manifest,ensure_ascii=False,indent=2))
        for item in manifest["files"]:
            z.write(blobpath(vault,item["sha256"]),"files/"+item["path"])
    return target
def restore(vault,manifest,target):
    target=rootpath(target)
    if target.exists():raise FileExistsError("Refusing overwrite: "+str(target))
    if verify(vault,manifest)["status"]!="PASS":raise ValueError("Vault verification failed")
    target.mkdir(parents=True)
    for item in manifest["files"]:
        p=target/safe_relative(item["path"])
        p.parent.mkdir(parents=True,exist_ok=True)
        shutil.copy2(blobpath(vault,item["sha256"]),p)
        if sha_file(p)!=item["sha256"]:raise ValueError("Restore checksum mismatch")
    return target
def import_zip(vault,path):
    path=rootpath(path)
    with zipfile.ZipFile(path) as z:
        manifest=json.loads(z.read("manifest.json"))
        sid=manifest.get("snapshot_id","")
        check=dict(manifest);check.pop("snapshot_id",None)
        if hashlib.sha256(json.dumps(check,ensure_ascii=False,sort_keys=True,separators=(",",":")).encode()).hexdigest()!=sid:
            raise ValueError("Imported manifest invalid")
        for item in manifest["files"]:
            rel=safe_relative(item["path"])
            name="files/"+rel.as_posix()
            info=z.getinfo(name)
            if info.file_size!=item["bytes"]:raise ValueError("Archive size mismatch")
            if info.file_size>20*1024**3:raise ValueError("Individual file too large")
            dst=blobpath(vault,item["sha256"])
            dst.parent.mkdir(parents=True,exist_ok=True)
            if not dst.exists():
                fd,temp=tempfile.mkstemp(dir=str(dst.parent),prefix=".import-")
                try:
                    with os.fdopen(fd,"wb") as out,z.open(info) as inp:shutil.copyfileobj(inp,out,1024*1024)
                    if sha_file(pathlib.Path(temp))!=item["sha256"]:raise ValueError("Archive hash mismatch")
                    os.replace(temp,dst)
                finally:
                    if os.path.exists(temp):os.unlink(temp)
            elif sha_file(dst)!=item["sha256"]:raise ValueError("Existing blob damaged")
        dest=vault/"snapshots"/(sid+".json")
        if not dest.exists():dest.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
        return manifest
def main():
    p=argparse.ArgumentParser()
    p.add_argument("--vault",default="persistent_vault")
    sub=p.add_subparsers(dest="command",required=True)
    s=sub.add_parser("snapshot");s.add_argument("--source",required=True);s.add_argument("--category",required=True)
    sub.add_parser("list")
    for command in ("verify","export","restore","hf-upload"):
        s=sub.add_parser(command);s.add_argument("--snapshot",required=True)
        if command in ("export","restore"):s.add_argument("--output",required=True)
        if command=="hf-upload":
            s.add_argument("--repo-id",required=True);s.add_argument("--private",action="store_true");s.add_argument("--approve",action="store_true")
    s=sub.add_parser("import");s.add_argument("--archive",required=True)
    s=sub.add_parser("hf-download");s.add_argument("--repo-id",required=True);s.add_argument("--snapshot",required=True);s.add_argument("--approve",action="store_true")
    a=p.parse_args()
    vault=rootpath(a.vault);init(vault)
    if a.command=="snapshot":result=snapshot(vault,a.source,a.category)
    elif a.command=="list":
        result={"snapshots":[{"snapshot_id":x.stem,"category":json.loads(x.read_text(encoding="utf-8")).get("category")} for x in sorted((vault/"snapshots").glob("*.json"))]}
    elif a.command=="import":result=import_zip(vault,a.archive)
    elif a.command=="hf-download":
        if not a.approve:raise ValueError("HF download requires --approve")
        from huggingface_hub import hf_hub_download
        if not os.environ.get("HF_TOKEN"):raise ValueError("HF_TOKEN required")
        if not re.fullmatch(r"[\w.-]+/[\w.-]+",a.repo_id):raise ValueError("Invalid repo ID")
        sid=a.snapshot
        if not re.fullmatch(r"[a-f0-9]{64}",sid):raise ValueError("Invalid snapshot")
        local=hf_hub_download(repo_id=a.repo_id,repo_type="dataset",filename=f"vault/{sid}.zip",token=os.environ["HF_TOKEN"])
        result=import_zip(vault,local)
    else:
        manifest=read_manifest(vault,a.snapshot)
        if a.command=="verify":result=verify(vault,manifest)
        elif a.command=="export":result={"export":str(export(vault,manifest,a.output))}
        elif a.command=="restore":result={"restored":str(restore(vault,manifest,a.output))}
        else:
            if not a.approve:raise ValueError("HF upload requires --approve")
            if not os.environ.get("HF_TOKEN"):raise ValueError("HF_TOKEN required")
            if not re.fullmatch(r"[\w.-]+/[\w.-]+",a.repo_id):raise ValueError("Invalid repo ID")
            from huggingface_hub import HfApi
            with tempfile.TemporaryDirectory() as td:
                path=export(vault,manifest,pathlib.Path(td)/(a.snapshot+".zip"))
                api=HfApi(token=os.environ["HF_TOKEN"])
                api.create_repo(repo_id=a.repo_id,repo_type="dataset",private=a.private,exist_ok=True)
                api.upload_file(path_or_fileobj=str(path),path_in_repo=f"vault/{a.snapshot}.zip",repo_id=a.repo_id,repo_type="dataset")
                result={"uploaded":f"https://huggingface.co/datasets/{a.repo_id}/blob/main/vault/{a.snapshot}.zip"}
    print(json.dumps(result,ensure_ascii=False,indent=2))
if __name__=="__main__":main()
