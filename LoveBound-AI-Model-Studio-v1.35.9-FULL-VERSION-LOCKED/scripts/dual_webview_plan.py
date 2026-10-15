#!/usr/bin/env python3
"""Read-only dual-engine project inventory; does not execute uploaded code."""
import argparse, json, pathlib, hashlib, zipfile
HINTS={'geckoview':['geckoview','GeckoView','GeckoSession'],'chromium_webview':['android.webkit.WebView','WebViewClient','webview'],'capacitor':['capacitor.config','@capacitor'],'electron':['electron','BrowserWindow'],'website':['index.html','package.json'],'ai':['gguf','llama','wllama']}
def inspect(p):
    p=pathlib.Path(p)
    if not p.is_file(): raise ValueError('Expected a project ZIP file')
    with p.open('rb') as f: digest=hashlib.file_digest(f,'sha256').hexdigest()
    with zipfile.ZipFile(p) as z:
        entries=z.infolist(); names=[x.filename for x in entries]
        unsafe=[n for n in names if n.startswith('/') or '..' in pathlib.PurePosixPath(n).parts or '\\' in n or ':' in n]
        found={key:[n for n in names if any(h.lower() in n.lower() for h in hints)][:30] for key,hints in HINTS.items()}
        symlinks=[x.filename for x in entries if (x.external_attr>>16)&0o170000==0o120000]
    return {'source':p.name,'sha256':digest,'entries':len(names),'unsafe_paths':unsafe,'symlinks':symlinks,'indicators':found,'status':'inspection_only','next_steps':['preserve original','inspect Android manifest and Gradle dependencies','verify independent GeckoView and Android WebView lifecycle','define host adapter and JS bridge','connect website and model service','test each engine offline/localhost/online','record tests and rollback']}
def main():
    a=argparse.ArgumentParser();a.add_argument('--project-zip',required=True);a.add_argument('--output',required=True);args=a.parse_args()
    o=pathlib.Path(args.output)
    if o.exists():raise SystemExit('Refusing to overwrite existing report')
    result=inspect(args.project_zip);o.parent.mkdir(parents=True,exist_ok=True);o.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
if __name__=='__main__':main()
