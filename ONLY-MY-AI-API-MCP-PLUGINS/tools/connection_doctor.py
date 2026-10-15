import argparse,json,os,sys
import httpx
p=argparse.ArgumentParser();p.add_argument('--url',required=True);p.add_argument('--token-env',default='SPEC_DIRECT_MCP_TOKEN');a=p.parse_args()
if not a.url.startswith('https://'):p.error('HTTPS required')
headers={'Authorization':'Bearer '+os.getenv(a.token_env,'')} if os.getenv(a.token_env) else {}
for name,payload in [('initialize',{'jsonrpc':'2.0','id':1,'method':'initialize','params':{'protocolVersion':'2025-03-26','capabilities':{},'clientInfo':{'name':'spec-direct-doctor','version':'1.5.0'}}}),('tools/list',{'jsonrpc':'2.0','id':2,'method':'tools/list','params':{}})]:
 try:
  r=httpx.post(a.url,json=payload,headers={**headers,'Accept':'application/json, text/event-stream','Content-Type':'application/json'},timeout=15,follow_redirects=False)
  print(name,'HTTP',r.status_code,'type',r.headers.get('content-type',''))
  if r.status_code>=400:print('FAIL',r.text[:400]);sys.exit(1)
  if 'json' in r.headers.get('content-type',''):print('OK',str(r.json())[:300])
  else:print('REVIEW: SSE transport requires a session-aware client')
 except Exception as exc:print('FAIL',type(exc).__name__,str(exc)[:200]);sys.exit(1)
