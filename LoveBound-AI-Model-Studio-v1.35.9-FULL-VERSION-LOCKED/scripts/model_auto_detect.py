#!/usr/bin/env python3
"""Offline read-only auto-discovery of local tokenizer/model directories.
No downloads, no model selection, no code execution from discovered directories.
"""
import argparse
import json
from pathlib import Path

TOKENIZER_FILES = ('tokenizer.json', 'tokenizer_config.json', 'vocab.json', 'merges.txt', 'spiece.model', 'tokenizer.model')
MODEL_FILES = ('config.json', 'model.safetensors', 'pytorch_model.bin', 'model.safetensors.index.json', 'pytorch_model.bin.index.json')

def safe_json(path):
    try:
        if path.stat().st_size > 5_000_000:
            return {'_error':'JSON too large'}
        value = json.loads(path.read_text(encoding='utf-8'))
        return value if isinstance(value, dict) else {'_error':'not a JSON object'}
    except (OSError, ValueError, UnicodeError) as exc:
        return {'_error':str(exc)}

def inspect(folder):
    present = {n for n in TOKENIZER_FILES + MODEL_FILES if (folder/n).is_file()}
    if not present:
        return None
    cfg = safe_json(folder/'config.json') if 'config.json' in present else {}
    tok_cfg = safe_json(folder/'tokenizer_config.json') if 'tokenizer_config.json' in present else {}
    tok = safe_json(folder/'tokenizer.json') if 'tokenizer.json' in present else {}
    tokenizer_model = tok.get('model') if isinstance(tok.get('model'),dict) else {}
    flags = []
    if 'tokenizer.json' in present:
        if tok.get('decoder') is None:
            flags.append('missing_top_level_decoder_review_required')
        if '_error' in tok:
            flags.append('invalid_tokenizer_json')
    if 'config.json' in present and '_error' in cfg:
        flags.append('invalid_model_config')
    if 'tokenizer.json' not in present and any(x in present for x in ('vocab.json','merges.txt','spiece.model','tokenizer.model')):
        flags.append('legacy_or_slow_tokenizer_review_required')
    return {'path':str(folder),'files':sorted(present), 'model_type':cfg.get('model_type'),
            'tokenizer_class':tok_cfg.get('tokenizer_class'), 'tokenizer_model_type':tokenizer_model.get('type'),
            'decoder_type':tok.get('decoder',{}).get('type') if isinstance(tok.get('decoder'),dict) else None,
            'flags':flags,'auto_fix':'not_run','requires_user_model_selection':True}

def discover(roots,max_depth=3,max_dirs=5000):
    found=[]; visited=set(); examined=0; warnings=[]
    for raw in roots:
        root=Path(raw).expanduser().resolve()
        if not root.is_dir():
            warnings.append('not_a_directory: '+str(root)); continue
        stack=[(root,0)]
        while stack and examined < max_dirs:
            current,depth=stack.pop()
            if current in visited: continue
            visited.add(current); examined+=1
            item=inspect(current)
            if item: found.append(item)
            if depth>=max_depth: continue
            try:
                children=sorted((p for p in current.iterdir() if p.is_dir() and not p.is_symlink()),reverse=True)
                stack.extend((p,depth+1) for p in children)
            except OSError as exc: warnings.append(str(exc))
    if examined >= max_dirs: warnings.append('directory_scan_limit_reached')
    return {'scanned_directories':examined,'candidates':found,'warnings':warnings,
            'selected_model':None,'modifications':0}

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--scan-root',action='append',required=True,help='Explicit local folder; repeatable')
    p.add_argument('--max-depth',type=int,default=3)
    p.add_argument('--max-dirs',type=int,default=5000)
    p.add_argument('--report',help='Optional JSON report output')
    a=p.parse_args()
    if not 0<=a.max_depth<=20 or not 1<=a.max_dirs<=100000: p.error('scan limits out of range')
    result=discover(a.scan_root,a.max_depth,a.max_dirs)
    output=json.dumps(result,ensure_ascii=False,indent=2)
    if a.report:
        dest=Path(a.report).expanduser().resolve();dest.parent.mkdir(parents=True,exist_ok=True);dest.write_text(output+'\n',encoding='utf-8')
    print(output)
if __name__=='__main__': main()
