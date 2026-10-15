"""Spec Direct v1.5.0: safe OpenAPI registry and API executor."""
import os, json, re, hashlib, socket, ipaddress, urllib.parse, base64, time
from pathlib import Path
import httpx, yaml

ROOT=Path(__file__).resolve().parents[1]
SPEC_DIR=Path(os.getenv('SPEC_DIR',str(ROOT/'specs')))
METHODS={'get','post','put','patch','delete','head','options','trace'}
WRITE={'POST','PUT','PATCH','DELETE','TRACE'}
MAX_SPEC_BYTES=2_000_000

def _load(path):
    if path.stat().st_size>MAX_SPEC_BYTES: raise ValueError('spec too large')
    return json.loads(path.read_text('utf-8')) if path.suffix=='.json' else yaml.safe_load(path.read_text('utf-8'))

def _resolve(obj, doc, depth=0):
    if depth>12: raise ValueError('excessive $ref depth')
    if isinstance(obj,dict) and '$ref' in obj:
        ref=obj['$ref']
        if not isinstance(ref,str) or not ref.startswith('#/'): raise ValueError('external $ref unsupported')
        node=doc
        for key in ref[2:].split('/'):
            key=key.replace('~1','/').replace('~0','~')
            node=node[key]
        return _resolve(node,doc,depth+1)
    return obj

def registry():
    entries={}; errors=[]; digests=[]
    if not SPEC_DIR.exists(): return entries,errors,''
    for f in sorted(SPEC_DIR.iterdir()):
        if not f.is_file() or f.suffix.lower() not in ('.yaml','.yml','.json'):continue
        try:
            data=f.read_bytes()
            digests.append(f.name+':'+hashlib.sha256(data).hexdigest())
            doc=_load(f)
            if not isinstance(doc,dict) or not (str(doc.get('openapi','')).startswith('3.') or doc.get('swagger')=='2.0'):raise ValueError('OpenAPI 3.x or Swagger 2.0 required')
            if doc.get('swagger')=='2.0':
                schemes=doc.get('schemes') or ['https'];base='https://'+str(doc.get('host',''))+'/'+str(doc.get('basePath','')).lstrip('/')
                if 'https' not in schemes:raise ValueError('Swagger HTTPS scheme required')
                security_schemes=doc.get('securityDefinitions') or {}
            else:
                servers=doc.get('servers') or []
                base=(servers[0].get('url','') if servers else '')
                security_schemes=(doc.get('components') or {}).get('securitySchemes') or {}
            for path, methods in (doc.get('paths') or {}).items():
                if not isinstance(methods,dict):continue
                for method,op in methods.items():
                    if method.lower() not in METHODS or not isinstance(op,dict):continue
                    op=_resolve(op,doc)
                    server=(op.get('servers') or methods.get('servers') or [{}])[0].get('url') if doc.get('swagger')!='2.0' else None
                    actual_base=server or base
                    if not isinstance(actual_base,str) or '{' in actual_base:raise ValueError('server variables not supported: '+str(path))
                    ident=re.sub('[^a-zA-Z0-9_]','_',f.stem+'_'+str(op.get('operationId') or method+'_'+path))[:90]
                    ident+='_'+hashlib.sha256((f.name+method+path).encode()).hexdigest()[:8]
                    params=[]
                    for p in (methods.get('parameters') or [])+(op.get('parameters') or []):
                        params.append(_resolve(p,doc))
                    entries[ident]={'method':method.upper(),'path':path,'base':actual_base,'source':f.name,'summary':op.get('summary',''), 'parameters':params,'security':op.get('security',doc.get('security',[])),'securitySchemes':security_schemes,'requestBody':op.get('requestBody'),'consumes':op.get('consumes',doc.get('consumes',[]))}
        except Exception as exc:errors.append({'file':f.name,'error':str(exc)[:250]})
    return entries,errors,hashlib.sha256('|'.join(digests).encode()).hexdigest()[:16]

def check_url(url):
    parsed=urllib.parse.urlsplit(url)
    if parsed.scheme!='https' or not parsed.hostname or parsed.username or parsed.password or parsed.port not in (None,443):raise ValueError('Public HTTPS port 443 required')
    host=parsed.hostname.lower().rstrip('.')
    allowed={x.strip().lower() for x in os.getenv('ALLOWED_API_HOSTS','').split(',') if x.strip()}
    if host not in allowed:raise ValueError('Upstream host not allowlisted')
    addresses=socket.getaddrinfo(host,443,type=socket.SOCK_STREAM)
    if not addresses or any(not ipaddress.ip_address(a[4][0]).is_global for a in addresses):raise ValueError('Non-public upstream address')
    # Production requires DNS pinning / egress firewall to close rebinding gap.
    return host

def auth(op,headers,query):
    for requirement in op.get('security') or []:
        if not isinstance(requirement,dict):continue
        for name in requirement:
            scheme=op['securitySchemes'].get(name,{})
            secret=os.getenv('API_SECRET_'+re.sub('[^A-Z0-9_]','_',name.upper()),'')
            if not secret:continue
            kind=scheme.get('type');loc=scheme.get('in')
            if kind=='apiKey' and loc=='header':headers[scheme.get('name','X-API-Key')]=secret
            elif kind=='apiKey' and loc=='query':query[scheme['name']]=secret
            elif kind=='http' and scheme.get('scheme')=='bearer':headers['Authorization']='Bearer '+secret
            elif kind=='http' and scheme.get('scheme')=='basic':headers['Authorization']='Basic '+base64.b64encode(secret.encode()).decode()
            elif kind=='oauth2':headers['Authorization']='Bearer '+secret # externally managed token only
    if os.getenv('UPSTREAM_API_KEY') and 'Authorization' not in headers:headers['Authorization']='Bearer '+os.getenv('UPSTREAM_API_KEY')

def _safe_params(op,args):
    params={};query=dict(args.get('query') or {});headers={'Accept':'application/json'}
    for name,val in (args.get('headers') or {}).items():
        if name.lower() not in {'accept','content-type','if-match','if-none-match','idempotency-key'}:raise ValueError('Disallowed header '+name)
        headers[name]=str(val)
    path=op['path']
    for key in re.findall(r'\{([^{}]+)\}',path):
        if key not in (args.get('path_params') or {}):raise ValueError('Missing path parameter '+key)
        path=path.replace('{'+key+'}',urllib.parse.quote(str(args['path_params'][key]),safe=''))
    auth(op,headers,query)
    return path,query,headers

async def execute(op,args):
    method=op['method']
    if method in WRITE and args.get('confirm_write') is not True:raise ValueError('Explicit user approval required for consequential request')
    path,query,headers=_safe_params(op,args)
    url=op['base'].rstrip('/')+'/'+path.lstrip('/')
    check_url(url)
    kw={'params':query,'headers':headers}
    body=args.get('body');kind=args.get('body_type','json')
    if body is not None:
        if kind=='json':kw['json']=body
        elif kind=='form':kw['data']=body
        elif kind=='multipart':
            if not isinstance(body,dict):raise ValueError('multipart requires field map')
            kw['files']={k:(None,str(v)) for k,v in body.items()}
        elif kind in ('text','xml'):kw['content']=str(body).encode('utf-8')
        elif kind=='base64':kw['content']=base64.b64decode(body,validate=True)
        else:raise ValueError('Unsupported body_type')
    async with httpx.AsyncClient(timeout=20,follow_redirects=False,trust_env=False) as client:
        response=await client.request(method,url,**kw)
    maximum=min(max(int(os.getenv('MAX_RESPONSE_BYTES','65536')),1024),262144)
    return {'status':response.status_code,'content_type':response.headers.get('content-type',''),'body':response.content[:maximum].decode('utf-8','replace'),'truncated':len(response.content)>maximum}
