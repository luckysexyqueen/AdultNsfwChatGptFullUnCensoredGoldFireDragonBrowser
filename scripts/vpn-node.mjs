// Run on the VPN host, behind a TLS reverse proxy. Never expose this HTTP port publicly.
import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { verifyVpnEgress } from './vpn-egress.mjs';
const token=process.env.GFD_VPN_NODE_TOKEN||'';
const origins=new Set((process.env.GFD_PROXY_ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean));
if(token.length<32 || origins.size===0) throw Error('Configure a 32+ character GFD_VPN_NODE_TOKEN and HTTPS origin allowlist');
function authorized(req) {
  const h=req.headers.authorization||'';
  const supplied=h.startsWith('Bearer ')?h.slice(7):'';
  const a=Buffer.from(supplied),b=Buffer.from(token);
  return a.length===b.length && timingSafeEqual(a,b);
}
function json(res,status,body) {res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body));}
http.createServer(async(req,res)=>{
  if(!authorized(req)) return json(res,401,{error:'Unauthorized'});
  if(req.method!=='GET') return json(res,405,{error:'Method not allowed'});
  let egress;
  try {egress=await verifyVpnEgress();}catch(e){egress={verified:false,reason:e.message};}
  const u=new URL(req.url,'http://localhost');
  if(u.pathname==='/api/vpn/status') return json(res,200,{connected:egress.verified,egressVerified:egress.verified,egressCountry:egress.country||null,egressIp:egress.ip||null,message:egress.reason||'Japan VPN route verified'});
  if(u.pathname!=='/api/vpn/fetch') return json(res,404,{error:'Not found'});
  if(!egress.verified) return json(res,503,{error:'VPN egress not verified',reason:egress.reason});
  let target;
  try{target=new URL(u.searchParams.get('url')||'');}catch{return json(res,400,{error:'Invalid URL'});}
  if(target.protocol!=='https:' || !origins.has(target.origin) || target.username || target.password) return json(res,403,{error:'Destination not allowed'});
  try{
    const upstream=await fetch(target,{redirect:'manual',signal:AbortSignal.timeout(15000),headers:{Accept:req.headers.accept||'*/*'}});
    if(upstream.status>=300&&upstream.status<400)return json(res,502,{error:'Redirect blocked'});
    const length=Number(upstream.headers.get('content-length')||0);
    if(length>8*1024*1024)return json(res,413,{error:'Response too large'});
    const data=Buffer.from(await upstream.arrayBuffer());
    if(data.length>8*1024*1024)return json(res,413,{error:'Response too large'});
    res.writeHead(upstream.status,{'Content-Type':upstream.headers.get('content-type')||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    res.end(data);
  }catch(e){json(res,502,{error:'VPN fetch failed',reason:e.message});}
}).listen(Number(process.env.GFD_VPN_NODE_PORT||8790),'127.0.0.1',()=>console.log('VPN node listening on localhost only'));
