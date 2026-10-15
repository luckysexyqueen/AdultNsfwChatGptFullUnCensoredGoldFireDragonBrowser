#!/usr/bin/env python3
"""Initialize and safely stage a user-provided website source tree; no builds or installs."""
import argparse,hashlib,json,os,re,shutil,datetime
from pathlib import Path
AREAS=('original_uploads','snapshots','repair_workspace','integration_workspace','modules','packages','builds','exports','reports','rollback')
SKIP={'.git','node_modules','.venv','venv','__pycache__','.next','.nuxt','dist','build','.cache','.turbo','coverage'}
SECRETS={'.env','.env.local','.env.production','.env.development','id_rsa','id_ed25519'}
MANIFESTS={'package.json':'nodejs/npm','package-lock.json':'npm','pnpm-lock.yaml':'pnpm','yarn.lock':'yarn','bun.lock':'bun','bun.lockb':'bun','requirements.txt':'python/pip','pyproject.toml':'python','Pipfile':'python/pipenv','poetry.lock':'python/poetry','composer.json':'php/composer','pom.xml':'java/maven','build.gradle':'java/gradle','build.gradle.kts':'java/gradle','Cargo.toml':'rust/cargo','go.mod':'go','Gemfile':'ruby/bundler'}
def safe(s):
 if not re.fullmatch(r'[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}',s) or s in ('.','..'): raise ValueError('Invalid site name')
 return s
def init(root,site):
 for area in AREAS:(root/'custom'/'my_websites'/area/site).mkdir(parents=True,exist_ok=True)
def check_tree(source):
 for current,dirs,files in os.walk(source,followlinks=False):
  base=Path(current)
  for name in dirs+files:
   path=base/name
   if path.is_symlink():raise ValueError('Symlink refused: '+str(path))
  dirs[:]=[d for d in dirs if d not in SKIP]
def copy_filtered(source,dest):
 def ignore(folder,names):
  return [n for n in names if n in SKIP or n in SECRETS or n.startswith('.env.')]
 shutil.copytree(source,dest,ignore=ignore,symlinks=False)
def sha(path):
 h=hashlib.sha256()
 with path.open('rb') as f:
  for block in iter(lambda:f.read(1024*1024),b''):h.update(block)
 return h.hexdigest()
def main():
 p=argparse.ArgumentParser(description=__doc__)
 p.add_argument('--root',required=True);p.add_argument('--site',required=True);p.add_argument('--init',action='store_true');p.add_argument('--import-dir')
 a=p.parse_args();root=Path(a.root).expanduser().resolve();site=safe(a.site);init(root,site)
 if not a.import_dir:print(json.dumps({'initialized':str(root/'custom'/'my_websites'),'site':site}));return
 src=Path(a.import_dir).expanduser().resolve(strict=True)
 if not src.is_dir():p.error('Source must be directory')
 base=root/'custom'/'my_websites';dest=base/'snapshots'/site/(datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
 work=base/'repair_workspace'/site/dest.name
 if src==root or root in src.parents or src in root.parents:p.error('Source and workspace must be separate')
 check_tree(src);copy_filtered(src,dest)
 try:copy_filtered(dest,work)
 except Exception:raise
 files=[{'path':str(f.relative_to(dest)),'sha256':sha(f)} for f in dest.rglob('*') if f.is_file()]
 ecosystems=sorted({v for f in dest.rglob('*') if f.is_file() for k,v in MANIFESTS.items() if f.name==k})
 report={'site':site,'snapshot':str(dest),'repair_copy':str(work),'files':len(files),'ecosystems':ecosystems,'inventory':files,'excluded':'generated dependencies and common secret files'}
 report_path=base/'reports'/site/(dest.name+'.json');report_path.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
 print(json.dumps({'snapshot':str(dest),'repair_copy':str(work),'report':str(report_path),'ecosystems':ecosystems},ensure_ascii=False))
if __name__=='__main__':main()
