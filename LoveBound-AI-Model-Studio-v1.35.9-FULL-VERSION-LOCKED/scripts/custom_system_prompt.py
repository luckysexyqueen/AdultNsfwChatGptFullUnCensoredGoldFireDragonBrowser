#!/usr/bin/env python3
"""Load a user-authored UTF-8 system prompt before a fine-tuning job."""
import argparse, hashlib, json
from pathlib import Path

def load_prompt(path, max_bytes=1024*1024):
    p=Path(path).expanduser().resolve(strict=True)
    if not p.is_file() or p.suffix.lower() != '.txt':
        raise ValueError('Provide an existing .txt file')
    if p.stat().st_size > max_bytes:
        raise ValueError('Prompt file too large')
    content=p.read_text(encoding='utf-8-sig')
    if not content.strip():
        raise ValueError('System prompt is empty')
    return content

def build_manifest(path):
    content=load_prompt(path)
    return {'source':str(Path(path).resolve()),'encoding':'UTF-8',
            'sha256':hashlib.sha256(content.encode('utf-8')).hexdigest(),
            'characters':len(content),'loaded':True,
            'note':'This is a prompt input manifest; not proof of model fine-tuning.'}

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--prompt',default='custom/system_prompts/my_system_prompt.txt')
    p.add_argument('--manifest',default=None)
    a=p.parse_args()
    result=build_manifest(a.prompt)
    data=json.dumps(result,ensure_ascii=False,indent=2)
    if a.manifest:
        Path(a.manifest).write_text(data+'\n',encoding='utf-8')
    print(data)
if __name__=='__main__': main()
