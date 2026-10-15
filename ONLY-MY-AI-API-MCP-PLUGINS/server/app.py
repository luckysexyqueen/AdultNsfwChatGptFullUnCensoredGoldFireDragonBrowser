"""OpenAPI-driven MCP JSON-RPC bridge; explicit HTTPS upstream allowlist required."""
import os, json, re, socket, ipaddress, urllib.parse, base64, hashlib
from pathlib import Path
import httpx, yaml
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse

ROOT=Path(__file__).resolve().parents[1]
SPEC_DIR=ROOT/'specs'
app=FastAPI(title='Spec Direct MCP Universal Request Engine')
TOKEN=os.environ.get('MCP_BEARER_TOKEN','')
ALLOWED={s.strip().lower() for s in os.environ.get('ALLOWED_API_HOSTS','').split(',') if s.strip()}
MAX_RESPONSE=int(os.environ.get('MAX_RESPONSE_BYTES','65536'))
METHODS={'get','post','put','patch','delete','head','options'}

def registry():
    result={}
    if not SPEC_DIR.exists(): return result
    for f in sorted(SPEC_DIR.iterdir()):
        if not f.is_file() or f.suffix.lower() not in {'.yaml','.yml','.json'}: continue
        if f.stat().st_size>2_000_000: continue
        try:
            doc=json.loads(f.read_text()) if f.suffix.lower()=='.json' else yaml.safe_load(f.read_text())
            if not isinstance(doc,dict) or not (doc.get('openapi') or doc.get('swagger')): continue
            if doc.get('servers'):
                base=doc['servers'][0].get('url','')
            elif doc.get('swagger'):
                base='https://'+doc.get('host','')+'/'+doc.get('basePath','').lstrip('/')
            else: base=''
            for path, methods in (doc.get('paths') or {}).items():
                if not isinstance(methods,dict): continue
                for method, op in methods.items():
                    if method.lower() not in METHODS or not isinstance(op,dict): continue
                    key=re.sub('[^a-zA-Z0-9_]','_',f.stem+'_'+str(op.get('operationId') or method+'_'+path))[:90]
                    key+='_'+hashlib.sha256((f.name+method+path).encode()).hexdigest()[:8]
                    result[key]={'method':method.upper(),'path':path,'base':base,'source':f.name,'summary':op.get('summary',''), 'parameters':op.get('parameters',[]), 'security':op.get('security',doc.get('security',[])), 'securitySchemes':(doc.get('components') or {}).get('securitySchemes',{}), 'consumes':op.get('consumes',doc.get('consumes',[]))}
        except (ValueError, yaml.YAMLError, OSError, TypeError, KeyError): continue
    return result

def check_url(url):
    p=urllib.parse.urlsplit(url)
    if p.scheme!='https' or not p.hostname or p.username or p.password or p.port not in (None,443): raise ValueError('Public HTTPS on port 443 required')
    host=p.hostname.lower().rstrip('.')
    if host not in ALLOWED: raise ValueError('Host not in ALLOWED_API_HOSTS')
    for info in socket.getaddrinfo(host,443,type=socket.SOCK_STREAM):
        if not ipaddress.ip_address(info[4][0]).is_global: raise ValueError('Non-public upstream address rejected')

def auth_headers(op):
    headers={}
    for requirement in op['security']:
        for name in requirement:
            scheme=op['securitySchemes'].get(name,{})
            env='API_SECRET_'+re.sub('[^A-Z0-9_]','_',name.upper())
            secret=os.getenv(env,'')
            if not secret: continue
            typ=scheme.get('type')
            if typ=='http' and scheme.get('scheme','').lower()=='bearer': headers['Authorization']='Bearer '+secret
            elif typ=='http' and scheme.get('scheme','').lower()=='basic': headers['Authorization']='Basic '+base64.b64encode(secret.encode()).decode()
            elif typ=='apiKey' and scheme.get('in')=='header': headers[scheme.get('name','X-API-Key')]=secret
    if os.getenv('UPSTREAM_API_KEY') and 'Authorization' not in headers: headers['Authorization']='Bearer '+os.getenv('UPSTREAM_API_KEY')
    return headers

async def execute(op,args):
    method=op['method']
    if method not in {'GET','HEAD','OPTIONS'} and args.get('confirm_write') is not True: raise ValueError('Explicit write confirmation required')
    path=op['path']; path_params=args.get('path_params') or {}
    for key in re.findall(r'\{([^{}]+)\}',path):
        if key not in path_params: raise ValueError('Missing path parameter: '+key)
        path=path.replace('{'+key+'}',urllib.parse.quote(str(path_params[key]),safe=''))
    url=op['base'].rstrip('/')+'/'+path.lstrip('/')
    check_url(url)
    headers={'Accept':args.get('accept','application/json')}
    headers.update(auth_headers(op))
    # Do not accept arbitrary Host, Authorization, Cookie or forwarding headers from callers.
    for k,v in (args.get('headers') or {}).items():
        if k.lower() not in {'accept','content-type','if-match','if-none-match','idempotency-key'}: raise ValueError('Header not permitted: '+k)
        headers[k]=str(v)
    query=dict(args.get('query') or {})
    for requirement in op['security']:
        for name in requirement:
            scheme=op['securitySchemes'].get(name,{})
            if scheme.get('type')=='apiKey' and scheme.get('in')=='query':
                secret=os.getenv('API_SECRET_'+re.sub('[^A-Z0-9_]','_',name.upper()))
                if secret: query[scheme['name']]=secret
    kw={'params':query,'headers':headers}
    body=args.get('body')
    kind=args.get('body_type','json')
    if body is not None:
        if kind=='json': kw['json']=body
        elif kind=='form': kw['data']=body
        elif kind in ('text','xml'): kw['content']=str(body).encode()
        elif kind=='base64': kw['content']=base64.b64decode(body,validate=True)
        else: raise ValueError('Unsupported body_type')
    async with httpx.AsyncClient(timeout=httpx.Timeout(20.0),follow_redirects=False,trust_env=False) as client:
        response=await client.request(method,url,**kw)
    data={'status':response.status_code,'content_type':response.headers.get('content-type',''),'body':response.content[:MAX_RESPONSE].decode('utf-8','replace'),'truncated':len(response.content)>MAX_RESPONSE}
    return data

def rpc_result(id, result=None, error=None): return {'jsonrpc':'2.0','id':id, **({'error':error} if error else {'result':result})}

def tool_response(payload,failed=False): return {'content':[{'type':'text','text':json.dumps(payload,ensure_ascii=False)}], 'isError':failed}

@app.get('/health')
def health(): return {'status':'ok','operations':len(registry())}

@app.post('/mcp')
async def mcp(request:Request):
    if not TOKEN or request.headers.get('authorization')!='Bearer '+TOKEN: raise HTTPException(401,'Unauthorized')
    origin=request.headers.get('origin'); allowed_origins={x.strip() for x in os.getenv('ALLOWED_ORIGINS','').split(',') if x.strip()}
    if origin and origin not in allowed_origins: raise HTTPException(403,'Origin rejected')
    try: msg=await request.json()
    except ValueError: raise HTTPException(400,'Invalid JSON')
    method=msg.get('method'); ident=msg.get('id')
    if ident is None: return JSONResponse(status_code=202,content=None)
    if method=='initialize':return rpc_result(ident,{'protocolVersion':'2025-03-26','capabilities':{'tools':{}},'serverInfo':{'name':'spec-direct-mcp','version':'1.3.9'}})
    if method=='ping':return rpc_result(ident,{})
    if method=='tools/list':
        return rpc_result(ident,{'tools':[
            {'name':'list_api_operations','description':'List loaded OpenAPI operations','inputSchema':{'type':'object','properties':{}}},
            {'name':'call_api_operation','description':'Execute a registered public HTTPS OpenAPI operation','inputSchema':{'type':'object','properties':{'operation':{'type':'string'},'path_params':{'type':'object'},'query':{'type':'object'},'headers':{'type':'object'},'body':{},'body_type':{'type':'string','enum':['json','form','text','xml','base64']},'accept':{'type':'string'},'confirm_write':{'type':'boolean'}},'required':['operation']}}
        ]})
    if method!='tools/call':return rpc_result(ident,error={'code':-32601,'message':'Unknown method'})
    params=msg.get('params') or {}; name=params.get('name'); args=params.get('arguments') or {}; reg=registry()
    if name=='list_api_operations':return rpc_result(ident,tool_response(reg))
    if name!='call_api_operation':return rpc_result(ident,error={'code':-32602,'message':'Unknown tool'})
    op=reg.get(args.get('operation'))
    if not op:return rpc_result(ident,tool_response({'error':'Unknown operation'},True))
    try:return rpc_result(ident,tool_response(await execute(op,args)))
    except Exception as exc:return rpc_result(ident,tool_response({'error':str(exc)},True))
