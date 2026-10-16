#!/usr/bin/env python3
"""User-owned system prompt; approved SFT data builder and runtime message adapter.
Never edits original model weights or source dataset. Does not execute code.
"""
import argparse,hashlib,json,pathlib,sys
DEFAULT=pathlib.Path(__file__).resolve().parent/'system_prompt.txt'
def digest(s):return hashlib.sha256(s.encode('utf-8')).hexdigest()
def read_prompt(p):
    path=pathlib.Path(p)
    if not path.is_file():raise FileNotFoundError(path)
    if path.stat().st_size>65536:raise ValueError('Prompt exceeds 64 KiB')
    s=path.read_text(encoding='utf-8-sig').strip()
    if not s:raise ValueError('Empty system prompt: user must provide their own')
    return s
def inject_text(prompt,text):return '<|system|>\n'+prompt+'\n<|user|>\n'+text+'\n<|assistant|>\n'
def main():
    a=argparse.ArgumentParser();a.add_argument('--prompt',default=str(DEFAULT));a.add_argument('--dataset');a.add_argument('--output');a.add_argument('--approve-sha256');a.add_argument('--runtime-message');a.add_argument('--report');args=a.parse_args()
    p=read_prompt(args.prompt);h=digest(p)
    if args.dataset or args.output:
        if not(args.dataset and args.output):a.error('--dataset and --output required together')
        if args.approve_sha256!=h:a.error('explicit --approve-sha256 matching prompt hash is required for training data generation')
        inp=pathlib.Path(args.dataset).resolve();dst=pathlib.Path(args.output).resolve()
        if inp==dst or dst.exists():a.error('output must be new and not overwrite dataset')
        if not inp.is_file():a.error('dataset not found')
        count=0
        dst.parent.mkdir(parents=True,exist_ok=True)
        try:
            with inp.open(encoding='utf-8') as fi,dst.open('x',encoding='utf-8') as fo:
                for line in fi:
                    if not line.strip():continue
                    record=json.loads(line)
                    if not isinstance(record,dict) or not isinstance(record.get('text'),str):raise ValueError('Each JSONL record requires a text string')
                    record=dict(record);record['text']=inject_text(p,record['text']);fo.write(json.dumps(record,ensure_ascii=False)+'\n');count+=1
        except Exception:
            dst.unlink(missing_ok=True);raise
        print(json.dumps({'status':'dataset_prepared','examples':count,'prompt_sha256':h,'output':str(dst),'note':'This creates training text only; no model weights updated.'},ensure_ascii=False))
    elif args.runtime_message is not None:
        print(json.dumps([{'role':'system','content':p},{'role':'user','content':args.runtime_message}],ensure_ascii=False,indent=2))
    else:print(json.dumps({'status':'prompt_valid','prompt_sha256':h,'chars':len(p),'requires_approval_for_training':True},ensure_ascii=False))
if __name__=='__main__':main()
