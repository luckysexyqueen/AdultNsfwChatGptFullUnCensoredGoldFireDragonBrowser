// Deploy on a VPS physically hosted in Japan. This code cannot assign a Japanese IP.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {ProxyAgent, fetch as proxyFetch} from 'undici';
const listed=JSON.parse(await readFile(new URL('./proxies.json',import.meta.url),'utf8')).proxies;
const proxyUrls=listed.filter(p=>p.country_code==='JP'&&p.protocol==='http').map(p=>'http://'+p.ip+':'+p.port);
const port=Number(process.env.PORT||8080);
const token=process.env.JP_PROXY_TOKEN;
if(!token || token.length<24) throw Error('Set a strong JP_PROXY_TOKEN (24+ chars)');
const server=http.createServer(async(req,res)=>{
 const u=new URL(req.url||'/', 'http://localhost');
 const json=(status,obj)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(obj));};
 if(u.pathname==='/health') return json(200,{ok:true,service:'google-japan-egress',proxyCandidates:proxyUrls.length,japanIpVerified:false});
 if(u.pathname!=='/search' || req.method!=='GET') return json(404,{error:'Not found'});
 if(req.headers.authorization!==`Bearer ${token}`) return json(401,{error:'Unauthorized'});
 const q=(u.searchParams.get('q')||'').trim();
 if(!q||q.length>300) return json(400,{error:'Invalid query'});
 const target=new URL('https://www.google.co.jp/search');
 target.searchParams.set('q',q);
 for(const [k,v] of Object.entries({gl:'jp',hl:'ko',safe:'off',nfpr:'1',filter:'0',pws:'0'})) target.searchParams.set(k,v);
 try{
  const selected=proxyUrls[0];
  if(!selected)return json(503,{error:'No Japan proxy candidates configured'});
  const agent=new ProxyAgent(selected);
  let upstream;
  try {upstream=await proxyFetch(target,{dispatcher:agent,redirect:'follow',signal:AbortSignal.timeout(12000),headers:{'Accept':'text/html','Accept-Language':'ko-KR,ko;q=0.9,ja-JP;q=0.8'}});} catch(e) {await agent.close(); throw e;}
  const final=new URL(upstream.url);
  if(!['www.google.co.jp','www.google.com'].includes(final.hostname)||final.pathname.startsWith('/sorry')||upstream.status!==200) {
   await upstream.body?.cancel(); await agent.close();
   return json(502,{error:'Google rejected server-side request',upstreamStatus:upstream.status});
  }
  const body=await upstream.text();
  await agent.close();
  if(body.length>1500000||/unusual traffic|detected unusual|captcha|sorry\\/index/i.test(body)) return json(502,{error:'Google challenge'});
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; base-uri 'none'; form-action 'none'; sandbox",'X-Content-Type-Options':'nosniff'});
  res.end(body);
 }catch{json(502,{error:'Google upstream request failed'});}
});
server.listen(port,'0.0.0.0',()=>console.log('Google Japan egress proxy listening on',port));
