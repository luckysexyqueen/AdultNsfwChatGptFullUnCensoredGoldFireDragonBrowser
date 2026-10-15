#!/usr/bin/env python3
"""Build a safe, selective example website integration ZIP without editing a website."""
import argparse, hashlib, json, pathlib, zipfile
ALLOWED={
  'frontend_api_client':'frontend/ai-client.js',
  'backend_mock':'backend/mock_server.py',
  'integration_config':'config/integration.json',
  'documentation':'README.md',
}
def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--config',required=True);p.add_argument('--output',required=True)
    a=p.parse_args(); cfg=json.loads(pathlib.Path(a.config).read_text(encoding='utf-8'))
    modules=cfg.get('modules',[])
    if not isinstance(modules,list) or not modules or len(set(modules))!=len(modules) or any(m not in ALLOWED for m in modules):p.error('Invalid or duplicate modules')
    mode=cfg.get('mode')
    if mode not in ('local-files','hosted','separate','hybrid','partial'):p.error('Invalid mode')
    root=pathlib.Path(__file__).resolve().parent.parent
    sources={
      'frontend_api_client':root/'custom/website_integration/modules/ai-client.js',
      'backend_mock':root/'scripts/website_mock_backend.py',
      'integration_config':pathlib.Path(a.config),
      'documentation':root/'custom/website_integration/README.md',
    }
    payload={}
    for m in modules:
        f=sources[m]
        if not f.is_file():p.error(f'Missing module source: {f}')
        payload[ALLOWED[m]]=f.read_bytes()
    manifest={'mode':mode,'modules':modules,'notes':'Template export only. No actual model runner, no deployment, no prompt enforcement without backend integration.','sha256':{k:hashlib.sha256(v).hexdigest() for k,v in payload.items()}}
    output=pathlib.Path(a.output).expanduser().resolve()
    output.parent.mkdir(parents=True,exist_ok=True)
    with output.open('xb') as stream:
        with zipfile.ZipFile(stream,'w',zipfile.ZIP_DEFLATED) as z:
            for path,data in payload.items():z.writestr(path,data)
            z.writestr('integration-manifest.json',json.dumps(manifest,indent=2,ensure_ascii=False))
    print(json.dumps({'exported':str(output),'modules':modules,'mode':mode},ensure_ascii=False))
if __name__=='__main__':main()
