// Server-only Firecrawl proxy. Configure FIRECRAWL_API_KEY in deployment secrets.
import Firecrawl from '@mendable/firecrawl-js';
import {isAllowedPageUrl} from '../scripts/firecrawl-url.mjs';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return res.status(405).json({error:'POST required'});
 const token=process.env.FIRECRAWL_API_KEY;
 if(!token)return res.status(503).json({error:'Firecrawl is not configured'});
 const supplied=process.env.FIRECRAWL_ACCESS_TOKEN;
 if(!supplied)return res.status(503).json({error:'Firecrawl access token is not configured'});
 if(req.headers.authorization!=='Bearer '+supplied)return res.status(401).json({error:'Unauthorized'});
 const url=req.body?.url;
 if(!isAllowedPageUrl(url))return res.status(400).json({error:'Invalid public HTTPS URL'});
 try{
  const client=new Firecrawl({apiKey:token});
  const result=await client.scrape(url,{formats:['markdown']});
  return res.status(200).json({url,markdown:typeof result.markdown==='string'?result.markdown.slice(0,100000):'',title:result.metadata?.title||'',source:'firecrawl'});
 }catch(e){console.error('Firecrawl request failed:',e.message);return res.status(502).json({error:'Firecrawl request failed'});}
}
