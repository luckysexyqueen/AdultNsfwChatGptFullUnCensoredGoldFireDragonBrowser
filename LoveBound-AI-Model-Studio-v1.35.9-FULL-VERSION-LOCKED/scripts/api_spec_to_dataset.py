#!/usr/bin/env python3
"""Convert a user-supplied OpenAPI YAML/JSON spec into offline JSONL study examples.
Does NOT create/train model weights, execute endpoints, or download anything.
Requires locally installed PyYAML for YAML input: pip install pyyaml (manual only).
"""
import argparse, json, pathlib, re, hashlib
METHODS = {'get','post','put','patch','delete','head','options','trace'}

def load_spec(path):
    data = pathlib.Path(path).read_text(encoding='utf-8')
    if pathlib.Path(path).suffix.lower() == '.json':
        spec = json.loads(data)
    else:
        try:
            import yaml
        except ImportError as exc:
            raise SystemExit('YAML parsing requires PyYAML installed by the user (pip install pyyaml).') from exc
        spec = yaml.safe_load(data)
    if not isinstance(spec, dict) or not isinstance(spec.get('paths'),dict):
        raise ValueError('Expected OpenAPI object with paths map')
    if not (str(spec.get('openapi','')).startswith('3.') or spec.get('swagger') == '2.0'):
        raise ValueError('Expected OpenAPI 3.x or Swagger 2.0 specification')
    return spec

def examples(spec):
    title=str(spec.get('info',{}).get('title','API')) if isinstance(spec.get('info'),dict) else 'API'
    for path, operations in spec['paths'].items():
        if not isinstance(path,str) or not isinstance(operations,dict): continue
        for method,operation in operations.items():
            if method.lower() not in METHODS or not isinstance(operation,dict): continue
            summary=operation.get('summary') or operation.get('description') or ''
            desc=str(summary).strip()
            parameters=operation.get('parameters',[])
            if not isinstance(parameters,list): parameters=[]
            names=[str(p.get('name')) for p in parameters if isinstance(p,dict) and 'name' in p]
            answer=f'{method.upper()} {path} — {desc or "설명이 제공되지 않았습니다."}'
            if names: answer+='\nParameters: '+', '.join(names)
            yield {'messages':[{'role':'user','content':f'{title} API에서 {method.upper()} {path} 기능을 설명해줘.'},{'role':'assistant','content':answer}], 'metadata':{'method':method.upper(),'path':path,'source':'openapi_spec','requires_review':True}}

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--spec',required=True,help='User-supplied local OpenAPI YAML/JSON file')
    p.add_argument('--output',required=True,help='New output JSONL; existing files never overwritten')
    a=p.parse_args()
    src=pathlib.Path(a.spec).resolve()
    dst=pathlib.Path(a.output).resolve()
    if src==dst or dst.exists(): raise SystemExit('Output must be a new path different from input')
    spec=load_spec(src)
    rows=list(examples(spec))
    if not rows: raise SystemExit('No operations found; nothing written')
    dst.parent.mkdir(parents=True,exist_ok=True)
    with dst.open('x',encoding='utf-8') as f:
        for row in rows: f.write(json.dumps(row,ensure_ascii=False)+'\n')
    print(json.dumps({'status':'review_required','examples':len(rows),'output':str(dst),'source_sha256':hashlib.sha256(src.read_bytes()).hexdigest()},ensure_ascii=False))

if __name__=='__main__': main()
