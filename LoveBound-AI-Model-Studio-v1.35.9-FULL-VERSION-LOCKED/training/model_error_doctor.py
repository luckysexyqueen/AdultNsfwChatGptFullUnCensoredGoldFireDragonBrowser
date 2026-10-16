#!/usr/bin/env python3
"""Offline read-only model/training error analyzer and reversible JSON config fixer.
No model weights modified; no commands or dependencies executed.
"""
import argparse, json, re, hashlib, pathlib, sys, os
RULES = [
 ('cuda_oom','CUDA out of memory',r'CUDA out of memory|OutOfMemoryError|CUBLAS_STATUS_ALLOC_FAILED','Reduce batch size/sequence length, enable gradient checkpointing, or use an appropriate GPU.'),
 ('device_mismatch','Device mismatch',r'Expected all tensors to be on the same device|tensors? on different devices','Place inputs and model on compatible devices.'),
 ('missing_dependency','Missing Python dependency',r'ModuleNotFoundError: No module named [\'\"]([^\'\"]+)|ImportError: No module named [\'\"]([^\'\"]+)','Check the pinned dependency manifest and install only after approval.'),
 ('missing_file','Missing model/config file',r'FileNotFoundError|No such file or directory|config\.json.*not found|tokenizer\.json.*not found','Verify repo snapshot, tokenizer, config, and Git LFS materialization.'),
 ('model_architecture','Incompatible model architecture',r'size mismatch|shape mismatch|architecture.*(mismatch|incompatible)|tensor.*shape.*mismatch','Check model architecture, tokenizer/vocabulary and MergeKit compatibility; do not force a merge.'),
 ('tokenizer','Tokenizer incompatibility',r'tokenizer.*(error|mismatch|missing|not found)|vocab_size.*mismatch|special_tokens.*mismatch','Check tokenizer.json, special token IDs and model embeddings before training.'),
 ('bitsandbytes','Quantization or bitsandbytes error',r'bitsandbytes|4-bit quantization.*(error|unsupported)|quantization_config.*error','Verify compatible CUDA, GPU, bitsandbytes, torch and transformers versions.'),
 ('lfs_pointer','Git LFS pointer instead of weights',r'git-lfs.github.com/spec/v1|invalid safetensors header|HeaderTooLarge','Verify weights are downloaded, not Git LFS pointer text.'),
 ('disk_space','Insufficient storage',r'No space left on device|ENOSPC','Free space or use a larger persistent volume; do not delete originals automatically.'),
 ('access','Hub access or auth error',r'401 Unauthorized|403 Forbidden|GatedRepoError|RepositoryNotFoundError','Check model permissions, repo ID and secrets outside the project bundle.'),
 ('nan_loss','Unstable loss',r'loss.*nan|nan.*loss|gradient.*nan','Inspect training data, learning rate and mixed precision; do not silently alter checkpoints.'),
]
def scan(text):
    findings=[]
    for code,title,pattern,advice in RULES:
        matches=list(re.finditer(pattern,text,re.IGNORECASE))
        if matches: findings.append({'code':code,'title':title,'count':len(matches),'advice':advice})
    return findings

def audit_config(path):
    p=pathlib.Path(path)
    obj=json.loads(p.read_text(encoding='utf-8'))
    if not isinstance(obj,dict): raise ValueError('Training config must be a JSON object')
    changes=[]; patched=dict(obj)
    # Only universally safe normalization: numeric strings in known keys.
    for key in ('per_device_train_batch_size','gradient_accumulation_steps','num_train_epochs','max_steps','max_seq_length'):
        v=patched.get(key)
        if isinstance(v,str) and re.fullmatch(r'[1-9][0-9]*',v.strip()):
            patched[key]=int(v.strip()); changes.append({'key':key,'before':v,'after':patched[key]})
    for key in ('learning_rate','weight_decay'):
        v=patched.get(key)
        if isinstance(v,str):
            try:
                f=float(v)
                if 0 <= f < 1 and f==f: patched[key]=f; changes.append({'key':key,'before':v,'after':f})
            except ValueError: pass
    return obj,patched,changes

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--log',help='Training error log file (read-only)')
    ap.add_argument('--config',help='JSON training config (read-only)')
    ap.add_argument('--output',required=True,help='New JSON diagnostic report path')
    ap.add_argument('--patch-output',help='New fixed config copy path; original never changed')
    args=ap.parse_args()
    if not args.log and not args.config: ap.error('provide --log or --config')
    if args.patch_output and not args.config: ap.error('--patch-output requires --config')
    inputs=[pathlib.Path(p).resolve() for p in (args.log,args.config) if p]
    outputs=[pathlib.Path(p).resolve() for p in (args.output,args.patch_output) if p]
    if len(set(outputs))!=len(outputs) or any(p in inputs for p in outputs): ap.error('output paths must not overwrite inputs')
    if any(p.exists() for p in outputs): ap.error('output already exists; refusing overwrite')
    report={'tool':'LoveBound model error doctor','version':'1.35.9','status':'static_analysis_only','findings':[],'proposed_config_changes':[],'notes':['No weights were changed.','No training or dependency installation was executed.']}
    if args.log:
        text=pathlib.Path(args.log).read_text(encoding='utf-8',errors='replace')[:5_000_000]
        report['findings']=scan(text)
        report['log_sha256']=hashlib.sha256(pathlib.Path(args.log).read_bytes()).hexdigest()
    if args.config:
        before,after,changes=audit_config(args.config)
        report['proposed_config_changes']=changes
        report['config_sha256']=hashlib.sha256(pathlib.Path(args.config).read_bytes()).hexdigest()
        if args.patch_output:
            pathlib.Path(args.patch_output).parent.mkdir(parents=True,exist_ok=True)
            pathlib.Path(args.patch_output).write_text(json.dumps(after,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
            report['patched_config_path']=str(pathlib.Path(args.patch_output))
    pathlib.Path(args.output).parent.mkdir(parents=True,exist_ok=True)
    pathlib.Path(args.output).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'report':args.output,'findings':len(report['findings']),'changes':len(report['proposed_config_changes'])}))
if __name__=='__main__':main()
