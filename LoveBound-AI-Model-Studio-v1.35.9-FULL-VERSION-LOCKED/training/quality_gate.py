#!/usr/bin/env python3
"""Evidence-based quality gates; never equate a plan with a successful training/upload."""
import argparse, hashlib, json, pathlib, re, subprocess, sys, time

def load_jsonl(path):
    with open(path,encoding='utf-8') as f:
        for n,line in enumerate(f,1):
            if line.strip():
                try: yield n,json.loads(line)
                except json.JSONDecodeError as exc: raise ValueError(f'Invalid JSONL line {n}: {exc}')

def evaluate_translation(path):
    total=passed=0; issues=[]
    for n,row in load_jsonl(path):
        total+=1; lang=row.get('source_lang',''); source=row.get('source',''); en=row.get('english',''); ko=row.get('korean','')
        if not source or not ko or (lang not in ('ko-KR','en-US') and not en):
            issues.append({'line':n,'reason':'Missing required approved translation stage'})
        else: passed+=1
    return {'name':'translation_pairs','status':'PASS' if total and passed==total else 'FAIL','count':total,'valid':passed,'issues':issues,'scope':'structural only; human translation accuracy not assessed'}

def evaluate_prompt(path, prompt_file, minimum=0.95):
    prompt=pathlib.Path(prompt_file).read_text(encoding='utf-8')
    if not prompt.strip():raise ValueError('Empty prompt')
    count=matched=0;issues=[]
    for n,row in load_jsonl(path):
        count+=1; text=row.get('text','')
        ok=text.startswith('[SYSTEM]\n'+prompt+'\n[/SYSTEM]') and '[ASSISTANT ko-KR]' in text
        if ok:matched+=1
        else:issues.append({'line':n,'reason':'Prompt or Korean assistant target missing'})
    ratio=matched/count if count else 0
    return {'name':'training_prompt_coverage','status':'PASS' if count and ratio>=minimum else 'FAIL','samples':count,'ratio':ratio,'minimum':minimum,'issues':issues,'scope':'training data coverage only, not runtime instruction compliance'}

def evaluate_behavior(path, minimum=0.95):
    count=passed=0;issues=[]
    for n,row in load_jsonl(path):
        count+=1
        # Explicit externally reviewed benchmark labels, never a naive text-match guarantee.
        if row.get('human_reviewed') is True and row.get('passed') is True:passed+=1
        else:issues.append({'line':n,'reason':'Human-reviewed pass absent or false'})
    ratio=passed/count if count else 0
    return {'name':'human_reviewed_behavior','status':'PASS' if count and ratio>=minimum else 'FAIL','samples':count,'ratio':ratio,'minimum':minimum,'issues':issues,'scope':'finite benchmark only; not a universal guarantee'}

def evaluate_gguf(path):
    f=pathlib.Path(path)
    if not f.is_file():return {'name':'gguf_artifact','status':'FAIL','reason':'GGUF not found'}
    with f.open('rb') as inp:header=inp.read(8)
    ok=len(header)==8 and header[:4]==b'GGUF' and int.from_bytes(header[4:8],'little') in (2,3)
    return {'name':'gguf_artifact','status':'PASS' if ok else 'FAIL','bytes':f.stat().st_size,'reason':'header and version only; load/inference not validated'}

def evaluate_hub(repo_id, filename, token):
    if not token:return {'name':'hub_upload','status':'NOT_RUN','reason':'No HF_TOKEN supplied'}
    from huggingface_hub import HfApi
    api=HfApi(token=token)
    info=api.model_info(repo_id,files_metadata=True)
    found=next((s for s in info.siblings if s.rfilename==filename),None)
    return {'name':'hub_upload','status':'PASS' if found and getattr(found,'size',0) else 'FAIL','repo':repo_id,'filename':filename,'remote_bytes':getattr(found,'size',None),'scope':'Hub file presence and size, not downloaded byte-for-byte validation'}

def evaluate_inference(command, expected, timeout):
    # Executes only if explicitly enabled. No shell=True.
    import shlex
    argv=shlex.split(command)
    if not argv:raise ValueError('Empty inference command')
    result=subprocess.run(argv,capture_output=True,text=True,timeout=timeout,check=False)
    output=result.stdout[-10000:]
    return {'name':'inference_smoke_test','status':'PASS' if result.returncode==0 and expected in output else 'FAIL','exit_code':result.returncode,'expected_found':expected in output,'stdout_tail':output[-1000:],'stderr_tail':result.stderr[-1000:],'scope':'one smoke test only'}

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--translation-pairs')
    p.add_argument('--training-jsonl')
    p.add_argument('--system-prompt')
    p.add_argument('--behavior-results',help='JSONL human-reviewed records: passed:true, human_reviewed:true')
    p.add_argument('--gguf')
    p.add_argument('--repo-id');p.add_argument('--remote-filename')
    p.add_argument('--verify-hub',action='store_true')
    p.add_argument('--inference-command');p.add_argument('--expected-output',default='안녕하세요')
    p.add_argument('--run-inference',action='store_true')
    p.add_argument('--threshold',type=float,default=0.95)
    p.add_argument('--report',required=True)
    a=p.parse_args()
    if not 0<a.threshold<=1:raise ValueError('threshold must be (0,1]')
    report=pathlib.Path(a.report)
    if report.exists():raise FileExistsError('Refusing to overwrite quality report')
    checks=[]
    def attempt(name,fn):
        try:checks.append(fn())
        except Exception as exc:checks.append({'name':name,'status':'FAIL','reason':str(exc)})
    if a.translation_pairs:attempt('translation_pairs',lambda:evaluate_translation(a.translation_pairs))
    if a.training_jsonl:
        if a.system_prompt:attempt('training_prompt_coverage',lambda:evaluate_prompt(a.training_jsonl,a.system_prompt,a.threshold))
        else:checks.append({'name':'training_prompt_coverage','status':'NOT_RUN','reason':'system prompt not supplied'})
    if a.behavior_results:attempt('human_reviewed_behavior',lambda:evaluate_behavior(a.behavior_results,a.threshold))
    if a.gguf:attempt('gguf_artifact',lambda:evaluate_gguf(a.gguf))
    if a.verify_hub:
        if a.repo_id and a.remote_filename:
            import os
            attempt('hub_upload',lambda:evaluate_hub(a.repo_id,a.remote_filename,os.getenv('HF_TOKEN')))
        else:checks.append({'name':'hub_upload','status':'NOT_RUN','reason':'repo and filename required'})
    if a.run_inference:
        if a.inference_command:attempt('inference_smoke_test',lambda:evaluate_inference(a.inference_command,a.expected_output,120))
        else:checks.append({'name':'inference_smoke_test','status':'NOT_RUN','reason':'inference command required'})
    if not checks:raise ValueError('No tests selected')
    summary={'version':'1.35.9','checks':checks,'overall':'PASS' if all(x['status']=='PASS' for x in checks) else 'INCOMPLETE_OR_FAILED','guarantee':'Only selected measured checks. Cannot guarantee permanent prompt compliance, universal quality or upload success.'}
    report.parent.mkdir(parents=True,exist_ok=True)
    report.write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(summary,ensure_ascii=False,indent=2))
    return 0 if summary['overall']=='PASS' else 2
if __name__=='__main__':sys.exit(main())
