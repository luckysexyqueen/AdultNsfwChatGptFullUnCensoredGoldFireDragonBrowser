#!/usr/bin/env python3
"""Offline log triage with bounded automatic retry proposals; never executes training."""
import argparse,hashlib,json,pathlib,sys
from model_error_doctor import scan,audit_config

def main():
    p=argparse.ArgumentParser();p.add_argument('--log',required=True);p.add_argument('--config');p.add_argument('--out-dir',required=True);p.add_argument('--approve-config-fix',action='store_true');a=p.parse_args()
    log=pathlib.Path(a.log).resolve();base=pathlib.Path(a.out_dir).resolve()
    if base.exists():p.error('out-dir must not exist (avoid overwrite)')
    findings=scan(log.read_text(encoding='utf-8',errors='replace')[:5000000]);report={'version':'1.35.9','status':'diagnosis_only','findings':findings,'auto_repair_applied':False,'rerun_executed':False,'source_log_sha256':hashlib.sha256(log.read_bytes()).hexdigest(),'manual_actions':[]}
    if a.config:
        config=pathlib.Path(a.config).resolve();before,after,changes=audit_config(config)
        report['source_config_sha256']=hashlib.sha256(config.read_bytes()).hexdigest();report['safe_config_normalizations']=changes
        if a.approve_config_fix and changes:
            base.mkdir(parents=True);(base/'training-config.fixed.json').write_text(json.dumps(after,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');report['auto_repair_applied']=True;report['patched_copy']='training-config.fixed.json'
    for f in findings:
        if f['code'] in ('cuda_oom','model_architecture','tokenizer','access','lfs_pointer','missing_dependency','bitsandbytes'):
            report['manual_actions'].append({'code':f['code'],'reason':'Requires environment, model compatibility, credentials or dependency validation; not safe to auto-modify','advice':f['advice']})
    base.mkdir(parents=True,exist_ok=True)
    (base/'repair-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'report':str(base/'repair-report.json'),'findings':len(findings),'safe_patch':report['auto_repair_applied']},ensure_ascii=False))
if __name__=='__main__':main()
