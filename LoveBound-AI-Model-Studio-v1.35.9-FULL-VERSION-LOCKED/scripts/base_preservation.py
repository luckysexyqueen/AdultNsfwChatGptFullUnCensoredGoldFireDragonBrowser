#!/usr/bin/env python3
"""Create immutable-by-policy, hash-verified snapshots of user-supplied base files.
No model selection, downloads, deletion, or overwrite. Local standard library only.
"""
import argparse, hashlib, json, os, re, shutil, stat, tempfile
from datetime import datetime, timezone
from pathlib import Path

FORMATS = {'gguf':('.gguf',), 'pytorch':('.pt','.pth','.bin','.ckpt'), 'safetensors':('.safetensors',), 'other':()}

def digest(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
    return h.hexdigest()

def safe_name(name):
    if not re.fullmatch(r'[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}',name) or name in ('.','..'):
        raise ValueError('Unsafe model name')
    return name

def snapshot(source, root, name, fmt):
    source=Path(source).expanduser().absolute()
    root=Path(root).expanduser().resolve()
    safe_name(name)
    if source.is_symlink() or not source.is_file():raise ValueError('Input must be a regular non-symlink file')
    if fmt!='other' and source.suffix.lower() not in FORMATS[fmt]:raise ValueError('Format/extension mismatch')
    source_hash=digest(source)
    destdir=root/'models'/'base_originals'/('.'+fmt)/'verified'/name
    destdir.mkdir(parents=True,exist_ok=True)
    # A content hash in the filename keeps distinct versions without overwriting.
    dest=destdir/(source_hash[:16]+'__'+source.name)
    if dest.exists() or dest.is_symlink():
        if dest.is_symlink() or digest(dest)!=source_hash:raise ValueError('Existing snapshot conflict; no overwrite')
        status='already_preserved'
    else:
        try:
            with source.open('rb') as inp,dest.open('xb') as out:
                shutil.copyfileobj(inp,out)
            if digest(dest)!=source_hash:raise ValueError('Snapshot integrity mismatch')
            status='preserved'
        except Exception:
            # Keep any partial output for manual recovery; do not delete it.
            raise
    manifest=destdir/(source_hash[:16]+'__'+source.name+'.manifest.json')
    record={'status':status,'source':str(source),'snapshot':str(dest),'sha256':source_hash,'bytes':source.stat().st_size,'format':fmt,'model_name':name,'recorded_utc':datetime.now(timezone.utc).isoformat(),'functional_validation':'not_tested'}
    if not manifest.exists():
        with manifest.open('x',encoding='utf-8') as f:json.dump(record,f,ensure_ascii=False,indent=2)
    return record

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--file',required=True)
    p.add_argument('--root',required=True)
    p.add_argument('--model-name',required=True)
    p.add_argument('--format',choices=FORMATS,required=True)
    a=p.parse_args()
    print(json.dumps(snapshot(a.file,a.root,a.model_name,a.format),ensure_ascii=False,indent=2))
if __name__=='__main__':main()
