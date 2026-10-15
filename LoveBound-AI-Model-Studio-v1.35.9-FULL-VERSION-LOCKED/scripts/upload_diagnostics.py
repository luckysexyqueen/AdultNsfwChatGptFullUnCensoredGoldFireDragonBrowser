#!/usr/bin/env python3
"""Read-only upload triage. No imports of user code, no pickle, no network."""
import argparse, hashlib, json, pathlib, struct, zipfile
EXT={'.gguf':'gguf','.safetensors':'safetensors','.pt':'pytorch','.pth':'pytorch','.bin':'binary_or_weights','.zip':'archive','.apk':'android_apk','.html':'web','.js':'web','.ts':'web','.json':'config','.py':'python','.log':'log'}
def diagnose(path):
    path=pathlib.Path(path).resolve(strict=True)
    if not path.is_file(): raise ValueError('Input must be a regular file')
    size=path.stat().st_size
    sha=hashlib.sha256()
    with path.open('rb') as f:
        head=f.read(16)
        sha.update(head)
        for chunk in iter(lambda:f.read(1024*1024),b''):sha.update(chunk)
    typ=EXT.get(path.suffix.lower(),'custom_unknown')
    out={'filename':path.name,'size_bytes':size,'sha256':sha.hexdigest(),'type_hint':typ,'load_tested':False,'api_tested':False,'warnings':[]}
    if typ=='gguf':
        if head[:4]!=b'GGUF':out['warnings'].append('Invalid GGUF magic')
        elif len(head)>=8:out['gguf_version']=struct.unpack('<I',head[4:8])[0]
    if typ=='safetensors':
        if len(head)<8:out['warnings'].append('Missing SafeTensors header')
        else:
            n=struct.unpack('<Q',head[:8])[0]
            if not (2<=n<=min(size-8,100*1024*1024)):out['warnings'].append('Suspicious SafeTensors header length')
            else:out['header_length_bytes']=n
    if typ in ('pytorch','binary_or_weights'):out['warnings'].append('Never unpickle or execute untrusted weight files during inspection')
    if typ in ('archive','android_apk'):
        try:
            with zipfile.ZipFile(path) as z:
                infos=z.infolist()
                out['entry_count']=len(infos)
                out['sample_entries']=[i.filename for i in infos[:30]]
                suspicious=[i.filename for i in infos if i.filename.startswith(('/', '\\')) or '..' in pathlib.PurePosixPath(i.filename).parts]
                if suspicious:out['warnings'].append('Archive has unsafe paths; do not extract blindly')
                out['has_package_json']=any(i.filename.endswith('/package.json') or i.filename=='package.json' for i in infos)
                out['has_requirements_txt']=any(i.filename.endswith('/requirements.txt') or i.filename=='requirements.txt' for i in infos)
        except zipfile.BadZipFile:out['warnings'].append('Not a readable ZIP container')
    return out

def main():
    p=argparse.ArgumentParser();p.add_argument('--input',required=True);p.add_argument('--output',required=True)
    a=p.parse_args(); inp=pathlib.Path(a.input).resolve(strict=True);out=pathlib.Path(a.output).resolve()
    if out.exists():p.error('Output exists; refusing overwrite')
    if inp==out:p.error('Output must differ from input')
    report=diagnose(inp);out.parent.mkdir(parents=True,exist_ok=True)
    with out.open('x',encoding='utf-8') as f:json.dump(report,f,ensure_ascii=False,indent=2)
    print(json.dumps({'report':str(out),'type_hint':report['type_hint'],'load_tested':False},ensure_ascii=False))
if __name__=='__main__':main()
