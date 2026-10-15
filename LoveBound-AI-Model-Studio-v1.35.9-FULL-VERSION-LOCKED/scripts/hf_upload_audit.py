#!/usr/bin/env python3
"""Read-only inspection of a user-uploaded Hugging Face repository ZIP."""
import argparse, json, pathlib, zipfile
HINTS=('README.md','config.json','tokenizer.json','tokenizer_config.json','generation_config.json','model.safetensors.index.json','requirements.txt','packages.txt','Dockerfile','app.py','app.js','package.json','.gitattributes')
def inspect(path):
    p=pathlib.Path(path)
    with zipfile.ZipFile(p) as z:
        files=[x for x in z.infolist() if not x.is_dir()]
        names=[x.filename for x in files]
        unsafe=[n for n in names if n.startswith('/') or '..' in pathlib.PurePosixPath(n).parts or '\\' in n]
        found=sorted(x for x in HINTS if any(n==x or n.endswith('/'+x) for n in names))
        ext_counts={}
        for n in names:
            ext=pathlib.PurePosixPath(n).suffix.lower() or '[none]'
            ext_counts[ext]=ext_counts.get(ext,0)+1
        lfs=[]
        for item in files:
            if item.file_size<1024 and pathlib.PurePosixPath(item.filename).suffix.lower() in ('.gguf','.safetensors','.bin','.pt','.pth'):
                with z.open(item) as stream:
                    if stream.read(100).startswith(b'version https://git-lfs.github.com/spec/v1'): lfs.append(item.filename)
        return {'input':p.name,'files':len(files),'unsafe_paths':unsafe,'detected_manifests':found,'extensions':ext_counts,'git_lfs_pointers':lfs,'actual_inference_test':False,'actual_deployment_test':False}
def main():
    ap=argparse.ArgumentParser();ap.add_argument('--input',required=True);ap.add_argument('--output',required=True);a=ap.parse_args()
    target=pathlib.Path(a.output)
    if target.exists(): raise SystemExit('Refusing to overwrite an existing report')
    report=inspect(a.input);target.parent.mkdir(parents=True,exist_ok=True);target.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
if __name__=='__main__':main()
