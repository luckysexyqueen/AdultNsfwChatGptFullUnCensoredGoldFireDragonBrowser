#!/usr/bin/env python3
"""Non-destructive, offline format checks and explicit user-approved promotion."""
import argparse, hashlib, json, os, pathlib, shutil, struct, datetime
FORMATS=('gguf','pytorch','safetensors')
CATEGORIES=('downloads','ingredients','workspace','mergekit_outputs','completed','selected')
STAGES=('incoming','staging','converted','verified')
def digest(path):
 h=hashlib.sha256()
 with open(path,'rb') as f:
  for block in iter(lambda:f.read(1024*1024),b''): h.update(block)
 return h.hexdigest()
def inspect(path,fmt):
 p=pathlib.Path(path)
 if p.is_symlink() or not p.is_file(): return {'status':'invalid','reason':'not a regular file'}
 if p.stat().st_size==0:return {'status':'invalid','reason':'empty file'}
 with p.open('rb') as f: head=f.read(16)
 if fmt=='gguf':
  if p.suffix.lower()!='.gguf' or head[:4]!=b'GGUF':return {'status':'invalid','reason':'GGUF magic/extension mismatch'}
  ver=struct.unpack('<I',head[4:8])[0]
  if ver not in (2,3):return {'status':'needs_review','reason':f'unrecognized GGUF version {ver}'}
 elif fmt=='safetensors':
  if p.suffix.lower()!='.safetensors':return {'status':'invalid','reason':'extension mismatch'}
  if len(head)<8:return {'status':'invalid','reason':'missing header'}
  size=struct.unpack('<Q',head[:8])[0]
  if size<2 or size>p.stat().st_size-8 or size>100*1024*1024:return {'status':'invalid','reason':'header length invalid'}
  try:
   with p.open('rb') as f:f.seek(8); meta=json.loads(f.read(size))
   if not isinstance(meta,dict):raise ValueError('not an object')
  except Exception as exc:return {'status':'invalid','reason':'header parse error: '+str(exc)}
 elif fmt=='pytorch':
  if p.suffix.lower() not in ('.pt','.pth','.bin','.ckpt'):return {'status':'invalid','reason':'extension mismatch'}
  # NEVER unpickle or torch.load an untrusted checkpoint during inspection.
  if not (head.startswith(b'PK\x03\x04') or head.startswith(b'\x80')):
   return {'status':'needs_review','reason':'unknown checkpoint container'}
 return {'status':'needs_review','reason':'basic format checks passed; inference/load and compatibility untested','sha256':digest(p),'bytes':p.stat().st_size}
def main():
 ap=argparse.ArgumentParser(description=__doc__)
 ap.add_argument('--file',required=True);ap.add_argument('--format',choices=FORMATS,required=True)
 ap.add_argument('--root',required=True);ap.add_argument('--model-name',required=True)
 ap.add_argument('--promote',action='store_true',help='Explicitly copy a tested model into selected/verified; never overwrite')
 ap.add_argument('--tested-working',action='store_true',help='User attests successful local inference and compatibility test')
 a=ap.parse_args()
 if not a.model_name or a.model_name in ('.','..') or not all(c.isascii() and (c.isalnum() or c in '._-') for c in a.model_name):ap.error('Unsafe model name')
 report=inspect(a.file,a.format)
 report.update({'file':str(pathlib.Path(a.file).resolve()),'format':a.format,'model':a.model_name,'checked_at':datetime.datetime.now(datetime.timezone.utc).isoformat()})
 if a.promote:
  if report['status']!='needs_review' or not a.tested_working:ap.error('Promotion requires passing structural checks and --tested-working')
  root=pathlib.Path(a.root).resolve();dest=root/'models'/'selected'/('.'+a.format)/'verified'/a.model_name/pathlib.Path(a.file).name
  dest.parent.mkdir(parents=True,exist_ok=True)
  if dest.exists() or dest.is_symlink():ap.error('Refusing to overwrite an existing result')
  try:
   with open(a.file,'rb') as src,open(dest,'xb') as dst:shutil.copyfileobj(src,dst)
   if digest(dest)!=report['sha256']:raise ValueError('copy hash mismatch')
  except Exception:
   if dest.exists():dest.unlink()
   raise
  report['promoted_copy']=str(dest)
 print(json.dumps(report,ensure_ascii=False,indent=2))
if __name__=='__main__':main()
