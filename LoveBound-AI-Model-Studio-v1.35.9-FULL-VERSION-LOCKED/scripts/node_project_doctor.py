#!/usr/bin/env python3
"""Read-only Node project inspection. Never executes npm or project code."""
import argparse,json,pathlib,re,hashlib
SKIP={'node_modules','.git','.env','.next','dist','build','.venv','coverage'}
def audit(project):
 root=pathlib.Path(project).resolve()
 if not root.is_dir(): raise ValueError('project must be a directory')
 manifest=root/'package.json'
 result={'project':root.name,'manifest_present':manifest.is_file(),'lockfiles':[],'issues':[],'suggestions':[],'runtime_tested':False,'dependencies_installed':False,'build_tested':False}
 for name in ['package-lock.json','npm-shrinkwrap.json','pnpm-lock.yaml','yarn.lock','bun.lock','bun.lockb']:
  if (root/name).is_file():result['lockfiles'].append(name)
 if not manifest.is_file():result['issues'].append('package.json missing');return result
 try:
  data=json.loads(manifest.read_text(encoding='utf-8'))
  if not isinstance(data,dict):raise ValueError('package.json must be object')
 except (ValueError,UnicodeError) as e:
  result['issues'].append('invalid package.json: '+str(e));return result
 result['package_name']=data.get('name');result['engines']=data.get('engines',{});result['scripts']=sorted((data.get('scripts') or {}).keys())
 result['dependency_count']=len(data.get('dependencies') or {});result['dev_dependency_count']=len(data.get('devDependencies') or {})
 if not result['lockfiles']:result['issues'].append('no lockfile');result['suggestions'].append('Choose npm/pnpm/yarn and generate a lockfile after approval')
 if len(result['lockfiles'])>1:result['issues'].append('multiple lockfiles: review package manager consistency')
 for field in ['main','module']:
  value=data.get(field)
  if isinstance(value,str) and value.startswith('.') and not (root/value).is_file():result['issues'].append(field+' entrypoint missing: '+value)
 result['native_addon_hints']=[name for name in (data.get('dependencies') or {}) if any(x in name.lower() for x in ['sharp','better-sqlite3','node-gyp','sqlite3','canvas','onnxruntime-node'])]
 if result['native_addon_hints']:result['suggestions'].append('Check Windows x86_64 and Android arm64 native compatibility independently')
 if 'build' not in (data.get('scripts') or {}):result['suggestions'].append('No build script defined; verify framework requirements')
 return result
def main():
 p=argparse.ArgumentParser();p.add_argument('--project',required=True);p.add_argument('--output',required=True);a=p.parse_args()
 out=pathlib.Path(a.output)
 if out.exists():raise SystemExit('Refusing to overwrite existing report')
 out.parent.mkdir(parents=True,exist_ok=True)
 out.write_text(json.dumps(audit(a.project),ensure_ascii=False,indent=2),encoding='utf-8')
if __name__=='__main__':main()
