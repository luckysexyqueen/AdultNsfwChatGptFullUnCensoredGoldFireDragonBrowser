#!/usr/bin/env python3
"""User-controlled training launcher. Defaults to plan-only. Never runs from Gradio UI."""
import argparse, json, pathlib, shutil, subprocess, sys, os

def build(kind, model, dataset, output, adapter=None, config=None, qlora=False,
          korean_policy=False, system_prompt=None, approved_sha256=None):
    if kind == 'mergekit':
        if not config: raise ValueError('MergeKit requires --config YAML')
        cfg=pathlib.Path(config).resolve()
        if not cfg.is_file() or cfg.suffix.lower() not in ('.yml','.yaml'): raise ValueError('Invalid config YAML path')
        return ['mergekit-yaml',str(cfg),str(output),'--copy-tokenizer']
    if not model: raise ValueError('Training requires --model (HF model ID or local model directory)')
    if not dataset: raise ValueError('Training requires --dataset JSONL')
    path=pathlib.Path(dataset).resolve()
    if not path.is_file() or path.suffix.lower()!='.jsonl': raise ValueError('Training dataset must be a local JSONL file')
    cmd=[sys.executable,str(pathlib.Path(__file__).with_name('train_peft.py')),'--model',model,'--dataset',str(path),'--output',str(output)]
    if korean_policy:
        cmd+=['--korean-policy']
        if not system_prompt or not approved_sha256:
            raise ValueError('Korean policy requires --system-prompt and --approved-sha256')
        cmd+=['--system-prompt',str(pathlib.Path(system_prompt).resolve()),
              '--approved-sha256',approved_sha256]
    if kind=='full':cmd+=['--full-finetune']
    elif kind=='lora':pass
    elif kind=='qlora':cmd+=['--qlora']
    else:raise ValueError('Unsupported kind')
    return cmd

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--kind',required=True,choices=['mergekit','full','lora','qlora'])
    p.add_argument('--model');p.add_argument('--dataset');p.add_argument('--config');p.add_argument('--output',required=True)
    p.add_argument('--korean-policy',action='store_true',help='Validate Korean-first SFT and approved system prompt for full/LoRA/QLoRA')
    p.add_argument('--system-prompt',help='User-authored system prompt TXT')
    p.add_argument('--approved-sha256',help='Exact SHA256 approval of prompt TXT bytes')
    p.add_argument('--execute',action='store_true',help='Explicitly run locally after checking plan')
    a=p.parse_args(); output=pathlib.Path(a.output).resolve()
    if output.exists() and any(output.iterdir()) if output.is_dir() else output.exists():
        raise SystemExit('Refusing to overwrite existing output')
    cmd=build(a.kind,a.model,a.dataset,output,config=a.config,korean_policy=a.korean_policy,system_prompt=a.system_prompt,approved_sha256=a.approved_sha256)
    print(json.dumps({'kind':a.kind,'command':cmd,'mode':'execute' if a.execute else 'plan-only','output':str(output)},ensure_ascii=False,indent=2))
    if not a.execute:return
    if os.environ.get('LOVBOUND_ALLOW_TRAINING')!='YES':raise SystemExit('Set LOVBOUND_ALLOW_TRAINING=YES for explicit execution')
    subprocess.run(cmd,check=True)
if __name__=='__main__':main()
