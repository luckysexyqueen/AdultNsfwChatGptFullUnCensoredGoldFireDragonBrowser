import express from 'express';
import cors from 'cors';
import { timingSafeEqual } from 'node:crypto';
import { verifyVpnEgress } from '../scripts/vpn-egress.mjs';

export function createPrivateVpnServer({token=process.env.GFD_VPN_NODE_TOKEN||'', allowedOrigins=(process.env.GFD_VPN_ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean),verify=verifyVpnEgress}={}){
 const app=express();
 app.disable('x-powered-by');
 app.use(cors({origin(origin,callback){callback(null,Boolean(origin && allowedOrigins.includes(origin)));},methods:['GET'],allowedHeaders:['Authorization']}));
 app.get('/health',(_req,res)=>res.json({service:'goldfiredragon-private-vpn',ready:true}));
 // Passwordless read-only status. Bind to loopback by default; no control endpoint is exposed.
 app.get('/api/vpn/public-status',async(_req,res)=>{
  res.set('Cache-Control','no-store');
  try {
   const state=await verify();
   const verified=state.verified===true&&state.country==='JP';
   return res.json({connected:verified,egressVerified:verified,egressCountry:verified?'JP':null,message:verified?'Japan VPN verified':'Japan VPN unavailable'});
  }catch{return res.status(503).json({connected:false,egressVerified:false,message:'VPN verification failed'});}
 });
 app.get('/api/vpn/status',async(req,res)=>{
  const auth=req.get('authorization')||'';
  const expected='Bearer '+token;
  const a=Buffer.from(auth),b=Buffer.from(expected);
  if(!token||a.length!==b.length||!timingSafeEqual(a,b))return res.status(401).json({error:'Unauthorized'});
  res.set('Cache-Control','no-store');
  try{
   const state=await verify();
   const verified=state.verified===true && state.country==='JP';
   return res.json({connected:verified,egressVerified:verified,egressCountry:verified?'JP':null,egressIp:verified?state.ip||null:null,message:verified?'Japan VPN verified':state.reason||'Japan VPN not verified'});
  }catch{return res.status(503).json({connected:false,egressVerified:false,message:'VPN verification failed'});}
 });
 return app;
}
if(process.argv[1] && import.meta.url===new URL('file://'+process.argv[1]).href){
 const host=process.env.GFD_PRIVATE_VPN_HOST||'127.0.0.1';
 const port=Number(process.env.PORT||8790);
 createPrivateVpnServer().listen(port,host,()=>console.log('Private VPN status API listening on '+host+':'+port));
}
