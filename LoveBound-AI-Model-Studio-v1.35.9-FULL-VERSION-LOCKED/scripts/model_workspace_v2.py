#!/usr/bin/env python3
"""Initialize all workspace directories, then create/import model-named folders on demand. No downloads or conversion."""
import argparse, json, re, shutil
from pathlib import Path
CATEGORIES=('downloads','ingredients','workspace','mergekit_outputs','completed','selected')
FORMATS=('gguf','pytorch','safetensors')
STAGES=('incoming','staging','converted','verified')
EXTRA=('custom/mergekit_configs','custom/system_prompts','custom/api_specs','datasets','exports','logs','reports')
def safe_name(s):
    if not isinstance(s,str) or not re.fullmatch(r'[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}',s) or s in ('.','..'):
        raise ValueError('Invalid model name (ASCII letters, numbers, _, -, .; 1-128 chars)')
    return s
def initialize(root):
    root=Path(root).expanduser().resolve()
    for cat in CATEGORIES:
        for fmt in FORMATS:
            for stage in STAGES:
                (root/'models'/cat/('.'+fmt)/stage).mkdir(parents=True,exist_ok=True)
    for extra in EXTRA: (root/extra).mkdir(parents=True,exist_ok=True)
    return root
def model_folder(root,category,fmt,stage,name):
    if category not in CATEGORIES or fmt not in FORMATS or stage not in STAGES: raise ValueError('Invalid selection')
    return root/'models'/category/('.'+fmt)/stage/safe_name(name)
def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--root',required=True)
    p.add_argument('--create-model')
    p.add_argument('--model-name')
    p.add_argument('--import-file')
    p.add_argument('--category',choices=CATEGORIES,default='ingredients')
    p.add_argument('--format',choices=FORMATS,default='gguf')
    p.add_argument('--stage',choices=STAGES,default='incoming')
    a=p.parse_args()
    root=initialize(a.root)
    name=a.model_name or a.create_model
    if a.import_file and not name: p.error('--import-file requires --model-name')
    if name:
        folder=model_folder(root,a.category,a.format,a.stage,name)
        folder.mkdir(parents=True,exist_ok=True)
        if a.import_file:
            source=Path(a.import_file).expanduser()
            if source.is_symlink() or not source.is_file(): p.error('Source must be a regular non-symlink file')
            if source.suffix.lower() not in ('.gguf','.bin','.pt','.pth','.ckpt','.safetensors','.json','.model','.txt'):
                p.error('Unsupported file extension')
            dest=folder/source.name
            if dest.exists() or dest.is_symlink(): p.error('Destination exists')
            with source.open('rb') as inp, dest.open('xb') as dst: shutil.copyfileobj(inp,dst)
            print(json.dumps({'copied_to':str(dest)},ensure_ascii=False))
        else: print(json.dumps({'model_folder':str(folder)},ensure_ascii=False))
    else: print(json.dumps({'workspace':str(root),'categories':CATEGORIES,'formats':FORMATS,'stages':STAGES},ensure_ascii=False))
if __name__=='__main__':main()
