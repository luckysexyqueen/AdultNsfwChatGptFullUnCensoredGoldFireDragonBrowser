#!/usr/bin/env python3
"""Prepare prompt-first local training examples and an offline exact-match translation bundle."""
import argparse,hashlib,json,pathlib,datetime,re

def sha(data):return hashlib.sha256(data).hexdigest()
def main():
 p=argparse.ArgumentParser(description=__doc__)
 p.add_argument('--prompt',required=True);p.add_argument('--approve-prompt-sha256',required=True)
 p.add_argument('--pairs',required=True);p.add_argument('--out',required=True)
 a=p.parse_args();promptfile=pathlib.Path(a.prompt);pairfile=pathlib.Path(a.pairs)
 if promptfile.is_symlink() or pairfile.is_symlink():p.error('Symlink input not supported')
 promptbytes=promptfile.read_bytes();ph=sha(promptbytes)
 if ph.lower()!=a.approve_prompt_sha256.lower():p.error('Prompt hash approval mismatch')
 prompt=promptbytes.decode('utf-8-sig')
 if not prompt.strip():p.error('Prompt is empty')
 out=pathlib.Path(a.out).resolve();out.mkdir(parents=True,exist_ok=True)
 if any((out/name).exists() for name in ('system_prompt.txt','translation_pairs.json','training.jsonl','manifest.json')):p.error('Output already exists; use a new output directory')
 records=[];mapping={};review=[]
 for lineno,line in enumerate(pairfile.read_text(encoding='utf-8-sig').splitlines(),1):
  if not line.strip():continue
  obj=json.loads(line)
  if not isinstance(obj,dict):raise ValueError(f'line {lineno}: object required')
  src=obj.get('source');dst=obj.get('target');sl=obj.get('source_lang');tl=obj.get('target_lang')
  if not all(isinstance(v,str) and v.strip() for v in (src,dst,sl,tl)):raise ValueError(f'line {lineno}: invalid fields')
  if tl not in ('ko-KR','en-US') or obj.get('verified') is not True:
   review.append(lineno);continue
  key=(sl,tl,src)
  if key in mapping and mapping[key]!=dst:review.append(lineno);continue
  mapping[key]=dst
  records.append({'messages':[{'role':'system','content':prompt},{'role':'user','content':f'Translate from {sl} to {tl}: {src}'},{'role':'assistant','content':dst}], 'provenance':{'line':lineno,'verified_by_user':True}})
 if not records:p.error('No user-verified usable translation pairs')
 (out/'system_prompt.txt').write_bytes(promptbytes)
 (out/'training.jsonl').write_text(''.join(json.dumps(x,ensure_ascii=False)+'\n' for x in records),encoding='utf-8')
 (out/'translation_pairs.json').write_text(json.dumps([{'source_lang':k[0],'target_lang':k[1],'source':k[2],'target':v} for k,v in mapping.items()],ensure_ascii=False,indent=2),encoding='utf-8')
 manifest={'prompt_sha256':ph,'source_pairs_sha256':sha(pairfile.read_bytes()),'examples':len(records),'deferred_lines':review,'created_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'note':'Data preparation only. No weights modified; runtime must inject system_prompt.txt each session.'}
 (out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
 print(json.dumps({'bundle':str(out),'examples':len(records),'deferred':len(review),'prompt_sha256':ph},ensure_ascii=False))
if __name__=='__main__':main()
