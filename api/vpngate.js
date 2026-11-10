import { listJapanServers } from '@goldfiredragon/vpngate-api';
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  try{
    const result=await listJapanServers();
    return res.status(200).json({source:'VPN Gate',country:'JP',...result});
  }catch(error){return res.status(503).json({error:'VPN Gate directory unavailable',detail:String(error.message||error)});}
}
