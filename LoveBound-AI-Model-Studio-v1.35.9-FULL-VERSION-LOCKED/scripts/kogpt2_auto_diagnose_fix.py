#!/usr/bin/env python3
"""Offline, conservative tokenizer analyzer / opt-in fixer. Python standard library only."""
import argparse
import importlib.metadata
import json
import shutil
from pathlib import Path

SAMPLES = ["안녕하세요. 한국어 GPT-2 미세조정 테스트입니다.", "가나다라마바사", "한글 한글", "공백  두 칸\n줄바꿈", "Hello! 😀 123"]

def contains_bytelevel(node):
    if isinstance(node, dict):
        return node.get('type') == 'ByteLevel' or any(contains_bytelevel(v) for v in node.values())
    if isinstance(node, list):
        return any(contains_bytelevel(v) for v in node)
    return False

def analyze(folder):
    folder=Path(folder).expanduser().resolve()
    if not folder.is_dir(): raise FileNotFoundError(folder)
    path=folder/'tokenizer.json'
    if not path.is_file(): raise FileNotFoundError(f'Missing {path}')
    data=json.loads(path.read_text(encoding='utf-8'))
    if not isinstance(data,dict): raise ValueError('tokenizer.json must be an object')
    model=data.get('model') or {}
    issues=[]; actions=[]
    if data.get('decoder') is None:
        issues.append('top-level decoder missing')
        if contains_bytelevel(data.get('pre_tokenizer')):
            actions.append('set missing top-level decoder to ByteLevel')
        else:
            issues.append('pre_tokenizer is not clearly ByteLevel; no automatic decoder change')
    special={}
    for name in ('bos_token','eos_token','unk_token','pad_token','mask_token'):
        cfg=folder/'tokenizer_config.json'
        if cfg.is_file():
            config=json.loads(cfg.read_text(encoding='utf-8'))
            special[name]=config.get(name)
    versions={}
    for name in ('transformers','tokenizers','torch'):
        try: versions[name]=importlib.metadata.version(name)
        except importlib.metadata.PackageNotFoundError: versions[name]=None
    return {'source':str(folder),'model_type':model.get('type'),'normalizer':data.get('normalizer'),
            'pre_tokenizer':data.get('pre_tokenizer'),'decoder':data.get('decoder'),
            'special_tokens':special,'versions':versions,'issues':issues,'proposed_actions':actions}

def roundtrip(folder):
    try:
        from transformers import PreTrainedTokenizerFast
        tok=PreTrainedTokenizerFast.from_pretrained(str(folder),local_files_only=True)
        results=[]
        for sample in SAMPLES:
            got=tok.decode(tok.encode(sample,add_special_tokens=False),skip_special_tokens=False,clean_up_tokenization_spaces=False)
            results.append({'input':sample,'decoded':got,'exact_match':sample==got})
        return {'available':True,'cases':results,'all_exact':all(x['exact_match'] for x in results)}
    except (ImportError, OSError, ValueError, RuntimeError) as exc:
        return {'available':False,'reason':str(exc)}

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--model-path',required=True,help='Existing local tokenizer folder; no downloads')
    ap.add_argument('--output-dir',help='New folder for opt-in patched copy')
    ap.add_argument('--report',help='Optional JSON report output path')
    ap.add_argument('--apply',action='store_true',help='Apply safe proposed fix to a new folder')
    ap.add_argument('--test',action='store_true',help='Try local encode/decode checks (requires transformers)')
    args=ap.parse_args()
    source=Path(args.model_path).expanduser().resolve()
    result=analyze(source)
    if args.test: result['before_roundtrip']=roundtrip(source)
    if args.apply:
        if not args.output_dir: ap.error('--apply requires --output-dir')
        target=Path(args.output_dir).expanduser().resolve()
        if target==source or source in target.parents or target in source.parents:
            ap.error('Output must be separate and outside source tree')
        if target.exists(): ap.error('Output already exists; refusing overwrite')
        if not result['proposed_actions']:
            result['status']='no safe automatic fix; source unchanged'
        else:
            shutil.copytree(source,target)
            try:
                p=target/'tokenizer.json'; data=json.loads(p.read_text(encoding='utf-8'))
                data['decoder']={'type':'ByteLevel','add_prefix_space':True,'trim_offsets':True,'use_regex':True}
                p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
                if args.test:
                    result['after_roundtrip']=roundtrip(target)
                    before=result.get('before_roundtrip',{})
                    after=result['after_roundtrip']
                    if before.get('available') and after.get('available') and sum(x['exact_match'] for x in after['cases']) < sum(x['exact_match'] for x in before['cases']):
                        shutil.rmtree(target)
                        result['status']='rolled back: roundtrip regressions detected'
                    else: result['status']='patched copy created; review results before using'
                else: result['status']='patched copy created; runtime behavior unverified'
            except Exception:
                shutil.rmtree(target,ignore_errors=True)
                raise
    else: result['status']='analysis only; no files modified'
    if args.report:
        rp=Path(args.report).expanduser().resolve(); rp.parent.mkdir(parents=True,exist_ok=True)
        rp.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(result,ensure_ascii=False,indent=2))
if __name__=='__main__': main()
