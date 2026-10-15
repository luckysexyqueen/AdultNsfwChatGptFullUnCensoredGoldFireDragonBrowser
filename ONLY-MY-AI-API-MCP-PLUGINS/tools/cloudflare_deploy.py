"""Opt-in Cloudflare Wrangler deployment. Never handles Cloudflare account credentials."""
import argparse, json, os, subprocess, sys, time, urllib.request, urllib.error, re
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
CLOUD=ROOT/'cloudflare'
SPECS=ROOT/'specs'

def bundle_specs(specdir=SPECS):
    result={}
    for f in sorted(Path(specdir).iterdir()):
        if f.is_file() and f.suffix.lower() in {'.yaml','.yml','.json'}:
            if f.stat().st_size>2_000_000:raise ValueError('Spec too large: '+f.name)
            result[f.name]=f.read_text(encoding='utf-8')
    if not result:raise ValueError('No spec files found in specs/')
    return result

def generate(specdir=SPECS, dest=CLOUD/'src/specs.generated.mjs'):
    result=bundle_specs(specdir)
    Path(dest).parent.mkdir(parents=True,exist_ok=True)
    Path(dest).write_text('// Generated, review specs for secrets before deploying.\nexport default '+json.dumps(result,ensure_ascii=False)+';\n',encoding='utf-8')
    return len(result)

def run(cmd, cwd=CLOUD):
    print('RUN:', ' '.join(cmd),flush=True)
    return subprocess.run(cmd,cwd=cwd,check=True)

def probe(url,token,attempts=5):
    payload=json.dumps({'jsonrpc':'2.0','id':1,'method':'tools/list','params':{}}).encode()
    for i in range(attempts):
        try:
            req=urllib.request.Request(url,data=payload,headers={'Authorization':'Bearer '+token,'Content-Type':'application/json','Accept':'application/json, text/event-stream'},method='POST')
            with urllib.request.urlopen(req,timeout=12) as r:
                data=json.loads(r.read(262144))
                if data.get('result',{}).get('tools'):return True
        except (urllib.error.URLError,TimeoutError,ValueError,OSError) as e:print('PROBE RETRY',i+1,str(e)[:120])
        if i<attempts-1:time.sleep(2)
    return False

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--apply',action='store_true',help='Explicitly authorize deploy')
    p.add_argument('--url',help='Actual deployed https://*.workers.dev/mcp or custom HTTPS URL, used for post-deploy test')
    p.add_argument('--secret-env',default='SPEC_DIRECT_MCP_TOKEN',help='Local environment variable holding existing server bearer token')
    p.add_argument('--set-secret',action='store_true',help='Upload bearer token via wrangler secret put (stdin), never log')
    p.add_argument('--rollback-on-failure',action='store_true',help='Attempt wrangler rollback if verification fails; requires CLI support')
    p.add_argument('--auto-url',action='store_true',help='Extract actual workers.dev URL from Wrangler deploy output and verify automatically')
    a=p.parse_args()
    count=generate()
    print('Bundled specs:',count)
    print('REVIEW: spec contents are uploaded to Cloudflare. Do not include API keys or private data.')
    print('PREPARE: npm install --prefix cloudflare; npx wrangler login (user approves); set ALLOWED_API_HOSTS in wrangler.toml')
    if not a.apply:
        print('DRY RUN: no cloud changes; pass --apply to deploy');return
    if not os.getenv('ALLOWED_API_HOSTS'):
        print('NOTICE: configure ALLOWED_API_HOSTS in cloudflare/wrangler.toml; default is deny-all.')
    if a.set_secret and not a.auto_url:
        token=os.getenv(a.secret_env)
        if not token:raise ValueError('Missing '+a.secret_env)
        subprocess.run(['npx','wrangler','secret','put','MCP_BEARER_TOKEN'],input=token+'\n',text=True,cwd=CLOUD,check=True)
    if a.auto_url:
        completed=subprocess.run(['npx','wrangler','deploy'],cwd=CLOUD,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,check=True)
        print(completed.stdout,flush=True)
        matches=re.findall(r'https://[a-zA-Z0-9.-]+\.workers\.dev(?:/[^\s]*)?',completed.stdout)
        if matches and not a.url:
            from urllib.parse import urlsplit
            parsed=urlsplit(matches[-1].rstrip('.,;'))
            a.url=f'https://{parsed.hostname}/mcp'
    else:
        run(['npx','wrangler','deploy'])
    if a.auto_url and a.set_secret:
        token=os.getenv(a.secret_env)
        if not token:raise ValueError('Missing '+a.secret_env)
        subprocess.run(['npx','wrangler','secret','put','MCP_BEARER_TOKEN'],input=token+'\n',text=True,cwd=CLOUD,check=True)
    if not a.url:
        print('DEPLOY SUBMITTED. Copy the real workers.dev URL from Wrangler output, then rerun connection_doctor with the token. No verified URL yet.');return
    from urllib.parse import urlsplit
    u=urlsplit(a.url)
    if u.scheme!='https' or not u.hostname or u.username or u.password or u.port not in (None,443) or not u.path.endswith('/mcp'):
        raise ValueError('Provide a real HTTPS /mcp URL')
    token=os.getenv(a.secret_env)
    if not token:raise ValueError('Verification needs '+a.secret_env)
    if probe(a.url,token):
        print('VERIFIED MCP URL:',a.url)
        (ROOT/'runtime').mkdir(exist_ok=True)
        (ROOT/'runtime'/'mcp_connection.json').write_text(json.dumps({'name':'spec-direct-auto-inject','url':a.url,'transport':'streamable-http'},indent=2)+'\n',encoding='utf-8')
        print('SAVED:',ROOT/'runtime'/'mcp_connection.json')
        print('REGISTRATION JSON:',json.dumps({'name':'spec-direct-auto-inject','url':a.url,'transport':'streamable-http'},ensure_ascii=False))
    else:
        print('ERROR: deployed endpoint did not pass tools/list test',file=sys.stderr)
        if a.rollback_on_failure:
            try:run(['npx','wrangler','rollback'])
            except subprocess.CalledProcessError:print('ROLLBACK FAILED: inspect Cloudflare dashboard',file=sys.stderr)
        sys.exit(2)
if __name__=='__main__':main()
