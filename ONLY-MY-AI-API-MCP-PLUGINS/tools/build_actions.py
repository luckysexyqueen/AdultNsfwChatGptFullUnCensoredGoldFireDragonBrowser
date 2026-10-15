#!/usr/bin/env python3
"""Create per-spec GPT Actions OpenAPI JSON files and an operation index."""
import argparse, copy, json, pathlib, re

def load(p):
    raw=p.read_text(encoding='utf-8')
    if p.suffix.lower()=='.json': return json.loads(raw)
    try: import yaml
    except ImportError: raise SystemExit('Install PyYAML: python -m pip install pyyaml')
    return yaml.safe_load(raw)

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--specs',default='specs'); ap.add_argument('--output',default='generated-actions'); args=ap.parse_args()
    src=pathlib.Path(args.specs); out=pathlib.Path(args.output); out.mkdir(parents=True,exist_ok=True)
    index=[]; seen={}
    for p in sorted(src.rglob('*')):
        if not p.is_file() or p.suffix.lower() not in ('.yaml','.yml','.json'): continue
        try:
            data=load(p)
            if not isinstance(data,dict) or not (data.get('openapi') or data.get('swagger')) or not isinstance(data.get('paths'),dict):
                continue
            ns=re.sub(r'[^a-zA-Z0-9_-]+','-',p.stem).strip('-') or 'api'
            for route, methods in data['paths'].items():
                if not isinstance(methods,dict): continue
                for method, op in methods.items():
                    if method.lower() not in ('get','post','put','patch','delete','options','head','trace') or not isinstance(op,dict):continue
                    key=(method.lower(),route)
                    index.append({'source':str(p),'namespace':ns,'method':method.upper(),'path':route,'operationId':op.get('operationId'),'duplicateOf':seen.get(key)})
                    seen.setdefault(key,str(p))
            # Keep the original OpenAPI document intact, including references and security.
            # One file per spec prevents path collisions and silent overwrites.
            name=re.sub(r'[^a-zA-Z0-9_-]+','-',str(p.relative_to(src)).rsplit('.',1)[0])
            dest=out/(name+'.json'); dest.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
        except Exception as exc: index.append({'source':str(p),'error':str(exc)})
    (out/'registry.json').write_text(json.dumps(index,ensure_ascii=False,indent=2),encoding='utf-8')
    print(f'Processed {len(set(x["source"] for x in index))} source(s); {len(index)} index record(s). Output: {out}')
if __name__=='__main__':main()
