#!/usr/bin/env python3
"""Create local user-controlled model workspace and import files safely; no downloads or conversion."""
import argparse,json,re,shutil,hashlib
from pathlib import Path
CATEGORIES=('downloads','ingredients','workspace','completed','selected')
FORMATS=('gguf','pytorch','safetensors')
STAGES=('incoming','staging','converted','verified')
def safe_name(s):
    s=s.strip()
    if not s or s in ('.','..') or not re.fullmatch(r'[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}',s):
        raise ValueError('Model name must use 1-128 ASCII letters/numbers/_/./- without path separators')
    return s

def initialize(root):
    root=Path(root).expanduser().resolve()
    for category in CATEGORIES:
        for fmt in FORMATS:
            for stage in STAGES:
                (root/'models'/category/('.'+fmt)/stage).mkdir(parents=True,exist_ok=True)
    for folder in ('custom/mergekit_configs','custom/system_prompts','custom/api_specs','logs','reports','datasets','exports'):
        (root/folder).mkdir(parents=True,exist_ok=True)
    return root

def destination(root,category,fmt,stage,name):
    if category not in CATEGORIES or fmt not in FORMATS or stage not in STAGES: raise ValueError('Invalid category/format/stage')
    return root/'models'/category/('.'+fmt)/stage/safe_name(name)

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--root',required=True)
    p.add_argument('--create-model',help='Create a named model folder without model weights')
    p.add_argument('--import-file',help='Copy an existing local model file into a model folder')
    p.add_argument('--category',choices=CATEGORIES,default='ingredients')
    p.add_argument('--format',choices=FORMATS,default='gguf')
    p.add_argument('--stage',choices=STAGES,default='incoming')
    p.add_argument('--model-name')
    a=p.parse_args()
    root=initialize(a.root)
    name=a.model_name or a.create_model
    if a.import_file and not name: p.error('--import-file requires --model-name')
    if name:
        dest=destination(root,a.category,a.format,a.stage,name)
        dest.mkdir(parents=True,exist_ok=True)
        if a.import_file:
            source=Path(a.import_file).expanduser().resolve(strict=True)
            if not source.is_file() or source.is_symlink(): p.error('Source must be a regular file')
            target=dest/source.name
            if target.exists(): p.error('Destination already exists; refusing overwrite')
            if source.suffix.lower() not in ('.gguf','.bin','.pt','.pth','.ckpt','.safetensors','.json','.model','.txt'):
                p.error('Unsupported file extension; review and copy manually')
            with source.open('rb') as src,target.open('xb') as dst: shutil.copyfileobj(src,dst)
            print(json.dumps({'copied_to':str(target),'sha256':hashlib.sha256(target.read_bytes()).hexdigest()},ensure_ascii=False))
        else: print(json.dumps({'model_folder':str(dest)},ensure_ascii=False))
    else: print(json.dumps({'workspace':str(root),'categories':CATEGORIES,'formats':FORMATS,'stages':STAGES},ensure_ascii=False))
if __name__=='__main__':main()
