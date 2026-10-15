import YAML from 'yaml';
import bundled from './specs.generated.mjs';
const METHODS = new Set(['get','post','put','patch','delete','head','options']);
const corsHeaders = {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'};
const json = (data,status=200,extra={})=>new Response(JSON.stringify(data),{status,headers:{...corsHeaders,...extra}});
const rpc=(id,result)=>({jsonrpc:'2.0',id,result});
const err=(id,code,message)=>({jsonrpc:'2.0',id,error:{code,message}});
const text=(data,isError=false)=>({content:[{type:'text',text:JSON.stringify(data)}],isError});
const safeName=s=>String(s).replace(/[^a-zA-Z0-9_]/g,'_').slice(0,80);
const registry=()=>{
 const ops={};const errors=[];
 for(const [file,raw] of Object.entries(bundled)){
  try{
   const doc=file.endsWith('.json')?JSON.parse(raw):YAML.parse(raw);
   if(!doc||typeof doc!=='object'||!(String(doc.openapi||'').startsWith('3.')||doc.swagger==='2.0'))throw Error('Unsupported OpenAPI version');
   const base=doc.swagger==='2.0'?`https://${doc.host||''}/${String(doc.basePath||'').replace(/^\//,'')}`:(doc.servers?.[0]?.url||'');
   for(const [path,methods] of Object.entries(doc.paths||{}))for(const [method,op] of Object.entries(methods||{})){
    if(!METHODS.has(method)||!op||typeof op!=='object')continue;
    if(op.$ref)throw Error('Operation $ref is unsupported in Workers mode');
    const endpoint=op.servers?.[0]?.url||base;
    if(!endpoint||endpoint.includes('{'))throw Error('Server URL must be absolute without variables');
    const name=safeName(`${file}_${op.operationId||method+'_'+path}`)+'_'+simpleHash(file+method+path);
    ops[name]={method:method.toUpperCase(),path,base:endpoint,source:file,summary:op.summary||'',security:op.security??doc.security??[],securitySchemes:doc.components?.securitySchemes||doc.securityDefinitions||{}};
   }
  }catch(e){errors.push({file,error:String(e.message).slice(0,200)});}
 }
 return {ops,errors};
};
function simpleHash(s){let n=2166136261;for(const c of s){n^=c.charCodeAt(0);n=Math.imul(n,16777619)}return(n>>>0).toString(16)}
function approvedURL(value,env){
 const u=new URL(value);
 if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443')throw Error('HTTPS port 443 required');
 const allowed=String(env.ALLOWED_API_HOSTS||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
 if(!allowed.includes(u.hostname.toLowerCase()))throw Error('Upstream hostname not allowlisted');
 if(/^(localhost|.*\.localhost|.*\.local|\d+\.\d+\.\d+\.\d+|\[.*\])$/i.test(u.hostname))throw Error('IP literals and local names disallowed');
 return u;
}
async function execute(op,args,env){
 if(!['GET','HEAD','OPTIONS'].includes(op.method)&&args.confirm_write!==true)throw Error('Explicit write confirmation required');
 let path=op.path;
 for(const match of path.matchAll(/\{([^{}]+)\}/g)){
  if(!Object.hasOwn(args.path_params||{},match[1]))throw Error('Missing path parameter: '+match[1]);
  path=path.replace(match[0],encodeURIComponent(String(args.path_params[match[1]])));
 }
 const u=approvedURL(op.base.replace(/\/$/,'')+'/'+path.replace(/^\//,''),env);
 for(const [key,value] of Object.entries(args.query||{}))u.searchParams.set(key,String(value));
 const headers={'Accept':'application/json'};
 for(const [key,value] of Object.entries(args.headers||{})){
  if(!['accept','content-type','if-match','if-none-match','idempotency-key'].includes(key.toLowerCase()))throw Error('Header disallowed: '+key);
  headers[key]=String(value);
 }
 // Credentials live in Cloudflare secrets, never bundled specs or connector JSON.
 for(const requirement of op.security||[])for(const schemeName of Object.keys(requirement)){
  const scheme=op.securitySchemes[schemeName]||{};
  const secret=env['API_SECRET_'+schemeName.toUpperCase().replace(/[^A-Z0-9_]/g,'_')];
  if(!secret)continue;
  if(scheme.type==='apiKey'&&scheme.in==='header')headers[scheme.name]=secret;
  if(scheme.type==='apiKey'&&scheme.in==='query')u.searchParams.set(scheme.name,secret);
  if(scheme.type==='http'&&scheme.scheme==='bearer')headers.Authorization='Bearer '+secret;
 }
 let body;
 if(args.body!==undefined&&args.body!==null){
  if((args.body_type||'json')==='json'){body=JSON.stringify(args.body);headers['Content-Type']='application/json';}
  else if(args.body_type==='text'){body=String(args.body);headers['Content-Type']='text/plain';}
  else if(args.body_type==='form'){body=new URLSearchParams(args.body);}
  else throw Error('Unsupported body_type for Workers adapter');
 }
 const res=await fetch(u.toString(),{method:op.method,headers,body,redirect:'manual',signal:AbortSignal.timeout(15000)});
 const raw=await res.text();return {status:res.status,content_type:res.headers.get('content-type')||'',body:raw.slice(0,65536),truncated:raw.length>65536};
}
const tools=[
 {name:'list_api_operations',description:'List registered OpenAPI operations',inputSchema:{type:'object',properties:{}}},
 {name:'call_api_operation',description:'Call an allowlisted OpenAPI operation',inputSchema:{type:'object',properties:{operation:{type:'string'},path_params:{type:'object'},query:{type:'object'},headers:{type:'object'},body:{},body_type:{type:'string',enum:['json','form','text']},confirm_write:{type:'boolean'}},required:['operation']}},
 {name:'connection_diagnostics',description:'Check spec registry',inputSchema:{type:'object',properties:{}}}
];
export default {async fetch(request,env){
 const url=new URL(request.url);
 if((url.pathname==='/health'||url.pathname==='/')&&request.method==='GET')return json({status:'ok',service:'spec-direct-mcp',mode:'always-available-serverless',mcp_path:'/mcp',operations:Object.keys(registry().ops).length},200,{'Access-Control-Allow-Origin':'*'});
 const publicReadOnly=url.pathname==='/mcp-public';
 if(url.pathname!=='/mcp'&&!publicReadOnly)return json({error:'Not found'},404);
 if(request.method!=='POST')return json({error:'Method not allowed'},405,{'Allow':'POST'});
 if(!publicReadOnly&&(!env.MCP_BEARER_TOKEN||request.headers.get('Authorization')!==`Bearer ${env.MCP_BEARER_TOKEN}`))return json({error:'Unauthorized'},401,{'WWW-Authenticate':'Bearer'});
 const origin=request.headers.get('Origin');
 if(origin&&!(String(env.ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).includes(origin)))return json({error:'Origin rejected'},403);
 let msg;try{if(Number(request.headers.get('content-length')||0)>262144)return json({error:'Request too large'},413);msg=await request.json()}catch{return json(err(null,-32700,'Invalid JSON'),400)}
 if(!msg||msg.jsonrpc!=='2.0'||typeof msg.method!=='string')return json(err(msg?.id??null,-32600,'Invalid request'),400);
 if(msg.id===undefined)return new Response(null,{status:202});
 const {ops,errors}=registry();let result;
 if(msg.method==='initialize')result={protocolVersion:'2025-03-26',capabilities:{tools:{listChanged:false}},serverInfo:{name:'spec-direct-worker',version:'1.5.3'}};
 else if(msg.method==='ping')result={};
 else if(msg.method==='tools/list')result={tools:publicReadOnly?tools.filter(t=>t.name==='connection_diagnostics'):tools};
 else if(msg.method==='tools/call'){
  const name=msg.params?.name,args=msg.params?.arguments||{};
  if(publicReadOnly&&name!=='connection_diagnostics')return json(err(msg.id,-32602,'Tool unavailable on read-only public endpoint'),403);
  if(name==='list_api_operations')result=text({operations:ops,errors});
  else if(name==='connection_diagnostics')result=text({status:'ready',operations:Object.keys(ops).length,errors});
  else if(name==='call_api_operation'){
   if(!ops[args.operation])result=text({error:'Unknown operation'},true);
   else try{result=text(await execute(ops[args.operation],args,env))}catch(e){result=text({error:String(e.message).slice(0,400)},true)}
  }else return json(err(msg.id,-32602,'Unknown tool'));
 }else return json(err(msg.id,-32601,'Unknown method'));
 return json(rpc(msg.id,result),200,{'MCP-Protocol-Version':'2025-03-26'});
}};
